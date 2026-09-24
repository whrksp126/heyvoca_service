#!/usr/bin/env bash
# heyvoca_dict_ja dump → objectstore(dict_ja/) 업로드 래퍼.
#
#   bash scripts/51_dump_upload.sh [--dry-run] [50_load_mysql.py 추가 인자...]
#
# - MySQL root 비밀번호: docker-compose.local.yml 의 MYSQL_ROOT_PASSWORD
# - MinIO RW 키: heyvoca_back_local 컨테이너 환경변수 MINIO_DICT_RW_KEY / MINIO_DICT_RW_SECRET
# 값은 셸 변수 → `docker exec -e NAME`(값 없이 이름만) 으로 넘긴다. 명령줄·출력에 시크릿이 남지 않는다.
# 적재는 하지 않는다(현재 DB 를 그대로 dump). 재적재까지 하려면 인자에 --reset --verify 를 더한다.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SERVICE="$(cd "$HERE/../../.." && pwd)"          # heyvoca_service
WORK=heyvoca_dictja_work
BACK=heyvoca_back_local

MYSQL_PWD="$(awk -F': ' '/MYSQL_ROOT_PASSWORD:/{print $2}' "$SERVICE/docker-compose.local.yml" | tr -d '"')"
[ -n "$MYSQL_PWD" ] || { echo "MYSQL_ROOT_PASSWORD 를 읽지 못함" >&2; exit 1; }

BACK_ENV="$(docker exec "$BACK" env)"
MINIO_DICT_RW_KEY="$(printf '%s\n' "$BACK_ENV" | sed -n 's/^MINIO_DICT_RW_KEY=//p')"
MINIO_DICT_RW_SECRET="$(printf '%s\n' "$BACK_ENV" | sed -n 's/^MINIO_DICT_RW_SECRET=//p')"
MINIO_BUCKET="$(printf '%s\n' "$BACK_ENV" | sed -n 's/^MINIO_BUCKET=//p')"
unset BACK_ENV
[ -n "$MINIO_DICT_RW_KEY" ] && [ -n "$MINIO_DICT_RW_SECRET" ] \
  || { echo "$BACK 에 MINIO_DICT_RW_KEY/SECRET 없음" >&2; exit 1; }
MINIO_BUCKET="${MINIO_BUCKET:-heyvoca}"
export MYSQL_PWD MINIO_DICT_RW_KEY MINIO_DICT_RW_SECRET MINIO_BUCKET

docker exec "$WORK" python3 -c 'import boto3' 2>/dev/null \
  || docker exec "$WORK" pip install -q --root-user-action=ignore boto3

exec docker exec -e MYSQL_PWD -e MINIO_DICT_RW_KEY -e MINIO_DICT_RW_SECRET -e MINIO_BUCKET "$WORK" \
  python3 scripts/50_load_mysql.py --upload "$@"
