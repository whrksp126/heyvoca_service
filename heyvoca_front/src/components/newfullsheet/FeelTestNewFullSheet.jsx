import React, { useState, useEffect, lazy, Suspense } from 'react';
import { CaretLeft, CaretDown, CaretRight, HandTap, FilmSlate, Minus, Plus, ChartBar } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { parseAppVersion, getDevicePlatform } from '../../utils/osFunction';
import {
  feel, getFeelTimingSnapshot, getHapticOffsetMs, setHapticOffsetMs,
  SFX_DURATION_MS, getHapticPattern, validateForVariant,
  Pressable, haptic, KIND_TO_CUE, requestHapticCaps, resolveHapticVariant, getHapticCapsSource,
  getHapticStrengthPercent, setHapticStrengthPercent, getHapticMode, setHapticMode,
  STRENGTH_MIN, STRENGTH_MAX,
  SFX_THEMES, SFX_THEME_LABEL, SFX_VOLUME_MIN, SFX_VOLUME_MAX,
  getSfxTheme, setSfxTheme, getSfxVolumePercent, setSfxVolumePercent, preloadSfx,
} from '../../lib/feel';
import { ComboInterlude, PhaseInterlude, CompleteCut } from '../takeTest/StudyInterlude';

// 패턴 그래프 편집기·설정 입출력은 실험실 전용이라 학습 화면 번들에 넣지 않는다(lazy).
const HapticCueEditor = lazy(() => import('./feelTest/HapticCueEditor'));
const HapticSettingsIO = lazy(() => import('./feelTest/HapticSettingsIO'));

const MODE_OPTIONS = [
  { key: 'auto', label: '자동' },
  { key: 'waveform', label: 'waveform' },
  { key: 'prebaked', label: '프리베이크' },
];
const THEME_OPTIONS = SFX_THEMES.map((k) => ({ key: k, label: SFX_THEME_LABEL[k] }));
const AUTOPLAY_OPTIONS = [
  { key: 'both', label: '소리+진동' },
  { key: 'vibe', label: '진동만' },
  { key: 'off', label: '끔' },
];
const VARIANT_LABEL = { ios: 'iOS · Core Haptics', android: 'Android · 프리베이크 effect', 'android-waveform': 'Android · waveform(진폭 제어)' };

// 손맛 테스트(마이페이지 > 설정 > 실험실) — 모든 큐를 눌러 재생해 보고, 진동 오프셋(ms)으로
// 소리와 진동의 엇박을 실기기에서 직접 맞춘다. 맞춘 값을 알려 주면 lib/feel/cue.js 의
// FEEL_TIMING.PLATFORM_OFFSET_MS 상수에 반영한다. 오프셋은 이 기기 localStorage(feel.hapticOffsetMs)에 저장된다.
const CUE_LIST = [
  { cue: 'tap', label: '탭', desc: '짧은 나무 톡 + 가장 약한 tick' },
  { cue: 'select', label: '선택', desc: '가볍게 한 음 + click' },
  { cue: 'correct', label: '정답', desc: '상승 2음, tick 후 click' },
  { cue: 'wrong', label: '오답', desc: '낮은 2음 하강, heavyClick 1회' },
  { cue: 'match', label: '카드 짝 맞음', desc: '맑은 2음, tick 2회' },
  { cue: 'combo', n: 2, label: '콤보 2', desc: '콤보가 쌓일수록 펜타토닉 계단으로 음이 올라감(최대 한 옥타브)' },
  { cue: 'combo', n: 5, label: '콤보 5' },
  { cue: 'combo', n: 10, label: '콤보 10' },
  { cue: 'combo', n: 14, label: '콤보 14(상한)' },
  { cue: 'perfect', label: '완벽해요', desc: '상승 3음, tick tick click' },
  { cue: 'progress', label: '진행바 채움', desc: '아주 작게' },
  { cue: 'bonus', label: '보너스', desc: '통통 튀는 상승 4음' },
  { cue: 'complete', label: '완료', desc: '상승 4음 팡파르' },
];

// 기존 haptic(kind) 7종 — 앱 1.1.2+ 에서는 매핑된 큐의 진동만(소리 없음) 울린다.
const KIND_LIST = ['light', 'medium', 'heavy', 'success', 'warning', 'error', 'selection'];

