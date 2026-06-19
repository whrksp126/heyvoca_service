import React, { useState, useMemo } from 'react';
import { useVocabulary } from '../../context/VocabularyContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
// import TestSetup from '../class/TestSetup';
import { PencilSimple, Trash, CaretLeft, EggCrack, Leaf, Plant, Carrot } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { MIN_TEST_VOCABULARY_COUNT, MAX_TEST_VOCABULARY_COUNT } from '../../utils/common';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { TestSetupNewBottomSheet } from '../newBottomSheet/TestSetupNewBottomSheet';
import { StudySetupNewBottomSheet } from '../newBottomSheet/StudySetupNewBottomSheet';
import { vibrate } from '../../utils/osFunction';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { resolveVocaBookBackground } from '../../utils/vocaBookColor';

const VocabularySheetNewFullSheet = ({ testType }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { popNewFullSheet, closeNewFullSheet } = useNewFullSheetActions();
  const { vocabularySheets, isVocabularySheetsLoading } = useVocabulary();
  const { pushNewBottomSheet } = useNewBottomSheetActions();
  const navigate = useNavigate();
  const { isDark } = useTheme();

  const [isAllSelected, setIsAllSelected] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  if (isVocabularySheetsLoading) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-layout-white dark:bg-layout-black">
        <p>로딩 중...</p>
      </div>
    );
  }

  // 암기 상태별 단어 개수 계산 함수 (MemorizationStatus와 동일한 로직)
  const calculateMemorizationStats = (words) => {
    if (!words || words.length === 0) {
      return { unlearned: 0, shortTerm: 0, mediumTerm: 0, longTerm: 0 };
    }

    const stats = {
      unlearned: 0,   // 미학습 (repetition === 0 && interval === 0)
      shortTerm: 0,   // 단기 암기 (interval < 10)
      mediumTerm: 0,  // 중기 암기 (interval < 60)
      longTerm: 0     // 장기 암기 (interval >= 60)
    };

    words.forEach(word => {
      // FSRS 기반 암기 상태 판단
      const fsrs = word.fsrs;
      const stability = fsrs?.stability ?? 0;

      // 미학습 상태 체크 (한 번도 학습하지 않은 단어)
      if (!fsrs || fsrs.state === 'new' || !fsrs.state) {
        stats.unlearned++;
        return;
      }

      // 암기 상태 판단
      if (stability < 10) {
        stats.shortTerm++;
      } else if (stability < 60) {
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

  const handleAllClick = () => {
    vibrate({ duration: 5 });
    setSelectedIds(new Set());
    setIsAllSelected(prev => !prev);
  };

  const handleCardClick = (id) => {
    vibrate({ duration: 5 });
    setIsAllSelected(false);
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    vibrate({ duration: 5 });

    const sheetId = isAllSelected ? "all" : Array.from(selectedIds);

    let selectedWords = [];
    if (isAllSelected) {
      selectedWords = vocabularySheets.flatMap(s => s.words || []);
    } else {
      selectedWords = vocabularySheets
        .filter(s => selectedIds.has(s.id))
        .flatMap(s => s.words || []);
    }

    const totalWords = selectedWords.length;

    if (totalWords < MIN_TEST_VOCABULARY_COUNT) {
      return alert(`단어 개수가 부족해요. 최소 ${MIN_TEST_VOCABULARY_COUNT}개 이상 필요합니다.`);
    }

    if (testType === 'study') {
      pushNewBottomSheet(
        StudySetupNewBottomSheet,
        {
          maxVocabularyCount: totalWords,
          vocabularySheetId: sheetId,
        },
        {
          isBackdropClickClosable: false,
          isDragToCloseEnabled: true
        }
      );
      return;
    }

    pushNewBottomSheet(
      TestSetupNewBottomSheet,
      {
        maxVocabularyCount: totalWords,
        vocabularySheetId: sheetId,
        testType: testType
      },
      {
        isBackdropClickClosable: false,
        isDragToCloseEnabled: true
      }
    );
  };

  const isConfirmActive = isAllSelected || selectedIds.size > 0;
  const confirmLabel = isAllSelected
    ? '전체 단어장 선택'
    : selectedIds.size > 0
      ? `단어장 ${selectedIds.size}개 선택`
      : '선택';

  return (
    <div className="flex flex-col h-full w-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      {/* Header */}
      <div
        data-page-header
        className="
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
            text-layout-gray-200 dark:text-layout-white
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
          text-layout-black dark:text-layout-white
        ">단어장 선택</h1>
        <div
          className="
            absolute top-[18px] right-[10px]
            flex items-center gap-[4px]
            text-layout-gray-200 dark:text-layout-white
          "
        >
        </div>
      </div>

      <ul
        className="flex flex-col gap-[15px] flex-1 py-[10px] px-[16px] overflow-y-auto"
      >
        <motion.li
          style={isAllSelected ? (isDark ? {
            // 다크: 파스텔 20% → 불투명 다크(#111) → 선명한 보더 순으로 겹쳐, 안쪽은 어둡고 보더만 선명
            background: 'linear-gradient(160deg, rgba(255, 239, 250, 0.2) 10%, rgba(246, 239, 255, 0.2) 50%, rgba(246, 239, 255, 0.2) 90%) padding-box, linear-gradient(#111111, #111111) padding-box, linear-gradient(to right, #FF88DC, #9B8AFB, #53B1FD) border-box',
            border: '1px solid transparent',
          } : {
            background: 'linear-gradient(160deg,rgba(255, 239, 250, 1) 10%, rgba(246, 239, 255, 1) 50%, rgba(246, 239, 255, 1) 90%) padding-box, linear-gradient(to right, #FF88DC, #9B8AFB, #53B1FD) border-box',
            border: '1px solid transparent',
          }) : (isDark ? {
            // 다크(비선택): 보더 없음 → 파스텔 20%가 다크 페이지 위에 비쳐 어두운 카드로
            background: 'linear-gradient(160deg, rgba(255, 239, 250, 0.2) 10%, rgba(246, 239, 255, 0.2) 50%, rgba(246, 239, 255, 0.2) 90%)',
            border: '1px solid transparent',
          } : {
            background: 'linear-gradient(160deg,rgba(255, 239, 250, 1) 10%, rgba(246, 239, 255, 1) 50%, rgba(246, 239, 255, 1) 90%)',
            border: '1px solid transparent',
          })}
          className={`
                flex flex-col gap-[15px]
                p-[20px]
                rounded-[12px]
                cursor-pointer
                transition-all
                ${selectedIds.size > 0 ? 'opacity-50' : 'opacity-100'}
              `}
          onClick={handleAllClick}
          whileTap={{ scale: 0.96 }}
          whileHover={{ scale: 1.04 }}
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
              text-[16px] font-[700] text-layout-black dark:text-layout-white
            ">
              <div
                className="
                  flex items-center justify-center
                  w-[22px] h-[22px]
                  rounded-[5px]
                  text-layout-white text-[10px] font-[700]
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
          const isSelected = selectedIds.has(item.id);
          return (
            <motion.li
              key={item.id}
              style={{
                backgroundColor: resolveVocaBookBackground(item.color.background, isDark),
                ...(isSelected && { border: `1px solid ${item.color.main}` })
              }}
              className={`
                flex flex-col gap-[15px]
                p-[20px]
                rounded-[12px]
                cursor-pointer
                border-[1px]
                transition-all
                border-transparent
                ${isAllSelected ? 'opacity-50' : 'opacity-100'}
              `}
              onClick={() => handleCardClick(item.id)}
              whileTap={{ scale: 0.96 }}
              whileHover={{ scale: 1.04 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <div
                className="
                top
                flex items-center justify-between
                w-full
              "
              >
                <h3 className="text-[16px] font-[700] text-layout-black dark:text-layout-white">{item.title}</h3>
                <span className="text-[10px] font-[400] text-layout-gray-300">{item.total || 0}</span>
              </div>

              {/* 암기 상태별 단어 개수 표시 */}
              <div className="flex items-center gap-[12px] flex-wrap">
                <div className="flex items-center gap-[4px]">
                  <div className="w-[14px] h-[14px] flex items-center justify-center border-[1px] border-[#9D835A] rounded-[14px] bg-[#FFFCF3] dark:bg-[#FFFCF3]/20">
                    <EggCrack size={8} weight="fill" className="text-[#9D835A]" />
                  </div>
                  <span className="text-[11px] font-[500] text-[#9D835A]">
                    {memorizationStats.unlearned || 0}
                  </span>
                </div>
                <div className="flex items-center gap-[4px]">
                  <div className="w-[14px] h-[14px] flex items-center justify-center border-[1px] border-[#77CE4F] rounded-[14px] bg-[#F2FFEB] dark:bg-[#F2FFEB]/20">
                    <Leaf size={8} weight="fill" className="text-[#77CE4F]" />
                  </div>
                  <span className="text-[11px] font-[500] text-[#77CE4F]">
                    {memorizationStats.shortTerm || 0}
                  </span>
                </div>
                <div className="flex items-center gap-[4px]">
                  <div className="w-[14px] h-[14px] flex items-center justify-center border-[1px] border-[#38CE38] rounded-[14px] bg-[#EBFFEE] dark:bg-[#EBFFEE]/20">
                    <Plant size={8} weight="fill" className="text-[#38CE38]" />
                  </div>
                  <span className="text-[11px] font-[500] text-[#38CE38]">
                    {memorizationStats.mediumTerm || 0}
                  </span>
                </div>
                <div className="flex items-center gap-[4px]">
                  <div className="w-[14px] h-[14px] flex items-center justify-center border-[1px] border-[#F68300] rounded-[14px] bg-[#FFF8E8] dark:bg-[#FFF8E8]/20">
                    <Carrot size={8} weight="fill" className="text-[#F68300]" />
                  </div>
                  <span className="text-[11px] font-[500] text-[#F68300]">
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
                    <PencilSimple />
                  </button>
                  <button>
                    <Trash />
                  </button>
                </div>
              </div>
            </motion.li>
          )
        })}
      </ul>

      {/* 하단 고정 확인 버튼 (iOS 홈 인디케이터 세이프에어리어 반영) */}
      <div
        className="px-[16px] pt-[8px] shrink-0"
        style={{ paddingBottom: 'max(16px, var(--safe-area-bottom, 0px))' }}
      >
        <motion.button
          disabled={!isConfirmActive}
          onClick={handleConfirm}
          className={`
            w-full h-[52px] rounded-[12px] text-[16px] font-[700] text-layout-white dark:text-layout-black
            transition-colors
            ${isConfirmActive ? 'bg-primary-main-600' : 'bg-layout-gray-200'}
          `}
          whileTap={isConfirmActive ? { scale: 0.97 } : {}}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
        >
          {confirmLabel}
        </motion.button>
      </div>
    </div>
  );
};

export default VocabularySheetNewFullSheet;
