import React, { useState, useEffect, useRef } from 'react';
import { CaretLeft, CaretUp } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import SpeakerButton from '../common/SpeakerButton';
import { AddBookStoreNewBottomSheet } from '../newBottomSheet/AddBookStoreNewBottomSheet';
import { AlertNewBottomSheet } from '../newBottomSheet/AlertNewBottomSheet';
import PreviewWordNewBottomSheet from '../newBottomSheet/PreviewWordNewBottomSheet';
import { vibrate } from '../../utils/osFunction';
import { useVocabulary } from '../../context/VocabularyContext';
import { useExampleSettings } from '../../context/ExampleSettingsContext';
import gem from '../../assets/images/gem.png';
import BookFieldHero from '../vocabularySheets/BookFieldHero';
import CropImage from '../farm/CropImage';
import { HEALTH_STATES } from '../../utils/crop';

/**
 * 상점 단어장 미리보기 — 사기 전에 이 밭에 무엇이 심길지 본다.
 *
 * 예전 화면은 서비스에서 유일하게 남은 구버전 디자인이었다. 단어마다 색 배경 카드를
 * 통째로 깔아 한 화면에 서너 개밖에 안 들어갔고, 산 뒤에 열리는 단어장 화면
 * (VocabularyWordsNewFullSheet)과 생김새가 전혀 달라 같은 단어장으로 보이지 않았다.
 *
 * 그래서 **산 뒤의 화면과 같은 골격**으로 맞췄다 — 밭 히어로 + 팻말, 58px 단어 행.
 * 다른 점은 딱 둘이다.
 *   ① 팻말이 씨앗 하나뿐이다. 아직 아무것도 심지 않았으니 다른 단계가 있을 수 없다
 *      (시안 shop §4 가 이 수를 "심을 씨앗 N개"라고 부른다).
 *   ② 오른쪽 복습 예정일 자리에 발음 버튼이 온다. 예정일은 사고 나서야 생긴다.
 */

const ITEMS_PER_PAGE = 30;
const SCROLL_THRESHOLD = 200;
const MAX_RENDERED_ITEMS = 100;
const ROW_HEIGHT = 58;      // 산 뒤 화면과 같은 행 높이 (시안 vocabooks §5)
const ROW_HEIGHT_EX = 118;  // 예문을 켜면 뜻 아래로 두 줄이 더 붙는다 (실측값)
// 목록 위에 얹힌 것들의 높이 합(히어로 341 + 요약줄 58). 윈도우 렌더링이 스크롤 위치를
// 행 index 로 바꿀 때 이만큼을 먼저 빼야 엉뚱한 구간을 그리지 않는다.
const LIST_OFFSET = 399;
// 히어로를 감췄을 때 목록 위에 남는 높이 — 헤더(52) + 목록과 헤더 사이 숨 쉴 틈
const HEADER_OFFSET = 64;

