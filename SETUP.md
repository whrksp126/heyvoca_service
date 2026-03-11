# HeyVoca 로컬 개발 환경 가이드

## 사전 준비

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) 설치 및 실행 중

---

## 1. 레포 클론

```bash
git clone https://github.com/whrksp126/heyvoca_service.git
cd heyvoca_service
```

> 앱(React Native)은 별도 레포: `github.com/whrksp126/heyvoca`

---

## 2. 환경 파일 준비

아래 파일들은 git에 포함되지 않으므로 **처음 셋업 시 직접 생성**해야 합니다.
파일 내용은 구글 공유 드라이브에서 공유받으세요.

| 파일 경로 | 용도 |
|-----------|------|
| `heyvoca_back/.env.local` | 백엔드 환경변수 (DB URL, JWT 시크릿, API 키 등) |
| `heyvoca_front/.env.local` | 프론트 환경변수 (`VITE_BACKEND_URL` 등) |
| `heyvoca_back/app/routes/heyvoca-466916-e70bf3dad372.json` | Google Play 서비스 계정 키 |

### 내부 IP 설정

`.env.local` 파일 내 URL에는 **본인 내부 IP**를 입력해야 합니다.

```bash
# 내부 IP 확인
ipconfig getifaddr en0
```

- `heyvoca_back/.env.local` → `FRONT_END_URL=http://{내부IP}`
- `heyvoca_front/.env.local` → `VITE_BACKEND_URL=http://{내부IP}:5003`

---

## 3. DB 덤프 파일 준비

구글 공유 드라이브에서 DB 덤프 파일(`full_YYYYMMDD.sql`)을 받아 아래 경로에 넣습니다.

```
heyvoca_service/
└── db/
    └── backups/
        └── full_YYYYMMDD.sql   ← 여기
```

---

## 4. 로컬 실행

`heyvoca_service/` 루트에서 실행:

```bash
docker compose -f docker-compose.local.yml up --build -d
```

---

## 5. DB 초기 데이터 복원 (최초 1회)

```bash
docker exec -i heyvoca_mysql_local mysql -u root -prootpassword heyvoca < db/backups/full_YYYYMMDD.sql
```

---

## 6. 접속 확인

| 서비스 | 주소 |
|--------|------|
| 웹 프론트 | `http://{내부IP}` |
| 백엔드 API | `http://{내부IP}:5003` |
| MySQL | `localhost:3307` (user: voca / pw: voca!@34) |

---

## 일상 개발

### 로그 확인

```bash
# 전체 실시간 로그
docker compose -f docker-compose.local.yml logs -f

# 서비스별 로그
docker logs -f heyvoca_front_local
docker logs -f heyvoca_back_local
```

### 종료

```bash
docker compose -f docker-compose.local.yml down
```

### 코드 변경 후 재빌드

```bash
docker compose -f docker-compose.local.yml up --build -d
```

---

## IP가 바뀌었을 때

```bash
# 1. 새 IP 확인
ipconfig getifaddr en0

# 2. 아래 두 파일의 IP 업데이트
#    heyvoca_back/.env.local  → FRONT_END_URL
#    heyvoca_front/.env.local → VITE_BACKEND_URL

# 3. 재시작
docker compose -f docker-compose.local.yml down
docker compose -f docker-compose.local.yml up --build -d
```
