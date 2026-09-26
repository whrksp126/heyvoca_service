import React from 'react';
import CropImage from '../farm/CropImage';
import { HEALTH_STATES } from '../../utils/crop';
import { xpFloor } from '../../utils/cropXp';

/**
 * 성장 경로 — 시안 vocabooks §6 "호리병 대신 심긴 작물".
 * 지나온 단계는 선명하게, 현재 단계는 크게, 남은 단계는 옅게.
 * 작물은 **흙에 심긴(planted)** 에셋을 쓴다 — 여기가 밭에서 자라는 과정을 말하는 자리다.
 *
 * 막대는 두 겹이다.
 *   진한 핑크(i)  지금까지의 진행
 *   연한 핑크(u)  이번 복습으로 늘어날 만큼 — 승급이 아니어도 "이만큼 자란다"가 보여야 한다
 *
 * 【XP 표기 — 2026-09-26 실기기 피드백으로 재정리(이전 지시보다 우선)】
 *  - **작물 아래**는 언제나 그 단계의 XP 문턱(0/50/210/600/1800 — `cropXp.xpFloor` 파생값,
 *    하드코딩 금지)이다. 현재 칸도 예외 없이 문턱을 적는다(예전엔 현재 칸만 "215 XP" 로 바꿔
 *    적어, 문턱 줄이 `0 / 50 / 215 / 600` 처럼 한 칸만 다른 축으로 읽혔다).
 *  - **현재 XP**("215 XP")는 현재 작물과 다음 작물 사이 막대(현재 구간) 위에 **한 번만**
 *    작게 띄운다. 막대 채움이 곧 그 숫자의 위치라 "문턱 사이 어디쯤"이 한눈에 읽힌다.
 *    다음 칸이 없는 마지막 단계(당근 — 황금은 도달 전엔 안 그린다 / 황금)는 현재 구간이
 *    없으므로, 그 작물로 들어온 직전 막대 위 오른쪽 끝(현재 작물 쪽)에 붙인다.
 *  - 숫자는 absolute 라 행 높이·막대 폭에 관여하지 않는다(있든 없든 레이아웃이 같다).
 *
 * @param {number} props.cur      현재 단계 index (0 씨앗 ~ 3 당근)
 * @param {number} props.pct      다음 단계까지의 진행률 0~100
 * @param {number} props.gain     이번 복습에 맞히면 늘어날 만큼 0~100 (ghost 막대 폭 전용 — 글자로는 안 쓴다)
 * @param {number|null} props.curXp 현재 단계의 실제 표시 XP(crop_xp_contract.md §1) — 현재 구간 막대 위에 한 번만 쓴다.
 * @param {boolean} props.planted 심었는지 — false 면 전부 비어 있다
 * @param {boolean} props.rotten  썩은 작물 — 현재 단계를 회색조로 그린다
 * @param {string}  props.health  현재 단계에 쓸 건강 상태(FRESH/THIRSTY/WILTED/CRITICAL/ROTTEN).
 *   **현재 칸에만** 반영한다 — 지나온 칸은 그때의 건강을 알 수 없고, 남은 칸은 아직 오지 않았다.
 *   예전에는 썩음만 반영해서, 시든 단어를 열면 이 줄만 멀쩡한 작물을 그리고 있었다(QA 2차).
 */
const STAGES = ['seed', 'sprout', 'leaf', 'carrot'];

/**
 * @param {boolean} props.golden 황금 당근에 도달했는가.
 *   시안 §6 이 그리는 경로는 네 단계까지다. 황금은 당근 위의 별도 상태(기획 5.1 · Q6)라
 *   **도달한 단어에만** 다섯 번째 칸으로 붙인다. 아직 아닌 단어에 옅게 그려 두면
 *   "언젠가 반드시 거쳐야 할 단계"로 읽히는데, 황금은 조건을 만족해야 오는 것이지
 *   순서대로 오는 단계가 아니다.
 */
