# 1️⃣ Node.js 환경에서 빌드 (local, dev, stg, prod 모두 지원)
FROM node:18-alpine AS builder
WORKDIR /app

# package.json만 복사해서 캐싱 최적화
COPY package.json package-lock.json ./
RUN npm install
COPY . .

# NODE_ENV 환경변수 설정
ARG NODE_ENV=local
ENV NODE_ENV=$NODE_ENV

# Staging & Production → 빌드 수행
RUN if [ "$NODE_ENV" = "staging" ] || [ "$NODE_ENV" = "production" ]; then npm run build; fi

# 2️⃣ 실행 방식 분기
CMD if [ "$NODE_ENV" = "local" ] || [ "$NODE_ENV" = "development" ]; \
    then npm run dev -- --host --port 3000; \
    else echo "Starting Nginx for Staging/Production..." && nginx -g "daemon off;"; \
    fi

# 3️⃣ Staging & Production 환경 → Nginx로 정적 파일 서빙
FROM nginx:stable-alpine AS server
# 📌 빌드된 정적 파일 복사
COPY --from=builder /app/dist /usr/share/nginx/html
# 📌 Nginx 설정 파일 추가
COPY nginx.prod.conf /etc/nginx/nginx.conf  
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]