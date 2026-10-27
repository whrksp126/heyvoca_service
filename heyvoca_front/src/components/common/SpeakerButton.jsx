import React, { useState } from 'react';

import { getTextSound } from '../../utils/common';
import { vibrate } from '../../utils/osFunction';
import SpeakerArt from './SpeakerArt';

/**
 * 단어/문장 발음 듣기 공용 스피커 버튼.
 * - 클릭: CSS active:scale 로 눌리는 인터랙션(+진동). idle 상태엔 transform을 두지 않아
 *   iOS WebView에서 fixed 오버레이(바텀시트) 위로 새어나오는 합성 버그를 방지한다.
 * - 재생 중: SpeakerArt 음파 출렁임(playing) + primary 색.
 *
 * @param {string} text  재생할 텍스트
 * @param {'en'|'ko'} lang
 * @param {number} size  아이콘 크기(px)
 * @param {string} className  추가 클래스
 * @param {string} label  접근성 라벨
 */
const SpeakerButton = ({ text, lang, size = 18, className = '', label = '발음 듣기' }) => {
  const [playing, setPlaying] = useState(false);

  const handleClick = async (e) => {
    e.stopPropagation();
    if (!text) return;
    vibrate({ duration: 5 });
    setPlaying(true);
    try {
      await getTextSound(text, lang);
    } finally {
      setPlaying(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`relative flex items-center justify-center shrink-0 transition-transform active:scale-90 ${playing ? 'text-primary-main-600' : 'text-layout-gray-300'} ${className}`}
      aria-label={label}
    >
      <SpeakerArt size={size} playing={playing} />
    </button>
  );
};

export default SpeakerButton;
