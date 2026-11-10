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
//   배율 범위: 최소 = 전체 맞춤, 최대 = 전체 맞춤의 4.5배(기본 배율이 더 크면 그 2배).
//   기본 시점 = 2×2 맞춤 배율의 1.5배로 가운데 칸 밭(돌봄 밭 우선, 없으면 첫 단어장) 하나가
//   온전히 보이고 주변 밭이 걸쳐 보이는 정도. 단어장이 1~2개면 전부 보이게 맞춘다.
//   홈에 들어올 때·다른 화면에서 돌아올 때·당겨서 새로고침 때 항상 기본 시점으로(짧은 애니메이션).
//   경계 밖으로 끌면 고무줄처럼 저항을 받으며 따라오고, 배율도 범위 밖으로 살짝 넘어간다.
//   손을 떼면 rAF 물리 루프가 관성(플링)으로 미끄러지다 경계 밖이면 스프링으로 되돌린다.
//   이동 거리가 작은 한 손가락 터치만 탭(이슈 #25 13차):
//     · 이름판(간판) → 단어장 상세. 판정은 그려진 판의 실제 사각형 + 여유(기본 시점의 작은 판도 누르기 쉽게).
//     · 작물 → 그 작물 위에 단어·짧은 뜻 말풍선(학습 결과 '밭 성장'과 같은 떠올랐다 사라지는 꼬리표) + tap cue.
//       작물 자리는 FarmField 와 같은 인자로 plantFieldByWords 를 다시 계산해 얻고, 히트 하한은 화면 px 를
//       현재 배율로 나눠 확대·축소에 맞춘다.
//     · 그 밖(흙·길·허공) = 빈 곳 → 두 번 탭이면 기본 시점.
//   확대 상태는 시트를 열고 닫아도 유지된다(경로가 바뀔 때·당겨서 새로고침 때만 기본 시점).
//   당겨서 새로고침은 data-no-ptr 로 끈다.
//
// 【성능·선명도】 움직이는 동안엔 transform 한 레이어만 rAF 로 바꾸고(리렌더 없음, will-change),
//   멈추면 잠시 뒤 현재 배율로 다시 그려 will-change 를 푼다 — 확대해도 흐려지지 않는다.
//   쉬는 화면의 이동값은 기기 픽셀(devicePixelRatio) 격자에 맞춰 반 픽셀 번짐을 없앤다.
//   브라우저는 화면에 보이는 타일만 현재 배율 × 픽셀비로 래스터화하므로 따로 타일링하지 않는다.
//   한계: 밭 바탕(field-base.png)은 1200px 원본뿐이라 기본 시점의 약 1.4배를 넘으면(픽셀비 3 기준)
//   흙·풀 바탕은 원본 해상도가 상한이다. 작물(512px)·글자는 최대 배율까지 선명하다.
//   작물 표시 상한·이름판 크기는 기본 시점 타일 크기에 고정한다.
//
// 【상태 요약】 밭이 하나뿐이면 지도 대신 크게 한 장 + 나무 팻말 4개(단계별 수).
//   여럿이면 밭마다 나무 이름판(단어장 이름) + 단어장 목록 카드와 같은 배지(돌봄 N · 완료).

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check } from '@phosphor-icons/react';
import FarmField, { bookRimColor } from '../farm/FarmField';
import { FieldSign } from '../farm/FarmHero';
import {
  SIGN_ANCHORS, FIELD_W as FIELD_CANVAS_W, FIELD_H as FIELD_CANVAS_H, plantFieldByWords,
} from '../../utils/farmField';
import { IconCare } from '../../assets/svg/icon';
import { feel } from '../../lib/feel';
import { anim, WORD_LABEL_FRAMES, WORD_LABEL_CLASS } from '../takeTest/rewards/fx';

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
const PATH = 120; // 밭 사이 길 폭(캔버스 px, 격자 축 방향 근사) — 밭 폭(1024)의 약 12%
const STEP_X = DIA_W / 2 + PATH;
const STEP_Y = (DIA_W / 2 + PATH) * (DIA_H / DIA_W);
/* 밭 하나가 그림으로 차지하는 범위(마름모 중심 기준) — 위는 가장 큰 작물·이름판, 아래는 섬 옆면 */
const EXT_LEFT = DIA_W / 2 + 8;
const EXT_TOP = DIA_CY - VIEW_TOP;
const EXT_BOTTOM = 805 - DIA_CY + 6;

