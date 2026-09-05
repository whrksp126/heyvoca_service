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
  // 오답 — 줄어든다. FSRS 가 안정성을 깎으므로 다음 단계까지의 거리가 실제로 멀어진다
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
 * @param {number} props.delay  채우기 시작을 늦추는 초 — 앞선 연출이 끝난 뒤 차오르게 할 때
 * @param {boolean} props.showGain  오른 구간을 밝게 덧칠할지. 이번에 오른 만큼을 구분해 보여
 *   주는 장치라, 0 에서 새로 채우는 막대(진화 직후 새 단계)에서는 꺼야 한다 —
 *   그 경우 막대 전체가 '오른 구간'이 되어 통째로 밝은 색이 되고, 다른 회차의 같은 막대와
 *   색이 달라진다.
 * @param {string} props.className
 */
const CropProgressBar = ({
  pctFrom = 0,
  pctTo = 0,
  grew = false,
  tone = 'primary',
  width = 132,
  height = 5,
  delay = 0,
  showGain = true,
  className = '',
}) => {
  const from = clamp(pctFrom);
  const to = clamp(pctTo);
  const color = TONE[tone] || TONE.primary;
  const gained = showGain && !grew && to > from;
  // 줄어든 구간 — 사라진 자리를 잠깐 비춰 줘야 '줄었다'가 읽힌다.
  // 막대만 스르륵 짧아지면 어디까지 있었는지 알 수 없어 그냥 짧은 막대로 보인다.
  const lost = !grew && to < from;

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
      ? { duration: 0.9, delay, times: [0, 0.42, 0.62, 0.7, 1], ease: ['easeOut', 'linear', 'easeIn', 'easeOut'] }
      : { duration: 0.5, delay, ease: 'easeOut' })
    : { duration: 0.45, delay, ease: 'easeOut' };

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
          transition={{ duration: 0.45, delay, ease: 'easeOut' }}
        />
      )}
      {lost && (
        // 줄어든 구간 — 있던 자리에 그대로 서 있다가 사라진다.
        // 같이 짧아지게 하면 채워진 막대와 붙어서 움직여 경계가 안 보인다.
        <motion.span
          key={`lost-${from}-${to}`}
          className="absolute top-0 bottom-0 rounded-[99px]"
          style={{ backgroundColor: color.gain, left: `${to}%`, width: `${from - to}%` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.85, 0.85, 0] }}
          transition={{ duration: 0.8, times: [0, 0.12, 0.55, 1], ease: 'easeOut' }}
        />
      )}
    </span>
  );
};

export default CropProgressBar;
