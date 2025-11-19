### 로컬(local) 개발 환경

## 컨테이너 중지(필요시)
docker stop heyvoca_front_local

## 컨테이너 삭제(필요시)
docker rm heyvoca_front_local

## 이미지 삭제(필요시)
docker rmi whrksp126/heyvoca_front:local

## 로컬 환경 실행
docker compose -f docker-compose.local.yml up --build

## 로컬 환경 실행 (백그라운드)
docker compose -f docker-compose.local.yml up --build -d

## 로컬 환경의 이미지 확인
docker images | grep heyvoca_front

## 도커 허브에 local 태그로 푸쉬
docker push whrksp126/heyvoca_front:local

---

### 데브(dev) 개발 환경

## 컨테이너 중지(필요시)
docker stop heyvoca_front_dev

## 컨테이너 삭제(필요시)
docker rm heyvoca_front_dev

## 이미지 삭제(필요시)
docker rmi whrksp126/heyvoca_front:dev

## 데브 환경 실행
docker compose -f docker-compose.dev.yml up --build

## 데브 환경 실행 (백그라운드)
docker compose -f docker-compose.dev.yml up --build -d

## 데브 환경 실행 컨테이너 중지
docker compose -f docker-compose.dev.yml down

## dev 환경의 이미지 확인
docker images | grep heyvoca_front

## 도커 허브에 dev 태그로 푸쉬
docker push whrksp126/heyvoca_front:dev

## 서버 적용
sudo systemctl restart heyvoca_front_dev

---

### 스테이징(stg) 개발 환경

## 컨테이너 중지(필요시)
docker stop heyvoca_front_stg

## 컨테이너 삭제(필요시)
docker rm heyvoca_front_stg

## 이미지 삭제(필요시)
docker rmi whrksp126/heyvoca_front:stg

## 데브 환경 실행
docker compose -f docker-compose.stg.yml up --build

## 데브 환경 실행 (백그라운드)
docker compose -f docker-compose.stg.yml up --build -d

## 데브 환경 실행 컨테이너 중지
docker compose -f docker-compose.stg.yml down

## stg 환경의 이미지 확인
docker images | grep heyvoca_front

## 도커 허브에 local 태그로 푸쉬
docker push whrksp126/heyvoca_front:stg

## 서버 적용
sudo systemctl restart heyvoca_front_stg

---

### 프로덕션(prod) 환경

## 컨테이너 중지(필요시)
docker stop heyvoca_front_prod

## 컨테이너 삭제(필요시)
docker rm heyvoca_front_prod

## 이미지 삭제(필요시)
docker rmi whrksp126/heyvoca_front:prod

## 프로덕션 환경 실행
docker compose -f docker-compose.yml up --build

## 프로덕션 환경 실행 (백그라운드)
docker compose -f docker-compose.yml up --build -d

## 프로덕션 환경 실행 컨테이너 중지
docker compose -f docker-compose.yml down

## prod 환경의 이미지 확인
docker images | grep heyvoca_front

## 도커 허브에 prod 태그로 푸쉬
docker push whrksp126/heyvoca_front:prod

## 서버 적용
sudo systemctl restart heyvoca_front_prod

---














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


# 컨테이너 실행 (백그라운드 모드)
docker compose -f docker-compose.local.yml up -d

# 컨테이너 중지
docker compose -f docker-compose.local.yml down

# 로그 보기
docker compose -f docker-compose.local.yml logs -f

# 컨테이너 재시작
docker compose -f docker-compose.local.yml restart
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

```
 개발 도중 패키지를 업데이트해야 할 경우
# 1️⃣ 컨테이너 내부에서 패키지 설치
docker-compose exec front-end npm install some-package
(docker-compose -f docker-compose.local.yml exec front-end npm install some-package)

# 2️⃣ 변경된 package.json & package-lock.json을 Git에 반영
git add package.json package-lock.json
git commit -m "Add some-package"
git push origin local

# 3️⃣ Docker Hub에 최신 node_modules 포함된 이미지 푸시
docker commit heyvoca_front_local whrksp126/heyvoca_front:local
docker push whrksp126/heyvoca_front:local
```

```
다른 개발자가 최신 패키지를 반영하는 방법
git pull
docker pull whrksp126/heyvoca_front:local
docker-compose -f docker-compose.local.yml up -d
```




✅ 1️⃣ 로컬 (local) 개발 환경
개발자가 자신의 PC에서 실행하여 테스트하는 환경
Vite 개발 서버 실행 (npm run dev)
docker-compose.local.yml 사용
# 로컬 개발 환경 실행 (핫 리로드 지원)
docker compose -f docker-compose.local.yml up --build -d

# 현재 실행 중인 컨테이너 확인
docker ps

# 실행된 이미지 확인
docker images | grep heyvoca_front

# 개발이 끝나면, 도커 허브에 local 태그로 푸쉬
docker push whrksp126/heyvoca_front:local
✅ 로컬에서 개발 후, 필요하면 Docker Hub에 올려서 공유 가능!

✅ 2️⃣ 개발 (dev) 서버 배포

# dev 환경의 이미지 확인
docker images | grep heyvoca_front

# 컨테이너 중지(필요시)
docker stop heyvoca_front_dev

# 컨테이너 삭제(필요시)
docker rm heyvoca_front_dev

# 이미지 삭제(필요시)
docker rmi whrksp126/heyvoca_front:dev

# dev 환경 빌드 및 실행
docker compose -f docker-compose.dev.yml up --build -d

# dev 환경의 이미지 확인
docker images | grep heyvoca_front


# dev 태그로 Docker Hub에 푸쉬
docker push whrksp126/heyvoca_front:dev

# dev 서버에서 최신 이미지 다운로드 및 실행
docker pull whrksp126/heyvoca_front:dev

docker run -d --name heyvoca_front_dev -p 3002:3000 whrksp126/heyvoca_front:dev


sudo systemctl restart heyvoca_front_dev

# 로그 확인
docker logs -f heyvoca_front_dev

✅ 개발 서버 (http://dev-heyvoca-front.ghmate.com)에서 정상 동작 확인!

✅ 3️⃣ 스테이징 (stg) 서버 배포
운영과 동일한 방식으로 배포 (Nginx)
docker-compose.stg.yml 사용
3001 포트로 실행
# stg 환경 빌드 및 실행
docker compose -f docker-compose.stg.yml up --build -d

# stg 환경의 이미지 확인
docker images | grep heyvoca_front

# stg 태그로 Docker Hub에 푸쉬
docker push whrksp126/heyvoca_front:staging

# stg 서버에서 최신 이미지 다운로드 및 실행
docker pull whrksp126/heyvoca_front:staging
docker run -d --name heyvoca_front_stg -p 3001:80 whrksp126/heyvoca_front:staging
sudo systemctl restart heyvoca_front_stg
✅ 스테이징 서버 (https://stg-heyvoca-front.ghmate.com)에서 정상 동작 확인!

✅ 4️⃣ 운영 (main) 서버 배포
실제 서비스가 운영되는 프로덕션 서버 (heyvoca.ghmate.com)
docker-compose.yml 사용
80 포트로 실행
# main 환경 빌드 및 실행
docker compose -f docker-compose.yml up --build -d

# main 환경의 이미지 확인
docker images | grep heyvoca_front

# main 태그로 Docker Hub에 푸쉬
docker push whrksp126/heyvoca_front:main

# main 서버에서 최신 이미지 다운로드 및 실행
docker pull whrksp126/heyvoca_front:main
sudo systemctl restart heyvoca_front
✅ 운영 서버 (https://heyvoca-front.ghmate.com)에서 정상 동작 확인!