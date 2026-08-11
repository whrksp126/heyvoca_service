/**
 * 밭에 작물을 심는 계산 — 당근 농장 V2.
 *
 * 예전에는 작물까지 구워 놓은 PNG 를 상태별로 골라 썼다(hero-fresh · book-mid …).
 * 그래서 밭 그림이 사용자의 실제 밭과 달랐다 — 새싹 3개뿐인 사람에게도
 * 새싹 12개가 그려진 그림이 나갔고, 골라 쓸 수 있는 조합은 다섯 장뿐이었다.
 *
 * 지금은 **밭 바탕(field-base.png)만 굽고 작물은 화면이 얹는다.** 여기서 계산하는 것은
 * "어느 자리에 무엇을 얼마나 심을까" 하나다.
 *
 * 【좌표계】 생성기(scratchpad/field_base.py · docs/ui-concepts/…/hero_v4.py)와 **같은 식**을
 * 쓴다. 결과는 캔버스(1200×860) 대비 백분율이라, 화면에서 밭이 어떤 크기로 그려지든
 * 같은 자리에 붙는다. 다만 **심는 마름모의 크기는 생성기를 믿지 않고 그림에서 잰다** —
 * 아래 SOIL_W/SOIL_H 주석 참고. 시안 생성기(docs/ui-concepts)는 여기와 별개다.
 *
 * 【심는 규칙】
 *   · 한 칸에 한 작물. **작물 하나 = 단어 하나**다. 구역이 다 차면 거기서 멈춘다.
 *   · 성장 단계마다 자기 구역이 있다 — 뒤 씨앗 · 왼 새싹 · 오 이파리 · 앞 당근.
 *     팻말 네 개가 서는 자리와 정확히 맞물린다(시안 §3).
 *   · 단어가 많으면 격자를 잘게 나누고 작물을 그만큼 작게 그린다.
 *   · **심지 않은 씨앗은 심지 않는다.** 한 번도 학습하지 않은 단어는 밭에 없는 단어다.
 *     그 수는 홈의 "아직 심지 않은 씨앗" 카드가 따로 말한다.
 */

import { healthToVariant, stageToCrop } from './crop';

/* ── 생성기와 공유하는 상수 (field_base.py 와 같은 값) ───────────── */
export const FIELD_W = 1200;
export const FIELD_H = 860;

const ISL_W = 1160;
const ISL_H = 520;
const ISL_X0 = 20;    // ISL_CX(600) - ISL_W/2
const ISL_Y0 = 270;   // ISL_CY(530) - ISL_H/2

/*
  심는 마름모 — **field-base.png 의 흙을 직접 재서** 잡는다.

  예전에는 `ISL_W - 96` × `ISL_H - 48`(1064×472)을 썼는데, 그림의 흙은 실제로
  949×425 다. 심는 판이 흙보다 12% 넓었으니 바깥 줄 작물은 흙을 벗어나 초록 테두리에
  올라탔다 — 작물이 딛고 선 흙 자국과 테두리가 겹쳐 지저분해 보이던 원인이다.

  거기에 여백(PLANT_MARGIN)을 더 물린다. 작물은 자기 점보다 좌우로 넓게 그려지므로
  (가장 넓은 그림이 상자의 69%) 심는 점이 흙 경계에 딱 붙으면 그림은 이미 넘어간다.
  0.10 은 가장 큰 당근이 가장 앞줄에 서도 흙 안에 남는 값이다(경계 대비 0.95).
*/
const SOIL_W = 949;
const SOIL_H = 425;
const PLANT_MARGIN = 0.10;
const FW = SOIL_W * (1 - PLANT_MARGIN);
const FH = SOIL_H * (1 - PLANT_MARGIN);

export const FIELD_STAGES = ['seed', 'sprout', 'leaf', 'carrot'];

