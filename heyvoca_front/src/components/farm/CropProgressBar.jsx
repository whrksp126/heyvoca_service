import React from 'react';
import { motion } from 'framer-motion';

/**
 * 당근 농장 V2 — 학습 상태 바의 **막대 부분만** 떼어낸 재사용 컴포넌트.
 * 시안 study.html 의 `.fb .tk` / `.fb .tk u` / `.fb.up` / `.fb.ng` 규격을 그대로 옮겼다.
 * (`study_css.py` 는 `max-width:78px` 로 남아 있는 구버전이다. 시안 렌더값은 **132px**.)
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
 * @param {number|string} props.width  막대 최대 폭 (기본 132px — 시안 `.fb .tk{max-width:132px}`)
 * @param {number} props.height 막대 두께 (기본 5px. 좁은 형 `.fb.sm .tk` 는 4px)
 * @param {string} props.className
 */
const CropProgressBar = ({
  pctFrom = 0,
  pctTo = 0,
  grew = false,
  tone = 'primary',
  width = 132,
  height = 5,
  className = '',
}) => {
  const from = clamp(pctFrom);
  const to = clamp(pctTo);
  const color = TONE[tone] || TONE.primary;
  const gained = !grew && to > from;

  /*
    진화: 이전 진행률 → 100% → 0% → 새 단계 진행률.

    【속도를 시안 구간표보다 늘렸다】 시안 3절은 막대가 0~120ms 에 100% 를 찍고
    280ms 에 리셋한다. 그건 **작물 그래픽** 전환의 구간표다. 같은 시간을 막대에 그대로
    주면 사람 눈에는 "차오르는" 게 아니라 한 번 번쩍하고 사라진 것으로 보인다
    (실제로 "팍 찼다가 순식간에 사라진다"는 지적을 받았다). 채우는 데 충분한 시간을 주고,
    가득 찬 상태를 잠깐 붙잡아 '다 채워서 올라갔다'가 읽히게 한 뒤 다음 단계로 넘어간다.
    전체 길이는 정답 후 다음 문제로 넘어가는 지연(1000ms)보다 짧게 유지한다 —
    넘어가는 순간에 애니메이션이 잘리면 그 자체가 또 '사라짐'으로 읽힌다.

    【새 진행률이 0 이면 비우지 않는다】 리셋은 '새 단계에서 얼마나 왔는지'를 보여 주려는
    것인데 그 값이 0 이면 보여 줄 게 없고, 빈 막대만 남아 방금 채운 것이 없어진 것처럼
    읽힌다. 씨앗을 막 심은 순간이 늘 이 경우다(진행률이 시간으로만 차기 때문).
  */
  const resets = to > 0;
  const fillAnimate = grew
    ? (resets
      ? { width: [`${from}%`, '100%', '100%', '0%', `${to}%`] }
      : { width: '100%' })
    : { width: `${to}%` };
  const fillTransition = grew
    ? (resets
      ? { duration: 0.9, times: [0, 0.42, 0.62, 0.7, 1], ease: ['easeOut', 'linear', 'easeIn', 'easeOut'] }
      : { duration: 0.5, ease: 'easeOut' })
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
