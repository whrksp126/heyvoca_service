// src/components/script/ChoiceCard.jsx
//
// 글자 밭 세션 — 사지선다 카드 두 종류를 한 컴포넌트로 그린다.
//   seePick    — 글자를 보고 소리(한글 발음·로마자)를 고른다. 옵션 안에 한글 발음(크게)·
//                로마자(작게, 회색)를 세로로 묶어 보여준다.
//   listenPick — 소리를 듣고 글자를 고른다(혼동쌍 포함). 옵션 글자를 크게 보여준다
//                (2026-09-29: 채점 후 옵션 아래에 붙던 한글 발음 작은 글자는 제거).
// 정오답 스타일은 TakeTest Main.jsx의 선택지 버튼 규격을 그대로 따른다.

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { SpeakerHigh } from '@phosphor-icons/react';
import { haptic } from '../../lib/feel';
import ResultMark from '../common/ResultMark';
import TtsRipple from '../common/TtsRipple';
import { optionMainSub } from '../../utils/scriptSession';
import { speakScriptItem } from '../../utils/scriptData';
import { playSuccessSound, playErrorSound } from '../../utils/audio';

// 정오답 버튼 규격은 components/takeTest/Main.jsx의 사지선다 옵션 버튼과 동일 클래스를 쓴다
// (h-50 · border-[1px] rounded-[10px] · text-[14px] font-[700]) — 학습 화면과 다른 화면처럼
// 보이지 않게 한다(2026-09-29 실기기 QA: "선택지가 얇은 외곽선만 있는 작은 박스"로 보임).
const ChoiceCard = ({ step, answered, selectedIndex, onSelect }) => {
  "use memo";

  const { script, item, options, answerIndex, type } = step;
  const isListen = type === 'listenPick';
  const [speaking, setSpeaking] = useState(false);
  const [duration, setDuration] = useState(null);

  const play = async () => {
    haptic('light');
    setSpeaking(true);
    setDuration(null);
    try {
      await speakScriptItem(script, item, setDuration);
    } finally {
      setSpeaking(false);
    }
  };

  useEffect(() => {
    if (isListen) play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);

  // 채점 순간 — 학습하기(TakeTest)와 같은 정오답 효과음·햅틱, 이어서 정답 글자 발음을 들려준다.
  useEffect(() => {
    if (!answered) return undefined;
    const correct = selectedIndex === answerIndex;
    if (correct) { haptic('success'); playSuccessSound(); } else { haptic('error'); playErrorSound(); }
    const t = setTimeout(() => { play(); }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answered]);

  return (
    <div className="flex flex-col gap-[16px] w-full h-full">
      {/* 문제 카드 — TakeTest Main.jsx의 사지선다 카드와 같은 규격(flex-1로 남는 세로 공간을
          모두 채운다. 옛 h-[150px] 고정값이 "화면 하단이 텅 비어 보이는" 원인이었다). */}
      <div
        role={isListen ? 'button' : undefined}
        onClick={isListen ? play : undefined}
        className="
          relative flex items-center justify-center flex-1 min-h-0
          w-full py-[45px] rounded-[12px]
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
            <SpeakerHigh size={64} weight="fill" className={speaking ? 'text-primary-main-600' : 'text-layout-gray-300'} />
          </motion.div>
        ) : (
          <h2 className="relative z-[1] text-[52px] font-[700] text-layout-black dark:text-layout-white">
            {item.char}
          </h2>
        )}

        {/* TakeTest Main.jsx의 ResultMark와 같은 크기(기본 150)·같은 중앙 배치 규격 —
            2026-09-29 실기기 QA: 110px는 TakeTest보다 작아 다른 화면처럼 보였다. */}
        <ResultMark
          result={answered ? selectedIndex === answerIndex : null}
          replayKey={step.id}
          className="
            pointer-events-none absolute top-[50%] left-[50%] z-[2]
            translate-x-[-50%] translate-y-[-50%]
          "
        />
      </div>

      <div className="flex-shrink-0 flex flex-col gap-[10px]">
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
          const { main, sub } = optionMainSub(script, opt);
          return (
            <motion.button
              key={`${opt.char}-${index}`}
              type="button"
              disabled={answered}
              whileTap={{ scale: 0.96 }}
              onClick={() => { haptic('light'); onSelect(index); }}
              className={`
                relative flex items-center justify-center
                w-full h-[54px] px-[20px]
                border-[1px] rounded-[10px]
                ${style}
              `}
            >
              {isListen ? (
                <span className="text-[26px] font-[800] leading-none">{opt.char}</span>
              ) : (
                <div className="flex flex-col items-center gap-[2px]">
                  <span className="text-[17px] font-[700] leading-none">{main}</span>
                  {sub && (
                    <span className="text-[12px] font-[600] leading-none text-layout-gray-400">{sub}</span>
                  )}
                </div>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default ChoiceCard;