/**
 * 작물 한 그루가 차지하는 정사각형 — 캔버스(1200×860) 기준 한 변 px.
 *
 * 단계마다 다른 높이를 주지 않는다. 에셋이 512×512 한 규격이고 **단계별 상대 크기가
 * 그림 안에 이미 들어 있다**(V5 건강한 판: 씨앗 32 · 새싹 172 · 이파리 329 · 당근 359).
 * 여기서 또 배율을 곱하면 미술에서 맞춰 놓은 비율이 두 번 적용돼 어긋난다.
 * 215 는 V3 시절 흙 원판(폭 61.7%)이 옆 칸과 닿지 않도록 잡은 값이다. V5 는 원판이
 * 없어져 여유가 더 생겼지만, 값을 키우면 작물 자체가 커져 밭이 빽빽해지므로 그대로 둔다.
 */
const CROP_BOX = 215;

/** 그림의 바닥 기준선 — 이 지점이 심는 자리에 오도록 세운다 (에셋 규격 y=440/512) */
export const CROP_BASELINE = 440 / 512;

// 구역별 팻말 자리 — 뒤 · 왼 · 오 · 앞 (읽는 순서가 곧 성장 순서)
const SIGN_UV = [[0.25, 0.25], [0.25, 0.75], [0.75, 0.25], [0.75, 0.75]];

/** 팻말 판이 땅 지점보다 위에 붙는 높이 — 판이 땅에 박히면 말뚝이 안 보인다 */
const SIGN_LIFT = 130;

/**
 * 팻말이 설 자리 — 캔버스(1200×860) 대비 %.
 *
 * **화면이 아니라 여기서 계산해 내보낸다.** 예전에는 홈 히어로와 단어장 히어로가
 * 각자 숫자를 적어 두고 있었는데, 심는 마름모를 좁히자 작물만 안으로 들어오고
 * 팻말은 옛 자리에 남아 자기 구역 밖을 가리켰다.
 */
export const SIGN_ANCHORS = SIGN_UV.map(([u, v], q) => ({
  crop: FIELD_STAGES[q],
  left: (ISL_X0 + ISL_W / 2 + (u - v) * FW / 2) / FIELD_W * 100,
  top: (ISL_Y0 + ISL_H / 2 + (u + v - 1) * FH / 2 - SIGN_LIFT) / FIELD_H * 100,
}));

const MASCOT_H = 226;
const MASCOT_AR = 0.54;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** 격자 칸이 속한 구역 — 0 뒤(씨앗) · 1 왼(새싹) · 2 오(이파리) · 3 앞(당근) */
const quadrant = (i, j, G) => {
  const h = (G - 1) / 2;
  return i < h ? (j < h ? 0 : 1) : (j < h ? 2 : 3);
};

/**
 * 밭을 아이소메트릭 격자(이랑)로 나눈 자리.
 * 필드 좌표 (u,v) ∈ [0,1]² 를 마름모에 대응시킨다 — (0,0)=뒤 · (1,0)=오른쪽 · (1,1)=앞 · (0,1)=왼쪽.
 * 화면 y 는 (u+v) 에만 비례하므로 i+j 가 같은 칸끼리 같은 줄에 선다.
 */
const cells = (G) => {
  const out = [];
  for (let i = 0; i < G; i += 1) {
    for (let j = 0; j < G; j += 1) {
      const u = (i + 0.5) / G;
      const v = (j + 0.5) / G;
      // 자로 잰 듯하면 딱딱하니 칸마다 **고정된** 미세 흔들림만 준다.
      // 난수를 쓰면 리렌더마다 밭이 들썩인다.
      const jx = (((i * 7 + j * 13) % 5) - 2) * 3.5 * (6 / G);
      const jy = (((i * 11 + j * 5) % 3) - 1) * 3.0 * (6 / G);
      out.push({
        i,
        j,
        x: ISL_W / 2 + (u - v) * FW / 2 + jx,
        y: ISL_H / 2 + (u + v - 1) * FH / 2 + jy,
      });
    }
  }
  return out.sort((a, b) => (a.i + a.j) - (b.i + b.j) || (a.i - a.j) - (b.i - b.j));
};

