import React, { useState, useEffect, useRef } from 'react';
import { CaretLeft, SpeakerHigh, Check, CircleNotch } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useUser } from '../../context/UserContext';
import { vibrate } from '../../utils/osFunction';
import { backendUrl, fetchDataAsync } from '../../utils/common';

// 학습 중 발음 음성(Edge 신경망)을 언어별로 고른다. 선택 시 샘플 즉시 재생.
const LANG_LABEL = { en: '영어', ko: '한국어' };
const LANG_ORDER = ['en', 'ko'];

const VoiceSettingsNewFullSheet = () => {
  "use memo";

  const { popNewFullSheet } = useNewFullSheetActions();
  const { isLogin } = useUser();

  const [options, setOptions] = useState({});   // { en: [{voice,label,sample_url}], ko: [...] }
  const [selected, setSelected] = useState({}); // { en, ko }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const opt = await fetchDataAsync(`${backendUrl}/tts/voice-options`, 'GET', {});
        const voices = opt?.data?.voices || {};
        const def = opt?.data?.default || {};
        setOptions(voices);

        let cur = {};
        if (isLogin) {
          const mine = await fetchDataAsync(`${backendUrl}/tts/my-voices`, 'GET', {});
          if (mine?.code === 200) cur = mine.data || {};
        } else {
          try { cur = JSON.parse(localStorage.getItem('ttsVoices') || '{}'); } catch (e) { cur = {}; }
        }
        const merged = { ...def, ...cur };
        setSelected(merged);
        // 진입만으로 localStorage를 서버 설정과 동기화(다른 기기에서 바꾼 경우 반영)
        try { localStorage.setItem('ttsVoices', JSON.stringify(merged)); } catch (e) { /* noop */ }
      } catch (e) {
        console.error('음성 설정 로드 실패:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
    return () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; } };
  }, [isLogin]);

  const playSample = (url) => {
    if (!url) return;
    if (audioRef.current) audioRef.current.pause();
    audioRef.current = new Audio(url);
    audioRef.current.play().catch(() => { /* 자동재생 차단 무시 */ });
  };

  const handleSelect = (lang, voice, sampleUrl) => {
    vibrate({ duration: 5 });
    setSelected((prev) => ({ ...prev, [lang]: voice }));
    playSample(sampleUrl);
  };

  const handleSave = async () => {
    vibrate({ duration: 5 });
    setSaving(true);
    try {
      // localStorage는 즉시 동기화(다음 TTS 재생부터 반영). 로그인 시 서버에도 저장.
      try { localStorage.setItem('ttsVoices', JSON.stringify(selected)); } catch (e) { /* noop */ }
      if (isLogin) {
        await fetchDataAsync(`${backendUrl}/tts/my-voices`, 'PUT', selected);
      }
      popNewFullSheet();
    } catch (e) {
      console.error('음성 설정 저장 실패:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      <div data-page-header className="relative flex items-center justify-between h-[55px] pt-[20px] px-[16px] pb-[14px]">
        <motion.button
          onClick={() => { vibrate({ duration: 5 }); popNewFullSheet(); }}
          className="text-layout-gray-200 dark:text-layout-white rounded-[8px]"
        >
          <CaretLeft size={24} />
        </motion.button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[18px] font-[700] text-layout-black dark:text-layout-white">음성 설정</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center items-center py-16">
            <CircleNotch className="animate-spin text-primary-main-500" size={32} />
          </div>
        ) : (
          <>
            <p className="px-5 pt-3 pb-1 text-[13px] text-[#999] dark:text-gray-400">
              학습 중 들리는 발음 음성을 언어별로 선택하세요. 목소리를 누르면 미리 들어볼 수 있어요.
            </p>
            {LANG_ORDER.map((lang) => (
              <div key={lang} className="mb-1">
                <div className="px-5 pt-4 pb-2 text-[14px] font-bold text-layout-black dark:text-layout-white">
                  {LANG_LABEL[lang]}
                </div>
                <ul className="m-0 p-0 list-none">
                  {(options[lang] || []).map((v) => {
                    const isSel = selected[lang] === v.voice;
                    return (
                      <li
                        key={v.voice}
                        onClick={() => handleSelect(lang, v.voice, v.sample_url)}
                        className={`flex items-center justify-between px-5 py-4 border-b border-border dark:border-border-dark cursor-pointer ${isSel ? 'bg-primary-main-50 dark:bg-primary-main-900/10' : ''}`}
                      >
                        <div className="flex items-center gap-2">
                          <SpeakerHigh weight={isSel ? 'fill' : 'regular'} className={`text-[20px] ${isSel ? 'text-primary-main-600' : 'text-[#bbb]'}`} />
                          <span className={`text-[15px] ${isSel ? 'font-bold text-primary-main-600' : 'text-layout-black dark:text-layout-white'}`}>{v.label}</span>
                        </div>
                        {isSel && <Check weight="bold" className="text-[18px] text-primary-main-600" />}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="px-5 py-4 border-t border-border dark:border-border-dark">
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="w-full py-3 rounded-[12px] bg-primary-main-600 text-white text-[16px] font-bold disabled:opacity-40"
        >
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>
    </div>
  );
};

export default VoiceSettingsNewFullSheet;
