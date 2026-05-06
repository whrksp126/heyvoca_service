#!/usr/bin/env python3
"""사전 DB(heyvoca_dict) 자동 동기화 스크립트.

백엔드 컨테이너의 docker-entrypoint.sh가 시작 시 호출.
db/dict/dict_pointer.json의 sha256과 heyvoca_dict.dict_meta의 현재 해시를 비교,
다르면 MinIO에서 새 dump를 다운로드 받아 import.

흐름:
  1. dict_pointer.json 읽기 (uninitialized면 skip)
  2. dict_meta 조회 → 같으면 skip (일상 99% 케이스)
  3. 환경별 자동 갱신 허용 토글 확인
  4. (prod) 현재 schema 백업
  5. MinIO에서 dump 다운로드 → sha256 검증
  6. heyvoca_dict_new에 import
  7. table_counts_min 검증
  8. 통과 → swap (drop & recreate heyvoca_dict + import again)
  9. dict_meta에 새 해시 기록
  10. 검증 실패 → (prod) 백업 복원, (그 외) heyvoca_dict_new drop, exit 1

환경변수:
  DATABASE_URL_DICT      : 사전 DB connection string
  MINIO_ENDPOINT, MINIO_BUCKET, MINIO_DICT_RO_KEY, MINIO_DICT_RO_SECRET
  APP_ENV                : local/dev/stg/prod
  DICT_AUTO_RESET        : true/false (기본 true)
  DICT_AUTO_RESET_ALLOW_PROD : true/false (기본 false, prod에서만 의미)
"""
import os
import sys
import json
import hashlib
import shutil
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse, unquote

# 프로젝트 루트 기준 경로
PROJECT_ROOT = Path(__file__).resolve().parent.parent
POINTER_PATH = PROJECT_ROOT / 'db' / 'dict' / 'dict_pointer.json'

DICT_SCHEMA = 'heyvoca_dict'
TEMP_SCHEMA = 'heyvoca_dict_new'


def log(level, msg):
    ts = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%SZ')
    print(f"[dict_sync {ts}] {level}: {msg}", flush=True)


def parse_db_url(url):
    """mysql+pymysql://user:pass@host:port/db → dict.
    .env에 URL-encoded password (e.g. voca%21%4034)가 들어가는 경우가 있어
    unquote로 디코드 후 mysql CLI에 전달해야 함.
    """
    p = urlparse(url)
    return {
        'user': unquote(p.username) if p.username else 'voca',
        'password': unquote(p.password) if p.password else '',
        'host': p.hostname or 'mysql',
        'port': p.port or 3306,
        'db': p.path.lstrip('/') or DICT_SCHEMA,
    }


def mysql_args(conn, db=None):
    args = [
        '-h', conn['host'],
        '-P', str(conn['port']),
        '-u', conn['user'],
    ]
    if conn['password']:
        args.append(f"-p{conn['password']}")
    if db is not None:
        args.append(db)
    return args


def run_mysql(conn, sql, db=None):
    """mysql 명령으로 SQL 실행 (한 줄짜리)."""
    cmd = ['mysql'] + mysql_args(conn, db) + ['-e', sql]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"mysql failed: {result.stderr.strip()}")
    return result.stdout


def import_sql_file(conn, db, sql_path):
    """mysql < file.sql 실행."""
    cmd = ['mysql'] + mysql_args(conn, db)
    with open(sql_path, 'rb') as f:
        result = subprocess.run(cmd, stdin=f, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"mysql import failed: {result.stderr.strip()}")


def dump_schema(conn, db, dest_path):
    """mysqldump > file."""
    cmd = ['mysqldump', '--no-tablespaces', '--single-transaction',
           '--skip-lock-tables'] + mysql_args(conn, db)
    with open(dest_path, 'wb') as f:
        result = subprocess.run(cmd, stdout=f, stderr=subprocess.PIPE, text=False)
    if result.returncode != 0:
        raise RuntimeError(f"mysqldump failed: {result.stderr.decode().strip()}")


def get_current_hash(conn):
    """heyvoca_dict.dict_meta에서 현재 dump 해시 조회. 테이블이 없으면 None."""
    sql = (f"SELECT value FROM {DICT_SCHEMA}.dict_meta "
           f"WHERE `key`='current_dump_sha256' LIMIT 1;")
    cmd = ['mysql', '-N', '-s'] + mysql_args(conn) + ['-e', sql]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        # 테이블 없음 (첫 동기화) — None 리턴해서 강제 import 트리거
        if 'doesn\'t exist' in result.stderr.lower() or 'unknown table' in result.stderr.lower():
            return None
        if 'unknown database' in result.stderr.lower():
            return None
        raise RuntimeError(f"mysql query failed: {result.stderr.strip()}")
    val = result.stdout.strip()
    return val if val else None


