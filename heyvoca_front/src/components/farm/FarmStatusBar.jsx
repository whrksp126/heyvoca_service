import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import CropImage, { CROP_ASSETS } from './CropImage';
import CropProgressBar from './CropProgressBar';
import { CROP_STAGES, cropIndex, stageToCrop } from '../../utils/crop';
import { vibrate } from '../../utils/osFunction';

/**
 * 당근 농장 V2 — 채점 후 상태 바. **모든 문제 유형이 이 하나를 쓴다.**
 * 시안 study.html 의 `.fb` / `.fb.up` / `.fb.ng` / `.fb.sm` 규격을 그대로 옮겼다.
 * (수치 정본은 시안 HTML 안의 CSS 다 — `study_css.py` 는 `.tk max-width` 가 78px 로 남아 있는
 *  구버전이라 따르지 않는다. 시안 렌더값은 132px.)
 *
 *   [작물 26px] [막대 5px] [+22%] [12일 뒤]
 *
 * - 단계명 텍스트를 넣지 않는다(시안 2절). 작물 그림이 이미 그 말이라 같은 말을 두 번 하게 된다.
 *   `.st` 슬롯은 부패 진단(6절)에서만 쓴다.
 * - 진화는 화살표로 이전→이후를 나열하지 않는다. 작물 자리 안에서 그래픽이 전환된다(3절).
 * - 오답은 막대가 **줄어든다**(FSRS 가 안정성을 깎으므로 실제로 멀어진 것이다).
 *   우측 문구는 비운다 — 틀린 단어는 이번 세션에서 바로 다시 나오므로 다음 예정일을 말하면 거짓이 된다.
 * - `compact` 는 카드 매칭용 좁은 형(`.fb.sm`)이다. 다른 구조가 아니라 **같은 컴포넌트가 접히는 것**이라
 *   `+N%` 만 접히고 작물·막대·일수는 남는다(시안 ⑩ 은 좁은 형에도 막대가 있다).
 */

/** 진화 스파클 — 새 작물이 솟아오를 때 바깥으로 튀는 세 점 (시안 `.fb .spk`) */
const SPARKS = [
  { className: 'top-0 left-[50%] ml-[-2px] w-[4px] h-[4px]', peak: 1 },
  { className: 'bottom-[3px] left-[1px] w-[3px] h-[3px]', peak: 0.8 },
  { className: 'top-[6px] right-0 w-[3px] h-[3px]', peak: 0.65 },
];

/*
  진화 연출 구간표 (전체 1.0초).

  정답 후 다음 문제로 넘어가는 지연이 1000ms 라, 그 안에 끝나야 애니메이션이 잘리지 않는다.

  【왜 제자리 크로스페이드를 그만뒀나】 예전에는 작물 자리 **하나**에서 이전 그림이 120ms 만에
  쪼그라들며 사라지고 새 그림이 튀어올랐다. 120ms 는 눈이 따라잡지 못하는 길이라,
  씨앗을 심는 순간 — 봉투(보유 씨앗)가 낱알(심은 씨앗)로 바뀌는, 첫 학습에서 14번 연속으로
  일어나는 그 순간 — 이 **처음부터 낱알이었던 것처럼** 보였다.
  지금은 두 그림을 동시에 세우고 그 사이를 막대가 채운다. 다 차면 앞 그림과 막대가 접히고
  뒷 그림이 그 자리로 미끄러져 들어온다 — "막대를 다 채워서 올라갔다"가 한 동작으로 읽힌다.
*/
const T_FILL     = 0.62;   // 막대가 100% 를 찍는 시점
const T_POP      = 0.80;   // 도착 작물이 가장 크게 부푸는 시점
const T_HOLD     = 0.76;   // 가득 찬 채로 붙잡아 두는 끝
const T_COLLAPSE = 0.94;   // 앞 그림·막대가 접히기를 마치는 시점
const T_TOTAL    = 1.0;    // 초 단위 전체 길이

