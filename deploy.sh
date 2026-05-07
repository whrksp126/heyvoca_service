#!/bin/bash

# 배포 스크립트
# 사용법: ./deploy.sh [dev|stg|prod]
#
# 배포 방식: 서버에서 git pull → docker compose up --build (Docker Hub 불필요)
# local 환경은 별도: docker compose -f docker-compose.local.yml up --build -d

ENV=$1

# ─── 서버 접속 정보 ───
SSH_KEY="$HOME/.ssh/ghmate_server"
SSH_USER="ghmate"
SSH_HOST="ghmate.iptime.org"
SSH_PORT="222"
REMOTE_DIR="/srv/projects/heyvoca"

if [[ -z "$ENV" ]]; then
    echo "사용법: ./deploy.sh [dev|stg|prod]"
    exit 1
fi

case $ENV in
    dev)
        COMPOSE_FILE="docker-compose.dev.yml"
        PROJECT_NAME="heyvoca_dev"
        ;;
    stg)
        COMPOSE_FILE="docker-compose.stg.yml"
        PROJECT_NAME="heyvoca_stg"
        ;;
    prod)
        COMPOSE_FILE="docker-compose.yml"
        PROJECT_NAME="heyvoca_prod"
        ;;
    *)
        echo "잘못된 환경입니다: $ENV (dev, stg, prod 중 하나를 입력하세요)"
        exit 1
        ;;
esac

echo ">>> [$ENV] 배포를 시작합니다..."

# 서버에서 git pull → 이미지 빌드 → 재시작
ssh -i "$SSH_KEY" -p "$SSH_PORT" "${SSH_USER}@${SSH_HOST}" "
    set -e
    cd ${REMOTE_DIR}
    echo '>>> git pull...'
    git pull
    echo '>>> docker build & up...'
    docker compose -p ${PROJECT_NAME} -f ${COMPOSE_FILE} up --build -d front back
    echo '>>> nginx reload (IP 캐시 갱신)...'
    docker exec nginx_proxy nginx -s reload
"

if [ $? -ne 0 ]; then
    echo ">>> [에러] 배포 실패. SSH 접속 및 서버 상태를 확인하세요."
    exit 1
fi

# ─── 배포 후 헬스체크 ───
# 컨테이너가 시작되며 verify_schema.py가 출력한 결과를 확인.
# SCHEMA DRIFT 발견 시 사람이 즉시 인지하도록 경고/실패 처리.
echo ">>> [$ENV] 컨테이너 부팅 대기 (최대 60초)..."
sleep 8
HEALTH_OUTPUT=$(ssh -i "$SSH_KEY" -p "$SSH_PORT" "${SSH_USER}@${SSH_HOST}" \
    "for i in \$(seq 1 12); do
        out=\$(docker logs heyvoca_back_${ENV} --tail 200 2>&1)
        if echo \"\$out\" | grep -q 'Starting gunicorn'; then
            echo \"\$out\" | grep -E '\\[SCHEMA (OK|DRIFT|CHECK)\\]'
            exit 0
        fi
        sleep 5
    done
    echo 'TIMEOUT: gunicorn 부팅 확인 못 함'
    exit 1")
HEALTH_RC=$?

echo "$HEALTH_OUTPUT"

if [ $HEALTH_RC -ne 0 ]; then
    echo ">>> [경고] 컨테이너 부팅 확인 실패. 서버에서 로그를 직접 확인하세요."
elif echo "$HEALTH_OUTPUT" | grep -q '\[SCHEMA DRIFT\]'; then
    echo ">>> [경고] SCHEMA DRIFT 감지. 모델 정의와 실제 DB 스키마가 다릅니다."
    echo "    마이그레이션 누락 또는 적용 실패 가능성. 즉시 확인하세요."
else
    echo ">>> [$ENV] 스키마 검증 통과."
fi

echo ">>> [$ENV] 배포 완료!"
