import React from 'react';
import { motion } from 'framer-motion';

/**
 * 당근 농장 V2 — 학습 상태 바의 **막대 부분만** 떼어낸 재사용 컴포넌트.
 * 시안 study.html 의 `.fb .tk` / `.fb .tk u` / `.fb.up` / `.fb.ng` 규격을 그대로 옮겼다.
 *
 * 【폭은 항상 칸 기준 100%】 예전엔 132px 로 못박아 뒀는데(시안 렌더값), 호출부(FarmStatusBar)가
 * 문제 유형마다 다른 폭의 카드에 절대배치되다 보니 어떤 화면은 카드보다 훨씬 짧은 막대가,
 * 어떤 화면은 꽉 찬 막대가 나와 "트랙 길이가 콘텐츠마다 다르다"는 일관성 문제가 됐다.
 * 이제 항상 부모가 내준 폭(`flex-1`)을 그대로 쓴다 — 카드 매칭처럼 좁은 칸에서도 칸 폭 기준 100%.
 *
 * 진화(단계 상승)일 때는 막대가 **`pctFrom`(실제 학습 전 진행률)에서 100% 를 찍고 0% 로
 * 리셋된 뒤** 새 단계 진행률로 간다. 그냥 새 값으로 갈아 끼우면 막대가 줄어든 것처럼 보이고,
 * 0% 에서부터 채우면 학습 전 진행률을 무시한 채 "새로 시작한" 것처럼 보인다.
 */

// 진화 시 막대가 리셋되는 구간표 — FarmStatusBar 의 작물 아이콘 교체(크로스페이드)를
// 이 값과 같은 시각(0.62~0.7 구간)에 맞추려면 반드시 이 상수를 그대로 가져다 써야 한다.
// 여기서만 숫자를 들고 있고 FarmStatusBar 는 import 해서 쓴다 — 두 곳에 같은 숫자를
// 따로 적으면 한쪽만 바뀌었을 때 막대와 아이콘이 어긋난다.
export const GROW_FILL_DURATION = 0.9;
export const GROW_FILL_TIMES = [0, 0.42, 0.62, 0.7, 1];

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
 * @param {number|string} props.width  막대 최대 폭 (기본 `'100%'` — 항상 부모 칸 폭 그대로)
 * @param {number} props.height 막대 두께 (기본 5px. 좁은 형 `.fb.sm .tk` 는 4px)
 * @param {number} props.delay  채우기 시작을 늦추는 초 — 앞선 연출이 끝난 뒤 차오르게 할 때
 * @param {boolean} props.showGain  오른 구간을 밝게 덧칠할지. 이번에 오른 만큼을 구분해 보여
 *   주는 장치라, 0 에서 새로 채우는 막대(진화 직후 새 단계)에서는 꺼야 한다 —
 *   그 경우 막대 전체가 '오른 구간'이 되어 통째로 밝은 색이 되고, 다른 회차의 같은 막대와
 *   색이 달라진다.
 * @param {boolean} props.pending  서버 응답 대기 중(farmOptimistic.js pendingFarmPayload) —
 *   `pctFrom === pctTo` 라 실제로는 움직이지 않는 정지 상태다. 이 값이 바뀌는 순간(응답
 *   도착)은 반드시 새로 마운트한다 — 아래 주석 참고.
 * @param {string} props.className
 */
const CropProgressBar = ({
  pctFrom = 0,
  pctTo = 0,
  grew = false,
  tone = 'primary',
  width = '100%',
  height = 5,
  delay = 0,
  showGain = true,
  pending = false,
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
  /*
    【낙관값 → 서버값 교체가 두 번째 움직임으로 보이지 않게】 호출부(Main.jsx)는 채점 직후
    낙관적 추정치로 먼저 이 막대를 그리고, `/study/log` 응답이 오면 같은 자리에서 pctFrom/
    pctTo 를 정본 값으로 덮어쓴다(같은 질문이 떠 있는 동안 — 문제가 바뀌면 호출부가 이
    컴포넌트째로 새로 마운트한다). 예전엔 아래 `motion.span` 의 key 에 `from`/`to` 값을
    그대로 넣어서, 값이 한 프레임이라도 다르면 React 가 엘리먼트를 통째로 새로 만들어
    `initial` 부터 다시 재생했다 — 이미 30% 까지 차오른 막대가 순간 사라지고 처음부터
    다시 70% 로 차오르는 식으로, 실제로는 없는 "리셋 후 재성장"이 보였다.
    지금은 `grew` 가 바뀔 때만(추정과 다르게 진화 여부 자체가 뒤집힌 드문 경우) 다시
    마운트한다. 나머지는 같은 엘리먼트를 유지해 Framer Motion 이 **지금 멈춰 있는 지점에서
    새 목표값까지** 이어서 보간한다 — 낙관값과 서버값이 같으면 애초에 목표가 안 바뀌어
    재생되지 않고, 다르면 한 번의 연속된 움직임으로만 갱신된다.

    【pending → 확정 전환은 항상 새로 마운트한다】 `pending` 상태는 `pctFrom === pctTo`라
    막대가 실제로 정지해 있다(회전 중인 애니메이션이 없다) — 그래서 이 경계에서 리마운트해도
    "재생 중이던 움직임이 끊기는" 문제가 생기지 않는다. 반대로 리마운트하지 **않으면** 위험한
    경우가 있다 — 정지 중엔 항상 `grew=false`로 고정해 두는데, 확정 응답이 "단계가 올랐다"
    (`grew=true`)로 오면 `grew` 값 자체가 바뀌어 자동으로 리마운트되지만, 그 사이 프레임에서
    이미 몇 % 라도 그려진 채였다면(예: 정지 판정 로직이 언젠가 바뀌어 pending 인데도
    pctFrom≠pctTo가 되는 경우) 리마운트 없이 이어그리다 어색해질 수 있다. `pending` 자체를
    키에 넣어 두면 "정지 해제"라는 사건이 grew 값과 무관하게 **항상** 새 애니메이션의
    시작점이 되도록 보장된다 — 씨앗을 심는 순간(미학습→심은 씨앗, grew=true지만 시작이
    0→0인 회차)처럼 흔한 회차가 이 안전장치의 실사용 경로다.
  */
  const resets = to > 0;
  const fillAnimate = grew
    ? (resets
      ? { width: [`${from}%`, '100%', '100%', '0%', `${to}%`] }
      : { width: '100%' })
    : { width: `${to}%` };
  const fillTransition = grew
    ? (resets
      ? { duration: GROW_FILL_DURATION, delay, times: GROW_FILL_TIMES, ease: ['easeOut', 'linear', 'easeIn', 'easeOut'] }
      : { duration: 0.5, delay, ease: 'easeOut' })
    : { duration: 0.45, delay, ease: 'easeOut' };

  return (
    <span
      className={`relative block flex-1 rounded-[99px] bg-[#E8E8E8] dark:bg-[#454545] overflow-hidden ${className}`}
      style={{ maxWidth: width, height }}
    >
      <motion.span
        key={`fill-${pending ? 'p' : 'r'}-${grew ? 1 : 0}`}
        className="absolute left-0 top-0 bottom-0 rounded-[99px]"
        style={{ backgroundColor: color.fill }}
        initial={{ width: `${from}%` }}
        animate={fillAnimate}
        transition={fillTransition}
      />
      {gained && (
        // 이번 학습으로 오른 만큼만 밝게 남긴다 — 그게 '몇 % 올랐는지'다
        <motion.span
          key="gain"
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
          key="lost"
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