const MAX_ZOOM = 4.5;   // 전체 맞춤 대비 최대 배율
const MIN_ZOOM = 0.85;  // 전체 맞춤 대비 최소 배율 — 밭 전체가 보이는 창에 들어오는 배율보다 살짝만 작게(이슈 #25 11차)
const START_FIELDS = 4; // 기준 배율: 밭 4개(2×2)가 창에 맞게 들어오는 크기
const HOME_ZOOM = 1.5;  // 기본 시점 = 기준 배율 × 1.5 — 밭 하나가 온전히, 주변 밭은 걸쳐 보인다
const FIT_ALL_MAX = 2;  // 단어장이 이 수 이하면 기본 시점 = 전체 맞춤
const PLANT_REACH = 0.87; // 지도 밭의 작물 배치 영역 — 흙 마름모 가장자리 살짝 안쪽까지
const RESET_MS = 380;   // 기본 시점으로 돌아가는 애니메이션 길이
const COMMIT_DELAY = 140; // 멈춘 뒤 현재 배율로 다시 그리기까지(연속 제스처 사이엔 다시 그리지 않게)
const TAP_SLOP = 8;
const DOUBLE_TAP_MS = 320; // 빈 땅 두 번 탭 → 기본 시점(두 탭 사이 최대 간격)
const DOUBLE_TAP_DIST = 32; // 두 탭이 이만큼 안쪽이어야 같은 자리를 두 번 누른 것으로 본다
const BUBBLE_MS = 1700;     // 작물 탭 → 단어 말풍선이 떠올랐다 사라지는 시간(학습 결과와 같은 프레임)
const BUBBLE_MAX = 3;       // 동시에 떠 있는 말풍선 수
const CROP_HIT_MIN = 20;    // 작물 히트 영역 반폭 하한(화면 px) — 축소해도 손가락으로 집을 수 있게
const SIGN_HIT_PAD = 10;    // 이름판 히트 영역 여유(화면 px)
const SIGN_HIT_MIN_H = 40;  // 이름판 히트 영역 최소 높이(화면 px) — 기본 시점의 작은 판도 누르기 쉽게

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

/*
  【작물 탭】 밭에 서 있는 작물마다 단어가 하나씩 매여 있다(plantFieldByWords — 단어 id 로 슬롯이 정해진다).
  FarmField 와 **같은 인자**로 다시 계산해 그려진 자리를 그대로 얻는다(결정적이라 어긋나지 않는다).
  반환 좌표는 밭 캔버스(1200×860) px — 밑동(bx, by)과 그림 상자 한 변(box).
  words 가 비면 FarmField 가 집계 기반으로 그려 단어가 없으므로 빈 배열.
*/
const cropSpots = (fieldWords, opts) => {
  if (!fieldWords || fieldWords.length === 0) return [];
  const { items } = plantFieldByWords(fieldWords, { mascot: false, ...opts });
  return items
    .filter((it) => it.kind === 'crop' && String(it.key).startsWith('w-'))
    .map((it) => ({
      id: String(it.key).slice(2),
      bx: (it.leftPct / 100) * FIELD_CANVAS_W,
      by: (it.topPct / 100) * FIELD_CANVAS_H,
      box: (it.boxPct / 100) * FIELD_CANVAS_W,
    }));
};

/**
 * 작물 히트 — 그림 상자(512 정사각형) 안 실제 작물이 차지하는 부분(밑동 위 가운데)만 잡는다.
 * minHalf(캔버스 px)는 화면 px 하한을 배율로 나눈 값이라 확대·축소에 맞게 정확하다.
 * 겹치면 정규화 거리가 가장 가까운 것, 같으면 앞(아래)에 선 것.
 * @returns {{ spot, d } | null}
 */
const pickCrop = (spots, x, y, minHalf) => {
  let best = null;
  spots.forEach((sp) => {
    const cx = sp.bx;
    const cy = sp.by - sp.box * 0.34;
    const hx = Math.max(sp.box * 0.32, minHalf);
    const hy = Math.max(sp.box * 0.44, minHalf * 1.15);
    const d = Math.max(Math.abs(x - cx) / hx, Math.abs(y - cy) / hy);
    if (d > 1) return;
    if (!best || d < best.d - 0.05 || (Math.abs(d - best.d) <= 0.05 && sp.by > best.spot.by)) best = { spot: sp, d };
  });
  return best;
};

