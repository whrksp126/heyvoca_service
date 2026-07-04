import React from 'react';

/**
 * 당근 농장 식물 일러스트 (인라인 SVG, 외부 에셋 없음).
 * - stage: 'seed'(씨앗/미학습) | 'sprout'(새싹/단기) | 'leaf'(잎/중기) | 'carrot'(당근/장기)
 * - wilt:  'fresh'(정상) | 'wilt1'(살짝 시듦) | 'wilt2'(많이 시듦) | 'dead'(죽음)
 * 성장 단계는 FSRS 분류에서 파생, 시듦/죽음은 farm 서비스가 계산해 내려준 값.
 */

// 단계별 기본 색 (기존 암기상태 아이콘 색과 1:1)
const STAGE_COLORS = {
  seed:   { main: '#9D835A', dark: '#7A6544', leaf: '#77CE4F' },
  sprout: { main: '#77CE4F', dark: '#5BA838', leaf: '#77CE4F' },
  leaf:   { main: '#38CE38', dark: '#2AA52A', leaf: '#38CE38' },
  carrot: { main: '#F68300', dark: '#D06E00', leaf: '#38CE38' },
};

const SOIL = { top: '#B98A5E', body: '#9C6E45' };
const DEAD = { main: '#B7B0A6', dark: '#948D82', leaf: '#A7A79C' };
const DRY = '#C79A3A'; // 시듦 시 섞을 마른 노란빛

// 시듦 정도별: 기울기(도) + 마른색 혼합 비율
const WILT = {
  fresh: { tilt: 0,  dry: 0 },
  wilt1: { tilt: 7,  dry: 0.35 },
  wilt2: { tilt: 17, dry: 0.6 },
  dead:  { tilt: 26, dry: 0 },
};

// hex 색 선형 보간
const lerpHex = (a, b, t) => {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const mix = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return '#' + mix.map(v => v.toString(16).padStart(2, '0')).join('');
};

const PlantIllustration = ({ stage = 'seed', wilt = 'fresh', size = 56, className = '' }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const isDead = wilt === 'dead';
  const w = WILT[wilt] ?? WILT.fresh;
  const base = isDead ? DEAD : STAGE_COLORS[stage] ?? STAGE_COLORS.seed;
  // 시듦 정도만큼 마른 노란빛으로 이동
  const c = (isDead || w.dry === 0)
    ? base
    : {
        main: lerpHex(base.main, DRY, w.dry),
        dark: lerpHex(base.dark, DRY, w.dry),
        leaf: lerpHex(base.leaf, DRY, w.dry),
      };

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      {/* 흙 둔덕 (항상) */}
      <ellipse cx="32" cy="52" rx="20" ry="7" fill={SOIL.body} />
      <ellipse cx="32" cy="49.5" rx="20" ry="6.5" fill={SOIL.top} />

      {/* 죽음: 흙에 갈라진 금 */}
      {isDead && (
        <path d="M26 49 L30 46 L28 50 L33 47" stroke="#6F5638" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
      )}

      {/* 식물 본체 — 흙 위 기준점(32,49)에서 자람, 시듦에 따라 기울어짐 */}
      <g transform={`rotate(${w.tilt} 32 49)`} opacity={isDead ? 0.75 : 1}>
        {stage === 'seed' && (
          <>
            {/* 씨앗 — 흙에서 막 튼 새싹 촉 */}
            <path d="M32 49 C32 44 32 42 32 40" stroke={c.dark} strokeWidth="2" strokeLinecap="round" />
            <ellipse cx="34.5" cy="40" rx="3.5" ry="2.2" transform="rotate(30 34.5 40)" fill={c.leaf} />
            <ellipse cx="29.5" cy="41.5" rx="3" ry="1.9" transform="rotate(-28 29.5 41.5)" fill={c.leaf} opacity="0.85" />
          </>
        )}

        {stage === 'sprout' && (
          <>
            {/* 새싹 — 짧은 줄기 + 잎 두 장 */}
            <path d="M32 49 C32 42 32 38 32 34" stroke={c.dark} strokeWidth="2.4" strokeLinecap="round" />
            <path d="M32 40 C26 39 23 35 22.5 31 C27 31 31 34 32 40 Z" fill={c.leaf} />
            <path d="M32 37 C38 36 41 32 41.5 28 C37 28 33 31 32 37 Z" fill={c.leaf} opacity="0.9" />
          </>
        )}

        {stage === 'leaf' && (
          <>
            {/* 잎 — 큰 줄기 + 무성한 잎 */}
            <path d="M32 49 C32 40 32 34 32 28" stroke={c.dark} strokeWidth="2.6" strokeLinecap="round" />
            <path d="M32 38 C24 37 19 32 18.5 26 C25 26 31 30 32 38 Z" fill={c.main} />
            <path d="M32 34 C40 33 45 28 45.5 22 C39 22 33 26 32 34 Z" fill={c.main} opacity="0.92" />
            <path d="M32 30 C28 28 26 23 27 18 C31 20 33 25 32 30 Z" fill={c.leaf} />
          </>
        )}

        {stage === 'carrot' && (
          <>
            {/* 당근 잎 (초록, 시듦 시 노랗게) */}
            <path d="M32 34 C27 30 25 24 26 19 C30 22 32 27 32 34 Z" fill={c.leaf} />
            <path d="M32 34 C37 30 39 24 38 19 C34 22 32 27 32 34 Z" fill={c.leaf} opacity="0.9" />
            <path d="M32 33 C32 27 32 22 32 18" stroke={c.leaf} strokeWidth="2" strokeLinecap="round" />
            {/* 당근 몸통 (주황, 흙에 반쯤 묻힘) */}
            <path d="M26 33 L38 33 L32 52 Z" fill={isDead ? c.dark : c.main} />
            <path d="M27.5 36 L36.5 36 M28.8 40 L35.2 40 M30 44 L34 44" stroke={isDead ? '#8A8378' : '#FFB454'} strokeWidth="1.1" strokeLinecap="round" opacity="0.7" />
          </>
        )}
      </g>

      {/* 죽음 표식 — 우상단 X 배지 */}
      {isDead && (
        <g>
          <circle cx="48" cy="17" r="8" fill="#8E8578" />
          <path d="M45 14 L51 20 M51 14 L45 20" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
};

export default PlantIllustration;
