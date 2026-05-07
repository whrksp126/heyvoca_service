#!/bin/bash
set -e

# 1. 사전 DB 자동 동기화 (MinIO에서 dump 다운로드 → import)
#    DICT_AUTO_RESET=false면 즉시 skip
if [ -f "/app/scripts/dict_sync.py" ]; then
    echo ">>> dict_sync: 사전 DB 동기화 검사..."
    python3 /app/scripts/dict_sync.py || {
        echo ">>> dict_sync 실패. 컨테이너 부팅 중단."
        exit 1
    }
fi

# 2. 사전 DB 마이그레이션 (heyvoca_dict)
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

# 3. 사용자 DB 마이그레이션 (heyvoca_user, default bind)
if [ -d "/app/migrations" ]; then
    echo ">>> flask db upgrade (사용자 DB)..."
    flask db upgrade
    echo ">>> Migration complete."
else
    echo ">>> No migrations folder found, skipping flask db upgrade."
fi

# 4. Schema drift 검증 (모델 vs 실제 DB 일관성 확인)
#    SCHEMA_CHECK_MODE=warn(기본)/strict/off 로 동작 제어
if [ -f "/app/scripts/verify_schema.py" ]; then
    echo ">>> verify_schema: 모델 ↔ DB 스키마 일관성 검증..."
    python3 /app/scripts/verify_schema.py || {
        echo ">>> Schema drift 발견 (strict 모드). 컨테이너 부팅 중단."
        exit 1
    }
fi

echo ">>> Starting gunicorn..."
exec "$@"
