# CLAUDE.md — heyvoca_service

heyvoca 영어 단어 학습 서비스 모노레포. Vite/React 웹 프론트, Flask 백엔드, Docker 인프라를 통합 관리.

---

## 프로젝트 구조

```
heyvoca_service/
├── heyvoca_front/        # Vite/React 18 웹 프론트
├── heyvoca_back/         # Flask 2.0 백엔드
├── nginx/                # 로컬 nginx 설정
├── nginx-proxy/          # 서버용 글로벌 nginx (배포 전용)
├── db/backups/           # DB 백업 (git 제외)
├── dummy_vocalist/       # 더미 단어 JSON 데이터 (30일×4카테고리)
├── docker-compose.local.yml
├── docker-compose.dev.yml
├── docker-compose.stg.yml
├── docker-compose.yml    # prod
├── deploy.sh             # 배포 자동화 (dev/stg/prod)
└── SETUP.md              # 팀원 셋업 가이드
```

---

## 프론트엔드 (heyvoca_front/)

### 기술 스택

| 항목 | 기술 |
|------|------|
| 프레임워크 | React 18.3 + Vite 6.2 |
| 라우팅 | React Router v7 |
| CSS | Tailwind CSS 3.4 + PostCSS |
| 애니메이션 | Framer Motion 12, Lottie |
| 아이콘 | @phosphor-icons/react |
| 상태관리 | Context API (전역 5개 Context) |
| 외부 서비스 | Firebase (소셜 로그인 연동) |
| 빌드 최적화 | React Compiler (`"use memo"` annotation 모드) |

### src/ 구조

```
src/
├── api/              # API 클라이언트 (auth, study, voca, bookStore 등)
├── components/       # UI 컴포넌트
│   ├── common/           # 공용 컴포넌트
│   ├── newBottomSheet/   # 바텀시트 모달 시스템 (32+개)
│   ├── newfullsheet/     # 풀스크린 모달 시스템 (18+개)
│   ├── home/             # 홈페이지
│   ├── login/            # 로그인
│   ├── bookStore/        # 서점
│   ├── vocabularySheets/ # 단어장
│   ├── class/            # 학습
│   ├── takeTest/         # 테스트
│   ├── myPage/           # 마이페이지
│   ├── initialProfile/   # 초기 프로필 설정
│   └── Layout.jsx        # 메인 레이아웃
├── context/          # 전역 상태
│   ├── UserContext.jsx           # 사용자 인증 & 상태
│   ├── VocabularyContext.jsx      # 단어장 상태
│   ├── ThemeContext.jsx           # 다크모드
│   ├── NewBottomSheetContext.jsx  # 바텀시트 레이어링
│   ├── NewFullSheetContext.jsx    # 풀스크린 모달 레이어링
│   ├── OverlayContext.jsx         # 오버레이
│   └── GemAnimationContext.jsx   # 보석 애니메이션
├── hooks/            # 커스텀 훅 (useNewBottomSheet, useNewFullSheet)
├── pages/            # 라우트별 페이지 컴포넌트
│   ├── Home.jsx, Login.jsx, InitialProfile.jsx
│   ├── BookStore.jsx, VocabularySheets.jsx
│   ├── Class.jsx, TakeTest.jsx, myPage.jsx
│   └── Index.jsx
├── utils/
├── assets/
├── App.jsx
└── main.jsx
```

### 환경변수 (heyvoca_front/.env.*)

```
VITE_BACKEND_URL=http://{IP}:5100   # 백엔드 API URL
VITE_ENV=local|development|staging|production
VITE_DEBUG=true|false
VITE_FIREBASE_*                      # Firebase 설정
```

### Vite 설정 포인트
- HMR: local은 `ws://localhost:3100`, dev/stg/prod는 `wss://{도메인}:443`
- 내부 포트: `3000`, path alias: `@` → `./src`

---

## 백엔드 (heyvoca_back/)

### 기술 스택

| 항목 | 기술 |
|------|------|
| 프레임워크 | Flask 2.0.3 + gunicorn 20.1.0 |
| ORM | SQLAlchemy 1.4 + Flask-SQLAlchemy 2.5 |
| DB | MySQL 8.0 (PyMySQL 드라이버) |
| 캐시 | Redis (Flask-Caching 2.1) |
| 인증 | Flask-Login + PyJWT (access/refresh 토큰) |
| 소셜 로그인 | Google OAuth, Apple Sign In |
| 푸시 알림 | Firebase Admin SDK + pyfcm (APScheduler) |
| 인앱결제 | App Store Connect API, Google Play (서비스 계정) |
| 기타 | gTTS (발음), Google Drive API, pandas/openpyxl |
| 베이스 이미지 | ubuntu:20.04 (Python 3, TZ=Asia/Seoul) |

