import React, { useMemo } from 'react';
import { useVocabulary } from '../../context/VocabularyContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
// import TestSetup from '../class/TestSetup';
import { PencilSimple, Trash, CaretLeft, EggCrack, Leaf, Plant, Carrot } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { MIN_TEST_VOCABULARY_COUNT, MAX_TEST_VOCABULARY_COUNT } from '../../utils/common';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { TestSetupNewBottomSheet } from '../newBottomSheet/TestSetupNewBottomSheet';
import { vibrate } from '../../utils/osFunction'; 

const VocabularySheetNewFullSheet = ({testType}) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { popNewFullSheet } = useNewFullSheetActions();
  const { vocabularySheets, isVocabularySheetsLoading } = useVocabulary();
  const { pushNewBottomSheet } = useNewBottomSheetActions();
  
  if (isVocabularySheetsLoading) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-white">
        <p>로딩 중...</p>
      </div>
    );
  }

  // 암기 상태별 단어 개수 계산 함수 (암기율 계산 방식 사용)
  const calculateMemorizationStats = (words) => {
    if (!words || words.length === 0) {
      return { unlearned: 0, shortTerm: 0, mediumTerm: 0, longTerm: 0 };
    }

    const stats = {
      unlearned: 0,   // 미학습 (repetition === 0 && interval === 0)
      shortTerm: 0,   // 단기 암기 (암기율 0-29%)
      mediumTerm: 0,  // 중기 암기 (암기율 30-69%)
      longTerm: 0     // 장기 암기 (암기율 70-100%)
    };

    words.forEach(word => {
      // 미학습 상태 체크
      const repetition = word.memoryState?.repetition ?? word.repetition ?? 0;
      const interval = word.memoryState?.interval ?? word.interval ?? 0;
      
      if (repetition === 0 && interval === 0) {
        stats.unlearned++;
        return;
      }

      // 암기율 계산 (MemorizationStatus와 동일한 로직)
      const ef = word.memoryState?.ef ?? word.ef ?? 2.5;
      let score = 0;
      score += repetition * 15;
      score += interval * 2;
      score += (ef - 1.3) * 20;
      const percent = Math.max(0, Math.min(100, Math.round(score)));

      // 퍼센트에 따라 분류
      if (percent < 30) {
        stats.shortTerm++;
      } else if (percent < 70) {
        stats.mediumTerm++;
      } else {
        stats.longTerm++;
      }
    });

    return stats;
  };

  // React Compiler가 자동으로 메모이제이션 처리
  // updatedAt 기준으로 정렬된 단어장 목록
  const sortedVocabularySheets = [...vocabularySheets].sort((a, b) => 
    new Date(b.updatedAt) - new Date(a.updatedAt)
  );

  const handleCardClick = (id, index) => {
    console.log("testType", testType);
    if(id === "all") {
      const maxVocabularyCount = vocabularySheets.slice(0, MAX_TEST_VOCABULARY_COUNT).reduce((sum, sheet) => sum + sheet.words.length, 0);
      if(maxVocabularyCount < MIN_TEST_VOCABULARY_COUNT) return alert(`전체 단어 개수가 부족해요. 최소 ${MIN_TEST_VOCABULARY_COUNT}개 이상 필요합니다.`); 
      pushNewBottomSheet(
        TestSetupNewBottomSheet,
        {
          maxVocabularyCount: maxVocabularyCount,
          vocabularySheetId: id,
          testType: testType
        },
        {
          isBackdropClickClosable: false,
          isDragToCloseEnabled: true
        }
      );
      return;
    }else{
      const words = sortedVocabularySheets.find(vocabularySheet => vocabularySheet.id === id).words;
      const vocabularySheetLength = words.slice(0, MAX_TEST_VOCABULARY_COUNT).length;
      if(vocabularySheetLength < MIN_TEST_VOCABULARY_COUNT) return alert(`단어장에 단어가 부족해요. 최소 ${MIN_TEST_VOCABULARY_COUNT}개 이상 필요합니다.`);
      const maxVocabularyCount = Math.min(vocabularySheetLength, MAX_TEST_VOCABULARY_COUNT);
      pushNewBottomSheet(
        TestSetupNewBottomSheet,
        {
          maxVocabularyCount: maxVocabularyCount,
          vocabularySheetId: id,
          testType: testType
        },
        {
          isBackdropClickClosable: false,
          isDragToCloseEnabled: true
        }
      );
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-white">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      {/* Header */}
      <div className="
        relative
        flex items-center justify-center
        h-[55px] 
        pt-[20px] px-[10px] pb-[14px]
      ">
        
        <motion.button
          onClick={() => {
            vibrate({ duration: 5 });
            popNewFullSheet();
          }}
          className="
            absolute top-[18px] left-[10px]
            flex items-center gap-[4px]
            text-[#CCC] dark:text-[#fff]
            p-[4px]
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
        ">단어장 선택</h1>
        <div
          className="
            absolute top-[18px] right-[10px]
            flex items-center gap-[4px]
            text-[#CCC] dark:text-[#fff]
          "
        >
        </div>
      </div>

      <ul 
        className="flex flex-col gap-[15px] flex-1 py-[10px] px-[16px] overflow-y-auto"
      >
            <motion.li
              style={{
                background: 'linear-gradient(160deg,rgba(255, 239, 250, 1) 10%, rgba(246, 239, 255, 1) 50%, rgba(246, 239, 255, 1) 90%)',
              }}
              className="
                flex flex-col gap-[15px]
                p-[20px]
                rounded-[12px]
                cursor-pointer

              "
              onClick={() => {
                vibrate({ duration: 5 });
                handleCardClick("all");
              }}
              whileTap={{ scale: 0.96}}
              whileHover={{ scale: 1.04}}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <div 
              className="
                top
                flex items-center justify-between
                w-full
              "
            >
              <h2 className="
              flex items-center gap-[10px]
              text-[16px] font-[700] text-[#111]
            ">
              <div 
                className="
                  flex items-center justify-center
                  w-[22px] h-[22px]
                  rounded-[5px]
                  text-[#fff] text-[10px] font-[700]
                "
                style={{ background: 'linear-gradient(160deg,rgba(255, 141, 212, 1) 10%, rgba(205, 141, 255, 1) 50%, rgba(116, 213, 255, 1) 90%)' }}
              >
                All
              </div>
              전체 단어장
            </h2>
            </div>
          </motion.li>
        {sortedVocabularySheets.map((item) => {
          const memorizationStats = calculateMemorizationStats(item.words || []);
          return (
          <motion.li
              key={item.id}
              style={{ backgroundColor: item.color.background }}
              className="
                flex flex-col gap-[15px]
                p-[20px]
                rounded-[12px]
                cursor-pointer
              "
              onClick={() => {
                vibrate({ duration: 5 });
                handleCardClick(item.id);
              }}
              whileTap={{ scale: 0.96}}
              whileHover={{ scale: 1.04}}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <div 
              className="
                top
                flex items-center justify-between
                w-full
              "
            >
              <h3 className="text-[16px] font-[700]">{item.title}</h3>
              <span className="text-[10px] font-[400] text-[#999]">{item.total||0}</span>
            </div>

            {/* 암기 상태별 단어 개수 표시 */}
            <div className="flex items-center gap-[12px] flex-wrap">
              <div className="flex items-center gap-[4px]">
                <EggCrack size={16} weight="fill" className="text-[#9D835A]" />
                <span className="text-[13px] font-[600] text-[#9D835A]">
                  {memorizationStats.unlearned || 0}
                </span>
              </div>
              <div className="flex items-center gap-[4px]">
                <Leaf size={16} weight="fill" className="text-[#77CE4F]" />
                <span className="text-[13px] font-[600] text-[#77CE4F]">
                  {memorizationStats.shortTerm || 0}
                </span>
              </div>
              <div className="flex items-center gap-[4px]">
                <Plant size={16} weight="fill" className="text-[#38CE38]" />
                <span className="text-[13px] font-[600] text-[#38CE38]">
                  {memorizationStats.mediumTerm || 0}
                </span>
              </div>
              <div className="flex items-center gap-[4px]">
                <Carrot size={16} weight="fill" className="text-[#F68300]" />
                <span className="text-[13px] font-[600] text-[#F68300]">
                  {memorizationStats.longTerm || 0}
                </span>
              </div>
            </div>

            <div 
              className="
                middle
                hidden
              "
            >
              <div className="btns">
                <button>
                  <PencilSimple  />
                </button>
                <button>
                  <Trash/>
                </button>
              </div>
            </div>
          </motion.li>
        )})}
      </ul>
    </div>
  );
};

export default VocabularySheetNewFullSheet;