/**
 * 구역 안에서 n 자리를 고른다 — **불규칙하게, 그러나 겹치지는 않게.**
 *
 * 【처음 방식이 왜 틀렸나】 칸 목록의 index 를 n 등분해 뽑았다. 목록이 (i+j) → (i−j)
 * 순으로 정렬돼 있어서 등간격으로 뽑으면 **i−j 가 같은 칸들**이 걸렸다. i−j 는 곧
 * 화면 x 라, 당근 3개가 같은 세로줄에 쌓여 한 그루처럼 뭉쳐 보였다.
 *
 * 【가장 먼 점부터 집는 방식도 틀렸다】 구역이 마름모라 "가장 먼 칸"은 늘 좌우 꼭짓점이고
 * 그 둘은 깊이가 같다. 작물이 가로로 한 줄을 서 버린다.
 *
 * 【지금 방식】 칸을 **고정 해시로 섞은 뒤**, 이미 고른 자리와 스프라이트가 겹치지 않는
 * 칸만 순서대로 집는다. 섞기 때문에 줄이 서지 않고, 최소 간격 때문에 뭉치지 않는다.
 * 간격을 지키는 칸이 모자라면 남은 칸 중 가장 먼 것부터 채운다(빽빽한 밭).
 * 해시는 i·j 로만 정해져 난수가 아니다 — 리렌더해도 밭이 들썩이지 않는다.
 */
const Y_WEIGHT = 0.62;      // 세로 1px 을 가로 0.62px 로 친다(아이소메트릭 원근)
const MIN_GAP = 108;        // 칸 사이 최소 간격(캔버스 px, 격자 6 기준). 스프라이트 폭의 약 0.75배

const dist2 = (a, b) => {
  const dx = a.x - b.x;
  const dy = (a.y - b.y) * Y_WEIGHT;
  return dx * dx + dy * dy;
};

/** 칸 좌표 → 0~1 의 고정 난수값. 난수 생성기가 아니라 좌표의 해시다. */
const cellHash = (i, j) => {
  const h = Math.imul(i + 1, 73856093) ^ Math.imul(j + 1, 19349663);
  return ((h >>> 0) % 100000) / 100000;
};

const spread = (list, n, gap = MIN_GAP) => {
  const cap = list.length;
  if (n <= 0 || cap === 0) return [];
  if (n >= cap) return list.slice();

  const shuffled = list
    .map((c) => ({ c, k: cellHash(c.i, c.j) }))
    .sort((a, b) => a.k - b.k || (a.c.i - b.c.i) || (a.c.j - b.c.j))
    .map((x) => x.c);

  const minGap2 = gap * gap;
  const picked = [];
  const leftover = [];
  shuffled.forEach((c) => {
    if (picked.length >= n) { leftover.push(c); return; }
    if (picked.every((p) => dist2(c, p) >= minGap2)) picked.push(c);
    else leftover.push(c);
  });

  // 간격을 지키며 n 개를 못 채웠으면 남은 칸에서 가장 먼 것부터 메운다
  while (picked.length < n && leftover.length > 0) {
    let bestIdx = 0;
    let bestGap = -1;
    leftover.forEach((c, i) => {
      let g = Infinity;
      picked.forEach((p) => { g = Math.min(g, dist2(c, p)); });
      if (g > bestGap) { bestGap = g; bestIdx = i; }
    });
    picked.push(leftover.splice(bestIdx, 1)[0]);
  }
  return picked;
};

/**
 * 건강 상태 분포 → 작물 n개에 붙일 그림 variant 배열.
 *
 * 나쁜 쪽부터 채운다. 5개 중 1개가 썩었으면 그 하나가 반드시 보여야 하는데,
 * 비율대로 반올림하면 0개로 사라진다.
 * 섞어 놓는 이유는 한 구역에 몰리면 "군데군데 시들었다"가 아니라 "한쪽이 죽었다"로 읽혀서다.
 */
