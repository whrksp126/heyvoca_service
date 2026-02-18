import React, { useState, useEffect, useRef, useMemo } from 'react';
import { PencilSimple, CaretLeft, Plus, Trash, CaretDown } from '@phosphor-icons/react';

import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useVocabulary } from '../../context/VocabularyContext';
import { motion, AnimatePresence } from 'framer-motion';
// import { useWordSetBottomSheet } from '../vocabularySheets/WordBottomSheet';
import { getTextSound } from '../../utils/common';
import UpdateVocabularyWordsNewFullSheet from './UpdateVocabularyWordsNewFullSheet';
import MemorizationStatus from "../common/MemorizationStatus";
// import DeleteWordNewBottomSheet from '../newBottomSheet/DeleteWordNewBottomSheet';
import AddWordNewBottomSheet from '../newBottomSheet/AddWordNewBottomSheet';
import WordDetaileNewBottomSheet from '../newBottomSheet/WordDetaileNewBottomSheet';
import { TestSetupNewBottomSheet } from '../newBottomSheet/TestSetupNewBottomSheet';
import { vibrate } from '../../utils/osFunction';

const ITEMS_PER_PAGE = 30; // 한 번에 로드할 단어 개수
const SCROLL_THRESHOLD = 200; // 스크롤 끝에서 몇 px 전에 로드할지
const MAX_RENDERED_ITEMS = 100; // DOM에 최대 렌더링할 아이템 개수 (성능 최적화)
const ITEM_HEIGHT_ESTIMATE = 120; // 각 아이템의 예상 높이 (px)



