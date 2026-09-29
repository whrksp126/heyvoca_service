// src/utils/studySlideMotion.js
//
// 학습형 세션 슬라이드 전환 규격 — 원래 components/takeTest/Main.jsx 안에 로컬 상수로만
// 있던 값을 단일 소스로 옮겼다(2026-09-29 QA: 글자 세션이 학습하기와 다른 전환을 써서
// 이질감이 있다는 피드백 — TakeTest·글자 세션(components/newfullsheet/
// ScriptSessionNewFullSheet.jsx) 둘 다 이 파일을 import 해서 같은 값을 쓴다).
// 두 세션 모두 문제가 앞으로만 진행되므로 direction은 항상 1로 호출한다(뒤로 가는
// 슬라이드는 없음 — direction<0 분기는 나중에 뒤로가기를 지원할 때를 대비해 남겨둔다).

export const SLIDE_VARIANTS = {
  enter: (direction) => ({
    x: direction > 0 ? '100%' : '-100%',
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction) => ({
    x: direction < 0 ? '100%' : '-100%',
    opacity: 0,
  }),
};

// 슬라이드(문제 카드 컨테이너) 전환 transition — AnimatePresence mode="popLayout"과 함께 쓴다.
export const SLIDE_TRANSITION = { duration: 0.25, ease: [0.4, 0, 0.2, 1] };

// 진행바 채움(폭 변화) transition.
export const PROGRESS_FILL_TRANSITION = { duration: 0.3, ease: [0.4, 0, 0.2, 1] };

// 문제 카드 자체의 등장 모션(살짝 커지며 나타남) — TakeTest 사지선다 카드(data-lift-card) 기준.
export const CARD_ENTER_INITIAL = { opacity: 0, scale: 0.95 };
export const CARD_ENTER_ANIMATE = { opacity: 1, scale: 1 };
export const CARD_ENTER_TRANSITION = { duration: 0.2, ease: [0.4, 0, 0.2, 1] };
