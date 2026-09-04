"""사전(heyvoca_dict) 동기화 관리 서비스 — admin '올리기/내려받기' 버튼용.

objectstore(MinIO)를 단일 허브로, 어느 환경에서든 admin에서:
  - 올리기(publish): 이 환경의 heyvoca_dict를 dump → objectstore에 새 버전으로 발행(헤드 갱신)
  - 내려받기(apply): objectstore의 특정 버전을 이 환경 heyvoca_dict에 swap 적용
  - 버전 목록(list): 최근 N개 버전 + 메타데이터(작업자/시각/단어수/메모)

안전장치:
  - 최신성 가드: 올릴 때 화면에서 본 latest와 실제 objectstore latest가 다르면 409(누가 그새 발행)
  - 버전 불변 이력: 발행마다 full_dict_v<버전>.sql 새 객체 + 인덱스. 최근 RETENTION개만 보관
  - swap 전 현재 사전 백업 → 사용자 로컬 archive에 보관 + 실패 시 복원
  - 내려받기 시 단어수 비교 데이터 제공(UI가 '단어 N개 빠짐' 경고 + 재확인)

이 모듈은 백엔드 컨테이너 안에서 동작(mysql/mysqldump 클라이언트 + DATABASE_URL_DICT + MINIO RW 키).
기존 scripts/dict_sync.py·dict_publish.py의 컨테이너 내부 로직과 동일한 방식.
"""
import os
import io
import json
import hashlib
import subprocess
import tempfile
from datetime import datetime
from urllib.parse import urlparse, unquote

DICT_SCHEMA = 'heyvoca_dict'
TEMP_SCHEMA = 'heyvoca_dict_apply'

# objectstore 경로
PREFIX = 'dict'
INDEX_OBJECT = f'{PREFIX}/dict_index.json'     # 버전 이력 + latest 포인터(허브의 단일 소스)
RETENTION = 5                                  # 최근 보관 버전 수(objectstore)
LOCAL_ARCHIVE_DIR = os.getenv(
    'DICT_LOCAL_ARCHIVE_DIR', '/app/db/local-dict-archives')
LOCAL_ARCHIVE_KEEP = int(os.getenv('DICT_LOCAL_ARCHIVE_KEEP', '3'))
# 내려받기 직전 백업을 각자 로컬에 몇 개까지 남길지. 초과분은 오래된 것부터 자동 삭제.

# 발행 대상 테이블(사전 전체) — bookstore 포함
TRACKED_TABLES = [
    'voca', 'voca_meaning', 'voca_example',
    'voca_book', 'admin_voca_book', 'bookstore', 'bookstore_category',
    'daily_sentence',
    'voca_book_map', 'voca_meaning_map', 'voca_example_map', 'admin_voca_book_map',
    'dict_meta',
]
COUNT_TABLES = ['voca', 'voca_meaning', 'voca_example', 'voca_book', 'bookstore']


class DictManageError(Exception):
    """일반 오류."""


class DictConflictError(DictManageError):
    """최신성 가드 위반(409) — 화면에서 본 latest와 실제가 다름."""


# ── 내부 헬퍼 ───────────────────────────────────────────────

def _conn():
    url = os.getenv('DATABASE_URL_DICT') or os.getenv('DATABASE_URL')
    if not url:
        raise DictManageError('DATABASE_URL_DICT 환경변수가 없습니다.')
    p = urlparse(url)
    return {
        'user': unquote(p.username) if p.username else 'voca',
        'password': unquote(p.password) if p.password else '',
        'host': p.hostname or 'mysql',
        'port': p.port or 3306,
    }


def _my_args(conn, db=None):
    args = ['-h', conn['host'], '-P', str(conn['port']), '-u', conn['user']]
    if conn['password']:
        args.append(f"-p{conn['password']}")
    if db is not None:
        args.append(db)
    return args


def _run_sql(conn, sql, db=None):
    cmd = ['mysql'] + _my_args(conn, db) + ['-e', sql]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise DictManageError(f"mysql 실패: {r.stderr.strip()}")
    return r.stdout


def _scalar(conn, sql):
    cmd = ['mysql', '-N', '-s'] + _my_args(conn) + ['-e', sql]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        return None
    return (r.stdout.strip() or None)


def _count(conn, table, schema=DICT_SCHEMA):
    v = _scalar(conn, f"SELECT COUNT(*) FROM {schema}.{table};")
    try:
        return int(v) if v is not None else 0
    except ValueError:
        return 0


