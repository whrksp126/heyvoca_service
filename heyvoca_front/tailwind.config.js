/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // class 기반 다크모드 활성화
  content: ['./src/**/*.{js,jsx,ts,tsx}'], // TailwindCSS 적용 경로 지정
  theme: {
    extend: {
      spacing: {
        'header': '55px',
        'bottom-nav': '60px',
      },
      height: {
        'header': '55px',
        'bottom-nav': '60px',
      },
      colors: {
        primary: {
          main: {
            600: 'var(--primary-main-600)',
            500: 'var(--primary-main-500)',
            400: 'var(--primary-main-400)',
            300: 'var(--primary-main-300)',
            200: 'var(--primary-main-200)',
            100: 'var(--primary-main-100)',
            50: 'var(--primary-main-50)',
            dark: 'var(--primary-main-dark)',
          }
        },
        secondary: {
          blue: {
            600: 'var(--secondary-blue-600)',
            500: 'var(--secondary-blue-500)',
            400: 'var(--secondary-blue-400)',
            300: 'var(--secondary-blue-300)',
            200: 'var(--secondary-blue-200)',
            100: 'var(--secondary-blue-100)',
            50: 'var(--secondary-blue-50)',
            dark: 'var(--secondary-blue-dark)',
          },
          purple: {
            600: 'var(--secondary-purple-600)',
            500: 'var(--secondary-purple-500)',
            400: 'var(--secondary-purple-400)',
            300: 'var(--secondary-purple-300)',
            200: 'var(--secondary-purple-200)',
            100: 'var(--secondary-purple-100)',
            50: 'var(--secondary-purple-50)',
            dark: 'var(--secondary-purple-dark)',
          },
          yellow: {
            600: 'var(--secondary-yellow-600)',
            500: 'var(--secondary-yellow-500)',
            400: 'var(--secondary-yellow-400)',
            300: 'var(--secondary-yellow-300)',
            200: 'var(--secondary-yellow-200)',
            100: 'var(--secondary-yellow-100)',
            50: 'var(--secondary-yellow-50)',
            dark: 'var(--secondary-yellow-dark)',
          },
          mint: {
            600: 'var(--secondary-mint-600)',
            500: 'var(--secondary-mint-500)',
            400: 'var(--secondary-mint-400)',
            300: 'var(--secondary-mint-300)',
            200: 'var(--secondary-mint-200)',
            100: 'var(--secondary-mint-100)',
            50: 'var(--secondary-mint-50)',
            dark: 'var(--secondary-mint-dark)',
          },
        },
        status: {
          success: {
            600: 'var(--status-success-600)',
            500: 'var(--status-success-500)',
            400: 'var(--status-success-400)',
            300: 'var(--status-success-300)',
            200: 'var(--status-success-200)',
            100: 'var(--status-success-100)',
            50: 'var(--status-success-50)',
            dark: 'var(--status-success-dark)',
          },
          error: {
            600: 'var(--status-error-600)',
            500: 'var(--status-error-500)',
            400: 'var(--status-error-400)',
            300: 'var(--status-error-300)',
            200: 'var(--status-error-200)',
            100: 'var(--status-error-100)',
            50: 'var(--status-error-50)',
            dark: 'var(--status-error-dark)',
          }
        },
        layout: {
          black: 'var(--layout-black)',
          white: 'var(--layout-white)',
          gray: {
            500: 'var(--layout-gray-500)',
            400: 'var(--layout-gray-400)',
            300: 'var(--layout-gray-300)',
            200: 'var(--layout-gray-200)',
            100: 'var(--layout-gray-100)',
            50: 'var(--layout-gray-50)',
            dark: 'var(--layout-gray-dark)',
          }
        },
        border: {
          DEFAULT: '#dddddd',
          dark: '#222222'
        },
        // 당근 농장 V2 작물 단계 색. bg 는 다크 모드에서 html.dark 변수로 자동 전환된다.
        // 예: text-crop-sprout / bg-crop-sprout-bg
        crop: {
          seed: { DEFAULT: 'var(--crop-seed)', bg: 'var(--crop-seed-bg)' },
          sprout: { DEFAULT: 'var(--crop-sprout)', bg: 'var(--crop-sprout-bg)' },
          leaf: { DEFAULT: 'var(--crop-leaf)', bg: 'var(--crop-leaf-bg)' },
          carrot: { DEFAULT: 'var(--crop-carrot)', bg: 'var(--crop-carrot-bg)' },
          golden: { DEFAULT: 'var(--crop-golden)', bg: 'var(--crop-golden-bg)' },
        }
      },
      fontFamily: {
        sans: [
          'Pretendard Variable',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'Roboto',
          'Helvetica Neue',
          'Segoe UI',
          'Apple SD Gothic Neo',
          'Noto Sans KR',
          'Malgun Gothic',
          'sans-serif'
        ],
      },
      keyframes: {
        modalShow: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' }
        }
      },
      animation: {
        'modal-show': 'modalShow 0.3s ease-out forwards'
      }
    },
  },
  plugins: [],
};
