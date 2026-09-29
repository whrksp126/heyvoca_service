// src/components/script/IntroCard.jsx
//
// 글자 밭 세션 — ① 만나기 카드. 큰 글자 + 한글 근사 발음 + 로마자(또는 알파벳 이름·대표
// 소리·IPA) + 예시 단어. 등장 시 소리를 1회 자동 재생하고, 스피커를 탭하면 다시 듣는다.
// 채점 없음(정오답 집계에서 제외 — utils/scriptSession.js summarizeResults 참고).

import React, { useEffect } from 'react';
import SpeakerButton from '../common/SpeakerButton';
import { getTextSound } from '../../utils/common';
import { scriptTtsLang } from '../../utils/scriptData';

const IntroCard = ({ step }) => {
  "use memo";
  const { script, item } = step;
  const lang = scriptTtsLang(script);

  useEffect(() => {
    getTextSound(item.char, lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);

  const isAlphabet = script === 'alphabet';

  return (
    <div className="flex flex-col items-center gap-[18px] w-full pt-[10px]">
      <div className="flex items-center gap-[14px]">
        <span className="text-[64px] font-[700] leading-none text-layout-black dark:text-layout-white">
          {isAlphabet ? `${item.char}${item.lower}` : item.char}
        </span>
        <SpeakerButton text={item.char} lang={lang} size={26} />
      </div>

      {isAlphabet ? (
        <div className="flex flex-col items-center gap-[4px]">
          <span className="text-[16px] font-[700] text-layout-black dark:text-layout-white">
            {item.name_hangul}
          </span>
          <span className="text-[13px] font-[600] text-layout-gray-400">
            대표 소리 {item.sound_hangul} <span className="text-layout-gray-300">{item.ipa}</span>
          </span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-[4px]">
          <span className="text-[20px] font-[700] text-layout-black dark:text-layout-white">
            {item.hangul}
          </span>
          <span className="text-[13px] font-[600] text-layout-gray-400">로마자 {item.romaji}</span>
          {item.note && (
            <span className="max-w-[240px] text-[11.5px] text-center text-layout-gray-300">{item.note}</span>
          )}
        </div>
      )}

      {item.example && (
        <button
          type="button"
          onClick={() => getTextSound(item.example.word, lang)}
          className="
            flex flex-col items-center gap-[2px]
            mt-[6px] px-[18px] py-[10px] rounded-[12px]
            bg-layout-gray-50 dark:bg-layout-gray-dark
          "
        >
          <span className="text-[16px] font-[700] text-layout-black dark:text-layout-white">
            {item.example.word}
          </span>
          {item.example.reading && (
            <span className="text-[12px] font-[600] text-layout-gray-400">{item.example.reading}</span>
          )}
          <span className="text-[12.5px] text-layout-gray-400">{item.example.meaning}</span>
        </button>
      )}
    </div>
  );
};

export default IntroCard;
