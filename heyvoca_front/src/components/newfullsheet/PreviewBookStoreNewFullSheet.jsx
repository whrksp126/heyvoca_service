import React, { useState, useEffect, useRef } from 'react';
import { SpeakerHigh, CaretLeft } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { getTextSound } from '../../utils/common';
import { AddBookStoreNewBottomSheet } from '../newBottomSheet/AddBookStoreNewBottomSheet';
import { vibrate } from '../../utils/osFunction';

// Hook 제거 - 직접 컴포넌트 사용

const ITEMS_PER_PAGE = 30; // 한 번에 로드할 단어 개수
const SCROLL_THRESHOLD = 200; // 스크롤 끝에서 몇 px 전에 로드할지
const MAX_RENDERED_ITEMS = 100; // DOM에 최대 렌더링할 아이템 개수 (성능 최적화)
const ITEM_HEIGHT_ESTIMATE = 150; // 각 아이템의 예상 높이 (px, 예제 포함)

export const PreviewBookStoreNewFullSheet = ({ bookStoreVocabularySheet }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { popNewFullSheet } = useNewFullSheetActions();
  const { pushNewBottomSheet } = useNewBottomSheetActions();

  // 무한 스크롤을 위한 state
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const scrollContainerRef = useRef(null);
  const isLoadingRef = useRef(false);
  const prevDisplayCountRef = useRef(ITEMS_PER_PAGE);
  const [scrollTop, setScrollTop] = useState(0);
  const scrollTopRef = useRef(0);
  const rafIdRef = useRef(null);
  const bookStoreVocabularySheetRef = useRef(bookStoreVocabularySheet);
  const displayCountRef = useRef(displayCount);
  const hasMoreRef = useRef(false);
  const lastScrollTopRef = useRef(0);

  // ref 업데이트
  useEffect(() => {
    bookStoreVocabularySheetRef.current = bookStoreVocabularySheet;
    displayCountRef.current = displayCount;
    hasMoreRef.current = displayCount < (bookStoreVocabularySheet?.words?.length || 0);
  }, [bookStoreVocabularySheet, displayCount]);

  // bookStoreVocabularySheet가 변경되면 displayCount 리셋
  useEffect(() => {
    if (bookStoreVocabularySheet?.words) {
      setDisplayCount(ITEMS_PER_PAGE);
      prevDisplayCountRef.current = ITEMS_PER_PAGE;
      setScrollTop(0); // 스크롤 위치도 리셋
      scrollTopRef.current = 0;
      lastScrollTopRef.current = 0;
    }
  }, [bookStoreVocabularySheet?.id]);


  // 표시할 단어 리스트 계산 (React Compiler가 자동으로 메모이제이션)
  const allDisplayedWords = !bookStoreVocabularySheet?.words
    ? []
    : bookStoreVocabularySheet.words.slice(0, displayCount);

  // 윈도우 기반 렌더링: 보이는 영역 + 버퍼만 렌더링 (성능 최적화)
  // 아이템이 적을 때는 전체 렌더링 (오버헤드 방지)
  const shouldUseWindowRendering = allDisplayedWords.length > MAX_RENDERED_ITEMS;

  const visibleRange = shouldUseWindowRendering ? (() => {
    const container = scrollContainerRef.current;
    if (!container) return { start: 0, end: MAX_RENDERED_ITEMS };

    const containerHeight = container.clientHeight;
    const buffer = Math.ceil(containerHeight / ITEM_HEIGHT_ESTIMATE) + 10; // 위아래 버퍼 증가

    // scrollTop state를 사용하여 리렌더링 트리거
    const currentScrollTop = scrollTop;
    const visibleStartIndex = Math.floor(currentScrollTop / ITEM_HEIGHT_ESTIMATE);
    const startIndex = Math.max(0, visibleStartIndex - buffer);
    const endIndex = Math.min(
      allDisplayedWords.length,
      startIndex + MAX_RENDERED_ITEMS
    );

    return { start: startIndex, end: endIndex };
  })() : { start: 0, end: allDisplayedWords.length };

  const displayedWords = allDisplayedWords.slice(visibleRange.start, visibleRange.end);

  // 더 로드할 단어가 있는지 확인 (React Compiler가 자동으로 메모이제이션)
  const hasMore = bookStoreVocabularySheet?.words
    ? displayCount < bookStoreVocabularySheet.words.length
    : false;

  // 스크롤 핸들러 (ref 사용으로 클로저 문제 해결)
  const handleScroll = () => {
    const container = scrollContainerRef.current;
    const currentBookStore = bookStoreVocabularySheetRef.current;
    if (!container || !currentBookStore?.words) return;

    const { scrollTop: currentScrollTop, scrollHeight, clientHeight } = container;

    // ref로 스크롤 위치 저장
    scrollTopRef.current = currentScrollTop;

    // 스크롤 위치가 충분히 변경되었을 때만 state 업데이트 (throttle 효과)
    const scrollDiff = Math.abs(currentScrollTop - lastScrollTopRef.current);
    if (scrollDiff > 50 || rafIdRef.current === null) { // 50px 이상 변경되거나 첫 업데이트
      lastScrollTopRef.current = currentScrollTop;

      // requestAnimationFrame으로 스크롤 위치 업데이트 (성능 최적화)
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          setScrollTop(currentScrollTop); // visibleRange 재계산을 위한 리렌더링
          rafIdRef.current = null;
        });
      }
    }

    const distanceFromBottom = scrollHeight - currentScrollTop - clientHeight;
    const currentHasMore = hasMoreRef.current;
    const currentDisplayCount = displayCountRef.current;

    // 스크롤이 끝에 가까워지면 추가 로드
    if (distanceFromBottom < SCROLL_THRESHOLD && !isLoadingRef.current && currentHasMore) {
      isLoadingRef.current = true;
      prevDisplayCountRef.current = currentDisplayCount; // 로딩 시작 전 현재 개수 저장
      setIsLoadingMore(true);
      setDisplayCount(prev => Math.min(prev + ITEMS_PER_PAGE, currentBookStore.words.length));
    }

    // 오버스크롤 시에도 로딩 (끝에서 바운스할 때)
    if (distanceFromBottom < 0 && currentHasMore && !isLoadingRef.current) {
      isLoadingRef.current = true;
      prevDisplayCountRef.current = currentDisplayCount; // 로딩 시작 전 현재 개수 저장
      setIsLoadingMore(true);
      setDisplayCount(prev => Math.min(prev + ITEMS_PER_PAGE, currentBookStore.words.length));
    }
  };

  // displayCount가 업데이트되면 로딩 상태 해제
  useEffect(() => {
    if (isLoadingMore) {
      // 최소 표시 시간을 보장하여 로딩 인디케이터가 확실히 보이도록 함
      const timer = setTimeout(() => {
        setIsLoadingMore(false);
        isLoadingRef.current = false;
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [displayCount, isLoadingMore]);

  // 스크롤 이벤트 리스너 등록 (handleScroll 의존성 제거로 불필요한 재등록 방지)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // handleScroll을 의존성에서 제거하여 불필요한 재등록 방지

  // React Compiler가 자동으로 useCallback 처리
  const handleClose = () => {
    popNewFullSheet();
  };

  const handleAdd = async () => {
    pushNewBottomSheet(AddBookStoreNewBottomSheet, { bookStoreVocabularySheet }, {
      hideUnderlying: true,
      isBackdropClickClosable: false,
      isDragToCloseEnabled: true
    });
  };

  return (
    <div className="
      flex flex-col 
      w-full h-full
      bg-layout-white dark:bg-layout-black
    ">
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
            handleClose();
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
        ">단어장 미리보기</h1>
      </div>

      <div
        ref={scrollContainerRef}
        className="
          flex flex-col gap-[10px]
          flex-1
          p-[20px] pb-[105px]
          overflow-y-auto
        "
        style={{
          overscrollBehaviorY: 'auto',
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorX: 'contain'
        }}
      >
        <div className="flex flex-col gap-[5px]">
          <div className="
            flex items-center gap-[5px]
            text-[16px] font-[700] text-layout-black dark:text-layout-white
          ">
            {bookStoreVocabularySheet.category && (
              <div
                style={{
                  backgroundColor: bookStoreVocabularySheet.color.main
                }}
                className="
                  py-[3px] px-[6px]
                  rounded-[50px]
                  text-[8px] font-[700] text-layout-white
                "
              >
                {bookStoreVocabularySheet.category}
              </div>
            )}
            {bookStoreVocabularySheet.name}
          </div>
          <div className="text-[12px] font-[400] text-layout-black">
            {bookStoreVocabularySheet.words.length}개의 단어
          </div>
        </div>
        <div className="flex flex-col gap-[10px] flex-1">
          {/* 상단 패딩 (스크롤 위치 보정) */}
          {visibleRange.start > 0 && (
            <div style={{ height: visibleRange.start * ITEM_HEIGHT_ESTIMATE }} />
          )}

          {displayedWords.map((item, localIndex) => {
            if (item.meanings === null || item.origin === null) return null;
            return (
              <li
                key={item.id}
                style={{
                  backgroundColor: bookStoreVocabularySheet.color.background
                }}
                className="
                  flex gap-[10px] items-start
                  p-[20px]
                  rounded-[12px]
                "
              >

                <div
                  className="
                  flex flex-col gap-[10px]
                  w-full
                "
                >
                  <div className="flex flex-wrap">
                    <h3
                      onClick={() => {
                        getTextSound(item.origin, "en");
                      }}
                      className="
                      text-[16px] font-[700] text-layout-black
                      cursor-pointer
                      break-words 
                    "
                      id={`word-${item.id}`}
                    >
                      {item.origin}
                    </h3>
                  </div>
                  <div className="flex flex-wrap">
                    <span
                      onClick={() => {
                        getTextSound(item.meanings.join(", "), "ko");
                      }}
                      className="
                      text-[12px] font-[400] text-layout-black
                      cursor-pointer
                      break-words
                    "
                      id={`meaning-${item.id}`}
                    >
                      {item.meanings.join(", ")}
                    </span>
                  </div>
                  {item?.examples?.map((example, example_index) => (
                    <div key={`${item.id}-${example_index}`}>
                      <div className="flex flex-wrap">
                        <p
                          onClick={() => {
                            getTextSound(example.origin, "en");
                          }}
                          className="
                        text-[12px] font-[400] text-layout-black
                        cursor-pointer
                        break-words
                      "
                          id={`example-${item.id}-${example_index}`}
                        >
                          <span dangerouslySetInnerHTML={{ __html: example.origin }} />
                        </p>
                      </div>
                      <div className="flex flex-wrap">
                        <p
                          onClick={() => {
                            getTextSound(example.meaning, "ko");
                          }}
                          className="
                        text-[12px] font-[400] text-layout-black
                        cursor-pointer
                        break-words
                      "
                          id={`example-${item.id}-${example_index}-meaning`}
                        >
                          {example.meaning}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    color: bookStoreVocabularySheet.color.main
                  }}
                  className="
                  flex gap-[8px]
                  text-[20px]
                ">
                  <button onClick={() => getTextSound(item.origin, "en")}>
                    <SpeakerHigh weight="fill" />
                  </button>
                </div>
              </li>
            )
          })}

          {/* 하단 패딩 (스크롤 위치 보정) */}
          {visibleRange.end < allDisplayedWords.length && (
            <div style={{ height: (allDisplayedWords.length - visibleRange.end) * ITEM_HEIGHT_ESTIMATE }} />
          )}

          {/* 로딩 인디케이터 */}
          {hasMore && isLoadingMore && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 0.3,
                ease: [0.4, 0, 0.2, 1]
              }}
              className="
                  flex flex-col items-center justify-center
                  py-[24px] px-[20px]
                  gap-[12px]
                "
            >
              {/* 점들 애니메이션 */}
              <div className="flex items-center gap-[6px]">
                {[0, 1, 2].map((index) => (
                  <motion.div
                    key={index}
                    className="
                        w-[8px] h-[8px]
                        rounded-full
                      "
                    style={{
                      background: 'linear-gradient(135deg, #FF70D4 0%, #FF69C6 100%)',
                      boxShadow: '0 2px 8px rgba(255, 141, 212, 0.4)'
                    }}
                    animate={{
                      scale: [1, 1.3, 1],
                      opacity: [0.5, 1, 0.5]
                    }}
                    transition={{
                      duration: 1.2,
                      repeat: Infinity,
                      delay: index * 0.2,
                      ease: "easeInOut"
                    }}
                  />
                ))}
              </div>

              {/* 텍스트 */}
              <motion.span
                className="
                    text-[13px] font-[400]
                    text-[#999]
                  "
                animate={{
                  opacity: [0.6, 1, 0.6]
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              >
                새로운 단어를 불러오는 중...
              </motion.span>
            </motion.div>
          )}
        </div>
      </div>
      <div className="
        absolute bottom-0 left-0 right-0
        flex items-center justify-between gap-[15px] 
        p-[20px]
        bg-layout-white dark:bg-layout-black
      ">
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
        >취소</motion.button>
        <motion.button
          style={{
            backgroundColor: bookStoreVocabularySheet.color.main
          }}
          className="
            flex-1
            h-[45px]
            rounded-[8px]
            text-layout-white dark:text-layout-black text-[16px] font-[700]
          "
          onClick={() => {
            vibrate({ duration: 5 });
            handleAdd();
          }}
          whileTap={{ scale: 0.95 }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 15
          }}
        >추가</motion.button>
      </div>
    </div>
  );
};

