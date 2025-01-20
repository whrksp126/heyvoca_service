# 영단어 학습 웹 애플리케이션

## 소개
이 프로젝트는 React와 Vite를 사용하여 만든 영단어 학습 웹 애플리케이션입니다. React는 Facebook에서 개발한 사용자 인터페이스를 만들기 위한 JavaScript 라이브러리로, 컴포넌트 기반 개발과 Virtual DOM을 통한 효율적인 렌더링이 특징입니다.

## 시작하기

### 필수 설치 항목
- Node.js (v14.0.0 이상)
- npm (v6.0.0 이상)

### 설치 방법
1. 저장소를 클론합니다:
1. 저장소를 클론합니다:
   ```bash
   git clone https://github.com/whrksp126/heyvoca_front.git
   ```

2. 프로젝트 디렉토리로 이동합니다:
   ```bash
   cd heyvoca_front
   ```

3. 필요한 패키지를 설치합니다:
   ```bash
   npm install
   ```

4. 개발 서버를 실행합니다:
   ```bash
   npm run dev
   ```

## 프로젝트 구조
- `src/components`: React 컴포넌트들이 위치합니다.
  - `component`: 공통으로 사용되는 버튼 등의 기본 컴포넌트들이 있습니다.
  - `vocabulary`: 단어장 관련 컴포넌트들이 있습니다.
- `src/pages`: 각 페이지를 구성하는 컴포넌트들이 위치합니다.
- `src/assets`: 이미지, 폰트 등의 정적 파일들이 위치합니다.
- `src/styles`: 전역 스타일 및 테마 관련 파일들이 위치합니다.
- `src/App.jsx`: 라우팅 설정 및 전역 레이아웃을 정의합니다.
- `src/main.jsx`: React 애플리케이션의 진입점입니다.
- `vite.config.js`: Vite 빌드 도구의 설정 파일입니다.

## 주요 기능
- 영단어 학습 기능
- 영단어 테스트 기능
- 영단어 검색 기능
- 영단어 추천 기능
- 영단어 카테고리 기능

## 라이선스
이 프로젝트는 MIT 라이선스에 따라 배포됩니다. 자세한 내용은 `LICENSE` 파일을 참고하세요.