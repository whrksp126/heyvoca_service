import React, { useCallback, useMemo, useState } from 'react';
import { Plus } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useVocabulary } from '../../context/VocabularyContext';
import PullToRefresh from '../common/PullToRefresh';
import { useNewFullSheet } from '../../hooks/useNewFullSheet';
import { useVocabularyManageNewBottomSheet } from '../newBottomSheet/VocabularyManageNewBottomSheet';
import VocabularyWordsNewFullSheet from '../newfullsheet/VocabularyWordsNewFullSheet';
import VocaBookCard, { buildBookRow, isScriptBook } from './VocaBookCard';
import { vibrate } from '../../utils/osFunction';

/**
 * 단어장 목록 — 시안 vocabooks §1① · §2 (학습장 "단어장" 탭 본문).
 *
 * 밭 썸네일로 상태를 그림으로 먼저 읽고, 바로 아래 단계 분포를 본다.
 * 진행률 바가 없다 — 142/200 은 "이 밭이 지금 어떤 상태인가"에 답하지 못한다.
 *
 * 예전에는 이 화면 전체가 components/vocabularySheets/Main.jsx였다. 상단에 "단어장|글자"
 * 탭이 생기면서(2026-09-29) Main은 탭 껍데기만 맡고, 이 파일이 "단어장" 탭 콘텐츠를 맡는다.
 */
const VocaBooksTab = () => {
  "use memo";

  const { pushNewFullSheet } = useNewFullSheet();
  const { vocabularySheets, fetchVocabularySheets, fetchRecentStudy } = useVocabulary();
  const { showVocabularyManageNewBottomSheet } = useVocabularyManageNewBottomSheet();

  const [filter, setFilter] = useState('all'); // all | care | recent

  // 당겨서 새로고침 — 단어장 목록(+단어 사전)과 최근 학습 기록을 함께 최신화한다
  const handlePullToRefresh = useCallback(async () => {
    await Promise.all([fetchVocabularySheets(), fetchRecentStudy()]);
  }, [fetchVocabularySheets, fetchRecentStudy]);

  // 카드마다 필요한 파생값을 한 번만 계산한다 — 목록·칩·배지가 같은 수를 봐야 한다
  // 글자(문자 학습) 단어장은 이 목록에 보이면 안 된다(2026-09-30) — 학습하기(TakeTest,
  // testType='script')가 내부적으로 일반 단어장처럼 취급해 진행도를 쌓지만, 사용자에게는
  // 학습장 "글자" 탭(components/script/ScriptFieldBody.jsx)에서만 보여야 한다. 백엔드가
  // book_kind 필드로 표시해 주면 그걸로 거른다(필드가 없으면 지금처럼 전부 보인다 —
  // 백엔드가 아직 글자장을 별도로 표시하지 않는 환경에서도 안전).
  const books = useMemo(() => vocabularySheets
    .filter((book) => !isScriptBook(book))
    .map(buildBookRow), [vocabularySheets]);

  const careCount = books.filter((row) => row.care > 0).length;

  const visible = useMemo(() => {
    if (filter === 'care') return books.filter((row) => row.care > 0);
    if (filter === 'recent') return [...books].sort((a, b) => b.touchedAt - a.touchedAt);
    return books;
  }, [books, filter]);

  const handleCardClick = (id) => {
    vibrate({ duration: 5 });
    pushNewFullSheet(VocabularyWordsNewFullSheet, { id }, {
      smFull: true,
      closeOnBackdropClick: true,
    });
  };

  const handleAddBook = () => {
    vibrate({ duration: 5 });
    showVocabularyManageNewBottomSheet();
  };

  const chips = [
    { key: 'all', label: '전체', count: books.length },
    { key: 'care', label: '돌봄 필요', count: careCount },
    { key: 'recent', label: '최근 학습', count: null },
  ];

  return (
    <PullToRefresh
      as={motion.div}
      onRefresh={handlePullToRefresh}
      className="h-full overflow-y-auto"
      initial={{ opacity: 0, y: 20, transition: { duration: 0.2 } }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.2 } }}
      exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
    >
      {/* 필터 칩 — 읽기만 하는 숫자 대신 눌러서 걸러지는 숫자를 둔다 (시안 §4) */}
      <div className="flex gap-[6px] shrink-0 px-[16px] pb-[10px] overflow-x-auto">
        {chips.map((chip) => {
          const on = filter === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => {
                vibrate({ duration: 5 });
                setFilter(chip.key);
              }}
              className={`
                flex items-center gap-[4px] shrink-0
                h-[30px] px-[11px] rounded-full
                text-[12.5px] font-[700] tracking-[-0.02em] whitespace-nowrap
                ${on
                  ? 'bg-primary-main-100 dark:bg-primary-main-dark text-primary-main-600'
                  : 'bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-gray-400 dark:text-layout-gray-200'}
              `}
            >
              {chip.label}
              {chip.count !== null && <b className="font-[800]">{chip.count}</b>}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-[10px] px-[16px] pb-[20px]">
        {visible.map((row) => (
          <VocaBookCard key={row.book.id} row={row} onClick={() => handleCardClick(row.book.id)} />
        ))}

        <button
          type="button"
          onClick={handleAddBook}
          className="
            flex items-center justify-center gap-[6px]
            h-[48px] rounded-[12px]
            border-[1.5px] border-dashed border-layout-gray-100 dark:border-layout-gray-dark
            text-[14px] font-[700] tracking-[-0.02em] text-layout-gray-300
          "
        >
          <Plus size={15} weight="bold" className="text-layout-gray-200" />
          단어장 만들기
        </button>
      </div>
    </PullToRefresh>
  );
};

export default VocaBooksTab;
