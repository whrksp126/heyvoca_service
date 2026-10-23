// src/utils/scriptWriteGrader.js
//
// 글자 복습 "듣고 쓰기"(scriptListenWrite) 채점 — 가이드 획 없이 빈 판에 쓴 글씨를 정답 글자의
// 획 데이터(data/script/strokes/*.json)와 비교한다. 따라 쓰기(components/script/StrokeTracer.jsx)의
// 판정 원리(가이드 획 위 표본점이 사용자 궤적 근처에 있는 비율 = 커버리지)를 그대로 쓰되,
// 가이드 없이 쓰면 위치·크기가 제각각이라 먼저 정규화한다:
//   1) 사용자 잉크 전체의 외접 상자를 정답 글자 외접 상자에 맞춘다(가로세로 같은 배율, 중심 정렬).
//   2) 획 수가 같으면 i번째 획끼리 짝지어 커버리지(정답 획을 얼마나 덮었나)·정밀도(쓴 획이
//      정답 획 근처에 있나)·방향(시작점이 정답 획 시작 쪽인가)을 본다 — 순서가 틀리면 짝이 어긋나
//      커버리지가 무너진다.
//   3) 획 수가 하나 많거나 적으면(이어 쓰기·끊어 쓰기) 획 짝 없이 전체 잉크끼리 더 엄격하게 본다.
// 기준값은 scratchpad 의 합성 필기(정답 글자에 손떨림·크기·위치·기울기 변형 vs 다른 글자) 실측으로
// 정했다 — 수치를 바꾸면 그 실측을 다시 돌릴 것(아래 THRESHOLDS 주석).
//
// DOM 의존이 없다(getPointAtLength 대신 직접 경로를 펼친다) — 노드에서 그대로 실측할 수 있게.

// 2026-10 실측 — 가나 208자 × 합성 손글씨(크기 55~100%·위치 ±12·기울기 ±7°·가로세로 ±15%·획마다
// 이동·손떨림). 같은 획 수의 다른 글자로 쓴 것을 정답으로 잘못 통과시키는 비율과 같이 봤다.
//   또박또박(획 이동 σ3) : 정답 통과 99.4%, 다른 글자 통과 0.8%
//   흘려 씀(획 이동 σ6) : 정답 통과 75.6%, 다른 글자 통과 0.6%
//   혼동쌍(ぬ/め·わ/れ/ね 등 26쌍) 오인 4쌍 — 실제로도 획 끝 모양만 다른 글자들이다.
// 화면(ScriptListenWriteQuestion)은 정답 획 수만큼 쓰면 자동 채점하므로 획 수는 항상 같다.
export const THRESHOLDS = {
  tolRatio: 0.16,         // 정규화 후 허용 반경 = 정답 외접 상자 긴 변 × 이 값
  strokeCoverageMin: 0.5, // 짝지은 획 하나하나의 최소 커버리지
  meanCoverage: 0.72,     // 획 평균 커버리지
  precision: 0.72,        // 쓴 점 중 정답 획 근처에 있는 비율(낙서 방지)
  strokePrecisionMin: 0.5, // 짝지은 획 하나하나의 최소 정밀도
  directionShare: 0.5,    // 방향이 맞아야 하는 획 비율(이상)
  endpointRatio: 1.5,     // 획 끝점 일치 반경 = 허용 반경 × 이 값
  endpointShare: 0.67,    // 시작·끝점이 둘 다 맞아야 하는 획 비율(이상) — 비슷한 글자(ぬ/め·わ/れ) 구분
  looseCoverage: 0.8,     // 획 수가 ±1 다를 때 전체 커버리지
  loosePrecision: 0.8,    // 획 수가 ±1 다를 때 전체 정밀도
  minInkRatio: 0.12,      // 판 크기 대비 너무 작게 쓴 글씨(점 하나 등)는 실패
};

