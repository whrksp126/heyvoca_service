# CLAUDE.md — heyvoca_back

heyvoca_service 모노레포의 Flask 백엔드. `heyvoca_service/` 루트에서 통합 compose로 실행.

## Commands

모든 명령은 `heyvoca_service/` 루트에서 실행:

```bash
# 로컬 개발 환경 실행 (전체 스택: front + back + nginx + mysql + redis)
docker compose -f docker-compose.local.yml up --build -d

# 로그 확인
docker logs -f heyvoca_back_local

# 컨테이너 내부 진입
docker exec -it heyvoca_back_local sh

# 종료
docker compose -f docker-compose.local.yml down
```

### 서버 배포 (heyvoca_service/ 루트에서)
```bash
./deploy.sh dev    # dev 배포
./deploy.sh stg    # stg 배포
./deploy.sh prod   # prod 배포
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

| Env   | Compose file              | Port | URL                                   |
|-------|---------------------------|------|---------------------------------------|
| local | docker-compose.local.yml  | 5003 | http://{YOUR_LOCAL_IP}:5003           |
| dev   | docker-compose.dev.yml    | 5000 | https://dev-heyvoca-back.ghmate.com   |
| stg   | docker-compose.stg.yml    | 5000 | https://stg-heyvoca-back.ghmate.com   |
| prod  | docker-compose.yml        | 5000 | https://heyvoca-back.ghmate.com       |

## Key Environment Variables
- `FLASK_CONFIG` – `local` | `development` | `staging` | `production`
- `REDIS_HOST`, `REDIS_PORT`
- `APPLE_SHARED_SECRET`, `APPLE_APP_STORE_CONNECT_KEY_ID`, `APPLE_APP_STORE_CONNECT_ISSUER_ID`, `APPLE_APP_STORE_CONNECT_PRIVATE_KEY`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_KEY`
- Firebase 서비스 계정 키
