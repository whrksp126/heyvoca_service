#!/bin/bash
set -e

# ── 기동 실패 알림(CodingPT) ─────────────────────────────────────────────
# CODINGPT_WEBHOOK_URL 이 있을 때만(prod) 켠다. 없으면 아래 블록은 아무것도 바꾸지 않는다.
# 부팅 단계 출력을 파일에도 남겨 두고, gunicorn exec 전에 비정상 종료하면 단계 이름과
# 마지막 로그를 level=critical 로 보낸 뒤 원래 종료 코드로 끝낸다(set -e 동작 유지).
BOOT_STEP="init"
if [ -n "${CODINGPT_WEBHOOK_URL:-}" ]; then
    BOOT_LOG="/tmp/heyvoca-boot.log"
    : > "$BOOT_LOG"
    exec 3>&1 4>&2
    exec > >(tee -a "$BOOT_LOG") 2>&1

    notify_boot_failure() {
        local code=$?
        [ "$code" -eq 0 ] && return 0
        sleep 0.3   # tee 가 마지막 줄을 쓸 시간
        BOOT_STEP="$BOOT_STEP" BOOT_CODE="$code" BOOT_LOG="$BOOT_LOG" timeout 8 python3 - <<'PYEOF' >&3 2>&4 || true
import json, os, urllib.request
step, code = os.environ.get('BOOT_STEP', '?'), os.environ.get('BOOT_CODE', '?')
try:
    with open(os.environ['BOOT_LOG'], encoding='utf-8', errors='replace') as f:
        tail = ''.join(f.readlines()[-40:])[-7000:]
except Exception:
    tail = '(로그 없음)'
env = os.environ.get('APP_ENV') or os.environ.get('FLASK_CONFIG') or 'unknown'
body = {
    'title': f'heyvoca_back 기동 실패: {step} (exit {code})'[:200],
    'text': tail, 'level': 'critical', 'source': f'heyvoca-back@{env}'[:60],
    'fields': {'step': step, 'exit': code, 'env': env},
    'dedupeKey': f'boot:{step}',
}
try:
    req = urllib.request.Request(os.environ['CODINGPT_WEBHOOK_URL'],
                                 data=json.dumps(body, ensure_ascii=False).encode('utf-8'),
                                 headers={'Content-Type': 'application/json'}, method='POST')
    urllib.request.urlopen(req, timeout=3).read(256)
except Exception as e:
    print(f'>>> [WARN] CodingPT 기동 실패 알림 전송 실패: {type(e).__name__}')
PYEOF
        return 0
    }
    trap notify_boot_failure EXIT
fi

# 사전 DB는 컨테이너 시작 시 자동으로 교체하지 않는다.
# 동기화는 admin '사전 동기화' 화면의 수동 올리기/내려받기로만 수행한다.

# 1. 사전 DB 마이그레이션 (heyvoca_dict)
#    versions/에 마이그레이션 파일이 없으면 skip (첫 마이그레이션 생성 전 상태)
if [ -d "/app/migrations_dict/versions" ] && ls /app/migrations_dict/versions/*.py >/dev/null 2>&1; then
    BOOT_STEP="db upgrade (dict)"
    echo ">>> flask db upgrade --directory migrations_dict..."
    flask db upgrade --directory migrations_dict || {
        echo ">>> 사전 DB 마이그레이션 실패. 컨테이너 부팅 중단."
        exit 1
    }

    # 1-1. 일본어 사전(heyvoca_dict_ja) — 같은 리비전을 ja schema 에도 적용.
    #      schema 는 dump import 로 처음 생긴다. 없으면(최초 세팅 전) 경고 후 건너뜀.
    DICT_JA_EXISTS=$(python3 - <<'PYEOF' 2>/dev/null || echo "error"
import os
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
url = os.getenv('DATABASE_URL_DICT') or os.getenv('DATABASE_URL')
schema = os.getenv('DICT_SCHEMA_JA', 'heyvoca_dict_ja')
eng = create_engine(url, poolclass=NullPool)
with eng.connect() as c:
    row = c.execute(text("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = :s"), {"s": schema}).first()
print("yes" if row else "no")
PYEOF
)
    if [ "$DICT_JA_EXISTS" = "yes" ]; then
        BOOT_STEP="db upgrade (dict_ja)"
        echo ">>> DICT_BIND_LANG=ja flask db upgrade --directory migrations_dict..."
        DICT_BIND_LANG=ja flask db upgrade --directory migrations_dict || {
            echo ">>> 일본어 사전 DB 마이그레이션 실패. 컨테이너 부팅 중단."
            exit 1
        }
    else
        echo ">>> [WARN] 일본어 사전 schema(${DICT_SCHEMA_JA:-heyvoca_dict_ja}) 없음/확인 실패($DICT_JA_EXISTS) → ja 마이그레이션 skip (dump import 후 재시작하면 적용)"
    fi
else
    echo ">>> migrations_dict 비어있음 → skip (첫 마이그레이션 생성 전)"
fi

# 2. 사용자 DB 마이그레이션 (heyvoca_user, default bind)
if [ -d "/app/migrations" ]; then
    BOOT_STEP="db upgrade (user)"
    echo ">>> flask db upgrade (사용자 DB)..."
    flask db upgrade
    echo ">>> Migration complete."
else
    echo ">>> No migrations folder found, skipping flask db upgrade."
fi

# 3. Schema drift 검증 (모델 vs 실제 DB 일관성 확인)
#    SCHEMA_CHECK_MODE=warn(기본)/strict/off 로 동작 제어
if [ -f "/app/scripts/verify_schema.py" ]; then
    BOOT_STEP="verify_schema"
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
    BOOT_STEP="migrate_user_voca_to_v3"
    echo ">>> migrate_user_voca_to_v3: V1/V2 → V3 정규화..."
    python3 /app/jobs/migrate_user_voca_to_v3.py --quiet || {
        echo ">>> UserVoca v3 정규화 실패. 컨테이너 부팅 중단."
        exit 1
    }
fi

echo ">>> Starting gunicorn..."
if [ -n "${CODINGPT_WEBHOOK_URL:-}" ]; then
    # 부팅 단계 끝 — 알림 trap 해제, 출력은 원래 stdout/stderr 로 되돌린다(gunicorn 로그는 tee 를 거치지 않음).
    trap - EXIT
    exec 1>&3 2>&4 3>&- 4>&-
fi
exec "$@"
