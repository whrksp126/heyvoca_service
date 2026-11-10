// src/components/home/HomeFieldGrid.jsx
//
// 홈 히어로의 밭 지도 — 단어장마다 밭 하나(이슈 #25 6차 → 밭 지도).
//
// 밭 그림은 단어장 목록·단어장 상세와 **같은 FarmField**(테두리 = 단어장 색)를 그대로 쓴다.
//
// 【배치】 아이소메트릭 격자. 마름모 밭들이 가는 길만 두고 대각선 변을 맞대 이어진다
//   (체스판을 45도 돌린 모양). 격자 칸 (col,row) → 화면 x=(col−row)·W/2, y=(col+row)·H/2.
//   W×H 는 field-base.png 섬 윗면 마름모를 잰 값(1024×460, 중심 캔버스 (600,531)).
//   격자는 개수에 맞춘 정사각형에 가까운 c×r(c=⌈√n⌉, r=⌈n/c⌉). 빈 칸은 그리지 않는다.
//   돌봄이 필요한 밭부터 격자 가운데 칸에 놓는다(가운데 → 바깥, 같은 거리면 앞줄 먼저).
//   뒤에서 앞으로(col+row 오름차순) 그려 앞 밭이 뒤 밭의 옆면을 덮는다.
//
// 【제스처】 포인터 이벤트로 직접 처리한다(라이브러리 없음).
//   처음엔 모든 밭이 영역에 들어오게 맞춘다(fit = 배율 1). 두 손가락 핀치 = 확대·축소(1~4.5배,
//   손가락 사이 지점 고정), 확대 상태에서 한 손가락 드래그 = 이동. 이동은 밭 묶음이 영역을
//   벗어나지 않게 클램프한다. 갱신은 transform 한 레이어만 rAF 로 바꾼다(리렌더 없음).
//   홈은 세로 스크롤 페이지라 fit 상태에선 touch-action: pan-y 로 한 손가락 세로 드래그를
//   페이지 스크롤에 넘기고, 확대 상태에서만 touch-action: none 으로 지도가 터치를 잡는다.
//   이동 거리가 작은 한 손가락 터치만 탭 — 화면 좌표를 밭 좌표로 되돌려 마름모 안에 든 밭(앞줄 우선)을
//   고른다. 당겨서 새로고침은 data-no-ptr 로 끈다.
//
// 【성능】 밭마다 작물 표시 상한을 fit 타일 크기에 맞춰 줄인다(확대해도 늘리지 않는다).
//   작은 타일은 접지 그림자도 끈다.
//
// 【상태 요약】 밭이 하나뿐이면 지도 대신 크게 한 장 + 나무 팻말 4개(단계별 수).
//   여럿이면 밭마다 나무 이름판(단어장 이름) + 단어장 목록 카드와 같은 배지(돌봄 N · 완료).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from '@phosphor-icons/react';
import FarmField, { bookRimColor } from '../farm/FarmField';
import { FieldSign } from '../farm/FarmHero';
import { SIGN_ANCHORS, FIELD_W as FIELD_CANVAS_W } from '../../utils/farmField';
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

/* 섬 윗면 마름모(캔버스 px) — field-base.png 를 재서 잡았다 */
const DIA_CX = 600;
const DIA_CY = 531;
const DIA_W = 1024;
const DIA_H = 460;
const PATH = 22; // 밭 사이 길 폭(캔버스 px, 변에 수직이 아니라 격자 축 방향 근사)
const STEP_X = DIA_W / 2 + PATH;
const STEP_Y = (DIA_W / 2 + PATH) * (DIA_H / DIA_W);
/* 밭 하나가 그림으로 차지하는 범위(마름모 중심 기준) — 위는 가장 큰 작물·이름판, 아래는 섬 옆면 */
const EXT_LEFT = DIA_W / 2 + 8;
const EXT_TOP = DIA_CY - VIEW_TOP;
const EXT_BOTTOM = 805 - DIA_CY + 6;

