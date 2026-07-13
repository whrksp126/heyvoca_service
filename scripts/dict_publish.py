#!/usr/bin/env python3
"""사전 데이터 갱신 발행 스크립트 (관리자 전용).

흐름:
  1. 로컬 heyvoca_dict mysqldump → 임시 .sql
  2. sha256 계산 + 테이블별 row 수 측정
  3. 이전 dump (현재 dict_pointer.json이 가리키는) 다운로드 → diff 요약
  4. MinIO에 업로드 (full_dict_v<버전>.sql)
  5. db/dict/dict_pointer.json 갱신
  6. db/dict/CHANGELOG.md에 항목 추가
  7. 안내 출력 (git add/commit/push)

권한:
  MinIO RW 키 필요 (MINIO_DICT_RW_KEY, MINIO_DICT_RW_SECRET).
  RW 키 없는 사람은 업로드 단계에서 403.

사용법:
  cd heyvoca_service/
  python scripts/dict_publish.py [--message "토익 800점 단어 100개 추가"]
"""
import argparse
import json
import hashlib
import os
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse, unquote

PROJECT_ROOT = Path(__file__).resolve().parent.parent
POINTER_PATH = PROJECT_ROOT / 'db' / 'dict' / 'dict_pointer.json'
CHANGELOG_PATH = PROJECT_ROOT / 'db' / 'dict' / 'CHANGELOG.md'

DICT_SCHEMA = 'heyvoca_dict'
TRACKED_TABLES = [
    'voca', 'voca_meaning', 'voca_example', 'voca_label',
    'voca_book', 'admin_voca_book', 'bookstore', 'daily_sentence',
    'voca_book_map', 'voca_meaning_map', 'voca_example_map',
    'admin_voca_book_map',
]
# table_counts_min 산출 시 사용할 테이블들 (작은 테이블은 0으로 두는 게 안전)
KEY_TABLES_FOR_MIN = ['voca', 'voca_meaning', 'voca_book']


def log(msg):
    print(msg, flush=True)


def parse_db_url(url):
    """URL-encoded password (e.g. voca%21%4034) 자동 디코드."""
    p = urlparse(url)
    return {
        'user': unquote(p.username) if p.username else 'voca',
        'password': unquote(p.password) if p.password else '',
        'host': p.hostname or 'localhost',
        'port': p.port or 3310,
        'db': p.path.lstrip('/') or DICT_SCHEMA,
    }


def mysql_args(conn, db=None):
    args = ['-h', conn['host'], '-P', str(conn['port']), '-u', conn['user']]
    if conn['password']:
        args.append(f"-p{conn['password']}")
    if db is not None:
        args.append(db)
    return args


def dump_dict(conn, dest_path):
    """로컬 heyvoca_dict를 mysqldump (백엔드 컨테이너 안에서 실행 권장)."""
    # 백엔드 컨테이너 안에서 실행 시: docker exec ... python scripts/dict_publish.py
    # 호스트에서 실행 시: docker exec heyvoca_mysql_local mysqldump ...
    in_container = os.path.exists('/.dockerenv')
    if in_container:
        cmd = ['mysqldump', '--no-tablespaces', '--single-transaction',
               '--skip-lock-tables', '--skip-comments'] + mysql_args(conn, DICT_SCHEMA)
        with open(dest_path, 'wb') as f:
            r = subprocess.run(cmd, stdout=f, stderr=subprocess.PIPE)
    else:
        # 호스트에서 docker exec로 mysql 컨테이너 진입
        container = os.getenv('MYSQL_CONTAINER', 'heyvoca_mysql_local')
        cmd = [
            'docker', 'exec', container,
            'mysqldump',
            '-u', conn['user'], f"-p{conn['password']}",
            '--no-tablespaces', '--single-transaction', '--skip-lock-tables',
            '--skip-comments',
            DICT_SCHEMA,
        ]
        with open(dest_path, 'wb') as f:
            r = subprocess.run(cmd, stdout=f, stderr=subprocess.PIPE)
    if r.returncode != 0:
        raise RuntimeError(f"mysqldump 실패: {r.stderr.decode().strip()}")


def count_rows(conn, table):
    in_container = os.path.exists('/.dockerenv')
    if in_container:
        cmd = ['mysql', '-N', '-s'] + mysql_args(conn) + ['-e',
              f"SELECT COUNT(*) FROM {DICT_SCHEMA}.{table};"]
    else:
        container = os.getenv('MYSQL_CONTAINER', 'heyvoca_mysql_local')
        cmd = ['docker', 'exec', container, 'mysql', '-N', '-s',
               '-u', conn['user'], f"-p{conn['password']}",
               '-e', f"SELECT COUNT(*) FROM {DICT_SCHEMA}.{table};"]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"COUNT 실패 ({table}): {r.stderr.strip()}")
    return int(r.stdout.strip() or 0)


def sha256_of_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def upload_to_minio(endpoint, bucket, key, secret, object_name, src_path):
    from minio import Minio
    parsed = urlparse(endpoint)
    secure = parsed.scheme == 'https'
    host = parsed.netloc
    client = Minio(host, access_key=key, secret_key=secret, secure=secure)
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)
    client.fput_object(bucket, object_name, src_path,
                       content_type='application/sql')


