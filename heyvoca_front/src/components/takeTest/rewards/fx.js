// src/components/takeTest/rewards/fx.js
//
// 보상 슬라이드의 일회성 효과(파편·고리·젤리·색종이) — Web Animations API 로 직접 그린다.
// 수십 개가 한꺼번에 뜨는 조각이라 React 상태로 만들면 저사양 Android WebView 에서 프레임이 떨어진다.
// 전부 transform / opacity 만 움직이고, 끝나면 스스로 DOM 에서 빠진다.
// 좌표(x, y)는 **부모 요소(relative) 안의 px** 이다.

export const FX_COLORS = ['#FFAAE6', '#FFD166', '#6CE9A6', '#74D5FF', '#FFBDEB', '#FFFFFF'];
export const FX_GOLDS = ['#F2B713', '#F2D252', '#FFF3C4', '#FFFFFF'];
export const BACK_OUT = 'cubic-bezier(.34,1.56,.64,1)';

/** node.animate 가 없는 구형 WebView 에서는 조용히 넘어간다(최종 상태는 호출부의 클래스가 정한다). */
export const anim = (node, frames, opts) => {
  if (!node || typeof node.animate !== 'function') return null;
  try {
    return node.animate(frames, opts);
  } catch (e) {
    return null;
  }
};

const spawn = (parent, cssText) => {
  const node = document.createElement('span');
  node.setAttribute('aria-hidden', 'true');
  node.style.cssText = `position:absolute;pointer-events:none;${cssText}`;
  parent.appendChild(node);
  return node;
};

const runAndRemove = (node, frames, opts) => {
  const a = anim(node, frames, opts);
  if (!a) { node.remove(); return; }
  a.onfinish = () => node.remove();
  a.oncancel = () => node.remove();
};

export const burst = (parent, x, y, { n = 10, dist = 46, size = 7, colors = FX_COLORS, dur = 700, up = 10 } = {}) => {
  if (!parent) return;
  for (let i = 0; i < n; i += 1) {
    const s = size * (i % 2 ? 0.7 : 1);
    const p = spawn(parent, `left:${x - s / 2}px;top:${y - s / 2}px;width:${s}px;height:${s}px;border-radius:50%;z-index:30;opacity:0;background:${colors[i % colors.length]}`);
    const ang = (i / n) * Math.PI * 2 + (i % 2 ? 0.3 : 0);
    const d = dist * (i % 2 ? 0.7 : 1);
    runAndRemove(p, [
      { transform: 'translate(0,0) scale(.4)', opacity: 0 },
      { transform: `translate(${Math.cos(ang) * d * 0.7}px,${Math.sin(ang) * d * 0.7 - up}px) scale(1)`, opacity: 1, offset: 0.4 },
      { transform: `translate(${Math.cos(ang) * d}px,${Math.sin(ang) * d - up + 8}px) scale(.3)`, opacity: 0 },
    ], { duration: dur, easing: 'ease-out' });
  }
};

export const ring = (parent, x, y, { size = 150, color = '#FFAAE6', dur = 600 } = {}) => {
  if (!parent) return;
  const r = spawn(parent, `left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;height:${size}px;border-radius:50%;border:3px solid ${color};z-index:29;opacity:0`);
  runAndRemove(r, [{ transform: 'scale(.2)', opacity: 0.9 }, { transform: 'scale(1)', opacity: 0 }], { duration: dur, easing: 'ease-out' });
};

/** 통 튀는 눌림 — k 가 클수록 크게 찌그러진다 */
export const jelly = (node, k = 1) => anim(node, [
  { transform: 'scale(1,1)' },
  { transform: `scale(${1 + 0.16 * k},${1 - 0.2 * k})` },
  { transform: `scale(${1 - 0.1 * k},${1 + 0.2 * k})` },
  { transform: `scale(${1 + 0.05 * k},${1 - 0.05 * k})` },
  { transform: 'scale(1,1)' },
], { duration: 520, easing: 'ease-out' });

export const pulse = (node, to = 1.2, dur = 240) => anim(node, [
  { transform: 'scale(1)' }, { transform: `scale(${to})` }, { transform: 'scale(1)' },
], { duration: dur, easing: 'ease-out' });

/** 색종이 — 부모 위쪽에서 아래로 떨어진다. 개수는 저사양 기기를 생각해 30개 안쪽으로 쓴다. */
export const confetti = (parent, { n = 28, colors = [...FX_COLORS, '#F2D252'] } = {}) => {
  if (!parent) return;
  const w = parent.clientWidth || 360;
  const h = parent.clientHeight || 520;
  for (let i = 0; i < n; i += 1) {
    const c = spawn(parent, `top:-14px;left:${Math.random() * w}px;width:8px;height:13px;border-radius:2px;z-index:25;opacity:0;background:${colors[i % colors.length]}`);
    const dx = (Math.random() - 0.5) * 120;
    const rot = (Math.random() - 0.5) * 900;
    runAndRemove(c, [
      { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${dx}px,${h * 0.85}px) rotate(${rot}deg)`, opacity: 1, offset: 0.85 },
      { transform: `translate(${dx}px,${h}px) rotate(${rot}deg)`, opacity: 0 },
    ], { duration: 1500 + Math.random() * 900, delay: Math.random() * 350, easing: 'cubic-bezier(.2,.6,.6,1)' });
  }
};

/** 부모 안에 남아 있는 효과 조각을 전부 치운다(연출 건너뛰기·언마운트) */
export const clearFx = (parent) => {
  if (!parent) return;
  parent.querySelectorAll(':scope > span[aria-hidden="true"]').forEach((n) => {
    if (n.dataset.keep) return;
    n.remove();
  });
};
