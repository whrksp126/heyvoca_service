import React, { useState } from 'react';
import { useVocabulary } from '../../context/VocabularyContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { CaretLeft, Check } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { MIN_TEST_VOCABULARY_COUNT } from '../../utils/common';
import { isWordStudiable } from '../../utils/vocaCrop';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { TestSetupNewBottomSheet } from '../newBottomSheet/TestSetupNewBottomSheet';
import { BookStudyTypeNewBottomSheet } from '../newBottomSheet/BookStudyTypeNewBottomSheet';
import { StudySetupNewBottomSheet } from '../newBottomSheet/StudySetupNewBottomSheet';
import VocaBookCard, { buildBookRow, isScriptBook } from '../vocabularySheets/VocaBookCard';
import { vibrate } from '../../utils/osFunction';

/*
  단어장 선택 풀시트 — 학습장 단어장 목록(VocaBooksTab)과 같은 카드(VocaBookCard)를 쓰고,
  누르면 상세로 가는 대신 선택만 토글한다(이슈 #16 후속). 진입: 홈 학습 고르기(pick)·class·StudyNewFullSheet.
*/
const VocabularySheetNewFullSheet = ({ testType }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { popNewFullSheet } = useNewFullSheetActions();
  const { vocabularySheets, isVocabularySheetsLoading } = useVocabulary();
  const { pushNewBottomSheet } = useNewBottomSheetActions();

  const [isAllSelected, setIsAllSelected] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  if (isVocabularySheetsLoading) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-layout-white dark:bg-layout-black">
        <p>로딩 중...</p>
      </div>
    );
  }

  // 목록 페이지와 같은 순서·같은 카드 — 글자 단어장은 여기서도 숨긴다
  const rows = vocabularySheets.filter((book) => !isScriptBook(book)).map(buildBookRow);
  const totalWordCount = rows.reduce((sum, row) => sum + (row.book.words?.length ?? 0), 0);

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

    // 썩은 단어는 되살리기 전에는 출제 대상이 아니다 — 설정 시트의 최대 개수도 그 수를 뺀 값이어야
    // "몇 문제"의 상한과 실제로 나오는 문제 수가 같아진다(QA 2차).
    const studiable = selectedWords.filter(isWordStudiable);
    const totalWords = studiable.length;

    if (totalWords < MIN_TEST_VOCABULARY_COUNT) {
      return alert(
        selectedWords.length >= MIN_TEST_VOCABULARY_COUNT
          ? '썩은 단어는 되살린 뒤에 학습할 수 있어요'
          : `단어 개수가 부족해요. 최소 ${MIN_TEST_VOCABULARY_COUNT}개 이상 필요합니다.`
      );
    }

    // 홈 '학습 고르기' → 밭 골라 학습(구 단어장 골라 학습): 단어장을 고른 뒤 방식(집중 반복 / 자유 설정 테스트)을 묻는다.
    if (testType === 'pick') {
      pushNewBottomSheet(
        BookStudyTypeNewBottomSheet,
        { maxVocabularyCount: totalWords, vocabularySheetId: sheetId },
        { isBackdropClickClosable: true, isDragToCloseEnabled: true }
      );
      return;
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

      <div className="flex flex-col gap-[10px] flex-1 min-h-0 pt-[6px] pb-[10px] px-[16px] overflow-y-auto">
        <motion.button
          type="button"
          onClick={handleAllClick}
          whileTap={{ scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
          aria-pressed={isAllSelected}
          className={`
            flex items-center gap-[12px] w-full shrink-0 px-[14px] py-[14px] text-left rounded-[12px] border
            bg-farm-canvas dark:bg-layout-gray-dark transition-opacity
            ${isAllSelected ? 'border-primary-main-600 ring-1 ring-inset ring-primary-main-600' : 'border-farm-line'}
            ${selectedIds.size > 0 ? 'opacity-50' : ''}
          `}
        >
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-[700] tracking-[-0.03em] text-layout-black dark:text-layout-white">
              전체 단어장
            </span>
            <small className="block mt-[2px] text-[12px] font-[600] tracking-[-0.02em] text-layout-gray-300">
              단어장 {rows.length}개 · 단어 {totalWordCount.toLocaleString('ko-KR')}개
            </small>
          </span>
          <span
            aria-hidden
            className={`
              flex items-center justify-center shrink-0 w-[20px] h-[20px] rounded-full
              ${isAllSelected
                ? 'bg-primary-main-600 text-layout-white dark:text-layout-black'
                : 'border-[1.5px] border-layout-gray-200 dark:border-layout-gray-400'}
            `}
          >
            {isAllSelected && <Check size={12} weight="bold" />}
          </span>
        </motion.button>

        {rows.map((row) => (
          <VocaBookCard
            key={row.book.id}
            row={row}
            selected={selectedIds.has(row.book.id)}
            dimmed={isAllSelected}
            onClick={() => handleCardClick(row.book.id)}
          />
        ))}
      </div>

      {/* 하단 고정 확인 버튼 (iOS 홈 인디케이터 세이프에어리어 반영) */}
      <div
        className="px-[16px] pt-[8px] shrink-0"
        style={{ paddingBottom: 'max(16px, var(--safe-area-bottom, 0px))' }}
      >
        <motion.button
          disabled={!isConfirmActive}
          onClick={handleConfirm}
          className={`
            w-full h-[52px] rounded-[12px] text-[16px] font-[700] tracking-[-0.03em] text-layout-white dark:text-layout-black
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