def next_version():
    """오늘 날짜 + 순번. 기존 pointer의 version과 비교해 충돌 없게."""
    today = datetime.utcnow().strftime('%Y%m%d')
    seq = 1
    if POINTER_PATH.exists():
        try:
            cur = json.loads(POINTER_PATH.read_text()).get('version', '')
            if cur.startswith(today):
                # 같은 날 → 순번 증가
                try:
                    seq = int(cur.split('-')[-1]) + 1
                except (ValueError, IndexError):
                    seq = 2
        except (json.JSONDecodeError, OSError):
            pass
    return f"{today}-{seq}"


def append_changelog(version, message, counts):
    """CHANGELOG.md에 항목 append."""
    date = datetime.utcnow().strftime('%Y-%m-%d')
    user = os.getenv('USER', 'unknown')
    counts_summary = ", ".join(f"{t}={c}" for t, c in counts.items() if t in KEY_TABLES_FOR_MIN)
    line = f"| {version} | {date} | {user} | - | - | - | {message or '(설명 없음)'} ({counts_summary}) |\n"
    if not CHANGELOG_PATH.exists():
        CHANGELOG_PATH.write_text(
            "# 사전 데이터 변경 이력\n\n"
            "| 버전 | 날짜 | 작업자 | 추가 | 수정 | 삭제 | 비고 |\n"
            "|------|------|--------|------|------|------|------|\n"
        )
    with open(CHANGELOG_PATH, 'a') as f:
        f.write(line)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--message', '-m', default='', help="이번 갱신의 설명")
    parser.add_argument('--db-url',
                        default=os.getenv('DATABASE_URL_DICT',
                                          'mysql+pymysql://voca:voca!@34@localhost:3310/heyvoca_dict'),
                        help="사전 DB connection (로컬 호스트 기준)")
    args = parser.parse_args()

    conn = parse_db_url(args.db_url)

    # MinIO RW 키 확인
    endpoint = os.getenv('MINIO_ENDPOINT', 'https://objectstore.ghmate.com')
    bucket = os.getenv('MINIO_BUCKET', 'heyvoca')
    rw_key = os.getenv('MINIO_DICT_RW_KEY')
    rw_secret = os.getenv('MINIO_DICT_RW_SECRET')
    if not (rw_key and rw_secret):
        log("ERROR: MINIO_DICT_RW_KEY / MINIO_DICT_RW_SECRET 미설정.")
        log("사전 갱신 권한자만 실행 가능. .env.local에 RW 키가 있어야 함.")
        return 1

    log(f"== 사전 dump 추출: {DICT_SCHEMA} ==")
    with tempfile.NamedTemporaryFile(suffix='.sql', delete=False) as tmp:
        dump_path = tmp.name
    try:
        dump_dict(conn, dump_path)
        size_mb = os.path.getsize(dump_path) / (1024 * 1024)
        log(f"  dump 크기: {size_mb:.1f} MB")

        # sha256
        sha = sha256_of_file(dump_path)
        log(f"  sha256: {sha}")

        # row 수 측정
        log("== 테이블별 row 수 측정 ==")
        counts = {}
        for t in TRACKED_TABLES:
            try:
                counts[t] = count_rows(conn, t)
                log(f"  {t}: {counts[t]}")
            except Exception as e:
                log(f"  {t}: SKIP ({e})")
                counts[t] = 0

        # table_counts_min: 측정된 값의 80%로 안전 임계값 설정
        table_counts_min = {t: max(0, int(counts.get(t, 0) * 0.8))
                            for t in KEY_TABLES_FOR_MIN if counts.get(t, 0) > 0}

        version = next_version()
        object_name = f"dict/full_dict_v{version}.sql"

        log(f"== MinIO 업로드: {bucket}/{object_name} ==")
        upload_to_minio(endpoint, bucket, rw_key, rw_secret, object_name, dump_path)

        # dict_pointer.json 갱신
        pointer = {
            "url": f"{endpoint.rstrip('/')}/{bucket}/{object_name}",
            "sha256": sha,
            "version": version,
            "table_counts_min": table_counts_min,
        }
        POINTER_PATH.write_text(json.dumps(pointer, indent=2, ensure_ascii=False) + "\n")
        log(f"== dict_pointer.json 갱신 완료 (version={version}) ==")

        # CHANGELOG
        append_changelog(version, args.message, counts)
        log(f"== CHANGELOG.md 항목 추가 ==")

        log("")
        log("=" * 60)
        log("다음 단계:")
        log("  git add db/dict/")
        log(f"  git commit -m 'dict: {args.message or version}'")
        log("  git push")
        log("")
        log("머지 후 다른 팀원/dev/stg/prod는 docker compose up --build로 자동 동기화.")
        log("=" * 60)

    finally:
        try:
            os.unlink(dump_path)
        except OSError:
            pass

    return 0


if __name__ == '__main__':
    sys.exit(main())