### 디렉토리 구조

```
heyvoca_back/
├── app/
│   ├── __init__.py           # Flask 앱 팩토리 (create_app)
│   ├── login_manager.py      # Flask-Login 설정
│   ├── models/
│   │   └── models.py         # SQLAlchemy 모델 26개
│   ├── routes/               # Blueprint 라우트
│   │   ├── auth.py           # 소셜 로그인, JWT (38KB)
│   │   ├── search.py         # 단어 검색 영/한 (12KB)
│   │   ├── tts.py            # Google TTS
│   │   ├── fcm.py            # FCM 푸시 알림 (15KB)
│   │   ├── purchase.py       # 인앱결제 영수증 검증 (19KB)
│   │   ├── drive.py          # Google Drive 업/다운로드 (25KB)
│   │   ├── user_voca_book.py # 사용자 단어장 CRUD (15KB)
│   │   ├── voca_books.py     # 단어장 API (29KB)
│   │   ├── voca_indexs.py    # 단어 인덱스
│   │   ├── mainpage.py       # 홈페이지 데이터, 목표 (25KB)
│   │   ├── ocr.py            # OCR
│   │   ├── version.py        # 앱 버전 정보
│   │   ├── common.py         # 공용 함수
│   │   └── dummy_dict.json   # 더미 단어 데이터 (533KB)
│   └── utils/
│       └── jwt_utils.py      # JWT 생성/검증
├── run.py                    # 진입점 (create_app, FLASK_RUN_PORT)
├── config.py                 # LocalConfig / DevelopmentConfig / StagingConfig / ProductionConfig
├── requirements.txt
├── Dockerfile.local / .dev / .stg / Dockerfile
└── .env.local / .env.dev / .env.stg / .env
```

### 주요 API 엔드포인트

| 라우트 파일 | 주요 엔드포인트 |
|------------|----------------|
| auth.py | `POST /google/oauth/app`, `POST /apple/oauth`, `POST /auth/refresh`, `POST /auth/logout` |
| search.py | `GET /en?word=`, `GET /ko?word=` |
| tts.py | `GET /tts?text=` |
| fcm.py | `POST /fcm/token`, `GET /fcm/scheduler` |
| purchase.py | `POST /purchase/verify` (iOS/Android 영수증 → 보석 지급) |
| drive.py | `POST /drive/upload`, `GET /drive/download` |
| user_voca_book.py | `POST/PUT/DELETE /user-voca-book/{id}`, 단어 추가 |
| voca_books.py | `GET /voca-books`, `GET /voca-books/{id}`, xlsx 다운로드 |
| mainpage.py | `GET /home`, `GET /goals`, `POST /goals/{id}/complete` |

### DB 모델 (models.py — 26개)

| 모델 | 설명 |
|------|------|
| User | 사용자 (UUID PK, google_id, apple_id, xp, gem_cnt, invite_code) |
| UserHasToken | FCM 토큰, 알림 설정 |
| InviteMap | 추천인-피추천인 관계 |
| Level | 사용자 레벨 정의 |
| VocaBook | 공용 단어장 |
| Voca | 단어 (word, pronunciation, verb_forms) |
| VocaMeaning / VocaExample | 단어 뜻/예문 |
| VocaBookMap / VocaMeaningMap / VocaExampleMap | 단어 관계 테이블 |
| Bookstore | 서점 (gem 가격, category, level_id) |
| DailySentence | 일일 문장 |
| UserVocaBook | 사용자 단어장 (UUID, color, memorized_word_cnt) |
| UserVoca | 사용자 단어 (SM2 학습 데이터 JSON) |
| UserVocaBookMap | 사용자 단어장-단어 관계 (voca_meanings, voca_examples JSON) |
| CheckIn | 출석 체크 |
| UserRecentStudy | 최근 학습 기록 (UUID, type: TEST/EXAM/TODAY, progress_index) |
| UserGoals / GoalType / Goals | 목표 시스템 |
| Product / Purchase / GemLog | 인앱결제 및 보석 로그 (Purchase: completed/refunded) |
| AdminVocaBook / AdminVocaBookMap | 관리자 단어장 |

### 환경변수 (heyvoca_back/.env.*)

