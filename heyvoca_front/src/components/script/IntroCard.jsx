// src/components/script/IntroCard.jsx
//
// 글자 밭 세션 — ① 만나기 카드. 심기 세션의 WordMeetCard 톤(둥근 회색 카드 안에 큰 글자·
// 스피커·보조 정보를 세로로 넉넉하게 배치)을 따른다 — 큰 글자 + 한글 근사 발음 + 로마자
// (또는 알파벳 이름·대표 소리·IPA) + 예시 단어. 등장 시 소리를 1회 자동 재생하고, 스피커를
// 탭하면 다시 듣는다. 채점 없음(정오답 집계에서 제외 — utils/scriptSession.js
// summarizeResults 참고). 하단 "다음" CTA는 WordIntroQuestion(plugins/questionTypes)과
// 같은 전폭 규격(h-52 rounded-12)을 그대로 쓴다 — 이 컴포넌트가 카드+버튼을 함께 그려
// 화면이 위로 몰리지 않고 세로 전체를 채운다.

import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import SpeakerButton from '../common/SpeakerButton';
import { speakScriptItem, speakScriptText, scriptTtsLang } from '../../utils/scriptData';

const IntroCard = ({ step, onNext }) => {
  "use memo";
  const { script, item } = step;
  const lang = scriptTtsLang(script);

  useEffect(() => {
    speakScriptItem(script, item);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);

  const isAlphabet = script === 'alphabet';

  return (
    <div className="flex flex-col gap-[14px] w-full h-full">
      <div className="flex-1 min-h-0 overflow-y-auto bg-layout-gray-50 dark:bg-layout-gray-dark rounded-[12px]">
        <div className="flex flex-col items-center justify-center gap-[22px] min-h-full p-[24px]">
          <div className="flex items-center gap-[14px]">
            <span className="text-[72px] font-[700] leading-none text-layout-black dark:text-layout-white">
              {isAlphabet ? `${item.char}${item.lower}` : item.char}
            </span>
            <SpeakerButton text={item.speak || item.char} lang={lang} size={28} />
          </div>

          {isAlphabet ? (
            <div className="flex flex-col items-center gap-[4px]">
              <span className="text-[17px] font-[700] text-layout-black dark:text-layout-white">
                {item.name_hangul}
              </span>
              <span className="text-[13.5px] font-[600] text-layout-gray-400">
                대표 소리 {item.sound_hangul} <span className="text-layout-gray-300">{item.ipa}</span>
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-[4px]">
              <span className="text-[21px] font-[700] text-layout-black dark:text-layout-white">
                {item.hangul}
              </span>
              <span className="text-[13.5px] font-[600] text-layout-gray-400">로마자 {item.romaji}</span>
              {item.note && (
                <span className="max-w-[260px] text-[12px] text-center text-layout-gray-300">{item.note}</span>
              )}
            </div>
          )}

          {item.example && (
            <button
              type="button"
              onClick={() => speakScriptText(script, item.example.word)}
              className="
                flex flex-col items-center gap-[2px]
                mt-[6px] px-[20px] py-[12px] rounded-[12px]
                bg-layout-white dark:bg-layout-black
                border border-border dark:border-border-dark
              "
            >
              <span className="text-[17px] font-[700] text-layout-black dark:text-layout-white">
                {item.example.word}
              </span>
              {item.example.reading && (
                <span className="text-[12px] font-[600] text-layout-gray-400">{item.example.reading}</span>
              )}
              <span className="text-[13px] text-layout-gray-400">{item.example.meaning}</span>
            </button>
          )}
        </div>
      </div>

      <motion.button
        type="button"
        onClick={onNext}
        className="flex-shrink-0 h-[52px] rounded-[12px] text-[16px] font-[700] tracking-[-0.03em] bg-primary-main-600 text-layout-white"
        whileTap={{ scale: 0.97 }}
      >
        다음
      </motion.button>
    </div>
  );
};

export default IntroCard;
