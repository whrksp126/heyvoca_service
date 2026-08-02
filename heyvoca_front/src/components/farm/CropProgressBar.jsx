import React from 'react';
import { motion } from 'framer-motion';

/**
 * 당근 농장 V2 — 학습 상태 바의 **막대 부분만** 떼어낸 재사용 컴포넌트.
 * 시안 `study_css.py` 의 `.fb .tk` / `.fb .tk u` / `.fb.up` / `.fb.ng` 규격을 그대로 옮겼다.
 *
 * 진화(단계 상승)일 때는 막대가 **100% 를 찍고 0% 로 리셋된 뒤** 새 단계 진행률로 간다.
 * 그냥 새 값으로 갈아 끼우면 막대가 줄어든 것처럼 보인다.
 */

// 색은 토큰(CSS 변수)으로만 잡는다 — 같은 값을 화면마다 다시 적으면 반드시 어긋난다.
// `#D9A15C` 만 토큰이 없어 시안 값을 그대로 쓴다.
const TONE = {
  // 평상시 — 진행바와 같은 분홍
  primary: { fill: 'var(--primary-main-600)', gain: 'var(--primary-main-300)' },
  // 진화한 순간에만 초록이 된다
  up: { fill: 'var(--status-success-600)', gain: 'var(--status-success-300)' },
  // 오답 — 늘지도 줄지도 않는다
  ng: { fill: '#D9A15C', gain: '#D9A15C' },
};

const clamp = (n) => Math.max(0, Math.min(100, Number(n) || 0));

/**
 * @param {object} props
 * @param {number} props.pctFrom  학습 전 진행률 (0~100)
 * @param {number} props.pctTo    학습 후 진행률 (0~100)
 * @param {boolean} props.grew    단계가 올랐는지 — true 면 100% → 0% → 새 진행률 연출
 * @param {'primary'|'up'|'ng'} props.tone
 * @param {number|string} props.width  막대 최대 폭 (기본 78px — 시안 `.fb .tk` 규격)
 * @param {number} props.height 막대 두께 (기본 5px. 좁은 형 `.fb.sm .tk` 는 4px)
 * @param {string} props.className
 */
const CropProgressBar = ({
  pctFrom = 0,
  pctTo = 0,
  grew = false,
  tone = 'primary',
  width = 78,
  height = 5,
  className = '',
}) => {
  const from = clamp(pctFrom);
  const to = clamp(pctTo);
  const color = TONE[tone] || TONE.primary;
  const gained = !grew && to > from;

  // 진화: 이전 진행률 → 100% → (즉시) 0% → 새 단계 진행률
  const fillAnimate = grew
    ? { width: [`${from}%`, '100%', '0%', `${to}%`] }
    : { width: `${to}%` };
  const fillTransition = grew
    ? { duration: 0.95, times: [0, 0.42, 0.44, 1], ease: 'easeOut' }
    : { duration: 0.45, ease: 'easeOut' };

  return (
    <span
      className={`relative block flex-1 rounded-[99px] bg-[#E8E8E8] dark:bg-[#454545] overflow-hidden ${className}`}
      style={{ maxWidth: width, height }}
    >
      <motion.span
        key={`fill-${from}-${to}-${grew ? 1 : 0}`}
        className="absolute left-0 top-0 bottom-0 rounded-[99px]"
        style={{ backgroundColor: color.fill }}
        initial={{ width: `${from}%` }}
        animate={fillAnimate}
        transition={fillTransition}
      />
      {gained && (
        // 이번 학습으로 오른 만큼만 밝게 남긴다 — 그게 '몇 % 올랐는지'다
        <motion.span
          key={`gain-${from}-${to}`}
          className="absolute top-0 bottom-0 rounded-[99px]"
          style={{ backgroundColor: color.gain, left: `${from}%` }}
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: `${to - from}%`, opacity: 1 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        />
      )}
    </span>
  );
};

export default CropProgressBar;