const FarmStatusBar = ({
  crop,
  stage,
  crop_from: cropFrom,
  stage_from: stageFrom,
  grew = false,
  pct_from: pctFrom = 0,
  pct_to: pctTo = 0,
  health,
  days_to_review: daysToReview = null,
  wasCorrect = true,
  compact = false,
  // 부패 진단(시안 6절) 전용 — 채점 전부터 뜨는 `.fb.ng` 형. 삽 그림 + '삽 1개를 씁니다' + '맞히면 씨앗부터'
  diagnosis = false,
  className = '',
}) => {
  // 백엔드는 `crop`(화면 키)과 `stage`(visual_stage)를 함께 준다. 둘 중 있는 쪽을 쓴다.
  const cropKey = stageToCrop(crop || stage);
  // 진화 연출의 '이전 작물'. 서버가 crop_from 을 주면 그대로 쓴다.
  // 없을 때만 성장 순서에서 한 칸 앞을 추정한다 — 회복제로 단계가 복원되거나 한 번에
  // 두 단계가 오르면 추정이 틀리므로, 구버전 응답에 대한 폴백으로만 남겨 둔다.
  const prevCrop = (cropFrom || stageFrom)
    ? stageToCrop(cropFrom || stageFrom)
    : CROP_STAGES[Math.max(0, cropIndex(cropKey) - 1)];

  /*
    그림에 넘길 값은 crop 키가 아니라 **visual_stage** 를 먼저 쓴다.
    씨앗은 crop 키가 하나뿐이라(`seed`) 봉투(안 심음)와 낱알(심음)이 같은 값이 된다.
    그대로 그리면 첫 정답 — 즉 씨앗을 심는 순간 — 에 전환 연출이 돌면서도 앞뒤 그림이
    똑같아 아무 일도 안 일어난 것처럼 보인다. 온보딩 첫 학습은 14문항이 전부 이 전환이다.
    다른 단계는 visual_stage 를 넣어도 같은 그림이라 달라지는 게 없다.
  */
  const cropForImage = stage || crop || cropKey;
  const prevCropForImage = stageFrom || cropFrom || prevCrop;

  const isNg = diagnosis || wasCorrect === false;
  const tone = grew ? 'up' : (isNg ? 'ng' : 'primary');
  // 오답은 막대가 늘지 않는다(2절) — 시안 ⑤ 에는 `u`(오른 구간)도 `pc`(+N%)도 없다.
  const gain = !grew && !isNg && pctTo > pctFrom ? Math.round(pctTo - pctFrom) : 0;

  const size = compact ? 18 : 26;
  const barH = compact ? 4 : 5;
  const gap = compact ? 6 : 10;
  // 접힘 애니메이션은 px 로만 보간된다 — 좁은 형의 '100%' 는 사실상 무제한이므로 큰 수로 둔다
  const barMax = compact ? 999 : 132;

  /*
    진화 회차에만 두 그림을 세운다. 같은 단계에 머무는 정답까지 이 배치를 쓰면
    매 문제마다 "아직 못 간 다음 단계"가 눈에 밟혀, 성과가 아니라 남은 거리를 말하는
    화면이 된다. 그때는 예전 그대로 [작물] [막대] [n일 뒤] 한 줄이다.
  */
  const growLayout = grew && !diagnosis;

  // 진화한 순간에만 햅틱을 한 번 준다 (채점 햅틱은 문제 화면이 이미 준다)
  const buzzedRef = useRef(false);
  useEffect(() => {
    if (grew && !buzzedRef.current) {
      buzzedRef.current = true;
      vibrate({ duration: 5 });
    }
  }, [grew]);

  /*
    우측 문구 — 다음에 언제 만나는지만 알린다.

    **오답에는 아무 말도 적지 않는다.** 예전에는 '내일 다시'라고 적었는데 사실이 아니다.
    틀린 단어는 재출제 큐에 들어가 **이번 세션에서 바로 다시** 나온다(takeTest enqueueRetry).
    FSRS 가 잡아 준 다음 예정일(대개 내일)은 이 세션을 끝낸 뒤의 이야기라,
    방금 틀린 화면에서 그 날짜를 말하면 "오늘은 이 단어 끝"으로 읽힌다.
    오답이 무슨 일을 했는지는 줄어드는 막대가 말한다.
  */
  let dayLabel = null;
  let daySuffix = '뒤';
  if (wasCorrect === false) {
    dayLabel = null;
  } else if (typeof daysToReview === 'number' && daysToReview >= 1) {
    if (daysToReview <= 1) {
      // '내일 다시'라고 쓰지 않는다 — '다시'는 이번 세션에서 또 나온다는 뜻으로 읽히는데,
      // 정답을 맞힌 단어는 이 세션에서 다시 나오지 않는다. 날짜만 말한다.
      dayLabel = '내일';
      daySuffix = '';
    } else {
      dayLabel = `${daysToReview}일`;
    }
  }

  const radius = compact ? 'rounded-[8px]' : 'rounded-[11px]';

  /*
    보여줄 게 하나도 없으면 아예 그리지 않는다.

    '내용이 있다'는 아래 넷 중 하나다.
    - 우측 문구(dayLabel)가 있다
    - 진화했다(grew) — 진화 연출 자체가 내용이다
    - 진단(diagnosis) — 삽 그림 + 안내 문구가 뜨는 별도 연출 상태
    - 막대가 실제로 움직인다(pctTo !== pctFrom) — **늘어나는 것만이 아니라 줄어드는 것도 포함.**
      오답은 우측 문구를 비우지만(위 주석), FSRS 가 안정성을 깎아 막대가 줄었다면
      그 자체가 "이 답이 무슨 일을 했는지"를 말하는 유일한 정보라 숨기면 안 된다.

    이 넷이 전부 없다면(정오답 무관) 작물 그림과 빈 회색 막대만 남아 자리만 차지하므로
    호출부의 absolute 컨테이너째로 접히도록 null 을 반환한다.
  */
  const hasContent = Boolean(diagnosis || dayLabel || grew || pctTo !== pctFrom);
  if (!hasContent) {
    return null;
  }

  return (
    <div
      className={`
        relative flex items-center
        ${compact ? 'h-[26px] px-[8px] gap-[6px]' : 'h-[40px] px-[12px] gap-[10px]'}
        ${radius}
        bg-layout-white dark:bg-[#2E2E2E]
        shadow-[0_1px_6px_rgba(0,0,0,0.06)] dark:shadow-none
        ${className}
      `}
    >
      {/* 진화해도 **면 색은 바뀌지 않는다.** 시안(study.html 3절)은 여기서 면 전체를
          연초록으로 덧칠했는데, 상태 바는 흰 카드 위에 뜨는 작은 띠라 면이 통째로 물들면
          초록이 화면에서 가장 큰 색 덩어리가 되어 버린다. 성장은 막대와 작물이 말하고,
          면은 다른 회차와 같은 표면을 유지한다. */}

      {growLayout ? (
        /* ── 진화 회차 — 앞 그림에서 뒤 그림으로 건너간다 ─────────────────── */
        <>
          {/* ① 출발 작물(봉투). 막대가 다 차면 폭 0으로 접히며 사라진다.
              음수 marginRight 는 접힐 때 부모의 gap 까지 같이 지우기 위한 것이다. */}
          <motion.span
            className="relative z-[1] flex-shrink-0 flex items-center justify-center overflow-hidden"
            style={{ height: size }}
            initial={{ width: size, opacity: 1, marginRight: 0 }}
            animate={{ width: [size, size, 0, 0], opacity: [1, 1, 0, 0], marginRight: [0, 0, -gap, -gap] }}
            transition={{ duration: T_TOTAL, times: [0, T_HOLD, T_COLLAPSE, 1], ease: 'easeInOut' }}
          >
            <CropImage stage={prevCropForImage} health={health} size={size} alt="" />
          </motion.span>

          {/* ② 건너가는 막대 — 0 → 100% 로 채우고, 다 차면 출발 작물과 함께 접힌다 */}
          <motion.span
            className="relative z-[1] flex flex-1 min-w-0 items-center"
            initial={{ maxWidth: barMax, opacity: 1, marginRight: 0 }}
            animate={{
              maxWidth: [barMax, barMax, 0, 0],
              opacity: [1, 1, 0, 0],
              marginRight: [0, 0, -gap, -gap],
            }}
            transition={{ duration: T_TOTAL, times: [0, T_HOLD, T_COLLAPSE, 1], ease: 'easeInOut' }}
          >
            <span
              className="block w-full rounded-[99px] bg-[#E8E8E8] dark:bg-[#454545] overflow-hidden"
              style={{ height: barH }}
            >
              <motion.span
                className="block h-full rounded-[99px] bg-status-success-600"
                initial={{ width: '0%' }}
                animate={{ width: ['0%', '100%', '100%', '100%'] }}
                transition={{ duration: T_TOTAL, times: [0, T_FILL, T_HOLD, 1], ease: 'easeOut' }}
              />
            </span>
          </motion.span>

          {/* ③ 도착 작물(낱알) — 흐리게 서 있다가 막대가 차는 동안 또렷해지고, 다 차면 한 번 부푼다.
              처음부터 또렷하면 '이미 도달했다'로 읽혀 막대를 채울 이유가 사라진다. */}
          <span
            className="relative z-[1] flex-shrink-0 flex items-center justify-center"
            style={{ width: size, height: size }}
          >
            <motion.span
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0.28, filter: 'grayscale(1)', scale: 1 }}
              animate={{
                opacity: [0.28, 1, 1, 1],
                filter: ['grayscale(1)', 'grayscale(0)', 'grayscale(0)', 'grayscale(0)'],
                scale: [1, 1, 1.18, 1],
              }}
              transition={{
                opacity: { duration: T_TOTAL, times: [0, T_FILL, T_HOLD, 1], ease: 'easeOut' },
                filter: { duration: T_TOTAL, times: [0, T_FILL, T_HOLD, 1], ease: 'easeOut' },
                scale: { duration: T_TOTAL, times: [0, T_FILL, T_POP, T_COLLAPSE], ease: 'easeOut' },
              }}
            >
              <CropImage stage={cropForImage} health={health} size={size} />
            </motion.span>
            {/* 스파클은 막대가 다 찬 순간에 튄다 */}
            <span className={`absolute ${compact ? 'inset-[-5px]' : 'inset-[-7px]'} pointer-events-none`}>
              {SPARKS.map((spark, i) => (
                <motion.i
                  key={i}
                  className={`absolute rounded-full bg-status-success-500 ${spark.className}`}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: [0, 1, 0.6], opacity: [0, spark.peak, 0] }}
                  transition={{ duration: 0.32, delay: T_FILL + i * 0.02, ease: 'easeOut' }}
                />
              ))}
            </span>
          </span>

          {/* ④ 안착 — 새 단계의 막대와 다음 복습일이 뒤늦게 들어온다.
              **빈 막대로 들어와서 그 자리에서 차오른다.** 예전에는 이미 채워진 채로 나타났는데,
              그러면 새 단계에서 얼마나 왔는지가 '주어진 값'으로 보여서, 방금 맞힌 것이
              여기에도 기여했다는 게 읽히지 않았다. 앞 막대가 다 접힌 뒤(T_COLLAPSE)에 시작하므로
              두 막대가 동시에 차오르는 일은 없다. */}
          <motion.span
            className="relative z-[1] flex flex-1 min-w-0 items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0, 1] }}
            transition={{ duration: T_TOTAL, times: [0, T_COLLAPSE, 1], ease: 'easeOut' }}
          >
            <CropProgressBar
              pctFrom={0}
              pctTo={pctTo}
              grew={false}
              tone="primary"
              width={compact ? '100%' : 132}
              height={barH}
              /* 앞 연출이 끝나고 이 막대가 다 보이게 된 뒤부터 채운다 */
              delay={T_TOTAL}
              /* 0 에서 채우므로 막대 전체가 '오른 구간'이 된다 — 밝은 덧칠을 끄지 않으면
                 이 회차만 막대 색이 연해진다(CropProgressBar showGain 주석) */
              showGain={false}
            />
          </motion.span>

          {dayLabel && (
            <motion.span
              className={`
                relative z-[1] flex-shrink-0 whitespace-nowrap font-[600] tracking-[-0.02em] text-layout-gray-300
                ${compact ? 'text-[10.5px]' : 'text-[12px]'}
              `}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0, 1] }}
              transition={{ duration: T_TOTAL, times: [0, T_COLLAPSE, 1], ease: 'easeOut' }}
            >
              <b className="font-[700] text-layout-black dark:text-layout-white">{dayLabel}</b>
              {daySuffix ? ` ${daySuffix}` : ''}
            </motion.span>
          )}
        </>
      ) : (
      <>
      {/* 작물 자리 — 진화하지 않는 회차는 그림 하나만 선다.
          원으로 감싸지 않는다(2절): 에셋 자체가 형태를 가진 그림이다. */}
      <span
        className="relative z-[1] flex-shrink-0 flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        {diagnosis ? (
          <img
            src={CROP_ASSETS.shovel}
            alt="삽"
            draggable={false}
            className="object-contain select-none"
            style={{ width: size, height: size }}
          />
        ) : (
          /* 이 갈래에는 진화가 오지 않는다(growLayout 이 먼저 받는다) — 그림 한 장을 그대로 놓는다 */
          <motion.span
            key={cropKey}
            className="absolute inset-0 flex items-center justify-center"
            initial={{ scale: 1, opacity: 1 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <CropImage stage={cropForImage} health={health} size={size} />
          </motion.span>
        )}
      </span>

      {/* 가운데 — 이번 학습으로 오른 만큼이 밝게 얹힌다.
          부패 진단만 막대 대신 `.st` 문구를 쓴다(6절). */}
      <div className={`relative z-[1] flex flex-1 min-w-0 items-center ${compact ? 'gap-[6px]' : 'gap-[8px]'}`}>
        {diagnosis ? (
          /* 라이트는 시안 값(#B54708) 그대로. 다크는 아래 복습일 강조와 같은 이유로
             밝은 쪽으로 되돌린다 — #B54708 이 다크 surface(#2E2E2E) 위에서 안 읽힌다. */
          <span className="flex-shrink-0 text-[12.5px] font-[800] tracking-[-0.02em] text-[#B54708] dark:text-secondary-yellow-400">
            삽 1개를 씁니다
          </span>
        ) : (
          <>
            <CropProgressBar
              pctFrom={pctFrom}
              /* 오답이면 막대가 실제로 줄어든다. FSRS 는 오답에서 안정성을 깎으므로
                 (soft lapse — stability × 0.3, 연속 오답이면 × 0.1) 다음 단계까지의
                 거리가 정말로 멀어진 것이고, 화면이 그걸 감추면 왜 다시 나오는지가
                 설명되지 않는다. 예전에는 여기서 pctFrom 으로 눌러 제자리에 세웠다. */
              pctTo={pctTo}
              grew={grew}
              tone={tone}
              width={compact ? '100%' : 132}
              height={compact ? 4 : 5}
            />
            {!compact && gain > 0 && (
              <motion.span
                className={`flex-shrink-0 text-[11.5px] font-[800] tracking-[-0.02em] ${grew ? 'text-status-success-600' : 'text-primary-main-600'}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.15, ease: [0.4, 0, 0.2, 1] }}
              >
                +{gain}%
              </motion.span>
            )}
          </>
        )}
      </div>

      {/* 오른쪽 — 다음 복습일. 진단에서는 '맞히면 씨앗부터'가 그 자리를 쓴다(6절). */}
      {diagnosis ? (
        <span className={`relative z-[1] flex-shrink-0 whitespace-nowrap font-[600] tracking-[-0.02em] text-layout-gray-300 ${compact ? 'text-[10.5px]' : 'text-[12px]'}`}>
          맞히면 <b className="font-[700] text-layout-black dark:text-layout-white">씨앗</b>부터
        </span>
      ) : dayLabel && (
        <span
          className={`
            relative z-[1] flex-shrink-0 whitespace-nowrap font-[600] tracking-[-0.02em] text-layout-gray-300
            ${compact ? 'text-[10.5px]' : 'text-[12px]'}
          `}
        >
          {/* 오답 강조색(#B54708)은 다크 surface(#2E2E2E) 위에서 거의 안 읽힌다 —
              시안에는 다크 대응 규칙이 없어 밝은 쪽으로 되돌린다. */}
          <b className={`font-[700] ${wasCorrect === false ? 'text-[#B54708] dark:text-secondary-yellow-400' : 'text-layout-black dark:text-layout-white'}`}>
            {dayLabel}
          </b>
          {daySuffix ? ` ${daySuffix}` : ''}
        </span>
      )}
      </>
      )}
    </div>
  );
};

export default FarmStatusBar;