// onPrimaryAction/primaryActionLabel: 지정 시 하단 주요 버튼을 구매/추가 대신 커스텀 동작으로 대체
// (온보딩에서 '이 단어장으로 시작하기' 선택에 재사용). 미지정이면 서점 기본(구매/추가).
//
// hideFieldHero: 밭 그림과 "심을 씨앗 N개" 줄을 빼고 단어 목록만 보여 준다.
//   온보딩이 켠다. 온보딩은 바로 앞 화면에서 이미 밭을 한 장 보여 줬고, 씨앗 수는 다음
//   화면(예고)에서 "오늘은 14알만 심어요"로 다시 말한다. 같은 그림과 같은 수를 세 번
//   연속으로 보게 되므로 여기서는 뺀다. 서점·사전에서 열 때는 그대로 나온다 —
//   거기서는 이 화면이 밭을 보여 주는 유일한 자리다.
export const PreviewBookStoreNewFullSheet = ({
  bookStoreVocabularySheet, onPrimaryAction, primaryActionLabel, hideFieldHero = false,
}) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { popNewFullSheet } = useNewFullSheetActions();
  const { pushNewBottomSheet } = useNewBottomSheetActions();
  const { vocabularySheets } = useVocabulary();
  const { showExamples } = useExampleSettings();
  const itemHeightEstimate = showExamples ? ROW_HEIGHT_EX : ROW_HEIGHT;

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

  const totalCount = bookStoreVocabularySheet?.words?.length || 0;

  // ref 업데이트
  useEffect(() => {
    bookStoreVocabularySheetRef.current = bookStoreVocabularySheet;
    displayCountRef.current = displayCount;
    hasMoreRef.current = displayCount < totalCount;
  }, [bookStoreVocabularySheet, displayCount, totalCount]);

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
    const buffer = Math.ceil(containerHeight / itemHeightEstimate) + 10; // 위아래 버퍼 증가

    // 목록 위에 얹힌 것들(히어로 341 + 요약줄)만큼을 먼저 빼야 엉뚱한 구간을 그리지 않는다.
    // 히어로를 감추면 그 자리에 헤더 높이만큼의 여백만 남는다.
    const currentScrollTop = Math.max(0, scrollTop - (hideFieldHero ? HEADER_OFFSET : LIST_OFFSET));
    const visibleStartIndex = Math.floor(currentScrollTop / itemHeightEstimate);
    const startIndex = Math.max(0, visibleStartIndex - buffer);
    const endIndex = Math.min(
      allDisplayedWords.length,
      startIndex + MAX_RENDERED_ITEMS
    );

    return { start: startIndex, end: endIndex };
  })() : { start: 0, end: allDisplayedWords.length };

  const displayedWords = allDisplayedWords.slice(visibleRange.start, visibleRange.end);

  // 더 로드할 단어가 있는지 확인 (React Compiler가 자동으로 메모이제이션)
  const hasMore = displayCount < totalCount;

  // React Compiler가 자동으로 useCallback 처리
  const handleClose = () => {
    popNewFullSheet();
  };

  const handleAdd = async () => {
    // 이미 보유 중인 단어장인지 확인
    const isAlreadyOwned = vocabularySheets.some(
      sheet => String(sheet.vocaBookStoreId) === String(bookStoreVocabularySheet.id)
    );

    if (isAlreadyOwned) {
      vibrate({ duration: 10 });
      pushNewBottomSheet(AlertNewBottomSheet, {
        title: '이미 보유 중인 단어장입니다.'
      }, {
        isBackdropClickClosable: true,
        isDragToCloseEnabled: true
      });
      return;
    }

    pushNewBottomSheet(AddBookStoreNewBottomSheet, { bookStoreVocabularySheet }, {
      hideUnderlying: true,
      isBackdropClickClosable: false,
      isDragToCloseEnabled: true
    });
  };

  const [showTopBtn, setShowTopBtn] = useState(false);
  const topBtnTimerRef = useRef(null);

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

    // Top 버튼 표시 제어: 300px 이상 스크롤 시 표시
    if (currentScrollTop > 300) {
      setShowTopBtn(true);
      // 기존 타이머 클리어
      if (topBtnTimerRef.current) {
        clearTimeout(topBtnTimerRef.current);
      }
      // 2초 뒤 숨김 처리
      topBtnTimerRef.current = setTimeout(() => {
        setShowTopBtn(false);
      }, 2000);
    } else {
      setShowTopBtn(false);
    }

    const distanceFromBottom = scrollHeight - currentScrollTop - clientHeight;
    const currentHasMore = hasMoreRef.current;
    const currentDisplayCount = displayCountRef.current;

    // 스크롤이 끝에 가까워지면 추가 로드 (끝에서 바운스하는 오버스크롤도 같이 받는다)
    if (distanceFromBottom < SCROLL_THRESHOLD && !isLoadingRef.current && currentHasMore) {
      isLoadingRef.current = true;
      prevDisplayCountRef.current = currentDisplayCount; // 로딩 시작 전 현재 개수 저장
      setIsLoadingMore(true);
      setDisplayCount(prev => Math.min(prev + ITEMS_PER_PAGE, currentBookStore.words.length));
    }
  };

  // 스크롤 이벤트 리스너 등록 (handleScroll 의존성 제거로 불필요한 재등록 방지)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (topBtnTimerRef.current) {
        clearTimeout(topBtnTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // handleScroll을 의존성에서 제거하여 불필요한 재등록 방지

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

  const isEmptyBook = totalCount === 0;

  /*
    단어 한 줄 → 상세 시트.

    산 뒤 목록이 여는 `WordDetaileNewBottomSheet` 는 쓸 수 없다. 그 시트는
    VocabularyContext 에서 **내 단어**를 꺼내 기억 상태·복습 예정일을 그리는데,
    미리보기 단어는 아직 내 것이 아니라 조회가 전부 빈손이 된다.
    그래서 살지 말지 정하는 데 필요한 것만 담은 시트를 따로 연다.
  */
  const openWordDetail = (item) => {
    vibrate({ duration: 5 });
    pushNewBottomSheet(PreviewWordNewBottomSheet, { word: item });
  };

  return (
    <div className="relative flex flex-col h-full w-full bg-layout-white dark:bg-layout-black">
      {/*
        헤더 — 배경을 깔지 않고 일러스트 위에 얹는다 (산 뒤 화면과 같은 처리).
        하늘이 밝은 크림색이라 검은 글자와 아이콘이 그대로 읽힌다.
      */}
      <div
        data-page-header
        className={`
          absolute left-0 right-0 z-[22] flex items-center gap-[10px] h-[52px] px-[16px]
          ${hideFieldHero ? 'bg-layout-white dark:bg-layout-black' : ''}
        `}
        style={{ top: 'max(var(--status-bar-height), env(safe-area-inset-top, 0px))' }}
      >
        <motion.button
          onClick={() => {
            vibrate({ duration: 5 });
            handleClose();
          }}
          className="shrink-0 rounded-[8px] text-farm-ink"
          whileTap={{ scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
          aria-label="뒤로"
        >
          <CaretLeft size={22} weight="bold" />
        </motion.button>

        <h1 className="flex-1 min-w-0 truncate text-[18px] font-[700] tracking-[-0.03em] text-farm-ink">
          {bookStoreVocabularySheet?.name}
        </h1>
      </div>

      <div
        ref={scrollContainerRef}
        className="flex flex-col flex-1 overflow-y-auto pb-[105px]"
        style={{
          overscrollBehaviorY: 'auto',
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorX: 'contain',
        }}
      >
        {hideFieldHero ? (
          // 헤더가 목록 위에 떠 있으므로 그만큼만 비워 둔다
          <div className="shrink-0" style={{ height: HEADER_OFFSET }} />
        ) : (
          <>
            {/* 이 단어장이 열어 줄 밭 — 전부 씨앗이다. 아직 아무것도 심지 않았다 */}
            <BookFieldHero counts={{ seed: totalCount }} />

            {/* 시안 shop §4 가 카드에 넣으라고 한 줄을 여기서도 같은 말로 반복한다.
                카드에서 읽고 들어온 값이 상세에서 사라지면 같은 상품인지 확신이 안 선다. */}
            <div className="flex items-center gap-[12px] shrink-0 px-[16px] pt-[26px] pb-[12px]">
              <span className="flex items-center gap-[5px] text-[13px] font-[800] tracking-[-0.03em] text-layout-black dark:text-layout-white">
                {/* 상점 카드의 "심을 씨앗 N개" 줄과 같은 크기로 보이게 한다.
                    카드 쪽은 raw <img> 13px 이고 여기는 단계 비율(0.64)이 곱해지므로 20 이 그 값이다 */}
                <CropImage stage="seed" health={HEALTH_STATES.FRESH} size={36} alt="씨앗" />
                {isEmptyBook ? '씨앗 0 — 직접 추가' : `심을 씨앗 ${totalCount.toLocaleString()}개`}
              </span>
              {/* 검증 표시는 두지 않는다 — 상점에 올라온 단어장은 전부 검증된 것이라
                  굳이 적으면 "검증 안 된 것도 있다"는 뜻이 되어 버린다. */}
            </div>
          </>
        )}

        <div className="flex flex-col px-[16px]">
          {/* 상단 패딩 (스크롤 위치 보정) */}
          {visibleRange.start > 0 && (
            <div style={{ height: visibleRange.start * itemHeightEstimate }} />
          )}

          {displayedWords.map((item) => {
            if (item.meanings === null || item.origin === null) return null;
            return (
              /*
                줄 전체가 눌린다 — 누르면 단어 상세 시트가 열린다.
                <button> 으로 감싸지 않는 이유는 오른쪽 발음 버튼이 이미 버튼이라
                버튼 안에 버튼이 들어가기 때문이다. 발음 쪽은 아래에서 전파를 끊는다.
              */
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => openWordDetail(item)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openWordDetail(item);
                  }
                }}
                className={`
                  flex gap-[11px] w-full shrink-0 text-left cursor-pointer
                  border-b border-[#F4F4F4] dark:border-layout-gray-dark
                  ${showExamples ? 'items-start py-[10px]' : 'items-center h-[58px]'}
                `}
              >
                {/* 사기 전이라 모든 단어가 같은 씨앗이다 — 산 뒤에는 여기가 실제 단계로 바뀐다 */}
                <CropImage stage="seed" health={HEALTH_STATES.FRESH} size={52} className="shrink-0" />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-[5px]">
                    <span
                      className="min-w-0 truncate text-[15px] font-[700] tracking-[-0.02em] text-layout-black dark:text-layout-white"
                      id={`word-${item.id}`}
                    >
                      {item.origin}
                    </span>
                  </div>
                  <div
                    className="truncate mt-[1px] text-[12px] tracking-[-0.02em] text-layout-gray-400 dark:text-layout-gray-300"
                    id={`meaning-${item.id}`}
                  >
                    {item.meanings.join(', ')}
                  </div>

                  {showExamples && item?.examples?.map((example, example_index) => {
                    // 예문 키 호환: 앱 표준 origin/meaning + admin 저장본 en/ko 모두 허용
                    const exOrigin = example.origin ?? example.en ?? '';
                    const exMeaning = example.meaning ?? example.ko ?? '';
                    if (!exOrigin && !exMeaning) return null;
                    return (
                      <div
                        key={`${item.id}-${example_index}`}
                        className="mt-[6px] pl-[8px] border-l-[2px] border-[#F0F0F0] dark:border-layout-gray-dark"
                      >
                        <p
                          className="text-[11.5px] leading-[1.45] tracking-[-0.02em] text-layout-gray-400 dark:text-layout-gray-300 break-words"
                          id={`example-${item.id}-${example_index}`}
                        >
                          <span dangerouslySetInnerHTML={{ __html: exOrigin }} />
                        </p>
                        <p
                          className="text-[11.5px] leading-[1.45] tracking-[-0.02em] text-layout-gray-300 dark:text-layout-gray-400 break-words"
                          id={`example-${item.id}-${example_index}-meaning`}
                        >
                          <span dangerouslySetInnerHTML={{ __html: exMeaning }} />
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* 산 뒤 화면에서 복습 예정일이 앉는 자리. 사기 전에는 예정일이 없어
                    그 자리에 발음을 둔다 — 살지 말지 정할 때 실제로 쓰는 정보다.
                    소리만 듣고 싶은 것이니 여기서는 상세 시트를 열지 않는다. */}
                <span
                  className="shrink-0"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <SpeakerButton text={item.origin} lang="en" label="단어 발음 듣기" />
                </span>
              </div>
            );
          })}

          {/* 하단 패딩 (스크롤 위치 보정) */}
          {visibleRange.end < allDisplayedWords.length && (
            <div style={{ height: (allDisplayedWords.length - visibleRange.end) * itemHeightEstimate }} />
          )}

          {/* 로딩 인디케이터 */}
          {hasMore && isLoadingMore && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="flex flex-col items-center justify-center gap-[12px] py-[24px] px-[20px]"
            >
              <div className="flex items-center gap-[6px]">
                {[0, 1, 2].map((index) => (
                  <motion.div
                    key={index}
                    className="w-[8px] h-[8px] rounded-full"
                    style={{
                      background: 'linear-gradient(135deg, #FF70D4 0%, #FF69C6 100%)',
                      boxShadow: '0 2px 8px rgba(255, 141, 212, 0.4)'
                    }}
                    animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: index * 0.2, ease: 'easeInOut' }}
                  />
                ))}
              </div>
              <motion.span
                className="text-[13px] font-[400] text-[#999]"
                animate={{ opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              >
                새로운 단어를 불러오는 중...
              </motion.span>
            </motion.div>
          )}
        </div>
      </div>

      {/*
        구매 버튼 — 목록이 길어 히어로가 화면 밖으로 나가도 늘 손에 닿아야 하므로 아래에 고정한다.
        "취소"는 두지 않는다. 헤더의 뒤로 화살표가 이미 그 일을 하고, 시트를 아래로 끌어도 닫힌다 —
        같은 일을 하는 버튼을 나란히 두면 어느 쪽이 되돌리기인지 매번 읽어야 한다.
      */}
      <div className="
        absolute bottom-0 left-0 right-0
        px-[20px] pt-[50px] pb-[20px]
        bg-gradient-to-b from-transparent to-layout-white
        dark:to-layout-black
      ">
        <motion.button
          className="
            flex items-center justify-center gap-[5px]
            w-full h-[52px] rounded-[12px]
            text-[16px] font-[700] tracking-[-0.02em] text-layout-white
            bg-[linear-gradient(180deg,#FF88DC_0%,#FF70D4_100%)]
            shadow-[inset_0_1px_0_rgba(255,255,255,0.34),0_8px_20px_rgba(255,112,212,0.38)]
          "
          onClick={() => {
            vibrate({ duration: 5 });
            if (onPrimaryAction) { onPrimaryAction(); return; }
            handleAdd();
          }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 500, damping: 15 }}
        >
          {onPrimaryAction ? (
            primaryActionLabel || '선택'
          ) : bookStoreVocabularySheet.gem > 0 ? (
            <>
              <img src={gem} alt="" draggable={false} className="w-[20px] h-[18px]" />
              {bookStoreVocabularySheet.gem}개로 구매
            </>
          ) : (
            '내 단어장에 추가'
          )}
        </motion.button>
      </div>

      {/* Top 버튼 */}
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
              absolute right-[20px] bottom-[110px]
              flex items-center justify-center
              w-[44px] h-[44px]
              rounded-full
              bg-primary-main-600
              text-layout-white
              shadow-[0_4px_12px_rgba(255,112,212,0.4)]
              z-[50]
            "
          >
            <CaretUp size={24} weight="bold" className="dark:text-layout-black" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};