const MAX_ZOOM = 4.5;
const TAP_SLOP = 8;

/** 개수 → 격자 c×r (정사각형에 가깝게) */
const gridFor = (n) => {
  const c = Math.max(1, Math.ceil(Math.sqrt(n)));
  return { c, r: Math.max(1, Math.ceil(n / c)) };
};

/** 칸 순서 — 가운데 → 바깥, 같은 거리면 앞줄(col+row 큰 쪽) 먼저 */
const cellOrder = (c, r) => {
  const cells = [];
  for (let col = 0; col < c; col += 1) for (let row = 0; row < r; row += 1) cells.push({ col, row });
  const mc = (c - 1) / 2;
  const mr = (r - 1) / 2;
  const dist = (p) => (p.col - mc) ** 2 + (p.row - mr) ** 2;
  return cells.sort((a, b) => dist(a) - dist(b) || (b.col + b.row) - (a.col + a.row) || a.col - b.col);
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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

/** 지도 위 밭 한 장 — 터치는 지도가 받는다(이 칸은 그림만) */
const MapField = React.memo(({ row, tileW, budget, left, top }) => {
  const { book, field, fieldWords } = row;
  return (
    <div className="absolute pointer-events-none" style={{ left, top, width: tileW }}>
      <FarmField
        counts={field.counts}
        healthMix={field.healthMix}
        words={fieldWords}
        maxSprites={budget.maxSprites}
        shadows={budget.shadows}
        reserveSigns={false}
        rimColor={bookRimColor(book.color)}
      />
    </div>
  );
});

/**
 * @param {Array}    rows      buildBookRow 결과(글자 단어장 제외) — 1개 이상
 * @param {function} onSelect  (bookId) => void
 */
const HomeFieldGrid = ({ rows, onSelect }) => {
  "use memo";

  const boxRef = useRef(null);
  const layerRef = useRef(null);
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

  const single = rows.length === 1;

  // 격자 칸 배정 — 돌봄이 필요한 밭부터 가운데 칸(그 밖은 원래 순서)
  const placed = useMemo(() => {
    if (single) return [];
    const sorted = [...rows].sort((a, b) => (b.care > 0) - (a.care > 0));
    const { c, r } = gridFor(sorted.length);
    const cells = cellOrder(c, r);
    return sorted
      .map((row, i) => {
        const { col, row: rr } = cells[i];
        return { row, cx: (col - rr) * STEP_X, cy: (col + rr) * STEP_Y, depth: col + rr };
      })
      .sort((a, b) => a.depth - b.depth || a.cx - b.cx);
  }, [rows, single]);

  // fit — 모든 밭이 영역에 들어오는 배율(캔버스 px → 화면 px)
  const layout = useMemo(() => {
    if (single || placed.length === 0 || box.w <= 0 || box.h <= 0) return null;
    let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
    placed.forEach(({ cx, cy }) => {
      x0 = Math.min(x0, cx - EXT_LEFT); x1 = Math.max(x1, cx + EXT_LEFT);
      y0 = Math.min(y0, cy - EXT_TOP); y1 = Math.max(y1, cy + EXT_BOTTOM);
    });
    const s = Math.min(box.w / (x1 - x0), box.h / (y1 - y0));
    const ox = (box.w - (x1 - x0) * s) / 2 - x0 * s;
    const oy = (box.h - (y1 - y0) * s) / 2 - y0 * s;
    return {
      s,
      ox,
      oy,
      tileW: FIELD_CANVAS_W * s,
      content: { x0: x0 * s + ox, x1: x1 * s + ox, y0: y0 * s + oy, y1: y1 * s + oy },
    };
  }, [placed, single, box.w, box.h]);

  /* ── 변환(배율 k, 이동 tx·ty) — 리렌더 없이 레이어 transform 만 바꾼다 ── */
  const view = useRef({ k: 1, tx: 0, ty: 0 });
  const raf = useRef(0);

  const apply = useCallback(() => {
    raf.current = 0;
    const { k, tx, ty } = view.current;
    if (layerRef.current) layerRef.current.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${k})`;
    // fit 상태에선 한 손가락 세로 드래그를 페이지 스크롤로 넘긴다
    if (boxRef.current) boxRef.current.style.touchAction = k > 1.001 ? 'none' : 'pan-y';
  }, []);

  const schedule = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(apply);
  }, [apply]);

  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

  /** 밭 묶음이 영역 밖으로 지나치게 끌리지 않게 — 영역보다 크면 가장자리까지만, 작으면 가운데 */
  const clampView = useCallback((v) => {
    if (!layout) return v;
    const k = clamp(v.k, 1, MAX_ZOOM);
    const { x0, x1, y0, y1 } = layout.content;
    const axis = (t, lo, hi, size) => {
      const span = (hi - lo) * k;
      if (span <= size) return (size - (lo + hi) * k) / 2;
      return clamp(t, size - hi * k, -lo * k);
    };
    return { k, tx: axis(v.tx, x0, x1, box.w), ty: axis(v.ty, y0, y1, box.h) };
  }, [layout, box.w, box.h]);

  // 배치·영역이 바뀌면 fit 으로 되돌린다
  useEffect(() => {
    view.current = { k: 1, tx: 0, ty: 0 };
    schedule();
  }, [layout, schedule]);

  /* ── 포인터 ── */
  const pointers = useRef(new Map());
  const gesture = useRef(null);

  /** 화면 점(영역 기준) → 그 자리 밭 (마름모 안, 앞줄 우선 · 가까운 것) */
  const hitTest = (px, py) => {
    if (!layout) return null;
    const { k, tx, ty } = view.current;
    const wx = ((px - tx) / k - layout.ox) / layout.s;
    const wy = ((py - ty) / k - layout.oy) / layout.s;
    let best = null; let bestD = Infinity;
    for (let i = placed.length - 1; i >= 0; i -= 1) {
      const p = placed[i];
      const d = Math.abs(wx - p.cx) / (DIA_W / 2) + Math.abs(wy - p.cy) / (DIA_H / 2);
      if (d <= 1) return p.row; // 앞줄부터 훑으므로 처음 맞은 것이 가장 앞
      if (d < bestD) { bestD = d; best = p.row; }
    }
    return bestD < 1.4 ? best : null; // 이름판·작물처럼 마름모 바로 바깥을 누른 경우
  };

  const localPoint = (e) => {
    const rect = boxRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startGesture = () => {
    const pts = [...pointers.current.values()];
    const v = { ...view.current };
    if (pts.length >= 2) {
      const [a, b] = pts;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      gesture.current = { kind: 'pinch', dist0: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid0: mid, v0: v, tap: false };
    } else if (pts.length === 1) {
      const prevTap = gesture.current?.tap ?? true;
      gesture.current = { kind: 'pan', start: { ...pts[0] }, v0: v, tap: gesture.current ? prevTap && gesture.current.kind !== 'pinch' : true };
    } else {
      gesture.current = null;
    }
  };

  const onPointerDown = (e) => {
    if (!layout || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (pointers.current.size === 0) gesture.current = null;
    pointers.current.set(e.pointerId, localPoint(e));
    try { boxRef.current.setPointerCapture(e.pointerId); } catch { /* 무시 */ }
    startGesture();
  };

  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, localPoint(e));
    const g = gesture.current;
    if (!g) return;
    const pts = [...pointers.current.values()];
    if (g.kind === 'pinch' && pts.length >= 2) {
      const [a, b] = pts;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const k = clamp(g.v0.k * (Math.hypot(a.x - b.x, a.y - b.y) / g.dist0), 1, MAX_ZOOM);
      // 처음 두 손가락 사이에 있던 밭 지점이 지금 손가락 사이에 오게
      const wx = (g.mid0.x - g.v0.tx) / g.v0.k;
      const wy = (g.mid0.y - g.v0.ty) / g.v0.k;
      view.current = clampView({ k, tx: mid.x - wx * k, ty: mid.y - wy * k });
      schedule();
    } else if (g.kind === 'pan' && pts.length === 1) {
      const dx = pts[0].x - g.start.x;
      const dy = pts[0].y - g.start.y;
      if (Math.hypot(dx, dy) > TAP_SLOP) g.tap = false;
      if (g.v0.k > 1.001) {
        view.current = clampView({ k: g.v0.k, tx: g.v0.tx + dx, ty: g.v0.ty + dy });
        schedule();
      }
    }
  };

  const endPointer = (e, cancelled) => {
    if (!pointers.current.has(e.pointerId)) return;
    const g = gesture.current;
    const last = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      if (!cancelled && g?.kind === 'pan' && g.tap) {
        const hit = hitTest(last.x, last.y);
        if (hit) onSelect(hit.book.id);
      }
      gesture.current = null;
      return;
    }
    // 핀치에서 한 손가락만 남으면 이어서 이동(탭은 아님)
    startGesture();
    if (gesture.current) gesture.current.tap = false;
  };

  // 데스크톱 트랙패드 핀치(ctrl+wheel)
  useEffect(() => {
    const el = boxRef.current;
    if (!el || !layout) return undefined;
    const onWheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const v = view.current;
      const k = clamp(v.k * Math.exp(-e.deltaY / 100), 1, MAX_ZOOM);
      const wx = (px - v.tx) / v.k;
      const wy = (py - v.ty) / v.k;
      view.current = clampView({ k, tx: px - wx * k, ty: py - wy * k });
      schedule();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [layout, clampView, schedule]);

  const boxClass = `
    absolute z-[5] left-[12px] right-[12px]
    top-[max(160px,calc(var(--status-bar-height)+116px))] bottom-[46px]
  `;

  // 단어장이 하나면 지도 대신 크게 한 장 + 팻말
  if (single) {
    const byWidth = box.w;
    const byHeight = box.h / VIEW_RATIO;
    const tileW = Math.max(0, Math.floor(Math.min(byWidth, byHeight)));
    return (
      <div ref={boxRef} className={`${boxClass} flex items-center justify-center`}>
        {tileW > 0 && <FieldTile row={rows[0]} width={tileW} single onSelect={onSelect} />}
      </div>
    );
  }

  const budget = layout ? spriteBudget(layout.tileW) : null;
  const small = layout ? layout.tileW < 200 : true;

  return (
    <div
      ref={boxRef}
      data-no-ptr
      role="group"
      className={`${boxClass} overflow-hidden select-none touch-pan-y`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endPointer(e, false)}
      onPointerCancel={(e) => endPointer(e, true)}
      onLostPointerCapture={(e) => endPointer(e, true)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {layout && (
        <div ref={layerRef} className="absolute left-0 top-0 w-full h-full origin-top-left will-change-transform">
          {placed.map((p) => (
            <MapField
              key={p.row.book.id}
              row={p.row}
              tileW={layout.tileW}
              budget={budget}
              left={layout.ox + (p.cx - DIA_CX) * layout.s}
              top={layout.oy + (p.cy - DIA_CY) * layout.s}
            />
          ))}
          {/* 이름판·배지 — 밭 그림보다 위 한 층(뒤 밭 작물에 가리지 않게), 마름모 위 꼭짓점에 단다 */}
          {placed.map((p) => (
            <div
              key={`label-${p.row.book.id}`}
              aria-label={p.row.book.title}
              className="absolute z-[16] flex items-center gap-[3px] pointer-events-none -translate-x-1/2 -translate-y-1/2"
              style={{
                left: layout.ox + p.cx * layout.s,
                top: layout.oy + (p.cy - DIA_H / 2) * layout.s,
                maxWidth: DIA_W * 0.6 * layout.s,
              }}
            >
              <span className="flex min-w-0"><NameBoard title={p.row.book.title} small={small} /></span>
              <BookBadge badge={p.row.badge} small={small} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default HomeFieldGrid;
