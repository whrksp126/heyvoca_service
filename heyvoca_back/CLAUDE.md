# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# 로컬 개발 환경 실행 (포트 5003)
docker compose -f docker-compose.local.yml up --build

# 백그라운드 실행
docker compose -f docker-compose.local.yml up --build -d

# 컨테이너 중지
docker compose -f docker-compose.local.yml down

# 로그 확인
docker logs -f heyvoca_back_local

# 컨테이너 내부 진입
docker exec -it heyvoca_back_local sh
```

### Docker Hub 이미지 푸시
```bash
docker push whrksp126/heyvoca_back:local   # local
docker push whrksp126/heyvoca_back:dev     # dev
docker push whrksp126/heyvoca_back:stg     # stg
docker push whrksp126/heyvoca_back:prod    # prod
```

### 서버 적용
```bash
sudo systemctl restart heyvoca_back_dev    # dev
sudo systemctl restart heyvoca_back_stg    # stg
sudo systemctl restart heyvoca_back_prod   # prod
```

## Architecture

Flask 앱 팩토리 패턴. `run.py` → `app/__init__.py`의 `create_app()`으로 실행.

### Route Blueprints (`app/routes/`)
- `auth.py` – 소셜 로그인(Google/Apple), JWT 세션 관리
- `search.py` – 단어 검색
- `tts.py` – Google Text-to-Speech
- `fcm.py` – Firebase Cloud Messaging 푸시 알림
- `purchase.py` – 인앱결제 영수증 검증 (App Store / Google Play)
- `drive.py` – Google Drive 연동
- `user_voca_book.py`, `voca_books.py`, `voca_indexs.py` – 단어장 관리
- `mainpage.py`, `ocr.py`, `version.py`, `common.py`

### Key Services
- **DB**: SQLAlchemy + MySQL (`app/models/`)
- **Cache**: Redis (`REDIS_HOST`, `REDIS_PORT`)
- **Scheduler**: APScheduler (백그라운드 작업)
- **Config**: `config.py` – `FLASK_CONFIG` 환경변수로 local/development/staging/production 전환

### In-App Purchase Flow
1. 앱 → 결제 완료 후 영수증 → `/purchase/verify`
2. Apple/Google 서버에서 영수증 검증
3. 중복 거래 ID 확인
4. `purchase` 테이블 기록 저장
5. 사용자 `gem_cnt` 업데이트

## Environments

| Env  | Branch  | Compose file              | Port |
|------|---------|---------------------------|------|
| local | local  | docker-compose.local.yml  | 5003 |
| dev  | dev     | docker-compose.dev.yml    | 5000 |
| stg  | staging | docker-compose.stg.yml    | 5000 |
| prod | main    | docker-compose.yml        | 5000 |

**Git 흐름:** `local` → `dev` → `staging` → `main`

## Key Environment Variables
- `FLASK_CONFIG` – `local` | `development` | `staging` | `production`
- `REDIS_HOST`, `REDIS_PORT`
- `APPLE_SHARED_SECRET`, `APPLE_APP_STORE_CONNECT_KEY_ID`, `APPLE_APP_STORE_CONNECT_ISSUER_ID`, `APPLE_APP_STORE_CONNECT_PRIVATE_KEY`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_KEY`
- Firebase 서비스 계정 키