def _counts(conn, schema=DICT_SCHEMA):
    out = {}
    for t in COUNT_TABLES:
        try:
            out[t] = _count(conn, t, schema)
        except Exception:
            out[t] = 0
    return out


def _dump(conn, dest_path, schema=DICT_SCHEMA):
    cmd = ['mysqldump', '--no-tablespaces', '--single-transaction',
           '--skip-lock-tables', '--skip-comments'] + _my_args(conn, schema)
    with open(dest_path, 'wb') as f:
        r = subprocess.run(cmd, stdout=f, stderr=subprocess.PIPE)
    if r.returncode != 0:
        raise DictManageError(f"mysqldump 실패: {r.stderr.decode().strip()}")


def _import(conn, schema, sql_path):
    cmd = ['mysql'] + _my_args(conn, schema)
    with open(sql_path, 'rb') as f:
        r = subprocess.run(cmd, stdin=f, capture_output=True, text=True)
    if r.returncode != 0:
        raise DictManageError(f"import 실패: {r.stderr.strip()}")


def _sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def _minio(role='rw'):
    from minio import Minio
    endpoint = os.getenv('MINIO_ENDPOINT', 'https://objectstore.ghmate.com')
    p = urlparse(endpoint)
    if role == 'rw':
        ak, sk = os.getenv('MINIO_DICT_RW_KEY'), os.getenv('MINIO_DICT_RW_SECRET')
    else:
        ak = os.getenv('MINIO_DICT_RO_KEY') or os.getenv('MINIO_DICT_RW_KEY')
        sk = os.getenv('MINIO_DICT_RO_SECRET') or os.getenv('MINIO_DICT_RW_SECRET')
    if not (ak and sk):
        raise DictManageError(f'MinIO {role.upper()} 키가 없습니다.')
    return Minio(p.netloc, access_key=ak, secret_key=sk, secure=(p.scheme == 'https'),
                 region=os.getenv('MINIO_REGION', 'us-east-1'))


def _bucket():
    return os.getenv('MINIO_BUCKET', 'heyvoca')


def _read_index():
    """objectstore의 dict_index.json 읽기. 없으면 빈 인덱스."""
    cli = _minio('ro')
    try:
        resp = cli.get_object(_bucket(), INDEX_OBJECT)
        data = json.loads(resp.read().decode('utf-8'))
        resp.close()
        resp.release_conn()
        if 'versions' not in data:
            data['versions'] = []
        return data
    except Exception:
        return {'latest': None, 'versions': []}


def _write_index(index):
    cli = _minio('rw')
    body = json.dumps(index, ensure_ascii=False, indent=2).encode('utf-8')
    cli.put_object(_bucket(), INDEX_OBJECT, io.BytesIO(body), length=len(body),
                   content_type='application/json')


def _env_name():
    return os.getenv('APP_ENV', 'local').lower()


def _ensure_dict_meta(conn):
    _run_sql(conn,
             f"CREATE TABLE IF NOT EXISTS {DICT_SCHEMA}.dict_meta ("
             f"  `key` VARCHAR(64) PRIMARY KEY, value VARCHAR(255), "
             f"  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP "
             f"    ON UPDATE CURRENT_TIMESTAMP) CHARACTER SET utf8mb4;")


def _set_meta(conn, sha256, version):
    _ensure_dict_meta(conn)
    _run_sql(conn,
             f"INSERT INTO {DICT_SCHEMA}.dict_meta (`key`,value,updated_at) "
             f"VALUES ('current_dump_sha256','{sha256}',NOW()) "
             f"ON DUPLICATE KEY UPDATE value=VALUES(value),updated_at=VALUES(updated_at);"
             f"INSERT INTO {DICT_SCHEMA}.dict_meta (`key`,value,updated_at) "
             f"VALUES ('current_dump_version','{version}',NOW()) "
             f"ON DUPLICATE KEY UPDATE value=VALUES(value),updated_at=VALUES(updated_at);")


def _env_version(conn):
    return _scalar(conn, f"SELECT value FROM {DICT_SCHEMA}.dict_meta "
                         f"WHERE `key`='current_dump_version' LIMIT 1;")


def _next_version(latest):
    today = datetime.utcnow().strftime('%Y%m%d')
    seq = 1
    if latest and latest.startswith(today):
        try:
            seq = int(latest.split('-')[-1]) + 1
        except (ValueError, IndexError):
            seq = 2
    return f"{today}-{seq}"


# ── 공개 API ───────────────────────────────────────────────