const VocabularyWordsNewFullSheet = ({ id }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { popNewFullSheet, pushNewFullSheet } = useNewFullSheetActions();
  const { isVocabularySheetsLoading, getVocabularySheet } = useVocabulary();
  // const { showWordSetBottomSheet } = useWordSetBottomSheet();
  const { pushNewBottomSheet } = useNewBottomSheetActions();

  // React Compiler가 자동으로 메모이제이션 처리
  const vocabularySheet = getVocabularySheet(id);

  // 무한 스크롤을 위한 state
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const scrollContainerRef = useRef(null);
  const isLoadingRef = useRef(false);
  const prevDisplayCountRef = useRef(ITEMS_PER_PAGE);
  const [scrollTop, setScrollTop] = useState(0);
  const scrollTopRef = useRef(0);
  const rafIdRef = useRef(null);
  const vocabularySheetRef = useRef(vocabularySheet);
  const displayCountRef = useRef(displayCount);
  const hasMoreRef = useRef(false);
  const lastScrollTopRef = useRef(0);

  // ref 업데이트
  useEffect(() => {
    vocabularySheetRef.current = vocabularySheet;
    displayCountRef.current = displayCount;
    hasMoreRef.current = displayCount < (vocabularySheet?.words?.length || 0);
  }, [vocabularySheet, displayCount]);

  // vocabularySheet가 변경되면 displayCount 리셋
  useEffect(() => {
    if (vocabularySheet?.words) {
      setDisplayCount(ITEMS_PER_PAGE);
      prevDisplayCountRef.current = ITEMS_PER_PAGE;
      setScrollTop(0); // 스크롤 위치도 리셋
      scrollTopRef.current = 0;
      lastScrollTopRef.current = 0;
      setSortBy('updatedAt'); // 단어장이 바뀌면 정렬 초기화
      setShowSortDropdown(false);

      // 스크롤 컨테이너가 있으면 스크롤 위치도 리셋 (다음 프레임에서 실행하여 DOM 업데이트 보장)
      const container = scrollContainerRef.current;
      if (container) {
        requestAnimationFrame(() => {
          if (container.scrollTop !== 0) {
            container.scrollTop = 0;
          }
        });
      }
    }
  }, [vocabularySheet?.id]);

  const [sortBy, setSortBy] = useState('updatedAt'); // 'updatedAt', 'createdAt', 'alphabetical'
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  // 정렬 라벨 맵
  const sortLabels = {
    updatedAt: '최근 수정순',
    createdAt: '생성일순',
    alphabetical: '알파벳순',
  };

  // 표시할 단어 리스트 계산 (React Compiler가 자동으로 메모이제이션)
  const allDisplayedWords = useMemo(() => {
    if (!vocabularySheet?.words) return [];

    return [...vocabularySheet.words]
      .sort((a, b) => {
        if (sortBy === 'updatedAt') {
          const dateA = new Date(a.updatedAt || a.createdAt || 0);
          const dateB = new Date(b.updatedAt || b.createdAt || 0);
          return dateB - dateA;
        } else if (sortBy === 'createdAt') {
          const dateA = new Date(a.createdAt || 0);
          const dateB = new Date(b.createdAt || b.updatedAt || 0);
          return dateB - dateA;
        } else if (sortBy === 'alphabetical') {
          return (a.origin || "").localeCompare(b.origin || "");
        }
        return 0;
      });
  }, [vocabularySheet?.words, sortBy]);

  const wordsToShow = allDisplayedWords.slice(0, displayCount);

  // 윈도우 기반 렌더링: 보이는 영역 + 버퍼만 렌더링 (성능 최적화)
  const shouldUseWindowRendering = wordsToShow.length > MAX_RENDERED_ITEMS;

  const visibleRange = shouldUseWindowRendering ? (() => {
    const container = scrollContainerRef.current;
    if (!container) return { start: 0, end: MAX_RENDERED_ITEMS };

    const containerHeight = container.clientHeight;
    const buffer = Math.ceil(containerHeight / ITEM_HEIGHT_ESTIMATE) + 10;

    const currentScrollTop = scrollTop;
    const visibleStartIndex = Math.floor(currentScrollTop / ITEM_HEIGHT_ESTIMATE);
    const startIndex = Math.max(0, visibleStartIndex - buffer);
    const endIndex = Math.min(
      wordsToShow.length,
      startIndex + MAX_RENDERED_ITEMS
    );

    return { start: startIndex, end: endIndex };
  })() : { start: 0, end: wordsToShow.length };

  const displayedWords = wordsToShow.slice(visibleRange.start, visibleRange.end);

  // 더 로드할 단어가 있는지 확인
  const hasMore = vocabularySheet?.words
    ? displayCount < vocabularySheet.words.length
    : false;

  // 스크롤 핸들러 (ref 사용으로 클로저 문제 해결)
  const handleScroll = () => {
    const container = scrollContainerRef.current;
    const currentVocabularySheet = vocabularySheetRef.current;
    if (!container || !currentVocabularySheet?.words) return;

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
      setDisplayCount(prev => Math.min(prev + ITEMS_PER_PAGE, currentVocabularySheet.words.length));
    }

    // 오버스크롤 시에도 로딩 (끝에서 바운스할 때)
    if (distanceFromBottom < 0 && currentHasMore && !isLoadingRef.current) {
      isLoadingRef.current = true;
      prevDisplayCountRef.current = currentDisplayCount; // 로딩 시작 전 현재 개수 저장
      setIsLoadingMore(true);
      setDisplayCount(prev => Math.min(prev + ITEMS_PER_PAGE, currentVocabularySheet.words.length));
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

    // 초기 스크롤 위치 설정 (다음 프레임에서 실행하여 DOM이 완전히 렌더링된 후 보장)
    requestAnimationFrame(() => {
      if (scrollTopRef.current === 0 && container.scrollTop !== 0) {
        container.scrollTop = 0;
      }
    });

    container.addEventListener('scroll', handleScroll, { passive: true });

    // 초기 스크롤 이벤트 트리거 (현재 스크롤 위치 반영)
    handleScroll();

    return () => {
      container.removeEventListener('scroll', handleScroll);

      // cleanup 시 raf 취소
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // handleScroll을 의존성에서 제거하여 불필요한 재등록 방지

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
      <div className="
        flex items-center justify-center h-full
        sm:max-w-[500px] sm:h-[90vh] sm:rounded-[20px] sm:overflow-hidden
        bg-white dark:bg-[#111]
      ">
        <p>로딩 중...</p>
      </div>
    );
  }

  const handleEditClick = () => {
    pushNewFullSheet(UpdateVocabularyWordsNewFullSheet, { id }, {
      smFull: true,
      closeOnBackdropClick: true
    });
  };

  const handleAddClick = () => {
    vibrate({ duration: 5 });
    // showWordSetBottomSheet({vocabularyId: vocabularySheet.id});
    pushNewBottomSheet(AddWordNewBottomSheet, { vocabularyId: vocabularySheet.id }, {
      smFull: true,
      closeOnBackdropClick: true
    });
  };

  const handleCardClick = async (id) => {
    vibrate({ duration: 5 });
    console.log(`handleCardClick: ${id}`);
    pushNewBottomSheet(WordDetaileNewBottomSheet, { vocabularyId: vocabularySheet.id, id });
  };

  const handleStudyClick = () => {
    vibrate({ duration: 5 });
    pushNewBottomSheet(TestSetupNewBottomSheet, {
      vocabularySheetId: id,
      maxVocabularyCount: vocabularySheet.words.length,
      testType: 'test'
    }, {
      smFull: true,
      closeOnBackdropClick: true
    });
  };



  return (
    <div className="
      flex flex-col h-full w-full
      bg-white
    ">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      {/* Header - h-58.5px matches Figma */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '58.5px',
          padding: '20px 16px 14px 16px'
        }}
      >
        <div className="flex items-center gap-[10px]">
          <motion.button
            onClick={() => {
              vibrate({ duration: 5 });
              popNewFullSheet();
            }}
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
          <h1 style={{
            fontSize: '18px',
            fontWeight: 700,
            color: '#111',
            letterSpacing: '-0.36px',
            fontFamily: "'Pretendard Variable', sans-serif"
          }}>
            {vocabularySheet.title}
          </h1>
        </div>

        <div className="flex items-center gap-[10px]">
          <motion.button
            style={{
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary-main-600)'
            }}
            variants={buttonVariants}
            whileTap="tap"
            onClick={handleEditClick}
            aria-label="단어장 수정"
          >
            <PencilSimple size={20} weight="light" />
          </motion.button>

          <div className="relative">
            <motion.button
              style={{
                width: '20px',
                height: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--primary-main-600)'
              }}
              variants={buttonVariants}
              whileTap="tap"
              onClick={handleAddClick}
              aria-label="새 단어 추가"
            >
              <Plus size={20} weight="light" />
            </motion.button>

            {/* Tooltip when empty - Positioned relative to the 20x20 button container */}
            {vocabularySheet?.words?.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  position: 'absolute',
                  top: '33.75px',
                  right: '-4px',
                  width: '97px',
                  height: '30px',
                  backgroundColor: 'var(--primary-main-600)',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 10px',
                  zIndex: 20,
                  pointerEvents: 'none',
                  fontFamily: "'Pretendard Variable', sans-serif"
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: '-8px',
                    right: '8px',
                    width: 0,
                    height: 0,
                    borderLeft: '6px solid transparent',
                    borderRight: '6px solid transparent',
                    borderBottom: '13px solid var(--primary-main-600)'
                  }}
                />
                <span style={{
                  color: 'white',
                  fontSize: '12px',
                  fontWeight: 400,
                  lineHeight: 1.4,
                  letterSpacing: '-0.24px',
                  whiteSpace: 'nowrap'
                }}>
                  눌러서 단어 추가
                </span>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Filter & Study Section */}
      {vocabularySheet?.words?.length > 0 && (
        <div className="flex items-center justify-between px-[16px] py-[10px]">
          {/* Sort Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                vibrate({ duration: 5 });
                setShowSortDropdown(!showSortDropdown);
              }}
              className="
                flex items-center justify-between
                w-[120px] h-[35px]
                px-[15px]
                bg-white
                border-[0.5px] border-[#CCC] rounded-[6px]
              "
            >
              <span className="text-[14px] font-[400] text-[#111]">
                {sortLabels[sortBy] || '정렬'}
              </span>
              <CaretDown size={14} color="#111" />
            </button>

            <AnimatePresence>
              {showSortDropdown && (
                <>
                  <div
                    className="fixed inset-0 z-[10]"
                    onClick={() => setShowSortDropdown(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="
                      absolute top-[40px] left-0
                      w-[120px]
                      bg-white
                      border border-[#ccc] rounded-[6px]
                      shadow-lg
                      z-[11]
                      overflow-hidden
                    "
                  >
                    {Object.entries(sortLabels).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => {
                          vibrate({ duration: 5 });
                          setSortBy(key);
                          setShowSortDropdown(false);
                        }}
                        className={`
                          w-full h-[40px]
                          px-[15px]
                          text-left text-[13px]
                          ${sortBy === key ? 'text-primary-main-600 font-[600]' : 'text-[#666]'}
                          hover:bg-[#F5F5F5]
                          transition-colors
                        `}
                      >
                        {label}
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Study Button */}
          <motion.button
            onClick={handleStudyClick}
            whileTap={{ scale: 0.95 }}
            className="
              flex items-center justify-center
              h-[35px] px-[15px]
              bg-white
              border-[0.5px] border-primary-main-600 rounded-[6px]
            "
          >
            <span className="text-[14px] font-[700] text-primary-main-600">
              이 단어장으로 학습
            </span>
          </motion.button>
        </div>
      )}

      {/* Content */}
      <div
        ref={scrollContainerRef}
        className="flex flex-col flex-1 overflow-y-auto"
        style={{
          overscrollBehaviorY: 'auto',
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorX: 'contain',
          fontFamily: "'Pretendard Variable', sans-serif"
        }}
      >
        {vocabularySheet?.words?.length === 0 ? (
          <div className="flex flex-col items-center flex-1" style={{ paddingTop: '166.5px' }}>
            {/* Animated 8-bar spinner graphic - matches 'spinner 1' size (70x70) */}
            <div style={{
              position: 'relative',
              width: '70px',
              height: '70px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '15px'
            }}>
              {[...Array(8)].map((_, i) => (
                <motion.div
                  key={i}
                  style={{
                    position: 'absolute',
                    width: '4px',
                    height: '14px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--primary-main-600)',
                    transformOrigin: '50% 50%',
                    transform: `rotate(${i * 45}deg) translateY(-22px)`
                  }}
                  animate={{
                    opacity: [0.15, 1, 0.15],
                  }}
                  transition={{
                    duration: 1.2,
                    repeat: Infinity,
                    delay: i * 0.15,
                    ease: "linear"
                  }}
                />
              ))}
            </div>

            {/* Empty Text - text-16px, tracking-[-0.32px] */}
            <div style={{
              textAlign: 'center',
              fontSize: '16px',
              lineHeight: 1.4,
              letterSpacing: '-0.32px',
              marginBottom: '20px',
              fontFamily: "'Pretendard Variable', sans-serif"
            }}>
              <p style={{ fontWeight: 400, color: '#111', margin: 0 }}>아직 추가된 단어가 없어요!</p>
              <p style={{ margin: 0 }}>
                <span style={{ fontWeight: 700, color: '#FF70D4' }}>단어</span>
                <span style={{ fontWeight: 400, color: '#111' }}>를 추가해보세요 🤗</span>
              </p>
            </div>

            {/* Add Button - 136x40, rounded-8px */}
            <motion.button
              onClick={handleAddClick}
              whileTap={{ scale: 0.95 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                width: '136px',
                height: '40px',
                backgroundColor: 'var(--primary-main-600)',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <Plus size={16} color="white" weight="light" />
              <span style={{
                color: 'white',
                fontSize: '14px',
                fontWeight: 700,
                letterSpacing: '-0.28px',
                fontFamily: "'Pretendard Variable', sans-serif"
              }}>
                단어 추가하기
              </span>
            </motion.button>
          </div>
        ) : (
          <>
            {/* 상단 패딩 (스크롤 위치 보정) */}
            {visibleRange.start > 0 && (
              <div style={{ height: visibleRange.start * ITEM_HEIGHT_ESTIMATE }} />
            )}

            {displayedWords.map((item, localIndex) => {


              return (
                <div
                  key={item.id}
                  className="
                    flex flex-col gap-[10px] items-start
                    p-[20px] mx-[16px] mb-[10px]
                    rounded-[12px]
                    bg-[#F5F5F5]
                    cursor-pointer
                  "
                  onClick={() => handleCardClick(item.id)}
                >
                  <div className="flex justify-between items-center w-full">
                    <div className="flex items-center gap-[5px]">
                      <h3
                        onClick={(e) => {
                          e.stopPropagation();
                          getTextSound(item.origin, "en");
                        }}
                        className="
                          text-[16px] font-[700] text-[#111]
                          tracking-[-0.32px]
                          cursor-pointer relative
                          overflow-hidden
                          break-words 
                        "
                      >
                        {item.origin}
                      </h3>
                    </div>

                    <MemorizationStatus
                      repetition={item.sm2?.repetition ?? item.repetition ?? 0}
                      interval={item.sm2?.interval ?? item.interval ?? 0}
                      ef={item.sm2?.ef ?? item.ef ?? 2.5}
                      nextReview={item.sm2?.nextReview ?? item.nextReview}
                      wordId={item.id}
                      useRandomMessages={false}
                    />
                  </div>

                  <div className="flex flex-wrap w-full">
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        getTextSound(item.meanings.join(", "), "ko");
                      }}
                      className="
                        text-[12px] font-normal text-[#333]
                        tracking-[-0.24px]
                        cursor-pointer relative
                        overflow-hidden
                        break-words
                      "
                    >
                      {item.meanings.join(", ")}
                    </span>
                  </div>
                </div>
              );
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
                        background: 'linear-gradient(135deg, var(--primary-main-600) 0%, #FF69C6 100%)',
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
          </>
        )
        }
      </div>
    </div >
  );
};

export default VocabularyWordsNewFullSheet;
