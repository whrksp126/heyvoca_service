// src/components/home/FarmCta.jsx
//
// 홈(= 농장) 주 CTA — 시안 §7 · §12.
//
// §7 주 CTA를 히어로 위로:
//   히어로 하단에 겹쳐 뜬다(absolute · bottom -16px · 좌우 20px · z-24).
//   일러스트 밖으로 살짝 흘러나와 그림과 본문을 물리적으로 꿰맨다 —
//   "이 농장에 물을 주러 간다"가 한 덩어리로 읽힌다.
//   56px / radius 12 / 문구 한 줄(17px·700·가운데). **아이콘도 보조 문구도 없다.**
//   면은 #FF88DC → #FF70D4 세로 그라디언트 + 상단 안쪽 하이라이트.
//   그림자는 번지는 빛(핑크) + 접지(흙색) 두 겹. 히어로 위에 뜬 요소에만 그림자를 쓴다.
//
// §7 — **버튼 자체는 상태에 따라 바뀌지 않는다.** 다섯 상태 모두 같은 핑크다.
//   같은 자리의 같은 버튼이 매번 다른 물건처럼 보이면 "여기를 누르면 학습이 시작된다"는
//   학습이 매번 처음부터 다시 일어난다. 바뀌는 건 안에 담기는 글자뿐이다.
//   긴급함은 일러스트 · 헤드라인 · 주황 핀이 이미 말한다.
//
// §7 — 홈에는 진행 지표가 없다. 진행바도, "7 / 18 · 약 6분" 같은 보조 문구도 두지 않는다.
//   홈에서 하는 판단은 "지금 학습할까, 말까" 하나뿐이다.

import React from 'react';
import { motion } from 'framer-motion';

/** §12 상태 적응형 CTA 규칙 — 우선순위 순 */
export const HOME_STATES = {
  CRITICAL: 'critical',  // 1. CRITICAL 다수
  DUE: 'due',            // 2. due > 0
  NEW_SEED: 'newSeed',   // 3. due = 0, 신규 목표 남음
  DONE: 'done',          // 4. 전부 완료
  EMPTY: 'empty',        // 5. 보유 단어 0
};

/**
 * §8 CTA와 스트립이 겹치지 않게 하는 단계 규칙.
 *
 *   부패 직전 수  CTA                      water 스트립
 *   0개           오늘의 물주기 시작        없음
 *   1~3개         오늘의 물주기 시작(그대로) 노출
 *   4개 이상      급한 작물부터 돌보기      없음 — CTA가 이미 그 말을 한다
 *
 * 그래서 §12 의 1번(급한 작물부터 돌보기 · 주황 핀)이 서는 문턱은 4개다.
 * (§12 표는 "CRITICAL ≥ 1"이라고 적고 있는데 §8 표와 어긋난다 — 보고 참조.
 *  §8 이 더 구체적이고 "같은 사실을 두 번 말하지 않는다"는 근거까지 달고 있어 §8 을 따랐다.
 *  시안 위험 목업의 "썩기 직전 6" 도 4개 이상이라 §8 과 모순되지 않는다.)
 */
export const CRITICAL_CTA_THRESHOLD = 4;

/**
 * 화면 상태 판정. overview(GET /farm/overview) 와 오늘 남은 신규 목표만 본다.
 *
 * @param {object} overview      farm/overview 응답 data
 * @param {number} newRemaining  오늘 남은 신규 학습 목표 개수 (일일 한도 − 오늘 신규 학습 수)
 */
export const resolveHomeState = (overview, { newRemaining = 0 } = {}) => {
  const counts = overview?.counts ?? {};
  const today = overview?.today ?? {};
  const seedDetail = overview?.seed_detail ?? {};

  // 황금은 당근 그룹에 포함돼 있으므로 따로 더하지 않는다(백엔드 5.1).
  const total = ['seed', 'sprout', 'leaf', 'carrot']
    .reduce((sum, key) => sum + (counts[key] ?? 0), 0);
  const critical = today.critical_first ?? 0;
  const due = today.due ?? 0;
  const unplanted = seedDetail.unplanted ?? 0;

  if (total <= 0) return HOME_STATES.EMPTY;
  if (critical >= CRITICAL_CTA_THRESHOLD) return HOME_STATES.CRITICAL;
  if (due > 0) return HOME_STATES.DUE;
  if (newRemaining > 0 && unplanted > 0) return HOME_STATES.NEW_SEED;
  return HOME_STATES.DONE;
};

/**
 * 상태별 얼굴 — §12 표(주 CTA · 헤드라인 2줄 · 일러스트) + §4 헤드라인 문구.
 * 헤드라인은 "헤이,"로 시작해 브랜드명과 연결하고 그 부분만 브랜드 핑크로 칠한다(§4).
 */
export const HOME_STATE_VIEW = {
  [HOME_STATES.CRITICAL]: {
    mood: 'risk',
    cta: '급한 작물부터 돌보기',
    line1: ' 먼저 구해야 할',
    line2: '작물이 있어요',
  },
  [HOME_STATES.DUE]: {
    mood: 'thirsty',
    cta: '오늘의 물주기 시작',
    line1: ' 당근이',
    line2: '물을 기다리고 있어요',
  },
  [HOME_STATES.NEW_SEED]: {
    mood: 'fresh',
    cta: '새 씨앗 심으러 가기',
    line1: ' 밭이 촉촉해요',
    line2: '새 씨앗이 왔어요',
  },
  [HOME_STATES.DONE]: {
    mood: 'fresh',
    cta: '더 학습하기',
    line1: ' 당신의 당근이',
    line2: '잘 자라고 있어요',
  },
  [HOME_STATES.EMPTY]: {
    mood: 'fresh',
    cta: '단어장 받으러 가기',
    line1: ' 아직 밭이',
    line2: '비어 있어요',
  },
};

const FarmCta = ({ label, onClick }) => {
  "use memo";

  return (
    <div className="absolute left-[20px] right-[20px] bottom-[-16px] z-[24]">
      <motion.button
        type="button"
        onClick={onClick}
        whileTap={{ scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        className="
          flex items-center justify-center
          w-full h-[56px] rounded-[12px]
          bg-[linear-gradient(180deg,#FF88DC_0%,#FF70D4_100%)]
          shadow-[inset_0_1px_0_rgba(255,255,255,.34),0_10px_24px_rgba(255,112,212,.42),0_3px_8px_rgba(96,80,52,.16)]
        "
      >
        <span className="text-layout-white text-[17px] font-[700] leading-[1.2] tracking-[-0.02em]">
          {label}
        </span>
      </motion.button>
    </div>
  );
};

export default FarmCta;
