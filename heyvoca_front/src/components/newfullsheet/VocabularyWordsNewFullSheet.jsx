import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CaretLeft, Plus, CaretUp, Lock } from '@phosphor-icons/react';

import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useVocabulary } from '../../context/VocabularyContext';
import { motion, AnimatePresence } from 'framer-motion';
import AddWordNewBottomSheet from '../newBottomSheet/AddWordNewBottomSheet';
import WordDetaileNewBottomSheet from '../newBottomSheet/WordDetaileNewBottomSheet';
import { TestSetupNewBottomSheet } from '../newBottomSheet/TestSetupNewBottomSheet';
import { vibrate, showToast } from '../../utils/osFunction';
import BookFieldHero from '../vocabularySheets/BookFieldHero';
import WordRow from '../vocabularySheets/WordRow';
import {
  bookStageCounts,
  bookDueTodayCount,
  bookWiltedCount,
  bookUnverifiedCount,
  wordHealth,
  wordVerification,
  daysToReview,
  isUnplanted,
} from '../../utils/vocaCrop';
import { HEALTH_STATES } from '../../utils/crop';

const ITEMS_PER_PAGE = 30;    // 한 번에 로드할 단어 개수
const SCROLL_THRESHOLD = 200; // 스크롤 끝에서 몇 px 전에 로드할지
const MAX_RENDERED_ITEMS = 100;
const ITEM_HEIGHT = 58;       // 시안 §5 — 행 높이 58px 고정
// 목록 위에 얹힌 것들의 높이 합(히어로 341 + 칩줄 72). 윈도우 렌더링이 스크롤 위치를
// 행 index 로 바꿀 때 이만큼을 먼저 빼야 엉뚱한 구간을 그린다.
const LIST_OFFSET = 413;

/**
 * 단어장 안 — 단어 목록. 시안 vocabooks §1② · §4 · §5.
 *
 * 위는 이 단어장만의 밭(홈 히어로를 341px 로 축소 · 팻말 4개 · 겹쳐 뜬 주 CTA),
 * 아래는 그 밭에 심긴 단어들이다. 풀시트라 바텀 네비를 띄우지 않는다.
 * 헤더는 배경을 깔지 않고 일러스트 위에 얹는다 — 흰 막대를 두면 밭 위쪽이 잘려 나간다.
 */
