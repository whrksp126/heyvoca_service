# CLAUDE.md — heyvoca_front

heyvoca_service 모노레포의 웹 프론트엔드. `heyvoca_service/` 루트에서 통합 compose로 실행.

## Commands

모든 명령은 `heyvoca_service/` 루트에서 실행:

```bash
# 로컬 개발 환경 실행 (전체 스택: front + back + nginx + mysql + redis)
docker compose -f docker-compose.local.yml up --build -d

# 로그 확인
docker logs -f heyvoca_front_local

# 컨테이너 내부 진입
docker exec -it heyvoca_front_local sh

# 종료
docker compose -f docker-compose.local.yml down
```

### 패키지 추가 시
```bash
# 컨테이너 내부에서 설치
docker compose -f docker-compose.local.yml exec front npm install <package>

# package.json, package-lock.json git 반영 후 재빌드
docker compose -f docker-compose.local.yml up --build -d front
```

### 서버 배포 (heyvoca_service/ 루트에서)
```bash
./deploy.sh dev    # dev 배포
./deploy.sh stg    # stg 배포
./deploy.sh prod   # prod 배포
```

## Architecture

React 18 SPA (Vite 빌드). 상태 관리는 Context API 기반.

### State Management (`src/context/`)
- `UserContext.jsx` – 인증/유저 상태
- `VocabularyContext.jsx` – 단어장 상태
- `ThemeContext.jsx` – 다크모드
- `NewBottomSheetContext.jsx`, `NewFullSheetContext.jsx`, `OverlayContext.jsx` – UI 레이어링

### 컴포넌트 구조 (`src/components/`)
기능별로 분리. `newBottomSheet/` (32+개), `newFullSheet/` (18+개)는 각각 바텀시트/풀스크린 모달 시스템. API 호출은 `src/api/`, 커스텀 훅은 `src/hooks/`.

### React Compiler
`annotation mode`로 활성화 (점진적 도입). 컴포넌트에 `"use memo"` / `"use cache"` 지시어를 직접 추가하는 방식.

### Vite HMR 환경별 설정 (`vite.config.js`)
- local: `ws://localhost`
- dev/stg/prod: `wss://<domain>:443`

## Environments

| Env  | Compose file              | URL                                    |
|------|---------------------------|----------------------------------------|
| local | docker-compose.local.yml | http://{YOUR_LOCAL_IP}                 |
| dev  | docker-compose.dev.yml    | https://dev-heyvoca-front.ghmate.com   |
| stg  | docker-compose.stg.yml    | https://stg-heyvoca-front.ghmate.com   |
| prod | docker-compose.yml        | https://heyvoca-front.ghmate.com       |

## Key Environment Variables
- `VITE_BACKEND_URL` – 백엔드 API URL (`heyvoca_front/.env.local`에 설정)
- `NODE_ENV` – `local` | `development` | `staging` | `production`
