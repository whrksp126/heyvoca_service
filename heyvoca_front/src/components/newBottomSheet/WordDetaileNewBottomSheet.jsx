import React from 'react';
import { motion } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useVocabulary } from '../../context/VocabularyContext';
import { stripHtmlTags } from '../../utils/common';
import MemorizationStatus from "../common/MemorizationStatus";
import { useWordInsights, WordMemoryProgress, WordMemoryHistory } from '../common/WordMemorySection';
import SpeakerButton from '../common/SpeakerButton';
import { PencilSimple, Trash } from '@phosphor-icons/react';
import DeleteWordNewBottomSheet from './DeleteWordNewBottomSheet';
import AddWordNewBottomSheet from './AddWordNewBottomSheet';
import { vibrate } from '../../utils/osFunction';


const WordDetaileNewBottomSheet = ({ vocabularyId, id }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { getWord, getVocabularySheet } = useVocabulary();
  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { pushAwaitNewBottomSheet, popNewBottomSheet } = useNewBottomSheetActions();

  // React Compiler가 자동으로 메모이제이션 처리 (useMemo 불필요)
  const word = getWord(vocabularyId, id);
  const vocabularySheet = typeof getVocabularySheet === 'function' ? getVocabularySheet(vocabularyId) : null;
  const isPurchasedBook = vocabularySheet?.vocaBookStoreId != null;
  // '나의 기억' — 진행(예문 위)/기록(예문 아래) 두 곳에서 공유하므로 한 번만 조회
  const userVocaId = word?.vocaIndexId ?? id;
  const insights = useWordInsights(userVocaId);

  // 단어가 삭제되어 없으면 자동으로 닫기
  React.useEffect(() => {
    if (!word) {
      popNewBottomSheet();
    }
  }, [word, popNewBottomSheet]);

  const handleClose = () => {
    popNewBottomSheet();
  };

  // 단어 수정 함수
  const handleEdit = async () => {
    if (!word) return; // 단어가 없으면 리턴
    const editResult = await pushAwaitNewBottomSheet(AddWordNewBottomSheet, { vocabularyId, dictionaryId: word.dictionaryId, id }, {
      hideUnderlying: true,
    });
    if (editResult.cancelled) {
      return;
    }
    popNewBottomSheet();
  };

  // 단어 삭제 함수
  const handleDelete = async () => {
    const deleteResult = await pushAwaitNewBottomSheet(DeleteWordNewBottomSheet, { vocabularyId, id }, {
      hideUnderlying: true,
    });
    if (deleteResult.cancelled) {
      return;
    }
    popNewBottomSheet();
  };

  // 단어가 없으면 로딩 또는 빈 화면 표시
  if (!word) {
    return null;
  }

  return (
    <div className="relative">
      <div className="overflow-y-auto max-h-[calc(90vh-85px)] p-[20px] pb-[85px]">
        <div className="flex flex-col gap-[10px]">
          <div className="flex items-center justify-between">
            <div>
              <MemorizationStatus
                hideOverdue
                repetition={word.fsrs?.reps ?? 0}
                interval={Math.round(word.fsrs?.stability ?? 0)}
                ef={2.5}
                nextReview={word.fsrs?.next_review ?? null}
              />
            </div>
            <div className="flex items-center gap-[8px]">
              {!isPurchasedBook && (
                <>
                  <motion.button
                    onClick={() => {
                      vibrate({ duration: 5 });
                      handleEdit();
                    }}
                  >
                    <PencilSimple size={18} color="#FF70D4" />
                  </motion.button>
                  <motion.button
                    onClick={() => {
                      vibrate({ duration: 5 });
                      handleDelete();
                    }}
                  >
                    <Trash size={18} color="red" />
                  </motion.button>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-[6px]">
            <h3 className="text-[20px] font-[700] text-layout-black dark:text-layout-white break-words">
              {word.origin}
            </h3>
            <SpeakerButton text={word.origin} lang="en" label="단어 발음 듣기" />
          </div>
          <div className="flex items-center gap-[6px]">
            <span className="text-[14px] font-[400] text-layout-black dark:text-layout-white break-words">
              {word.meanings.join(", ")}
            </span>
            <SpeakerButton text={word.meanings.join(", ")} lang="ko" label="의미 듣기" />
          </div>
          {
            word.examples?.map((example, index) => {
              const originText = stripHtmlTags(example.origin || '').trim();
              if (!originText) return null;
              return (
                <div key={`${id}-${index}`} className="flex flex-col gap-[2px]">
                  <div className="flex items-center gap-[6px]">
                    <span
                      className="text-[14px] font-[400] text-layout-black dark:text-layout-white break-words"
                      dangerouslySetInnerHTML={{ __html: example.origin }}
                    />
                    <SpeakerButton text={originText} lang="en" label="예문 발음 듣기" />
                  </div>
                  <div className="flex items-center gap-[6px]">
                    <span
                      className="text-[14px] font-[400] text-layout-black dark:text-layout-white break-words"
                      dangerouslySetInnerHTML={{ __html: example.meaning }}
                    />
                    <SpeakerButton text={stripHtmlTags(example.meaning || '')} lang="ko" label="예문 의미 듣기" />
                  </div>
                </div>
              );
            })
          }
          {/* 예문 아래: 복습 예정 + 암기 진행 → 학습 기록 순 */}
          <WordMemoryProgress insights={insights} />
          <WordMemoryHistory insights={insights} userVocaId={userVocaId} />
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between gap-[15px] p-[20px] bg-layout-white dark:bg-layout-black">
        <motion.button
          className="
            flex-1
            h-[45px]
            rounded-[8px]
            bg-layout-gray-200
            text-layout-white dark:text-layout-black text-[16px] font-[700]
          "
          onClick={() => {
            vibrate({ duration: 5 });
            handleClose();
          }}
          whileTap={{ scale: 0.95 }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 15
          }}
          style={{ willChange: 'transform' }}
        >닫기</motion.button>
      </div>
    </div>
  );
};

export default WordDetaileNewBottomSheet;