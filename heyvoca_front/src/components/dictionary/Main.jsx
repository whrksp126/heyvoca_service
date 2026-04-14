import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MagnifyingGlass, Plus, SlidersHorizontal, ArrowUp, SpeakerHigh } from '@phosphor-icons/react';
import { useVocabulary } from '../../context/VocabularyContext';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { backendUrl, fetchDataAsync, getTextSound } from '../../utils/common';
import MemorizationStatus from '../common/MemorizationStatus';
import AddWordNewBottomSheet from '../newBottomSheet/AddWordNewBottomSheet';
import VocabularyWordsNewFullSheet from '../newfullsheet/VocabularyWordsNewFullSheet';
import { PreviewBookStoreNewFullSheet } from '../newfullsheet/PreviewBookStoreNewFullSheet';
import { getBookStoreDetailApi } from '../../api/bookStore';
import { vibrate } from '../../utils/osFunction';
import { motion, AnimatePresence } from 'framer-motion';

const ITEMS_PER_PAGE = 30;
const SCROLL_THRESHOLD = 200;

const Main = () => {
  "use memo";

  const { userDictionary, isUserDictionaryLoading, vocaBooks } = useVocabulary();
  const { pushNewBottomSheet } = useNewBottomSheetActions();
  const { pushNewFullSheet } = useNewFullSheetActions();

  // 검색 상태
  const [searchQuery, setSearchQuery] = useState('');
  const [myWordResults, setMyWordResults] = useState([]);
  const [storeResults, setStoreResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceTimerRef = useRef(null);

  // 자동완성 드롭다운 상태
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedWord, setSelectedWord] = useState(null);
  const suggestionsRef = useRef(null);

  // 기본 뷰 상태
  const [sortBy, setSortBy] = useState('updatedAt');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [showTopBtn, setShowTopBtn] = useState(false);
  const scrollContainerRef = useRef(null);
  const isLoadingRef = useRef(false);
  const topBtnTimerRef = useRef(null);

  const sortLabels = {
    updatedAt: '최근 수정순',
    createdAt: '생성일순',
    alphabetical: '알파벳순',
  };

  // 전체 단어 목록 정렬
  const allWords = useMemo(() => {
    const words = Object.values(userDictionary);
    return [...words].sort((a, b) => {
      if (sortBy === 'updatedAt') {
        return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
      } else if (sortBy === 'createdAt') {
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      } else if (sortBy === 'alphabetical') {
        return (a.origin || '').localeCompare(b.origin || '');
      }
      return 0;
    });
  }, [userDictionary, sortBy]);

  const wordsToShow = allWords.slice(0, displayCount);
  const hasMore = displayCount < allWords.length;

  // 스크롤 핸들러
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    if (scrollTop > 300) {
      setShowTopBtn(true);
      if (topBtnTimerRef.current) clearTimeout(topBtnTimerRef.current);
      topBtnTimerRef.current = setTimeout(() => setShowTopBtn(false), 2000);
    } else {
      setShowTopBtn(false);
    }

    if (distanceFromBottom < SCROLL_THRESHOLD && !isLoadingRef.current && hasMore) {
      isLoadingRef.current = true;
      setIsLoadingMore(true);
      setDisplayCount(prev => Math.min(prev + ITEMS_PER_PAGE, allWords.length));
    }
  }, [hasMore, allWords.length]);

  useEffect(() => {
    if (!isLoadingMore) return;
    isLoadingRef.current = false;
    setIsLoadingMore(false);
  }, [wordsToShow.length]);

  // 드롭다운 추천 검색 (타이핑 중 호출)
  const fetchSuggestions = useCallback(async (query) => {
    if (!query.trim() || query.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    try {
      const response = await fetchDataAsync(`${backendUrl}/search/partial/en`, 'GET', { word: query });
      if (response?.code === 200) {
        setSuggestions(response.data || []);
        setShowSuggestions(true);
      }
    } catch (err) {
      console.error('추천 검색 오류:', err);
    }
  }, []);

  // 단어 선택 후 내 단어장/상점 검색 (선택 시에만 호출)
  const executeSearch = useCallback(async (query) => {
    if (!query.trim() || query.trim().length < 2) {
      setMyWordResults([]);
      setStoreResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const [storeResponse] = await Promise.allSettled([
        fetchDataAsync(`${backendUrl}/search/bookstore/word`, 'GET', { word: query }),
      ]);

      const lowerQuery = query.toLowerCase();
      const myMatches = Object.values(userDictionary).filter(
        word => word.origin?.toLowerCase().startsWith(lowerQuery)
      );
      setMyWordResults(myMatches);

      if (storeResponse.status === 'fulfilled' && storeResponse.value?.code === 200) {
        setStoreResults(storeResponse.value.data || []);
      } else {
        setStoreResults([]);
      }
    } catch (err) {
      console.error('검색 오류:', err);
    } finally {
      setIsSearching(false);
    }
  }, [userDictionary]);

  // 검색어 변경 시 debounce로 추천 검색
  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    setSelectedWord(null);
    setMyWordResults([]);
    setStoreResults([]);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    if (!query.trim() || query.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchSuggestions(query);
    }, 300);
  };

  // 드롭다운 항목 클릭
  const handleSuggestionClick = (item) => {
    vibrate({ duration: 5 });
    getTextSound(item.word, 'en');
    setSelectedWord(item);
    setSearchQuery(item.word);
    setSuggestions([]);
    setShowSuggestions(false);
    executeSearch(item.word);
  };

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (topBtnTimerRef.current) clearTimeout(topBtnTimerRef.current);
    };
  }, []);

  // sortBy 변경 시 displayCount 리셋
  useEffect(() => {
    setDisplayCount(ITEMS_PER_PAGE);
  }, [sortBy]);

  // 서점 단어장 상세 열기
  const handleStoreVocaClick = async (bookstoreId) => {
    vibrate({ duration: 5 });
    try {
      const result = await getBookStoreDetailApi(bookstoreId);
      if (result?.code === 200) {
        pushNewFullSheet(PreviewBookStoreNewFullSheet, { bookStoreVocabularySheet: result.data });
      }
    } catch (err) {
      console.error('서점 상세 조회 오류:', err);
    }
  };

  // 내 단어장 열기
  const handleMyVocaBookClick = (vocaBookId) => {
    vibrate({ duration: 5 });
    pushNewFullSheet(VocabularyWordsNewFullSheet, { id: vocaBookId });
  };

  // 단어 추가 바텀시트 열기
  const handleAddWord = () => {
    vibrate({ duration: 5 });
    pushNewBottomSheet(AddWordNewBottomSheet, {});
  };

  return (
    <motion.div
      className="
        h-[calc(100vh-theme(height.header)-theme(height.bottom-nav)-var(--status-bar-height))]
        bg-layout-white dark:bg-layout-black
        overflow-y-auto
      "
      ref={scrollContainerRef}
      onScroll={handleScroll}
      initial={{ opacity: 0, y: 20, transition: { duration: 0.2 } }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.2 } }}
      exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
    >
      {/* 스티키 검색 인풋 + 드롭다운 */}
      <div className="sticky top-0 z-20 bg-layout-white dark:bg-layout-black px-[20px] pt-[16px] pb-[8px]">
        <div className="relative" ref={suggestionsRef}>
          <div className="
            flex items-center gap-[10px]
            h-[45px]
            px-[15px]
            rounded-[8px]
            border border-layout-gray-200 dark:border-border-dark
            bg-layout-white dark:bg-layout-black
          ">
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true);
              }}
              placeholder="검색할 단어를 입력하세요."
              className="
                flex-1 bg-transparent outline-none
                text-[16px] font-[400] text-layout-black dark:text-layout-white
                placeholder:text-layout-gray-300
              "
            />
            <MagnifyingGlass
              size={20}
              className="text-layout-gray-200"
            />
          </div>

          {/* 자동완성 드롭다운 */}
          <AnimatePresence>
            {showSuggestions && suggestions.length > 0 && (
              <motion.ul
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="
                  absolute top-[calc(100%+4px)] left-0 right-0 z-30
                  bg-layout-white dark:bg-layout-black
                  border border-layout-gray-200 dark:border-border-dark
                  rounded-[8px] shadow-lg
                  max-h-[240px] overflow-y-auto
                "
              >
                {suggestions.map((item, index) => (
                  <li
                    key={index}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSuggestionClick(item);
                    }}
                    className="
                      flex items-center gap-[10px]
                      px-[15px] py-[11px]
                      border-b last:border-b-0 border-layout-gray-100 dark:border-border-dark
                      cursor-pointer
                      active:bg-layout-gray-50 dark:active:bg-[#1a1a1a]
                    "
                  >
                    <MagnifyingGlass size={14} className="text-layout-gray-300 shrink-0" />
                    <span className="text-[14px] font-[600] shrink-0">
                      {item.word.split('').map((char, i) => {
                        const query = searchQuery.toLowerCase();
                        const wordLower = item.word.toLowerCase();
                        const startIndex = wordLower.indexOf(query);
                        const isHighlighted = startIndex !== -1 && i >= startIndex && i < startIndex + query.length;
                        return (
                          <span key={i} style={{ color: isHighlighted ? '#FF70D4' : 'var(--layout-black)' }}>{char}</span>
                        );
                      })}
                    </span>
                    <span className="text-[12px] text-[#999] flex-1 text-right line-clamp-1">
                      {Array.isArray(item.meanings) ? item.meanings.slice(0, 2).join(', ') : item.meanings}
                    </span>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 선택된 단어 상세 뷰 */}
      {selectedWord && (
        <div className="flex flex-col gap-[20px] px-[20px] pb-[20px] pt-[12px]">
          {/* 단어 상세 카드 */}
          <div className="border border-border dark:border-border-dark rounded-[12px] p-[16px]">
            <div className="flex items-center justify-between">
              <div
                className="flex items-center gap-[8px] cursor-pointer"
                onClick={() => getTextSound(selectedWord.word, 'en')}
              >
                <span className="text-[22px] font-[700] text-layout-black dark:text-layout-white">
                  {selectedWord.word}
                </span>
                <SpeakerHigh size={18} className="text-layout-gray-300" />
              </div>
              <button
                onClick={handleAddWord}
                className="flex items-center gap-[4px] px-[10px] py-[6px] rounded-[8px] bg-primary-main-50 dark:bg-[#1a1a2e]"
              >
                <Plus size={16} className="text-primary-main-600" />
                <span className="text-[12px] font-[600] text-primary-main-600">추가</span>
              </button>
            </div>

            {/* 의미 목록 */}
            {selectedWord.meanings?.length > 0 && (
              <div className="mt-[12px] flex flex-col gap-[4px]">
                {selectedWord.meanings.map((meaning, i) => (
                  <p key={i} className="text-[14px] text-[#555] dark:text-[#aaa] leading-[1.7]">
                    <span className="font-[600] text-[#999] mr-[6px]">{i + 1}.</span>
                    {meaning}
                  </p>
                ))}
              </div>
            )}

            {/* 예문 목록 */}
            {selectedWord.examples?.length > 0 && (
              <div className="mt-[14px] flex flex-col gap-[8px]">
                <p className="text-[11px] font-[600] text-[#bbb] uppercase tracking-wide">예문</p>
                {selectedWord.examples.map((ex, i) => (
                  <div
                    key={i}
                    className="bg-layout-gray-50 dark:bg-[#111] rounded-[8px] px-[12px] py-[10px]"
                  >
                    <p className="text-[13px] text-layout-black dark:text-layout-white leading-[1.6] italic">
                      "{ex.origin}"
                    </p>
                    {ex.meaning && (
                      <p className="text-[12px] text-[#999] mt-[4px] leading-[1.5]">
                        {ex.meaning}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 검색 로딩 */}
          {isSearching && (
            <div className="flex justify-center py-[12px]">
              <span className="text-[14px] text-[#999]">검색 중...</span>
            </div>
          )}

          {/* 내 단어장 검색 결과 */}
          {myWordResults.length > 0 && (
            <div>
              <p className="text-[14px] font-[600] text-layout-black dark:text-layout-white mb-[8px]">
                내 단어장 검색 결과({myWordResults.length})
              </p>
              <div className="flex flex-col gap-[10px]">
                {myWordResults.flatMap((word) =>
                  (word.vocaBooks ?? []).map((vb) => {
                    const vocaBook = vocaBooks.find(
                      v => String(v.vocaBookId) === String(vb.vocaBookId)
                    );
                    const bookTitle = vocaBook?.title || '단어장';
                    const color = vocaBook?.color;
                    const bgColor = color?.background || '#FFF0F9';
                    const subColor = color?.sub || '#FFD8EE';

                    const meanings = vb.meanings ?? word.meanings;
                    const meaningText = Array.isArray(meanings) ? meanings.join(', ') : meanings || '';

                    return (
                      <div
                        key={`${word.vocaIndexId}-${vb.vocaBookId}`}
                        className="rounded-[12px] overflow-hidden"
                        style={{ backgroundColor: bgColor }}
                      >
                        <div className="p-[15px]">
                          <div className="flex items-center gap-[6px]">
                            <span className="text-[14px] font-[700] text-layout-black dark:text-layout-white">
                              {word.origin}
                            </span>
                            <MemorizationStatus
                              iconOnly
                              repetition={word.sm2?.repetition ?? word.repetition ?? 0}
                              interval={word.sm2?.interval ?? word.interval ?? 0}
                              ef={word.sm2?.ef ?? word.ef ?? 2.5}
                              nextReview={word.sm2?.nextReview ?? word.nextReview}
                              wordId={String(word.vocaIndexId)}
                            />
                          </div>
                          <p className="mt-[8px] text-[11px] text-layout-gray-400">
                            {meaningText}
                          </p>
                          <button
                            onClick={() => handleMyVocaBookClick(vb.vocaBookId)}
                            className="flex items-center justify-between w-full mt-[10px] px-[10px] py-[6px] rounded-[8px]"
                            style={{ backgroundColor: subColor }}
                          >
                            <span className="text-[12px] font-[400] text-layout-gray-400">{bookTitle}</span>
                            <span className="text-[12px] font-[600] text-layout-gray-400">단어장 보기 →</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* 상점 단어장 검색 결과 */}
          {storeResults.length > 0 && (
            <div>
              <p className="text-[14px] font-[600] text-layout-black dark:text-layout-white mb-[8px]">
                상점 단어장 검색 결과({storeResults.length})
              </p>
              <div className="flex flex-col gap-[10px]">
                {storeResults.map((item, index) => {
                  const bgColor = JSON.parse(item.color)?.background || '#F5F0FF';
                  const subColor = JSON.parse(item.color)?.sub || '#DDD0FF';

                  return (
                    <div
                      key={index}
                      className="p-[15px] rounded-[12px] overflow-hidden"
                      style={{ backgroundColor: bgColor }}
                    >
                      <span className="text-[14px] font-[700] text-layout-black dark:text-layout-white">
                        {item.word}
                      </span>
                      <p className="mt-[8px] text-[11px] text-layout-gray-400">
                        {Array.isArray(item.meanings)
                          ? item.meanings.join(', ')
                          : item.meanings || ''}
                      </p>
                      <button
                        onClick={() => handleStoreVocaClick(item.bookstore_id)}
                        className="flex items-center justify-between w-full mt-[10px] px-[10px] py-[6px] rounded-[8px]"
                        style={{ backgroundColor: subColor }}
                      >
                        <span className="text-[12px] font-[400] text-layout-gray-400">{item.bookstore_name}</span>
                        <span className="text-[12px] font-[600] text-layout-gray-400">단어장 보기 →</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 기본 뷰: 내 단어 목록 (선택된 단어 없을 때) */}
      {!selectedWord && (
        <>
          {/* 스티키 헤더 */}
          <div className="sticky top-[69px] z-10 bg-layout-white dark:bg-layout-black flex items-center justify-between px-[20px] py-[8px]">
            <span className="text-[14px] font-[600] text-layout-black dark:text-layout-white">
              내 단어({Object.keys(userDictionary).length.toLocaleString()})
            </span>
            <div className="relative">
              <button
                onClick={() => {
                  vibrate({ duration: 5 });
                  setShowSortDropdown(prev => !prev);
                }}
                className="flex items-center gap-[4px] text-[#999] dark:text-[#666]"
              >
                <SlidersHorizontal size={18} />
              </button>
              <AnimatePresence>
                {showSortDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.15 }}
                    className="
                      absolute right-0 top-[26px] z-10
                      bg-layout-white dark:bg-layout-black
                      border border-border dark:border-border-dark
                      rounded-[10px] shadow-md
                      py-[6px]
                      min-w-[120px]
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
                          w-full text-left px-[14px] py-[8px]
                          text-[13px]
                          ${sortBy === key
                            ? 'text-primary-main-600 font-[600]'
                            : 'text-layout-black dark:text-layout-white'
                          }
                        `}
                      >
                        {label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* 드롭다운 닫기 오버레이 */}
          {showSortDropdown && (
            <div
              className="fixed inset-0 z-[9]"
              onClick={() => setShowSortDropdown(false)}
            />
          )}

          {/* 단어 목록 */}
          <div className="flex flex-col px-[20px] pb-[20px]">
            {isUserDictionaryLoading ? (
              <div className="flex items-center justify-center py-[40px]">
                <span className="text-[14px] text-[#999]">불러오는 중...</span>
              </div>
            ) : allWords.length === 0 ? (
              <div className="flex items-center justify-center py-[40px]">
                <span className="text-[14px] text-[#999]">아직 추가된 단어가 없어요.</span>
              </div>
            ) : (
              <>
                {wordsToShow.map((word, index) => {
                  const meanings = word.vocaBooks?.[0]?.meanings ?? word.meanings;
                  const meaningText = Array.isArray(meanings) ? meanings.join(', ') : meanings || '';
                  return (
                    <div
                      key={word.vocaIndexId || index}
                      className="px-[2px] pt-[10px] pb-[10px] border-b border-border dark:border-border-dark"
                    >
                      <div className="flex items-center gap-[5px]">
                        <span
                          className="text-[14px] font-[700] text-layout-black dark:text-layout-white cursor-pointer"
                          onClick={() => { vibrate({ duration: 5 }); getTextSound(word.origin, 'en'); }}
                        >
                          {word.origin}
                        </span>
                        <MemorizationStatus
                          iconOnly
                          repetition={word.sm2?.repetition ?? word.repetition ?? 0}
                          interval={word.sm2?.interval ?? word.interval ?? 0}
                          ef={word.sm2?.ef ?? word.ef ?? 2.5}
                          nextReview={word.sm2?.nextReview ?? word.nextReview}
                          wordId={String(word.vocaIndexId)}
                        />
                      </div>
                      <p
                        className="mt-[8px] text-[13px] text-[#666] dark:text-[#999] line-clamp-2 leading-[1.5] cursor-pointer"
                        onClick={() => { vibrate({ duration: 5 }); getTextSound(meaningText, 'ko'); }}
                      >
                        {meaningText}
                      </p>
                    </div>
                  );
                })}
                {isLoadingMore && (
                  <div className="flex justify-center py-[16px]">
                    <span className="text-[13px] text-[#999]">불러오는 중...</span>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* 맨 위로 버튼 */}
      <AnimatePresence>
        {showTopBtn && !selectedWord && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            onClick={() => {
              scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="
              fixed bottom-[90px] right-[16px] z-10
              w-[40px] h-[40px]
              flex items-center justify-center
              bg-primary-main-600 text-white
              rounded-full shadow-md
            "
          >
            <ArrowUp size={18} />
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default Main;
