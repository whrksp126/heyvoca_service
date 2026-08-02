// src/components/farm/FarmHero.jsx
//
// 당근 농장 V2 — 히어로(시안 §2 · §3 · §5 · §12).
//
// §10 화면 구조: 히어로 420px. 상단 헤더가 없다 — 일러스트가 화면 최상단까지 이어진다.
// §2: 초록 섬 하나에 파인 밭 하나. 구분선도 칸도 없다.
// §3: 성장 순서는 심는 자리의 깊이로 읽힌다(뒤쪽 씨앗 · 앞쪽 당근). 이 배치는 PIL 합성
//     결과라 CSS 로 재현할 수 없어 렌더 PNG(hero_v4.py)를 그대로 쓴다.
// §5: 나무 판은 이미지에 구워져 있고 **글자만** 여기서 얹는다. 개수가 바뀌어도 이미지를
//     다시 뽑지 않아도 되고 글자가 래스터가 아니라 선명하다.
// §12: 상태에 따라 일러스트(hero-thirsty / hero-risk / hero-fresh)와 하늘색이 함께 바뀐다.
//
// 히어로 위에 뜨는 것들(헤드라인 · 보석 칩 · 주 CTA · 주황 핀)은 화면마다 다르므로
// children 으로 받는다. 홈은 넷 다 넘기고, 농장 상세(/farm)는 아무것도 넘기지 않는다.

import React from 'react';
// 팻말이 **없는** 판을 쓴다. 나무 판까지 이미지에 구워 두면 보유 0 인 단계에서
// 글자만 사라지고 빈 판이 밭에 남는다(§3 "보유 0 인 단계에는 팻말이 서지 않는다" 위반).
// 판·말뚝은 아래에서 CSS 로 그린다 — 생성 스크립트(hero_v4.py `sign()`)의 색·치수 그대로.
import heroFresh from '../../assets/images/farm/hero-fresh-nosign.png';
import heroThirsty from '../../assets/images/farm/hero-thirsty-nosign.png';
import heroRisk from '../../assets/images/farm/hero-risk-nosign.png';
import { CROP_LABEL, HEALTH_STATES } from '../../utils/crop';
import CropImage from './CropImage';

const HERO_SRC = {
  fresh: heroFresh,
  thirsty: heroThirsty,
  risk: heroRisk,
};

/**
 * 하늘 그라디언트 — 시안 CSS `.hero` 정본.
 *  기본·목마름  linear-gradient(180deg,#FBF1DE 0%,#F8F1DC 32%,#FFFFFF 100%)
 *  위험         linear-gradient(180deg,#FAEBD6 0%,#F8EED6 32%,#FFFFFF 100%)
 *  완료(.cool)  linear-gradient(180deg,#ECF6F7 0%,#F3F6E8 32%,#FFFFFF 100%)
 * 기본만 토큰(--farm-sky-100/200/canvas)이 있어 다크가 자동으로 따라온다.
 * 위험·완료 하늘은 13절 토큰 표에 없어 시안 CSS 값을 그대로 적는다(보고 참조).
 */
const SKY_CLASS = {
  thirsty:
    'bg-[linear-gradient(180deg,var(--farm-sky-100)_0%,var(--farm-sky-200)_32%,var(--farm-canvas)_100%)]',
  risk:
    'bg-[linear-gradient(180deg,#FAEBD6_0%,#F8EED6_32%,#FFFFFF_100%)] ' +
    'dark:bg-[linear-gradient(180deg,#2B271D_0%,#1E1A14_34%,#111111_100%)]',
  fresh:
    'bg-[linear-gradient(180deg,#ECF6F7_0%,#F3F6E8_32%,#FFFFFF_100%)] ' +
    'dark:bg-[linear-gradient(180deg,#1C2625_0%,#161D1C_34%,#111111_100%)]',
};

