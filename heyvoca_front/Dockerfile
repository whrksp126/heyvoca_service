FROM node:18-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

# NODE_ENV에 따라 빌드 방식 분기
ARG NODE_ENV=local
ENV NODE_ENV=$NODE_ENV

# Staging/Production은 빌드 수행
RUN if [ "$NODE_ENV" = "staging" ] || [ "$NODE_ENV" = "production" ]; then npm run build; fi

EXPOSE 3000

# 실행 방식 분기
CMD if [ "$NODE_ENV" = "local" ] || [ "$NODE_ENV" = "development" ]; \
    then npm run dev -- --host --port 3000; \
    else npm run preview -- --host --port 3000; \
    fi
