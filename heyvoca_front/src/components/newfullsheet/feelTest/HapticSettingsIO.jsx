import React, { useRef, useState } from 'react';
import { Copy, DownloadSimple, Trash } from '@phosphor-icons/react';
import {
  getHapticStrengthPercent, setHapticStrengthPercent, getHapticMode, setHapticMode,
  getHapticOffsetMs, setHapticOffsetMs, getOverrides, replaceOverrides, clearAllOverrides,
  sanitizeOverrides, validateForVariant, HAPTIC_MODES,
  getSfxTheme, setSfxTheme, getSfxVolumePercent, setSfxVolumePercent, SFX_THEMES,
} from '../../../lib/feel';

// 설정 내보내기/가져오기 — 전역 세기·재생 방식·오프셋·모든 오버라이드를 JSON 으로 주고받는다.
// 앱 WebView 에서 클립보드 복사가 막히면 아래 텍스트 상자를 길게 눌러 직접 복사할 수 있다.

const Btn = ({ onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex items-center justify-center gap-[4px] h-[36px] px-[12px] rounded-[10px] bg-layout-gray-50 dark:bg-layout-gray-dark text-[13px] font-[600] text-layout-black dark:text-layout-white"
  >
    {children}
  </button>
);

const HapticSettingsIO = ({ onChanged }) => {
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const areaRef = useRef(null);

  const buildJson = () => JSON.stringify({
    app: 'heyvoca-feel',
    v: 1,
    strengthPercent: getHapticStrengthPercent(),
    mode: getHapticMode(),
    hapticOffsetMs: getHapticOffsetMs(),
    sfxTheme: getSfxTheme(),
    sfxVolumePercent: getSfxVolumePercent(),
    overrides: getOverrides(),
  }, null, 1);

  const copyText = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (e) { /* 아래 폴백 */ }
    try {
      areaRef.current?.focus();
      areaRef.current?.select();
      return document.execCommand('copy');
    } catch (e) { return false; }
  };

  const doExport = async () => {
    const json = buildJson();
    setText(json);
    // 상태 갱신 뒤 textarea 가 값을 갖도록 한 틱 미룬다.
    setTimeout(async () => {
      const ok = await copyText(json);
      areaRef.current?.select();
      setStatus(ok ? '클립보드에 복사했어요. 개발자에게 붙여 넣어 전달해 주세요' : '복사가 안 돼요. 아래 텍스트를 길게 눌러 직접 복사해 주세요');
    }, 0);
  };

  const doImport = () => {
    let data;
    try { data = JSON.parse(text); } catch (e) { setStatus('JSON 형식이 올바르지 않아요'); return; }
    if (!data || typeof data !== 'object') { setStatus('JSON 형식이 올바르지 않아요'); return; }
    const parts = [];
    if (Number.isFinite(Number(data.strengthPercent))) { setHapticStrengthPercent(data.strengthPercent); parts.push('세기'); }
    if (HAPTIC_MODES.includes(data.mode)) { setHapticMode(data.mode); parts.push('재생 방식'); }
    if (Number.isFinite(Number(data.hapticOffsetMs))) { setHapticOffsetMs(data.hapticOffsetMs); parts.push('오프셋'); }
    if (SFX_THEMES.includes(data.sfxTheme)) { setSfxTheme(data.sfxTheme); parts.push('효과음 테마'); }
    if (Number.isFinite(Number(data.sfxVolumePercent))) { setSfxVolumePercent(data.sfxVolumePercent); parts.push('효과음 음량'); }
    let dropped = 0;
    if (data.overrides && typeof data.overrides === 'object') {
      const clean = sanitizeOverrides(data.overrides);
      Object.keys(clean).forEach((variant) => {
        Object.keys(clean[variant]).forEach((cue) => {
          if (validateForVariant(clean[variant][cue], variant).length) { delete clean[variant][cue]; dropped += 1; }
        });
        if (Object.keys(clean[variant]).length === 0) delete clean[variant];
      });
      replaceOverrides(clean);
      parts.push('패턴');
    }
    setStatus(`가져왔어요: ${parts.join(', ') || '적용할 항목 없음'}${dropped ? ` (규격 위반 ${dropped}개 제외)` : ''}`);
    onChanged?.();
  };

  const doClearAll = () => {
    clearAllOverrides();
    setStatus('모든 패턴 편집을 기본값으로 되돌렸어요');
    onChanged?.();
  };

  return (
    <div className="px-[20px] pb-[16px]">
      <div className="flex flex-wrap gap-[6px]">
        <Btn onClick={doExport}><Copy size={16} />설정 내보내기(복사)</Btn>
        <Btn onClick={doImport}><DownloadSimple size={16} />붙여넣은 설정 가져오기</Btn>
        <Btn onClick={doClearAll}><Trash size={16} />모든 패턴 기본값</Btn>
      </div>
      <textarea
        ref={areaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="내보내기를 누르면 여기에 설정이 표시돼요. 가져오려면 JSON 을 여기에 붙여 넣으세요."
        rows={8}
        className="mt-[8px] w-full rounded-[10px] bg-layout-gray-50 dark:bg-layout-gray-dark p-[10px] text-[11px] leading-[1.4] font-mono text-layout-black dark:text-layout-white"
      />
      {status && <p className="mt-[6px] text-[12px] text-primary-main-600">{status}</p>}
    </div>
  );
};

export default HapticSettingsIO;