/** 해 — 시안 CSS `.hero .sun`. 위험 상태만 조금 더 탁한 노랑을 쓴다. */
const SUN_CLASS = {
  thirsty:
    'bg-[radial-gradient(circle,#FFE9A8_0%,#FFF6DC_60%,rgba(255,246,220,0)_72%)] ' +
    'dark:bg-[radial-gradient(circle,rgba(255,233,168,.22)_0%,rgba(255,246,220,.08)_60%,rgba(255,246,220,0)_72%)]',
  risk:
    'bg-[radial-gradient(circle,#FFDDA0_0%,#FFF1D8_60%,rgba(255,241,216,0)_72%)] ' +
    'dark:bg-[radial-gradient(circle,rgba(255,233,168,.22)_0%,rgba(255,246,220,.08)_60%,rgba(255,246,220,0)_72%)]',
  fresh:
    'bg-[radial-gradient(circle,#FFE9A8_0%,#FFF6DC_60%,rgba(255,246,220,0)_72%)] ' +
    'dark:bg-[radial-gradient(circle,rgba(255,233,168,.22)_0%,rgba(255,246,220,.08)_60%,rgba(255,246,220,0)_72%)]',
};

// 팻말 좌표 — hero_v4.py 가 내보낸 layout.json 의 값을 **이미지 크기(1200×860) 대비 %**로 바꾼 것.
// px 로 두면 폰 폭이 달라질 때 팻말이 밭에서 떨어져 나간다. 이미지와 같은 상자 안에서
// %로 두면 폭과 무관하게 늘 같은 자리에 붙는다.
// (390px 기준으로 환산하면 시안 CSS 의 left:164/67/261/164 · top:214/257/257/300 과 같다.)
const SIGNS = [
  { crop: 'seed', left: 50, top: 32.79 },
  { crop: 'sprout', left: 27.83, top: 46.51 },
  { crop: 'leaf', left: 72.17, top: 46.51 },
  { crop: 'carrot', left: 50, top: 60.23 },
];

// 밭 전체의 분위기 — 가장 손이 필요한 상태가 밭 전체의 인상을 정한다.
// 홈은 §12 의 상태 판정 결과를 `state` 로 직접 넘기고, 농장 상세는 이 폴백을 쓴다.
export const heroMood = (health) => {
  if ((health?.critical ?? 0) > 0 || (health?.rotten ?? 0) > 0) return 'risk';
  if ((health?.wilted ?? 0) > 0 || (health?.thirsty ?? 0) > 0) return 'thirsty';
  return 'fresh';
};

