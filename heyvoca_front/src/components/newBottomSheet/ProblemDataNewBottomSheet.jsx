import React, { useState, useRef, useCallback } from 'react';
import { Check, Minus, Plus } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { MIN_TEST_VOCABULARY_COUNT, getTextSound } from '../../utils/common';
import MemorizationStatus from "../common/MemorizationStatus";

// Hook 제거 - 직접 컴포넌트 사용


export const ProblemDataNewBottomSheet = ({onCancel, options, resultIndex}) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { popNewBottomSheet } = useNewBottomSheetActions();

  // React Compiler가 자동으로 useCallback 처리
  const handleClose = () => {
    popNewBottomSheet();
  };

  // 정답과 보기 단어 분리
  const correctOption = options[resultIndex];
  const otherOptions = options.filter((_, index) => index !== resultIndex);

  return (
    <div className="">
      <div>
        <div className="left"></div>
        <div className="
          flex items-center justify-center
          p-[20px] pb-[0px]
          ">
          <h1 className="text-[18px] font-[700]">단어 확인</h1>
        </div>
        <div className="right"></div>
      </div>
      <div className="
        flex flex-col gap-[20px]
        max-h-[calc(90vh-47px)] h-full
        p-[20px] pb-[105px]
        overflow-y-auto
      ">
        {/* 정답 단어 섹션 */}
        <div className="flex flex-col gap-[10px]">
          <h2 className="text-[14px] font-[600] text-[#111]">정답 단어</h2>
          <div className="
            flex gap-[10px] items-start
            p-[20px]
            rounded-[12px]
            bg-[#E4FFE8]
          ">
            <div 
              className="
                flex flex-col gap-[10px] flex-1
              "
            >
              <div className="flex flex-wrap">
                <h3
                  onClick={() => {
                    getTextSound(correctOption.origin, "en");
                    const spans = document.querySelectorAll(`#correct-word-${correctOption.id} span`);
                    spans.forEach(span => span.getAnimations().forEach(anim => anim.cancel()));
                    spans.forEach((span, index) => {
                      span.animate(
                        [
                          { color: "#09C92C", offset: 0 },
                          { color: "#FFFFFF", offset: 0.5 },
                          { color: "#09C92C", offset: 1 }
                        ],
                        { 
                          duration: 1000, 
                          delay: index * 50,
                          easing: "cubic-bezier(0.4, 0, 0.2, 1)"
                        }
                      );
                    });
                  }}
                  className="
                    text-[16px] font-[700] text-[#09C92C]
                    cursor-pointer relative
                    overflow-hidden
                    break-words 
                  "
                  id={`correct-word-${correctOption.id}`}
                >
                  {correctOption.origin.split('').map((char, index) => (
                    <span
                      key={index}
                      className="inline-block"
                    >
                      {char}
                    </span>
                  ))}
                </h3>
              </div>
              <div className="flex flex-wrap">
                <span
                  onClick={() => {
                    getTextSound(correctOption.meanings.join(", "), "ko");
                    const spans = document.querySelectorAll(`#correct-meaning-${correctOption.id} span`);
                    spans.forEach(span => span.getAnimations().forEach(anim => anim.cancel()));
                    spans.forEach((span, index) => {
                      span.animate(
                        [
                          { color: "#111", offset: 0 },
                          { color: "#FFFFFF", offset: 0.5 },
                          { color: "#111", offset: 1 }
                        ],
                        { 
                          duration: 1000, 
                          delay: index * 50,
                          easing: "cubic-bezier(0.4, 0, 0.2, 1)"
                        }
                      );
                    });
                  }}
                  className="
                    text-[12px] font-[400] text-[#333]
                    cursor-pointer relative
                    overflow-hidden
                    break-words
                  "
                  id={`correct-meaning-${correctOption.id}`}
                >
                  {correctOption.meanings.join(", ").split('').map((char, index) => (
                    <span
                      key={index}
                      className="inline-block"
                    >
                      {char}
                    </span>
                  ))}
                </span>
              </div>
              {correctOption.examples && correctOption.examples.length > 0 && (
                <div className="flex flex-col gap-[8px]">
                  {correctOption.examples.map((example, index) => (
                    <div key={`correct_example_${index}`} className="flex flex-col">
                      <p className="text-[12px] font-[400] text-[#333]">{example.origin}</p>
                      <p className="text-[12px] font-[400] text-[#333]">{example.meaning}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <MemorizationStatus repetition={correctOption.repetition} interval={correctOption.interval} ef={correctOption.ef} />
            </div>
          </div>
        </div>

        {/* 보기 단어 섹션 */}
        <div className="flex flex-col gap-[10px]">
          <h2 className="text-[14px] font-[600] text-[#111]">보기 단어</h2>
          <div className="flex flex-col gap-[10px]">
            {otherOptions.map((option, index) => (
              <div key={`option_${option.id}_${index}`}
                className="
                  flex gap-[10px] items-start
                  p-[20px]
                  rounded-[12px]
                  bg-[#F5F5F5]
                "
              >
                <div 
                  className="
                    flex flex-col gap-[10px] flex-1
                  "
                >
                  <div className="flex flex-wrap">
                    <h3
                      onClick={() => {
                        getTextSound(option.origin, "en");
                        const spans = document.querySelectorAll(`#word-${option.id} span`);
                        spans.forEach(span => span.getAnimations().forEach(anim => anim.cancel()));
                        spans.forEach((span, idx) => {
                          span.animate(
                            [
                              { color: "#111", offset: 0 },
                              { color: "#FFFFFF", offset: 0.5 },
                              { color: "#111", offset: 1 }
                            ],
                            { 
                              duration: 1000, 
                              delay: idx * 50,
                              easing: "cubic-bezier(0.4, 0, 0.2, 1)"
                            }
                          );
                        });
                      }}
                      className="
                        text-[16px] font-[700] text-[#111]
                        cursor-pointer relative
                        overflow-hidden
                        break-words 
                      "
                      id={`word-${option.id}`}
                    >
                      {option.origin.split('').map((char, charIndex) => (
                        <span
                          key={charIndex}
                          className="inline-block"
                        >
                          {char}
                        </span>
                      ))}
                    </h3>
                  </div>
                  <div className="flex flex-wrap">
                    <span
                      onClick={() => {
                        getTextSound(option.meanings.join(", "), "ko");
                        const spans = document.querySelectorAll(`#meaning-${option.id} span`);
                        spans.forEach(span => span.getAnimations().forEach(anim => anim.cancel()));
                        spans.forEach((span, idx) => {
                          span.animate(
                            [
                              { color: "#111", offset: 0 },
                              { color: "#FFFFFF", offset: 0.5 },
                              { color: "#111", offset: 1 }
                            ],
                            { 
                              duration: 1000, 
                              delay: idx * 50,
                              easing: "cubic-bezier(0.4, 0, 0.2, 1)"
                            }
                          );
                        });
                      }}
                      className="
                        text-[12px] font-[400] text-[#111]
                        cursor-pointer relative
                        overflow-hidden
                        break-words
                      "
                      id={`meaning-${option.id}`}
                    >
                      {option.meanings.join(", ").split('').map((char, charIndex) => (
                        <span
                          key={charIndex}
                          className="inline-block"
                        >
                          {char}
                        </span>
                      ))}
                    </span>
                  </div>
                  {option.examples && option.examples.length > 0 && (
                    <div className="flex flex-col gap-[8px]">
                      {option.examples.map((example, exIndex) => (
                        <div key={`option_example_${index}_${exIndex}`} className="flex flex-col">
                          <p className="text-[12px] font-[400] text-[#333]">{example.origin}</p>
                          <p className="text-[12px] font-[400] text-[#333]">{example.meaning}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <MemorizationStatus repetition={option.repetition} interval={option.interval} ef={option.ef} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="
        absolute bottom-0 left-0 right-0
        flex items-center justify-between gap-[15px] p-[20px]
        bg-[#fff]/80 backdrop-blur-[1px]
      ">
        <motion.button 
          className="
            flex-1
            h-[45px]
            rounded-[8px]
            bg-[#ccc]
            text-[#fff] text-[16px] font-[700]
          "
          onClick={onCancel || handleClose}
          whileTap={{ scale: 0.95 }}
          transition={{ 
            type: "spring", 
            stiffness: 500, 
            damping: 15
          }}
        >닫기</motion.button>
      </div>
    </div>
  );
}; 