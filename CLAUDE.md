# CLAUDE.md — heyvoca_service

heyvoca 서비스 모노레포. 웹 프론트, 백엔드, 인프라를 통합 관리.

## 프로젝트 구조

```
heyvoca_service/
├── heyvoca_front/        # Vite/React 웹 프론트
├── heyvoca_back/         # Flask 백엔드
├── nginx/                # 로컬 nginx 설정
├── nginx-proxy/          # 서버용 글로벌 nginx (배포 전용)
├── db/backups/           # DB 백업 (git 제외)
├── docker-compose.local.yml
├── docker-compose.dev.yml
├── docker-compose.stg.yml
├── docker-compose.yml    # prod
├── deploy.sh             # 배포 자동화 (dev/stg/prod)
└── SETUP.md              # 팀원 셋업 가이드
```

## 로컬 실행 (heyvoca_service/ 에서)

```bash
docker compose -f docker-compose.local.yml up --build -d

# 로그
docker compose -f docker-compose.local.yml logs -f

# 종료
docker compose -f docker-compose.local.yml down
```

## 서버 배포

```bash
./deploy.sh dev    # dev 배포 (빌드 → 푸시 → 서버 적용)
./deploy.sh stg    # stg 배포
./deploy.sh prod   # prod 배포
```

## 로컬 접속 주소

| 서비스 | 주소 |
|--------|------|
| 웹 프론트 | http://{YOUR_LOCAL_IP} |
| 백엔드 API | http://{YOUR_LOCAL_IP}:5003 |
| MySQL | localhost:3307 |

## 서버 환경별 도메인

| 환경 | 프론트 | 백엔드 |
|------|--------|--------|
| dev  | https://dev-heyvoca-front.ghmate.com | https://dev-heyvoca-back.ghmate.com |
| stg  | https://stg-heyvoca-front.ghmate.com | https://stg-heyvoca-back.ghmate.com |
| prod | https://heyvoca-front.ghmate.com | https://heyvoca-back.ghmate.com |

## Git

- 레포: `github.com/whrksp126/heyvoca_service`
- 브랜치: `main`