const FarmHero = ({ counts, health, state, onSelectGroup, children }) => {
  "use memo";

  const mood = SKY_CLASS[state] ? state : heroMood(health);

  return (
    /*
      §9 상단과 본문을 잇는 방식 — 히어로와 본문 사이에 선도, 색 경계도, 모서리도 없다.
      히어로 자체는 overflow 를 열어 둔다 — 주 CTA 가 아래로 16px 흘러나와야 하기 때문이다(§7).
      112% 폭 일러스트는 아래 클립 상자가 가둔다.
    */
    <div className={`relative w-full h-[420px] flex-shrink-0 z-[1] ${SKY_CLASS[mood]}`}>
      {/* 해 — 시안 .hero .sun (top:150px · right:26px · 56×56) */}
      <div className={`absolute top-[150px] right-[26px] w-[56px] h-[56px] rounded-full ${SUN_CLASS[mood]}`} />

      {/*
        클립 상자 — 히어로 폭 + 아래로 4px. 일러스트가 좌우로 넘치는 만큼만 잘라내고
        시안의 bottom:-4px 흘러내림은 그대로 살린다.
        (히어로에 overflow 를 걸면 CTA 까지 잘리므로 한 겹 안에서 처리한다.)
      */}
      <div className="absolute inset-x-0 top-0 bottom-[-4px] overflow-hidden">
        {/*
          이미지 상자 — 시안 CSS 와 같은 배치다: width 112%, left -6%, bottom -4px.
          밭이 화면 좌우로 살짝 넘쳐야 섬이 잘린 게 아니라 이어지는 것처럼 보인다.
          하단이 알파로 페이드되어 있어 어떤 배경 위에 놓아도 그 색으로 녹아든다(§17).
          팻말은 이 상자 안에 % 로 얹혀 이미지와 함께 움직인다.
        */}
        {/*
          시안 `.scene` 그대로 — **높이 313px 고정** + `background-size:100% auto`.
          <img h-auto> 로 두면 폭에 비례해 높이가 무한정 커진다(넓은 화면에서 밭이 히어로를
          삼키고 화면 밖으로 넘친다). 시안은 세로를 고정하고 아래를 기준으로 잘라 낸다.
        */}
        <div
          className="absolute left-[-6%] w-[112%] bottom-0 h-[313px] bg-no-repeat bg-bottom"
          style={{ backgroundImage: `url(${HERO_SRC[mood]})`, backgroundSize: '100% auto' }}
        >

          {SIGNS.map((sign) => {
            const n = counts?.[sign.crop] ?? 0;
            // §3 — 보유가 0인 단계에는 팻말이 서지 않는다. 빈 구역 자체가 정보다.
            if (n <= 0) return null;
            const Tag = onSelectGroup ? 'button' : 'div';
            return (
              <Tag
                key={sign.crop}
                {...(onSelectGroup ? { type: 'button', onClick: () => onSelectGroup(sign.crop) } : {})}
                style={{ left: `${sign.left}%`, top: `${sign.top}%` }}
                className="absolute z-[14] -translate-x-1/2 w-[62px] h-[35px]"
              >
                {/* 말뚝 — 판 뒤에 서고 아래로 뻗는다. 판과 6/96 만큼 겹친다(생성 스크립트 그대로).
                    치수를 % 로 두는 이유는 판이 폰 폭에 따라 커지기 때문이다. */}
                <span
                  aria-hidden
                  className="
                    absolute left-1/2 -translate-x-1/2 z-0
                    w-[8.8%] h-[41.7%] top-[93.75%]
                    bg-[linear-gradient(180deg,#96683E_0%,#6E4828_100%)]
                  "
                />
                {/* 나무 판 — 밝은 나무 + 어두운 테두리 + 상단 하이라이트.
                    히어로 PNG 에서 팻말을 빼고 여기서 그린다. 판이 이미지에 구워져 있으면
                    보유 0인 단계에서 **빈 판만 남는다** — 글자를 지워도 나무가 지워지지 않는다. */}
                <span
                  className="
                    absolute inset-0 z-[1] flex items-center justify-center gap-[3px]
                    rounded-[6px] border-[1.8px] border-[#96683E]
                    bg-[linear-gradient(180deg,#D8AC74_0%,#BE8F58_100%)]
                    shadow-[0_2px_5px_rgba(92,58,30,0.28)]
                    overflow-hidden
                  "
                >
                  <span
                    aria-hidden
                    className="absolute left-[5%] right-[5%] top-[9%] h-[42%] rounded-[4px] bg-[rgba(255,240,214,0.18)] blur-[2px]"
                  />
                  <CropImage stage={sign.crop} health={HEALTH_STATES.FRESH} size={17} />
                  {/* §5 — 단계명 9px/700 #7A5433 · 보유 수 13px/800 #4A2E17 (나무 위에서 읽히는 갈색) */}
                  <span className="relative min-w-0 text-left">
                    <span className="block text-[9px] font-[700] text-[#7A5433] tracking-[-0.05em] leading-[1.05]">
                      {CROP_LABEL[sign.crop]}
                    </span>
                    <span className="block text-[13px] font-[800] text-[#4A2E17] tracking-[-0.05em] leading-[1.1] mt-[1px]">
                      {n}
                    </span>
                  </span>
                </span>
              </Tag>
            );
          })}
        </div>
      </div>

      {/* 헤드라인 · 보석 칩 · 주황 핀 · 주 CTA — 화면이 넘긴다 */}
      {children}
    </div>
  );
};

export default FarmHero;
