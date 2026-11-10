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
// 【레이어】 지도는 홈 히어로 전체(inset-0)에 깔린 **배경**이다. 인사·헤드라인·칩·주 CTA 는
//   그 위 층에 떠 있고, 빈 곳은 포인터가 지도로 통과한다(헤드라인 pointer-events: none).
//   '보이는 창'(focus) = 헤드라인 아래 ~ CTA 위. 배율·시작 위치·이동 경계는 이 창을 기준으로
//   잡지만, 밭은 창 밖(텍스트·버튼 밑)으로도 지나가며 보인다. 위·아래 가장자리엔 하늘·화면
//   배경 토큰으로 은은한 페이드만 깐다.
//
// 【제스처】 포인터 이벤트로 직접 처리한다(라이브러리 없음). 지도 위에선 touch-action: none —
//   한 손가락 드래그 = 이동, 두 손가락 핀치 = 확대·축소(손가락 사이 지점 고정).
//   배율 범위: 최소 = 전체 맞춤, 최대 = 전체 맞춤의 4.5배(시작 배율이 더 크면 그 1.5배).
//   처음 배율은 밭 4개(2×2)가 창에 맞게 들어오는 크기(4개 이하면 전체 맞춤), 시작 위치는
//   돌봄이 필요한 밭(가운데 칸부터 놓인다)의 중심.
//   경계 밖으로 끌면 고무줄처럼 저항을 받으며 따라오고, 배율도 범위 밖으로 살짝 넘어간다.
//   손을 떼면 rAF 물리 루프가 관성(플링)으로 미끄러지다 경계 밖이면 스프링으로 되돌린다.
//   이동 거리가 작은 한 손가락 터치만 탭 — 화면 좌표를 밭 좌표로 되돌려 마름모 안에 든 밭(앞줄 우선)을
//   고른다. 당겨서 새로고침은 data-no-ptr 로 끈다.
//
// 【성능】 밭은 시작 배율 크기로 한 번 그리고(선명), 이후 변화는 transform 한 레이어만 rAF 로
//   바꾼다(리렌더 없음). 작물 표시 상한은 시작 배율 타일 크기에 맞춘다.
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
const PATH = 84; // 밭 사이 길 폭(캔버스 px, 격자 축 방향 근사) — 밭 폭(1024)의 약 8%
const STEP_X = DIA_W / 2 + PATH;
const STEP_Y = (DIA_W / 2 + PATH) * (DIA_H / DIA_W);
/* 밭 하나가 그림으로 차지하는 범위(마름모 중심 기준) — 위는 가장 큰 작물·이름판, 아래는 섬 옆면 */
const EXT_LEFT = DIA_W / 2 + 8;
const EXT_TOP = DIA_CY - VIEW_TOP;
const EXT_BOTTOM = 805 - DIA_CY + 6;

const MAX_ZOOM = 4.5;   // 전체 맞춤 대비 최대 배율
const START_FIELDS = 4; // 처음 화면에 적당한 크기로 들어오는 밭 수(2×2)
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

/** 고무줄 — 경계를 넘은 거리 over 를 화면 크기 dim 기준으로 감쇠(iOS 스크롤뷰 식) */
const RUBBER_C = 0.55;
const rubber = (over, dim) => {
  const a = Math.abs(over);
  return Math.sign(over) * (1 - 1 / ((a * RUBBER_C) / dim + 1)) * dim;
};
const unrubber = (y, dim) => {
  const a = Math.min(Math.abs(y), dim * 0.999);
  return Math.sign(y) * (dim / RUBBER_C) * (1 / (1 - a / dim) - 1);
};
/** 배율 고무줄 — 범위 밖 비율을 지수로 눌러 살짝만 넘어가게 */
const SCALE_RESIST = 0.3;

const readStatusBar = (el) => {
  try {
    return parseFloat(getComputedStyle(el).getPropertyValue('--status-bar-height')) || 0;
  } catch { return 0; }
};

/**
 * @param {Array}    rows      buildBookRow 결과(글자 단어장 제외) — 1개 이상
 * @param {function} onSelect  (bookId) => void
 */
