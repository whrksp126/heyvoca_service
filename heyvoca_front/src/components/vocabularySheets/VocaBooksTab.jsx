import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, CaretDown, Check } from '@phosphor-icons/react';
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
// 정렬 — 선택값은 localStorage 에 기억한다. 'default' 는 서버가 내려준 순서(기존 동작) 그대로.
// 수정순 = 단어장 updatedAt(있으면) 아니면 안의 단어가 마지막으로 바뀐 시각, 등록순 = 단어장 createdAt
// (GET /vocaBooks 가 아직 안 내려주면 등록순 옵션은 숨긴다).
const SORT_KEY = 'heyvoca_vocabooks_sort';
const SORT_OPTIONS = [
  { key: 'default', label: '기본순' },
  { key: 'updated_desc', label: '최근 수정순' },
  { key: 'updated_asc', label: '오래된 수정순' },
  { key: 'created_desc', label: '최근 등록순', needsCreated: true },
  { key: 'created_asc', label: '오래된 등록순', needsCreated: true },
  { key: 'name_asc', label: '이름순 (가나다·ABC)' },
  { key: 'name_desc', label: '이름 역순' },
];
const readSort = () => {
  try {
    const v = localStorage.getItem(SORT_KEY);
    return SORT_OPTIONS.some((o) => o.key === v) ? v : 'default';
  } catch (e) {
    return 'default';
  }
};
const timeOf = (v) => {
  const t = v ? new Date(v).getTime() : 0;
  return Number.isNaN(t) ? 0 : t;
};
const sortRows = (rows, sort) => {
  if (sort === 'default') return rows;
  const updated = (r) => Math.max(timeOf(r.book.updatedAt), r.touchedAt || 0);
  const created = (r) => timeOf(r.book.createdAt);
  const name = (a, b) => String(a.book.title || '').localeCompare(String(b.book.title || ''), 'ko', { numeric: true });
  const cmp = {
    updated_desc: (a, b) => updated(b) - updated(a),
    updated_asc: (a, b) => updated(a) - updated(b),
    created_desc: (a, b) => created(b) - created(a),
    created_asc: (a, b) => created(a) - created(b),
    name_asc: name,
    name_desc: (a, b) => name(b, a),
  }[sort];
  return cmp ? [...rows].sort(cmp) : rows;
};

const VocaBooksTab = () => {
  "use memo";

  const { pushNewFullSheet } = useNewFullSheet();
  const { vocabularySheets, fetchVocabularySheets, fetchRecentStudy } = useVocabulary();
  const { showVocabularyManageNewBottomSheet } = useVocabularyManageNewBottomSheet();

  const [filter, setFilter] = useState('all'); // all | care | recent
  const [sort, setSort] = useState(readSort);
  const [sortOpen, setSortOpen] = useState(false);
  const sortWrapRef = useRef(null);

  useEffect(() => {
    if (!sortOpen) return undefined;
    const close = (e) => {
      if (sortWrapRef.current && !sortWrapRef.current.contains(e.target)) setSortOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [sortOpen]);

  const handlePickSort = (key) => {
    vibrate({ duration: 5 });
    setSort(key);
    setSortOpen(false);
    try { localStorage.setItem(SORT_KEY, key); } catch (e) { /* 기억만 못 할 뿐 */ }
  };

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

  const hasCreated = books.some((row) => !!row.book.createdAt);
  const sortOptions = SORT_OPTIONS.filter((o) => !o.needsCreated || hasCreated);
  const activeSort = sortOptions.find((o) => o.key === sort) || SORT_OPTIONS[0];

  const visible = useMemo(() => {
    let rows = books;
    if (filter === 'care') rows = books.filter((row) => row.care > 0);
    else if (filter === 'recent') rows = [...books].sort((a, b) => b.touchedAt - a.touchedAt);
    const effective = sortOptions.some((o) => o.key === sort) ? sort : 'default';
    return sortRows(rows, effective);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [books, filter, sort, hasCreated]);

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
      <div className="relative flex items-center gap-[8px] px-[16px] pb-[10px]">
      <div className="flex flex-1 min-w-0 gap-[6px] overflow-x-auto">
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

        <div ref={sortWrapRef} className="shrink-0">
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={sortOpen}
            onClick={() => { vibrate({ duration: 5 }); setSortOpen((o) => !o); }}
            className={`
              flex items-center gap-[3px] h-[30px] pl-[11px] pr-[8px] rounded-full
              text-[12.5px] font-[700] tracking-[-0.02em] whitespace-nowrap
              ${sort !== 'default'
                ? 'bg-primary-main-100 dark:bg-primary-main-dark text-primary-main-600'
                : 'bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-gray-400 dark:text-layout-gray-200'}
            `}
          >
            {activeSort.key === 'default' ? '정렬' : activeSort.label.split(' (')[0]}
            <CaretDown size={12} weight="bold" className={`transition-transform ${sortOpen ? 'rotate-180' : ''}`} />
          </button>
          {sortOpen && (
            <ul
              role="listbox"
              className="
                absolute right-[16px] top-[34px] z-30 min-w-[168px] py-[4px]
                rounded-[12px] border border-layout-gray-100 dark:border-white/[.08]
                bg-layout-white dark:bg-layout-black
                shadow-[0_4px_16px_rgba(0,0,0,0.12)]
              "
            >
              {sortOptions.map((opt) => {
                const active = opt.key === activeSort.key;
                return (
                  <li key={opt.key} role="option" aria-selected={active}>
                    <button
                      type="button"
                      onClick={() => handlePickSort(opt.key)}
                      className={`
                        w-full flex items-center justify-between gap-[8px] px-[14px] py-[10px] text-left
                        text-[13.5px] tracking-[-0.02em]
                        ${active
                          ? 'font-[800] text-primary-main-600 bg-primary-main-100 dark:bg-layout-gray-dark'
                          : 'font-[600] text-layout-black dark:text-layout-white'}
                      `}
                    >
                      {opt.label}
                      {active && <Check size={13} weight="bold" className="shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
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
