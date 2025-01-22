# 프로젝트 이름

이 프로젝트는 Flask 애플리케이션을 Docker를 사용하여 개발하는 환경을 설정합니다.

## 초기 세팅 방법

1. **저장소 클론하기**

   ```bash
   git clone <repository-url>
   cd <repository-directory>
   ```

2. **Docker 및 Docker Compose 설치**

   Docker와 Docker Compose가 설치되어 있는지 확인합니다. 설치 방법은 [Docker 공식 문서](https://docs.docker.com/get-docker/)를 참조하세요.

## 실행 방법

1. **Docker Compose로 컨테이너 실행**

   다음 명령어를 사용하여 Docker Compose를 통해 애플리케이션을 실행합니다:

   ```bash
   docker-compose up --build
   docker-compose --env-file .env.dev -f docker-compose.dev.yml up 은 개발 환경의 컨테이너를 실행합니다.
   docker-compose --env-file .env.prod -f docker-compose.prod.yml up 은 프로덕션 환경의 컨테이너를 실행합니다.
   ```

2. **브라우저에서 확인**

   웹 브라우저를 열고 `http://localhost`에 접속하여 Flask 애플리케이션이 정상적으로 작동하는지 확인합니다.

## 개발 방법

- **코드 수정**: `app.py` 파일을 수정하여 애플리케이션의 기능을 변경합니다.
- **자동 반영**: 코드 변경 후 브라우저를 새로 고침하면 변경 사항이 자동으로 반영됩니다.

## 관리 방법

- **로그 확인**: 다음 명령어로 웹 서비스의 로그를 확인할 수 있습니다:

   ```bash
   docker-compose logs --no-log-prefix -f web
   docker-compose -f docker-compose.dev.yml logs --no-log-prefix -f web
   docker-compose -f docker-compose.prod.yml logs --no-log-prefix -f web
   ```

- **컨테이너 중지 및 제거**: 다음 명령어로 모든 컨테이너를 중지하고 제거할 수 있습니다:

   ```bash
   docker-compose down
   docker-compose -f docker-compose.dev.yml down
   docker-compose -f docker-compose.prod.yml down
   ```

이 README 파일을 프로젝트 루트 디렉토리에 `README.md`라는 이름으로 저장하면 됩니다. 추가적인 내용이나 수정이 필요하면 말씀해 주세요!