```
FLASK_ENV=development|local|production
FLASK_CONFIG=local|development|staging|production
FLASK_RUN_PORT=5003          # run.py에서 읽음 (gunicorn은 0.0.0.0:5000)
DATABASE_URL=mysql+pymysql://voca:voca!@34@mysql:3306/heyvoca
FRONT_END_URL=http://{IP}:3100    # CORS origin
SECRET_KEY=...
ACCESS_SECRET=...            # JWT access token 시크릿
REFRESH_SECRET=...           # JWT refresh token 시크릿
ACCESS_TTL_SECONDS=3600
GOOGLE_WEB_CLIENT_ID=...
GOOGLE_ANDROID_CLIENT_ID=...
GOOGLE_IOS_CLIENT_ID=...
OAUTH_CLIENT_SECRET=...
APPLE_CLIENT_ID=com.ghmate.heyvoca
APPLE_SHARED_SECRET=...
APPLE_APP_STORE_CONNECT_ISSUER_ID=...
APPLE_APP_STORE_CONNECT_KEY_ID=...
APPLE_APP_STORE_CONNECT_PRIVATE_KEY=...
FCM_API_KEY=...
GOOGLE_PLAY_SERVICE_ACCOUNT_KEY=./app/routes/heyvoca-466916-e70bf3dad372.json
REDIS_HOST=redis
REDIS_PORT=6379
```

---

## Nginx (nginx/)

### local.conf 포트 매핑

| nginx listen | proxy_pass | 외부 노출 포트 | 설명 |
|-------------|-----------|--------------|------|
| 80 | front:3000 | 3100 | 프론트 (WebSocket HMR 포함) |
| 5003 | back:5000 | 5100 | 백엔드 API |

> docker-compose.local.yml에서 `3100:80`, `5100:5003`으로 매핑.

---

## Docker 환경

### 로컬 실행

```bash
# heyvoca_service/ 에서
docker compose -f docker-compose.local.yml up --build -d
docker compose -f docker-compose.local.yml logs -f
docker compose -f docker-compose.local.yml down
```

### 로컬 포트

| 서비스 | 외부 포트 |
|--------|-----------|
| nginx → front | 3100 |
| nginx → back | 5100 |
| mysql | 3310 |
| redis | 6380 |

### Docker 이미지 이름

| 서비스 | dev | stg | prod |
|--------|-----|-----|------|
| front | whrksp126/heyvoca_front:dev | whrksp126/heyvoca_front:stg | whrksp126/heyvoca_front:prod |
| back  | whrksp126/heyvoca_back:dev  | whrksp126/heyvoca_back:stg  | whrksp126/heyvoca_back:prod  |

### 환경별 front Dockerfile 차이

| 환경 | 방식 | 베이스 이미지 |
|------|------|------------|
| local / dev | Vite dev server (node:20-alpine) | 소스 볼륨 마운트 |
| stg / prod | 멀티스테이지 빌드 → nginx:1.27-alpine | 정적 파일 서빙 |

---

## 서버 배포

### 배포 방식 (환경별 차이)

#### dev — 서버에서 git pull 후 빌드

서버에 직접 SSH 접속 → git pull → 서버에서 이미지 빌드 후 실행.

```bash
./deploy.sh dev
```

내부 동작:
```bash
ssh 서버 "cd /srv/projects/heyvoca && git pull && \
  docker compose -p heyvoca_dev -f docker-compose.dev.yml up --build -d front back"
```

#### stg / prod — 로컬 이미지 빌드 후 Docker Hub 경유

로컬에서 이미지 빌드 → Docker Hub push → 서버에서 pull 후 실행.

```bash
./deploy.sh stg
./deploy.sh prod
```

내부 동작:
1. 로컬에서 이미지 빌드 (`docker compose build --no-cache`)
2. Docker Hub 푸시 (`docker compose push`)
3. SSH로 compose 파일 서버 전송 (`ssh "cat > file" < local_file`)
4. 서버에서 `docker compose pull front back && up -d --no-build`

---

### 서버 수동 실행 (프로젝트명 `-p` 필수)

```bash
# dev/stg를 같은 디렉토리에서 실행 시 컨테이너 충돌 방지
docker compose -p heyvoca_dev  -f docker-compose.dev.yml  up -d
docker compose -p heyvoca_stg  -f docker-compose.stg.yml  up -d
docker compose -p heyvoca_prod -f docker-compose.yml       up -d
```

### 서버 환경별 도메인

| 환경 | 프론트 | 백엔드 |
|------|--------|--------|
| dev  | https://dev-heyvoca-front.ghmate.com | https://dev-heyvoca-back.ghmate.com |
| stg  | https://stg-heyvoca-front.ghmate.com | https://stg-heyvoca-back.ghmate.com |
| prod | https://heyvoca-front.ghmate.com | https://heyvoca-back.ghmate.com |

### 서버 접속

```bash
ssh -i ~/.ssh/ghmate_server -p 222 ghmate@ghmate.iptime.org
# 프로젝트 경로: /srv/projects/heyvoca/
```

---

## Git

- 레포: `github.com/whrksp126/heyvoca_service`
- 브랜치: `main`
