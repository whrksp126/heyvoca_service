# HeyVoca 로컬 개발 환경 가이드

> **2026-05 업데이트**: DB 분리 작업으로 사전(`heyvoca_dict`)과 사용자(`heyvoca_user`) DB가 별도 schema로 분리되었습니다.
> 사전 데이터는 MinIO 기반 자동 동기화 + dump 수동 import 불필요.
> 기존 팀원이라면 [기존 환경 마이그레이션](#기존-환경-마이그레이션-기존-팀원-1회) 섹션 참조.

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
| `heyvoca_back/.env.local` | 백엔드 환경변수 (DB URL, JWT 시크릿, API 키, **MinIO RO 키** 등) |
| `heyvoca_front/.env.local` | 프론트 환경변수 (`VITE_BACKEND_URL` 등) |
| `heyvoca_back/app/routes/heyvoca-466916-e70bf3dad372.json` | Google Play 서비스 계정 키 |

`.env.local`에는 다음이 포함되어 있어야 합니다 (관리자가 채워서 전달):

```
DATABASE_URL=mysql+pymysql://voca:voca%21%4034@mysql:3306/heyvoca_user
DATABASE_URL_DICT=mysql+pymysql://voca:voca%21%4034@mysql:3306/heyvoca_dict
APP_ENV=local
DICT_AUTO_RESET=true
DICT_AUTO_RESET_ALLOW_PROD=false
MINIO_ENDPOINT=https://objectstore.ghmate.com
MINIO_BUCKET=heyvoca          # heyvoca 통합 버킷 (dict/ dump, tts/ 음성 폴더로 구분)
MINIO_DICT_RO_KEY=...   # 모든 팀원 공통 (read-only)
MINIO_DICT_RO_SECRET=...
# 사전 큐레이션 권한 있는 팀원만 추가 (write):
# MINIO_DICT_RW_KEY=...
# MINIO_DICT_RW_SECRET=...
```

---

## 3. 첫 실행

`heyvoca_service/` 루트에서:

```bash
docker compose -f docker-compose.local.yml up --build -d
```

기동 흐름 (전부 자동):

1. mysql 컨테이너 첫 기동 (fresh volume) → `db/init/`의 SQL이 알파벳 순으로 1회 자동 실행:
   - `01_create_schemas.sql` → `heyvoca_user`, `heyvoca_dict` 두 schema 생성.
   - `02_heyvoca_user_baseline.sql` → `heyvoca_user`를 현재 head 상태(테이블 19개 + 참조 데이터 + `alembic_version` 스탬프)로 부트스트랩.
2. back 컨테이너 entrypoint:
   - `dict_sync.py` 실행 → MinIO에서 최신 사전 dump 다운로드 → `heyvoca_dict`에 import.
   - `flask db upgrade --directory migrations_dict` → 사전 schema 마이그레이션 적용 (이미 최신이면 no-op).
   - `flask db upgrade` → 사용자 schema 마이그레이션 적용. baseline이 이미 head라 신규 마이그레이션이 없으면 no-op.
   - gunicorn 기동.
3. 끝. 단어 검색, 회원가입, 단어장 모두 동작.

> **사전(dict) dump 수동 import는 필요 없습니다.** 기존 `db/backups/full_*.sql` 절차는 폐기되었어요.
>
> ⚠️ **중요**: 사용자 DB의 첫 마이그레이션(`6c8175362eee`)은 구 단일 `heyvoca` schema를 전제로 한 drop/alter 마이그레이션이라 **빈 `heyvoca_user`에서는 동작하지 않습니다.** 그래서 빈 schema가 아니라 `02_heyvoca_user_baseline.sql`로 head 상태를 미리 깔아둡니다. baseline 없이 빈 DB로 `flask db upgrade`를 돌리면 `Table 'heyvoca_user.admin_voca_book_map' doesn't exist` 같은 에러로 부팅이 실패합니다.

### 트러블슈팅 — `flask db upgrade` 가 실패하며 컨테이너가 재시작 반복할 때

증상: back 로그에 `Running upgrade -> 6c8175362eee, initial schema` 이후
`Table 'heyvoca_user.xxx' doesn't exist` → `exited with code 1 (restarting)`.

원인: `heyvoca_user`가 baseline 없이 빈 상태/레거시 일부만 있는 dirty 상태. (예전 `full_*.sql`을 수동 import했거나, baseline 도입 전 볼륨)

해결 — volume을 리셋해 db/init이 다시 돌게 한다 (heyvoca_dict는 MinIO에서 자동 재동기화):

```bash
docker compose -f docker-compose.local.yml down -v   # 볼륨까지 삭제
docker compose -f docker-compose.local.yml up --build -d
```

볼륨 전체를 날리기 싫다면 `heyvoca_user`만 baseline으로 재구성:

```bash
docker exec heyvoca_mysql_local bash -c \
  'mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "DROP DATABASE IF EXISTS heyvoca_user; CREATE DATABASE heyvoca_user CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL ON heyvoca_user.* TO \"voca\"@\"%\"; FLUSH PRIVILEGES;"'
docker exec -i heyvoca_mysql_local bash -c \
  'mysql -u root -p"$MYSQL_ROOT_PASSWORD"' < db/init/02_heyvoca_user_baseline.sql
docker compose -f docker-compose.local.yml restart back
```

### (선택) 시드 사용자 데이터

회원가입/학습 흐름을 빠르게 테스트하려면 익명화된 테스트 계정 시드:

```bash
docker exec heyvoca_back_local flask seed test-users --count 10
```

→ `test1@example.com` 같은 더미 계정 N개 + 기본 단어장 1개씩 생성.

---

## 4. 접속 확인

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

DB 확인:
```bash
docker exec heyvoca_mysql_local mysql -u voca -p"voca!@34" -e "SHOW DATABASES;"
# heyvoca_dict, heyvoca_user 두 개 보여야 정상
```

---

## 일상 개발

### IP가 바뀌었을 때 (Wi-Fi 변경 등)

```bash
bash /path/to/heyvoca/local-setup.sh
```

### 로그 확인

```bash
docker logs -f heyvoca_back_local       # dict_sync 로그도 여기서 확인
docker logs -f heyvoca_front_local
```

### 종료

```bash
docker compose -f docker-compose.local.yml down
```

---

## git pull 후의 흐름 (자동 동기화)

다른 팀원이 사전 데이터/스키마/사용자 DB 모델을 변경했어도, 한 줄로 끝:

```bash
git pull
docker compose -f docker-compose.local.yml up -d --build back
```

back 컨테이너가 재기동되면서 자동으로:
- 사전 데이터: `dict_pointer.json`의 sha256이 바뀌었으면 MinIO에서 새 dump 받아 import.
- 사전 스키마: `migrations_dict/`에 신규 파일 있으면 자동 적용.
- 사용자 스키마: `migrations/`에 신규 파일 있으면 자동 적용.

별도 명령 없음.

---

## 내가 사용자 DB 스키마를 변경할 때

```bash
# 1. heyvoca_back/app/models/models.py에서 사용자 모델 수정 (User, Purchase 등)

# 2. 마이그레이션 파일 생성 + 로컬 적용
docker exec heyvoca_back_local flask db migrate -m "변경 내용 한 줄 설명"
docker exec heyvoca_back_local flask db upgrade

# 3. git commit
git add heyvoca_back/migrations/
git commit -m "db: 변경 내용 설명"
git push
```

---

## 내가 사전 DB 스키마를 변경할 때 (Voca, VocaBook 등)

`--directory migrations_dict` 플래그가 차이점:

```bash
# 1. heyvoca_back/app/models/models.py에서 사전 모델 수정 (__bind_key__='dict')

# 2. 사전 전용 마이그레이션 파일 생성 + 로컬 적용
docker exec heyvoca_back_local flask db migrate --directory migrations_dict -m "voca: 변경 설명"
docker exec heyvoca_back_local flask db upgrade --directory migrations_dict

# 3. (필요 시) 데이터 마이그레이션도 같이 → 사전 dump 발행
python scripts/dict_publish.py -m "voca difficulty 컬럼 추가 + 데이터 채움"

# 4. git commit (migrations_dict + db/dict 같이)
git add heyvoca_back/migrations_dict/ db/dict/
git commit -m "dict: 변경 내용"
git push
```

---

## 내가 사전 데이터만 갱신할 때 (단어 추가, 뜻 수정 등)

스키마 변경 없이 데이터만 변경 시:

```bash
# 1. 로컬 heyvoca_dict에 직접 변경 (mysql 클라이언트, admin 도구 등)

# 2. 사전 dump 발행 → MinIO 업로드 + dict_pointer.json 갱신
python scripts/dict_publish.py -m "토익 800점 단어 100개 추가"

# 3. git commit
git add db/dict/
git commit -m "dict: 토익 800점 단어 100개 추가"
git push
```

> 다른 팀원/dev/stg/prod는 git pull + 컨테이너 재시작만으로 자동 동기화됩니다.

> **MinIO RW 키가 필요합니다.** 사전 큐레이션 권한자만 실행 가능.

---

## 기존 환경 마이그레이션 (기존 팀원, 1회)

이미 단일 `heyvoca` schema로 운영 중인 팀원은 1회 이행 필요:

### 옵션 A: volume 초기화 (가장 깔끔, 로컬 사용자 데이터는 사라짐)

```bash
docker compose -f docker-compose.local.yml down
docker volume rm heyvoca_service_mysql_local_data
git pull
docker compose -f docker-compose.local.yml up -d --build
# → mysql 첫 기동: 두 schema 자동 생성 + heyvoca_user baseline(02_*.sql) 부트스트랩
# → back entrypoint: dict_sync로 사전 자동 import + flask db upgrade (baseline이 head라 no-op)
```

### 옵션 B: 데이터 보존 이행 (개인 테스트 데이터 유지)

```bash
git pull
docker compose -f docker-compose.local.yml up -d --build
bash scripts/migrate_to_split.sh local
# → 기존 heyvoca의 사용자 13개 테이블 → heyvoca_user 복사
# → 기존 heyvoca의 사전 11개 테이블 → heyvoca_dict 복사
# → flask db stamp head (양 디렉토리)
docker restart heyvoca_back_local
```

---

## 트러블슈팅

### `dict_sync` 로그에 "DATABASE_URL_DICT 환경변수 없음"

`.env.local`에 `DATABASE_URL_DICT` 없음. 위 [환경 파일 준비](#2-환경-파일-준비) 참고.

### `dict_sync` 로그에 "MinIO 환경변수 누락"

`.env.local`에 `MINIO_DICT_RO_KEY`/`MINIO_DICT_RO_SECRET` 없음. 관리자에게 키 받기.

### `dict_sync` 로그에 "pointer가 uninitialized 상태 → skip"

`db/dict/dict_pointer.json`이 아직 첫 사전 dump 발행 전 상태. Phase 0이 끝나면 정상 동작.
이 단계에서는 `heyvoca_dict`가 빈 상태로 시작 → 검색/단어장 기능이 동작하지 않음.

### `python scripts/dict_publish.py` 실행 시 403

MinIO RW 키 없음. 사전 큐레이션 권한자만 갖고 있음. 관리자에게 문의.
