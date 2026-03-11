#!/bin/bash

# 배포 자동화 스크립트
# 사용법: ./deploy.sh [dev|stg|prod]
#
# local 실행은 deploy.sh를 사용하지 않습니다.
# 로컬 실행: docker compose -f docker-compose.local.yml up --build -d

ENV=$1

# ─── 서버 접속 정보 ───
SSH_KEY="$HOME/.ssh/ghmate_server"
SSH_USER="ghmate"
SSH_HOST="ghmate.iptime.org"
SSH_PORT="222"
REMOTE_DIR="/srv/projects/heyvoca"

# 입력 인자 확인
if [[ -z "$ENV" ]]; then
    echo "사용법: ./deploy.sh [dev|stg|prod]"
    exit 1
fi

# 환경별 설정
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

# 1. 이미지 빌드
echo ">>> (1/3) 이미지 빌드 중..."
docker compose -f "$COMPOSE_FILE" build --no-cache
if [ $? -ne 0 ]; then
    echo ">>> [에러] 빌드 실패."
    exit 1
fi

# 2. 도커 허브 푸시
echo ">>> (2/3) Docker Hub 푸시 중..."
docker compose -f "$COMPOSE_FILE" push
if [ $? -ne 0 ]; then
    echo ">>> [에러] 이미지 푸시 실패."
    exit 1
fi

# 3. 서버에서 최신 이미지 pull & 재시작
echo ">>> (3/3) 서버 배포 중..."
ssh -i "$SSH_KEY" -p "$SSH_PORT" "${SSH_USER}@${SSH_HOST}" \
    "cd ${REMOTE_DIR} && \
     docker compose -p ${PROJECT_NAME} -f ${COMPOSE_FILE} pull front back && \
     docker compose -p ${PROJECT_NAME} -f ${COMPOSE_FILE} up -d --no-build front back"

if [ $? -eq 0 ]; then
    echo ">>> [$ENV] 배포 완료!"
else
    echo ">>> [에러] 서버 배포 실패. SSH 접속 및 서버 상태를 확인하세요."
    exit 1
fi
