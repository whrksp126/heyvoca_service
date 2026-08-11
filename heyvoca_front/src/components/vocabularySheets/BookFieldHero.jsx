import React from 'react';
import FarmField from '../farm/FarmField';
import CropImage from '../farm/CropImage';
import { CROP_LABEL, HEALTH_STATES } from '../../utils/crop';
import { SIGN_ANCHORS } from '../../utils/farmField';

/**
 * 단어장 안 — 이 단어장만의 밭. 시안 vocabooks §4.
 *
 * 홈의 히어로를 그대로 축소했다. 밭 + 나무 팻말 4개 + 히어로 하단에 겹쳐 뜬 주 CTA.
 * 좌표계만 줄였고 구성은 하나도 바꾸지 않았다.
 * 마스코트는 없다 — 농장 전체의 주인이라 밭 하나짜리 화면에는 서지 않는다.
 *
 * 밭에 서는 작물은 **이 단어장에서 실제로 심은 것**이다(FarmField).
 * 팻말은 보유 수를 적는다 — 아직 안 심은 씨앗이 많으면 팻말 수와 밭의 씨앗 수가
 * 벌어지고, 그 차이가 곧 "심을 게 남았다"는 뜻이다.
 *
 * 팻말 좌표는 farmField 의 SIGN_ANCHORS 를 쓴다 — 홈 히어로와 같은 값이고, 작물을 심는
 * 마름모에서 바로 나오므로 심는 범위를 조정해도 팻말이 자기 구역을 계속 가리킨다.
 * 판·말뚝까지 여기서 그린다 — 이미지에 구워 두면 보유 0 인 단계에 빈 판이 남는다.
 */
/**
 * 팻말 아이콘이 쓸 visual_stage.
 * 씨앗 팻말은 **밭에 심긴 씨앗** 구역을 가리키므로 흙에 묻힌 씨앗 그림이어야 한다.
 * crop 키('seed')를 그냥 넘기면 봉투(보유 씨앗)가 나와, 밭 밖 "보유 씨앗" 간판과
 * 똑같은 그림이 한 화면에 두 개 뜬다.
 */
const SIGN_STAGE = { seed: 'PLANTED_SEED', sprout: 'SPROUT', leaf: 'LEAF', carrot: 'CARROT' };

const BookFieldHero = ({ counts, fieldCounts, healthMix, storedSeeds = 0, children }) => {
  "use memo";

  return (
    <div
      className="
        relative w-full h-[341px] flex-shrink-0 z-[1]
        bg-[linear-gradient(180deg,var(--farm-sky-100)_0%,var(--farm-sky-200)_34%,var(--farm-canvas)_100%)]
      "
    >
      {/* 일러스트가 좌우로 넘치는 만큼만 잘라 낸다. 아래로 2px 흘러내리는 건 그대로 둔다. */}
      <div className="absolute inset-x-0 top-0 bottom-[-2px] overflow-hidden">
        <div className="absolute left-[-4%] w-[108%] bottom-0">
        <FarmField
          counts={fieldCounts || counts}
          healthMix={healthMix}
          maxSprites={72}
          storedSeeds={storedSeeds}
        >
          {SIGN_ANCHORS.map((sign) => {
            // 팻말은 그 구역에 실제로 선 작물을 센다 — 보유 씨앗은 밭 밖 간판이 따로 말한다
            const n = (fieldCounts || counts)?.[sign.crop] ?? 0;
            // 그 구역에 아무것도 없으면 팻말이 서지 않는다. 빈 구역 자체가 정보다.
            if (n <= 0) return null;
            return (
              <span
                key={sign.crop}
                style={{ left: `${sign.left}%`, top: `${sign.top}%` }}
                className="absolute z-[14] -translate-x-1/2 w-[14.17%] h-[11.16%]"
              >
                {/* 말뚝 — 판 뒤에서 아래로. 치수는 판 대비 %라 폰 폭이 바뀌어도 붙어 있다. */}
                <span
                  aria-hidden
                  className="
                    absolute left-1/2 -translate-x-1/2 z-0
                    w-[8.8%] h-[41.7%] top-[93.75%]
                    bg-[linear-gradient(180deg,#96683E_0%,#6E4828_100%)]
                  "
                />
                <span
                  className="
                    absolute inset-0 z-[1] flex items-center justify-center gap-[3px]
                    rounded-[6px] border-[1.6px] border-[#96683E]
                    bg-[linear-gradient(180deg,#D8AC74_0%,#BE8F58_100%)]
                    shadow-[0_2px_5px_rgba(92,58,30,0.28)]
                    overflow-hidden
                  "
                >
                  <span
                    aria-hidden
                    className="absolute left-[5%] right-[5%] top-[9%] h-[42%] rounded-[4px] bg-[rgba(255,240,214,0.18)] blur-[2px]"
                  />
                  <CropImage
                    stage={SIGN_STAGE[sign.crop]}
                    health={HEALTH_STATES.FRESH}
                    size={28}
                    className="shrink-0"
                  />
                  <span className="relative min-w-0 text-left">
                    <span className="block text-[8.5px] font-[700] text-[#7A5433] tracking-[-0.05em] leading-[1.05]">
                      {CROP_LABEL[sign.crop]}
                    </span>
                    <span className="block text-[12.5px] font-[800] text-[#4A2E17] tracking-[-0.05em] leading-[1.1]">
                      {n}
                    </span>
                  </span>
                </span>
              </span>
            );
          })}
        </FarmField>
        </div>
      </div>

      {/* 주 CTA — 히어로 하단에 16px 겹쳐 뜬다 (홈과 같은 자리) */}
      {children && (
        <div className="absolute left-[20px] right-[20px] bottom-[-16px] z-[24]">{children}</div>
      )}
    </div>
  );
};

export default BookFieldHero;