def set_current_hash(conn, sha256, version):
    """dict_meta upsert."""
    # MySQL ON DUPLICATE KEY UPDATE
    sql = (
        f"INSERT INTO {DICT_SCHEMA}.dict_meta (`key`, value, updated_at) "
        f"VALUES ('current_dump_sha256', '{sha256}', NOW()) "
        f"ON DUPLICATE KEY UPDATE value=VALUES(value), updated_at=VALUES(updated_at); "
        f"INSERT INTO {DICT_SCHEMA}.dict_meta (`key`, value, updated_at) "
        f"VALUES ('current_dump_version', '{version}', NOW()) "
        f"ON DUPLICATE KEY UPDATE value=VALUES(value), updated_at=VALUES(updated_at);"
    )
    run_mysql(conn, sql)


def download_from_minio(endpoint, bucket, key, secret, object_name, dest_path):
    """MinIO에서 객체 다운로드."""
    from minio import Minio

    parsed = urlparse(endpoint)
    secure = parsed.scheme == 'https'
    host = parsed.netloc

    client = Minio(host, access_key=key, secret_key=secret, secure=secure)
    client.fget_object(bucket, object_name, dest_path)


def sha256_of_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def verify_table_counts(conn, db, table_counts_min):
    """각 테이블 row 수가 table_counts_min 이상인지 확인."""
    for table, min_count in (table_counts_min or {}).items():
        sql = f"SELECT COUNT(*) FROM {db}.{table};"
        cmd = ['mysql', '-N', '-s'] + mysql_args(conn) + ['-e', sql]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"COUNT 실패 ({table}): {result.stderr.strip()}")
        actual = int(result.stdout.strip() or 0)
        if actual < min_count:
            raise RuntimeError(
                f"검증 실패: {table} row={actual} < min={min_count}"
            )
        log('INFO', f"  {table}: {actual} rows (min {min_count}) OK")


