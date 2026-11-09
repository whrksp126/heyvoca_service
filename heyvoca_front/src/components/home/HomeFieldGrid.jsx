// src/components/home/HomeFieldGrid.jsx
//
// 홈 히어로의 밭 — 단어장마다 밭 하나(이슈 #25 6차).
//
// 예전에는 관리 중인 작물 전부를 한 장의 큰 밭(마름모 섬)에 심었다. 지금은 단어장 하나가
// 밭 하나다. 밭 그림은 단어장 목록·단어장 상세와 **같은 FarmField**(테두리 = 단어장 색)를
// 그대로 쓰고, 그 타일들을 돌리지 않은 격자로 늘어놓아 모든 밭이 한눈에 보이게 한다.
//
// 【배치】 개수에 맞춰 열 수를 고른다 — 1개=크게 1 · 2~4개=2열 · 5~9개=3열 · 그 이상 4열.
//   남는 줄은 가운데로 모은다(3개 = 위 2 + 아래 1 가운데). 타일 크기는 히어로 안 빈 자리
//   (헤드라인 아래 ~ 주 CTA 위)에 가로·세로 모두 들어가는 값으로 잰다 — 많아질수록 밭과
//   작물이 같이 작아진다. 히어로 높이는 그대로라 아래 카드들의 자리가 흔들리지 않는다.
//   4열×4줄(16칸)을 넘으면 마지막 칸이 "+N" 칸이 되어 학습장 단어장 목록으로 보낸다.
//
// 【성능】 밭마다 작물 표시 상한을 타일 크기에 맞춰 줄인다(대표 작물만 — plantFieldByWords 가
//   id 순 전 구간에서 고르게 표본을 뽑는다). 작은 타일은 접지 그림자도 끈다.
//   눌림 연출은 transform(scale)만 쓴다.
//
// 【상태 요약】 밭이 하나뿐이면 홈 히어로와 같은 나무 팻말 4개(단계별 수)를 세운다.
//   여럿이면 칸마다 나무 이름판(단어장 이름) + 단어장 목록 카드와 같은 배지(돌봄 N · 완료)를 단다.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from '@phosphor-icons/react';
import FarmField, { bookRimColor } from '../farm/FarmField';
import { FieldSign } from '../farm/FarmHero';
import { SIGN_ANCHORS } from '../../utils/farmField';
import { IconCare } from '../../assets/svg/icon';

/*
  타일이 보여 주는 창 — 밭 캔버스(1200×860) 중 세로 180~820 만 잘라 보인다.
  캔버스 위쪽 1/5 은 섬 위 허공이라 그대로 두면 칸 사이가 휑하게 벌어진다.
  180 은 가장 뒷줄의 가장 큰 작물 꼭대기가 잘리지 않는 높이다(farmField CROP_BOX 기준).
*/
const VIEW_TOP = 180;
const VIEW_BOTTOM = 820;
const VIEW_RATIO = (VIEW_BOTTOM - VIEW_TOP) / 1200; // 타일 높이 / 폭
const VIEW_OFFSET_PCT = (VIEW_TOP / (VIEW_BOTTOM - VIEW_TOP)) * 100;

const GAP = 6;
const MAX_TILES = 16;

/** 개수 → 열 수 */
const columnsFor = (n) => {
  if (n <= 1) return 1;
  if (n <= 4) return 2;
  if (n <= 9) return 3;
  return 4;
};

/** 타일 폭(px) → 작물 표시 상한 · 그림자 */
const spriteBudget = (w) => {
  if (w >= 260) return { maxSprites: 72, shadows: true };
  if (w >= 150) return { maxSprites: 28, shadows: true };
  if (w >= 105) return { maxSprites: 16, shadows: false };
  return { maxSprites: 10, shadows: false };
};

/** 칸마다 다는 배지 — VocaBookCard 와 같은 색(돌봄 = 파랑 · 완료 = 초록) */
const BADGE_CLASS = {
  care: 'bg-secondary-blue-100 dark:bg-secondary-blue-dark text-[#175CD3] dark:text-[#84CAFF]',
  done: 'bg-status-success-100 dark:bg-status-success-dark text-status-success-600',
};

/** 단어장 이름판 — 홈 밭 팻말과 같은 나무 판(판만, 말뚝 없음) */
const NameBoard = ({ title, small }) => (
  <span
    className={`
      relative block max-w-full truncate
      rounded-[5px] border-[1.4px] border-[#96683E]
      bg-[linear-gradient(180deg,#D8AC74_0%,#BE8F58_100%)]
      shadow-[0_1px_4px_rgba(92,58,30,0.26)]
      font-[800] text-[#4A2E17] tracking-[-0.04em] leading-[1.25]
      ${small ? 'px-[4px] py-[1px] text-[9px]' : 'px-[6px] py-[2px] text-[11px]'}
    `}
  >
    {title}
  </span>
);

