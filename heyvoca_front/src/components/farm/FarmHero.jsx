// src/components/farm/FarmHero.jsx
//
// 농장 화면 상단 히어로 — 시안(docs/ui-concepts/carrot-farm-v2-home/hero_v4.py)의 렌더 PNG 를 그대로 쓴다.
//
// 밭은 네 칸으로 나뉘어 있지 않다. 섬 전체가 밭 하나이고 성장 순서는 **심는 자리의 깊이**로
// 읽힌다 — 뒤쪽에 씨앗, 앞쪽에 당근. 이 배치는 PIL 합성 결과라 CSS 로 재현할 수 없어
// 이미지를 그대로 가져왔다.
//
// **팻말의 나무 판은 이미지에 구워져 있고 글자만 여기서 얹는다.** 개수가 바뀔 때마다
// 이미지를 다시 뽑지 않아도 되고, 글자가 래스터가 아니라 선명하다.

import React from 'react';
import heroFresh from '../../assets/images/farm/hero-fresh.png';
import heroThirsty from '../../assets/images/farm/hero-thirsty.png';
import heroRisk from '../../assets/images/farm/hero-risk.png';
import { CROP_LABEL, HEALTH_STATES } from '../../utils/crop';
import CropImage from './CropImage';

const HERO_SRC = {
  fresh: heroFresh,
  thirsty: heroThirsty,
  risk: heroRisk,
};

// 팻말 좌표 — hero_v4.py 가 내보낸 layout.json 의 값을 **이미지 크기(1200×860) 대비 %**로 바꾼 것.
// px 로 두면 폰 폭이 달라질 때 팻말이 밭에서 떨어져 나간다. 이미지와 같은 상자 안에서
// %로 두면 폭과 무관하게 늘 같은 자리에 붙는다.
const SIGNS = [
  { crop: 'seed', left: 50, top: 32.79 },
  { crop: 'sprout', left: 27.83, top: 46.51 },
  { crop: 'leaf', left: 72.17, top: 46.51 },
  { crop: 'carrot', left: 50, top: 60.23 },
];

// 밭 전체의 분위기 — 가장 손이 필요한 상태가 밭 전체의 인상을 정한다.
// 하나라도 부패 직전이면 밭이 그렇게 보여야 사용자가 오늘 들어온 이유를 안다.
const heroMood = (health) => {
  if ((health?.critical ?? 0) > 0 || (health?.rotten ?? 0) > 0) return 'risk';
  if ((health?.wilted ?? 0) > 0 || (health?.thirsty ?? 0) > 0) return 'thirsty';
  return 'fresh';
};

const FarmHero = ({ counts, health, onSelectGroup }) => {
  "use memo";

  const mood = heroMood(health);

  return (
    <div className="relative w-full h-[420px] overflow-hidden flex-shrink-0">
      {/*
        이미지 상자 — 시안 CSS 와 같은 배치다: width 112%, left -6%, bottom -4px.
        밭이 화면 좌우로 살짝 넘쳐야 섬이 잘린 게 아니라 이어지는 것처럼 보인다.
        팻말은 이 상자 안에 % 로 얹혀 이미지와 함께 움직인다.
      */}
      <div className="absolute left-[-6%] w-[112%] bottom-[-4px]">
        <img
          src={HERO_SRC[mood]}
          alt=""
          draggable={false}
          className="block w-full h-auto select-none"
        />

        {SIGNS.map((sign) => {
          const n = counts?.[sign.crop] ?? 0;
          // 보유가 없는 단계는 팻말을 세우지 않는다. 빈 밭에 0 이 네 개 서 있으면
          // 아직 아무것도 못 한 사람에게 그 사실만 네 번 말하는 셈이다.
          if (n <= 0) return null;
          return (
            <button
              key={sign.crop}
              type="button"
              onClick={() => onSelectGroup?.(sign.crop)}
              style={{ left: `${sign.left}%`, top: `${sign.top}%` }}
              className="
                absolute z-[14] -translate-x-1/2
                w-[62px] h-[35px]
                flex items-center justify-center gap-[3px]
              "
            >
              <CropImage stage={sign.crop} health={HEALTH_STATES.FRESH} size={17} />
              <span className="min-w-0 text-left">
                <span className="block text-[9px] font-[700] text-[#7A5433] tracking-[-0.05em] leading-[1.05]">
                  {CROP_LABEL[sign.crop]}
                </span>
                <span className="block text-[13px] font-[800] text-[#4A2E17] tracking-[-0.05em] leading-[1.1] mt-[1px]">
                  {n}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default FarmHero;
