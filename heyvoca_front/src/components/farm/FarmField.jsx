// src/components/farm/FarmField.jsx
//
// 밭 한 장 — 바탕 그림 + 실제 데이터대로 심은 작물.
//
// 홈 히어로 · 단어장 상세 히어로 · 단어장 목록 썸네일이 모두 이 컴포넌트를 쓴다.
// 세 자리의 차이는 크기와 마스코트 유무뿐이고, 심는 규칙은 하나다.
//
// 좌표는 전부 캔버스(1200×860) 대비 백분율이라 밭이 어떤 크기로 그려지든 자리가 같다.
// 그래서 이 컴포넌트는 **1200:860 비율의 상자**를 하나 만들고 그 안에만 그린다 —
// 상자를 벗어나지 않으므로 바깥에서 잘라 내든 늘리든 작물은 흙 위에 그대로 있는다.

import React, { useMemo } from 'react';
import fieldBase from '../../assets/images/farm/field-base.png';
import { CROP_ASSETS, cropAssetByVariant } from './CropImage';
import { plantField, CROP_BASELINE } from '../../utils/farmField';

/**
 * @param {object}  counts     단계별 **심은** 작물 수 { seed, sprout, leaf, carrot }
 * @param {object}  healthMix  그림 variant 분포 { healthy, drying, wilted, rotten }
 * @param {number}  maxSprites 화면에 올릴 작물 수 상한
 * @param {boolean} mascot     마스코트를 밭에 세울지 (홈만)
 * @param {boolean} shadows    작물 접지 그림자 (썸네일에서는 꺼서 그리는 값을 줄인다)
 * @param {boolean} soloCrops  작물을 unplanted 판으로 그린다.
 *                             원래는 planted 에 흙 원판이 딸려 있어 밭 바닥에 얼룩처럼 보이던 것을
 *                             피하려고 만든 스위치인데, **planted 가 V5 로 바뀌며 원판이 사라져**
 *                             그 이유는 없어졌다. 지금은 온보딩만 켜고 있고, 켜면 아직 V3 계열인
 *                             unplanted 그림이 나오므로 다른 화면과 그림체가 달라진다.
 * @param {node}    children   팻말처럼 밭과 같은 좌표계에 얹을 것들
 *
 * 【크기·자리는 바깥이 정한다】 이 컴포넌트는 className 을 받지 않는다.
 * 폭·위치 클래스를 덧대 봐야 Tailwind 가 출력 CSS 에서 `w-full`·`relative` 를
 * 뒤에 놓기 때문에 바깥에서 준 `w-[64px]`·`absolute` 가 조용히 무시된다
 * (실제로 목록 썸네일이 카드를 가득 채우는 사고가 났다).
 * **크기를 정한 상자로 감싸서 쓸 것** — 이 상자는 그 폭을 100% 로 채운다.
 */
