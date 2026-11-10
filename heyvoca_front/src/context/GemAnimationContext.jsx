/**
 * Flying Animation System — 보석·아이템이 화면을 가로질러 날아가는 연출.
 *
 * 2026-11 QA #25 8차: 성능·통일 개편.
 *   · 예전에는 입자마다 framer-motion 컴포넌트 + filter: drop-shadow + radial-gradient 배경 + animate-ping 테두리를
 *     달고, 도착 순간 70px 상자를 scale 3 까지 키웠다. 움직이는 요소의 filter 는 매 프레임 다시 칠해야 해서
 *     저사양 Android WebView 에서 프레임이 떨어졌고, 도착 글로우가 210px 로 커져 숫자를 가렸다.
 *   · 이제 입자는 <img> 하나뿐이고 Web Animations API 로 transform / opacity 만 움직인다(합성 단계에서 끝남).
 *     React 상태도 건드리지 않아 날아가는 동안 리렌더가 없다. 이미지는 미리 decode 해 둔다.
 *
 * 두 가지 진입점:
 *   triggerFlyingAnimation({...})  — 기존 호출부 호환(시작점 → 끝점, 끝나면 onComplete).
 *   flyGemReward({ source, amount, gemTo, gemFrom, onComplete })
 *       — 보상 받기 전용. 화면 우측 상단(홈 보석 칩과 같은 자리)에 보석 현황 칩을 잠깐 띄우고,
 *         보석이 그 칩으로 날아 들어간 뒤 숫자가 이전값 → 새값으로 굴러 오르고, 잠시 뒤 칩이 사라진다.
 *         헤더에 보석 카운터가 없는 화면에서도 똑같이 보인다. 퀘스트 보상·업적 보상이 같이 쓴다.
 */
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import gemImg from '../assets/images/farm/icon-gem.png';

const FlyingAnimationContext = createContext();

// 보상 보석 연출(flyGemReward)이 진행 중인 개수 — 다음 보상 시트를 그 뒤로 미루는 데 쓴다
// (OnboardingMissionRewardWatcher: 업적 보석 칩 연출이 끝난 뒤 퀘스트 보상 시트).
let activeGemRewards = 0;
export const isGemRewardPlaying = () => activeGemRewards > 0;

// 기존 호출부가 넘기는 프리셋 이름 — 이제 궤적은 하나로 통일했고 끝 크기만 다르다.
const ANIMATION_PRESETS = {
  'gem-burst': { endScale: 0.55 },
  'simple-fly': { endScale: 0.5 },
};

// ── 이미지 사전 로드 ──────────────────────────────────────────
const decoded = new Map();
export const preloadFlyImage = (url) => {
  if (!url || typeof Image === 'undefined') return Promise.resolve();
  if (decoded.has(url)) return decoded.get(url);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  const p = (typeof img.decode === 'function' ? img.decode() : Promise.resolve()).catch(() => {});
  decoded.set(url, p);
  return p;
};
preloadFlyImage(gemImg);

export const useFlyingAnimation = () => {
  const context = useContext(FlyingAnimationContext);
  if (!context) throw new Error('useFlyingAnimation must be used within FlyingAnimationProvider');
  return context;
};

