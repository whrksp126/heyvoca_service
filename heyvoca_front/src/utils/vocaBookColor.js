// 단어장 고유 배경색(라이트 hex/CSS변수)을 다크모드용으로 매핑한다.
// 단어장 color.background 는 DB 데이터(시대별 팔레트로 생성)라 값이 다양하므로,
// 1) 알려진 팔레트 배경값 → 디자인시스템 family dark 토큰으로 정확 매핑하고
// 2) 미지의 값은 색상(hue) 기반으로 가장 가까운 family에 폴백한다.

const FAMILY_DARK_VAR = {
  'primary-main': 'var(--primary-main-dark)',     // #3D1D34 (pink)
  'secondary-blue': 'var(--secondary-blue-dark)', // #192431
  'secondary-purple': 'var(--secondary-purple-dark)', // #1B1B2A
  'secondary-yellow': 'var(--secondary-yellow-dark)', // #2B271D
  'secondary-mint': 'var(--secondary-mint-dark)', // #1C2625
};

// 다크 카드 배경(FAMILY_DARK_VAR) 위에서 또렷하게 보이도록 하는 포인트 색상(뱃지 배경, "+" 아이콘 색).
// family의 -400 토큰(라이트에서도 쓰는 밝은 톤)을 그대로 재사용해 디자인시스템과 어긋나지 않게 한다.
const FAMILY_ACCENT_DARK_VAR = {
  'primary-main': 'var(--primary-main-400)',
  'secondary-blue': 'var(--secondary-blue-400)',
  'secondary-purple': 'var(--secondary-purple-400)',
  'secondary-yellow': 'var(--secondary-yellow-400)',
  'secondary-mint': 'var(--secondary-mint-400)',
};

// 다크 카드 배경 위 "+" 원의 배경색. 라이트의 반투명 파스텔(main+'4d')을 그대로 쓰면
// 어두운 카드 위에서 탁하게 뜨므로, family별로 은은한 반투명 틴트를 고정값으로 정의한다.
const FAMILY_SUB_DARK_VAR = {
  'primary-main': 'rgba(255, 136, 220, 0.22)',
  'secondary-blue': 'rgba(83, 177, 253, 0.22)',
  'secondary-purple': 'rgba(155, 138, 251, 0.22)',
  'secondary-yellow': 'rgba(253, 133, 58, 0.22)',
  'secondary-mint': 'rgba(52, 232, 217, 0.22)',
};

// 알려진 라이트 배경값(정규화: 소문자/공백제거) → family
const KNOWN_BG_FAMILY = {
  // pink / primary
  'var(--primary-main-100)': 'primary-main',
  '#ffeefa': 'primary-main', '#ffeffa': 'primary-main', '#fff0f9': 'primary-main',
  // purple
  '#f4f3ff': 'secondary-purple', '#f8e6ff': 'secondary-purple',
  '#f6efff': 'secondary-purple', '#f5f0ff': 'secondary-purple', '#ead2ff': 'secondary-purple',
  // blue
  '#eff8ff': 'secondary-blue', '#eaf6ff': 'secondary-blue', '#c6ecff': 'secondary-blue',
  // mint / green
  '#e8fdfb': 'secondary-mint', '#e6ffe9': 'secondary-mint',
  '#e2ffe8': 'secondary-mint', '#b2fdcc': 'secondary-mint',
  // yellow
  '#fff8e5': 'secondary-yellow', '#fff8e6': 'secondary-yellow',
  '#fff6df': 'secondary-yellow', '#ffe5ae': 'secondary-yellow',
};

function hexToHs(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d < 0.02) return { h: 0, s: 0 };
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s: d / max };
}

function familyFromHue(hex) {
  const hs = hexToHs(hex);
  if (!hs || hs.s < 0.06) return null; // 채도 낮으면(거의 무채색) 분류 불가
  const h = hs.h;
  if (h >= 285 || h < 20) return 'primary-main';   // magenta/pink/red
  if (h >= 245) return 'secondary-purple';          // violet
  if (h >= 175) return 'secondary-blue';            // blue/cyan
  if (h >= 80) return 'secondary-mint';             // green/teal
  return 'secondary-yellow';                        // 20~80 yellow/orange
}

// background/main/sub 어떤 값이 와도 공통으로 family(팔레트 계열)를 추정한다.
// 1) 알려진 라이트 배경값 정확 매칭 → 2) var(--family-...) 문자열 매칭 → 3) hue 기반 추정.
function detectFamily(value) {
  if (!value) return null;
  const key = String(value).trim().toLowerCase();

  let family = KNOWN_BG_FAMILY[key];
  if (!family && key.startsWith('var(')) {
    if (key.includes('primary-main')) family = 'primary-main';
    else if (key.includes('secondary-blue')) family = 'secondary-blue';
    else if (key.includes('secondary-purple')) family = 'secondary-purple';
    else if (key.includes('secondary-yellow')) family = 'secondary-yellow';
    else if (key.includes('secondary-mint')) family = 'secondary-mint';
  }
  if (!family) family = familyFromHue(key);
  return family;
}

/**
 * 단어장 배경색을 현재 테마에 맞게 반환.
 * @param {string} background  color.background (hex 또는 'var(--...)')
 * @param {boolean} isDark
 * @returns {string} 적용할 backgroundColor 값
 */
export function resolveVocaBookBackground(background, isDark) {
  if (!isDark || !background) return background;
  const family = detectFamily(background);
  if (!family) return 'var(--layout-gray-dark)'; // 최종 폴백: 중성 다크 surface
  return FAMILY_DARK_VAR[family];
}

/**
 * 단어장 포인트 색(카테고리 뱃지 배경, "+" 아이콘 색 등 color.main)을 테마에 맞게 반환.
 * 다크 카드 배경(FAMILY_DARK_VAR) 위에서도 또렷하게 보이도록 family의 밝은 톤으로 매핑한다.
 * @param {string} main  color.main (라이트 원색 hex)
 * @param {boolean} isDark
 */
export function resolveVocaBookAccentColor(main, isDark) {
  if (!isDark || !main) return main;
  const family = detectFamily(main) || 'primary-main';
  return FAMILY_ACCENT_DARK_VAR[family] || 'var(--layout-white)';
}

/**
 * 단어장 "+" 원 배경(color.sub, 보통 main+투명도)을 테마에 맞게 반환.
 * 라이트의 반투명 파스텔을 다크 카드 위에 그대로 쓰면 탁해 보이므로 family별 고정 틴트로 대체한다.
 * @param {string} sub   color.sub (main + 알파 hex, 예: '#FF70D44d')
 * @param {string} main  color.main (family 판별 기준 — sub보다 원색이라 더 정확)
 * @param {boolean} isDark
 */
export function resolveVocaBookSubColor(sub, main, isDark) {
  if (!isDark || !sub) return sub;
  const family = detectFamily(main) || detectFamily(sub) || 'primary-main';
  return FAMILY_SUB_DARK_VAR[family] || 'rgba(255, 255, 255, 0.16)';
}
