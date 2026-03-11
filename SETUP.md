# HeyVoca 로컬 개발 환경 가이드

## 사전 준비

- Docker Desktop 설치 및 실행 중
---

## 형상관리에 포함되지 않는 파일

아래 파일들은 git에 포함되지 않으므로 **처음 셋업 시 직접 생성**해야 합니다.
파일 내용은 구글 공유 드라이브에서 공유받으세요.

| 파일 | 용도 |
|------|------|
| `heyvoca_back/.env.local` | 백엔드 로컬 환경변수 (DB URL, API 키 등) |
| `heyvoca_front/.env.local` | 프론트 로컬 환경변수 (백엔드 URL 등) |
| `heyvoca_app/.env.local` | 앱 로컬 환경변수 (서버 URL 등) |
| `heyvoca_back/app/routes/heyvoca-466916-e70bf3dad372.json` | Google Play 서비스 계정 키 |
| `heyvoca_app/android/app/google-services.json` | Firebase Android 설정 |
| `heyvoca_app/ios/GoogleService-Info.plist` | Firebase iOS 설정 |

> `.env.local` 파일에는 본인 **내부 IP**를 넣어야 합니다.
> IP 확인: `ipconfig getifaddr en0`
> IP가 바뀔 때마다 업데이트하세요.

---

## 로컬 실행

```bash
# 프로젝트 루트에서
docker compose -f docker-compose.local.yml up --build -d
```

최초 실행 시 DB 초기 데이터가 없으므로 구글 공유 드라이브에서 덤프 파일을 받아 아래 명령어로 복원하세요.

```bash
docker exec -i heyvoca_mysql_local mysql -u root -prootpassword heyvoca < {덤프파일.sql}
```

---

## 로그 확인

```bash
# 전체 로그 (실시간)
docker compose -f docker-compose.local.yml logs -f

# 서비스별 로그
docker logs -f heyvoca_front_local
docker logs -f heyvoca_back_local
docker logs -f heyvoca_mysql_local
```

---

## 종료

```bash
docker compose -f docker-compose.local.yml down
```

---