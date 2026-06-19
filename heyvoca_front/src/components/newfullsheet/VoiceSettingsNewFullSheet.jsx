import React, { useState, useEffect, useRef } from 'react';
import { CaretLeft, SpeakerHigh, Check } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useUser } from '../../context/UserContext';
import { vibrate } from '../../utils/osFunction';
import { backendUrl, fetchDataAsync } from '../../utils/common';

// 학습 발음 음성(Edge 신경망)을 언어별로 선택. 다른 설정 페이지와 동일하게 선택 즉시 반영.
const LANG_LABEL = { en: '영어', ko: '한국어' };
const LANG_ORDER = ['en', 'ko'];

const readJSON = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
};

const VoiceSettingsNewFullSheet = () => {
  "use memo"; // React Compiler가 자동 최적화

  const { popNewFullSheet } = useNewFullSheetActions();
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

  // 선택 즉시 반영(저장 버튼 없음 — 테마/알림 설정과 동일 패턴). 미리듣기는 우측 스피커 버튼으로 분리.
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
      {/* Header — 다른 설정 페이지와 동일 */}
      <div
        data-page-header
        className="relative flex items-center justify-between h-[55px] pt-[20px] px-[16px] pb-[14px] border-b border-[#ddd] bg-layout-white dark:bg-layout-black"
      >
        <div className="flex items-center gap-[4px]">
          <motion.button
            onClick={() => { vibrate({ duration: 5 }); popNewFullSheet(); }}
            className="text-layout-gray-200 dark:text-layout-white rounded-[8px]"
            whileHover={{ backgroundColor: 'rgba(0, 0, 0, 0.05)', scale: 1.05 }}
            whileTap={{ scale: 0.95, backgroundColor: 'rgba(0, 0, 0, 0.1)' }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
          >
            <CaretLeft size={24} />
          </motion.button>
        </div>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[18px] font-[700] text-layout-black dark:text-layout-white">
          음성 설정
        </h1>
        <div className="flex items-center gap-[8px] text-layout-gray-200 dark:text-layout-white"></div>
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 overflow-y-auto">
        <p className="px-5 pt-4 pb-1 text-[13px] text-layout-gray-200 dark:text-layout-gray-300 leading-tight">
          학습 중 들리는 발음 음성을 언어별로 선택하세요. 목소리를 누르면 미리 들어볼 수 있어요.
        </p>
        {LANG_ORDER.map((lang) => (
          <div key={lang}>
            <div className="px-5 pt-4 pb-2 text-[13px] font-bold text-layout-gray-200 dark:text-layout-gray-300">
              {LANG_LABEL[lang]}
            </div>
            {(options[lang] || []).map((v) => {
              const isSel = selected[lang] === v.voice;
              const isPlaying = playingVoice === v.voice;
              return (
                <div
                  key={v.voice}
                  onClick={() => handleSelect(lang, v.voice)}
                  className="flex items-center justify-between px-5 py-3.5 border-b border-border dark:border-border-dark cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    {/* 좌측: 선택 여부(체크). 고정폭으로 라벨 정렬 유지 */}
                    <span className="w-5 shrink-0 flex justify-center">
                      {isSel && <Check weight="bold" size={20} className="text-primary-main-600" />}
                    </span>
                    <span className={`text-[16px] font-bold ${isSel ? 'text-primary-main-600' : 'text-layout-black dark:text-layout-white'}`}>
                      {v.label}
                    </span>
                  </div>
                  {/* 우측: 샘플 듣기 버튼(선택과 분리). 재생 중엔 음파(ping) 효과 */}
                  <button
                    onClick={(e) => { e.stopPropagation(); vibrate({ duration: 5 }); playSample(lang, v.voice); }}
                    className="relative shrink-0 grid place-items-center w-9 h-9 rounded-full active:scale-90 transition-transform"
                    aria-label="샘플 듣기"
                  >
                    {isPlaying && (
                      <>
                        <span className="absolute inset-0 rounded-full bg-primary-main-500/20 animate-ping" />
                        <span className="absolute inset-0 rounded-full bg-primary-main-500/15" />
                      </>
                    )}
                    <SpeakerHigh
                      weight={isPlaying ? 'fill' : 'regular'}
                      className={`relative text-[22px] ${isPlaying ? 'text-primary-main-500' : 'text-layout-gray-200 dark:text-layout-gray-300'}`}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default VoiceSettingsNewFullSheet;
