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
 * - 오답은 막대가 늘지도 줄지도 않는다. '그대로' 같은 문구를 적지 않는다.
 * - `compact` 는 카드 매칭용 좁은 형(`.fb.sm`)이다. 다른 구조가 아니라 **같은 컴포넌트가 접히는 것**이라
 *   `+N%` 만 접히고 작물·막대·일수는 남는다(시안 ⑩ 은 좁은 형에도 막대가 있다).
 */

/** 진화 스파클 — 새 작물이 솟아오를 때 바깥으로 튀는 세 점 (시안 `.fb .spk`) */
const SPARKS = [
  { className: 'top-0 left-[50%] ml-[-2px] w-[4px] h-[4px]', peak: 1 },
  { className: 'bottom-[3px] left-[1px] w-[3px] h-[3px]', peak: 0.8 },
  { className: 'top-[6px] right-0 w-[3px] h-[3px]', peak: 0.65 },
];

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

  // 진화한 순간에만 햅틱을 한 번 준다 (채점 햅틱은 문제 화면이 이미 준다)
  const buzzedRef = useRef(false);
  useEffect(() => {
    if (grew && !buzzedRef.current) {
      buzzedRef.current = true;
      vibrate({ duration: 5 });
    }
  }, [grew]);

  // 우측 문구 — 오답이어도 '그대로' 같은 말을 적지 않는다. 다음에 언제 만나는지만 알린다.
  let dayLabel = null;
  let daySuffix = '뒤';
  if (wasCorrect === false) {
    dayLabel = '내일';
    daySuffix = '다시';
  } else if (typeof daysToReview === 'number' && daysToReview >= 1) {
    if (daysToReview <= 1) {
      dayLabel = '내일';
      daySuffix = '다시';
    } else {
      dayLabel = `${daysToReview}일`;
    }
  }

  const radius = compact ? 'rounded-[8px]' : 'rounded-[11px]';

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
      {/* 진화 — 면 전체가 초록으로 물든다(3절 120~280ms 구간).
          처음부터 초록으로 그리면 '색이 바뀌는 순간'이 사라지므로 덧칠로 켠다. */}
      {grew && (
        <motion.span
          aria-hidden
          className={`absolute inset-0 ${radius} bg-[#EAFBF0] dark:bg-status-success-dark`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.16, delay: 0.12, ease: 'linear' }}
        />
      )}

      {/* 작물 자리 — 진화할 때 이 안에서 그래픽이 바뀐다.
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
          <>
            {grew && (
              // 이전 작물이 아래로 쪼그라들며 사라진다 (0~120ms · scale 1→.55 · translateY +5 · opacity 0)
              <motion.span
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                initial={{ scale: 1, y: 0, opacity: 1 }}
                animate={{ scale: 0.55, y: 5, opacity: 0 }}
                transition={{ duration: 0.12, ease: 'easeIn' }}
              >
                <CropImage stage={prevCropForImage} health={health} size={size} alt="" />
              </motion.span>
            )}
            <motion.span
              key={`${cropKey}-${grew ? 'up' : 'keep'}`}
              className="absolute inset-0 flex items-center justify-center"
              initial={grew ? { scale: 0.4, opacity: 0 } : { scale: 1, opacity: 1 }}
              animate={grew ? { scale: [0.4, 1.2, 1], opacity: [0, 1, 1] } : { scale: 1, opacity: 1 }}
              transition={
                grew
                  // 새 작물이 튀어오르고(120~280ms) 자리를 잡는다(280~360ms)
                  ? { duration: 0.24, delay: 0.12, times: [0, 0.667, 1], ease: 'easeOut' }
                  : { duration: 0.2, ease: 'easeOut' }
              }
            >
              <CropImage stage={cropForImage} health={health} size={size} />
            </motion.span>
            {grew && (
              // 자리를 잡고 스파클이 바깥으로 튄다 (280~360ms)
              <span className={`absolute ${compact ? 'inset-[-5px]' : 'inset-[-7px]'} pointer-events-none`}>
                {SPARKS.map((spark, i) => (
                  <motion.i
                    key={i}
                    className={`absolute rounded-full bg-status-success-500 ${spark.className}`}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: [0, 1, 0.6], opacity: [0, spark.peak, 0] }}
                    transition={{ duration: 0.32, delay: 0.28 + i * 0.02, ease: 'easeOut' }}
                  />
                ))}
              </span>
            )}
          </>
        )}
      </span>

      {/* 가운데 — 막대가 진화하면 100% 를 찍고 0% 로 리셋된 뒤 새 단계 진행률로 간다.
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
              // 오답이면 그 자리에 머문다 — 뒤로 밀리지도, 앞으로 가지도 않는다(2절)
              pctTo={isNg && !grew ? pctFrom : pctTo}
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
          {` ${daySuffix}`}
        </span>
      )}
    </div>
  );
};

export default FarmStatusBar;