def swap_schemas(conn):
    """heyvoca_dict_new의 모든 테이블을 heyvoca_dict로 복제 (drop & recreate).
    MySQL은 RENAME DATABASE 미지원이라 dump/import로 swap.
    """
    # DROP & CREATE heyvoca_dict
    log('INFO', f"swap: DROP & CREATE {DICT_SCHEMA}")
    run_mysql(conn,
              f"DROP DATABASE IF EXISTS {DICT_SCHEMA}; "
              f"CREATE DATABASE {DICT_SCHEMA} "
              f"CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
    # heyvoca_dict_new → heyvoca_dict 로 dump/import
    with tempfile.NamedTemporaryFile(suffix='.sql', delete=False) as tmp:
        swap_path = tmp.name
    try:
        log('INFO', f"swap: dump {TEMP_SCHEMA} → {swap_path}")
        dump_schema(conn, TEMP_SCHEMA, swap_path)
        log('INFO', f"swap: import → {DICT_SCHEMA}")
        import_sql_file(conn, DICT_SCHEMA, swap_path)
    finally:
        try:
            os.unlink(swap_path)
        except OSError:
            pass
    log('INFO', f"swap: DROP {TEMP_SCHEMA}")
    run_mysql(conn, f"DROP DATABASE IF EXISTS {TEMP_SCHEMA};")


def main():
    # 1. dict_pointer.json 읽기
    if not POINTER_PATH.exists():
        log('WARN', f"pointer 없음: {POINTER_PATH} → skip")
        return 0
    with open(POINTER_PATH) as f:
        pointer = json.load(f)
    if not pointer.get('url') or pointer.get('version') == 'uninitialized':
        log('INFO', "pointer가 uninitialized 상태 → skip (Phase 0 사전 dump 업로드 대기 중)")
        return 0

    expected_sha = pointer['sha256']
    version = pointer.get('version', 'unknown')
    table_counts_min = pointer.get('table_counts_min', {})

    # 2. 환경 확인
    app_env = os.getenv('APP_ENV', 'local').lower()
    auto_reset = os.getenv('DICT_AUTO_RESET', 'true').lower() == 'true'
    allow_prod = os.getenv('DICT_AUTO_RESET_ALLOW_PROD', 'false').lower() == 'true'

    if not auto_reset:
        log('INFO', "DICT_AUTO_RESET=false → skip")
        return 0
    if app_env == 'prod' and not allow_prod:
        log('INFO', "prod인데 DICT_AUTO_RESET_ALLOW_PROD=false → skip")
        return 0

    # 3. DB connection 정보
    db_url = os.getenv('DATABASE_URL_DICT')
    if not db_url:
        log('ERROR', "DATABASE_URL_DICT 환경변수 없음")
        return 1
    conn = parse_db_url(db_url)

    # 4. 현재 해시 조회 → 같으면 skip
    try:
        current_sha = get_current_hash(conn)
    except Exception as e:
        log('WARN', f"current_dump_sha256 조회 실패 ({e}) → 첫 동기화로 간주")
        current_sha = None

    if current_sha == expected_sha:
        log('INFO', f"이미 최신 ({expected_sha[:8]}…) → skip")
        return 0

    log('INFO', f"동기화 필요: 현재={current_sha or 'none'} → 신규={expected_sha[:8]}… ({version})")

    # 5. MinIO 환경변수
    endpoint = os.getenv('MINIO_ENDPOINT')
    bucket = os.getenv('MINIO_BUCKET')
    ro_key = os.getenv('MINIO_DICT_RO_KEY')
    ro_secret = os.getenv('MINIO_DICT_RO_SECRET')
    if not all([endpoint, bucket, ro_key, ro_secret]):
        log('ERROR', "MinIO 환경변수 누락 (MINIO_ENDPOINT/BUCKET/DICT_RO_KEY/DICT_RO_SECRET)")
        return 1

    # 6. (prod) 현재 사전 schema 백업
    backup_path = None
    if app_env == 'prod' and current_sha:
        ts = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        backup_path = f"/tmp/dict_backup_{ts}.sql"
        log('INFO', f"prod: 현재 사전 백업 → {backup_path}")
        try:
            dump_schema(conn, DICT_SCHEMA, backup_path)
        except Exception as e:
            log('ERROR', f"백업 실패: {e}")
            return 1

    # 7. MinIO에서 dump 다운로드
    pointer_url = pointer['url']
    object_name = pointer_url.rsplit('/', 1)[-1]
    with tempfile.NamedTemporaryFile(suffix='.sql', delete=False) as tmp:
        dump_path = tmp.name
    try:
        log('INFO', f"MinIO 다운로드: {bucket}/{object_name}")
        download_from_minio(endpoint, bucket, ro_key, ro_secret, object_name, dump_path)

        # 8. sha256 검증
        actual_sha = sha256_of_file(dump_path)
        if actual_sha != expected_sha:
            raise RuntimeError(f"sha256 mismatch: expected {expected_sha}, got {actual_sha}")
        log('INFO', f"sha256 OK ({actual_sha[:16]}…)")

        # 9. 임시 schema 생성 + import
        log('INFO', f"임시 schema {TEMP_SCHEMA} 생성 + import")
        run_mysql(conn,
                  f"DROP DATABASE IF EXISTS {TEMP_SCHEMA}; "
                  f"CREATE DATABASE {TEMP_SCHEMA} "
                  f"CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
        import_sql_file(conn, TEMP_SCHEMA, dump_path)

        # 10. 검증
        log('INFO', f"table_counts_min 검증")
        verify_table_counts(conn, TEMP_SCHEMA, table_counts_min)

        # 11. swap
        swap_schemas(conn)

        # 12. dict_meta 갱신 (swap 후의 heyvoca_dict에 dict_meta 테이블이 있어야 함)
        log('INFO', "dict_meta 갱신")
        try:
            set_current_hash(conn, expected_sha, version)
        except Exception as e:
            # dict_meta 테이블이 dump에 없으면 만들어야 함 (첫 도입 시)
            log('WARN', f"dict_meta upsert 실패 ({e}) → 테이블 생성 후 재시도")
            run_mysql(conn,
                      f"CREATE TABLE IF NOT EXISTS {DICT_SCHEMA}.dict_meta ("
                      f"  `key` VARCHAR(64) PRIMARY KEY, "
                      f"  value VARCHAR(255), "
                      f"  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP "
                      f"    ON UPDATE CURRENT_TIMESTAMP"
                      f") CHARACTER SET utf8mb4;")
            set_current_hash(conn, expected_sha, version)

        log('INFO', f"동기화 완료 → {expected_sha[:16]}… ({version})")

    except Exception as e:
        log('ERROR', f"동기화 실패: {e}")
        # 롤백
        if app_env == 'prod' and backup_path and os.path.exists(backup_path):
            log('WARN', "prod: 백업에서 복원 시도")
            try:
                run_mysql(conn,
                          f"DROP DATABASE IF EXISTS {DICT_SCHEMA}; "
                          f"CREATE DATABASE {DICT_SCHEMA} "
                          f"CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
                import_sql_file(conn, DICT_SCHEMA, backup_path)
                log('INFO', "백업 복원 완료")
            except Exception as restore_err:
                log('CRITICAL', f"백업 복원도 실패! 수동 개입 필요: {restore_err}")
        else:
            # 로컬/dev/stg는 임시 schema만 정리
            try:
                run_mysql(conn, f"DROP DATABASE IF EXISTS {TEMP_SCHEMA};")
            except Exception:
                pass
        return 1
    finally:
        try:
            os.unlink(dump_path)
        except OSError:
            pass

    return 0


if __name__ == '__main__':
    sys.exit(main())