/** 단어장 단어 목록에서 작물 id 로 단어·짧은 뜻을 찾는다 */
const cropWordText = (book, id) => {
  const w = (book?.words || []).find((x) => String(x?.vocaIndexId ?? x?.id) === id);
  if (!w) return null;
  const first = Array.isArray(w.meanings) ? w.meanings.find(Boolean) : null;
  let meaning = typeof first === 'string' ? first : (first?.meaning || first?.text || '');
  meaning = String(meaning).split(/[,;]/)[0].trim();
  if (meaning.length > 12) meaning = `${meaning.slice(0, 11)}…`;
  return { word: w.origin || '', meaning };
};

/**
 * 작물 위에 떠올랐다 사라지는 단어 말풍선 — 학습 결과 '밭 성장'(FarmGrowthSlide)과 같은 모양·프레임.
 * (x, y) = 작물 머리 위 점(부모 좌표계 px). 말풍선 아래 끝이 그 점에 닿는다.
 */
const CropWordBubble = ({ x, y, word, meaning }) => {
  const ref = useRef(null);
  useEffect(() => {
    anim(ref.current, WORD_LABEL_FRAMES, { duration: BUBBLE_MS, easing: 'ease-out' });
  }, []);
  return (
    <div className="absolute z-[30] w-0 h-0 pointer-events-none" style={{ left: x, top: y }}>
      <span ref={ref} className={`${WORD_LABEL_CLASS} bottom-0 flex items-center gap-[5px]`}>
        <span>{word}</span>
        {meaning && <span className="font-[500] opacity-75">{meaning}</span>}
      </span>
    </div>
  );
};

