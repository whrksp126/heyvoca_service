import React, { useState, useEffect, useRef } from 'react';
import { SpeakerHigh, Check } from '@phosphor-icons/react';
import { useUser } from '../../context/UserContext';
import { vibrate } from '../../utils/osFunction';
import { backendUrl, fetchDataAsync } from '../../utils/common';
import { SheetBar, GroupLabel, Hint } from './settingsUi';

// 학습 발음 음성(Edge 신경망)을 언어별로 선택. 다른 설정 페이지와 동일하게 선택 즉시 반영.
const LANG_LABEL = { en: '영어', ko: '한국어' };
const LANG_ORDER = ['en', 'ko'];

const readJSON = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
};

// 서버 label 은 "에이리아 (미국·여)" 한 덩이다. 시안은 이름과 성별·지역을 두 줄로 나눈다.
const GENDER = { 여: '여성', 남: '남성' };
const splitLabel = (label = '') => {
  const m = label.match(/^(.*?)\s*\((.*)\)\s*$/);
  if (!m) return { name: label, sub: '' };
  const parts = m[2].split('·').map((s) => s.trim()).filter(Boolean);
  const gender = parts.filter((p) => GENDER[p]).map((p) => GENDER[p]);
  const rest = parts.filter((p) => !GENDER[p]);
  return { name: m[1], sub: [...gender, ...rest].join(' · ') };
};

/**
 * 음성 설정 — 듣고 고르는 순서 그대로 (시안 설정 8절).
 * 한 행이 [이름 · 성별/지역][스피커] … [체크박스] 다.
 * 스피커가 이름 바로 옆인 이유는 미리 듣는 대상이 그 목소리라는 걸 붙어 있어야 알기 때문이다.
 * 체크박스는 오른쪽 끝 — 다른 설정 화면의 토글과 같은 세로선 위에 온다.
 */
const VoiceSettingsNewFullSheet = () => {
  "use memo"; // React Compiler가 자동 최적화

  const { isLogin } = useUser();

  // localStorage 캐시 우선 → 즉시 렌더(로딩 없음). 마운트 후 백그라운드로 최신화.
  const cached = readJSON('ttsVoiceOptions', null);
  const [options, setOptions] = useState(cached?.voices || {});
  const [selected, setSelected] = useState(() => ({ ...(cached?.default || {}), ...readJSON('ttsVoices', {}) }));
  const [playingVoice, setPlayingVoice] = useState(null); // 미리듣기 재생 중인 voice
  const audioRef = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const vo = await fetchDataAsync(`${backendUrl}/tts/voice-options`, 'GET', {});
        if (alive && vo?.code === 200 && vo.data) {
          setOptions(vo.data.voices || {});
          localStorage.setItem('ttsVoiceOptions', JSON.stringify(vo.data));
        }
        let cur = readJSON('ttsVoices', {});
        if (isLogin) {
          const mine = await fetchDataAsync(`${backendUrl}/tts/my-voices`, 'GET', {});
          if (alive && mine?.code === 200 && mine.data) {
            cur = mine.data;
            localStorage.setItem('ttsVoices', JSON.stringify(cur));
          }
        }
        if (alive) setSelected({ ...(vo?.data?.default || {}), ...cur });
      } catch (e) { /* 캐시로 이미 렌더됨 */ }
    })();
    return () => {
      alive = false;
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    };
  }, [isLogin]);

  const playSample = async (lang, voice) => {
    try {
      const res = await fetchDataAsync(`${backendUrl}/tts/voice-sample`, 'GET', { language: lang, voice });
      const url = res?.data?.url;
      if (!url) return;
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(url);
      audioRef.current = audio;
      setPlayingVoice(voice);
      const clear = () => { if (audioRef.current === audio) setPlayingVoice(null); };
      audio.addEventListener('ended', clear);
      audio.addEventListener('error', clear);
      audio.play().catch(() => clear());
    } catch (e) { setPlayingVoice(null); }
  };

  // 고르면 바로 저장된다 — 저장 버튼이 없다(기존 음성 설정과 같다).
  const handleSelect = (lang, voice) => {
    vibrate({ duration: 5 });
    const next = { ...selected, [lang]: voice };
    setSelected(next);
    try { localStorage.setItem('ttsVoices', JSON.stringify(next)); } catch (e) { /* noop */ }
    if (isLogin) fetchDataAsync(`${backendUrl}/tts/my-voices`, 'PUT', next).catch(() => { /* noop */ });
  };

  return (
    <div className="flex flex-col h-full w-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      <SheetBar title="음성 설정" />

      <div className="flex-1 overflow-y-auto px-[16px] pb-[20px]">
        {LANG_ORDER.map((lang, langIdx) => (
          <div key={lang}>
            <GroupLabel first={langIdx === 0}>{LANG_LABEL[lang]}</GroupLabel>
            {(options[lang] || []).map((v, idx) => {
              const isSel = selected[lang] === v.voice;
              const isPlaying = playingVoice === v.voice;
              const { name, sub } = splitLabel(v.label);
              return (
                <div
                  key={v.voice}
                  onClick={() => handleSelect(lang, v.voice)}
                  className={`flex items-center gap-[10px] py-[11px] cursor-pointer ${
                    idx === 0 ? '' : 'border-t border-[#F4F4F4] dark:border-[rgba(255,255,255,.07)]'
                  }`}
                >
                  <span className="min-w-0 text-[14.5px] font-[700] tracking-[-0.03em] text-layout-black dark:text-layout-white">
                    {name}
                    {sub && (
                      <small className="block mt-[2px] text-[11px] font-[500] tracking-[-0.02em] text-layout-gray-300">
                        {sub}
                      </small>
                    )}
                  </span>
                  {/* 미리듣기 — 이름 바로 옆 */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); vibrate({ duration: 5 }); playSample(lang, v.voice); }}
                    className="relative shrink-0 grid place-items-center w-[30px] h-[30px] rounded-full bg-layout-gray-50 dark:bg-[#2A2A2A] active:scale-90 transition-transform"
                    aria-label="샘플 듣기"
                  >
                    {isPlaying && <span className="absolute inset-0 rounded-full bg-primary-main-500/20 animate-ping" />}
                    <SpeakerHigh
                      weight={isPlaying ? 'fill' : 'regular'}
                      size={15}
                      className={`relative ${isPlaying ? 'text-primary-main-500' : 'text-layout-gray-400'}`}
                    />
                  </button>
                  <span className="flex-1" />
                  {/* 선택 — 오른쪽 끝. 동작은 라디오지만 모양은 체크박스다 (시안 8절) */}
                  <span
                    className={`w-[22px] h-[22px] shrink-0 rounded-[7px] border-[1.5px] flex items-center justify-center ${
                      isSel
                        ? 'bg-primary-main-600 border-primary-main-600'
                        : 'border-layout-gray-100 dark:border-[#3A3A3A]'
                    }`}
                  >
                    {isSel && <Check weight="bold" size={12} className="text-layout-white" />}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
        <Hint className="mt-[14px]">고르면 바로 저장돼요 · 저장 버튼이 없어요</Hint>
      </div>
    </div>
  );
};

export default VoiceSettingsNewFullSheet;
