import React, { useState, useEffect, useRef } from 'react';
import { PencilSimple, CaretLeft, Plus, Trash, SpeakerHigh, Plant, Carrot, EggCrack, Leaf } from '@phosphor-icons/react';

import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useVocabulary } from '../../context/VocabularyContext';
import { motion } from 'framer-motion';
// import { useWordSetBottomSheet } from '../vocabularySheets/WordBottomSheet';
import { getTextSound } from '../../utils/common';
import UpdateVocabularyWordsNewFullSheet from './UpdateVocabularyWordsNewFullSheet';
import MemorizationStatus from "../common/MemorizationStatus";
// import DeleteWordNewBottomSheet from '../newBottomSheet/DeleteWordNewBottomSheet';
import AddWordNewBottomSheet from '../newBottomSheet/AddWordNewBottomSheet';
import WordDetaileNewBottomSheet from '../newBottomSheet/WordDetaileNewBottomSheet';

const ITEMS_PER_PAGE = 30; // 한 번에 로드할 단어 개수
const SCROLL_THRESHOLD = 200; // 스크롤 끝에서 몇 px 전에 로드할지
const MAX_RENDERED_ITEMS = 100; // DOM에 최대 렌더링할 아이템 개수 (성능 최적화)
const ITEM_HEIGHT_ESTIMATE = 120; // 각 아이템의 예상 높이 (px)

// 암기 상태 판단 함수
const getMemoryState = (word) => {
  const repetition = word.repetition ?? 0;
  const interval = word.interval ?? 0;
  const ef = word.ef ?? 2.5;

  // 미학습: repetition === 0 && interval === 0
  if (repetition === 0 && interval === 0) {
    return {
      type: 'unlearned',
      label: '미학습',
      icon: EggCrack,
      color: '#9D835A',
      borderColor: '#9D835A',
      bgColor: '#FFFCF3'
    };
  }

  // 암기율 계산
  let score = 0;
  score += repetition * 15;
  score += interval * 2;
  score += (ef - 1.3) * 20;
  const percent = Math.max(0, Math.min(100, Math.round(score)));

  // repetition === 0이지만 interval > 0인 경우 (학습 시도했지만 틀린 상태)는 단기로 분류
  if (repetition === 0 && interval > 0) {
    return {
      type: 'shortTerm',
      label: '단기암기',
      icon: Leaf,
      color: '#77CE4F',
      borderColor: '#77CE4F',
      bgColor: '#F2FFEB'
    };
  }

  // 단기 암기 (0-29%)
  if (percent < 30) {
    return {
      type: 'shortTerm',
      label: '단기암기',
      icon: Leaf,
      color: '#77CE4F',
      borderColor: '#77CE4F',
      bgColor: '#F2FFEB'
    };
  }
  
  // 중기 암기 (30-69%)
  if (percent < 70) {
    return {
      type: 'mediumTerm',
      label: '중기암기',
      icon: Plant,
      color: '#38CE38',
      borderColor: '#38CE38',
      bgColor: '#EBFFEE'
    };
  }
  
  // 장기 암기 (70-100%)
  return {
    type: 'longTerm',
    label: '장기암기',
    icon: Carrot,
    color: '#F68300',
    borderColor: '#F68300',
    bgColor: '#FFF8E8'
  };
};

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
  
  
  // 표시할 단어 리스트 계산 (React Compiler가 자동으로 메모이제이션)
  const allDisplayedWords = !vocabularySheet?.words 
    ? [] 
    : vocabularySheet.words.slice(0, displayCount);
  
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
    // showWordSetBottomSheet({vocabularyId: vocabularySheet.id});
    pushNewBottomSheet(AddWordNewBottomSheet, { vocabularyId: vocabularySheet.id }, {
      smFull: true,
      closeOnBackdropClick: true
    });
  };

  const handleCardClick = async (id) => {
    console.log(`handleCardClick: ${id}`);
    pushNewBottomSheet(WordDetaileNewBottomSheet, { vocabularyId: vocabularySheet.id, id });
  };

  

  return (
    <div className="
      flex flex-col h-full w-full
      bg-white
    ">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      {/* Header */}
      <div className="
        relative
        flex items-center justify-between
        h-[55px] 
        pt-[20px] px-[16px] pb-[14px]
      ">
        <div className="flex items-center gap-[4px]">
          <motion.button
            onClick={popNewFullSheet}
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
      <div 
        ref={scrollContainerRef}
        className="flex flex-col gap-[15px] flex-1 py-[10px] px-[16px] overflow-y-auto"
        style={{
          overscrollBehaviorY: 'auto',
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorX: 'contain'
        }}
      >
        {/* 상단 패딩 (스크롤 위치 보정) */}
        {visibleRange.start > 0 && (
          <div style={{ height: visibleRange.start * ITEM_HEIGHT_ESTIMATE }} />
        )}
        
        {displayedWords.map((item, localIndex) => {
          return (
            <li
              key={item.id}
              className="
                flex gap-[10px] items-start
                p-[20px]
                rounded-[12px]
                bg-[#F5F5F5]
              "
              onClick={() => handleCardClick(item.id)}
            >
              
              <div 
                className="
                  flex flex-col gap-[10px] flex-1
                "
              >
                <div className="flex flex-wrap">
                  <h3
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
                    className="
                      text-[16px] font-[700] text-[#111]
                      cursor-pointer relative
                      overflow-hidden
                      break-words 
                    "
                    id={`word-${item.id}`}
                  >
                    {item.origin.split('').map((char, index) => (
                      <span
                        key={index}
                        className="inline-block"
                      >
                        {char}
                      </span>
                    ))}
                  </h3>
                </div>
                <div className="flex flex-wrap">
                  <span
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
                    className="
                      text-[12px] font-[400] text-[#111]
                      cursor-pointer relative
                      overflow-hidden
                      break-words
                    "
                    id={`meaning-${item.id}`}
                  >
                    {item.meanings.join(", ").split('').map((char, index) => (
                      <span
                        key={index}
                        className="inline-block"
                      >
                        {char}
                      </span>
                    ))}
                  </span>
                </div>
              </div>
              <div>
                {(() => {
                  const memoryState = getMemoryState(item);
                  const IconComponent = memoryState.icon;
                  return (
                    <div 
                      className="
                        flex items-center gap-[3px]
                        w-[max-content]
                        py-[3px] px-[5px]
                        border rounded-[3px]
                        text-[10px] font-[600]
                      "
                      style={{
                        borderColor: memoryState.borderColor,
                        backgroundColor: memoryState.bgColor,
                        color: memoryState.color
                      }}
                    >
                      <IconComponent size={10} weight="fill" />
                      <span>{memoryState.label}</span>
                    </div>
                  );
                })()}
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
                    background: 'linear-gradient(135deg, #FF8DD4 0%, #FF69C6 100%)',
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

export default VocabularyWordsNewFullSheet;

