import React, { useRef, useState } from 'react';
import { Minus, Plus, Play, Trash, ArrowCounterClockwise, FloppyDisk, Waveform } from '@phosphor-icons/react';
import {
  feel, getHapticPattern, validateForVariant, SFX_DURATION_MS, SFX_NOTE_STARTS_MS,
  setOverride, clearOverride,
} from '../../../lib/feel';

// 큐 하나의 진동 패턴 그래프 편집기 — 실험실(손맛 테스트) 전용, lazy 로 불러온다.
//   가로 = 시간(ms), 세로 = 세기(0~100%), 막대 하나 = 진동 이벤트(폭=길이, 높이=세기), 점선 = 소리 음 시작 시각.
//   조작: 막대 위쪽/세기 손잡이 위아래 = 세기, 몸통 좌우 = 시작 시각, 오른쪽 손잡이 좌우 = 길이,
//         빈 곳 탭 = 이벤트 추가. 손가락을 떼면 그 패턴을 한 번 자동 재생한다(부모의 autoPlay 설정).
//   드래그는 rAF 로 묶어 setState 한다(SVG 가 작아 충분히 가볍다).

const VB_W = 340;
const VB_H = 170;
const PAD_L = 34;
const PAD_R = 10;
const PAD_T = 12;
const PAD_B = 24;
const PLOT_W = VB_W - PAD_L - PAD_R;
const PLOT_H = VB_H - PAD_T - PAD_B;
const BASE_Y = PAD_T + PLOT_H;
const MAX_TOTAL = 3000;
const MAX_EVENTS = 32;
const MIN_BAR_PX = 6;

const EFFECTS = ['tick', 'click', 'heavyClick'];
const EFFECT_DUR = { tick: 10, click: 16, heavyClick: 24 };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round2 = (v) => Math.round(v * 100) / 100;

let idSeq = 1;
const withIds = (list) => (list || []).map((e) => ({ ...e, id: idSeq++ }));
const strip = (list) => [...list]
  .sort((a, b) => a.time - b.time)
  .map(({ id, ...e }) => ({ ...e, time: Math.round(e.time), duration: Math.round(e.duration), intensity: round2(e.intensity) }));
const sortedCopy = (list) => [...list].sort((a, b) => a.time - b.time);

// 선택 이벤트가 움직일 수 있는 범위 — 이웃 이벤트와 겹치지 않게
function limitsOf(list, id) {
  const s = sortedCopy(list);
  const k = s.findIndex((e) => e.id === id);
  const prev = k > 0 ? s[k - 1] : null;
  const next = k >= 0 && k < s.length - 1 ? s[k + 1] : null;
  return {
    prevEnd: prev ? prev.time + prev.duration : 0,
    nextStart: next ? next.time : MAX_TOTAL,
  };
}

const Stepper = ({ label, value, min, max, unit, onChange }) => (
  <div className="flex items-center justify-between gap-[8px]">
    <span className="text-[12px] text-layout-gray-300 w-[64px] shrink-0">{label}</span>
    <div className="flex items-center gap-[4px]">
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1, min, max))}
        className="flex items-center justify-center w-[36px] h-[36px] rounded-[8px] bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-black dark:text-layout-white"
        aria-label={`${label} 1 줄이기`}
      >
        <Minus size={16} weight="bold" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          if (Number.isFinite(v)) onChange(clamp(v, min, max));
        }}
        className="w-[56px] h-[36px] rounded-[8px] bg-layout-gray-50 dark:bg-layout-gray-dark text-center text-[14px] font-[700] text-layout-black dark:text-layout-white"
        aria-label={label}
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + 1, min, max))}
        className="flex items-center justify-center w-[36px] h-[36px] rounded-[8px] bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-black dark:text-layout-white"
        aria-label={`${label} 1 늘리기`}
      >
        <Plus size={16} weight="bold" />
      </button>
      <span className="w-[22px] text-[12px] text-layout-gray-300">{unit}</span>
    </div>
  </div>
);

