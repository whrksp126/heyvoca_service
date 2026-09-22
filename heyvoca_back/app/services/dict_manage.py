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

성능/부하(2026-09):
  - 교체는 RENAME TABLE 한 문장(메타데이터만) — 예전처럼 dump→import를 한 번 더 하지 않는다.
  - import는 세션 설정 + autocommit=0으로 흘려보내고, mysql/mysqldump는 ionice/nice로 양보한다.
  - objectstore 전송은 MINIO_INTERNAL_ENDPOINT(있으면)로 — 공개 도메인(CDN) 왕복 제거.

이 모듈은 백엔드 컨테이너 안에서 동작(mysql/mysqldump 클라이언트 + DATABASE_URL_DICT + MINIO RW 키).
기존 scripts/dict_sync.py·dict_publish.py의 컨테이너 내부 로직과 동일한 방식.
"""
import os
import io
import json
import hashlib
import shutil
import subprocess
import tempfile
from datetime import datetime
from urllib.parse import urlparse, unquote

from .objectstore_endpoint import internal_endpoint, public_endpoint

DICT_SCHEMA = 'heyvoca_dict'
TEMP_SCHEMA = 'heyvoca_dict_apply'
OLD_SCHEMA = 'heyvoca_dict_old'   # swap 직후의 구 사전(롤백용) — 성공 시 마지막에 DROP

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
    'voca_meaning_concept',
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


def _nice_prefix():
    """무거운 mysql/mysqldump를 최저 IO/CPU 우선순위로 실행하기 위한 접두 명령.

    이 호스트의 SSD는 여러 프로젝트(MySQL 10개 + MinIO)가 공유한다. 사전 교체가
    디스크를 점유하면 다른 서비스가 같이 느려지므로 ionice(idle)+nice로 양보한다.
    두 바이너리는 이미지에 없을 수도 있으므로(shutil.which) 없으면 조용히 생략한다.
    """
    prefix = []
    if shutil.which('ionice'):
        prefix += ['ionice', '-c3']
    if shutil.which('nice'):
        prefix += ['nice', '-n19']
    return prefix


# import 스트림 앞에 붙일 세션 설정 후보.
#   sql_log_bin=0                     : 바이너리 로그 쓰기 제거(복제 미사용 환경)
#   unique_checks/foreign_key_checks=0: 대량 INSERT 시 중복/FK 검사 버퍼링
#   innodb_flush_log_at_trx_commit=2  : 트랜잭션마다 redo fsync 생략
# 권한/버전에 따라 거부될 수 있고(mysql 클라이언트는 에러 나면 import 전체를 중단),
# MySQL 8에서 innodb_flush_log_at_trx_commit은 GLOBAL 전용이라 세션 SET이 실패한다.
# 그래서 실제로 통과하는 것만 골라서 붙인다(_supported_import_settings).
_IMPORT_SESSION_CANDIDATES = [
    'SET sql_log_bin=0',
    'SET unique_checks=0',
    'SET foreign_key_checks=0',
    'SET SESSION innodb_flush_log_at_trx_commit=2',
]
_import_settings_cache = None


def _supported_import_settings(conn):
    """이 DB 계정/버전에서 실제로 먹히는 세션 설정만 반환(프로세스 1회 탐지 후 캐시)."""
    global _import_settings_cache
    if _import_settings_cache is not None:
        return _import_settings_cache
    ok = []
    for stmt in _IMPORT_SESSION_CANDIDATES:
        cmd = ['mysql'] + _my_args(conn) + ['-e', stmt + ';']
        try:
            r = subprocess.run(cmd, capture_output=True, text=True)
        except OSError:
            break
        if r.returncode == 0:
            ok.append(stmt)
    _import_settings_cache = ok
    return ok


def _dump(conn, dest_path, schema=DICT_SCHEMA):
    # --quick: 결과를 메모리에 모으지 않고 행 단위 스트리밍(대용량에서 필수).
    # 출력 내용은 기존과 동일(포맷/순서 불변) — 옵션은 전송 방식만 바꾼다.
    cmd = _nice_prefix() + [
        'mysqldump', '--no-tablespaces', '--single-transaction', '--quick',
        '--skip-lock-tables', '--skip-comments'] + _my_args(conn, schema)
    with open(dest_path, 'wb') as f:
        r = subprocess.run(cmd, stdout=f, stderr=subprocess.PIPE)
    if r.returncode != 0:
        raise DictManageError(f"mysqldump 실패: {r.stderr.decode().strip()}")


def _import(conn, schema, sql_path):
    """dump SQL을 mysql에 흘려넣는다. 앞에 세션 설정 + autocommit=0을 덧붙여
    INSERT마다 redo fsync가 일어나지 않게 한다(쓰기 증폭 완화).

    파일을 직접 stdin으로 주지 않고 파이프로 흘리는 이유: 앞부분에 prelude를
    붙이기 위해서다(임시 파일을 새로 만들면 51MB를 디스크에 한 번 더 쓰게 된다).
    stderr는 파이프 대신 임시 파일로 받아 교착(대용량 경고 시)을 피한다.
    """
    prelude = ''.join(stmt + ';\n' for stmt in _supported_import_settings(conn))
    # DDL(CREATE/DROP TABLE)은 암묵적 커밋이라 테이블 단위로 끊기지만,
    # 그 사이의 대량 INSERT가 하나의 트랜잭션으로 묶여 fsync 횟수가 크게 준다.
    prelude += 'SET autocommit=0;\n'
    cmd = _nice_prefix() + ['mysql'] + _my_args(conn, schema)
    with tempfile.TemporaryFile() as errf:
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE,
                                stdout=subprocess.DEVNULL, stderr=errf)
        try:
            proc.stdin.write(prelude.encode('utf-8'))
            with open(sql_path, 'rb') as f:
                shutil.copyfileobj(f, proc.stdin, 1 << 20)
            proc.stdin.write(b'\nCOMMIT;\n')
        except (BrokenPipeError, OSError):
            pass   # mysql이 먼저 죽은 경우 — 아래 returncode로 판정
        finally:
            try:
                proc.stdin.close()
            except OSError:
                pass
        rc = proc.wait()
        if rc != 0:
            errf.seek(0)
            raise DictManageError(
                f"import 실패: {errf.read().decode('utf-8', 'replace').strip()}")


def _sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def _minio(role='rw', public=False):
    """objectstore 클라이언트.

    기본은 **내부 엔드포인트**(MINIO_INTERNAL_ENDPOINT, 없으면 공개와 동일) —
    사전 dump 업/다운로드와 인덱스 읽기/쓰기는 전부 서버↔서버 전송이라
    CDN을 왕복할 이유가 없다. public=True는 최종 사용자에게 노출되는 URL을
    만들거나 서명할 때만 쓴다(이 모듈은 서명하지 않는다).
    """
    from minio import Minio
    endpoint = public_endpoint() if public else internal_endpoint()
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
        # 인덱스에 남기는 url은 admin/사람이 브라우저로 여는 주소 → 항상 공개 엔드포인트
        url = f"{public_endpoint().rstrip('/')}/{_bucket()}/{object_name}"

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


# ── swap 헬퍼(메타데이터 교체) ─────────────────────────────

def _rows(conn, sql):
    """단일 컬럼 조회 결과를 리스트로."""
    cmd = ['mysql', '-N', '-s'] + _my_args(conn) + ['-e', sql]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise DictManageError(f"mysql 실패: {r.stderr.strip()}")
    return [line.strip() for line in r.stdout.splitlines() if line.strip()]


def _base_tables(conn, schema):
    return _rows(conn,
                 "SELECT table_name FROM information_schema.tables "
                 f"WHERE table_schema='{schema}' AND table_type='BASE TABLE' "
                 "ORDER BY table_name;")


def _schema_exists(conn, schema):
    return bool(_scalar(conn, "SELECT schema_name FROM information_schema.schemata "
                              f"WHERE schema_name='{schema}' LIMIT 1;"))


def _non_table_objects(conn, schema):
    """뷰/트리거/저장 프로시저·함수/이벤트 개수.

    RENAME TABLE은 base table만 옮긴다. 2026-09 현재 heyvoca_dict에는 base table만
    있어서(views/triggers/routines/events 전부 0건 확인) rename swap으로 충분하다.
    나중에 뷰나 트리거가 생기면 rename만으로는 누락되므로, 아래 _swap()에서
    이 값이 0이 아니면 예전 방식(dump→import 복사)으로 자동 폴백한다.
    """
    v = _scalar(conn,
                "SELECT (SELECT COUNT(*) FROM information_schema.views "
                f"        WHERE table_schema='{schema}')"
                " + (SELECT COUNT(*) FROM information_schema.triggers "
                f"    WHERE trigger_schema='{schema}')"
                " + (SELECT COUNT(*) FROM information_schema.routines "
                f"    WHERE routine_schema='{schema}')"
                " + (SELECT COUNT(*) FROM information_schema.events "
                f"    WHERE event_schema='{schema}');")
    try:
        return int(v) if v is not None else 0
    except ValueError:
        return 0


def _rename_sql(pairs):
    body = ', '.join(f"`{sa}`.`{ta}` TO `{sb}`.`{tb}`" for sa, ta, sb, tb in pairs)
    return f"RENAME TABLE {body};"


def _build_swap_rename(cur_tables, new_tables):
    """현재 사전 ↔ 새 사전(TEMP_SCHEMA)을 한 문장으로 맞바꾸는 RENAME TABLE 생성.

    테이블 집합은 합집합으로 처리한다:
      - 양쪽에 있는 테이블: dict.t → old.t, apply.t → dict.t
      - 새 dump에만 있는 테이블(신규): apply.t → dict.t
      - 현재에만 있는 테이블(삭제됨): dict.t → old.t  (old와 함께 DROP)
    한 문장에 모아야 MySQL이 전체를 하나의 락 아래에서 원자적으로 처리한다
    (중간 실패 시 이미 바꾼 것도 되돌린다). 스키마 간 rename이라도 InnoDB가
    FK 참조를 새 스키마로 같이 갱신해준다(로컬에서 확인).
    """
    cur, new = set(cur_tables), set(new_tables)
    pairs = []
    for t in sorted(new):
        if t in cur:
            pairs.append((DICT_SCHEMA, t, OLD_SCHEMA, t))
        pairs.append((TEMP_SCHEMA, t, DICT_SCHEMA, t))
    for t in sorted(cur - new):
        pairs.append((DICT_SCHEMA, t, OLD_SCHEMA, t))
    return pairs


def _swap_by_copy(conn):
    """예전 방식: dict를 통째로 비우고 TEMP를 다시 dump→import.

    뷰/트리거/프로시저가 생겼을 때만 쓰는 폴백. 51MB 기준 dump+import가 한 번 더
    돌아 디스크 쓰기가 2배가 되고, 교체 중 heyvoca_dict가 잠시 사라진다.
    """
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


def _swap(conn):
    """TEMP_SCHEMA(새 사전) ↔ DICT_SCHEMA(현재 사전) 교체.

    기본은 RENAME TABLE 한 문장(메타데이터만 바뀜 → 데이터 재기록 0, 수십 ms).
    구 사전은 OLD_SCHEMA에 남겨 두고, 호출자가 성공을 확정한 뒤 DROP한다.
    """
    if _non_table_objects(conn, TEMP_SCHEMA) or _non_table_objects(conn, DICT_SCHEMA):
        _swap_by_copy(conn)
        return 'copy'

    new_tables = _base_tables(conn, TEMP_SCHEMA)
    if not new_tables:
        raise DictManageError('적용 대상 스키마에 테이블이 없습니다(손상 의심). 중단.')
    cur_tables = _base_tables(conn, DICT_SCHEMA) if _schema_exists(conn, DICT_SCHEMA) else []

    _run_sql(conn, f"DROP DATABASE IF EXISTS {OLD_SCHEMA}; "
                   f"CREATE DATABASE {OLD_SCHEMA} CHARACTER SET utf8mb4 "
                   f"COLLATE utf8mb4_unicode_ci;")
    if not _schema_exists(conn, DICT_SCHEMA):
        _run_sql(conn, f"CREATE DATABASE {DICT_SCHEMA} CHARACTER SET utf8mb4 "
                       f"COLLATE utf8mb4_unicode_ci;")
    _run_sql(conn, _rename_sql(_build_swap_rename(cur_tables, new_tables)))
    return 'rename'


def _restore_from_old(conn):
    """rename swap 이후 실패했을 때 OLD_SCHEMA의 구 사전을 원위치로 되돌린다.

    dump 재import 없이 rename만으로 복구하므로 즉시 끝난다. 되돌릴 게 없으면 False.
    """
    if not _schema_exists(conn, OLD_SCHEMA):
        return False
    old_tables = _base_tables(conn, OLD_SCHEMA)
    if not old_tables:
        return False
    if not _schema_exists(conn, TEMP_SCHEMA):
        _run_sql(conn, f"CREATE DATABASE {TEMP_SCHEMA} CHARACTER SET utf8mb4 "
                       f"COLLATE utf8mb4_unicode_ci;")
    cur_tables = _base_tables(conn, DICT_SCHEMA) if _schema_exists(conn, DICT_SCHEMA) else []
    cur, old = set(cur_tables), set(old_tables)
    pairs = []
    for t in sorted(old):
        if t in cur:
            pairs.append((DICT_SCHEMA, t, TEMP_SCHEMA, t))
        pairs.append((OLD_SCHEMA, t, DICT_SCHEMA, t))
    for t in sorted(cur - old):
        pairs.append((DICT_SCHEMA, t, TEMP_SCHEMA, t))
    _run_sql(conn, _rename_sql(pairs))
    return True


def _drop_swap_schemas(conn):
    for schema in (TEMP_SCHEMA, OLD_SCHEMA):
        try:
            _run_sql(conn, f"DROP DATABASE IF EXISTS {schema};")
        except Exception:
            pass


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

        # swap: RENAME TABLE 한 문장으로 메타데이터만 교체(데이터 재기록 없음).
        #   heyvoca_dict.t → heyvoca_dict_old.t , heyvoca_dict_apply.t → heyvoca_dict.t
        # 구 사전은 OLD_SCHEMA에 남겨 두고, _set_meta까지 끝난 뒤에 DROP한다
        # (중간 실패 시 rename 되돌리기로 즉시 복구하기 위해).
        swap_mode = _swap(conn)

        _set_meta(conn, entry['sha256'], entry['version'])
        _drop_swap_schemas(conn)

    except Exception as e:
        # 롤백 1순위: rename으로 되돌리기(OLD_SCHEMA가 살아 있으면 즉시 복구).
        restored = False
        try:
            restored = _restore_from_old(conn)
        except Exception:
            restored = False
        # 2순위: 사전이 망가진 게 확인될 때만 백업 dump를 재import한다.
        #  (rename swap 이전 단계에서 실패했다면 heyvoca_dict는 손대지 않은 상태라
        #   굳이 무거운 재import를 할 이유가 없다 — 공용 디스크를 아낀다.)
        if not restored and backup_path and os.path.exists(backup_path):
            healthy = False
            try:
                healthy = (_schema_exists(conn, DICT_SCHEMA)
                           and _count(conn, 'voca', DICT_SCHEMA) > 0)
            except Exception:
                healthy = False
            if not healthy:
                try:
                    _run_sql(conn, f"DROP DATABASE IF EXISTS {DICT_SCHEMA}; "
                                   f"CREATE DATABASE {DICT_SCHEMA} CHARACTER SET utf8mb4 "
                                   f"COLLATE utf8mb4_unicode_ci;")
                    _import(conn, DICT_SCHEMA, backup_path)
                except Exception:
                    pass
        _drop_swap_schemas(conn)
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
            'swap_mode': swap_mode,
        }
    finally:
        for p in (dl_path,):
            if p and os.path.exists(p):
                try:
                    os.unlink(p)
                except OSError:
                    pass
