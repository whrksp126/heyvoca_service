import React, { useState, useRef, useCallback } from 'react';
import { Check, Minus, Plus } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { MIN_TEST_VOCABULARY_COUNT, getTextSound } from '../../utils/common';
import MemorizationStatus from "../common/MemorizationStatus";
import { vibrate } from '../../utils/osFunction';

// Hook 제거 - 직접 컴포넌트 사용


export const ProblemDataNewBottomSheet = ({ onCancel, options, resultIndex }) => {
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
          <h1 className="text-[18px] font-[700] text-layout-black dark:text-layout-white">단어 확인</h1>
        </div>
        <div className="right"></div>
      </div>
      <div className="
        flex flex-col gap-[20px]
        max-h-[calc(90vh-47px)]
        p-[20px] pb-[105px]
        overflow-y-auto
      ">
        {/* 정답 단어 섹션 */}
        <div className="flex flex-col gap-[10px]">
          <h2 className="text-[14px] font-[600] text-layout-black dark:text-layout-white">정답 단어</h2>
          <div className="
            flex gap-[10px] items-start
            p-[20px]
            rounded-[12px]
            bg-status-success-100
          ">
            <div
              className="
                flex flex-col gap-[10px] flex-1
              "
            >
              <div className="flex flex-wrap">
                <h3
                  className="
                    text-[16px] font-[700] text-status-success-600
                    relative
                    overflow-hidden
                    break-words 
                  "
                >
                  <motion.span
                    onClick={() => getTextSound(correctOption.origin, "en")}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{
                      type: "spring",
                      stiffness: 400,
                      damping: 20
                    }}
                    className="inline-block cursor-pointer"
                    style={{ 调节willChange: 'transform' }}
                  >
                    {correctOption.origin}
                  </motion.span>
                </h3>
              </div>
              <div className="flex flex-wrap">
                <span
                  className="
                    text-[12px] font-[400] text-layout-gray-500 dark:text-layout-gray-50
                    relative
                    overflow-hidden
                    break-words
                  "
                >
                  <motion.span
                    onClick={() => getTextSound(correctOption.meanings.join(", "), "ko")}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{
                      type: "spring",
                      stiffness: 400,
                      damping: 20
                    }}
                    className="inline-block cursor-pointer"
                    style={{ willChange: 'transform' }}
                  >
                    {correctOption.meanings.join(", ")}
                  </motion.span>
                </span>
              </div>
              {correctOption.examples && correctOption.examples.length > 0 && (
                <div className="flex flex-col gap-[8px]">
                  {correctOption.examples.map((example, index) => (
                    <div key={`correct_example_${index}`} className="flex flex-col">
                      <p className="text-[12px] font-[400] text-layout-gray-500 dark:text-layout-gray-50">
                        <motion.span
                          onClick={() => getTextSound(example.origin, "en")}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          transition={{
                            type: "spring",
                            stiffness: 400,
                            damping: 20
                          }}
                          className="inline-block cursor-pointer"
                          style={{ willChange: 'transform' }}
                        >
                          <span dangerouslySetInnerHTML={{ __html: example.origin }} />
                        </motion.span>
                      </p>
                      <p className="text-[12px] font-[400] text-layout-gray-500 dark:text-layout-gray-50">
                        <motion.span
                          onClick={() => getTextSound(example.meaning, "ko")}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          transition={{
                            type: "spring",
                            stiffness: 400,
                            damping: 20
                          }}
                          className="inline-block cursor-pointer"
                          style={{ willChange: 'transform' }}
                        >
                          {example.meaning}
                        </motion.span>
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <MemorizationStatus
                repetition={correctOption.fsrs?.reps ?? 0}
                interval={Math.round(correctOption.fsrs?.stability ?? 0)}
                ef={2.5}
                nextReview={correctOption.fsrs?.next_review ?? null}
                wordId={correctOption.id}
                useRandomMessages={false}
              />
            </div>
          </div>
        </div>

        {/* 보기 단어 섹션 */}
        <div className="flex flex-col gap-[10px]">
          <h2 className="text-[14px] font-[600] text-layout-black dark:text-layout-white">보기 단어</h2>
          <div className="flex flex-col gap-[10px]">
            {otherOptions.map((option, index) => (
              <div key={`option_${option.id}_${index}`}
                className="
                  flex gap-[10px] items-start
                  p-[20px]
                  rounded-[12px]
                  bg-layout-gray-50 dark:bg-layout-gray-dark
                "
              >
                <div
                  className="
                    flex flex-col gap-[10px] flex-1
                  "
                >
                  <div className="flex flex-wrap">
                    <h3
                      className="
                        text-[16px] font-[700] text-layout-black dark:text-layout-white
                        relative
                        overflow-hidden
                        break-words 
                      "
                    >
                      <motion.span
                        onClick={() => getTextSound(option.origin, "en")}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        transition={{
                          type: "spring",
                          stiffness: 400,
                          damping: 20
                        }}
                        className="inline-block cursor-pointer"
                        style={{ willChange: 'transform' }}
                      >
                        {option.origin}
                      </motion.span>
                    </h3>
                  </div>
                  <div className="flex flex-wrap">
                    <span
                      className="
                        text-[12px] font-[400] text-layout-black dark:text-layout-white
                        relative
                        overflow-hidden
                        break-words
                      "
                    >
                      <motion.span
                        onClick={() => getTextSound(option.meanings.join(", "), "ko")}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        transition={{
                          type: "spring",
                          stiffness: 400,
                          damping: 20
                        }}
                        className="inline-block cursor-pointer"
                        style={{ willChange: 'transform' }}
                      >
                        {option.meanings.join(", ")}
                      </motion.span>
                    </span>
                  </div>
                  {option.examples && option.examples.length > 0 && (
                    <div className="flex flex-col gap-[8px]">
                      {option.examples.map((example, exIndex) => (
                        <div key={`option_example_${index}_${exIndex}`} className="flex flex-col">
                          <p className="text-[12px] font-[400] text-layout-gray-500 dark:text-layout-gray-50">
                            <motion.span
                              onClick={() => getTextSound(example.origin, "en")}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              transition={{
                                type: "spring",
                                stiffness: 400,
                                damping: 20
                              }}
                              className="inline-block cursor-pointer"
                              style={{ willChange: 'transform' }}
                            >
                              <span dangerouslySetInnerHTML={{ __html: example.origin }} />
                            </motion.span>
                          </p>
                          <p className="text-[12px] font-[400] text-layout-gray-500 dark:text-layout-gray-50">
                            <motion.span
                              onClick={() => getTextSound(example.meaning, "ko")}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              transition={{
                                type: "spring",
                                stiffness: 400,
                                damping: 20
                              }}
                              className="inline-block cursor-pointer"
                              style={{ willChange: 'transform' }}
                            >
                              {example.meaning}
                            </motion.span>
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <MemorizationStatus
                    repetition={option.fsrs?.reps ?? 0}
                    interval={Math.round(option.fsrs?.stability ?? 0)}
                    ef={2.5}
                    nextReview={option.fsrs?.next_review ?? null}
                    wordId={option.id}
                    useRandomMessages={false}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="
        absolute bottom-0 left-0 right-0
        flex items-center justify-between gap-[15px] p-[20px]
        bg-layout-white/80 backdrop-blur-[1px]
      ">
        <motion.button
          className="
            flex-1
            h-[52px]
            rounded-[12px]
            text-[16px] font-[700] tracking-[-0.03em]
            border-[2px] border-border dark:border-border-dark bg-layout-white dark:bg-layout-black text-layout-gray-400 dark:text-layout-gray-100"
          onClick={() => {
            vibrate({ duration: 5 });
            onCancel || handleClose();
          }}
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