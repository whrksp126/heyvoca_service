// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// VITE_ENV: local | development | staging | production
// NODE_ENV는 Vite가 dev 실행 시 'development'로 덮어쓰므로 VITE_ENV 사용
const NODE_ENV = process.env.VITE_ENV || 'local'

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

// HMR: 로컬은 nginx 외부 포트(3100)로 WS, 그 외는 wss+도메인:443
const hmr =
  NODE_ENV === 'local'
    ? { clientPort: 3100 }
    : {
        protocol: 'wss',
        host: domainMap[NODE_ENV] || domainMap.development,
        clientPort: 443,
      }

// 빌드마다 `dist/version.json` 을 남긴다 — 배포 후 **이미 열려 있는 탭**이 자기가 낡았음을 알 수 있는
//  유일한 근거다. 값은 번들 파일명에 박힌 콘텐츠 해시라서 **내용이 바뀔 때만** 바뀐다(같은 코드를 다시
//  배포하면 그대로 = 불필요한 새로고침이 없다).
//
//  왜 이게 필요한가: 배포하면 이전 해시 자산이 서버에서 사라진다. 열려 있던 탭이 그 뒤에 폰트·wasm·
//  이미지를 요청하면 404 가 나고, 사용자에겐 원인 모를 깨짐으로 보인다. 예전에는 백엔드 `web_version`
//  을 **손으로** 올려야 새로고침이 걸렸고, 잊으면 그대로 방치됐다.
function buildFingerprintPlugin() {
  return {
    name: 'heyvoca-build-fingerprint',
    apply: 'build',
    generateBundle(_options, bundle) {
      const entry = Object.keys(bundle)
        .filter((name) => name.endsWith('.js'))
        .sort()
        .join('|');
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ build: entry || 'unknown' }, null, 2),
      });
    },
  };
}

export default defineConfig({
  plugins: [
    buildFingerprintPlugin(),
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