// src/components/mascot/heyPoses.js
//
// 헤이의 포즈 정의 — 그림(Hey.jsx)과 움직임(hey.css)이 함께 읽는 단일 기준.
//
// 각도는 전부 "아래로 늘어뜨린 팔/곧게 선 귀"를 0°로 둔 시계 방향 회전이다.
//   팔: 양수면 화면 왼쪽으로, 음수면 화면 오른쪽으로 벌어진다. ±130 근처가 만세.
//   귀: 음수면 왼쪽으로, 양수면 오른쪽으로 눕는다.
// 여기에는 **멈춰 있는 자세**만 적는다. 움직임은 hey.css 가 data-pose 로 얹는다 —
// 그래야 모션을 끈 기기(prefers-reduced-motion)에서도 포즈가 그대로 읽힌다.

export const HEY_POSES = {
  idle: {
    label: '기본 대기',
    hint: '숨쉬기 · 눈 깜빡임 · 귀 까딱',
    armL: 16, armR: -16, earL: -9, earR: 11, head: 0,
    eyes: 'open', mouth: 'smile',
  },
  wave: {
    label: '인사',
    hint: '손 흔들기',
    armL: 16, armR: -130, earL: -9, earR: 13, head: 4,
    eyes: 'open', mouth: 'open',
    armsFront: true,
  },
  water: {
    label: '물 주기',
    hint: '돌볼 작물이 있을 때',
    armL: -66, armR: -10, earL: -9, earR: 11, head: 3,
    eyes: 'open', mouth: 'smile', look: [2, 1.5],
    armsFront: true, prop: 'can',
  },
  plant: {
    label: '씨앗 심기',
    hint: '새 씨앗을 심을 차례',
    armL: 16, armR: -38, earL: -11, earR: 9, head: 7,
    eyes: 'open', mouth: 'smile', look: [2.5, 2.5],
    prop: 'seed',
  },
  joy: {
    label: '기뻐하기',
    hint: '점프 · 오늘 할 일 완료',
    armL: 132, armR: -132, earL: -13, earR: 13, head: 0,
    eyes: 'happy', mouth: 'open',
    armsFront: true, prop: 'sparkle',
  },
  cheer: {
    label: '응원',
    hint: '조금만 더',
    armL: 128, armR: -128, earL: -9, earR: 11, head: 0,
    eyes: 'open', mouth: 'open',
    armsFront: true, prop: 'pom',
  },
  worry: {
    label: '시무룩 · 걱정',
    hint: '돌볼 작물이 밀렸을 때',
    armL: -64, armR: 64, earL: -58, earR: 58, head: -3,
    eyes: 'worry', mouth: 'frown', brows: 'worry',
    armsFront: true, prop: 'sweat',
  },
  sleepy: {
    label: '졸림',
    hint: '밤 · 할 일 완료',
    armL: 12, armR: -12, earL: -36, earR: 28, head: 6,
    eyes: 'closed', mouth: 'o',
    prop: 'zzz',
  },
  think: {
    label: '생각 중',
    hint: '불러오는 중 · 고르는 중',
    armL: 16, armR: 132, earL: -9, earR: 16, head: -5,
    eyes: 'open', mouth: 'flat', look: [-2, -3],
    armsFront: true, prop: 'thought',
  },
};

export const HEY_POSE_KEYS = Object.keys(HEY_POSES);

/** 탭했을 때 잠깐 짓는 표정 — 자던 헤이는 화들짝 놀라고, 나머지는 반긴다 */
export const reactionFace = (pose) => (
  pose === 'sleepy'
    ? { eyes: 'open', mouth: 'o' }
    : { eyes: 'happy', mouth: 'open' }
);

/**
 * 홈 화면에서 헤이가 지을 포즈.
 *
 * 우선순위는 "사용자가 지금 알아야 할 것" 순서다 — 위기 > 남은 일 > 완료.
 * 이미 썩은 단어는 보지 않는다 — 살리기 전까지 계속 남아 있어서, 그걸로 걱정시키면 헤이가
 * 며칠이고 시무룩한 채로 굳는다. 걱정은 "지금 손쓰면 막을 수 있는" 썩기 직전에만 한다.
 * 시간대는 할 일을 다 끝낸 뒤에만 포즈를 바꾼다(밤이라고 썩어 가는 밭 앞에서 졸지 않는다).
 *
 * @param {object}  p
 * @param {string}  p.homeState  FarmCta 의 HOME_STATES 값('critical'|'due'|'newSeed'|'done'|'empty')
 * @param {boolean} p.loaded     농장 조회가 끝났는지 — 전이면 기본 대기
 * @param {number}  p.critical   썩기 직전 단어 수
 * @param {number}  p.due        오늘 돌볼 단어 수
 * @param {number}  p.hour       0~23
 */
export const resolveHomeHeyPose = ({
  homeState,
  loaded = true,
  critical = 0,
  due = 0,
  hour = new Date().getHours(),
} = {}) => {
  if (!loaded) return 'idle';
  const state = homeState;
  const night = hour >= 22 || hour < 5;

  if (state === 'empty') return 'wave';
  if (state === 'critical' || critical > 0) return 'worry';
  if (state === 'due') return due > 0 && due <= 3 ? 'cheer' : 'water';
  if (state === 'newSeed') return 'plant';
  if (state === 'done') return night ? 'sleepy' : 'joy';
  return 'idle';
};
