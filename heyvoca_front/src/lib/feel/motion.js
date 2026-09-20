// src/lib/feel/motion.js
//
// 공통 framer-motion 프리셋 — 손맛 시스템의 "스프링 톤" 담당.
//
// 기존 코드 전체에 whileTap scale 0.9~0.98, stiffness 300~500/damping 14~30 값이
// 화면마다 조금씩 다르게 흩어져 있었다(정확한 값 분포는 작업 커밋 보고 참고). 새 코드는
// 숫자를 다시 적지 말고 이 프리셋을 가져다 쓴다 — 한 곳만 고치면 앱 전체 손맛이 같이 바뀐다.
//
// prefers-reduced-motion 사용자를 위한 축소판은 variants 의 `*Reduced` 짝으로 제공한다.
// 호출부는 framer-motion 의 `useReducedMotion()` 훅으로 얻은 값을 pickVariant 에 넘긴다.

export const SPRING = {
  // 탭 반응처럼 즉각적이어야 하는 곳 — 버튼, 탭바, 선택지, 공용 Pressable 기본값
  snappy: { type: 'spring', stiffness: 500, damping: 30 },
  // 부드럽게 자리 잡는 곳 — 카드 등장, 시트 안 콘텐츠 전환
  soft: { type: 'spring', stiffness: 300, damping: 26 },
  // 통통 튀는 곳 — 진화·보상·신기록처럼 "잘했다"를 과장해서 보여줄 때
  bouncy: { type: 'spring', stiffness: 400, damping: 14 },
};

// 공용 탭 스케일 — motion.button 등에 whileTap={{ scale: TAP.scale }} 로 사용
export const TAP = { scale: 0.96 };

export const variants = {
  // 등장 — 배지·팝업 텍스트 등이 톡 튀어나오는 연출 (콤보 갱신, +N% 배지 등)
  popIn: {
    initial: { scale: 0.5, opacity: 0 },
    animate: { scale: 1, opacity: 1, transition: SPRING.bouncy },
    exit: { scale: 0.5, opacity: 0, transition: { duration: 0.15 } },
  },
  popInReduced: {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.15 } },
    exit: { opacity: 0, transition: { duration: 0.1 } },
  },

  // 오답 등 — 가로로 흔들어 "아니다"를 표현
  shake: {
    animate: { x: [0, -6, 6, -4, 4, 0], transition: { duration: 0.35, ease: 'easeInOut' } },
  },
  shakeReduced: {
    animate: { x: [0, -2, 2, 0], transition: { duration: 0.2, ease: 'easeInOut' } },
  },

  // 강조 펄스 — 값이 바뀐 순간 한 번 커졌다 돌아옴 (탭바 아이콘, 게이지 시작 등)
  pulse: {
    animate: { scale: [1, 1.18, 1], transition: SPRING.bouncy },
  },
  pulseReduced: {
    animate: { scale: [1, 1.04, 1], transition: { duration: 0.2, ease: 'easeOut' } },
  },
};

/**
 * reducedMotion 여부에 따라 variants 의 기본판/축소판을 골라준다.
 * @param {'popIn'|'shake'|'pulse'} name
 * @param {boolean} reducedMotion - framer-motion useReducedMotion() 의 반환값
 */
export function pickVariant(name, reducedMotion) {
  return reducedMotion ? variants[`${name}Reduced`] : variants[name];
}