def get_status():
    """이 환경 버전 + objectstore 최신 버전 + 최신성 비교."""
    conn = _conn()
    index = _read_index()
    latest = None
    if index['versions']:
        latest = index['versions'][0]
    env_version = _env_version(conn)
    return {
        'env': _env_name(),
        'env_version': env_version,
        'env_voca_count': _count(conn, 'voca'),
        'latest': latest,
        'in_sync': bool(latest and env_version == latest['version']),
        'stale': bool(latest and env_version != latest['version']),
        'never_published': not bool(latest),
    }


def list_versions(limit=RETENTION):
    index = _read_index()
    return index['versions'][:limit]


def publish(message, publisher, expected_latest=None):
    """이 환경의 heyvoca_dict를 새 버전으로 발행(헤드 갱신)."""
    conn = _conn()
    index = _read_index()
    cur_latest = index['versions'][0]['version'] if index['versions'] else None

    # 최신성 가드: 화면에서 본 latest와 실제가 다르면 충돌
    if expected_latest is not None and (expected_latest or None) != cur_latest:
        raise DictConflictError(
            f"그새 다른 발행이 있었습니다(현재 최신={cur_latest or '없음'}). 새로고침 후 다시 시도하세요.")

    with tempfile.NamedTemporaryFile(suffix='.sql', delete=False) as tmp:
        dump_path = tmp.name
    try:
        _dump(conn, dump_path)
        sha = _sha256(dump_path)
        counts = _counts(conn)
        version = _next_version(cur_latest)
        object_name = f"{PREFIX}/full_dict_v{version}.sql"
        url = f"{os.getenv('MINIO_ENDPOINT', 'https://objectstore.ghmate.com').rstrip('/')}/{_bucket()}/{object_name}"

        cli = _minio('rw')
        cli.fput_object(_bucket(), object_name, dump_path, content_type='application/sql')

        entry = {
            'version': version, 'object': object_name, 'url': url, 'sha256': sha,
            'publisher': publisher, 'env': _env_name(),
            'published_at': datetime.utcnow().isoformat() + 'Z',
            'message': message or '', 'counts': counts,
        }
        index['versions'].insert(0, entry)
        index['latest'] = version

        # 보관 정책: 최근 RETENTION개만 유지, 초과분 객체 삭제
        removed = index['versions'][RETENTION:]
        index['versions'] = index['versions'][:RETENTION]
        for old in removed:
            try:
                cli.remove_object(_bucket(), old['object'])
            except Exception:
                pass

        _write_index(index)
        _set_meta(conn, sha, version)  # 이 환경 = 방금 발행한 버전
        return {'version': version, 'sha256': sha, 'counts': counts,
                'pruned': [r['version'] for r in removed]}
    finally:
        try:
            os.unlink(dump_path)
        except OSError:
            pass


def _prune_local_archives():
    """내려받기 백업(UNUSED_*.sql / UNUSED_*.sql.gz)을 최근 LOCAL_ARCHIVE_KEEP개만 남기고 삭제.

    각 팀원 로컬에 백업이 무한정 쌓이는 것을 막는다. 삭제 실패는 무시한다
    (보관은 부가 기능이라 여기서 내려받기 전체를 실패시키지 않는다).
    """
    removed = []
    try:
        # UNUSED_ 접두사만 정리 대상. CURRENT_*는 사용자가 보관 중인 작업 스냅샷이라
        # 이 함수의 목록에 절대 포함시키면 안 된다.
        # 확장자는 .sql(비압축, 코드가 만드는 형식)과 .sql.gz(사람이 수동으로 gzip한
        # 것 포함, db/local-dict-archives/의 실제 백업은 전부 .sql.gz) 둘 다 대상.
        files = [f for f in os.listdir(LOCAL_ARCHIVE_DIR)
                 if f.startswith('UNUSED_') and (f.endswith('.sql') or f.endswith('.sql.gz'))]
    except OSError:
        return removed
    # 파일명 포맷이 두 가지 섞여 있다:
    #   - 코드가 만드는 형식: UNUSED_{YYYYMMDD_HHMMSS}_before_apply_{version}.sql
    #   - 사람이 수동으로 남긴 형식: UNUSED_{YYYYMMDD}_자유문구.sql.gz (시분초 없음)
    # 문자열 정렬만으로는 두 포맷이 섞였을 때 순서를 보장할 수 없으므로
    # 실제 파일 mtime(생성/수정 시각) 기준으로 오래된 것부터 정리한다.
    def _mtime(name):
        try:
            return os.path.getmtime(os.path.join(LOCAL_ARCHIVE_DIR, name))
        except OSError:
            return 0
    files_by_age = sorted(files, key=_mtime, reverse=True)
    for name in files_by_age[LOCAL_ARCHIVE_KEEP:]:
        try:
            os.unlink(os.path.join(LOCAL_ARCHIVE_DIR, name))
            removed.append(name)
        except OSError:
            pass
    return removed


