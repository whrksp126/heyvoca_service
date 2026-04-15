# HeyVoca 로컬 개발 환경 가이드

## 사전 준비

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) 설치 및 실행 중
- Mac 기준 (Windows 미지원)

---

## 1. 레포 클론

```bash
git clone https://github.com/whrksp126/heyvoca_service.git
cd heyvoca_service
```

> React Native 앱은 별도 레포: `github.com/whrksp126/heyvoca`

---

## 2. 환경 파일 준비

아래 파일들은 git에 포함되지 않으므로 **구글 공유 드라이브에서 받아** 직접 배치합니다.

| 파일 경로 | 용도 |
|-----------|------|
| `heyvoca_back/.env.local` | 백엔드 환경변수 (DB URL, JWT 시크릿, API 키 등) |
| `heyvoca_front/.env.local` | 프론트 환경변수 (`VITE_BACKEND_URL` 등) |
| `heyvoca_back/app/routes/heyvoca-466916-e70bf3dad372.json` | Google Play 서비스 계정 키 |

---

## 3. DB 덤프 파일 준비

구글 공유 드라이브에서 최신 DB 덤프 파일을 받아 아래 경로에 넣습니다.

```
heyvoca_service/
└── db/
    └── backups/
        └── full_20260311.sql   ← 여기
```

---

## 4. 첫 실행

### 4-1. Docker 전체 스택 빌드 & 실행

`heyvoca_service/` 루트에서:

```bash
docker compose -f docker-compose.local.yml up --build -d
```

### 4-2. DB 초기 데이터 복원 (최초 1회)

```bash
docker exec -i heyvoca_mysql_local bash -c "mysql -u root -pGhmateRootMySQL\!@34 heyvoca" < db/backups/full_20260311.sql
```

> `!` 때문에 반드시 위 형식 그대로 사용. 일반 `-p` 방식으로 하면 에러.

### 4-3. DB 마이그레이션 기준점 설정 (최초 1회)

DB 복원 직후 한 번만 실행:

```bash
docker exec heyvoca_back_local flask db stamp head
```

이 명령어는 "현재 DB가 이미 최신 마이그레이션 상태임"을 표시합니다.  
이후 새 마이그레이션이 생기면 컨테이너 재시작 시 자동으로 적용됩니다.

---

## 5. 접속 확인

내부 IP 확인:
```bash
ipconfig getifaddr en0
```

| 서비스 | 주소 |
|--------|------|
| 웹 프론트 | `http://{내부IP}:3100` |
| 백엔드 API | `http://{내부IP}:5100` |
| MySQL | `localhost:3310` (user: voca / pw: voca!@34) |
| Redis | `localhost:6380` |

---

## 일상 개발

### IP가 바뀌었을 때 (Wi-Fi 변경 등)

```bash
bash /path/to/heyvoca/local-setup.sh
```

스크립트가 IP 감지 → `.env.local` 업데이트 → Docker 재시작까지 자동 처리.

### 로그 확인

```bash
docker logs -f heyvoca_front_local
docker logs -f heyvoca_back_local
```

### 종료

```bash
docker compose -f docker-compose.local.yml down
```

---

## DB 스키마 변경이 생겼을 때 (git pull 후)

팀원이 `models.py`를 수정하고 마이그레이션 파일을 push했다면:

```bash
git pull
docker restart heyvoca_back_local
```

컨테이너 재시작 시 자동으로 `flask db upgrade`가 실행되어 스키마가 적용됩니다.  
별도로 명령어를 실행할 필요 없습니다.

---

## 내가 DB 스키마를 변경할 때

```bash
# 1. heyvoca_back/app/models/models.py 수정

# 2. 마이그레이션 파일 생성 + 로컬 DB 적용
docker exec heyvoca_back_local flask db migrate -m "변경 내용 한 줄 설명"
docker exec heyvoca_back_local flask db upgrade

# 3. git commit (migrations/ 폴더 반드시 포함)
git add heyvoca_back/migrations/
git commit -m "db: 변경 내용 설명"
git push
```

> `migrations/` 폴더를 commit하지 않으면 팀원에게 변경사항이 전달되지 않습니다.
