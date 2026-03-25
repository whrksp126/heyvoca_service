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

if [ $? -eq 0 ]; then
    echo ">>> [$ENV] 배포 완료!"
else
    echo ">>> [에러] 배포 실패. SSH 접속 및 서버 상태를 확인하세요."
    exit 1
fi
