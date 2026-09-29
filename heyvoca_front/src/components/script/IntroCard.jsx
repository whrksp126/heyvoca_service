// src/components/script/IntroCard.jsx
//
// 글자 밭 세션 — ① 만나기 카드. 새 씨앗 심기 단어 카드(components/study/WordMeetCard.jsx)와
// 같은 톤으로 **왼쪽 정렬**해 정보 밀도를 준다 — 큰 글자(좌) + 한글 발음(크게)·로마자(작게)
// 세로 묶음 + 스피커(우), 구분선 아래 예시 단어(단어·읽기·뜻 + 스피커), 그 아래 헷갈리는
// 글자 비교(confusables를 글자+한글 발음 작은 타일로, 탭하면 소리). 획순 정보는 여기서
// 다루지 않는다(따라 쓰기 슬라이드의 몫). 등장 시 소리를 1회 자동 재생하고, 각 스피커를
// 탭하면 다시 듣는다. 채점 없음 — 학습하기(TakeTest)에서는 이 화면을 plugins/questionTypes/
// script/ScriptIntroQuestion.jsx가 감싸 쓰고, questionType='scriptIntro'는
// NO_GRADE_QUESTION_TYPES(plugins/questionTypes/index.js)라 정오답 집계에서 제외된다.

import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { SpeakerHigh } from '@phosphor-icons/react';
import SpeakerButton from '../common/SpeakerButton';
import { haptic } from '../../lib/feel';
import { speakScriptItem, speakScriptText, scriptTtsLang } from '../../utils/scriptData';

const IntroCard = ({ step, onNext }) => {
  "use memo";
  const { script, item, confusables = [] } = step;
  const lang = scriptTtsLang(script);
  const isAlphabet = script === 'alphabet';

  useEffect(() => {
    speakScriptItem(script, item);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);

  const mainReading = isAlphabet ? item.name_hangul : item.hangul;
  const subReading = isAlphabet
    ? [item.sound_hangul, item.ipa].filter(Boolean).join(' ')
    : item.romaji;

  const playConfusable = (c) => {
    haptic('light');
    speakScriptItem(script, c);
  };

  return (
    <div className="flex flex-col gap-[14px] w-full h-full">
      <div className="flex-1 min-h-0 overflow-y-auto bg-layout-gray-50 dark:bg-layout-gray-dark rounded-[12px]">
        <div className="flex flex-col gap-[18px] p-[20px]">
          {/* 글자 + 한글 발음/로마자 + 스피커 — 왼쪽 정렬 */}
          <div className="flex items-center justify-between gap-[12px]">
            <div className="flex items-center gap-[14px] min-w-0">
              <span className="flex-shrink-0 text-[60px] font-[700] leading-none text-layout-black dark:text-layout-white">
                {isAlphabet ? `${item.char}${item.lower}` : item.char}
              </span>
              <div className="flex flex-col gap-[3px] min-w-0">
                <span className="text-[21px] font-[800] leading-[24px] text-layout-black dark:text-layout-white truncate">
                  {mainReading}
                </span>
                {subReading && (
                  <span className="text-[12.5px] font-[600] leading-[15px] text-layout-gray-300 truncate">
                    {subReading}
                  </span>
                )}
              </div>
            </div>
            <SpeakerButton text={item.speak || item.char} lang={lang} size={26} className="flex-shrink-0" />
          </div>

          <div className="h-[1px] bg-border dark:bg-border-dark" />

          {/* 예시 단어 — 단어 · 읽기 · 뜻 + 스피커 */}
          {item.example && (
            <div className="flex items-center justify-between gap-[10px]">
              <div className="flex flex-col gap-[2px] min-w-0">
                <span className="text-[16px] font-[700] text-layout-black dark:text-layout-white truncate">
                  {item.example.word}
                </span>
                {item.example.reading && (
                  <span className="text-[12px] font-[600] text-layout-gray-400">{item.example.reading}</span>
                )}
                <span className="text-[13px] text-layout-gray-400">{item.example.meaning}</span>
              </div>
              <button
                type="button"
                onClick={() => { haptic('light'); speakScriptText(script, item.example.word); }}
                className="flex-shrink-0 flex items-center justify-center w-[34px] h-[34px] rounded-full bg-layout-white dark:bg-layout-black border border-border dark:border-border-dark text-layout-gray-300"
              >
                <SpeakerHigh size={16} weight="fill" />
              </button>
            </div>
          )}

          {/* 헷갈리는 글자 비교 */}
          {confusables.length > 0 && (
            <div className="flex flex-col gap-[8px]">
              <span className="text-[12px] font-[700] text-layout-gray-400">헷갈리는 글자</span>
              <div className="flex flex-wrap gap-[8px]">
                {confusables.map((c) => (
                  <motion.button
                    key={c.char}
                    type="button"
                    onClick={() => playConfusable(c)}
                    whileTap={{ scale: 0.94 }}
                    className="flex flex-col items-center gap-[2px] px-[14px] py-[9px] rounded-[10px] bg-layout-white dark:bg-layout-black border border-border dark:border-border-dark"
                  >
                    <span className="text-[20px] font-[700] leading-none text-layout-black dark:text-layout-white">
                      {c.char}
                    </span>
                    <span className="text-[11px] font-[600] leading-none text-layout-gray-300">
                      {isAlphabet ? c.name_hangul : c.hangul}
                    </span>
                  </motion.button>
                ))}
              </div>
            </div>
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