const GrowthPath = ({ cur = 0, pct = 0, gain = 0, curXp = null, planted = true, rotten = false, golden = false, health }) => {
  "use memo";

  const stages = golden ? [...STAGES, 'golden'] : STAGES;
  const clamp = (n) => Math.max(0, Math.min(100, Number(n) || 0));
  const p = clamp(pct);
  const g = clamp(gain);
  const ghost = Math.min(100, p + g);
  // 황금이면 마지막 칸이 곧 현재다 — cur 은 4단계 index 라 golden 을 가리키지 못한다
  const curIndex = golden ? stages.length - 1 : cur;
  const xpLabel = planted && curXp != null ? `${curXp} XP` : null;
  // 현재 구간(현재 작물 → 다음 작물 막대)이 있으면 거기에, 마지막 단계면 들어온 막대 끝에 붙인다
  const xpOnLink = curIndex < stages.length - 1 ? curIndex : curIndex - 1;
  const xpAlignEnd = curIndex >= stages.length - 1;
  // 막대 위 현재 XP — absolute 라 레이아웃에 관여하지 않는다
  const xpTag = xpLabel && (
    <span
      className={`
        absolute bottom-[9px] whitespace-nowrap pointer-events-none
        text-[10px] leading-[12px] font-[800] tracking-[-0.03em] tabular-nums
        text-primary-main-600
        ${xpAlignEnd ? 'right-0' : 'left-1/2 -translate-x-1/2'}
      `}
    >
      {xpLabel}
    </span>
  );

  return (
    <div className="
      flex items-center mt-[12px]
      rounded-[12px] px-[14px] py-[12px]
      bg-layout-gray-50 dark:bg-layout-gray-dark
    ">
      {stages.map((stage, i) => {
        const isDone = planted && i < curIndex;
        const isNow = planted && i === curIndex;

        return (
          <React.Fragment key={stage}>
            {i > 0 && (() => {
              const linkIndex = i - 1;
              const tag = linkIndex === xpOnLink ? xpTag : null;
              // 지나온 구간 — 끝까지 찬 초록 막대
              if (planted && linkIndex < curIndex) {
                return (
                  <span className="relative flex-1 mx-[2px] h-[6px] rounded-[99px] bg-[#E4E4E4] dark:bg-[#3A3A3A]">
                    <i className="absolute left-0 top-0 h-full w-full rounded-[99px] bg-crop-leaf" />
                    {tag}
                  </span>
                );
              }
              // 현재 구간 — 진행 + 예상 증가분(ghost) + 현재 XP(막대 위, 한 번만).
              if (planted && linkIndex === curIndex) {
                return (
                  <span className="relative flex-1 mx-[2px] h-[6px] rounded-[99px] bg-[#E4E4E4] dark:bg-[#3A3A3A]">
                    {g > 0 && (
                      <u
                        className="absolute left-0 top-0 h-full rounded-[99px] bg-primary-main-300 z-[1] block"
                        style={{ width: `${ghost}%` }}
                      />
                    )}
                    <i
                      className="absolute left-0 top-0 h-full rounded-[99px] bg-primary-main-600 z-[2] block"
                      style={{ width: `${p}%` }}
                    />
                    {tag}
                  </span>
                );
              }
              // 아직 오지 않은 구간
              return (
                <span className="relative flex-1 mx-[2px] h-[6px] rounded-[99px] bg-[#E4E4E4] dark:bg-[#3A3A3A]" />
              );
            })()}

            <div className="flex flex-col items-center gap-[4px] shrink-0 w-[46px]">
              <CropImage
                stage={stage}
                health={isNow ? (rotten ? HEALTH_STATES.ROTTEN : (health || HEALTH_STATES.FRESH)) : HEALTH_STATES.FRESH}
                solo={false}
                size={46}
                className={`

                  ${isDone || isNow ? 'opacity-100' : 'opacity-[0.28]'}
                  ${isNow ? 'scale-[1.18]' : ''}
                  ${rotten && isNow ? 'grayscale-[0.55]' : ''}
                `}
              />
              <span
                className={`
                  text-[9.5px] tracking-[-0.03em] tabular-nums
                  ${isNow
                    ? 'font-[800] text-layout-gray-400 dark:text-layout-gray-100'
                    : isDone
                      ? 'font-[700] text-layout-gray-300'
                      : 'font-[700] text-layout-gray-200 dark:text-layout-gray-500'}
                `}
              >
                {/* 작물 아래 — 언제나 그 단계의 XP 문턱(현재 칸도 문턱). 현재 XP 는 막대 위에 따로 있다. */}
                {xpFloor(stage)}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default GrowthPath;
