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
 * 【2026-09 XP 개편 — 시안 이후 사용자 추가 지시가 우선】 시안(crop_xp_src.html)은 게이지
 * 위에 "244 / 600" 핑크 배지를 띄웠지만, 승인된 최종 지시는 그 배지를 **없애고** 대신
 * 작물 아래 라벨 쪽에서 갈린다 — 지나온·남은 칸은 그대로 단계 문턱 XP(0/50/210/600/1800,
 * `cropXp.xpFloor` 파생값, 하드코딩 금지), **현재 칸만** 문턱 대신 실제 현재 XP(`curXp`,
 * 예: "244 XP")를 보여준다. 그래서 링크 위 라벨(`+N%`/`N%`/`승급`)은 전부 지웠고, 연한
 * 핑크 ghost 막대(예상 증가분)만 남겼다.
 *
 * @param {number} props.cur      현재 단계 index (0 씨앗 ~ 3 당근)
 * @param {number} props.pct      다음 단계까지의 진행률 0~100
 * @param {number} props.gain     이번 복습에 맞히면 늘어날 만큼 0~100 (ghost 막대 폭 전용 — 글자로는 안 쓴다)
 * @param {number|null} props.curXp 현재 단계의 실제 표시 XP(crop_xp_contract.md §1) — 현재 칸 라벨에만 쓴다.
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

  return (
    <div className="
      flex items-center mt-[12px]
      rounded-[12px] px-[14px] py-[12px]
      bg-layout-gray-50 dark:bg-layout-gray-dark
    ">
      {stages.map((stage, i) => {
        // 황금이면 마지막 칸이 곧 현재다 — cur 은 4단계 index 라 golden 을 가리키지 못한다
        const curIndex = golden ? stages.length - 1 : cur;
        const isDone = planted && i < curIndex;
        const isNow = planted && i === curIndex;

        return (
          <React.Fragment key={stage}>
            {i > 0 && (() => {
              const linkIndex = i - 1;
              const curIndex = golden ? stages.length - 1 : cur;
              // 지나온 구간 — 끝까지 찬 초록 막대
              if (planted && linkIndex < curIndex) {
                return (
                  <span className="relative flex-1 mx-[2px] h-[6px] rounded-[99px] bg-[#E4E4E4] dark:bg-[#3A3A3A]">
                    <i className="absolute left-0 top-0 h-full w-full rounded-[99px] bg-crop-leaf" />
                  </span>
                );
              }
              // 현재 구간 — 진행 + 예상 증가분(ghost). 라벨은 없다(아래 작물 밑 숫자가 대신한다).
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
                    ? 'font-[800] text-primary-main-600'
                    : isDone
                      ? 'font-[700] text-layout-gray-300'
                      : 'font-[700] text-layout-gray-200 dark:text-layout-gray-500'}
                `}
              >
                {/* 작물 아래 라벨 — 지나온·남은 칸은 단계 문턱 XP(0/50/210/600/1800,
                    cropXp.xpFloor 파생값), 현재 칸만 문턱 대신 실제 현재 XP(시안 이후
                    사용자 추가 지시 — 게이지 위 핑크 숫자 제거하고 이 자리로 옮겼다). */}
                {isNow ? `${curXp ?? xpFloor(stage)} XP` : xpFloor(stage)}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default GrowthPath;
