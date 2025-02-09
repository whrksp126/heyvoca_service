# Node.js 환경에서 빌드 (local, dev, stg, prod 모두 지원)
FROM node:20-alpine AS builder
WORKDIR /app

# npm 기본 레지스트리 설정
RUN npm config set registry https://registry.npmjs.org/

# package.json만 복사해서 캐싱 최적화
COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps

# 소스 코드 복사
COPY . .

# NODE_ENV 환경변수 설정
ARG NODE_ENV
ENV NODE_ENV=$NODE_ENV

# Staging & Production 빌드
FROM builder AS builder-prod
RUN npm run build

# Staging & Production → Nginx 설정
FROM nginx:stable-alpine AS production
# Nginx 설정 먼저 복사
COPY nginx.prod.conf /etc/nginx/nginx.conf
# 빌드된 파일 복사
COPY --from=builder-prod /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

# Development & Local → 개발 서버 실행
FROM builder AS development
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