const HomeFieldGrid = ({ rows, onSelect }) => {
  "use memo";

  const boxRef = useRef(null);
  const layerRef = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0, sb: 0 });

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight, sb: readStatusBar(el) });
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
        return { row, cx: (col - rr) * STEP_X, cy: (col + rr) * STEP_Y, depth: col + rr, care: row.care > 0 };
      })
      .sort((a, b) => a.depth - b.depth || a.cx - b.cx);
  }, [rows, single]);

  /*
    배치(캔버스 px) + 배율 범위(화면 px / 캔버스 px).
    focus = 헤드라인 아래 ~ CTA 위 창. minS = 전체 맞춤, startS = 2×2 맞춤, R = 그리는 배율.
  */
  const layout = useMemo(() => {
    if (single || placed.length === 0 || box.w <= 0 || box.h <= 0) return null;
    let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
    placed.forEach(({ cx, cy }) => {
      x0 = Math.min(x0, cx - EXT_LEFT); x1 = Math.max(x1, cx + EXT_LEFT);
      y0 = Math.min(y0, cy - EXT_TOP); y1 = Math.max(y1, cy + EXT_BOTTOM);
    });
    const fTop = Math.min(box.h * 0.5, Math.max(158, box.sb + 114));
    const focus = { x0: 12, x1: box.w - 12, y0: fTop, y1: Math.max(fTop + 40, box.h - 46) };
    const fw = focus.x1 - focus.x0;
    const fh = focus.y1 - focus.y0;
    const minS = Math.min(fw / (x1 - x0), fh / (y1 - y0));
    // 2×2 묶음의 범위: 가로 (col−row) −1..1, 세로 (col+row) 0..2
    const w4 = 2 * STEP_X + 2 * EXT_LEFT;
    const h4 = 2 * STEP_Y + EXT_TOP + EXT_BOTTOM;
    const startS = placed.length <= START_FIELDS ? minS : Math.max(minS, Math.min(fw / w4, fh / h4));
    const maxS = Math.max(minS * MAX_ZOOM, startS * 1.5);
    // 시작 중심 — 돌봄 밭(가운데 칸부터 놓였다)의 중심, 없으면 전체 가운데
    const careP = placed.filter((p) => p.care);
    const pick = careP.length > 0 ? careP : placed;
    const ccx = careP.length > 0 ? pick.reduce((a, p) => a + p.cx, 0) / pick.length : (x0 + x1) / 2;
    const ccy = careP.length > 0
      ? pick.reduce((a, p) => a + p.cy, 0) / pick.length + (EXT_BOTTOM - EXT_TOP) / 2
      : (y0 + y1) / 2;
    return {
      x0, x1, y0, y1, focus, minS, maxS, startS, R: startS, center: { x: ccx, y: ccy },
      tileW: FIELD_CANVAS_W * startS,
    };
  }, [placed, single, box.w, box.h, box.sb]);

  /* ── 보기 상태 { S: 배율, tx·ty: 캔버스 x0·y0 이 놓이는 화면 좌표 } — 리렌더 없이 transform 만 ── */
  const view = useRef({ S: 1, tx: 0, ty: 0 });
  const lay = useRef(null);
  lay.current = layout;
  const raf = useRef(0);

  const apply = useCallback(() => {
    raf.current = 0;
    const L = lay.current;
    if (!L || !layerRef.current) return;
    const { S, tx, ty } = view.current;
    layerRef.current.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${S / L.R})`;
  }, []);

  const schedule = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(apply);
  }, [apply]);

  /** 축 하나의 이동 경계 — 밭 묶음이 창보다 크면 끝 밭이 창 가장자리까지, 작으면 창 가운데 고정 */
  const boundsFor = (L, S, axis) => {
    const [lo, hi, f0, f1] = axis === 'x'
      ? [L.x0, L.x1, L.focus.x0, L.focus.x1]
      : [L.y0, L.y1, L.focus.y0, L.focus.y1];
    const span = (hi - lo) * S;
    if (span <= f1 - f0) { const c = f0 + (f1 - f0 - span) / 2; return [c, c]; }
    return [f1 - span, f0];
  };

  /** 원시 이동값 → 고무줄 적용된 표시값 */
  const rubberAxis = (L, S, axis, raw) => {
    const [lo, hi] = boundsFor(L, S, axis);
    const dim = axis === 'x' ? box.w : box.h;
    if (raw > hi) return hi + rubber(raw - hi, dim);
    if (raw < lo) return lo + rubber(raw - lo, dim);
    return raw;
  };
  const unrubberAxis = (L, S, axis, shown) => {
    const [lo, hi] = boundsFor(L, S, axis);
    const dim = axis === 'x' ? box.w : box.h;
    if (shown > hi) return hi + unrubber(shown - hi, dim);
    if (shown < lo) return lo + unrubber(shown - lo, dim);
    return shown;
  };
  const rubberScale = (L, raw) => {
    if (raw < L.minS) return L.minS * (raw / L.minS) ** SCALE_RESIST;
    if (raw > L.maxS) return L.maxS * (raw / L.maxS) ** SCALE_RESIST;
    return raw;
  };
  const unrubberScale = (L, S) => {
    if (S < L.minS) return L.minS * (S / L.minS) ** (1 / SCALE_RESIST);
    if (S > L.maxS) return L.maxS * (S / L.maxS) ** (1 / SCALE_RESIST);
    return S;
  };

  /** 경계 안으로 딱 맞춘 보기(고무줄 없음) — 휠 확대·배치 변경 때 */
  const hardClamp = (L, v) => {
    const S = clamp(v.S, L.minS, L.maxS);
    const [xl, xh] = boundsFor(L, S, 'x');
    const [yl, yh] = boundsFor(L, S, 'y');
    return { S, tx: clamp(v.tx, xl, xh), ty: clamp(v.ty, yl, yh) };
  };

  /* ── 놓은 뒤 물리 루프(관성 + 경계 스프링 + 배율 복귀) — rAF 한 개 ── */
  const anim = useRef({ id: 0, vx: 0, vy: 0, focal: null, last: 0 });

  const stopAnim = () => {
    if (anim.current.id) cancelAnimationFrame(anim.current.id);
    anim.current.id = 0;
  };

  const step = (now) => {
    const a = anim.current;
    const L = lay.current;
    if (!L) { a.id = 0; return; }
    const dt = Math.min(0.032, Math.max(0.001, (now - (a.last || now)) / 1000)) || 0.016;
    a.last = now;
    const v = view.current;

    // 배율 — 범위 밖이면 놓은 지점(focal)을 고정한 채 지수 스프링으로 복귀
    let { S, tx, ty } = v;
    const St = clamp(S, L.minS, L.maxS);
    if (Math.abs(St - S) > 1e-6) {
      let Sn = S + (St - S) * (1 - Math.exp(-dt * 14));
      if (Math.abs(St - Sn) < St * 1e-3) Sn = St;
      const f = a.focal || { x: box.w / 2, y: box.h / 2 };
      tx = f.x - (f.x - tx) * (Sn / S);
      ty = f.y - (f.y - ty) * (Sn / S);
      S = Sn;
    }

    // 이동 — 경계 안: 마찰로 감속 · 경계 밖: 임계 감쇠 스프링으로 경계까지
    const W = 17;
    const axisStep = (pos, vel, axis) => {
      const [lo, hi] = boundsFor(L, S, axis);
      const out = pos > hi ? pos - hi : pos < lo ? pos - lo : 0;
      let nv = vel;
      if (out !== 0) nv += (-W * W * out - 2 * W * vel) * dt;
      else nv *= Math.exp(-dt * 3.2);
      let np = pos + nv * dt;
      // 스프링이 경계를 넘어 반대로 튀지 않게
      if (out > 0 && np < hi) { np = hi; nv = 0; }
      if (out < 0 && np > lo) { np = lo; nv = 0; }
      return [np, nv, lo, hi];
    };
    const [nx, nvx, xl, xh] = axisStep(tx, a.vx, 'x');
    const [ny, nvy, yl, yh] = axisStep(ty, a.vy, 'y');
    a.vx = nvx; a.vy = nvy;
    view.current = { S, tx: nx, ty: ny };

    const settled = S === clamp(S, L.minS, L.maxS)
      && nx >= xl - 0.5 && nx <= xh + 0.5 && ny >= yl - 0.5 && ny <= yh + 0.5
      && Math.abs(nvx) < 12 && Math.abs(nvy) < 12;
    if (settled) {
      view.current = hardClamp(L, view.current);
      a.id = 0;
    } else {
      a.id = requestAnimationFrame(step);
    }
    apply();
  };

  const startAnim = (vx, vy, focal) => {
    stopAnim();
    anim.current = { id: 0, vx, vy, focal, last: 0 };
    anim.current.id = requestAnimationFrame(step);
  };

  useEffect(() => () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    stopAnim();
  }, []);

  // 처음(또는 밭 수·영역 크기가 바뀌면) 시작 배율 · 돌봄 밭 중심으로
  const sig = layout ? `${placed.length}|${box.w}|${box.h}|${box.sb}` : '';
  const lastSig = useRef('');
  useEffect(() => {
    if (!layout) return;
    stopAnim();
    if (lastSig.current !== sig) {
      lastSig.current = sig;
      const { focus, startS, center, x0, y0 } = layout;
      const fx = (focus.x0 + focus.x1) / 2;
      const fy = (focus.y0 + focus.y1) / 2;
      view.current = hardClamp(layout, { S: startS, tx: fx - (center.x - x0) * startS, ty: fy - (center.y - y0) * startS });
    } else {
      view.current = hardClamp(layout, view.current);
    }
    schedule();
  }, [layout, sig, schedule]);

  /* ── 포인터 ── */
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const samples = useRef([]);

  /** 화면 점(영역 기준) → 그 자리 밭 (마름모 안, 앞줄 우선 · 가까운 것) */
  const hitTest = (px, py) => {
    const L = lay.current;
    if (!L) return null;
    const { S, tx, ty } = view.current;
    const wx = (px - tx) / S + L.x0;
    const wy = (py - ty) / S + L.y0;
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

  /** 지금 손가락 상태로 제스처를 새로 시작 — 표시값을 원시값으로 되돌려 고무줄이 끊김 없이 이어지게 */
  const startGesture = () => {
    const L = lay.current;
    const pts = [...pointers.current.values()];
    const v = { ...view.current };
    const prevTap = gesture.current ? gesture.current.tap && gesture.current.kind !== 'pinch' : true;
    if (!L || pts.length === 0) { gesture.current = null; return; }
    if (pts.length >= 2) {
      const [a, b] = pts;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      gesture.current = {
        kind: 'pinch',
        dist0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        rawS0: unrubberScale(L, v.S),
        // 처음 두 손가락 사이에 있던 지도 지점(캔버스 오프셋)
        wx: (mid.x - v.tx) / v.S,
        wy: (mid.y - v.ty) / v.S,
        mid,
        tap: false,
      };
    } else {
      gesture.current = {
        kind: 'pan',
        start: { ...pts[0] },
        rawX: unrubberAxis(L, v.S, 'x', v.tx),
        rawY: unrubberAxis(L, v.S, 'y', v.ty),
        S: v.S,
        tap: prevTap,
      };
    }
  };

  const onPointerDown = (e) => {
    if (!layout || (e.pointerType === 'mouse' && e.button !== 0)) return;
    stopAnim();
    if (pointers.current.size === 0) gesture.current = null;
    const pt = localPoint(e);
    pointers.current.set(e.pointerId, pt);
    try { boxRef.current.setPointerCapture(e.pointerId); } catch { /* 무시 */ }
    samples.current = [{ t: performance.now(), x: pt.x, y: pt.y }];
    startGesture();
  };

  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    const pt = localPoint(e);
    pointers.current.set(e.pointerId, pt);
    const g = gesture.current;
    const L = lay.current;
    if (!g || !L) return;
    const pts = [...pointers.current.values()];
    if (g.kind === 'pinch' && pts.length >= 2) {
      const [a, b] = pts;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      g.mid = mid;
      const S = rubberScale(L, g.rawS0 * (Math.hypot(a.x - b.x, a.y - b.y) / g.dist0));
      view.current = {
        S,
        tx: rubberAxis(L, S, 'x', mid.x - g.wx * S),
        ty: rubberAxis(L, S, 'y', mid.y - g.wy * S),
      };
      schedule();
    } else if (g.kind === 'pan' && pts.length === 1) {
      const dx = pts[0].x - g.start.x;
      const dy = pts[0].y - g.start.y;
      if (Math.hypot(dx, dy) > TAP_SLOP) g.tap = false;
      view.current = {
        S: g.S,
        tx: rubberAxis(L, g.S, 'x', g.rawX + dx),
        ty: rubberAxis(L, g.S, 'y', g.rawY + dy),
      };
      const now = performance.now();
      samples.current.push({ t: now, x: pt.x, y: pt.y });
      while (samples.current.length > 2 && now - samples.current[0].t > 100) samples.current.shift();
      schedule();
    }
  };

  const endPointer = (e, cancelled) => {
    if (!pointers.current.has(e.pointerId)) return;
    const g = gesture.current;
    const last = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      gesture.current = null;
      if (!cancelled && g?.kind === 'pan' && g.tap) {
        const hit = hitTest(last.x, last.y);
        if (hit) onSelect(hit.book.id);
      }
      // 관성 — 마지막 ~100ms 이동 속도(경계 밖이면 스프링이 받아 준다)
      let vx = 0; let vy = 0;
      if (g?.kind === 'pan' && !g.tap) {
        const s = samples.current;
        const first = s[0];
        const end = s[s.length - 1];
        const dt = (end.t - first.t) / 1000;
        if (s.length >= 2 && dt > 0.008 && performance.now() - end.t < 80) {
          vx = clamp((end.x - first.x) / dt, -4000, 4000);
          vy = clamp((end.y - first.y) / dt, -4000, 4000);
        }
      }
      startAnim(vx, vy, g?.kind === 'pinch' ? g.mid : last);
      return;
    }
    // 핀치에서 한 손가락만 남으면 이어서 이동(탭은 아님)
    startGesture();
    if (gesture.current) gesture.current.tap = false;
    samples.current = [];
  };

  // 데스크톱 트랙패드 핀치(ctrl+wheel) · 일반 휠은 이동
  useEffect(() => {
    const el = boxRef.current;
    if (!el || !layout) return undefined;
    const onWheel = (e) => {
      const L = lay.current;
      if (!L) return;
      e.preventDefault();
      stopAnim();
      const v = view.current;
      if (e.ctrlKey) {
        const rect = el.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const S = clamp(v.S * Math.exp(-e.deltaY / 100), L.minS, L.maxS);
        view.current = hardClamp(L, { S, tx: px - ((px - v.tx) / v.S) * S, ty: py - ((py - v.ty) / v.S) * S });
      } else {
        view.current = hardClamp(L, { S: v.S, tx: v.tx - e.deltaX, ty: v.ty - e.deltaY });
      }
      schedule();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [layout, schedule]);

  // 단어장이 하나면 지도 대신 크게 한 장 + 팻말 — 헤드라인 아래 ~ CTA 위 칸
  if (single) {
    const byWidth = box.w;
    const byHeight = box.h / VIEW_RATIO;
    const tileW = Math.max(0, Math.floor(Math.min(byWidth, byHeight)));
    return (
      <div
        ref={boxRef}
        className="
          absolute z-[5] left-[12px] right-[12px]
          top-[max(160px,calc(var(--status-bar-height)+116px))] bottom-[46px]
          flex items-center justify-center
        "
      >
        {tileW > 0 && <FieldTile row={rows[0]} width={tileW} single onSelect={onSelect} />}
      </div>
    );
  }

  const budget = layout ? spriteBudget(layout.tileW) : null;
  const small = layout ? layout.tileW < 200 : true;
  const R = layout?.R ?? 1;

  return (
    /* 히어로 전체를 채우는 배경 지도 — 헤드라인·칩·CTA 는 FarmHero 의 children 으로 이 위 층에 뜬다 */
    <div
      ref={boxRef}
      data-no-ptr
      role="group"
      className="absolute inset-0 z-[5] overflow-hidden select-none touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endPointer(e, false)}
      onPointerCancel={(e) => endPointer(e, true)}
      onLostPointerCapture={(e) => endPointer(e, true)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {layout && (
        <div ref={layerRef} className="absolute left-0 top-0 w-0 h-0 origin-top-left will-change-transform">
          {placed.map((p) => (
            <MapField
              key={p.row.book.id}
              row={p.row}
              tileW={layout.tileW}
              budget={budget}
              left={(p.cx - DIA_CX - layout.x0) * R}
              top={(p.cy - DIA_CY - layout.y0) * R}
            />
          ))}
          {/* 이름판·배지 — 밭 그림보다 위 한 층(뒤 밭 작물에 가리지 않게), 마름모 위 꼭짓점에 단다 */}
          {placed.map((p) => (
            <div
              key={`label-${p.row.book.id}`}
              aria-label={p.row.book.title}
              className="absolute z-[16] flex items-center gap-[3px] pointer-events-none -translate-x-1/2 -translate-y-1/2"
              style={{
                left: (p.cx - layout.x0) * R,
                top: (p.cy - DIA_H / 2 - layout.y0) * R,
                maxWidth: DIA_W * 0.6 * R,
              }}
            >
              <span className="flex min-w-0"><NameBoard title={p.row.book.title} small={small} /></span>
              <BookBadge badge={p.row.badge} small={small} />
            </div>
          ))}
        </div>
      )}
      {/* 가독성 페이드 — 위는 하늘 토큰(헤드라인 뒤), 아래는 화면 배경 토큰(본문과 이음). 포인터는 통과 */}
      <div
        aria-hidden
        className="
          absolute inset-x-0 top-0 z-[20] pointer-events-none
          h-[max(150px,calc(var(--status-bar-height)+108px))]
          bg-[linear-gradient(180deg,var(--farm-sky-100)_0%,var(--farm-sky-100)_40%,transparent_100%)]
          opacity-[.88]
        "
      />
      <div
        aria-hidden
        className="
          absolute inset-x-0 bottom-0 z-[20] pointer-events-none h-[40px]
          bg-[linear-gradient(180deg,transparent_0%,var(--farm-canvas)_100%)]
        "
      />
    </div>
  );
};

export default HomeFieldGrid;
