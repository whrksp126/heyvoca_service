import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import CropImage, { CROP_ASSETS } from './CropImage';
import CropProgressBar, { GROW_FILL_DURATION, GROW_FILL_TIMES } from './CropProgressBar';
import { CROP_STAGES, cropIndex, stageToCrop } from '../../utils/crop';
import { vibrate } from '../../utils/osFunction';

/**
 * 당근 농장 V2 — 채점 후 상태 바. **모든 문제 유형이 이 하나를 쓴다.**
 * 시안 study.html 의 `.fb` / `.fb.up` / `.fb.ng` / `.fb.sm` 규격을 그대로 옮겼다.
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
 *
 * 【채점 결과 게이지는 값 하나로만 움직인다 — 2026-09 정리】
 * 이전 구현은 진화(단계 상승) 회차에 "이전 작물 + 건너가는 막대"와 "새 작물 + 안착 막대"를
 * 나란히 두 요소로 세워 순서대로 접고 펼쳤다. 문제는 그 두 막대가 **서로 다른 칸 폭**을
 * 나눠 쓴다는 것 — 건너가는 막대는 옆에 작물 그림 두 개(이전·도착)와 자리를 나누느라
 * 실제 카드 폭보다 짧게 보이고, 접힌 뒤 안착 막대는 그림 하나만 남아 꽉 찬 폭으로 보였다.
 * 같은 막대인데 폭이 바뀌니 "짧은 초록 막대가 차오르다가 리셋되고 긴 분홍 막대가 다시
 * 차오른다"는, 실제로는 없는 **세 번째 움직임**처럼 읽혔다.
 *
 * 지금은 막대·작물 자리를 **각각 하나씩만** 쓴다. 막대는 `CropProgressBar` 하나가 그대로
 * 담당한다 — 진화 회차엔 그 컴포넌트가 이미 갖고 있는 "학습 전 진행률 → 100% → 0% → 새
 * 진행률"의 2단 리셋 애니메이션을 쓴다(요구사항 B: 이 경우만 두 번 움직인다). 값의 정본은
 * FSRS stability 기반 **단계 내 진행률**(`stageProgress`, farmOptimistic.js 와 동일 축) 하나뿐이고,
 * "N일 뒤"는 그 옆에 붙는 텍스트일 뿐 별도의 막대가 아니다(요구사항 A). 폭은 항상 부모 칸의
 * 100%(`CropProgressBar` 기본값) — 카드 매칭처럼 좁은 칸이든 4지선다 카드든 같은 규칙이다(요구사항 C).
 *
 * 작물 그림도 자리를 하나만 쓴다. 이전 그림과 새 그림을 같은 정사각형 칸 안에 **겹쳐 놓고**
 * 크로스페이드한다(3절 "화살표가 아니라 그래픽 전환") — 옆으로 나열하지 않으므로 막대 폭을
 * 잠식하지 않는다. 전환 시점은 막대가 100%를 찍고 리셋되는 구간(`GROW_FILL_TIMES`의
 * 0.62~0.7)에 맞춘다 — 막대와 아이콘이 같은 순간에 같이 바뀌어야 "막대를 다 채워서
 * 올라갔다"가 한 동작으로 읽힌다(요구사항 B 후반). 두 상수(`GROW_FILL_DURATION`,
 * `GROW_FILL_TIMES`)는 `CropProgressBar`에서 가져와 쓴다 — 각자 따로 숫자를 적으면
 * 나중에 한쪽만 바뀌었을 때 막대와 아이콘이 어긋난다.
 *
 * 【씨앗을 심는 순간은 왜 여전히 느리게 보이나】 예전에 120ms 제자리 크로스페이드를 쓰다가
 * 버렸던 이유(첫 학습 14문항 전부가 "봉투→낱알" 전환인데 120ms 는 너무 빨라 처음부터
 * 낱알이었던 것처럼 보였다)는 여전히 유효하다. 지금 크로스페이드는 막대의 리셋 구간
 * (0.9초 중 0.62~0.7초)에 걸려 있어 그보다 훨씬 느리므로 같은 문제가 재발하지 않는다.
 */