const SAMPLE_COUNT = 24;
const NUM_RE = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** SVG path d(M/L/H/V/C/S/Q/T/Z, 절대·상대) → 촘촘한 폴리라인. 획 데이터에 실제 쓰이는 건 M/c/L/Q 뿐이다. */
export const flattenPath = (d) => {
  const out = [];
  const tokens = String(d || '').match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || [];
  let i = 0;
  let cmd = null;
  let cur = { x: 0, y: 0 };
  let start = { x: 0, y: 0 };
  let lastCtrl = null;
  const num = () => parseFloat(tokens[i++]);
  const push = (p) => out.push({ x: p.x, y: p.y });
  const cubic = (p0, p1, p2, p3) => {
    for (let s = 1; s <= 12; s++) {
      const t = s / 12; const mt = 1 - t;
      push({
        x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
        y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
      });
    }
  };
  const quad = (p0, p1, p2) => {
    for (let s = 1; s <= 12; s++) {
      const t = s / 12; const mt = 1 - t;
      push({ x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x, y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y });
    }
  };
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    if (!cmd) break;
    const rel = cmd === cmd.toLowerCase();
    const base = rel ? { ...cur } : { x: 0, y: 0 };
    const pt = () => { const x = num(); const y = num(); return { x: base.x + x, y: base.y + y }; };
    switch (cmd.toUpperCase()) {
      case 'M': {
        cur = pt(); start = { ...cur }; push(cur); lastCtrl = null;
        cmd = rel ? 'l' : 'L'; // M 뒤 좌표 반복은 L
        break;
      }
      case 'L': { cur = pt(); push(cur); lastCtrl = null; break; }
      case 'H': { const x = num(); cur = { x: rel ? cur.x + x : x, y: cur.y }; push(cur); lastCtrl = null; break; }
      case 'V': { const y = num(); cur = { x: cur.x, y: rel ? cur.y + y : y }; push(cur); lastCtrl = null; break; }
      case 'C': {
        const p1 = pt(); const p2 = pt(); const p3 = pt();
        cubic(cur, p1, p2, p3); lastCtrl = p2; cur = p3; break;
      }
      case 'S': {
        const p1 = lastCtrl ? { x: 2 * cur.x - lastCtrl.x, y: 2 * cur.y - lastCtrl.y } : { ...cur };
        const p2 = pt(); const p3 = pt();
        cubic(cur, p1, p2, p3); lastCtrl = p2; cur = p3; break;
      }
      case 'Q': {
        const p1 = pt(); const p2 = pt();
        quad(cur, p1, p2); lastCtrl = p1; cur = p2; break;
      }
      case 'T': {
        const p1 = lastCtrl ? { x: 2 * cur.x - lastCtrl.x, y: 2 * cur.y - lastCtrl.y } : { ...cur };
        const p2 = pt();
        quad(cur, p1, p2); lastCtrl = p1; cur = p2; break;
      }
      case 'Z': { cur = { ...start }; push(cur); lastCtrl = null; i += 0; cmd = null; break; }
      default: i++; // 지원하지 않는 명령(A 등) — 획 데이터에 없다
    }
    if (Number.isNaN(cur.x) || Number.isNaN(cur.y)) break;
  }
  return out;
};

/** 폴리라인을 호 길이 기준으로 n+1 개 점으로 고르게 다시 뽑는다. */
export const resample = (points, n = SAMPLE_COUNT) => {
  if (!points || points.length === 0) return [];
  if (points.length === 1) return Array.from({ length: n + 1 }, () => ({ ...points[0] }));
  const cum = [0];
  for (let k = 1; k < points.length; k++) cum.push(cum[k - 1] + dist(points[k - 1], points[k]));
  const total = cum[cum.length - 1];
  if (total === 0) return Array.from({ length: n + 1 }, () => ({ ...points[0] }));
  const out = [];
  let seg = 1;
  for (let s = 0; s <= n; s++) {
    const target = (total * s) / n;
    while (seg < cum.length - 1 && cum[seg] < target) seg++;
    const span = cum[seg] - cum[seg - 1] || 1;
    const t = Math.min(1, Math.max(0, (target - cum[seg - 1]) / span));
    out.push({
      x: points[seg - 1].x + (points[seg].x - points[seg - 1].x) * t,
      y: points[seg - 1].y + (points[seg].y - points[seg - 1].y) * t,
    });
  }
  return out;
};

const pathLength = (pts) => pts.reduce((acc, p, k) => (k === 0 ? 0 : acc + dist(pts[k - 1], p)), 0);

const bbox = (strokes) => {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  strokes.forEach((s) => s.forEach((p) => {
    if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
  }));
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
};

/** 획 데이터(d 문자열 배열) → 획마다 고르게 뽑은 표본점. 같은 글자를 매번 다시 펼치지 않게 캐시한다. */
const guideCache = new Map();
export const guideSamples = (strokeDs) => {
  const key = (strokeDs || []).join('|');
  if (!guideCache.has(key)) {
    guideCache.set(key, (strokeDs || []).map((d) => resample(flattenPath(d), SAMPLE_COUNT)));
  }
  return guideCache.get(key);
};