/** 말풍선 목록 상태 — 띄우고 BUBBLE_MS 뒤 지운다(최대 BUBBLE_MAX 개) */
const useCropBubbles = () => {
  const [bubbles, setBubbles] = useState([]);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const show = useCallback((b) => {
    const key = `${b.id}-${Date.now()}`;
    setBubbles((prev) => [...prev.filter((x) => x.id !== b.id), { ...b, key }].slice(-BUBBLE_MAX));
    feel('tap');
    timers.current.push(setTimeout(() => {
      setBubbles((prev) => prev.filter((x) => x.key !== key));
    }, BUBBLE_MS + 60));
  }, []);
  return [bubbles, show];
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
  const [bubbles, showBubble] = useCropBubbles();

  // 단어장 상세는 이름판(간판)을 눌렀을 때만 연다 — 밭 흙·작물 탭은 작물 말풍선(이슈 #25 13차)
  const spots = useMemo(
    () => cropSpots(fieldWords, { maxSprites, reserveSigns: single }),
    [fieldWords, maxSprites, single],
  );
  const k = width / FIELD_CANVAS_W; // 캔버스 px → 화면 px
  const onTileTap = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / k;
    const y = (e.clientY - rect.top) / k + VIEW_TOP;
    const hit = pickCrop(spots, x, y, CROP_HIT_MIN / k);
    if (!hit) return;
    const text = cropWordText(book, hit.spot.id);
    if (!text) return;
    showBubble({ id: hit.spot.id, ...text, x: hit.spot.bx * k, y: (hit.spot.by - hit.spot.box * 0.7 - VIEW_TOP) * k });
  };

  return (
    <div
      onClick={onTileTap}
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

      {bubbles.map((b) => <CropWordBubble key={b.key} x={b.x} y={b.y} word={b.word} meaning={b.meaning} />)}

      {/* 섬 위 허공(왼쪽 위 · 오른쪽 위)에 이름판과 배지를 단다 — 밭과 작물을 가리지 않는 자리.
          이름판이 단어장 상세로 가는 유일한 입구다(눌리는 영역은 판보다 넉넉하게) */}
      <motion.button
        type="button"
        onClick={(e) => { e.stopPropagation(); onSelect(book.id); }}
        whileTap={{ scale: 0.94 }}
        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        aria-label={`${book.title} 단어장 열기`}
        className="absolute left-[1%] top-[1%] z-[16] flex max-w-[60%] min-h-[40px] items-start p-[2%]"
      >
        <NameBoard title={book.title} small={small} />
      </motion.button>
      <span className="absolute right-[3%] top-[3%] z-[16] flex pointer-events-none">
        <BookBadge badge={badge} small={small} />
      </span>
    </div>
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
        plantReach={PLANT_REACH}
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
/*
  축소 쪽 고무줄은 **끝이 있어야** 한다(이슈 #25 11차 — 지수 저항만으론 계속 오므리면 0 까지 작아졌다).
  넘어선 정도를 로그 비율로 재고 rubber() 로 감쇠해, 아무리 오므려도 minS 의 e^-SCALE_SHRINK_MAX 배까지만 간다.
*/
const SCALE_SHRINK_MAX = 0.22;

const readStatusBar = (el) => {
  try {
    return parseFloat(getComputedStyle(el).getPropertyValue('--status-bar-height')) || 0;
  } catch { return 0; }
};

/**
 * @param {Array}    rows      buildBookRow 결과(글자 단어장 제외) — 1개 이상
 * @param {function} onSelect  (bookId) => void
 * @param {number}   resetSignal 값이 바뀌면 기본 시점으로 되돌린다(당겨서 새로고침)
 * @param {number}   focusBottom (선택) '보이는 창' 아래 끝(지도 상자 위쪽 기준 px) — 지도가 히어로보다
 *                   큰 화면 전체 배경일 때 홈이 CTA 위 높이를 넘긴다. 없으면 상자 아래 − 46px.
 *                   기본 시점·배율·이동 경계 모두 이 창으로 잡는다(이슈 #25 10차 — 아래로 끌어 놓으면
 *                   좌·우·위와 똑같이 고무줄로 돌아온다. 끄는 동안엔 카드 뒤까지 밀려 보인다).
 */
const HomeFieldGrid = ({ rows, onSelect, resetSignal = 0, focusBottom }) => {
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
        // first = 가운데 칸(돌봄 밭이 있으면 그중 첫째, 없으면 첫 단어장) — 기본 시점의 중심
        return { row, cx: (col - rr) * STEP_X, cy: (col + rr) * STEP_Y, depth: col + rr, first: i === 0 };
      })
      .sort((a, b) => a.depth - b.depth || a.cx - b.cx);
  }, [rows, single]);

  /*
    배치(캔버스 px) + 배율 범위(화면 px / 캔버스 px).
    focus = 헤드라인 아래 ~ CTA 위 창. fitS = 전체 맞춤, minS = 축소 한계(fitS × MIN_ZOOM), homeS = 기본 시점 배율.
  */
  const layout = useMemo(() => {
    if (single || placed.length === 0 || box.w <= 0 || box.h <= 0) return null;
    let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
    placed.forEach(({ cx, cy }) => {
      x0 = Math.min(x0, cx - EXT_LEFT); x1 = Math.max(x1, cx + EXT_LEFT);
      y0 = Math.min(y0, cy - EXT_TOP); y1 = Math.max(y1, cy + EXT_BOTTOM);
    });
    const fTop = Math.min(box.h * 0.5, Math.max(158, box.sb + 114));
    const fBottom = Number.isFinite(focusBottom) ? Math.min(focusBottom, box.h - 46) : box.h - 46;
    const focus = { x0: 12, x1: box.w - 12, y0: fTop, y1: Math.max(fTop + 40, fBottom) };
    // 이동 창 = 보이는 창(헤드라인 아래 ~ CTA 위). 9차에는 아래 끝을 상자 끝(화면 하단)까지 넓혀 뒀는데,
    // 그러면 밭을 아래로 끌어 둔 위치가 경계 '안'이라 손을 떼도 돌아오지 않았다(10차 신고).
    // 이제 네 방향 모두 같은 경계다 — 끄는 동안은 고무줄로 경계 밖(카드 뒤)까지 밀리고, 놓으면 스프링 복귀.
    const pan = { x0: focus.x0, x1: focus.x1, y0: focus.y0, y1: focus.y1 };
    const fw = focus.x1 - focus.x0;
    const fh = focus.y1 - focus.y0;
    // fitS = 배치된 밭 전체가 보이는 창에 딱 들어오는 배율. 축소 한계 minS 는 그보다 살짝 작게.
    const fitS = Math.min(fw / (x1 - x0), fh / (y1 - y0));
    const minS = fitS * MIN_ZOOM;
    // 2×2 묶음의 범위: 가로 (col−row) −1..1, 세로 (col+row) 0..2
    const w4 = 2 * STEP_X + 2 * EXT_LEFT;
    const h4 = 2 * STEP_Y + EXT_TOP + EXT_BOTTOM;
    const fitAll = placed.length <= FIT_ALL_MAX;
    const baseS = placed.length <= START_FIELDS ? fitS : Math.max(fitS, Math.min(fw / w4, fh / h4));
    // 기본 시점 배율 — 1~2개면 전체 맞춤, 그 밖엔 2×2 맞춤의 1.5배(밭 1개가 온전히 + 주변이 걸침)
    const homeS = fitAll ? fitS : Math.max(fitS, baseS * HOME_ZOOM);
    const maxS = Math.max(fitS * MAX_ZOOM, homeS * 2);
    // 기본 시점 중심 — 가운데 칸 밭(돌봄 밭 우선) 한 장의 그림 범위 가운데, 1~2개면 전체 가운데
    const first = placed.find((p) => p.first) || placed[0];
    const center = fitAll
      ? { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }
      : { x: first.cx, y: first.cy + (EXT_BOTTOM - EXT_TOP) / 2 };
    return {
      x0, x1, y0, y1, focus, pan, minS, maxS, homeS, center,
      // 작물 수·이름판 크기는 기본 시점 기준으로 고정한다(다시 그려도 작물이 바뀌지 않게)
      homeTileW: FIELD_CANVAS_W * homeS,
    };
  }, [placed, single, box.w, box.h, box.sb, focusBottom]);

  /* ── 보기 상태 { S: 배율, tx·ty: 캔버스 x0·y0 이 놓이는 화면 좌표 } — 리렌더 없이 transform 만 ── */
  const view = useRef({ S: 1, tx: 0, ty: 0 });
  const lay = useRef(null);
  lay.current = layout;
  const raf = useRef(0);

  /*
    【선명도】 밭은 '그리는 배율' R 로 DOM 크기를 잡아 그린다. 움직이는 동안엔 transform
    scale(S/R) 한 레이어만 바꾸고(will-change 켬 — 합성만, 리렌더 없음), 멈추면 잠시 뒤
    R = S 로 다시 그리고 will-change 를 끈다. 그러면 쉬는 화면은 늘 scale(1) 이라 브라우저가
    현재 배율·기기 픽셀비로 다시 래스터화한다 — 확대해도 원본(밭 1200px · 작물 512px) 해상도만큼
    선명하다. 다시 그릴 때 바뀌는 건 상자 크기뿐이라(작물 배치는 % · 표시 수는 고정) 가볍다.
  */
  const [renderR, setRenderR] = useState(0);
  const rRef = useRef(0);
  const moving = useRef(false);
  const commitTimer = useRef(0);

  const apply = useCallback(() => {
    raf.current = 0;
    const L = lay.current;
    const el = layerRef.current;
    if (!L || !el || !rRef.current) return;
    const { S, tx, ty } = view.current;
    const k = S / rRef.current;
    el.style.willChange = moving.current ? 'transform' : 'auto';
    if (moving.current || Math.abs(k - 1) > 1e-4) {
      el.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${k})`;
    } else {
      // 쉬는 화면은 기기 픽셀 격자에 맞춘다 — 소수 px 이동이면 래스터가 반 픽셀 어긋나 흐려 보인다
      const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      el.style.transform = `translate(${Math.round(tx * dpr) / dpr}px, ${Math.round(ty * dpr) / dpr}px)`;
    }
  }, []);

  /** 움직임 시작 — 다시 그리기 예약을 취소하고 합성 레이어로 */
  const beginMove = () => {
    if (commitTimer.current) { clearTimeout(commitTimer.current); commitTimer.current = 0; }
    moving.current = true;
  };

  /** 멈춤 — 잠시 뒤 현재 배율로 다시 그리고(R = S) 레이어 승격을 푼다 */
  const endMove = () => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => {
      commitTimer.current = 0;
      moving.current = false;
      const S = Math.round(view.current.S * 10000) / 10000;
      if (Math.abs(S - rRef.current) < 1e-4) apply();
      else setRenderR(S);
    }, COMMIT_DELAY);
  };

  // R 이 바뀐 커밋 직후, 칠하기 전에 transform 을 새 R 에 맞춘다(한 프레임도 크기가 튀지 않게)
  useLayoutEffect(() => {
    if (!renderR) return;
    rRef.current = renderR;
    if (raf.current) { cancelAnimationFrame(raf.current); raf.current = 0; }
    apply();
  }, [renderR, apply]);

  const schedule = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(apply);
  }, [apply]);

  /**
   * 축 하나의 이동 경계(이동 창 L.pan 기준) — 밭 묶음이 창보다 크면 끝 밭이 창 가장자리까지,
   * 작으면 창 안에서 자유롭게(가장자리에 닿을 때까지). 이동 창이 보이는 창을 품으므로
   * 기본 시점(보이는 창 가운데)은 항상 경계 안이다.
   */
  const boundsFor = (L, S, axis) => {
    const [lo, hi, f0, f1] = axis === 'x'
      ? [L.x0, L.x1, L.pan.x0, L.pan.x1]
      : [L.y0, L.y1, L.pan.y0, L.pan.y1];
    const span = (hi - lo) * S;
    if (span <= f1 - f0) return [f0, f1 - span];
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
    if (raw < L.minS) {
      const over = Math.log(L.minS / Math.max(raw, 1e-6));
      return L.minS * Math.exp(-rubber(over, SCALE_SHRINK_MAX));
    }
    if (raw > L.maxS) return L.maxS * (raw / L.maxS) ** SCALE_RESIST;
    return raw;
  };
  const unrubberScale = (L, S) => {
    if (S < L.minS) {
      const shown = Math.log(L.minS / S);
      return L.minS * Math.exp(-unrubber(shown, SCALE_SHRINK_MAX));
    }
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
      endMove();
    } else {
      a.id = requestAnimationFrame(step);
    }
    apply();
  };

  const startAnim = (vx, vy, focal) => {
    stopAnim();
    beginMove();
    anim.current = { id: 0, vx, vy, focal, last: 0 };
    anim.current.id = requestAnimationFrame(step);
  };

  useEffect(() => () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    if (commitTimer.current) clearTimeout(commitTimer.current);
    stopAnim();
  }, []);

  /** 기본 시점(배율 homeS · 가운데 칸 밭 중심) */
  const homeView = (L) => {
    const fx = (L.focus.x0 + L.focus.x1) / 2;
    const fy = (L.focus.y0 + L.focus.y1) / 2;
    return hardClamp(L, { S: L.homeS, tx: fx - (L.center.x - L.x0) * L.homeS, ty: fy - (L.center.y - L.y0) * L.homeS });
  };

  /** 기본 시점으로 — 짧은 ease-out 애니메이션(현재 → 목표 보간) */
  const resetView = (animated) => {
    const L = lay.current;
    if (!L) return;
    stopAnim();
    const to = homeView(L);
    const from = { ...view.current };
    const same = Math.abs(from.S - to.S) < 1e-4 && Math.abs(from.tx - to.tx) < 0.5 && Math.abs(from.ty - to.ty) < 0.5;
    if (!animated || same || !rRef.current) {
      view.current = to;
      if (rRef.current) { beginMove(); apply(); endMove(); }
      return;
    }
    beginMove();
    let t0 = 0;
    const tick = (now) => {
      if (!t0) t0 = now;
      const p = Math.min(1, (now - t0) / RESET_MS);
      const e = 1 - (1 - p) ** 3;
      // 배율은 로그 공간에서 보간해야 확대·축소 속도가 고르게 보인다
      const S = from.S * (to.S / from.S) ** e;
      // 창 가운데에 보이는 지도 지점을 보간 → 그 지점이 가운데 오도록 이동값 계산
      const fx = (L.focus.x0 + L.focus.x1) / 2;
      const fy = (L.focus.y0 + L.focus.y1) / 2;
      const wx0 = (fx - from.tx) / from.S; const wx1 = (fx - to.tx) / to.S;
      const wy0 = (fy - from.ty) / from.S; const wy1 = (fy - to.ty) / to.S;
      view.current = { S, tx: fx - (wx0 + (wx1 - wx0) * e) * S, ty: fy - (wy0 + (wy1 - wy0) * e) * S };
      apply();
      if (p < 1) anim.current.id = requestAnimationFrame(tick);
      else { anim.current.id = 0; view.current = to; apply(); endMove(); }
    };
    anim.current = { id: requestAnimationFrame(tick), vx: 0, vy: 0, focal: null, last: 0 };
  };

  // 처음(또는 밭 수·영역 크기가 바뀌면) 기본 시점으로 — 애니메이션 없이, 기본 배율로 그린다
  const sig = layout ? `${placed.length}|${box.w}|${box.h}|${box.sb}` : '';
  const lastSig = useRef('');
  useEffect(() => {
    if (!layout) return;
    stopAnim();
    if (lastSig.current !== sig) {
      lastSig.current = sig;
      view.current = homeView(layout);
      if (commitTimer.current) { clearTimeout(commitTimer.current); commitTimer.current = 0; }
      moving.current = false;
      if (Math.abs(rRef.current - layout.homeS) < 1e-4) schedule();
      else setRenderR(layout.homeS); // 레이아웃 이펙트가 새 R 로 transform 을 맞춘다
    } else {
      view.current = hardClamp(layout, view.current);
      schedule();
    }
  }, [layout, sig, schedule]);

  // 다른 탭·화면에 갔다가 홈으로 돌아오면 기본 시점으로(탭은 마운트된 채 숨겨질 뿐이라 직접 감지)
  const { pathname } = useLocation();
  const prevPath = useRef(pathname);
  useEffect(() => {
    const was = prevPath.current;
    prevPath.current = pathname;
    if (pathname === '/home' && was !== '/home') resetView(true);
  }, [pathname]);

  // 당겨서 새로고침 → 기본 시점으로
  const prevReset = useRef(resetSignal);
  useEffect(() => {
    if (prevReset.current === resetSignal) return;
    prevReset.current = resetSignal;
    resetView(true);
  }, [resetSignal]);

  /* ── 포인터 ── */
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const samples = useRef([]);
  const lastEmptyTap = useRef(null); // 직전 빈 땅 탭 { t, x, y } — 두 번 탭 판정용
  const [bubbles, showBubble] = useCropBubbles();

  // 밭마다 작물 자리(밭 캔버스 px) — MapField 의 FarmField 와 같은 인자(표시 상한 고정·팻말 자리 없음·PLANT_REACH)
  const mapBudgetSprites = layout ? spriteBudget(layout.homeTileW).maxSprites : 0;
  const cropMap = useMemo(
    () => (mapBudgetSprites
      ? placed.map((p) => ({ p, spots: cropSpots(p.row.fieldWords, { maxSprites: mapBudgetSprites, reserveSigns: false, reach: PLANT_REACH }) }))
      : []),
    [placed, mapBudgetSprites],
  );

  /* 이름판(간판) DOM — 탭 판정은 실제 그려진 사각형으로 한다(배율·이동·labelK 가 모두 반영돼 정확하다) */
  const labelRefs = useRef(new Map());

  /** 화면 점(영역 기준) → 그 자리 이름판의 단어장 행 (앞줄 우선) */
  const hitSign = (px, py) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return null;
    for (let i = placed.length - 1; i >= 0; i -= 1) {
      const el = labelRefs.current.get(placed[i].row.book.id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const cy = r.top - rect.top + r.height / 2;
      const halfH = Math.max(r.height / 2 + SIGN_HIT_PAD, SIGN_HIT_MIN_H / 2);
      if (px >= r.left - rect.left - SIGN_HIT_PAD && px <= r.right - rect.left + SIGN_HIT_PAD
        && Math.abs(py - cy) <= halfH) return placed[i].row;
    }
    return null;
  };

  /** 화면 점(영역 기준) → 그 자리 작물 { row, spot, wx, wy(머리 위, 지도 캔버스 px) } */
  const hitCrop = (px, py) => {
    const L = lay.current;
    if (!L) return null;
    const { S, tx, ty } = view.current;
    const wx = (px - tx) / S + L.x0;
    const wy = (py - ty) / S + L.y0;
    let best = null;
    cropMap.forEach(({ p, spots }) => {
      const ox = p.cx - DIA_CX;
      const oy = p.cy - DIA_CY;
      const hit = pickCrop(spots, wx - ox, wy - oy, CROP_HIT_MIN / S);
      if (hit && (!best || hit.d < best.d - 0.05 || (Math.abs(hit.d - best.d) <= 0.05 && hit.spot.by + oy > best.by))) {
        best = { d: hit.d, by: hit.spot.by + oy, row: p.row, spot: hit.spot, wx: hit.spot.bx + ox, wy: hit.spot.by - hit.spot.box * 0.7 + oy };
      }
    });
    return best;
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
    beginMove();
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
        // 간판(이름판) → 단어장 상세 · 작물 → 단어 말풍선 · 그 밖(흙·길·허공) → 빈 곳(두 번 탭 리셋)
        const sign = hitSign(last.x, last.y);
        const crop = sign ? null : hitCrop(last.x, last.y);
        const text = crop ? cropWordText(crop.row.book, crop.spot.id) : null;
        if (sign) {
          lastEmptyTap.current = null;
          onSelect(sign.book.id);
        } else if (text) {
          lastEmptyTap.current = null;
          showBubble({ id: `${crop.row.book.id}:${crop.spot.id}`, ...text, wx: crop.wx, wy: crop.wy });
        } else {
          // 간판·작물이 아닌 빈 곳을 두 번 탭(마우스는 더블 클릭) → 기본 시점으로 부드럽게.
          // 간판·작물 탭·이동·핀치는 여기 오지 않는다.
          const now = performance.now();
          const prev = lastEmptyTap.current;
          if (prev && now - prev.t <= DOUBLE_TAP_MS && Math.hypot(last.x - prev.x, last.y - prev.y) <= DOUBLE_TAP_DIST) {
            lastEmptyTap.current = null;
            resetView(true);
            return;
          }
          lastEmptyTap.current = { t: now, x: last.x, y: last.y };
        }
      } else {
        lastEmptyTap.current = null;
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
      beginMove();
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
      endMove();
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
        // 화면 전체 배경일 때도 한 장은 헤드라인 아래 ~ CTA 위 칸에 둔다
        style={Number.isFinite(focusBottom) ? { bottom: `calc(100% - ${focusBottom}px)` } : undefined}
      >
        {tileW > 0 && <FieldTile row={rows[0]} width={tileW} single onSelect={onSelect} />}
      </div>
    );
  }

  const budget = layout ? spriteBudget(layout.homeTileW) : null;
  const small = layout ? layout.homeTileW < 200 : true;
  const R = renderR || layout?.homeS || 1;
  // 이름판은 R 과 함께 커지는 좌표계 안에 있으므로 기본 시점 크기 기준으로 되돌려 둔다
  // (다시 그려도 이름판 크기가 튀지 않고, 확대하면 밭과 함께 커진다)
  const labelK = layout ? R / layout.homeS : 1;

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
      {layout && renderR > 0 && (
        <div ref={layerRef} className="absolute left-0 top-0 w-0 h-0 origin-top-left">
          {placed.map((p) => (
            <MapField
              key={p.row.book.id}
              row={p.row}
              tileW={FIELD_CANVAS_W * R}
              budget={budget}
              left={(p.cx - DIA_CX - layout.x0) * R}
              top={(p.cy - DIA_CY - layout.y0) * R}
            />
          ))}
          {/* 이름판·배지 — 밭 그림보다 위 한 층(뒤 밭 작물에 가리지 않게), 마름모 위 꼭짓점에 단다 */}
          {placed.map((p) => (
            <div
              key={`label-${p.row.book.id}`}
              ref={(el) => { if (el) labelRefs.current.set(p.row.book.id, el); else labelRefs.current.delete(p.row.book.id); }}
              aria-label={p.row.book.title}
              className="absolute z-[16] flex items-center gap-[3px] pointer-events-none"
              style={{
                left: (p.cx - layout.x0) * R,
                top: (p.cy - DIA_H / 2 - layout.y0) * R,
                maxWidth: DIA_W * 0.6 * layout.homeS,
                transform: `translate(-50%, -50%) scale(${labelK})`,
              }}
            >
              <span className="flex min-w-0"><NameBoard title={p.row.book.title} small={small} /></span>
              <BookBadge badge={p.row.badge} small={small} />
            </div>
          ))}
          {/* 작물 말풍선 — 지도 좌표에 달려 이동·확대를 따라간다(쉬는 화면에선 화면 px 크기 그대로) */}
          {bubbles.map((b) => (
            <CropWordBubble
              key={b.key}
              x={(b.wx - layout.x0) * R}
              y={(b.wy - layout.y0) * R}
              word={b.word}
              meaning={b.meaning}
            />
          ))}
        </div>
      )}
      {/* 가독성 페이드 — 위만 하늘 토큰(헤드라인 뒤). 아래 페이드는 뺐다(이슈 #25 9차) — 지도가 화면 전체
          배경이라 밭이 CTA 아래·카드 뒤로 내려가도 잘리지 않고 글래스 카드 너머로 비쳐야 한다. 포인터는 통과 */}
      <div
        aria-hidden
        className="
          absolute inset-x-0 top-0 z-[20] pointer-events-none
          h-[max(150px,calc(var(--status-bar-height)+108px))]
          bg-[linear-gradient(180deg,var(--farm-sky-100)_0%,var(--farm-sky-100)_40%,transparent_100%)]
          opacity-[.88]
        "
      />
    </div>
  );
};

export default HomeFieldGrid;
