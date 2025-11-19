// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// NODE_ENV: local | development | staging | production
const NODE_ENV = process.env.NODE_ENV || 'local'

// 도메인 매핑 (HMR용)
const domainMap = {
  local: 'localhost',
  development: 'dev-heyvoca-front.ghmate.com',
  staging: 'stg-heyvoca-front.ghmate.com',
  production: 'heyvoca-front.ghmate.com',
}

// 허용 호스트 (프록시/쿠키/WS 보안 관련)
const allowedHosts = ['localhost']
if (NODE_ENV === 'development') allowedHosts.push(domainMap.development)
if (NODE_ENV === 'staging') allowedHosts.push(domainMap.staging)
if (NODE_ENV === 'production') allowedHosts.push(domainMap.production)

// HMR: 로컬은 ws+localhost, 그 외는 wss+도메인:443
const hmr =
  NODE_ENV === 'local'
    ? true
    : {
        protocol: 'wss',
        host: domainMap[NODE_ENV] || domainMap.development,
        clientPort: 443,
      }

export default defineConfig({
  plugins: [
    // React Compiler - 점진적 적용 (annotation 모드)
    // "use memo" 디렉티브가 있는 컴포넌트만 컴파일
    react({
      babel: {
        plugins: [
          [
            'babel-plugin-react-compiler',
            {
              // React 18을 사용하므로 target 명시
              target: '18',
              // annotation 모드: "use memo" 디렉티브가 있는 컴포넌트만 컴파일
              // 점진적 적용에 최적화된 모드
              compilationMode: 'annotation',
              // 에러 시 빌드 실패 방지 (점진적 적용 시 필수)
              panicThreshold: 'none',
            },
          ],
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  base: '/',
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    cors: true,
    hmr,
    allowedHosts,
    watch: {
      usePolling: true,
      interval: 300,
    },
  },
  build: {
    outDir: 'dist',
  },
  css: {
    postcss: './postcss.config.cjs',
  },
})