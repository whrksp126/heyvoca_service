#!/bin/bash
set -e

# 사전 DB는 컨테이너 시작 시 자동으로 교체하지 않는다.
# 동기화는 admin '사전 동기화' 화면의 수동 올리기/내려받기로만 수행한다.

# 1. 사전 DB 마이그레이션 (heyvoca_dict)
#    versions/에 마이그레이션 파일이 없으면 skip (첫 마이그레이션 생성 전 상태)
if [ -d "/app/migrations_dict/versions" ] && ls /app/migrations_dict/versions/*.py >/dev/null 2>&1; then
    echo ">>> flask db upgrade --directory migrations_dict..."
    flask db upgrade --directory migrations_dict || {
        echo ">>> 사전 DB 마이그레이션 실패. 컨테이너 부팅 중단."
        exit 1
    }
else
    echo ">>> migrations_dict 비어있음 → skip (첫 마이그레이션 생성 전)"
fi

# 2. 사용자 DB 마이그레이션 (heyvoca_user, default bind)
if [ -d "/app/migrations" ]; then
    echo ">>> flask db upgrade (사용자 DB)..."
    flask db upgrade
    echo ">>> Migration complete."
else
    echo ">>> No migrations folder found, skipping flask db upgrade."
fi

# 3. Schema drift 검증 (모델 vs 실제 DB 일관성 확인)
#    SCHEMA_CHECK_MODE=warn(기본)/strict/off 로 동작 제어
if [ -f "/app/scripts/verify_schema.py" ]; then
    echo ">>> verify_schema: 모델 ↔ DB 스키마 일관성 검증..."
    python3 /app/scripts/verify_schema.py || {
        echo ">>> Schema drift 발견 (strict 모드). 컨테이너 부팅 중단."
        exit 1
    }
fi

# 4. UserVoca.data 정규화 (V1/V2 → V3) — idempotent
#    이미 모두 V3 면 'OK — all V3' 한 줄만 출력하고 종료.
#    어떤 이유로든 V1/V2 가 끼어들면 즉시 변환.
if [ -f "/app/jobs/migrate_user_voca_to_v3.py" ]; then
    echo ">>> migrate_user_voca_to_v3: V1/V2 → V3 정규화..."
    python3 /app/jobs/migrate_user_voca_to_v3.py --quiet || {
        echo ">>> UserVoca v3 정규화 실패. 컨테이너 부팅 중단."
        exit 1
    }
fi

echo ">>> Starting gunicorn..."
exec "$@"
