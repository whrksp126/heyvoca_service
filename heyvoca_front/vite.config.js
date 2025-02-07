import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 환경 변수 설정 (production, staging, development, local)
const NODE_ENV = process.env.NODE_ENV || 'local';

// 도메인별 허용 리스트 설정
const allowedHosts = ['localhost'];

if (NODE_ENV === 'development') {
  allowedHosts.push('dev.heyvoca_front.ghmate.com');
} else if (NODE_ENV === 'staging') {
  allowedHosts.push('stg.heyvoca_front.ghmate.com');
} else if (NODE_ENV === 'production') {
  allowedHosts.push('heyvoca_front.ghmate.com');
}

export default defineConfig({
  plugins: [react()],
  base: NODE_ENV === 'production' ? '/' : '/', 
  server: {
    watch: {
      usePolling: true,
      interval: 300,
    },
    host: '0.0.0.0',
    strictPort: true,
    port: 3000,
    cors: true,
    allowedHosts,
  },
  build: {
    outDir: 'dist',
  }
});
