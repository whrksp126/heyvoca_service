// src/components/script/ChoiceCard.jsx
//
// 글자 밭 세션 — 사지선다 카드 두 종류를 한 컴포넌트로 그린다.
//   seePick    — 글자를 보고 소리(한글 발음·로마자)를 고른다.
//   listenPick — 소리를 듣고 글자를 고른다(혼동쌍 포함).
// 정오답 스타일은 TakeTest Main.jsx의 선택지 버튼 규격을 그대로 따른다.

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { SpeakerHigh } from '@phosphor-icons/react';
import { haptic } from '../../lib/feel';
import { getTextSound } from '../../utils/common';
import ResultMark from '../common/ResultMark';
import TtsRipple from '../common/TtsRipple';
import { optionLabel } from '../../utils/scriptSession';
import { scriptTtsLang } from '../../utils/scriptData';

const ChoiceCard = ({ step, answered, selectedIndex, onSelect }) => {
  "use memo";

  const { script, item, options, answerIndex, type } = step;
  const isListen = type === 'listenPick';
  const lang = scriptTtsLang(script);
  const [speaking, setSpeaking] = useState(false);
  const [duration, setDuration] = useState(null);

  const play = async () => {
    haptic('light');
    setSpeaking(true);
    setDuration(null);
    try {
      await getTextSound(item.char, lang, setDuration);
    } finally {
      setSpeaking(false);
    }
  };

  useEffect(() => {
    if (isListen) play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);

  return (
    <div className="flex flex-col gap-[16px] w-full">
      <div
        role={isListen ? 'button' : undefined}
        onClick={isListen ? play : undefined}
        className="
          relative flex items-center justify-center
          w-full h-[150px] rounded-[12px]
          bg-layout-gray-50 dark:bg-layout-gray-dark
          cursor-pointer
        "
      >
        {isListen && speaking && (
          <div aria-hidden className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <TtsRipple size={110} duration={duration} />
          </div>
        )}
        {isListen ? (
          <motion.div
            animate={speaking ? { scale: [1, 1.12, 1] } : { scale: 1 }}
            transition={speaking ? { duration: 0.6, repeat: Infinity, ease: 'easeInOut' } : {}}
          >
            <SpeakerHigh size={56} weight="fill" className={speaking ? 'text-primary-main-600' : 'text-layout-gray-300'} />
          </motion.div>
        ) : (
          <h2 className="relative z-[1] text-[44px] font-[700] text-layout-black dark:text-layout-white">
            {item.char}
          </h2>
        )}
      </div>

      <div className="flex flex-col gap-[10px]">
        {options.map((opt, index) => {
          let style = 'border-layout-gray-200 text-layout-black dark:text-layout-white';
          if (answered) {
            if (index === answerIndex) {
              style = 'border-status-success-500 text-status-success-600 bg-status-success-100';
            } else if (index === selectedIndex) {
              style = 'border-status-error-500 text-status-error-600 bg-status-error-100 dark:bg-status-error-dark';
            }
          } else if (index === selectedIndex) {
            style = 'border-primary-main-600 bg-primary-main-50 dark:bg-primary-main-dark text-layout-black dark:text-layout-white';
          }
          return (
            <motion.button
              key={`${opt.char}-${index}`}
              type="button"
              disabled={answered}
              whileTap={{ scale: 0.96 }}
              onClick={() => { haptic('light'); onSelect(index); }}
              className={`
                relative flex items-center justify-center
                w-full h-[50px] px-[16px]
                border-[1px] rounded-[10px]
                text-[15px] font-[700] text-center
                ${isListen ? 'text-[24px]' : ''}
                ${style}
              `}
            >
              {isListen ? opt.char : optionLabel(script, opt)}
            </motion.button>
          );
        })}
      </div>

      <ResultMark
        result={answered ? selectedIndex === answerIndex : null}
        replayKey={step.id}
        size={90}
        className="
          pointer-events-none fixed top-[42%] left-[50%]
          translate-x-[-50%] translate-y-[-50%] z-[30]
        "
      />
    </div>
  );
};

export default ChoiceCard;