const KIND_ITEMS = KIND_LIST.map((kind) => ({
  kind,
  cue: KIND_TO_CUE[kind],
  label: `haptic('${kind}')`,
  desc: `${KIND_TO_CUE[kind]} 큐로 매핑 (진동만, 소리 없음)`,
}));
const ALL_ITEMS = [...CUE_LIST, ...KIND_ITEMS];

const patternEnd = (events) => events.reduce((m, e) => Math.max(m, e.time + e.duration), 0);

const Row = ({ label, value }) => (
  <div className="flex items-start justify-between gap-[12px] py-[6px]">
    <span className="text-[13px] text-layout-gray-300">{label}</span>
    <span className="text-[13px] font-[600] text-layout-black dark:text-layout-white text-right break-all">{value}</span>
  </div>
);

const Section = ({ title, open, onToggle, right, children }) => (
  <section className="pt-[12px]">
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center justify-between w-full px-[20px] py-[8px] text-left"
      aria-expanded={open}
    >
      <span className="flex items-center gap-[6px] text-[14px] font-[700] text-layout-black dark:text-layout-white">
        {open ? <CaretDown size={16} weight="bold" /> : <CaretRight size={16} weight="bold" />}
        {title}
      </span>
      {right}
    </button>
    {open && children}
  </section>
);