const BookBadge = ({ badge, small }) => {
  if (!badge) return null;
  return (
    <span
      className={`
        flex items-center gap-[2px] shrink-0 rounded-full font-[800] tracking-[-0.02em]
        shadow-[0_1px_3px_rgba(92,58,30,0.18)]
        ${small ? 'px-[4px] py-[1px] text-[9px]' : 'px-[6px] py-[2px] text-[11px]'}
        ${BADGE_CLASS[badge.kind]}
      `}
    >
      {badge.kind === 'care'
        ? <IconCare size={small ? 11 : 14} />
        : <Check size={small ? 9 : 11} weight="bold" />}
      {badge.kind === 'care' && badge.text.replace(/\D+/g, '')}
    </span>
  );
};

const FieldTile = ({ row, width, single, onSelect }) => {
  "use memo";

  const { maxSprites, shadows } = spriteBudget(width);
  const small = width < 120;
  const { book, field, fieldWords, badge } = row;

  return (
    <motion.button
      type="button"
      onClick={() => onSelect(book.id)}
      whileTap={{ scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      aria-label={book.title}
      className="relative shrink-0 overflow-hidden"
      style={{ width, height: width * VIEW_RATIO }}
    >
      <span className="absolute inset-x-0 block" style={{ top: `-${VIEW_OFFSET_PCT}%` }}>
        <FarmField
          counts={field.counts}
          healthMix={field.healthMix}
          words={fieldWords}
          maxSprites={maxSprites}
          shadows={shadows}
          reserveSigns={single}
          rimColor={bookRimColor(book.color)}
        >
          {single && SIGN_ANCHORS.map((sign) => {
            const n = field.counts?.[sign.crop] ?? 0;
            if (n <= 0) return null;
            return <FieldSign key={sign.crop} crop={sign.crop} count={n} left={sign.left} top={sign.top} />;
          })}
        </FarmField>
      </span>

      {/* 섬 위 허공(왼쪽 위 · 오른쪽 위)에 이름판과 배지를 단다 — 밭과 작물을 가리지 않는 자리 */}
      <span className="absolute left-[3%] top-[3%] z-[16] flex max-w-[58%]">
        <NameBoard title={book.title} small={small} />
      </span>
      <span className="absolute right-[3%] top-[3%] z-[16] flex">
        <BookBadge badge={badge} small={small} />
      </span>
    </motion.button>
  );
};

/**
 * @param {Array}    rows      buildBookRow 결과(글자 단어장 제외) — 1개 이상
 * @param {function} onSelect  (bookId) => void
 * @param {function} onMore    "+N" 칸 — 칸이 모자랄 때만 쓰인다
 */
const HomeFieldGrid = ({ rows, onSelect, onMore }) => {
  "use memo";

  const boxRef = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 칸이 모자라면 돌봄이 필요한 밭부터 보인다(나머지는 원래 순서)
  const overflow = rows.length > MAX_TILES;
  const shown = useMemo(() => {
    if (!overflow) return rows;
    const sorted = [...rows].sort((a, b) => (b.care > 0) - (a.care > 0));
    return sorted.slice(0, MAX_TILES - 1);
  }, [rows, overflow]);
  const hidden = rows.length - shown.length;
  const tileCount = shown.length + (hidden > 0 ? 1 : 0);

  const cols = columnsFor(tileCount);
  const rowsN = Math.ceil(tileCount / cols);
  const byWidth = (box.w - (cols - 1) * GAP) / cols;
  const byHeight = (box.h - (rowsN - 1) * GAP) / rowsN / VIEW_RATIO;
  const tileW = Math.max(0, Math.floor(Math.min(byWidth, byHeight)));

  const lines = [];
  for (let r = 0; r < rowsN; r += 1) lines.push(Array.from({ length: cols }, (_, c) => r * cols + c).filter((i) => i < tileCount));

  return (
    <div
      ref={boxRef}
      className="
        absolute z-[5] left-[12px] right-[12px]
        top-[max(160px,calc(var(--status-bar-height)+116px))] bottom-[46px]
        flex flex-col items-center justify-center
      "
      style={{ gap: GAP }}
    >
      {tileW > 0 && lines.map((line) => (
        <div key={line[0]} className="flex justify-center" style={{ gap: GAP }}>
          {line.map((i) => {
            if (i >= shown.length) {
              return (
                <motion.button
                  key="more"
                  type="button"
                  onClick={onMore}
                  whileTap={{ scale: 0.96 }}
                  className="
                    flex items-center justify-center shrink-0 rounded-[10px]
                    border border-farm-line
                    bg-layout-white/70 dark:bg-layout-gray-dark/70
                    text-[14px] font-[800] tracking-[-0.02em]
                    text-farm-ink dark:text-layout-white
                  "
                  style={{ width: tileW, height: tileW * VIEW_RATIO }}
                >
                  +{hidden}
                </motion.button>
              );
            }
            const row = shown[i];
            return (
              <FieldTile
                key={row.book.id}
                row={row}
                width={tileW}
                single={tileCount === 1}
                onSelect={onSelect}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default HomeFieldGrid;