const variantsFor = (n, mix) => {
  const order = ['rotten', 'wilted', 'drying', 'healthy'];
  const total = order.reduce((a, k) => a + (mix[k] || 0), 0);
  if (!total) return new Array(n).fill('healthy');

  const picked = [];
  let left = n;
  order.forEach((k, idx) => {
    if (left <= 0) return;
    const want = idx === order.length - 1
      ? left
      : clamp(Math.round(n * (mix[k] || 0) / total), (mix[k] || 0) > 0 ? 1 : 0, left);
    for (let t = 0; t < want; t += 1) picked.push(k);
    left -= want;
  });
  while (picked.length < n) picked.push('healthy');

  // 앞에서부터 rotten·wilted 가 뭉쳐 있으므로 큰 걸음으로 다시 흩는다
  const out = new Array(n);
  const step = Math.max(1, Math.round(n / Math.max(1, picked.length / 2)));
  let at = 0;
  for (let t = 0; t < n; t += 1) {
    while (out[at] !== undefined) at = (at + 1) % n;
    out[at] = picked[t];
    at = (at + step) % n;
  }
  return out;
};

/** 마스코트 한 마리 — 밭 뒤쪽 왼편에 서서 물뿌리개를 들고 밭을 바라본다 */
const mascotItem = (G) => {
  const ij = [0, Math.round(G / 3)];
  const cell = cells(G).find((c) => c.i === ij[0] && c.j === ij[1]);
  const y = ISL_Y0 + cell.y;
  return {
    key: 'mascot',
    kind: 'mascot',
    y,
    leftPct: (ISL_X0 + cell.x) / FIELD_W * 100,
    topPct: y / FIELD_H * 100,
    // 마스코트는 옛 에셋이라 바닥이 그림 맨 아래다 — 높이로 잡고 아래를 기준으로 세운다
    heightPct: MASCOT_H / FIELD_H * 100,
    shadowWPct: MASCOT_H * MASCOT_AR * 0.54 / FIELD_W * 100,
  };
};

/**
 * 밭에 심는다.
 *
 * @param {object}  counts       단계별 **심은** 작물 수 { seed, sprout, leaf, carrot }
 * @param {object}  healthMix    건강 분포 { healthy, drying, wilted, rotten } (variant 키)
 * @param {number}  opts.maxSprites 화면에 올릴 작물 수 상한 (썸네일은 작게)
 * @param {boolean} opts.mascot   마스코트를 밭에 세울지 (홈만 true)
 * @param {boolean} opts.reserveSigns 팻말이 설 칸을 비워 둘지
 * @returns {{ items: Array, grid: number, planted: number }}
 *          items 은 뒤에서 앞 순서로 정렬돼 있다 — 그 순서대로 그리면 앞 작물이 뒤를 가린다.
 */