const FarmField = ({
  counts,
  healthMix,
  maxSprites = 96,
  mascot = false,
  shadows = true,
  reserveSigns = true,
  soloCrops = false,
  storedSeeds = 0,
  children,
}) => {
  "use memo";

  const { items } = useMemo(
    () => plantField(counts, healthMix, { maxSprites, mascot, reserveSigns }),
    [counts, healthMix, maxSprites, mascot, reserveSigns],
  );

  return (
    <div className="relative w-full aspect-[1200/860]">
      {/*
        보유 씨앗 간판 — 기획 5.1 "보유 씨앗 … 밭 밖 씨앗 또는 씨앗 봉투".

        **밭 안이 아니라 밖에 둔다.** 담아만 두고 한 번도 맞히지 못한 단어는 심긴 적이
        없어서 흙 위에 있을 수 없고, 썩지도 않는다(기획 6.4). 밭 안에 그리면
        "왜 이건 물을 안 줘도 되나"에 답할 그림이 없어진다.
        섬의 오른쪽 위 허공 — 마름모 바깥이면서 밭과 한 화면에 잡히는 자리다.
      */}
      {storedSeeds > 0 && (
        // 자리는 %(밭과 함께 움직인다) · 크기는 px(밭이 커져도 글자가 커지면 안 된다).
        // 좌표 80% / 24% 는 캔버스(1200×860)의 (960, 206) — 섬 위쪽 꼭짓점(y 270)보다 위,
        // 오른쪽으로 치우쳐 마름모와 겹치지 않는 지점이다.
        // 밭 상자는 화면보다 넓어(112%) 오른쪽으로 넘치므로, 더 바깥에 두면 잘려 나간다.
        <div className="absolute z-[16] -translate-x-1/2" style={{ left: '80%', top: '24%' }}>
          <span
            className="
              flex items-center gap-[5px]
              h-[34px] pl-[6px] pr-[10px] rounded-[8px]
              border-[1.6px] border-[#96683E]
              bg-[linear-gradient(180deg,#E3BC87_0%,#C99A63_100%)]
              shadow-[0_2px_6px_rgba(92,58,30,0.26)]
            "
          >
            {/* 씨앗 봉투 — 기획 5.1 이 보유 씨앗의 연출로 지정한 바로 그 그림이다.
                밭에 묻힌 씨앗 그림을 쓰면 "안 심었다"는 말과 그림이 어긋난다. */}
            <img
              src={CROP_ASSETS.seedPacket}
              alt=""
              draggable={false}
              className="w-[28px] h-[28px] shrink-0 object-contain select-none"
            />
            <span className="text-left leading-none whitespace-nowrap">
              <span className="block text-[8.5px] font-[700] text-[#7A5433] tracking-[-0.05em]">
                보유 씨앗
              </span>
              <span className="block mt-[2px] text-[12.5px] font-[800] text-[#4A2E17] tracking-[-0.05em]">
                {storedSeeds.toLocaleString()}
              </span>
            </span>
          </span>
        </div>
      )}
      <img
        src={fieldBase}
        alt=""
        draggable={false}
        className="absolute inset-0 w-full h-full select-none"
      />

      {items.map((item) => {
        if (item.kind === 'mascot') {
          return (
            <React.Fragment key={item.key}>
              {shadows && (
                // 마스코트만 접지 그림자를 그린다 — 작물 그림에는 접지 그림자가 들어 있다
                <span
                  aria-hidden
                  className="absolute rounded-[50%] bg-[rgba(96,62,34,0.16)] blur-[2px]"
                  style={{
                    left: `${item.leftPct}%`,
                    top: `${item.topPct}%`,
                    width: `${item.shadowWPct}%`,
                    aspectRatio: '6 / 1',
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              )}
              <img
                src={CROP_ASSETS.mascotSolo}
                alt=""
                draggable={false}
                className="absolute w-auto select-none"
                style={{
                  left: `${item.leftPct}%`,
                  top: `${item.topPct}%`,
                  height: `${item.heightPct}%`,
                  transform: 'translate(-50%, -100%)',
                }}
              />
            </React.Fragment>
          );
        }

        /*
          작물 — 512×512 정사각형 한 장을 그대로 놓는다.
          단계별 크기와 흙·그늘이 전부 그림 안에 있어 여기서 손볼 것이 없다.
          세로 기준만 다르다: 밑동은 그림 맨 아래가 아니라 **85.9375% 지점**이므로
          그만큼만 끌어올려야 작물이 심은 자리에 선다. 100% 로 올리면 전부 위로 뜬다.
        */
        return (
          <img
            key={item.key}
            src={cropAssetByVariant(item.stage, item.variant, { solo: soloCrops })}
            alt=""
            draggable={false}
            className="absolute select-none"
            style={{
              left: `${item.leftPct}%`,
              top: `${item.topPct}%`,
              width: `${item.boxPct}%`,
              aspectRatio: '1 / 1',
              transform: `translate(-50%, -${CROP_BASELINE * 100}%)`,
            }}
          />
        );
      })}

      {children}
    </div>
  );
};

export default FarmField;