const Seg = ({ options, value, onChange }) => (
  <div className="flex gap-[6px]">
    {options.map((o) => (
      <button
        key={o.key}
        type="button"
        onClick={() => onChange(o.key)}
        className={`flex-1 h-[36px] rounded-[10px] text-[13px] font-[600] ${
          value === o.key
            ? 'bg-primary-main-600 text-layout-white'
            : 'bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-black dark:text-layout-white'
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

const FeelTestNewFullSheet = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { popNewFullSheet } = useNewFullSheetActions();
  const [offset, setOffset] = useState(() => getHapticOffsetMs());
  const [snap, setSnap] = useState(() => getFeelTimingSnapshot());
  const [lastPlayed, setLastPlayed] = useState(null);
  // 학습 중 전체 화면 연출 미리 보기 — { kind: 'combo' | 'phase' | 'complete', n?, phase?, key }
  const [preview, setPreview] = useState(null);

  // undefined = 조회 중, null = 회신 없음(구버전 앱/웹)
  const [caps, setCaps] = useState(undefined);
  useEffect(() => {
    let alive = true;
    requestHapticCaps().then((v) => { if (alive) setCaps(v); });
    return () => { alive = false; };
  }, []);

  const [open, setOpen] = useState({ strength: true, cues: true });
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const [strength, setStrength] = useState(() => getHapticStrengthPercent());
  const [mode, setMode] = useState(() => getHapticMode());
  const [theme, setTheme] = useState(() => getSfxTheme());
  const [sfxVol, setSfxVol] = useState(() => getSfxVolumePercent());
  const [autoPlay, setAutoPlay] = useState('both');
  const [editing, setEditing] = useState(null); // 펼친 큐 키
  const [editVersion, setEditVersion] = useState(0); // 가져오기/전체 초기화 후 편집기를 다시 불러온다

  // 지금 쓰는 재생 방식(플랫폼 + 자동/강제). mode 는 렌더 갱신용으로 읽는다.
  const variant = mode ? resolveHapticVariant(caps) : 'ios';
  const appInfo = parseAppVersion();

  const play = (item) => {
    // 오디오 컨텍스트는 첫 탭에서 만들어지므로 재생 뒤에 측정값을 갱신한다.
    // 편집기의 '소리+진동' 버튼과 같은 경로(feel + force) — 추가 탭 햅틱 없음
    if (item.kind) { haptic(item.kind); setLastPlayed(`haptic('${item.kind}') → ${KIND_TO_CUE[item.kind]}`); setSnap(getFeelTimingSnapshot()); return; }
    feel(item.cue, { n: item.n, force: true });
    setLastPlayed(`${item.label}`);
    setSnap(getFeelTimingSnapshot());
  };

  const changeStrength = (value) => {
    setStrength(setHapticStrengthPercent(value));
  };
  // 세기를 바꾼 직후 느껴 보게 — 진동만, 선택 큐(디바운스 무시)
  const feelStrength = () => feel('select', { sound: false, force: true });

  const changeTheme = (t) => {
    const v = setSfxTheme(t);
    setTheme(v);
    // 바꾸면 즉시 프리로드한 뒤 정답 큐를 한 번 들려준다(디코드 전이어도 playSfx 가 준비되는 즉시 재생).
    preloadSfx(v).finally(() => feel('correct', { sound: true, vibe: false, force: true }));
  };
  const changeSfxVol = (value) => setSfxVol(setSfxVolumePercent(value));
  const hearSfxVol = () => feel('correct', { vibe: false, force: true });

  const changeMode = (m) => {
    setMode(setHapticMode(m));
    setEditVersion((v) => v + 1);
  };

  const changeOffset = (value) => {
    const v = setHapticOffsetMs(value);
    setOffset(v);
    setSnap(getFeelTimingSnapshot());
  };

  const totalDelay = Math.round(
    snap.leadMs + snap.outputLatencyMs - snap.bridgeMs + snap.platformOffsetMs + snap.userOffsetMs,
  );

  return (
    <div className="flex flex-col h-full w-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      <div
        data-page-header
        className="relative flex items-center justify-between h-[55px] pt-[20px] px-[16px] pb-[14px] border-b border-[#ddd]"
      >
        <motion.button
          onClick={() => { feel('tap'); popNewFullSheet(); }}
          className="text-layout-gray-200 dark:text-layout-white rounded-[8px]"
          whileTap={{ scale: 0.95, backgroundColor: 'rgba(0, 0, 0, 0.1)' }}
          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        >
          <CaretLeft size={24} />
        </motion.button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[18px] font-[700] text-layout-black dark:text-layout-white">
          손맛 테스트
        </h1>
        <div className="w-[24px]" />
      </div>

      <div className="flex-1 overflow-y-auto pb-[40px]">
        {/* 진동 세기 · 재생 방식 */}
        <Section
          title="진동 세기 · 재생 방식"
          open={open.strength}
          onToggle={() => toggle('strength')}
          right={<span className="text-[14px] font-[700] text-primary-main-600">{strength}%</span>}
        >
          <div className="px-[20px] pb-[8px]">
            <div className="flex items-center gap-[6px]">
              <button
                type="button"
                onClick={() => { changeStrength(strength - 1); feelStrength(); }}
                className="flex items-center justify-center w-[40px] h-[40px] rounded-[10px] bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-black dark:text-layout-white shrink-0"
                aria-label="진동 세기 1% 줄이기"
              >
                <Minus size={18} weight="bold" />
              </button>
              <input
                type="range"
                min={STRENGTH_MIN}
                max={STRENGTH_MAX}
                step={1}
                value={strength}
                onChange={(e) => changeStrength(e.target.value)}
                onPointerUp={feelStrength}
                onKeyUp={feelStrength}
                className="flex-1 min-w-0 accent-primary-main-600"
                aria-label="진동 세기(%)"
              />
              <button
                type="button"
                onClick={() => { changeStrength(strength + 1); feelStrength(); }}
                className="flex items-center justify-center w-[40px] h-[40px] rounded-[10px] bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-black dark:text-layout-white shrink-0"
                aria-label="진동 세기 1% 늘리기"
              >
                <Plus size={18} weight="bold" />
              </button>
            </div>
            <div className="flex items-center justify-between text-[11px] text-layout-gray-300">
              <span>0% (아주 약하게)</span>
              <span>200% (아주 강하게)</span>
            </div>
            <p className="mt-[6px] text-[12px] leading-[1.5] text-layout-gray-300">
              모든 큐의 세기에 곱해요(결과는 1~100%로 제한). 슬라이더를 놓거나 ± 를 누르면 진동만 한 번 울려요.
              프리베이크 방식은 세기를 바꿀 수 없어요.
            </p>
            <Pressable
              onClick={() => { changeStrength(100); feelStrength(); }}
              className="mt-[6px] h-[36px] px-[14px] rounded-[10px] bg-layout-gray-50 dark:bg-layout-gray-dark text-[13px] font-[600] text-layout-black dark:text-layout-white"
            >
              100%로 되돌리기
            </Pressable>

            <h3 className="mt-[16px] mb-[6px] text-[13px] font-[700] text-layout-black dark:text-layout-white">재생 방식 (Android)</h3>
            <Seg options={MODE_OPTIONS} value={mode} onChange={changeMode} />
            <p className="mt-[6px] text-[12px] leading-[1.5] text-layout-gray-300">
              자동은 진폭 제어가 되는 기기면 waveform, 아니면 프리베이크예요. 지금 쓰는 방식: <span className="font-[700]">{VARIANT_LABEL[variant]}</span>
              {getDevicePlatform() !== 'android' && ' (Android 가 아니면 이 선택은 무시돼요)'}
            </p>

            <h3 className="mt-[16px] mb-[6px] text-[13px] font-[700] text-layout-black dark:text-layout-white">패턴 편집 후 손을 뗄 때 자동 재생</h3>
            <Seg options={AUTOPLAY_OPTIONS} value={autoPlay} onChange={setAutoPlay} />
          </div>
        </Section>

        {/* 효과음 테마 · 음량 */}
        <Section
          title="효과음 테마 · 음량"
          open={!!open.sfx}
          onToggle={() => toggle('sfx')}
          right={<span className="text-[14px] font-[700] text-primary-main-600">{SFX_THEME_LABEL[theme]} · {sfxVol}%</span>}
        >
          <div className="px-[20px] pb-[8px]">
            <Seg options={THEME_OPTIONS} value={theme} onChange={changeTheme} />
            <p className="mt-[6px] text-[12px] leading-[1.5] text-layout-gray-300">
              마림바·칼림바는 실제 악기 녹음이고, 합성은 예전 코드 합성음이에요. 바꾸면 정답 소리를 한 번 들려줘요.
            </p>
            <h3 className="mt-[12px] mb-[6px] text-[13px] font-[700] text-layout-black dark:text-layout-white">효과음 음량</h3>
            <input
              type="range"
              min={SFX_VOLUME_MIN}
              max={SFX_VOLUME_MAX}
              step={1}
              value={sfxVol}
              onChange={(e) => changeSfxVol(e.target.value)}
              onPointerUp={hearSfxVol}
              onKeyUp={hearSfxVol}
              className="w-full accent-primary-main-600"
              aria-label="효과음 음량(%)"
            />
            <div className="flex items-center justify-between text-[11px] text-layout-gray-300">
              <span>0%</span>
              <span>150%</span>
            </div>
          </div>
        </Section>

        {/* 큐 재생 + 패턴 편집 */}
        <Section title="큐 재생 · 패턴 편집" open={open.cues} onToggle={() => toggle('cues')}>
          <p className="px-[20px] pb-[6px] text-[12px] leading-[1.5] text-layout-gray-300">
            행을 누르면 재생, 오른쪽 그래프 버튼을 누르면 패턴 그래프 편집기가 펼쳐져요. 편집 대상은 현재 재생 방식({VARIANT_LABEL[variant]})이에요.
          </p>
          <ul className="w-full m-0 p-0 list-none">
            {ALL_ITEMS.map((item) => {
              const rowKey = `${item.kind ? `kind-${item.kind}-` : ''}${item.cue}-${item.n ?? ''}`;
              const events = getHapticPattern(item.cue, { n: item.n, platform: variant });
              const errs = events ? validateForVariant(events, variant) : [];
              const isOpen = editing === rowKey;
              return (
                <li key={rowKey} className="border-b border-[#ddd] dark:border-border-dark">
                  <div className="flex items-center">
                    <Pressable
                      hapticKind={null}
                      onClick={() => play(item)}
                      className="flex flex-1 min-w-0 items-center justify-between pl-[20px] pr-[8px] py-[14px] text-left"
                    >
                      <span className="flex items-center gap-[12px] pr-[12px]">
                        <HandTap weight="fill" className="text-[20px] text-primary-main-600 shrink-0" />
                        <span className="flex flex-col gap-[2px]">
                          <span className="text-[15px] font-[700] text-layout-black dark:text-layout-white">
                            {item.label} <span className="text-[12px] font-[500] text-layout-gray-300">{item.cue}</span>
                          </span>
                          {item.desc && <span className="text-[12px] text-layout-gray-300 leading-tight">{item.desc}</span>}
                        </span>
                      </span>
                      <span className="flex flex-col items-end shrink-0 text-[11px] text-layout-gray-300">
                        <span>소리 {SFX_DURATION_MS[item.cue]}ms</span>
                        <span>진동 {events ? `${patternEnd(events)}ms` : '없음'}</span>
                        <span className={errs.length ? 'text-status-error-600' : ''}>{!events ? '-' : errs.length ? `규격 위반 ${errs.length}` : '규격 OK'}</span>
                      </span>
                    </Pressable>
                    <button
                      type="button"
                      onClick={() => setEditing(isOpen ? null : rowKey)}
                      className={`flex items-center justify-center w-[44px] h-[44px] mr-[12px] rounded-[10px] shrink-0 ${
                        isOpen ? 'bg-primary-main-600 text-layout-white' : 'bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-black dark:text-layout-white'
                      }`}
                      aria-label={`${item.label} 패턴 편집`}
                      aria-expanded={isOpen}
                    >
                      <ChartBar size={20} />
                    </button>
                  </div>
                  {isOpen && (
                    <Suspense fallback={<p className="px-[20px] pb-[12px] text-[12px] text-layout-gray-300">편집기 불러오는 중</p>}>
                      <HapticCueEditor
                        key={`${variant}-${rowKey}-${editVersion}`}
                        cue={item.cue}
                        n={item.n}
                        variant={variant}
                        autoPlay={autoPlay}
                      />
                    </Suspense>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>

        {/* 설정 내보내기 / 가져오기 */}
        <Section title="설정 내보내기 · 가져오기" open={!!open.io} onToggle={() => toggle('io')}>
          <p className="px-[20px] pb-[6px] text-[12px] leading-[1.5] text-layout-gray-300">
            전역 세기·재생 방식·오프셋·효과음 테마·음량·편집한 모든 패턴을 JSON 으로 복사해 개발자에게 전달하면 기본값으로 반영할 수 있어요.
          </p>
          <Suspense fallback={null}>
            <HapticSettingsIO
              onChanged={() => {
                setStrength(getHapticStrengthPercent());
                setMode(getHapticMode());
                setTheme(getSfxTheme());
                setSfxVol(getSfxVolumePercent());
                setOffset(getHapticOffsetMs());
                setSnap(getFeelTimingSnapshot());
                setEditVersion((v) => v + 1);
              }}
            />
          </Suspense>
        </Section>

        {/* 현재 측정값 */}
        <Section title="현재 측정값" open={!!open.snap} onToggle={() => toggle('snap')}>
          <div className="mx-[20px] rounded-[12px] bg-layout-gray-50 dark:bg-layout-gray-dark px-[16px] py-[8px]">
            <Row label="플랫폼" value={`${snap.platform}${appInfo ? ` · 앱 ${appInfo.version}${appInfo.build ? ` (${appInfo.build})` : ''}` : ' · 앱 아님(웹)'}`} />
            <Row label="진동 패턴 지원" value={snap.patternSupported ? '예 (haptic_pattern, 앱 1.1.2+)' : '아니오 (기존 진동/웹 폴백)'} />
            <Row
              label="진동 능력(haptic_caps)"
              value={caps === undefined ? '조회 중' : caps === null ? '회신 없음 (웹 또는 앱 미지원)'
                : `${caps.platform} · API ${caps.apiLevel} · 진폭제어 ${caps.hasAmplitudeControl ? '예' : '아니오'} · 프리베이크 ${caps.supportsPrebaked ? '예' : '아니오'}`}
            />
            <Row label="재생 방식" value={VARIANT_LABEL[variant]} />
            <Row
              label="변형·caps 출처"
              value={`${variant} · ${{ persisted: '영속(저장값)', live: '실시간', unknown: '미확인(기본 waveform)' }[getHapticCapsSource()]}`}
            />
            <Row label="오디오 출력 지연" value={`${snap.outputLatencyMs.toFixed(1)}ms · ${snap.outputLatencySource}`} />
            <Row label="오디오 리드" value={`${snap.leadMs}ms`} />
            <Row label="브릿지 지연 추정" value={`${snap.bridgeMs}ms`} />
            <Row label="플랫폼 보정(상수)" value={`${snap.platformOffsetMs}ms`} />
            <Row label="사용자 오프셋" value={`${snap.userOffsetMs}ms`} />
            <Row label="진동 지연 합계" value={`${totalDelay}ms${totalDelay < 0 ? ' (음수 → 소리를 늦춤)' : ''}`} />
            {lastPlayed && <Row label="마지막 재생" value={lastPlayed} />}
          </div>
        </Section>

        {/* 전체 화면 연출 미리 보기 */}
        <Section title="전체 화면 연출 미리 보기" open={!!open.preview} onToggle={() => toggle('preview')}>
          <div className="px-[20px]">
            <div className="grid grid-cols-2 gap-[8px]">
              {[
                { label: '콤보 10', preview: { kind: 'combo', n: 10 } },
                { label: '콤보 20', preview: { kind: 'combo', n: 20 } },
                { label: '실전 문장', preview: { kind: 'phase', phase: 'sentence' } },
                { label: '오답 복습', preview: { kind: 'phase', phase: 'retry' } },
                { label: '학습 완료', preview: { kind: 'complete' } },
              ].map((b) => (
                <Pressable
                  key={b.label}
                  onClick={() => setPreview({ ...b.preview, key: Date.now() })}
                  className="flex items-center justify-center gap-[6px] h-[44px] rounded-[10px] bg-layout-gray-50 dark:bg-layout-gray-dark text-[14px] font-[600] text-layout-black dark:text-layout-white"
                >
                  <FilmSlate weight="fill" className="text-[18px] text-primary-main-600" />
                  {b.label}
                </Pressable>
              ))}
            </div>
            <p className="mt-[8px] text-[12px] leading-[1.5] text-layout-gray-300">
              콤보는 1.6초, 구간 안내는 1.5초, 학습 완료는 1.2초 뒤 자동으로 닫히고 탭하면 바로 닫혀요. 소리·진동은 실제 학습과 같은 큐(bonus·select·complete)를 써요.
            </p>
          </div>
        </Section>

        {/* 오프셋 슬라이더 */}
        <Section
          title="진동 오프셋"
          open={!!open.offset}
          onToggle={() => toggle('offset')}
          right={<span className="text-[14px] font-[700] text-primary-main-600">{offset > 0 ? `+${offset}` : offset}ms</span>}
        >
          <div className="px-[20px]">
            <input
              type="range"
              min={-100}
              max={200}
              step={1}
              value={offset}
              onChange={(e) => changeOffset(e.target.value)}
              className="w-full accent-primary-main-600"
              aria-label="진동 오프셋(ms)"
            />
            <div className="flex items-center justify-between text-[11px] text-layout-gray-300">
              <span>-100 (진동이 먼저)</span>
              <span>+200 (진동이 늦게)</span>
            </div>
            <p className="mt-[8px] text-[12px] leading-[1.5] text-layout-gray-300">
              진동이 소리보다 늦게 느껴지면 값을 낮추고, 먼저 느껴지면 높여요. 정답 큐를 반복해 눌러 가며 맞춘 값을 개발자에게 알려 주세요.
            </p>
            <Pressable
              onClick={() => changeOffset(0)}
              className="mt-[8px] h-[36px] px-[14px] rounded-[10px] bg-layout-gray-50 dark:bg-layout-gray-dark text-[13px] font-[600] text-layout-black dark:text-layout-white"
            >
              0으로 되돌리기
            </Pressable>
          </div>
        </Section>
      </div>

      {preview?.kind === 'combo' && (
        <ComboInterlude key={preview.key} n={preview.n} milestone={preview.n} onDone={() => setPreview(null)} />
      )}
      {preview?.kind === 'phase' && (
        <PhaseInterlude key={preview.key} kind={preview.phase} onDone={() => setPreview(null)} />
      )}
      {preview?.kind === 'complete' && (
        <CompleteCut key={preview.key} label="학습 완료" onDone={() => setPreview(null)} />
      )}
    </div>
  );
};

export default FeelTestNewFullSheet;
