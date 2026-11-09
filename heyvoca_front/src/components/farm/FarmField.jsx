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
// 밭 테두리(풀색 rim) 마스크 — field-base.png 에서 풀색 픽셀만 뽑은 알파 마스크 두 장.
// 윗면(밝은 풀색)과 옆면(어두운 풀색)을 나눠 두어야 색을 칠해도 입체감이 남는다.
// 흙과 닿는 가장자리·바깥 안티에일리어싱은 알파로 부드럽게 들어 있다(바닥 그림자는 제외).
import rimTopMask from '../../assets/images/farm/field-rim-top.png';
import rimSideMask from '../../assets/images/farm/field-rim-side.png';
import { CROP_ASSETS, cropAssetByVariant } from './CropImage';
import { plantField, plantFieldByWords, CROP_BASELINE } from '../../utils/farmField';

/** '#RGB' / '#RRGGBB' / '#RRGGBBAA' → [r,g,b] (그 밖의 값은 null) */
const parseHex = (value) => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(String(value || '').trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};

const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

/** 상대 휘도(0~1, sRGB 근사) */
const luminance = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/** 아주 옅은 색은 흰 바탕·하늘 위에서 테두리가 사라지므로 이 휘도까지 눌러 쓴다 */
const RIM_MAX_LUMINANCE = 0.8;
/** 옆면 = 윗면을 이만큼 어둡게 — 원래 풀색 rim 의 윗면(172,217,130)/옆면(124,166,90) 비와 같다 */
const RIM_SIDE_SHADE = 0.76;

/**
 * 단어장 색 → 테두리 윗면·옆면 색. hex 가 아니면(var(--…) 등) 계산 대신 color-mix 로 맡긴다.
 * @returns {{ top: string, side: string } | null}
 */
export const rimShades = (color) => {
  if (!color) return null;
  const rgb = parseHex(color);
  if (!rgb) {
    return { top: color, side: `color-mix(in srgb, ${color} ${RIM_SIDE_SHADE * 100}%, black)` };
  }
  const lum = luminance(rgb);
  const top = lum > RIM_MAX_LUMINANCE ? rgb.map((v) => v * (RIM_MAX_LUMINANCE / lum)) : rgb;
  return { top: toHex(top), side: toHex(top.map((v) => v * RIM_SIDE_SHADE)) };
};

/**
 * 단어장 color(JSON {main, sub, background} — 문자열로 올 때도 있다) → 테두리에 칠할 main.
 * 서점 단어장도 고유 color 를 가진다.
 */
export const bookRimColor = (color) => {
  let obj = color;
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch { return parseHex(obj) ? obj : null; }
  }
  return obj?.main || null;
};

/**
 * @param {object}  counts     단계별 **심은** 작물 수 { seed, sprout, leaf, carrot }
 * @param {object}  healthMix  그림 variant 분포 { healthy, drying, wilted, rotten }
 * @param {Array}   words      (선택) 실제 단어 목록 {id, stage, health} — 주어지면 counts/healthMix
 *                             대신 이걸로 심는다(plantFieldByWords, 단어 id 기반 결정적 슬롯 —
 *                             2026-09-27 QA 2차 §D). 홈 히어로만 쓴다. 비어 있으면 기존
 *                             집계 기반(plantField)으로 자동 폴백한다(로딩 중·구버전 등).
 * @param {boolean} shadows    작물 접지 그림자 (썸네일에서는 꺼서 그리는 값을 줄인다)
 * @param {boolean} soloCrops  작물을 unplanted 판으로 그린다.
 *                             원래는 planted 에 흙 원판이 딸려 있어 밭 바닥에 얼룩처럼 보이던 것을
 *                             피하려고 만든 스위치인데, **planted 가 V5 로 바뀌며 원판이 사라져**
 *                             그 이유는 없어졌다. 지금은 온보딩만 켜고 있고, 켜면 아직 V3 계열인
 *                             unplanted 그림이 나오므로 다른 화면과 그림체가 달라진다.
 * @param {string}  rimColor   (선택) 밭 테두리(풀색 rim)를 이 색으로 칠한다 — 단어장 밭(목록 썸네일·
 *                             상세 히어로)이 단어장 color.main 을 넘긴다. 없으면 원래 풀색 그대로.
 *                             홈의 전체 밭은 여러 단어장 합본이라 넘기지 않는다(이슈 #25 4차).
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
  words,
  maxSprites = 96,
  mascot = false,
  shadows = true,
  reserveSigns = true,
  soloCrops = false,
  storedSeeds = 0,
  rimColor = null,
  children,
}) => {
  "use memo";

  const rim = rimShades(rimColor);

  const { items } = useMemo(
    () => (words && words.length > 0
      ? plantFieldByWords(words, { maxSprites, mascot, reserveSigns })
      : plantField(counts, healthMix, { maxSprites, mascot, reserveSigns })),
    [words, counts, healthMix, maxSprites, mascot, reserveSigns],
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
                미학습
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
      {/* 단어장 색 테두리 — 풀색 rim 위에 같은 모양의 색 판을 덮는다(마스크 두 장).
          다크모드에선 밝은 단어장 색이 어두운 화면에서 떠 보이지 않게 살짝 누른다. */}
      {rim && [[rimTopMask, rim.top], [rimSideMask, rim.side]].map(([mask, color]) => (
        <span
          key={mask}
          aria-hidden
          className="absolute inset-0 pointer-events-none dark:brightness-[0.9]"
          style={{
            backgroundColor: color,
            WebkitMaskImage: `url(${mask})`,
            maskImage: `url(${mask})`,
            WebkitMaskSize: '100% 100%',
            maskSize: '100% 100%',
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
          }}
        />
      ))}

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
