import React, { useState } from 'react';
import { SpeakerHigh } from '@phosphor-icons/react';
import { getTextSound } from '../../utils/common';
import { vibrate } from '../../utils/osFunction';
import TtsRipple from './TtsRipple';

/**
 * 단어/문장 발음 듣기 공용 스피커 버튼.
 * - 클릭: CSS active:scale 로 눌리는 인터랙션(+진동). idle 상태엔 transform을 두지 않아
 *   iOS WebView에서 fixed 오버레이(바텀시트) 위로 새어나오는 합성 버그를 방지한다.
 * - 재생 중: 테스트 듣기 카드와 동일한 ripple(파동) + primary 색/fill 아이콘.
 *
 * @param {string} text  재생할 텍스트
 * @param {'en'|'ko'} lang
 * @param {number} size  아이콘 크기(px)
 * @param {string} className  추가 클래스
 * @param {string} label  접근성 라벨
 */
const SpeakerButton = ({ text, lang, size = 18, className = '', label = '발음 듣기' }) => {
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(null);

  const handleClick = async (e) => {
    e.stopPropagation();
    if (!text) return;
    vibrate({ duration: 5 });
    setPlaying(true);
    setDuration(null);
    try {
      await getTextSound(text, lang, setDuration);
    } finally {
      setPlaying(false);
    }
  };

  const rippleEnd = size * 2.2;

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`relative flex items-center justify-center shrink-0 transition-transform active:scale-90 ${playing ? 'text-primary-main-600' : 'text-layout-gray-300'} ${className}`}
      aria-label={label}
    >
      {/* 재생 중 ripple(파동) — playing=false면 즉시 언마운트되어 잔상이 남지 않음 */}
      {playing && <TtsRipple size={rippleEnd} duration={duration} />}
      <SpeakerHigh size={size} weight={playing ? 'fill' : 'regular'} />
    </button>
  );
};

export default SpeakerButton;
