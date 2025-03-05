/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // class 기반 다크모드 활성화
  content: ['./src/**/*.{js,jsx,ts,tsx}'], // TailwindCSS 적용 경로 지정
  theme: {
    extend: {
      colors: {
        heyvocaPink: '#FF8DD4',
        primary: {
          DEFAULT: '#111111',
          dark: '#ffffff'
        },
        background: {
          DEFAULT: '#ffffff',
          dark: '#111111'
        },
        text: {
          DEFAULT: '#111111',
          dark: '#ffffff',
        },
        border: {
          DEFAULT: '#dddddd',
          dark: '#222222'
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
    },
  },
  plugins: [],
};
