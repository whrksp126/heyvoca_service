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
// 밭 그림은 더 이상 상태별 완성본(hero-fresh/thirsty/risk)을 골라 쓰지 않는다.
// 그 그림들은 작물까지 구워져 있어 **사용자의 실제 밭과 달랐다** — 새싹 3개뿐인 사람에게도
// 새싹 12개짜리 그림이 나갔다. 지금은 바탕만 굽고(field-base.png) 작물은 FarmField 가
// 실제 counts·건강 분포대로 심는다. 하늘색과 해만 상태에 따라 바뀐다.
import { CROP_LABEL, HEALTH_STATES } from '../../utils/crop';
import CropImage from './CropImage';
import FarmField from './FarmField';
import { SIGN_ANCHORS } from '../../utils/farmField';

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

// 팻말 좌표는 farmField 의 SIGN_ANCHORS 를 쓴다 — 작물을 심는 마름모에서 바로 나온 값이라
// 심는 범위를 조정해도 팻말이 자기 구역을 계속 가리킨다. 이미지 상자(1200×860) 대비 %라
// 폰 폭이 달라져도 밭에 붙어 있는다.
/**
 * 팻말 아이콘이 쓸 visual_stage.
 * 씨앗 팻말은 **밭에 심긴 씨앗** 구역을 가리키므로 흙에 묻힌 씨앗 그림이어야 한다.
 * crop 키('seed')를 그냥 넘기면 봉투(보유 씨앗)가 나와, 밭 밖 "보유 씨앗" 간판과
 * 똑같은 그림이 한 화면에 두 개 뜬다.
 */
const SIGN_STAGE = { seed: 'PLANTED_SEED', sprout: 'SPROUT', leaf: 'LEAF', carrot: 'CARROT' };

// 밭 전체의 분위기 — 가장 손이 필요한 상태가 밭 전체의 인상을 정한다.
// 홈은 §12 의 상태 판정 결과를 `state` 로 직접 넘기고, 농장 상세는 이 폴백을 쓴다.
export const heroMood = (health) => {
  if ((health?.critical ?? 0) > 0 || (health?.rotten ?? 0) > 0) return 'risk';
  if ((health?.wilted ?? 0) > 0 || (health?.thirsty ?? 0) > 0) return 'thirsty';
  return 'fresh';
};

/**
 * @param {object} counts      단계별 **보유** 수 — 팻말에 적히는 값
 * @param {object} fieldCounts 단계별 **심은** 수 — 밭에 실제로 서는 작물.
 *                             주지 않으면 counts 를 쓴다(단어장 화면처럼 둘이 같은 경우).
 *                             홈은 아직 심지 않은 씨앗을 빼고 넘긴다.
 * @param {object} healthMix   그림 variant 분포 { healthy, drying, wilted, rotten }
 * @param {number} storedSeeds 아직 심지 않은 보유 씨앗 — 밭 **밖** 간판에 적힌다(기획 5.1)
 */
const FarmHero = ({ counts, fieldCounts, healthMix, storedSeeds = 0, health, state, onSelectGroup, children }) => {
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
      {/*
        클립 상자 — 시안 `.scene` 은 높이를 313px 로 고정하고 아래를 기준으로 잘라 낸다.
        그 잘라내기는 여기가 맡고, 안쪽 상자는 밭 그림의 제 비율(1200:860)을 지킨다.
        예전에는 이 상자 자체에 배경 이미지를 깔았는데, 폭이 390px 이 아니면
        상자 높이(313 고정)와 그림 높이(폭×0.717)가 어긋나 팻말이 밭에서 떠올랐다.
      */}
      <div className="absolute inset-x-0 top-0 bottom-[-4px] overflow-hidden">
        {/*
          밭 상자 — width 112%, left -6%, 아래 정렬.
          밭이 화면 좌우로 살짝 넘쳐야 섬이 잘린 게 아니라 이어지는 것처럼 보인다.
          하단이 알파로 페이드되어 있어 어떤 배경 위에 놓아도 그 색으로 녹아든다(§17).
          작물·마스코트·팻말이 모두 이 상자 안에 % 로 얹혀 함께 움직인다.
        */}
        <div className="absolute left-[-6%] w-[112%] bottom-0">
        <FarmField
          counts={fieldCounts || counts}
          healthMix={healthMix}
          maxSprites={96}
          mascot
          storedSeeds={storedSeeds}
        >
          {SIGN_ANCHORS.map((sign) => {
            // 팻말은 **그 구역에 실제로 선 작물**을 센다. 보유 씨앗은 밭 밖 간판이 따로 말하므로
            // 여기에 더하면 같은 씨앗이 두 번 세어지고, 팻말이 가리키는 빈 구역과도 어긋난다.
            const n = (fieldCounts || counts)?.[sign.crop] ?? 0;
            // §3 — 그 구역에 아무것도 없으면 팻말이 서지 않는다. 빈 구역 자체가 정보다.
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
                  <CropImage stage={SIGN_STAGE[sign.crop]} health={HEALTH_STATES.FRESH} size={30} />
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
        </FarmField>
        </div>
      </div>

      {/* 헤드라인 · 보석 칩 · 주황 핀 · 주 CTA — 화면이 넘긴다 */}
      {children}
    </div>
  );
};

export default FarmHero;