def apply_version(version, publisher):
    """objectstore의 특정 버전을 이 환경 heyvoca_dict에 swap 적용(내려받기/복원)."""
    conn = _conn()
    index = _read_index()
    entry = None
    if version:
        entry = next((v for v in index['versions'] if v['version'] == version), None)
    elif index['versions']:
        entry = index['versions'][0]
    if not entry:
        raise DictManageError(f"버전을 찾을 수 없습니다: {version or '(최신)'}")

    with tempfile.NamedTemporaryFile(suffix='.sql', delete=False) as t1:
        dl_path = t1.name
    backup_path = None
    try:
        # 1) 다운로드 + sha 검증
        cli = _minio('ro')
        cli.fget_object(_bucket(), entry['object'], dl_path)
        actual = _sha256(dl_path)
        if actual != entry['sha256']:
            raise DictManageError(f"sha256 불일치: 기대 {entry['sha256'][:12]}… 실제 {actual[:12]}…")

        # 2) 현재 사전 백업(로컬 롤백 + 사용자 기기에 영구 보관)
        #    백업이 실패하면 전체 교체를 시작하지 않는다.
        ts = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        os.makedirs(LOCAL_ARCHIVE_DIR, exist_ok=True)
        backup_path = os.path.join(
            LOCAL_ARCHIVE_DIR,
            f"UNUSED_{ts}_before_apply_{entry['version']}.sql",
        )
        _dump(conn, backup_path)

        # 3) 임시 schema import → 검증 → swap
        _run_sql(conn, f"DROP DATABASE IF EXISTS {TEMP_SCHEMA}; "
                       f"CREATE DATABASE {TEMP_SCHEMA} CHARACTER SET utf8mb4 "
                       f"COLLATE utf8mb4_unicode_ci;")
        _import(conn, TEMP_SCHEMA, dl_path)
        if _count(conn, 'voca', TEMP_SCHEMA) <= 0:
            raise DictManageError("적용 대상에 voca가 비어 있습니다(손상 의심). 중단.")

        # swap: DROP & recreate heyvoca_dict ← temp
        _run_sql(conn, f"DROP DATABASE IF EXISTS {DICT_SCHEMA}; "
                       f"CREATE DATABASE {DICT_SCHEMA} CHARACTER SET utf8mb4 "
                       f"COLLATE utf8mb4_unicode_ci;")
        with tempfile.NamedTemporaryFile(suffix='.sql', delete=False) as t2:
            swap_path = t2.name
        try:
            _dump(conn, swap_path, TEMP_SCHEMA)
            _import(conn, DICT_SCHEMA, swap_path)
        finally:
            try:
                os.unlink(swap_path)
            except OSError:
                pass
        _run_sql(conn, f"DROP DATABASE IF EXISTS {TEMP_SCHEMA};")

        _set_meta(conn, entry['sha256'], entry['version'])

    except Exception as e:
        # 롤백
        if backup_path and os.path.exists(backup_path):
            try:
                _run_sql(conn, f"DROP DATABASE IF EXISTS {DICT_SCHEMA}; "
                               f"CREATE DATABASE {DICT_SCHEMA} CHARACTER SET utf8mb4 "
                               f"COLLATE utf8mb4_unicode_ci;")
                _import(conn, DICT_SCHEMA, backup_path)
            except Exception:
                pass
        try:
            _run_sql(conn, f"DROP DATABASE IF EXISTS {TEMP_SCHEMA};")
        except Exception:
            pass
        raise DictManageError(str(e))
    else:
        # swap이 완전히 성공한 뒤에만 오래된 백업 정리. 정리 실패는 내려받기
        # 결과에 영향을 주면 안 되므로(부가 기능) 여기서 완전히 흡수한다 —
        # 위 try/except 블록 안에서 돌리면 정리 실패가 "적용 실패"로 오인되어
        # 이미 끝난 swap을 불필요하게 롤백해버릴 수 있다.
        try:
            pruned = _prune_local_archives()
        except Exception:
            pruned = []
        return {
            'version': entry['version'],
            'counts': entry.get('counts', {}),
            'backup_path': backup_path,
            'pruned_backups': pruned,
        }
    finally:
        for p in (dl_path,):
            if p and os.path.exists(p):
                try:
                    os.unlink(p)
                except OSError:
                    pass
