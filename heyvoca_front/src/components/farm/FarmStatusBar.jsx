import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import CropImage, { CROP_ASSETS } from './CropImage';
import CropProgressBar, { GROW_FILL_DURATION, GROW_FILL_TIMES } from './CropProgressBar';
import { CROP_STAGES, CROP_LABEL, cropIndex, stageToCrop, withRo, isUnplantedStage } from '../../utils/crop';
import { deriveFarmXp, xpBarPct, sameXpBand } from '../../utils/cropXp';
import { haptic, pickVariant, useCountUp } from '../../lib/feel';
import { FARM_ANIM_MS, FARM_ANIM_GROW_MS } from '../../utils/studyTiming';

/**
 * 당근 농장 V2 — 채점 후 상태 바. **모든 문제 유형이 이 하나를 쓴다.**
 * 시안 study.html 의 `.fb` / `.fb.up` / `.fb.ng` / `.fb.sm` 규격을 그대로 옮겼다.
 *
 *   [작물 26px] [막대 5px + XP 서브로우] [+N XP]     ← normal(2026-09 XP 개편, 아래 별도 주석)
 *   [작물 18px] [막대 4px] [+N XP]                   ← compact 윗줄
 *   [XP 서브로우]                                    ← compact 아랫줄(2026-09-26 통일)
 *
 * - 단계명 텍스트를 넣지 않는다(시안 2절). 작물 그림이 이미 그 말이라 같은 말을 두 번 하게 된다.
 *   `.st` 슬롯은 부패 진단(6절)에서만 쓴다.
 * - 진화는 화살표로 이전→이후를 나열하지 않는다. 작물 자리 안에서 그래픽이 전환된다(3절).
 * - 오답은 막대가 **줄어든다**(FSRS 가 안정성을 깎으므로 실제로 멀어진 것이다).
 *   우측 문구는 비운다 — 틀린 단어는 이번 세션에서 바로 다시 나오므로 다음 예정일을 말하면 거짓이 된다.
 * - `compact` 는 카드 매칭용 좁은 형(`.fb.sm`)이다. 다른 구조가 아니라 **같은 조각을 두 줄로 쌓은 것**이라
 *   작물·막대·배지·XP 서브로우(현재/다음 XP·진화 문구)가 normal 과 같은 의미로 모두 있다.
 *   (예전엔 XP 서브로우가 접혀 카드 맞추기에서만 수치·진화 문구가 안 보였다 — 2026-09-26 통일)
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

/**
 * 【2026-09 작물 경험치(XP) 표시 — crop_xp_contract.md §3, 2026-09-26 실기기 피드백 반영】
 *
 *   normal : [작물] [막대 / `12 / 50 XP` · (진화 문구)] [+N XP]
 *   compact: [작물] [막대] [+N XP] / 아랫줄 `12 / 50 XP` · (진화 문구)
 *
 * - **복습일·경과 문구는 여기서 뺐다.** "N일 뒤 복습"/"N시간 전에 풀었어요"는 문제 카드
 *   우측 상단(`StudyTimingTag`)이 전담한다. 상태 바는 작물·막대·XP 만 말한다.
 * - **막대는 XP 축으로 그린다**(`xpBarPct`). 서버 pct(stage_progress)는 심은 씨앗에서
 *   시간 기반이라 `12 / 50 XP` 옆에 0% 막대가 서는 식으로 숫자와 막대가 어긋났다.
 * - 진화 리셋(→100%→0%→새 진행률)은 **XP 문턱을 실제로 넘을 때만** 쓴다. 미보유 씨앗 →
 *   심은 씨앗은 단계는 오르지만 문턱(0→50)이 같아 그냥 차오른다(0 / 50 → 12 / 50).
 * - 숫자는 막대와 같은 시간 동안 굴러간다(현재 XP: xp_from→xp_to, 배지: 0→|Δ|).
 * - 배지는 compact 에서도 `XP` 단위를 붙인다(예전엔 숫자만이라 무엇의 +12 인지 안 읽혔다).
 * - 【2026-09-26 막대 실종 버그】 normal 가운데 칸이 XP 서브로우 때문에 `flex-col` 이 됐는데
 *   막대(CropProgressBar)는 `flex-1`(flex-basis 0%)이었다. 세로 방향 flex 에서 높이가
 *   정해지지 않은 부모 안의 `flex-basis: 0%` 는 내용 높이(=0, 채움 span 은 absolute)로
 *   풀려 막대 높이가 0 이 됐다 — 숫자만 남고 게이지가 사라진 원인. 막대는 이제
 *   `flex-none w-full` 로 세로 칸에 들어간다(`block` prop).
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
  // 복습일은 문제 카드 우측 상단(StudyTimingTag)으로 옮겼다 — 호출부 호환을 위해 받기만 한다.
  // eslint-disable-next-line no-unused-vars
  days_to_review: _daysToReview = null,
  wasCorrect = true,
  // 작물 경험치(crop_xp_contract.md §1) — 서버 /study/log 농장 payload 의 xp_from/xp_to/
  // xp_delta/xp_next 를 그대로 받는다. 없으면(게스트·재출제·구버전 응답) deriveFarmXp 가
  // pct_from/pct_to 로 역산한다.
  xp_from: xpFromProp,
  xp_to: xpToProp,
  xp_delta: xpDeltaProp,
  xp_next: xpNextProp,
  // 같은 날 재복습 표시도 카드 우측 상단("오늘 학습")으로 옮겼다 — 받기만 한다.
  // eslint-disable-next-line no-unused-vars
  sameDayElapsedHours: _sameDayElapsedHours = null,
  compact = false,
  // 부패 진단(시안 6절) 전용 — 채점 전부터 뜨는 `.fb.ng` 형. 삽 그림 + '삽 1개를 씁니다' + '맞히면 씨앗부터'
  diagnosis = false,
  // 서버 응답 대기 중(farmOptimistic.js pendingFarmPayload) — 채점 전 값에 멈춰 있고
  // 움직이지 않는다. 응답이 오면 같은 엘리먼트에서 막대·숫자가 한 번 움직인다.
  pending = false,
  // 전환 게이트용 — 연출 시작(pending 해제 순간)·끝(FARM_ANIM_* 뒤) 신호
  onAnimStart,
  onSettled,
  className = '',
}) => {
  // 백엔드는 `crop`(화면 키)과 `stage`(visual_stage)를 함께 준다. 둘 중 있는 쪽을 쓴다.
  const cropKey = stageToCrop(crop || stage);
  // 진화 연출의 '이전 작물'. 서버가 crop_from 을 주면 그대로 쓴다.
  // 없을 때만 성장 순서에서 한 칸 앞을 추정한다(구버전 응답 폴백).
  const prevCrop = (cropFrom || stageFrom)
    ? stageToCrop(cropFrom || stageFrom)
    : CROP_STAGES[Math.max(0, cropIndex(cropKey) - 1)];

  /*
    그림에 넘길 값은 crop 키가 아니라 **visual_stage** 를 먼저 쓴다.
    씨앗은 crop 키가 하나뿐이라(`seed`) 봉투(안 심음)와 낱알(심음)이 같은 값이 된다.
  */
  const cropForImage = stage || crop || cropKey;
  const prevCropForImage = stageFrom || cropFrom || prevCrop;

  const isNg = diagnosis || wasCorrect === false;
  // 정지 상태(pending)는 톤도 '이전 상태' 그대로다 — 아직 아무것도 움직이지 않았는데
  // 오답이라는 이유만으로 막대 색이 먼저 주황으로 바뀌면 "벌써 줄었다"로 잘못 읽힌다.
  const tone = grew ? 'up' : (isNg && !pending ? 'ng' : 'primary');

  const { xpFrom: xpFromPayload, xpTo, xpNext: xpNextVal } = deriveFarmXp({
    stageFrom: prevCropForImage,
    stageTo: cropForImage,
    pctFrom,
    pctTo,
    xpFromServer: xpFromProp,
    xpToServer: xpToProp,
    xpDeltaServer: xpDeltaProp,
    xpNextServer: xpNextProp,
  });

  /*
    【배지 = 이번 답안으로 얻은 총 XP, 채점 전 표시값 기준 — 2026-09-26】
    배지는 서버 xp_delta 를 그대로 믿지 않고 `xp_to − (채점 전 화면에 떠 있던 XP)` 로 계산한다.
    채점 직후엔 pendingFarmPayload(정지 상태)가 먼저 떠 있고, 응답이 오면 **같은 엘리먼트**에서
    숫자가 그 정지값부터 굴러간다(useCountUp 은 prop 이 바뀌면 현재 표시값에서 출발). 그러니
    사용자가 본 증가폭은 "정지값 → xp_to" 이고, 배지도 같은 두 숫자에서 나와야 어긋나지 않는다.
    처음부터 확정값으로 마운트된 경우(게스트·재출제)는 payload 의 xp_from 이 곧 채점 전 값이다.
    진화 회차도 마찬가지 — 새 단계 floor 로 from 을 자르지 않는다(새싹 190 → 이파리 244 = +54).
    서버 xp_from 도 같은 정의(이전 단계 기준 채점 전 XP)라 보통은 두 값이 같다(tests/test_crop_xp.py).
  */
  const [xpBefore] = useState(() => (pending ? xpTo : xpFromPayload));
  const xpFrom = xpBefore;
  const xpDelta = pending ? 0 : xpTo - xpBefore;

  // 막대 — XP 축(위 주석). 진화 리셋은 XP 문턱을 실제로 넘을 때만.
  const barGrew = grew && !sameXpBand(prevCropForImage, cropForImage);
  const barFrom = xpBarPct(grew ? prevCropForImage : cropForImage, xpFrom);
  const barTo = xpBarPct(cropForImage, xpTo);

  const xpBadgeSign = xpDelta > 0 ? '+' : xpDelta < 0 ? '−' : '+';
  const xpBadgeAbs = Math.abs(xpDelta);
  // 배지는 "얼마나 늘었는지"만 pink, 나머지(줄었거나 그대로)는 회색 — 계약서 §3.
  const xpBadgePositive = xpDelta > 0;

  // 숫자 카운트업 — 막대와 같은 시간 동안 굴러간다. 정지(pending) 동안은 from===to 라
  // 멈춰 있다가, 응답이 오면 같은 엘리먼트에서 이어서 굴러간다.
  const countDuration = barGrew ? GROW_FILL_DURATION : 0.45;
  const shownXp = useCountUp(xpTo, { from: xpFrom, duration: countDuration });
  const shownDelta = useCountUp(pending ? 0 : xpBadgeAbs, { from: 0, duration: countDuration, delay: 0.1 });

  /*
    진화 문구. 미보유 씨앗(봉투) → 심은 씨앗은 "씨앗으로 자랐어요"가 어색하다 — 자란 게 아니라
    처음 심은 것이다. 그 경우만 "씨앗을 심었어요", 나머지는 "새싹으로 자랐어요" 등 그대로.
  */
  const planted = grew && isUnplantedStage(prevCropForImage) && !isUnplantedStage(cropForImage)
    && stageToCrop(cropForImage) === 'seed';
  const growLabel = grew
    ? (planted ? '씨앗을 심었어요' : `${withRo(CROP_LABEL[stageToCrop(cropForImage)])} 자랐어요`)
    : null;

  const size = compact ? 18 : 26;
  const barH = compact ? 4 : 5;

  const reducedMotion = useReducedMotion();

  // 진화한 순간에만 햅틱을 한 번 준다 (채점 햅틱은 문제 화면이 이미 준다).
  const buzzedRef = useRef(false);
  useEffect(() => {
    if (grew && !buzzedRef.current) {
      buzzedRef.current = true;
      haptic('medium');
    }
  }, [grew]);

  /*
    연출 시작·끝 신호 — 다음 슬라이드 전환 게이트(hooks/useStudyAdvanceGate.js)가 쓴다.
    "XP 가 오르는 도중에 넘어간다"(2026-09-26) — 끝난 뒤 머물다 넘기려면 끝난 시각을 알아야 한다.
    pending(서버 응답 대기)은 정지 상태라 시작으로 치지 않는다. 응답이 와서 pending 이 풀리는
    순간이 시작이다. 연출 길이는 utils/studyTiming.js FARM_ANIM_* (막대·카운트업·배지 지연 포함).
  */
  const onAnimStartRef = useRef(onAnimStart);
  const onSettledRef = useRef(onSettled);
  useEffect(() => {
    onAnimStartRef.current = onAnimStart;
    onSettledRef.current = onSettled;
  });
  useEffect(() => {
    if (pending || diagnosis) return undefined;
    onAnimStartRef.current?.();
    const t = setTimeout(() => onSettledRef.current?.(), grew ? FARM_ANIM_GROW_MS : FARM_ANIM_MS);
    return () => clearTimeout(t);
  }, [pending, grew, diagnosis]);

  const radius = compact ? 'rounded-[8px]' : 'rounded-[11px]';

  /* ── 조각 ─────────────────────────────────────────────────────────────── */

  // 작물 자리 — 이전·새 그림이 같은 정사각형 칸에 겹쳐 서서 크로스페이드한다(파일 상단 주석).
  // 옆으로 나열하지 않으므로 막대 폭을 잠식하지 않는다. 원으로 감싸지 않는다(2절).
  const cropSlot = (
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
  );

  // 막대 — 세로 칸(normal)에선 반드시 block. flex-1 이면 높이 0 으로 사라진다(위 주석).
  const barEl = (
    <CropProgressBar
      pctFrom={barFrom}
      pctTo={barTo}
      grew={barGrew}
      tone={tone}
      height={barH}
      pending={pending}
      block={!compact}
    />
  );

  // XP 서브로우 — 왼쪽 `현재 / 다음 XP`, 오른쪽 진화 문구. normal·compact 가 같은 내용을 쓴다
  // (compact 는 글자만 작다). 2026-09-26 통일: 예전 compact 는 이 줄이 없어 카드 맞추기에서만
  // XP 수치·진화 문구가 안 보였다.
  const xpRow = (
    <div
      className={`
        flex items-center justify-between gap-[6px] font-[700] tracking-[-0.02em] tabular-nums
        text-layout-gray-300 dark:text-layout-gray-200
        ${compact ? 'text-[9.5px] leading-[12px]' : 'text-[10.5px]'}
      `}
    >
      <span className="flex-shrink-0 whitespace-nowrap">
        <b className="font-[800] text-layout-gray-400 dark:text-layout-gray-100">{shownXp}</b>
        {xpNextVal != null ? ` / ${xpNextVal} XP` : ' XP'}
      </span>
      {growLabel && !pending && (
        <motion.span
          className="flex-1 min-w-0 truncate text-right font-[700] text-primary-main-600"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25, delay: reducedMotion ? 0 : GROW_FILL_DURATION * GROW_RESET_START }}
        >
          {growLabel}
        </motion.span>
      )}
    </div>
  );

  // 배지 — `+N XP` 핑크 / `−N XP`·`+0 XP` 회색(crop_xp_contract.md §3). pending 만 비운다.
  // 칸 폭은 고정해 두어 응답이 와서 배지가 생겨도 막대 폭이 흔들리지 않는다.
  const badgeSlot = (
    <span
      className={`
        relative z-[1] flex-shrink-0 flex items-center justify-end
        ${compact ? 'w-[46px]' : 'w-[72px]'}
      `}
    >
      {!pending && (
        <motion.span
          className={`
            inline-flex flex-shrink-0 items-center justify-center whitespace-nowrap tabular-nums
            rounded-full font-[800] tracking-[-0.03em]
            ${compact ? 'px-[5px] py-[2px] text-[9.5px]' : 'px-[8px] py-[4px] text-[11.5px]'}
            ${xpBadgePositive
              ? 'bg-primary-main-100 dark:bg-primary-main-dark text-primary-main-600'
              : 'bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-gray-400 dark:text-layout-gray-200'}
          `}
          initial={pickVariant('popIn', reducedMotion).initial}
          animate={{
            ...pickVariant('popIn', reducedMotion).animate,
            transition: { ...pickVariant('popIn', reducedMotion).animate.transition, delay: 0.1 },
          }}
        >
          {xpBadgeSign}{shownDelta} XP
        </motion.span>
      )}
    </span>
  );

  const surface = `
    relative ${radius}
    bg-layout-white dark:bg-[#2E2E2E]
    shadow-[0_1px_6px_rgba(0,0,0,0.06)] dark:shadow-none
    ${className}
  `;

  /* ── 부패 진단(시안 6절) — 채점 전부터 뜨는 `.fb.ng` 형 ─────────────────── */
  if (diagnosis) {
    return (
      <div className={`flex items-center h-[40px] px-[12px] gap-[10px] ${surface}`}>
        {cropSlot}
        <div className="relative z-[1] flex flex-1 min-w-0 items-center">
          <span className="flex-shrink-0 text-[12.5px] font-[800] tracking-[-0.02em] text-[#B54708] dark:text-secondary-yellow-400">
            삽 1개를 씁니다
          </span>
        </div>
        <span className="relative z-[1] flex-shrink-0 whitespace-nowrap font-[600] tracking-[-0.02em] text-layout-gray-300 text-[12px]">
          맞히면 <b className="font-[700] text-layout-black dark:text-layout-white">씨앗</b>부터
        </span>
      </div>
    );
  }

  /*
    compact(카드 맞추기) — 칸 폭이 좁아(≈150px) 가운데 칸에 서브로우를 넣으면 숫자가 잘린다.
    그래서 같은 조각을 두 줄로 쌓는다: 윗줄 [작물][막대][배지], 아랫줄 [현재/다음 XP · 진화 문구].
    구성 요소·단위·문구·연출 타이밍은 normal 과 같다(크기만 작다).
  */
  if (compact) {
    return (
      <div className={`flex flex-col gap-[3px] px-[7px] pt-[4px] pb-[4px] ${surface}`}>
        <div className="flex items-center gap-[5px]">
          {cropSlot}
          <div className="relative z-[1] flex flex-1 min-w-0 items-center">{barEl}</div>
          {badgeSlot}
        </div>
        {xpRow}
      </div>
    );
  }

  // normal — [작물 26px] [막대 5px + XP 서브로우] [±N XP]
  return (
    <div className={`flex items-center py-[7px] px-[12px] gap-[10px] ${surface}`}>
      {cropSlot}
      <div className="relative z-[1] flex flex-1 min-w-0 flex-col justify-center gap-[4px]">
        {barEl}
        {xpRow}
      </div>
      {badgeSlot}
    </div>
  );
};

