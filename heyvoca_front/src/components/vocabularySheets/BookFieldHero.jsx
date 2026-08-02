import React from 'react';
// 팻말이 **없는** 판. 나무 판까지 이미지에 구워 두면 보유 0 인 단계에서 글자만 사라지고
// 빈 판이 밭에 남는다. 판·말뚝은 아래에서 CSS 로 그린다(홈 히어로와 같은 처리).
import bookHero from '../../assets/images/farm/book-hero-nosign.png';
import CropImage from '../farm/CropImage';
import { CROP_LABEL, HEALTH_STATES } from '../../utils/crop';

/**
 * 단어장 안 — 이 단어장만의 밭. 시안 vocabooks §4.
 *
 * 홈의 히어로를 그대로 축소했다. 밭 + 나무 팻말 4개 + 히어로 하단에 겹쳐 뜬 주 CTA.
 * 좌표계만 줄였고(히어로 341px · 이미지 108%) 구성은 하나도 바꾸지 않았다.
 * 마스코트는 없다 — 농장 전체의 주인이라 밭 하나짜리 화면에는 서지 않는다.
 *
 * 팻말 좌표는 herov4/layout.json 의 `book-hero` 값(1200×860 기준)을 %로 바꾼 것이다.
 * px 로 두면 폰 폭이 달라질 때 팻말이 밭에서 떨어져 나간다.
 * 판·말뚝까지 여기서 그린다 — 이미지에 구워 두면 보유 0 인 단계에 빈 판이 남는다.
 */
const SIGNS = [
  { crop: 'seed', left: 50, top: 32.79 },     // x 600 / y 282
  { crop: 'sprout', left: 27.83, top: 46.51 }, // x 334 / y 400
  { crop: 'leaf', left: 72.17, top: 46.51 },   // x 866 / y 400
  { crop: 'carrot', left: 50, top: 60.23 },    // x 600 / y 518
];

const BookFieldHero = ({ counts, children }) => {
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
          <img src={bookHero} alt="" draggable={false} className="block w-full h-auto select-none" />

          {SIGNS.map((sign) => {
            const n = counts?.[sign.crop] ?? 0;
            // 보유가 0인 단계에는 팻말이 서지 않는다. 빈 구역 자체가 정보다.
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
                    stage={sign.crop}
                    health={HEALTH_STATES.FRESH}
                    size={16}
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