const getPosition = (point) => {
  if (!point) return null;
  const w = window.innerWidth;
  const h = window.innerHeight;

  if (point.type === 'element') {
    const element = typeof point.value === 'string' ? document.querySelector(point.value) : point.value;
    if (element && element.getBoundingClientRect) {
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
  }

  if (point.type === 'position' && typeof point.value === 'string') {
    const margin = 60;
    const positions = {
      'center-bottom': { x: w / 2, y: h - margin },
      'center-top': { x: w / 2, y: margin },
      'center-center': { x: w / 2, y: h / 2 },
      'left-bottom': { x: margin, y: h - margin },
      'right-bottom': { x: w - margin, y: h - margin },
      'left-top': { x: margin, y: margin },
      'right-top': { x: w - margin, y: margin },
    };
    return positions[point.value] || positions['center-bottom'];
  }

  if (point.type === 'position' && typeof point.value === 'object') {
    return { x: point.value.x, y: point.value.y };
  }
  return null;
};

const prefersReducedMotion = () => {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {
    return false;
  }
};

const canAnimate = (node) => node && typeof node.animate === 'function';

/**
 * 입자 날리기 — 시작점에서 살짝 흩어졌다가 끝점으로 빨려 들어간다.
 * 입자는 layer 아래 <img> 로 직접 만들고, 끝나면 스스로 빠진다(React 상태 없음).
 */
const flyParticles = ({ layer, imageUrl, quantity, startPos, endPos, duration, stagger, size = 40, endScale = 0.55, onEach, onDone }) => {
  const n = Math.max(1, quantity | 0);
  if (!layer || !startPos || !endPos || prefersReducedMotion()) {
    for (let i = 0; i < n; i += 1) onEach?.(i, n);
    onDone?.();
    return;
  }
  let left = n;
  const finishOne = (i, node) => {
    node.remove();
    onEach?.(i, n);
    left -= 1;
    if (left === 0) onDone?.();
  };
  for (let i = 0; i < n; i += 1) {
    const node = document.createElement('img');
    node.src = imageUrl;
    node.alt = '';
    node.setAttribute('aria-hidden', 'true');
    node.draggable = false;
    node.style.cssText = `position:absolute;left:0;top:0;width:${size}px;height:${size}px;margin:${-size / 2}px 0 0 ${-size / 2}px;object-fit:contain;opacity:0;will-change:transform,opacity;pointer-events:none;`;
    layer.appendChild(node);
    if (!canAnimate(node)) { finishOne(i, node); continue; }
    // 흩어지는 방향 — 고르게 돌되 위쪽으로 조금 더
    const ang = (i / n) * Math.PI * 2 + 0.6;
    const spread = 34 + (i % 3) * 12;
    const ox = Math.cos(ang) * spread;
    const oy = Math.sin(ang) * spread - 18;
    const tf = (x, y, s) => `translate3d(${x}px,${y}px,0) scale(${s})`;
    const a = node.animate([
      { transform: tf(startPos.x, startPos.y, 0.4), opacity: 0, easing: 'cubic-bezier(.2,.8,.3,1)' },
      { transform: tf(startPos.x + ox, startPos.y + oy, 1), opacity: 1, offset: 0.3, easing: 'cubic-bezier(.55,0,.8,.5)' },
      { transform: tf(endPos.x, endPos.y, endScale), opacity: 1, offset: 0.94 },
      { transform: tf(endPos.x, endPos.y, endScale * 0.6), opacity: 0 },
    ], { duration, delay: i * stagger, fill: 'both' });
    a.onfinish = () => finishOne(i, node);
    a.oncancel = () => finishOne(i, node);
  }
};

// 보석 칩 위치 — 홈 보석 칩(components/home/Main.jsx #home-gem-chip)과 같은 자리·같은 모양.
// 홈에서는 그 위에 정확히 겹쳐 그 칩이 오르는 것처럼 보이고, 다른 화면에서는 잠깐 떴다 사라진다.
const GemCounterChip = ({ chipRef, iconRef, numRef, glowRef, initialText }) => (
  <div
    ref={chipRef}
    className="
      fixed top-[max(48px,calc(var(--status-bar-height)+4px))] right-[16px]
      inline-flex items-center gap-[6px]
      h-[36px] pl-[6px] pr-[12px] rounded-full
      bg-layout-white dark:bg-layout-gray-dark
      shadow-[0_2px_8px_rgba(96,80,52,.16)] dark:shadow-[0_2px_8px_rgba(0,0,0,.4)]
      text-[16px] font-[700] tracking-[-0.02em] tabular-nums
      text-layout-black dark:text-layout-white
      opacity-0 [will-change:transform,opacity]
    "
  >
    <span className="relative block w-[22px] h-[22px]">
      {/* 도착 빛 — 아이콘 크기의 작은 고리. 짧게(280ms) 퍼지고 사라진다 */}
      <span
        ref={glowRef}
        aria-hidden
        className="absolute -inset-[5px] rounded-full bg-primary-main-300 opacity-0 [will-change:transform,opacity]"
      />
      <img
        ref={iconRef}
        src={gemImg}
        alt=""
        draggable={false}
        className="relative block w-[22px] h-[22px] object-contain select-none [will-change:transform]"
      />
    </span>
    <span ref={numRef}>{initialText}</span>
  </div>
);

const fmt = (v) => Math.round(Number(v) || 0).toLocaleString();

export const FlyingAnimationProvider = ({ children }) => {
  const [mounted, setMounted] = useState(false);
  const layerRef = useRef(null);

  // 보석 칩 — 칩의 등장/퇴장만 React 상태로, 숫자·빛·입자는 DOM 을 직접 움직인다.
  const [chip, setChip] = useState(null); // { id, initialText }
  const chipRef = useRef(null);
  const iconRef = useRef(null);
  const numRef = useRef(null);
  const glowRef = useRef(null);
  const jobRef = useRef(null);
  const queueRef = useRef(Promise.resolve());

  useEffect(() => {
    setMounted(true);
  }, []);

  const triggerFlyingAnimation = ({
    imageUrl,
    quantity = 1,
    startPoint = { type: 'position', value: 'center-bottom' },
    endPoint = { type: 'position', value: 'right-top' },
    animationPreset = 'gem-burst',
    customAnimation = null,
    duration = 0.8,
    delay = 0.08,
    onStart,
    onComplete
  }) => {
    if (onStart) onStart();
    const startPos = getPosition(startPoint);
    const endPos = getPosition(endPoint);
    if (!startPos || !endPos) {
      if (onComplete) onComplete();
      return;
    }
    const preset = customAnimation || ANIMATION_PRESETS[animationPreset] || ANIMATION_PRESETS['gem-burst'];
    preloadFlyImage(imageUrl);
    flyParticles({
      layer: layerRef.current,
      imageUrl,
      quantity,
      startPos,
      endPos,
      duration: duration * 1000,
      stagger: delay * 1000,
      size: 44,
      endScale: preset.endScale ?? 0.55,
      onDone: () => onComplete?.(),
    });
  };

  // 칩이 그려진 뒤 실제 비행을 시작한다(칩 위치를 재야 하므로).
  useEffect(() => {
    const job = jobRef.current;
    if (!chip || !job || job.id !== chip.id) return undefined;
    let cancelled = false;
    let raf = 0;
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));

    const chipEl = chipRef.current;
    const iconEl = iconRef.current;
    const numEl = numRef.current;
    const glowEl = glowRef.current;
    const reduced = prefersReducedMotion();

    if (canAnimate(chipEl)) {
      chipEl.animate(
        [{ opacity: 0, transform: 'translateY(-8px) scale(.9)' }, { opacity: 1, transform: 'none' }],
        { duration: reduced ? 1 : 200, easing: 'ease-out', fill: 'forwards' },
      );
    } else if (chipEl) {
      chipEl.style.opacity = '1';
    }

    // 새 잔액이 아직 안 왔으면(퀘스트 보상은 프로필을 다시 읽는다) 오는 대로 출발값을 맞춘다.
    let toValue = null;
    let fromValue = job.gemFrom;
    const toPromise = Promise.resolve(job.gemTo).then((v) => {
      const n = Number(v);
      toValue = Number.isFinite(n) ? n : null;
      if (toValue != null && !Number.isFinite(fromValue)) fromValue = Math.max(0, toValue - job.amount);
      if (!cancelled && numEl && Number.isFinite(fromValue) && !job.counting) numEl.textContent = fmt(fromValue);
      return toValue;
    }).catch(() => null);

    const finish = () => {
      if (cancelled) return;
      const out = canAnimate(chipEl)
        ? chipEl.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6px) scale(.95)' }], { duration: 200, easing: 'ease-in', fill: 'forwards' })
        : null;
      const done = () => {
        if (cancelled) return;
        jobRef.current = null;
        setChip(null);
        job.onComplete?.();
        job.resolve();
      };
      if (out) out.onfinish = done; else done();
    };

    const countUp = async () => {
      const to = await toPromise;
      if (cancelled) return;
      job.counting = true;
      const from = Number.isFinite(fromValue) ? fromValue : to;
      if (to == null || from === to || reduced || !numEl) {
        if (numEl && to != null) numEl.textContent = fmt(to);
        later(finish, 1100);
        return;
      }
      // 숫자 굴리기 — 매 프레임 setState 대신 textContent 만 바꾼다
      const dur = Math.min(900, 450 + Math.abs(to - from) * 25);
      const t0 = performance.now();
      const step = (now) => {
        if (cancelled) return;
        const p = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        numEl.textContent = fmt(from + (to - from) * e);
        if (p < 1) raf = requestAnimationFrame(step);
        else {
          if (canAnimate(numEl)) numEl.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
          later(finish, 1000);
        }
      };
      raf = requestAnimationFrame(step);
    };

    const onArrive = () => {
      if (cancelled || reduced) return;
      if (canAnimate(iconEl)) iconEl.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.22)' }, { transform: 'scale(1)' }], { duration: 160, easing: 'ease-out' });
      if (canAnimate(glowEl)) glowEl.animate([{ opacity: 0.5, transform: 'scale(.7)' }, { opacity: 0, transform: 'scale(1.35)' }], { duration: 280, easing: 'ease-out' });
    };

    const endRect = iconEl?.getBoundingClientRect();
    const endPos = endRect ? { x: endRect.left + endRect.width / 2, y: endRect.top + endRect.height / 2 } : null;
    preloadFlyImage(gemImg).then(() => {
      if (cancelled) return;
      flyParticles({
        layer: layerRef.current,
        imageUrl: gemImg,
        quantity: job.quantity,
        startPos: job.startPos,
        endPos,
        duration: 760,
        stagger: 70,
        size: 40,
        endScale: 0.55,
        onEach: onArrive,
        onDone: countUp,
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      // job 은 finish 에서만 끝낸다 — StrictMode 의 effect 재실행에서 같은 job 을 다시 집어 이어 가야 한다.
    };
  }, [chip]);

  /**
   * 보상 보석 비행 + 우측 상단 보석 칩 카운트업.
   * @param {Element|null} source   보석이 출발할 요소(바텀시트의 보석 아이콘). 없으면 화면 가운데.
   * @param {number} amount         받은 보석 수
   * @param {number|Promise<number>} gemTo  받은 뒤 잔액(모르면 Promise — 도착 전까지 오면 된다)
   * @param {number} [gemFrom]      받기 전 잔액. 없으면 gemTo - amount
   * @param {number} [hint]         gemTo 를 기다리는 동안 칩에 먼저 보여 줄 값
   */
  const flyGemReward = ({ source, amount = 0, gemTo, gemFrom, hint, quantity, onComplete } = {}) => {
    const startPos = getPosition(source ? { type: 'element', value: source } : { type: 'position', value: 'center-center' })
      || getPosition({ type: 'position', value: 'center-center' });
    const amt = Math.max(0, Number(amount) || 0);
    activeGemRewards += 1;
    const run = () => new Promise((resolve) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const from = Number(gemFrom);
      const toNum = Number(gemTo);
      const initial = Number.isFinite(from)
        ? from
        : (gemTo != null && typeof gemTo !== 'object' && Number.isFinite(toNum) ? Math.max(0, toNum - amt) : Number(hint));
      jobRef.current = {
        id,
        startPos,
        amount: amt,
        gemTo,
        gemFrom: Number.isFinite(from) ? from : undefined,
        quantity: quantity || Math.min(8, Math.max(3, Math.round(amt / 3))),
        onComplete,
        resolve,
        counting: false,
      };
      setChip({ id, initialText: Number.isFinite(initial) ? fmt(initial) : '' });
    });
    // 연달아 받으면 칩이 겹치지 않게 차례로
    const settle = () => { activeGemRewards = Math.max(0, activeGemRewards - 1); };
    queueRef.current = queueRef.current.then(run, run).then(settle, settle);
    return queueRef.current;
  };

  const animationLayer = (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 99999999, contain: 'layout style' }}>
      {chip ? (
        <GemCounterChip
          key={chip.id}
          chipRef={chipRef}
          iconRef={iconRef}
          numRef={numRef}
          glowRef={glowRef}
          initialText={chip.initialText}
        />
      ) : null}
      {/* 입자는 칩 위로 지나가도록 칩 뒤에 둔다 */}
      <div ref={layerRef} style={{ position: 'absolute', inset: 0 }} />
    </div>
  );

  return (
    <FlyingAnimationContext.Provider value={{ triggerFlyingAnimation, flyGemReward }}>
      {children}
      {mounted && createPortal(animationLayer, document.body)}
    </FlyingAnimationContext.Provider>
  );
};

export { ANIMATION_PRESETS };
export const useGemAnimation = useFlyingAnimation;
export const GemAnimationProvider = FlyingAnimationProvider;
