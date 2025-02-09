# HeyVoca Front-end

HeyVoca의 프론트엔드 프로젝트입니다. React와 Vite를 기반으로 하며, Docker를 통해 개발 환경을 제공합니다.

## 기술 스택

- React
- Vite
- Docker
- Tailwind CSS
- Node.js v20

## 로컬 개발 환경 설정

### 사전 요구사항

- Docker Desktop 설치
- Git

### 시작하기

1. 프로젝트 클론
```bash
git clone [repository-url]
cd heyvoca_front
```

2. 환경 변수 파일 생성
- 프로젝트 루트에 `.env.local` 파일을 생성하고 아래 내용을 추가합니다:
```bash
NODE_ENV=local
VITE_BACKEND_URL=http://localhost:3000
```

3. 도커 개발 서버 실행
```bash
# 도커 이미지 빌드 및 컨테이너 실행
docker compose -f docker-compose.local.yml up --build
```

4. 브라우저에서 확인
- http://localhost:3000 접속

### 개발 시 참고사항

- 소스 코드 수정 시 자동으로 변경사항이 반영됩니다 (Hot Reload)
- `node_modules`는 도커 컨테이너 내부의 것을 사용하므로 로컬에 설치할 필요가 없습니다
- 컨테이너 로그는 터미널에서 실시간으로 확인 가능합니다

### 자주 발생하는 문제 해결

1. 포트 충돌이 발생하는 경우
```bash
# 실행 중인 도커 컨테이너 확인
docker ps

# 충돌하는 컨테이너 중지
docker stop [container-id]
```

2. 컨테이너 재시작이 필요한 경우
```bash
# 컨테이너 중지
docker compose -f docker-compose.local.yml down

# 컨테이너 재시작
docker compose -f docker-compose.local.yml up
```

3. 이미지를 완전히 새로 빌드해야 하는 경우
```bash
# 캐시 없이 새로 빌드
docker compose -f docker-compose.local.yml build --no-cache
docker compose -f docker-compose.local.yml up
```

### 도커 컨테이너 종료
```bash
# Ctrl + C 로 실행 중인 프로세스 종료
# 또는
docker compose -f docker-compose.local.yml down
```

## 프로젝트 구조

```
heyvoca_front/
├── src/               # React 소스 코드
│   ├── components/    # 컴포넌트
│   ├── pages/        # 페이지
│   └── utils/        # 유틸리티 함수
├── public/           # 정적 파일
├── Dockerfile        # 도커 이미지 설정
├── docker-compose.*.yml  # 환경별 도커 설정
├── .env.local        # 로컬 환경 변수
└── vite.config.js    # Vite 설정
```

## 주의사항

- 로컬 개발은 반드시 `docker-compose.local.yml`을 사용해주세요
- 환경변수는 `.env.local` 파일에 설정해주세요
- 의존성 패키지 추가 시 컨테이너를 재시작해야 합니다

## 유용한 도커 명령어

```bash
# 컨테이너 로그 확인
docker logs heyvoca_front_local

# 컨테이너 쉘 접속
docker exec -it heyvoca_front_local sh

# 사용하지 않는 도커 리소스 정리
docker system prune
```