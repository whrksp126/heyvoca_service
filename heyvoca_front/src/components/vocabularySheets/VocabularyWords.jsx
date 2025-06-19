import React, { useState } from 'react';
import { PencilSimple, CaretLeft, Plus, Trash, SpeakerHigh, Leaf, Plant, Carrot, EggCrack } from '@phosphor-icons/react';

import { useFullSheet } from '../../context/FullSheetContext';
import { useVocabulary } from '../../context/VocabularyContext';
import { motion } from 'framer-motion';
import { useVocabularySetBottomSheet } from './VocabularyBottomSheet';
import { useWordSetBottomSheet } from './WordBottomSheet';
import { getTextSound } from '../../utils/common';
import UpdateVocabularyWords from './UpdateVocabularyWords';
import MemorizationStatus from './MemorizationStatus';

function getMemorizationStatus({ repetition, interval, ef }) {
  // ✅ 미학습 상태 먼저 체크
  if (repetition === 0 && interval === 0) {
    return {
      percent: 0,
      Icon: <EggCrack size={10} weight="fill" />,
    };
  }

  // 암기율 계산
  let score = 0;
  score += repetition * 15;
  score += interval * 2;
  score += (ef - 1.3) * 20;

  const percent = Math.max(0, Math.min(100, Math.round(score)));

  // 아이콘 분기
  let Icon, label;
  if (percent < 30) {
    Icon = <Leaf size={10} weight="fill" />;
  } else if (percent < 70) {
    Icon = <Plant size={10} weight="fill" />;
  } else {
    Icon = <Carrot size={10} weight="fill" />;
  }

  return { percent, Icon };
}


