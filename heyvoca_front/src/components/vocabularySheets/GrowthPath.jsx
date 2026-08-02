import React from 'react';
import CropImage from '../farm/CropImage';
import { CROP_LABEL, HEALTH_STATES } from '../../utils/crop';

/**
 * 성장 경로 — 시안 vocabooks §6 "호리병 대신 심긴 작물".
 * 지나온 단계는 선명하게, 현재 단계는 크게, 남은 단계는 옅게.
 * 작물은 **흙에 심긴(planted)** 에셋을 쓴다 — 여기가 밭에서 자라는 과정을 말하는 자리다.
 *
 * 막대는 두 겹이다.
 *   진한 핑크(i)  지금까지의 진행
 *   연한 핑크(u)  이번 복습으로 늘어날 만큼 — 승급이 아니어도 "이만큼 자란다"가 보여야 한다
 *
 * @param {number} props.cur      현재 단계 index (0 씨앗 ~ 3 당근)
 * @param {number} props.pct      다음 단계까지의 진행률 0~100
 * @param {number} props.gain     이번 복습에 맞히면 늘어날 만큼 0~100
 * @param {boolean} props.planted 심었는지 — false 면 전부 비어 있다
 * @param {boolean} props.rotten  썩은 작물 — 현재 단계를 회색조로 그린다
 */
const STAGES = ['seed', 'sprout', 'leaf', 'carrot'];

const GrowthPath = ({ cur = 0, pct = 0, gain = 0, planted = true, rotten = false }) => {
  "use memo";

  const clamp = (n) => Math.max(0, Math.min(100, Number(n) || 0));
  const p = clamp(pct);
  const g = clamp(gain);
  const ghost = Math.min(100, p + g);
  const label = g > 0 ? (ghost >= 100 ? '승급' : `+${g}%`) : `${p}%`;

  return (
    <div className="
      flex items-center mt-[12px]
      rounded-[12px] px-[14px] py-[12px]
      bg-layout-gray-50 dark:bg-layout-gray-dark
    ">
      {STAGES.map((stage, i) => {
        const isDone = planted && i < cur;
        const isNow = planted && i === cur;

        return (
          <React.Fragment key={stage}>
            {i > 0 && (() => {
              const linkIndex = i - 1;
              // 지나온 구간 — 끝까지 찬 초록 막대
              if (planted && linkIndex < cur) {
                return (
                  <span className="relative flex-1 mx-[2px] h-[6px] rounded-[99px] bg-[#E4E4E4] dark:bg-[#3A3A3A]">
                    <i className="absolute left-0 top-0 h-full w-full rounded-[99px] bg-crop-leaf" />
                  </span>
                );
              }
              // 현재 구간 — 진행 + 예상 증가분 + 배지 문구
              if (planted && linkIndex === cur) {
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
                    <b className="absolute top-[-16px] right-0 text-[10px] font-[800] text-primary-main-600 whitespace-nowrap">
                      {label}
                    </b>
                  </span>
                );
              }
              // 아직 오지 않은 구간
              return (
                <span className="relative flex-1 mx-[2px] h-[6px] rounded-[99px] bg-[#E4E4E4] dark:bg-[#3A3A3A]">
                  {!planted && linkIndex === 0 && (
                    <b className="absolute top-[-16px] right-0 text-[10px] font-[800] text-primary-main-600 whitespace-nowrap">
                      0%
                    </b>
                  )}
                </span>
              );
            })()}

            <div className="flex flex-col items-center gap-[4px] shrink-0 w-[46px]">
              <CropImage
                stage={stage}
                health={rotten && isNow ? HEALTH_STATES.ROTTEN : HEALTH_STATES.FRESH}
                solo={false}
                size={30}
                className={`
                  object-bottom
                  ${isDone || isNow ? 'opacity-100' : 'opacity-[0.28]'}
                  ${isNow ? 'scale-[1.18]' : ''}
                  ${rotten && isNow ? 'grayscale-[0.55]' : ''}
                `}
              />
              <span
                className={`
                  text-[9.5px] tracking-[-0.03em]
                  ${isNow
                    ? 'font-[800] text-layout-black dark:text-layout-white'
                    : isDone
                      ? 'font-[700] text-layout-gray-300'
                      : 'font-[700] text-layout-gray-200 dark:text-layout-gray-500'}
                `}
              >
                {CROP_LABEL[stage]}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default GrowthPath;