const SmallBtn = ({ onClick, disabled, children, tone = 'gray' }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center justify-center gap-[4px] h-[36px] px-[12px] rounded-[10px] text-[13px] font-[600] disabled:opacity-40 ${
      tone === 'primary'
        ? 'bg-primary-main-600 text-layout-white'
        : 'bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-black dark:text-layout-white'
    }`}
  >
    {children}
  </button>
);

const HapticCueEditor = ({ cue, n, variant, autoPlay }) => {
  const initial = () => withIds(getHapticPattern(cue, { n, platform: variant }) || []);
  const [events, setEvents] = useState(initial);
  const [selId, setSelId] = useState(null);
  const [msg, setMsg] = useState('');
  const [baseline, setBaseline] = useState(() => JSON.stringify(strip(initial())));

  const svgRef = useRef(null);
  const eventsRef = useRef(events);
  const dragRef = useRef(null);
  const rafRef = useRef(0);
  const axisLock = useRef(null);

  const isEffect = variant === 'android';
  const isIos = variant === 'ios';

  const commit = (list) => { eventsRef.current = list; setEvents(list); };
  const push = (list) => {
    eventsRef.current = list;
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; setEvents(eventsRef.current); });
    }
  };

  // 시간축 최대(ms) — 패턴 끝과 소리 길이를 모두 보여 준다. 드래그 중에는 고정해 그래프가 흔들리지 않게 한다.
  const computeAxis = (list) => {
    const end = list.reduce((m, e) => Math.max(m, e.time + e.duration), 0);
    const notes = SFX_NOTE_STARTS_MS[cue] || [];
    const need = Math.max(end, SFX_DURATION_MS[cue] || 0, ...notes.map((x) => x + 40)) + 30;
    return clamp(Math.ceil(need / 50) * 50, 150, MAX_TOTAL);
  };
  const axis = axisLock.current ?? computeAxis(events);

  const xOf = (t, ax = axis) => PAD_L + (t / ax) * PLOT_W;
  const yOf = (i) => PAD_T + (1 - i) * PLOT_H;

  const stripped = strip(events);
  const errs = validateForVariant(stripped, variant);
  const dirty = JSON.stringify(stripped) !== baseline;
  const selected = events.find((e) => e.id === selId) || null;

  const play = (list, sound) => {
    if (validateForVariant(list, variant).length) return;
    feel(cue, { n, events: list, sound, force: true });
  };

  const toVb = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    const k = VB_W / rect.width;
    return { x: (e.clientX - rect.left) * k, y: (e.clientY - rect.top) * k };
  };

  const hitTest = (vx, vy, list, ax) => {
    const sel = list.find((e) => e.id === selId);
    if (sel) {
      const x1 = PAD_L + ((sel.time + sel.duration) / ax) * PLOT_W;
      const xm = PAD_L + ((sel.time + sel.duration / 2) / ax) * PLOT_W;
      const yTop = yOf(sel.intensity);
      if (Math.hypot(vx - (x1 + 11), vy - (BASE_Y - 11)) <= 13) return { id: sel.id, mode: 'dur' };
      if (Math.hypot(vx - xm, vy - (yTop - 2)) <= 14) return { id: sel.id, mode: 'int' };
    }
    const sorted = sortedCopy(list);
    for (let k = sorted.length - 1; k >= 0; k -= 1) {
      const e = sorted[k];
      const x0 = PAD_L + (e.time / ax) * PLOT_W;
      const x1 = PAD_L + ((e.time + e.duration) / ax) * PLOT_W;
      const w = x1 - x0;
      const pad = Math.max(4, (26 - w) / 2);
      const yTop = Math.min(yOf(e.intensity), BASE_Y - MIN_BAR_PX);
      const barH = BASE_Y - yTop;
      if (vx >= x0 - pad && vx <= x1 + pad && vy >= yTop - 12 && vy <= BASE_Y + 6) {
        if (vy < yTop + Math.min(8, barH / 2)) return { id: e.id, mode: 'int' };
        if (w >= 24 && vx >= x1 - 10) return { id: e.id, mode: 'dur' };
        return { id: e.id, mode: 'move' };
      }
    }
    return null;
  };

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const { x, y } = toVb(e);
    const list = eventsRef.current;
    axisLock.current = axis;
    const hit = hitTest(x, y, list, axis);
    setMsg('');
    const base = { startX: x, startY: y, moved: false, axis };
    if (hit) {
      const ev = list.find((v) => v.id === hit.id);
      dragRef.current = { ...base, ...hit, orig: { ...ev }, lim: limitsOf(list, hit.id) };
      if (selId !== hit.id) setSelId(hit.id);
    } else {
      dragRef.current = { ...base, mode: 'add' };
    }
    try { svgRef.current.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const { x, y } = toVb(e);
    if (!d.moved && Math.hypot(x - d.startX, y - d.startY) < 4) return;
    d.moved = true;
    if (d.mode === 'add') return;
    const dMs = ((x - d.startX) / PLOT_W) * d.axis;
    const { orig, lim } = d;
    let patch = null;
    if (d.mode === 'move') {
      const hi = Math.max(lim.prevEnd, Math.min(lim.nextStart, MAX_TOTAL) - orig.duration);
      patch = { time: clamp(Math.round(orig.time + dMs), lim.prevEnd, hi) };
    } else if (d.mode === 'dur') {
      const hi = Math.max(1, Math.min(lim.nextStart, MAX_TOTAL) - orig.time);
      patch = { duration: clamp(Math.round(orig.duration + dMs), 1, hi) };
    } else {
      patch = { intensity: clamp(round2(orig.intensity - (y - d.startY) / PLOT_H), 0.01, 1) };
    }
    push(eventsRef.current.map((v) => (v.id === d.id ? { ...v, ...patch } : v)));
  };

  const addAt = (vx, vy, ax) => {
    const list = eventsRef.current;
    if (list.length >= MAX_EVENTS) { setMsg(`이벤트는 최대 ${MAX_EVENTS}개예요`); return null; }
    const t = Math.round(((vx - PAD_L) / PLOT_W) * ax);
    if (t < 0 || t >= MAX_TOTAL) return null;
    const effect = isEffect ? (selected?.effect || 'click') : null;
    const dur = isEffect ? EFFECT_DUR[effect] : (isIos ? 12 : 10);
    const sorted = sortedCopy(list);
    if (sorted.some((e) => t >= e.time && t < e.time + e.duration)) { setMsg('다른 막대 위예요. 빈 곳을 눌러 주세요'); return null; }
    const lo = sorted.filter((e) => e.time + e.duration <= t).reduce((m, e) => Math.max(m, e.time + e.duration), 0);
    const nxt = sorted.find((e) => e.time >= t);
    const hi = nxt ? nxt.time : MAX_TOTAL;
    const d = Math.min(dur, hi - lo);
    if (d < 1) { setMsg('이 자리엔 들어갈 공간이 없어요'); return null; }
    const start = clamp(t, lo, hi - d);
    const ev = {
      id: idSeq++,
      time: start,
      type: 'transient',
      duration: d,
      intensity: clamp(round2((BASE_Y - vy) / PLOT_H), 0.01, 1),
      sharpness: isIos ? 0.8 : 0.5,
    };
    if (effect) ev.effect = effect;
    return ev;
  };

  const onPointerUp = (e) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
    axisLock.current = null;
    try { svgRef.current.releasePointerCapture(e.pointerId); } catch (err) { /* noop */ }
    let list = eventsRef.current;
    if (d.mode === 'add') {
      if (d.moved) { setEvents(list); return; }
      const ev = addAt(d.startX, d.startY, d.axis);
      if (!ev) { setEvents(list); return; }
      list = [...list, ev];
      setSelId(ev.id);
      commit(list);
      if (autoPlay !== 'off') play(strip(list), autoPlay === 'both');
      return;
    }
    commit(list);
    if (d.moved && autoPlay !== 'off') play(strip(list), autoPlay === 'both');
  };

  const onPointerCancel = () => {
    dragRef.current = null;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
    axisLock.current = null;
    setEvents(eventsRef.current);
  };

  const patchSelected = (patch) => {
    if (!selected) return;
    commit(eventsRef.current.map((v) => (v.id === selected.id ? { ...v, ...patch } : v)));
  };

  const removeSelected = () => {
    if (!selected) return;
    commit(eventsRef.current.filter((v) => v.id !== selected.id));
    setSelId(null);
    setMsg('');
  };

  const save = () => {
    if (errs.length || !dirty) return;
    // 기본값과 같으면 오버라이드를 남기지 않는다.
    const def = getHapticPattern(cue, { n, platform: variant, noOverride: true });
    if (def && JSON.stringify(strip(withIds(def))) === JSON.stringify(stripped)) clearOverride(variant, cue);
    else setOverride(variant, cue, stripped);
    setBaseline(JSON.stringify(stripped));
    setMsg('저장했어요. 학습 화면에도 바로 적용돼요');
  };

  const resetCue = () => {
    clearOverride(variant, cue);
    const list = withIds(getHapticPattern(cue, { n, platform: variant }) || []);
    commit(list);
    setSelId(null);
    setBaseline(JSON.stringify(strip(list)));
    setMsg('기본값으로 되돌렸어요');
  };

  // 눈금
  const tickStep = axis <= 200 ? 25 : axis <= 400 ? 50 : axis <= 1000 ? 100 : 500;
  const ticks = [];
  for (let t = 0; t <= axis; t += tickStep) ticks.push(t);
  const notes = SFX_NOTE_STARTS_MS[cue] || [];

  const lim = selected ? limitsOf(events, selected.id) : null;

  return (
    <div className="px-[20px] pb-[16px]">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="block w-full h-auto touch-none select-none rounded-[10px] bg-layout-gray-50 dark:bg-layout-gray-dark"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* 세기 눈금 0/50/100% */}
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line x1={PAD_L} x2={VB_W - PAD_R} y1={yOf(v)} y2={yOf(v)} className="stroke-layout-gray-100" strokeWidth="1" />
            <text x={PAD_L - 4} y={yOf(v) + 3} textAnchor="end" fontSize="9" className="fill-layout-gray-300">{Math.round(v * 100)}%</text>
          </g>
        ))}
        {/* 시간 눈금 */}
        {ticks.map((t) => (
          <text key={t} x={xOf(t)} y={VB_H - 8} textAnchor="middle" fontSize="9" className="fill-layout-gray-300">{t}</text>
        ))}
        <text x={VB_W - PAD_R} y={VB_H - 1} textAnchor="end" fontSize="8" className="fill-layout-gray-300">ms</text>
        {/* 소리 음 시작 시각 */}
        {notes.map((t) => (
          <line
            key={`note-${t}`}
            x1={xOf(t)}
            x2={xOf(t)}
            y1={PAD_T - 4}
            y2={BASE_Y}
            strokeDasharray="3 3"
            strokeWidth="1.5"
            className="stroke-status-error-400"
          />
        ))}
        {/* 진동 막대 */}
        {events.map((e) => {
          const x0 = xOf(e.time);
          const w = Math.max(2, xOf(e.time + e.duration) - x0);
          const yTop = Math.min(yOf(e.intensity), BASE_Y - MIN_BAR_PX);
          const on = e.id === selId;
          return (
            <rect
              key={e.id}
              x={x0}
              y={yTop}
              width={w}
              height={BASE_Y - yTop}
              rx="1.5"
              className={on ? 'fill-primary-main-600' : 'fill-primary-main-300'}
            />
          );
        })}
        {/* 선택 막대 손잡이 — 세기(위), 길이(오른쪽 아래) */}
        {selected && (() => {
          const yTop = Math.min(yOf(selected.intensity), BASE_Y - MIN_BAR_PX);
          const xm = xOf(selected.time + selected.duration / 2);
          const x1 = xOf(selected.time + selected.duration);
          return (
            <g>
              <circle cx={xm} cy={yTop - 2} r="6" className="fill-layout-white stroke-primary-main-600" strokeWidth="2" />
              <circle cx={x1 + 11} cy={BASE_Y - 11} r="6" className="fill-layout-white stroke-primary-main-600" strokeWidth="2" />
              <line x1={x1 + 5} x2={x1} y1={BASE_Y - 11} y2={BASE_Y - 11} strokeWidth="1.5" className="stroke-primary-main-600" />
            </g>
          );
        })()}
      </svg>
      <p className="mt-[6px] text-[11px] leading-[1.5] text-layout-gray-300">
        막대 위쪽(동그라미)=세기, 몸통=시작 시각, 오른쪽 아래 동그라미=길이, 빈 곳 탭=추가. 붉은 점선은 소리 음이 시작하는 시각이에요. 손을 떼면 한 번 재생돼요.
      </p>

      {/* 선택 이벤트 숫자 조정 */}
      <div className="mt-[8px] flex flex-col gap-[6px]">
        {selected ? (
          <>
            <Stepper
              label="시각"
              unit="ms"
              value={Math.round(selected.time)}
              min={lim.prevEnd}
              max={Math.max(lim.prevEnd, Math.min(lim.nextStart, MAX_TOTAL) - selected.duration)}
              onChange={(v) => patchSelected({ time: v })}
            />
            <Stepper
              label="길이"
              unit="ms"
              value={Math.round(selected.duration)}
              min={1}
              max={Math.max(1, Math.min(lim.nextStart, MAX_TOTAL) - selected.time)}
              onChange={(v) => patchSelected({ duration: v })}
            />
            <Stepper
              label="세기"
              unit="%"
              value={Math.round(selected.intensity * 100)}
              min={1}
              max={100}
              onChange={(v) => patchSelected({ intensity: v / 100 })}
            />
            {isIos && (
              <Stepper
                label="날카로움"
                unit="%"
                value={Math.round((selected.sharpness ?? 0.5) * 100)}
                min={0}
                max={100}
                onChange={(v) => patchSelected({ sharpness: v / 100 })}
              />
            )}
            {isEffect && (
              <div className="flex items-center justify-between gap-[8px]">
                <span className="text-[12px] text-layout-gray-300 w-[64px] shrink-0">효과</span>
                <div className="flex gap-[4px]">
                  {EFFECTS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => patchSelected({ effect: f })}
                      className={`h-[36px] px-[10px] rounded-[8px] text-[12px] font-[600] ${
                        selected.effect === f
                          ? 'bg-primary-main-600 text-layout-white'
                          : 'bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-black dark:text-layout-white'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <SmallBtn onClick={removeSelected}>
                <Trash size={16} />
                선택한 막대 삭제
              </SmallBtn>
            </div>
          </>
        ) : (
          <p className="text-[12px] text-layout-gray-300">막대를 누르면 값을 숫자로 조정할 수 있어요.</p>
        )}
      </div>

      {/* 규격 위반 */}
      {errs.length > 0 && (
        <ul className="mt-[8px] m-0 pl-[16px] list-disc text-[12px] text-status-error-600">
          {errs.map((m) => <li key={m}>{m}</li>)}
        </ul>
      )}
      {msg && <p className="mt-[6px] text-[12px] text-primary-main-600">{msg}</p>}

      {/* 재생 / 저장 / 되돌리기 */}
      <div className="mt-[10px] flex flex-wrap gap-[6px]">
        <SmallBtn onClick={() => play(stripped, true)} disabled={errs.length > 0}>
          <Play size={16} weight="fill" />
          소리+진동
        </SmallBtn>
        <SmallBtn onClick={() => play(stripped, false)} disabled={errs.length > 0}>
          <Waveform size={16} />
          진동만
        </SmallBtn>
        <SmallBtn onClick={save} disabled={errs.length > 0 || !dirty} tone="primary">
          <FloppyDisk size={16} />
          저장
        </SmallBtn>
        <SmallBtn onClick={resetCue}>
          <ArrowCounterClockwise size={16} />
          이 큐 기본값
        </SmallBtn>
      </div>
      {dirty && <p className="mt-[6px] text-[11px] text-layout-gray-300">저장하지 않은 편집이 있어요. 접으면 사라져요.</p>}
      {cue === 'combo' && (
        <p className="mt-[4px] text-[11px] text-layout-gray-300">콤보 패턴은 콤보 수와 관계없이 저장한 패턴 하나가 모두에 적용돼요.</p>
      )}
    </div>
  );
};

export default HapticCueEditor;