/** 진화 스파클 — 새 작물이 솟아오를 때 바깥으로 튀는 세 점 (시안 `.fb .spk`) */
const SPARKS = [
  { className: 'top-0 left-[50%] ml-[-2px] w-[4px] h-[4px]', peak: 1 },
  { className: 'bottom-[3px] left-[1px] w-[3px] h-[3px]', peak: 0.8 },
  { className: 'top-[6px] right-0 w-[3px] h-[3px]', peak: 0.65 },
];

// 막대가 100%를 찍고 리셋되는 구간(GROW_FILL_TIMES 의 index 2~3) — 작물 아이콘의
// 크로스페이드도 정확히 이 구간에서 일어나야 막대·아이콘이 같은 순간에 바뀐다.
const [, , GROW_RESET_START, GROW_RESET_END] = GROW_FILL_TIMES;
const ICON_SWAP_TIMES = [0, GROW_RESET_START, GROW_RESET_END, 1];

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
  // 서버 응답 대기 중(farmOptimistic.js pendingFarmPayload) — 채점 전 값에 멈춰 있고
  // 움직이지 않는다. pctTo === pctFrom 이라 다른 이유가 없으면 hasContent 가 접어 버리므로
  // 이 상태에서도 그려야 한다는 걸 명시적으로 알려준다.
  pending = false,
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
  // 정지 상태(pending)는 톤도 '이전 상태' 그대로다 — 아직 아무것도 움직이지 않았는데
  // 오답이라는 이유만으로 막대 색이 먼저 주황으로 바뀌면 "벌써 줄었다"로 잘못 읽힌다.
  // 실제로 줄어드는 건 서버 응답이 와서 pending 이 풀리는 순간이다.
  const tone = grew ? 'up' : (isNg && !pending ? 'ng' : 'primary');
  // 오답은 막대가 늘지 않는다(2절) — 시안 ⑤ 에는 `u`(오른 구간)도 `pc`(+N%)도 없다.
  const gain = !grew && !isNg && pctTo > pctFrom ? Math.round(pctTo - pctFrom) : 0;

  const size = compact ? 18 : 26;
  const barH = compact ? 4 : 5;

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
    - 서버 응답을 기다리는 중(pending) — 아직 움직이진 않지만 "채점됐다"는 것 자체는
      바로 보여줘야 한다. 여기서 접으면 응답이 오는 순간 바가 없다가 갑자기 나타나
      역시 "화면이 비었다가 채워진다"는 어색함이 생긴다.

    이 다섯이 전부 없다면(정오답 무관) 작물 그림과 빈 회색 막대만 남아 자리만 차지하므로
    호출부의 absolute 컨테이너째로 접히도록 null 을 반환한다.
  */
  const hasContent = Boolean(diagnosis || dayLabel || grew || pctTo !== pctFrom || pending);
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

      {/* 작물 자리 — 이전·새 그림이 같은 정사각형 칸에 겹쳐 서서 크로스페이드한다(위 파일
          상단 주석). 옆으로 나열하지 않으므로 막대 폭을 잠식하지 않는다.
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
        ) : grew ? (
          <>
            {/* 이전 작물 — 막대가 리셋되는 순간(GROW_RESET_START~END)에 사라진다 */}
            <motion.span
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 1, scale: 1 }}
              animate={{ opacity: [1, 1, 0, 0], scale: [1, 1, 0.7, 0.7] }}
              transition={{ duration: GROW_FILL_DURATION, times: ICON_SWAP_TIMES, ease: 'easeInOut' }}
            >
              <CropImage stage={prevCropForImage} health={health} size={size} align="center" alt="" />
            </motion.span>
            {/* 새 작물 — 같은 순간에 흙에서 솟듯 튀어오른다 */}
            <motion.span
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: [0, 0, 1, 1], scale: [0.4, 0.4, 1.18, 1] }}
              transition={{ duration: GROW_FILL_DURATION, times: ICON_SWAP_TIMES, ease: 'easeOut' }}
            >
              <CropImage stage={cropForImage} health={health} size={size} align="center" />
            </motion.span>
            {/* 스파클은 막대가 리셋을 시작하는 순간 튄다 */}
            <span className={`absolute ${compact ? 'inset-[-5px]' : 'inset-[-7px]'} pointer-events-none`}>
              {SPARKS.map((spark, i) => (
                <motion.i
                  key={i}
                  className={`absolute rounded-full bg-status-success-500 ${spark.className}`}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: [0, 1, 0.6], opacity: [0, spark.peak, 0] }}
                  transition={{ duration: 0.32, delay: GROW_FILL_DURATION * GROW_RESET_START + i * 0.02, ease: 'easeOut' }}
                />
              ))}
            </span>
          </>
        ) : (
          /* 진화하지 않는 회차 — 그림 한 장을 그대로 놓는다 */
          <CropImage stage={cropForImage} health={health} size={size} align="center" />
        )}
      </span>

      {/* 가운데 — 막대 하나가 값 하나(단계 내 진행률)만 말한다.
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
            {/* 진화 회차엔 이 컴포넌트가 자체적으로 pctFrom→100%→0%→pctTo 2단 리셋을
                재생한다(요구사항 B) — 별도의 두 번째 막대를 세우지 않는다. 폭은 기본값
                (부모 칸의 100%)을 그대로 써서 어떤 문제 유형에서도 트랙 길이가 같다(요구사항 C). */}
            <CropProgressBar
              pctFrom={pctFrom}
              /* 오답이면 막대가 실제로 줄어든다. FSRS 는 오답에서 안정성을 깎으므로
                 (soft lapse — stability × 0.3, 연속 오답이면 × 0.1) 다음 단계까지의
                 거리가 정말로 멀어진 것이고, 화면이 그걸 감추면 왜 다시 나오는지가
                 설명되지 않는다. 예전에는 여기서 pctFrom 으로 눌러 제자리에 세웠다. */
              pctTo={pctTo}
              grew={grew}
              tone={tone}
              height={barH}
            />
            {/* `+N%` 배지 자리를 **항상** 고정폭으로 예약한다. 예전엔 gain>0 일 때만
                엘리먼트를 넣어서, 정지 상태(pending·오답)엔 이 자리가 아예 없다가 응답이
                오는 순간 막대의 flex-1 몫이 그만큼 줄어 트랙이 짧아진 것처럼 보였다. */}
            {!compact && (
              <span className="relative z-[1] flex-shrink-0 w-[34px] text-right">
                {gain > 0 && (
                  <motion.span
                    className={`text-[11.5px] font-[800] tracking-[-0.02em] ${grew ? 'text-status-success-600' : 'text-primary-main-600'}`}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: 0.15, ease: [0.4, 0, 0.2, 1] }}
                  >
                    +{gain}%
                  </motion.span>
                )}
              </span>
            )}
          </>
        )}
      </div>

      {/* 오른쪽 — 다음 복습일. 진단에서는 '맞히면 씨앗부터'가 그 자리를 쓴다(6절).
          진단이 아닌 자리는 텍스트가 있든 없든(pending·오답) **항상 같은 폭을 예약**한다 —
          '내일'(2자)과 '14일 뒤'(4자)처럼 라벨 길이가 회차마다 달라, 텍스트가 있을 때만
          렌더링하면 그 폭만큼 가운데 막대의 flex-1 몫이 오락가락해 트랙 길이가 흔들렸다. */}
      {diagnosis ? (
        <span className={`relative z-[1] flex-shrink-0 whitespace-nowrap font-[600] tracking-[-0.02em] text-layout-gray-300 ${compact ? 'text-[10.5px]' : 'text-[12px]'}`}>
          맞히면 <b className="font-[700] text-layout-black dark:text-layout-white">씨앗</b>부터
        </span>
      ) : (
        <span
          className={`
            relative z-[1] flex-shrink-0 whitespace-nowrap text-right tabular-nums
            font-[600] tracking-[-0.02em] text-layout-gray-300
            ${compact ? 'min-w-[34px] text-[10.5px]' : 'min-w-[42px] text-[12px]'}
          `}
        >
          {dayLabel && (
            <>
              {/* 오답 강조색(#B54708)은 다크 surface(#2E2E2E) 위에서 거의 안 읽힌다 —
                  시안에는 다크 대응 규칙이 없어 밝은 쪽으로 되돌린다. */}
              <b className={`font-[700] ${wasCorrect === false ? 'text-[#B54708] dark:text-secondary-yellow-400' : 'text-layout-black dark:text-layout-white'}`}>
                {dayLabel}
              </b>
              {daySuffix ? ` ${daySuffix}` : ''}
            </>
          )}
        </span>
      )}
    </div>
  );
};

export default FarmStatusBar;