/**
 * 채점 결과 payload(/study/log `farm` 또는 farmOptimistic 의 낙관·정지값) → 상태 바.
 * **모든 문제 유형이 이 하나로 상태 바를 띄운다** — 등장 연출(아래에서 8px 떠오름, 0.25s),
 * 위치(카드 하단 absolute), prop 전달을 유형마다 복붙하지 않게 묶었다.
 *
 * @param {object} farm        payload (crop · stage · xp 필드 · wasCorrect · pending)
 * @param {boolean} compact    카드 맞추기용 좁은 형
 * @param {string} className   위치(absolute …) — 기본값은 유형 공통 규격
 * @param {string|number} replayKey  백그라운드 복귀 재생용 키(useResumeReplayKey)
 * @param {Function} onAnimStart / onSettled  전환 게이트용 연출 시작·끝 신호
 */
export const FarmResultBar = ({
  farm,
  compact = false,
  className,
  replayKey = 0,
  onAnimStart,
  onSettled,
}) => {
  if (!farm) return null;
  const place = className ?? (compact
    ? 'absolute bottom-[8px] left-[8px] right-[8px] z-[2]'
    : 'absolute bottom-[14px] left-[14px] right-[14px] z-[2]');
  return (
    <motion.div
      key={`farmbar-${replayKey}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      className={place}
      onClick={(e) => e.stopPropagation()}
    >
      <FarmStatusBar
        compact={compact}
        crop={farm.crop}
        stage={farm.stage}
        crop_from={farm.crop_from}
        stage_from={farm.stage_from}
        grew={!!farm.grew}
        pct_from={farm.pct_from}
        pct_to={farm.pct_to}
        xp_from={farm.xp_from}
        xp_to={farm.xp_to}
        xp_delta={farm.xp_delta}
        xp_next={farm.xp_next}
        health={farm.health}
        wasCorrect={farm.wasCorrect}
        pending={!!farm.pending}
        onAnimStart={onAnimStart}
        onSettled={onSettled}
      />
    </motion.div>
  );
};

export default FarmStatusBar;