export const plantField = (counts, healthMix = {}, opts = {}) => {
  const { maxSprites = 96, mascot = false, reserveSigns = true } = opts;

  const live = FIELD_STAGES.filter((s) => (counts?.[s] ?? 0) > 0);
  const total = live.reduce((a, s) => a + counts[s], 0);
  // 아무것도 심기지 않은 밭 — 흙만 남는다. 다만 마스코트는 서 있어야 한다.
  // 밭이 비었다고 주인까지 사라지면 "아직 밭이 비어 있어요" 화면(§12 5번)이
  // 농장이 아니라 빈 그림 한 장이 된다.
  if (!total) {
    return { items: mascot ? [mascotItem(6)] : [], grid: 6, planted: 0 };
  }

  // 격자 밀도 — 가장 많은 단계가 자기 구역에 최대한 들어가도록 잘게 나눈다.
  // 12 에서 멈추는 이유는 이 이상 잘게 나누면 한 밭에 작물이 144개까지 붙어
  // 폰에서 그리는 값이 눈에 띄게 늦어지기 때문이다.
  const maxStage = Math.max(...live.map((s) => counts[s]));
  let G = 6;
  while (G < 12 && Math.floor((G * G) / 4) - 2 < maxStage) G += 2;
  const scale = 6 / G;

  const grid = cells(G);
  const signCell = SIGN_UV.map(([u, v]) => [
    clamp(Math.round(u * G - 0.5), 0, G - 1),
    clamp(Math.round(v * G - 0.5), 0, G - 1),
  ]);
  const mascotIJ = [0, Math.round(G / 3)];

  const quads = [[], [], [], []];
  grid.forEach((c) => {
    const q = quadrant(c.i, c.j, G);
    if (reserveSigns && c.i === signCell[q][0] && c.j === signCell[q][1]) return;
    if (mascot && c.i === mascotIJ[0] && c.j === mascotIJ[1]) return;
    quads[q].push(c);
  });

  // 단계마다 자기 구역이 허용하는 만큼 심는다 — 넘치면 구역이 꽉 찬 상태로 멈춘다
  let want = FIELD_STAGES.map((s, q) => (live.includes(s) ? Math.min(quads[q].length, counts[s]) : 0));
  const wantTotal = want.reduce((a, b) => a + b, 0);
  if (wantTotal > maxSprites) {
    // 상한에 걸리면 비율은 유지한 채 전체를 줄인다
    want = want.map((n) => (n > 0 ? Math.max(1, Math.round(n * maxSprites / wantTotal)) : 0));
  }

  const items = [];
  FIELD_STAGES.forEach((stage, q) => {
    const n = want[q];
    if (n <= 0) return;
    // 격자가 잘아질수록 작물도 작아지므로 최소 간격도 같은 비율로 줄인다
    const spots = spread(quads[q], n, MIN_GAP * scale);
    const variants = variantsFor(n, healthMix);
    spots.forEach((cell, idx) => {
      const variant = variants[idx] || 'healthy';
      // 깊이에 따라 조금 커진다 — 앞에 있는 것이 커 보여야 밭이 평면으로 안 보인다
      const box = CROP_BOX * (0.8 + 0.34 * cell.y / ISL_H) * scale;
      const x = ISL_X0 + cell.x;
      const y = ISL_Y0 + cell.y;
      items.push({
        key: `${stage}-${cell.i}-${cell.j}`,
        kind: 'crop',
        stage,
        variant,
        y,
        leftPct: x / FIELD_W * 100,
        topPct: y / FIELD_H * 100,
        // 정사각형 상자 하나. 단계별 크기는 그림이 알아서 한다.
        boxPct: box / FIELD_W * 100,
      });
    });
  });

  if (mascot) items.push(mascotItem(G));

  // 뒤 → 앞. 이 순서대로 그려야 앞의 작물이 뒤의 작물과 팻말 말뚝을 가린다
  items.sort((a, b) => a.y - b.y);
  return { items, grid: G, planted: items.filter((i) => i.kind === 'crop').length };
};

/** 단어 목록 → 밭에 심을 counts + 건강 분포. 심지 않은 씨앗은 빼고 센다. */
export const fieldDataFromPlants = (plants) => {
  const counts = { seed: 0, sprout: 0, leaf: 0, carrot: 0 };
  const healthMix = {};
  (plants || []).forEach((p) => {
    if (!p || p.planted === false) return;
    const crop = stageToCrop(p.crop || p.stage);
    // 황금 당근은 당근 구역에 함께 심는다 (홈 counts 와 같은 규칙)
    const key = crop === 'golden' ? 'carrot' : crop;
    if (!(key in counts)) return;
    counts[key] += 1;
    const variant = healthToVariant(p.health);
    const v = variant === 'golden' ? 'healthy' : variant;
    healthMix[v] = (healthMix[v] || 0) + 1;
  });
  return { counts, healthMix };
};

/** `/farm/overview` 의 health 집계(fresh/thirsty/…) → 그림 variant 분포 */
export const healthMixFromOverview = (health) => {
  const h = health || {};
  return {
    healthy: (h.fresh ?? 0) + (h.golden ?? 0),
    drying: h.thirsty ?? 0,
    // CRITICAL 은 그림이 WILTED 와 같다 (에셋이 4종뿐) — 화면이 테두리로 따로 구분한다
    wilted: (h.wilted ?? 0) + (h.critical ?? 0),
    rotten: h.rotten ?? 0,
  };
};