const VocabularyWordsNewFullSheet = ({ id }) => {
  "use memo";

  const { popNewFullSheet } = useNewFullSheetActions();
  const { isVocabularySheetsLoading, getVocabularySheet } = useVocabulary();
  const { pushNewBottomSheet } = useNewBottomSheetActions();

  const vocabularySheet = getVocabularySheet(id);

  const [filter, setFilter] = useState('all'); // all | today | wilted | unverified
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const scrollContainerRef = useRef(null);
  const isLoadingRef = useRef(false);
  const [scrollTop, setScrollTop] = useState(0);
  const scrollTopRef = useRef(0);
  const rafIdRef = useRef(null);
  const vocabularySheetRef = useRef(vocabularySheet);
  const displayCountRef = useRef(displayCount);
  const hasMoreRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const [showTopBtn, setShowTopBtn] = useState(false);
  const topBtnTimerRef = useRef(null);

  const words = vocabularySheet?.words;

  // 정렬은 기존과 같은 기본값(최근 수정순)을 유지한다 — 시안에 정렬 컨트롤이 없다
  const sortedWords = useMemo(() => {
    if (!words) return [];
    return [...words].sort((a, b) => {
      const dateA = new Date(a.updatedAt || a.createdAt || 0);
      const dateB = new Date(b.updatedAt || b.createdAt || 0);
      return dateB - dateA;
    });
  }, [words]);

  const counts = useMemo(() => bookStageCounts(words), [words]);
  const todayCnt = useMemo(() => bookDueTodayCount(words), [words]);
  const wiltedCnt = useMemo(() => bookWiltedCount(words), [words]);
  const unverifiedCnt = useMemo(() => bookUnverifiedCount(words), [words]);

  const allDisplayedWords = useMemo(() => {
    if (filter === 'today') {
      return sortedWords.filter((w) => !isUnplanted(w) && (daysToReview(w) ?? 1) <= 0);
    }
    if (filter === 'wilted') {
      return sortedWords.filter((w) => {
        const h = wordHealth(w);
        return h === HEALTH_STATES.WILTED || h === HEALTH_STATES.CRITICAL || h === HEALTH_STATES.ROTTEN;
      });
    }
    if (filter === 'unverified') {
      return sortedWords.filter((w) => wordVerification(w) === 'unverified');
    }
    return sortedWords;
  }, [sortedWords, filter]);

  useEffect(() => {
    vocabularySheetRef.current = vocabularySheet;
    displayCountRef.current = displayCount;
    hasMoreRef.current = displayCount < allDisplayedWords.length;
  }, [vocabularySheet, displayCount, allDisplayedWords.length]);

  // 단어장이 바뀌거나 필터가 바뀌면 처음부터 다시 보여 준다
  useEffect(() => {
    setDisplayCount(ITEMS_PER_PAGE);
    setScrollTop(0);
    scrollTopRef.current = 0;
    lastScrollTopRef.current = 0;

    const container = scrollContainerRef.current;
    if (container) {
      requestAnimationFrame(() => {
        if (container.scrollTop !== 0) container.scrollTop = 0;
      });
    }
  }, [vocabularySheet?.id, filter]);

  const wordsToShow = allDisplayedWords.slice(0, displayCount);

  // 윈도우 기반 렌더링: 보이는 영역 + 버퍼만 렌더링
  const shouldUseWindowRendering = wordsToShow.length > MAX_RENDERED_ITEMS;

  const visibleRange = shouldUseWindowRendering ? (() => {
    const container = scrollContainerRef.current;
    if (!container) return { start: 0, end: MAX_RENDERED_ITEMS };

    const buffer = Math.ceil(container.clientHeight / ITEM_HEIGHT) + 10;
    const listScroll = Math.max(0, scrollTop - LIST_OFFSET);
    const startIndex = Math.max(0, Math.floor(listScroll / ITEM_HEIGHT) - buffer);
    const endIndex = Math.min(wordsToShow.length, startIndex + MAX_RENDERED_ITEMS);
    return { start: startIndex, end: endIndex };
  })() : { start: 0, end: wordsToShow.length };

  const displayedWords = wordsToShow.slice(visibleRange.start, visibleRange.end);
  const hasMore = displayCount < allDisplayedWords.length;

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop: currentScrollTop, scrollHeight, clientHeight } = container;
    scrollTopRef.current = currentScrollTop;

    const scrollDiff = Math.abs(currentScrollTop - lastScrollTopRef.current);
    if (scrollDiff > 50 || rafIdRef.current === null) {
      lastScrollTopRef.current = currentScrollTop;
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          setScrollTop(scrollTopRef.current);
          rafIdRef.current = null;
        });
      }
    }

    if (currentScrollTop > 300) {
      setShowTopBtn(true);
      if (topBtnTimerRef.current) clearTimeout(topBtnTimerRef.current);
      topBtnTimerRef.current = setTimeout(() => setShowTopBtn(false), 2000);
    } else {
      setShowTopBtn(false);
    }

    const distanceFromBottom = scrollHeight - currentScrollTop - clientHeight;
    if (distanceFromBottom < SCROLL_THRESHOLD && !isLoadingRef.current && hasMoreRef.current) {
      isLoadingRef.current = true;
      setIsLoadingMore(true);
      setDisplayCount((prev) => prev + ITEMS_PER_PAGE);
    }
  };

  useEffect(() => {
    if (isLoadingMore) {
      const timer = setTimeout(() => {
        setIsLoadingMore(false);
        isLoadingRef.current = false;
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [displayCount, isLoadingMore]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (topBtnTimerRef.current) clearTimeout(topBtnTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buttonVariants = {
    tap: {
      scale: 0.85,
      rotate: -8,
      backgroundColor: 'rgba(255, 141, 212, 0.2)',
      transition: { type: 'spring', stiffness: 500, damping: 15 },
    },
  };

  if (isVocabularySheetsLoading) {
    return (
      <div className="
        flex items-center justify-center h-full
        sm:max-w-[500px] sm:h-[90vh] sm:rounded-[20px] sm:overflow-hidden
        bg-layout-white dark:bg-layout-black
      ">
        <p>로딩 중...</p>
      </div>
    );
  }

  // 단어장이 삭제된 직후 등 — 화면을 그릴 근거가 없으면 아무것도 그리지 않는다
  if (!vocabularySheet) return null;

  const isPurchasedBook = vocabularySheet?.vocaBookStoreId != null;
  const totalCount = words?.length || 0;

  const handleAddClick = () => {
    vibrate({ duration: 5 });
    if (isPurchasedBook) {
      showToast('제공받은 단어장은 단어를 추가할 수 없어요.');
      return;
    }
    pushNewBottomSheet(AddWordNewBottomSheet, { vocabularyId: vocabularySheet.id }, {
      smFull: true,
      closeOnBackdropClick: true,
    });
  };

  const handleCardClick = (wordId) => {
    vibrate({ duration: 5 });
    pushNewBottomSheet(WordDetaileNewBottomSheet, { vocabularyId: vocabularySheet.id, id: wordId });
  };

  // 학습 시작은 이 CTA 하나로 모은다 (시안 §6 — 상세 시트는 읽는 곳이지 시작하는 곳이 아니다)
  const handleStudyClick = () => {
    vibrate({ duration: 5 });
    pushNewBottomSheet(TestSetupNewBottomSheet, {
      vocabularySheetId: id,
      maxVocabularyCount: totalCount,
      testType: 'exam',
    }, {
      smFull: true,
      closeOnBackdropClick: true,
    });
  };

  const chips = [
    { key: 'all', label: '전체', count: totalCount },
    { key: 'today', label: '오늘', count: todayCnt },
    { key: 'wilted', label: '시듦', count: wiltedCnt },
    ...(unverifiedCnt > 0 ? [{ key: 'unverified', label: '미검증', count: unverifiedCnt }] : []),
  ];

  return (
    <div className="relative flex flex-col h-full w-full bg-layout-white dark:bg-layout-black">
      {/*
        헤더 — 배경을 깔지 않고 일러스트 위에 얹는다 (시안 §4).
        하늘이 밝은 크림색이라 검은 글자와 아이콘이 그대로 읽힌다.
      */}
      <div
        data-page-header
        className="absolute left-0 right-0 z-[22] flex items-center gap-[10px] h-[52px] px-[16px]"
        style={{ top: 'max(var(--status-bar-height), env(safe-area-inset-top, 0px))' }}
      >
        <motion.button
          onClick={() => {
            vibrate({ duration: 5 });
            popNewFullSheet();
          }}
          className="shrink-0 rounded-[8px] text-farm-ink"
          whileTap={{ scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
          aria-label="뒤로"
        >
          <CaretLeft size={22} weight="bold" />
        </motion.button>

        <h1 className="flex-1 min-w-0 truncate text-[18px] font-[700] tracking-[-0.03em] text-farm-ink">
          {vocabularySheet.title}
        </h1>

        <div className="relative shrink-0">
          <motion.button
            className="flex items-center justify-center w-[32px] h-[32px] rounded-[8px]"
            style={{ color: isPurchasedBook ? 'var(--layout-gray-300)' : 'var(--layout-gray-400)' }}
            variants={buttonVariants}
            whileTap="tap"
            onClick={handleAddClick}
            aria-label={isPurchasedBook ? '제공받은 단어장은 단어를 추가할 수 없어요' : '새 단어 추가'}
          >
            {isPurchasedBook ? <Lock size={18} weight="light" /> : <Plus size={20} weight="light" />}
          </motion.button>

          {!isPurchasedBook && totalCount === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="
                absolute top-[36px] right-[-4px] z-[20]
                flex items-center justify-center
                h-[30px] px-[10px] rounded-[6px]
                bg-primary-main-600
                pointer-events-none
              "
            >
              <span className="absolute top-[-8px] right-[10px] w-0 h-0 border-l-[6px] border-r-[6px] border-b-[13px] border-l-transparent border-r-transparent border-b-primary-main-600" />
              <span className="whitespace-nowrap text-[12px] font-[400] tracking-[-0.24px] text-layout-white dark:text-layout-black">
                눌러서 단어 추가
              </span>
            </motion.div>
          )}
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className="flex flex-col flex-1 overflow-y-auto"
        style={{
          overscrollBehaviorY: 'auto',
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorX: 'contain',
          fontFamily: "'Pretendard Variable', sans-serif",
        }}
      >
        {/* 이 단어장만의 밭 + 겹쳐 뜬 주 CTA */}
        <BookFieldHero counts={counts}>
          <motion.button
            type="button"
            onClick={handleStudyClick}
            whileTap={{ scale: 0.98 }}
            className="
              flex items-center justify-center w-full h-[52px] rounded-[12px]
              text-[16px] font-[700] tracking-[-0.02em] text-layout-white
              bg-[linear-gradient(180deg,#FF88DC_0%,#FF70D4_100%)]
              shadow-[inset_0_1px_0_rgba(255,255,255,0.34),0_8px_20px_rgba(255,112,212,0.38)]
            "
          >
            이 단어장 물주기
          </motion.button>
        </BookFieldHero>

        {/* 필터 칩 — 팻말이 이미 단계별 수를 말하므로 여기는 눌러서 걸러지는 숫자만 둔다 */}
        <div className="flex gap-[6px] shrink-0 px-[16px] pt-[32px] pb-[10px] overflow-x-auto">
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
                <b className="font-[800]">{chip.count}</b>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col px-[16px] pb-[20px]">
          {totalCount === 0 ? (
            <div className="flex flex-col items-center pt-[40px]">
              <div
                className="text-center text-[16px] leading-[1.4] tracking-[-0.32px] mb-[20px]"
                style={{ fontFamily: "'Pretendard Variable', sans-serif" }}
              >
                {isPurchasedBook ? (
                  <p className="m-0 font-[400] text-layout-black dark:text-layout-white">
                    이 단어장에는 단어가 없어요.
                  </p>
                ) : (
                  <>
                    <p className="m-0 font-[400] text-layout-black dark:text-layout-white">
                      아직 심은 단어가 없어요.
                    </p>
                    <p className="m-0">
                      <span className="font-[700] text-primary-main-500">단어</span>
                      <span className="font-[400] text-layout-black dark:text-layout-white">를 추가해 밭을 채워 보세요.</span>
                    </p>
                  </>
                )}
              </div>

              <motion.button
                onClick={handleAddClick}
                whileTap={{ scale: 0.95 }}
                className={`
                  flex items-center justify-center gap-[5px]
                  w-[136px] h-[40px] rounded-[8px]
                  ${isPurchasedBook ? 'bg-layout-gray-200' : 'bg-primary-main-600'}
                `}
                aria-label={isPurchasedBook ? '제공받은 단어장은 단어를 추가할 수 없어요' : '단어 추가하기'}
              >
                {isPurchasedBook ? (
                  <Lock size={16} weight="light" className="text-layout-white dark:text-layout-black" />
                ) : (
                  <Plus size={16} weight="light" className="text-layout-white dark:text-layout-black" />
                )}
                <span className="text-[14px] font-[700] text-layout-white dark:text-layout-black">
                  단어 추가하기
                </span>
              </motion.button>
            </div>
          ) : allDisplayedWords.length === 0 ? (
            <p className="pt-[40px] text-center text-[14px] font-[400] text-layout-gray-300">
              여기에 해당하는 단어가 없어요.
            </p>
          ) : (
            <>
              {visibleRange.start > 0 && (
                <div style={{ height: visibleRange.start * ITEM_HEIGHT }} />
              )}

              {displayedWords.map((item) => (
                <WordRow key={item.id} word={item} onClick={() => handleCardClick(item.id)} />
              ))}

              {visibleRange.end < wordsToShow.length && (
                <div style={{ height: (wordsToShow.length - visibleRange.end) * ITEM_HEIGHT }} />
              )}

              {hasMore && isLoadingMore && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                  className="flex items-center justify-center gap-[6px] py-[20px]"
                >
                  {[0, 1, 2].map((index) => (
                    <motion.div
                      key={index}
                      className="w-[8px] h-[8px] rounded-full bg-primary-main-600"
                      animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: index * 0.2, ease: 'easeInOut' }}
                    />
                  ))}
                </motion.div>
              )}
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showTopBtn && (
          <motion.button
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 20 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              vibrate({ duration: 5 });
              scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="
              absolute right-[20px] bottom-[30px] z-[50]
              flex items-center justify-center
              w-[44px] h-[44px] rounded-full
              bg-primary-main-600 text-layout-white
              shadow-[0_4px_12px_rgba(255,112,212,0.4)]
            "
            aria-label="맨 위로"
          >
            <CaretUp size={24} weight="bold" className="dark:text-layout-black" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VocabularyWordsNewFullSheet;