const coverage = (targets, inkPoints, tol) => {
  if (!targets.length || !inkPoints.length) return 0;
  let hit = 0;
  targets.forEach((t) => { if (inkPoints.some((p) => dist(p, t) <= tol)) hit += 1; });
  return hit / targets.length;
};

/**
 * 손글씨 채점.
 * @param {Array<Array<{x,y}>>} userStrokes  viewBox 좌표의 획 목록(손 뗄 때마다 한 획)
 * @param {string[]} strokeDs                정답 글자의 획 path d 목록(획순대로)
 * @param {{w:number,h:number}} box          판(viewBox) 크기 — 너무 작게 쓴 글씨 판정용
 * @returns {{ passed:boolean, reason:string, coverage:number, precision:number }}
 */
export const gradeFreeWrite = (userStrokes, strokeDs, box = { w: 109, h: 109 }, th = THRESHOLDS) => {
  const strokes = (userStrokes || []).filter((s) => s && s.length >= 2 && pathLength(s) > 0.5);
  const guides = guideSamples(strokeDs);
  const fail = (reason, extra = {}) => ({ passed: false, reason, coverage: 0, precision: 0, ...extra });
  if (!guides.length) return fail('no_guide');
  if (!strokes.length) return fail('empty');
  if (Math.abs(strokes.length - guides.length) > 1) return fail('stroke_count');

  const ub = bbox(strokes);
  const gb = bbox(guides);
  if (Math.max(ub.w, ub.h) < Math.max(box.w, box.h) * th.minInkRatio) return fail('too_small');

  // 1) 정규화 — 같은 배율로 정답 외접 상자에 맞춘다(가로세로 따로 늘리면 し·つ 처럼 납작한 글자가 망가진다).
  const scale = Math.max(gb.w, gb.h) / Math.max(ub.w, ub.h);
  const norm = strokes.map((s) => resample(
    s.map((p) => ({ x: (p.x - ub.cx) * scale + gb.cx, y: (p.y - ub.cy) * scale + gb.cy })),
    SAMPLE_COUNT * 2,
  ));
  const tol = Math.max(gb.w, gb.h) * th.tolRatio;

  // 3) 획 수가 다르면 획 짝 없이 전체 잉크끼리
  if (strokes.length !== guides.length) {
    const allGuide = guides.flat();
    const allInk = norm.flat();
    const cov = coverage(allGuide, allInk, tol);
    const prec = coverage(allInk, allGuide, tol);
    const passed = cov >= th.looseCoverage && prec >= th.loosePrecision;
    return { passed, reason: passed ? 'ok_loose' : 'shape', coverage: cov, precision: prec };
  }

  // 2) 획 짝 — i번째끼리
  let covSum = 0; let covMin = 1; let precHit = 0; let precTotal = 0; let dirOk = 0; let endOk = 0;
  let precMin = 1;
  const endTol = tol * th.endpointRatio;
  guides.forEach((g, k) => {
    const ink = norm[k];
    const c = coverage(g, ink, tol);
    covSum += c; covMin = Math.min(covMin, c);
    let hit = 0;
    ink.forEach((p) => { if (g.some((q) => dist(p, q) <= tol)) hit += 1; });
    precHit += hit; precTotal += ink.length;
    precMin = Math.min(precMin, ink.length ? hit / ink.length : 0);
    const gs = g[0]; const ge = g[g.length - 1];
    const is = ink[0]; const ie = ink[ink.length - 1];
    // 끝점 — 방향은 따로 보므로 거꾸로 그은 것도 끝점 일치로는 인정한다
    if ((dist(is, gs) <= endTol && dist(ie, ge) <= endTol) || (dist(is, ge) <= endTol && dist(ie, gs) <= endTol)) endOk += 1;
    // 시작·끝이 거의 같은 획(동그라미 등)은 방향을 따지지 않는다
    if (dist(gs, ge) < tol || dist(ink[0], gs) <= dist(ink[0], ge)) dirOk += 1;
  });
  const meanCov = covSum / guides.length;
  const prec = precTotal ? precHit / precTotal : 0;
  const dirShare = dirOk / guides.length;
  const endShare = endOk / guides.length;
  let reason = 'ok';
  if (covMin < th.strokeCoverageMin || meanCov < th.meanCoverage) reason = 'shape';
  else if (prec < th.precision || precMin < th.strokePrecisionMin) reason = 'precision';
  else if (endShare < th.endpointShare) reason = 'shape';
  else if (dirShare < th.directionShare) reason = 'direction';
  return { passed: reason === 'ok', reason, coverage: meanCov, precision: prec, coverageMin: covMin, direction: dirShare, endpoints: endShare };
};