const VocabularyWords = ({ id }) => {

  const { handleBack } = useFullSheet();
  const { isVocabularySheetsLoading, getVocabularySheet } = useVocabulary();
  const { showWordSetBottomSheet } = useWordSetBottomSheet();
  const { pushFullSheet } = useFullSheet();

  const vocabularySheet = getVocabularySheet(id);
  console.log("vocabularySheet", vocabularySheet.words);
  const buttonVariants = {
    tap: { 
      scale: 0.85,
      rotate: -8,
      backgroundColor: "rgba(255, 141, 212, 0.2)",
      transition: {
        type: "spring",
        stiffness: 500,
        damping: 15
      }
    }
  };

  if (isVocabularySheetsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p>로딩 중...</p>
      </div>
    );
  }

  const handleEditClick = () => {
    pushFullSheet({
      component: <UpdateVocabularyWords id={id} />
    });
  };

  const handleAddClick = () => {
    showWordSetBottomSheet({vocabularyId: vocabularySheet.id});
  };

  const handleCardClick = (id) => {
    
  };

  

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="
        relative
        flex items-center justify-between
        h-[55px] 
        pt-[20px] px-[16px] pb-[14px]
      ">
        <div className="flex items-center gap-[4px]">
          <motion.button
            onClick={handleBack}
            className="
              text-[#CCC] dark:text-[#fff]
              rounded-[8px]
            "
            whileHover={{ 
              backgroundColor: 'rgba(0, 0, 0, 0.05)',
              scale: 1.05
            }}
            whileTap={{ 
              scale: 0.95,
              backgroundColor: 'rgba(0, 0, 0, 0.1)'
            }}
            transition={{ 
              type: "spring", 
              stiffness: 400, 
              damping: 17
            }}
          >
            <CaretLeft size={24} />
          </motion.button>
          <h1 className="
            text-[18px] font-[700]
            text-[#111] dark:text-[#fff]
          ">
            {vocabularySheet.title}
          </h1>
        </div>
        <div
          className="
            flex items-center gap-[8px]
            text-[#CCC] dark:text-[#fff]
          "
        >
          {/* 
          <motion.button 
            className="
            rounded-[20px]
              text-[#FF8DD4] text-[20px]
            "
            variants={buttonVariants}
            whileTap="tap"
            transition={{ 
              type: "spring", 
              stiffness: 500, 
              damping: 15
            }}
            onClick={handleEditClick}
            aria-label="단어장 편집"
          >
            <PencilSimple />
          </motion.button> 
          */}
          <motion.button 
            className="
            rounded-[20px]
              text-[#FF8DD4] text-[20px]
            "
            variants={buttonVariants}
            whileTap="tap"
            transition={{ 
              type: "spring", 
              stiffness: 500, 
              damping: 15
            }}
            onClick={handleAddClick}
            aria-label="새 단어 추가"
          >
            <Plus />
          </motion.button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col gap-[15px] flex-1 py-[10px] px-[16px] overflow-y-auto">
        {vocabularySheet.words.map((item, index) => {
          return (
            <li
              key={item.id}
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
                  <motion.h3
                    onClick={() => {
                      getTextSound(item.origin, "en");
                      const spans = document.querySelectorAll(`#word-${item.id} span`);
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
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{
                      type: "spring",
                      stiffness: 400,
                      damping: 20
                    }}
                    className="
                      text-[16px] font-[700] text-[#111]
                      cursor-pointer relative
                      overflow-hidden
                      break-words 
                    "
                    id={`word-${item.id}`}
                  >
                    {item.origin.split('').map((char, index) => (
                      <motion.span
                        key={index}
                        initial={{ color: "#111" }}
                        className="inline-block"
                      >
                        {char}
                      </motion.span>
                    ))}
                  </motion.h3>
                </div>
                <div className="flex flex-wrap">
                  <motion.span
                    onClick={() => {
                      getTextSound(item.meanings.join(", "), "ko");
                      const spans = document.querySelectorAll(`#meaning-${item.id} span`);
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
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{
                      type: "spring", 
                      stiffness: 400,
                      damping: 20
                    }}
                    className="
                      text-[12px] font-[400] text-[#111]
                      cursor-pointer relative
                      overflow-hidden
                      break-words
                    "
                    id={`meaning-${item.id}`}
                  >
                    {item.meanings.join(", ").split('').map((char, index) => (
                      <motion.span
                        key={index}
                        initial={{ color: "#111" }}
                        className="inline-block"
                      >
                        {char}
                      </motion.span>
                    ))}
                  </motion.span>
                </div>
              </div>
              <div>
                {MemorizationStatus({repetition: item.repetition, interval: item.interval, ef: item.ef})}
              </div>

              {/* 
              <div className="
                flex gap-[8px]
              text-[#FF8DD4] text-[20px]
              ">
                <button onClick={() => getTextSound(item.origin, "en")}>
                  <SpeakerHigh weight="fill" />
                </button>
              </div> 
              */}
            </li>
          )
        })}




        {/* {sortedVocabularySheets.map((item, index) => {
          return (
            <li
              key={item.id}
              style={{ backgroundColor: item.color.background }}
              className="
                flex gap-[15px] items-start
                p-[20px]
                rounded-[12px]
              "
            >
              <div 
              className="
                top
                flex flex-col
                w-full
              "
            >
              <h3 className="text-[16px] font-[700]">{item.title}</h3>
              <span className="text-[10px] font-[400] text-[#999]">{item.memorized}/{item.total}</span>
            </div>

            <div className="flex items-center gap-[8px]">
              <motion.button 
                className={`rounded-[20px]`}
                variants={getButtonVariants(item.color.sub)}
                whileTap="tap"
                transition={{ 
                  type: "spring", 
                  stiffness: 500, 
                  damping: 15
                }}
                onClick={() => handleEditClick(item.id, index)}
                aria-label="단어장 편집"
              >
                <PencilSimple size={18} color={item.color.main} />
              </motion.button>
              <motion.button 
                className={`rounded-[20px]`}
                variants={getButtonVariants('#ff00004d')}
                whileTap="tap"
                transition={{ 
                  type: "spring", 
                  stiffness: 500, 
                  damping: 15
                }}
                onClick={() => handleDeleteClick(item.id, index)}
                aria-label="단어장 삭제"
              >
                <Trash size={18} color="red" />
              </motion.button>
            </div>
          </li>
        )})} */}
      </div>
    </div>
  );
};

export default VocabularyWords;   