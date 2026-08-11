import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  MagnifyingGlass, CaretDown, CaretRight, X, Plus, Drop, Camera, ArrowUp,
} from '@phosphor-icons/react';
import SpeakerButton from '../common/SpeakerButton';
import { useVocabulary } from '../../context/VocabularyContext';
import { useUser } from '../../context/UserContext';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { backendUrl, fetchDataAsync, getTextSound, prefetchTtsList, stripHtmlTags } from '../../utils/common';
import WordDetaileNewBottomSheet from '../newBottomSheet/WordDetaileNewBottomSheet';
import SelectVocaBookForWordNewBottomSheet from '../newBottomSheet/SelectVocaBookForWordNewBottomSheet';
import AddWordNewBottomSheet from '../newBottomSheet/AddWordNewBottomSheet';
import PickPlotNewBottomSheet from '../newBottomSheet/PickPlotNewBottomSheet';
import VocabularyWordsNewFullSheet from '../newfullsheet/VocabularyWordsNewFullSheet';
import DictionaryOcrResultNewFullSheet from '../newfullsheet/DictionaryOcrResultNewFullSheet';
import { PreviewBookStoreNewFullSheet } from '../newfullsheet/PreviewBookStoreNewFullSheet';
import { getBookStoreDetailApi } from '../../api/bookStore';
import { vibrate } from '../../utils/osFunction';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';
import { resolveVocaBookBackground } from '../../utils/vocaBookColor';
import { useOnboardingUnlock } from '../../context/OnboardingUnlockContext';
import CropImage, { CROP_ASSETS } from '../farm/CropImage';
import { stageToCrop, cropLabelDetail } from '../../utils/crop';
import useFarmPlants from './useFarmPlants';
import bookEmptyImg from '../../assets/images/farm/book-empty.png';

const ITEMS_PER_PAGE = 30;
const SCROLL_THRESHOLD = 200;
const RECENT_KEY = 'heyvoca:find:recent';
const RECENT_MAX = 8;

/** 성장 단계 필터 — 시안 find §4 "단계 4종". 황금은 홈과 같이 당근 그룹에 포함한다. */
const STAGE_FILTERS = [
  { key: 'seed', label: '씨앗' },
  { key: 'sprout', label: '새싹' },
  { key: 'leaf', label: '이파리' },
  { key: 'carrot', label: '당근' },
];

/** 돌봄 = 시들거나 썩기 직전인 것 (시안 find §4) */
const CARE_HEALTH = ['WILTED', 'CRITICAL'];

const readRecent = () => {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(v => typeof v === 'string') : [];
  } catch {
    return [];
  }
};

const writeRecent = (list) => {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* 저장 실패는 화면 동작을 막지 않는다 */
  }
};

/** 매칭 글자만 핑크로. 시안 find §10 ③ — 다크에서 더 잘 보이는 색이라 그대로 쓴다. */
const Highlight = ({ text, query }) => {
  const src = String(text ?? '');
  const q = String(query ?? '').trim();
  if (!q) return <>{src}</>;
  const i = src.toLowerCase().indexOf(q.toLowerCase());
  if (i === -1) return <>{src}</>;
  return (
    <>
      {src.slice(0, i)}
      <em className="not-italic text-primary-main-600">{src.slice(i, i + q.length)}</em>
      {src.slice(i + q.length)}
    </>
  );
};

/**
 * 오른쪽 다음 복습 문구 — 단어장 화면과 같은 어휘를 쓴다 (시안 find §4).
 * 농장 정보가 아직 없으면 FSRS 예정일로 대신 계산한다 — 자리를 비우면 정렬이 깨진다.
 */
const dueBadge = (plant, fsrs) => {
  const health = String(plant?.health || '').toUpperCase();
  if (health === 'ROTTEN') return { text: '썩음', kind: 'rot' };

  let days = plant?.days_to_review;
  if (days === null || days === undefined) {
    const next = fsrs?.next_review;
    if (!next) return null;
    days = Math.ceil((new Date(next).getTime() - Date.now()) / 86400000);
  }
  if (days <= 0) return { text: '오늘 물 필요', kind: health === 'CRITICAL' ? 'late' : 'today' };
  if (days === 1) return { text: '내일', kind: 'normal' };
  return { text: `${days}일 뒤`, kind: 'normal' };
};

const DueBadge = ({ badge }) => {
  if (!badge) return null;
  if (badge.kind === 'rot') {
    return (
      <span className="shrink-0 px-[7px] py-[3px] rounded-full bg-layout-gray-50 dark:bg-layout-gray-dark text-[11.5px] font-[700] text-layout-gray-400 dark:text-layout-gray-300">
        {badge.text}
      </span>
    );
  }
  const color = badge.kind === 'today'
    ? 'text-primary-main-600'
    : badge.kind === 'late'
      ? 'text-health-critical'
      : 'text-[#9A9A9A]';
  return (
    <span className={`shrink-0 text-right text-[11.5px] font-[700] ${color}`}>{badge.text}</span>
  );
};

/** 결과 그룹 헤더 (.grp) */
const GroupHead = ({ title, count, hint, action, first = false }) => (
  <div className={`flex items-center gap-[6px] pb-[7px] ${first ? 'pt-[4px]' : 'pt-[14px]'}`}>
    <b className="text-[12px] font-[800] tracking-[-0.03em] text-layout-black dark:text-layout-white">{title}</b>
    {count !== undefined && count !== null && (
      <span className="text-[12px] font-[800] text-primary-main-600">{count}</span>
    )}
    {hint && <span className="ml-auto text-[10.5px] font-[600] text-layout-gray-200">{hint}</span>}
    {action && <span className="ml-auto">{action}</span>}
  </div>
);

const Main = () => {
  "use memo";

  const { userDictionary, isUserDictionaryLoading, vocaBooks, bookStore } = useVocabulary();
  const { pushNewBottomSheet } = useNewBottomSheetActions();
  const { pushNewFullSheet } = useNewFullSheetActions();
  const { isDark } = useTheme();
  const { completeMission } = useOnboardingUnlock();
  const { isLogin } = useUser();
  const { plants } = useFarmPlants(isLogin);

  // 검색 상태
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLang, setSearchLang] = useState('en');
  const [storeResults, setStoreResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceTimerRef = useRef(null);

  const detectLang = (q) => (/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(q) ? 'ko' : 'en');

  const [suggestions, setSuggestions] = useState([]);
  const [selectedWord, setSelectedWord] = useState(null);
  const [noResults, setNoResults] = useState(false);
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [recent, setRecent] = useState(readRecent);
  const searchInputRef = useRef(null);

  // 평소 화면 상태
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('updatedAt');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [showTopBtn, setShowTopBtn] = useState(false);
  const scrollContainerRef = useRef(null);
  const isLoadingRef = useRef(false);
  const topBtnTimerRef = useRef(null);
  const lastScrollTopRef = useRef(0);

  const sortLabels = {
    updatedAt: '최근 수정순',
    createdAt: '생성일순',
    alphabetical: '알파벳순',
  };

  const view = selectedWord ? 'detail' : (isSearchMode ? 'search' : 'list');

  /** 단어 하나의 농장 상태 */
  const plantOf = useCallback(
    (word) => plants[String(word?.vocaIndexId)],
    [plants],
  );

  // 정렬 + 필터를 거친 내 단어 목록
  const sortedWords = useMemo(() => {
    const words = Object.values(userDictionary);
    return [...words].sort((a, b) => {
      if (sortBy === 'updatedAt') {
        return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
      }
      if (sortBy === 'createdAt') {
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      }
      if (sortBy === 'alphabetical') {
        return (a.origin || '').localeCompare(b.origin || '');
      }
      return 0;
    });
  }, [userDictionary, sortBy]);

  // 필터 칩 개수 — 목록과 같은 모집단에서 세야 칩과 목록이 어긋나지 않는다
  const filterCounts = useMemo(() => {
    const c = { all: sortedWords.length, seed: 0, sprout: 0, leaf: 0, carrot: 0, care: 0 };
    sortedWords.forEach((word) => {
      const plant = plants[String(word.vocaIndexId)];
      const crop = plant ? stageToCrop(plant.stage) : 'seed';
      const key = crop === 'golden' ? 'carrot' : crop;
      if (c[key] !== undefined) c[key] += 1;
      if (CARE_HEALTH.includes(String(plant?.health || '').toUpperCase())) c.care += 1;
    });
    return c;
  }, [sortedWords, plants]);

  const allWords = useMemo(() => {
    if (filter === 'all') return sortedWords;
    if (filter === 'care') {
      return sortedWords.filter(w =>
        CARE_HEALTH.includes(String(plants[String(w.vocaIndexId)]?.health || '').toUpperCase()));
    }
    return sortedWords.filter((w) => {
      const plant = plants[String(w.vocaIndexId)];
      const crop = plant ? stageToCrop(plant.stage) : 'seed';
      return (crop === 'golden' ? 'carrot' : crop) === filter;
    });
  }, [sortedWords, plants, filter]);

  const wordsToShow = allWords.slice(0, displayCount);
  const hasMore = displayCount < allWords.length;

  // 검색 대상 단어를 내 사전에서 찾는다 (완전 일치만 — 부분 일치면 tea → teach 가 섞인다)
  const myWord = useMemo(() => {
    const key = String(selectedWord?.word || '').toLowerCase();
    if (!key) return null;
    return Object.values(userDictionary).find(w => (w.origin || '').toLowerCase() === key) || null;
  }, [selectedWord, userDictionary]);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    if (view !== 'list') {
      document.documentElement.dataset.scrollHidden = 'false';
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    const delta = scrollTop - lastScrollTopRef.current;
    if (scrollTop <= 4) {
      document.documentElement.dataset.scrollHidden = 'false';
    } else if (delta > 8 && scrollTop > 56) {
      document.documentElement.dataset.scrollHidden = 'true';
    } else if (delta < -8) {
      document.documentElement.dataset.scrollHidden = 'false';
    }
    lastScrollTopRef.current = scrollTop;

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
  }, [hasMore, allWords.length, view]);

  useEffect(() => () => {
    document.documentElement.dataset.scrollHidden = 'false';
  }, []);

  useEffect(() => {
    if (selectedWord) {
      document.documentElement.dataset.scrollHidden = 'false';
      const items = [];
      if (selectedWord.word) items.push({ text: selectedWord.word, language: 'en' });
      (selectedWord.meanings || []).forEach(m => {
        const t = stripHtmlTags(m); if (t) items.push({ text: t, language: 'ko' });
      });
      (selectedWord.examples || []).forEach(ex => {
        const en = stripHtmlTags(ex?.origin || ''); if (en) items.push({ text: en, language: 'en' });
        const ko = stripHtmlTags(ex?.meaning || ''); if (ko) items.push({ text: ko, language: 'ko' });
      });
      prefetchTtsList(items);
    }
  }, [selectedWord]);

  useEffect(() => {
    if (!isLoadingMore) return;
    isLoadingRef.current = false;
    setIsLoadingMore(false);
  }, [wordsToShow.length]);

  useEffect(() => {
    setDisplayCount(ITEMS_PER_PAGE);
  }, [sortBy, filter]);

  useEffect(() => () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (topBtnTimerRef.current) clearTimeout(topBtnTimerRef.current);
  }, []);

  const pushRecent = useCallback((word) => {
    if (!word) return;
    setRecent((prev) => {
      const next = [word, ...prev.filter(v => v !== word)].slice(0, RECENT_MAX);
      writeRecent(next);
      return next;
    });
  }, []);

  const fetchSuggestions = useCallback(async (query, lang) => {
    const minLen = lang === 'ko' ? 1 : 2;
    if (!query.trim() || query.trim().length < minLen) {
      setSuggestions([]);
      setNoResults(false);
      return;
    }
    try {
      const endpoint = lang === 'ko' ? '/search/partial/ko' : '/search/partial/en';
      const response = await fetchDataAsync(`${backendUrl}${endpoint}`, 'GET', { word: query });
      if (response?.code === 200) {
        const data = response.data || [];
        setSuggestions(data);
        setSubmittedQuery(query);
        setNoResults(data.length === 0);
      }
    } catch (err) {
      console.error('추천 검색 오류:', err);
    }
  }, []);

  const executeSearch = useCallback(async (query) => {
    if (!query.trim() || query.trim().length < 2) {
      setStoreResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetchDataAsync(`${backendUrl}/search/bookstore/word`, 'GET', { word: query });
      setStoreResults(res?.code === 200 ? (res.data || []) : []);
    } catch (err) {
      console.error('검색 오류:', err);
      setStoreResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSearchChange = (e) => {
    const query = e.target.value;
    const lang = detectLang(query);
    setSearchQuery(query);
    setSearchLang(lang);
    setSelectedWord(null);
    setStoreResults([]);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    const minLen = lang === 'ko' ? 1 : 2;
    if (!query.trim() || query.trim().length < minLen) {
      setSuggestions([]);
      setNoResults(false);
      setSubmittedQuery('');
      return;
    }
    debounceTimerRef.current = setTimeout(() => fetchSuggestions(query, lang), 300);
  };

  const handleSearchSubmit = useCallback(() => {
    if (!searchQuery.trim()) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    fetchSuggestions(searchQuery, searchLang);
    searchInputRef.current?.blur();
  }, [searchQuery, searchLang, fetchSuggestions]);

  // 검색 모드 진입 — 목록 자리를 최근 찾은 단어로 바꾼다 (시안 find §5)
  const enterSearchMode = () => {
    vibrate({ duration: 5 });
    setIsSearchMode(true);
    setRecent(readRecent());
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  const exitSearchMode = () => {
    vibrate({ duration: 5 });
    setIsSearchMode(false);
    setSearchQuery('');
    setSuggestions([]);
    setSelectedWord(null);
    setStoreResults([]);
    setNoResults(false);
    setSubmittedQuery('');
    searchInputRef.current?.blur();
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  };

  const handleSuggestionClick = useCallback((item) => {
    vibrate({ duration: 5 });
    getTextSound(item.word, 'en');
    setIsSearchMode(true);
    setSelectedWord(item);
    setSearchQuery(item.word);
    setSuggestions([]);
    setNoResults(false);
    pushRecent(item.word);
    searchInputRef.current?.blur();
    executeSearch(item.word);
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    // 온보딩 미션(M4: 사전에서 단어 찾아보기) — 이미 완료/legacy면 Context 내부에서 스킵
    completeMission('search_word');
  }, [executeSearch, completeMission, pushRecent]);

  useEffect(() => {
    const onExternalSelect = (e) => {
      const word = e?.detail;
      if (!word || !word.word) return;
      handleSuggestionClick(word);
    };
    window.addEventListener('dictionary:selectWord', onExternalSelect);
    return () => window.removeEventListener('dictionary:selectWord', onExternalSelect);
  }, [handleSuggestionClick]);

  const openCamera = () => {
    vibrate({ duration: 5 });
    pushNewFullSheet(DictionaryOcrResultNewFullSheet);
  };

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

  const handleMyVocaBookClick = (vocaBookId) => {
    vibrate({ duration: 5 });
    pushNewFullSheet(VocabularyWordsNewFullSheet, { id: vocaBookId });
  };

  // ⑦ 어느 밭에 담을까 — 이 화면에서 시트는 "고르는 것"과 "결과"뿐이다 (시안 find §8)
  const handleAddWord = () => {
    vibrate({ duration: 5 });
    pushNewBottomSheet(PickPlotNewBottomSheet, {
      origin: selectedWord?.word ?? '',
      meanings: selectedWord?.meanings ?? [],
      examples: selectedWord?.examples ?? [],
    });
  };

  // 사전에 없는 단어 — 직접 추가는 기존 편집 시트를 그대로 쓴다
  const handleCreateWord = () => {
    vibrate({ duration: 5 });
    pushNewBottomSheet(AddWordNewBottomSheet, { origin: submittedQuery });
  };

  const handleWordItemClick = (word) => {
    const books = word.vocaBooks ?? [];
    if (books.length === 0) return;
    vibrate({ duration: 5 });

    if (books.length === 1) {
      pushNewBottomSheet(WordDetaileNewBottomSheet, {
        vocabularyId: books[0].vocaBookId,
        id: word.vocaIndexId,
      });
      return;
    }
    pushNewBottomSheet(SelectVocaBookForWordNewBottomSheet, {
      vocaIndexId: word.vocaIndexId,
      vocaBookIds: books.map(b => b.vocaBookId),
    });
  };

  // ── 필터 칩 ────────────────────────────────────────────────
  const chipBase = 'flex items-center gap-[5px] h-[32px] rounded-full text-[12.5px] font-[700] tracking-[-0.02em] whitespace-nowrap shrink-0';
  const chipOff = 'bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-gray-400';
  const chipOn = 'bg-layout-black text-layout-white dark:bg-layout-white dark:text-layout-black';

  const renderChips = () => (
    <div className="flex gap-[6px] overflow-x-auto scrollbar-hide px-[16px] pb-[11px]">
      <button
        type="button"
        onClick={() => { vibrate({ duration: 5 }); setFilter('all'); }}
        className={`${chipBase} px-[11px] ${filter === 'all' ? chipOn : chipOff}`}
      >
        전체 <b className="font-[800]">{filterCounts.all}</b>
      </button>
      {STAGE_FILTERS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => { vibrate({ duration: 5 }); setFilter(key); }}
          className={`${chipBase} pl-[8px] pr-[11px] ${filter === key ? chipOn : chipOff}`}
        >
          <CropImage stage={key} health="FRESH" size={34} alt="" />
          {label} <b className="font-[800]">{filterCounts[key]}</b>
        </button>
      ))}
      <button
        type="button"
        onClick={() => { vibrate({ duration: 5 }); setFilter('care'); }}
        className={`${chipBase} pl-[8px] pr-[11px] ${
          filter === 'care'
            ? chipOn
            : 'bg-secondary-yellow-100 dark:bg-secondary-yellow-dark text-[#B54708] dark:text-[#FDB022]'
        }`}
      >
        <Drop size={12} weight="fill" />
        돌봄 <b className="font-[800]">{filterCounts.care}</b>
      </button>
    </div>
  );

  // ── 단어 행 (.wrow2) — 단어장 화면과 같은 배치 ───────────────
  const renderWordRow = (word) => {
    const plant = plantOf(word);
    const books = Array.isArray(word.vocaBooks) ? word.vocaBooks : [];
    const meaningText = (books.length > 0
      ? books.map(vb => (Array.isArray(vb.meanings) ? vb.meanings.join(', ') : '')).filter(Boolean)
      : [Array.isArray(word.meanings) ? word.meanings.join(', ') : (word.meanings || '')].filter(Boolean)
    ).join(' · ');

    return (
      <div
        key={word.vocaIndexId}
        onClick={() => handleWordItemClick(word)}
        className="flex items-center gap-[11px] h-[58px] shrink-0 cursor-pointer border-b border-[#F4F4F4] dark:border-white/[0.07]"
      >
        <CropImage
          stage={plant?.stage ?? 'seed'}
          health={plant?.health ?? 'FRESH'}
          size={52}
          className="shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-[5px]">
            <span className="shrink-0 text-[15px] font-[700] tracking-[-0.02em] text-layout-black dark:text-layout-white">
              {word.origin}
            </span>
            {word.pronunciation && (
              <span className="truncate text-[10.5px] font-[500] text-[#BBBBBB]">{word.pronunciation}</span>
            )}
          </div>
          <div className="mt-[2px] truncate text-[12px] tracking-[-0.02em] text-layout-gray-400 dark:text-layout-gray-300">
            {meaningText}
          </div>
        </div>
        <DueBadge badge={dueBadge(plant, word.fsrs)} />
      </div>
    );
  };

  // ── 검색바 ─────────────────────────────────────────────────
  const renderSearchBar = () => (
    <div className="sticky top-0 z-20 bg-layout-white dark:bg-layout-black px-[16px] pt-[10px] pb-[12px]">
      {view === 'list' ? (
        <button
          type="button"
          onClick={enterSearchMode}
          className="flex items-center gap-[9px] w-full h-[46px] px-[14px] rounded-[12px] bg-layout-gray-50 dark:bg-layout-gray-dark"
        >
          <MagnifyingGlass size={18} weight="fill" className="text-[#BBBBBB] shrink-0" />
          <span className="text-[15px] font-[500] tracking-[-0.02em] text-[#BBBBBB]">단어 찾기</span>
        </button>
      ) : (
        <div className="flex items-center gap-[9px] h-[46px] px-[14px] rounded-[12px] bg-layout-gray-50 dark:bg-layout-gray-dark">
          <MagnifyingGlass size={18} weight="fill" className="text-primary-main-600 shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSearchSubmit();
              }
            }}
            placeholder="단어 찾기"
            className="flex-1 min-w-0 bg-transparent outline-none text-[15px] font-[600] tracking-[-0.02em] text-layout-black dark:text-layout-white placeholder:font-[500] placeholder:text-[#BBBBBB]"
          />
          <button
            type="button"
            onClick={exitSearchMode}
            className="shrink-0 text-[13.5px] font-[700] text-layout-gray-400"
          >
            취소
          </button>
        </div>
      )}
    </div>
  );

  // ── ② 검색 모드 — 최근 찾은 단어 ────────────────────────────
  const renderRecent = () => (
    <div className="px-[16px] pb-[24px]">
      <GroupHead
        title="최근 찾은 단어"
        first
        action={recent.length > 0 ? (
          <button
            type="button"
            onClick={() => { vibrate({ duration: 5 }); setRecent([]); writeRecent([]); }}
            className="text-[10.5px] font-[600] text-layout-gray-200"
          >
            전체 지우기
          </button>
        ) : null}
      />
      {recent.length === 0 ? (
        <p className="py-[11px] text-[12px] font-[500] text-layout-gray-300">
          아직 찾아본 단어가 없어요.
        </p>
      ) : (
        recent.map((word, i) => (
          <div
            key={word}
            className={`flex items-center gap-[10px] py-[11px] ${i > 0 ? 'border-t border-[#F4F4F4] dark:border-white/[0.06]' : ''}`}
          >
            <button
              type="button"
              onClick={() => {
                setSearchQuery(word);
                const lang = detectLang(word);
                setSearchLang(lang);
                fetchSuggestions(word, lang);
              }}
              className="flex-1 text-left text-[14px] font-[600] tracking-[-0.02em] text-layout-black dark:text-layout-white"
            >
              {word}
            </button>
            <button
              type="button"
              aria-label={`${word} 지우기`}
              onClick={() => {
                const next = recent.filter(v => v !== word);
                setRecent(next);
                writeRecent(next);
              }}
              className="flex items-center justify-center w-[22px] h-[22px]"
            >
              <X size={12} weight="bold" className="text-layout-gray-200" />
            </button>
          </div>
        ))
      )}

      <div className="h-[16px]" />

      <button
        type="button"
        onClick={openCamera}
        className="flex items-center gap-[11px] w-full rounded-[12px] p-[12px] bg-primary-main-50 dark:bg-primary-main-dark"
      >
        <span className="flex items-center justify-center w-[38px] h-[38px] shrink-0 rounded-[10px] bg-layout-white dark:bg-white/10">
          <Camera size={34} weight="fill" className="text-primary-main-600" />
        </span>
        <span className="flex-1 min-w-0 text-left">
          <span className="block text-[13px] font-[800] tracking-[-0.03em] text-layout-black dark:text-layout-white">
            카메라로 찾기
          </span>
          <span className="block mt-[2px] text-[11px] font-[500] tracking-[-0.02em] text-layout-gray-300 dark:text-layout-gray-200">
            사진 속 영어 단어를 한 번에 찾아요
          </span>
        </span>
        <CaretRight size={13} weight="fill" className="text-primary-main-400" />
      </button>

      <div className="h-[10px]" />
      <p className="text-center text-[10.5px] font-[500] leading-[1.6] text-layout-gray-300">
        한글로도 찾을 수 있어요 · 초성도 돼요
      </p>
    </div>
  );

  // ── ③ 추천 목록 ─────────────────────────────────────────────
  const renderSuggestions = () => (
    <div className="px-[16px] pb-[24px]">
      {suggestions.map((item, index) => {
        const owned = Object.values(userDictionary).find(
          w => (w.origin || '').toLowerCase() === String(item.word || '').toLowerCase(),
        );
        const plant = owned ? plantOf(owned) : null;
        const meaningText = Array.isArray(item.meanings)
          ? item.meanings.slice(0, 2).join(', ')
          : (item.meanings || '');
        return (
          <div
            key={`${item.word}-${index}`}
            onMouseDown={(e) => { e.preventDefault(); handleSuggestionClick(item); }}
            className="flex items-center gap-[9px] h-[46px] shrink-0 cursor-pointer border-b border-[#F4F4F4] dark:border-white/[0.07]"
          >
            <span className="flex items-center justify-center w-[22px] h-[22px] shrink-0">
              {owned ? (
                <CropImage
                  stage={plant?.stage ?? 'seed'}
                  health={plant?.health ?? 'FRESH'}
                  size={38}
                />
              ) : (
                <MagnifyingGlass size={13} weight="fill" className="text-layout-gray-200" />
              )}
            </span>
            <span className="shrink-0 text-[14.5px] font-[700] tracking-[-0.02em] text-layout-black dark:text-layout-white">
              {searchLang === 'en'
                ? <Highlight text={item.word} query={searchQuery} />
                : item.word}
            </span>
            <span className="flex-1 min-w-0 truncate text-right text-[12px] font-[500] tracking-[-0.02em] text-layout-gray-300">
              {searchLang === 'ko'
                ? <Highlight text={meaningText} query={searchQuery} />
                : meaningText}
            </span>
          </div>
        );
      })}
    </div>
  );

  // ── ④ 결과 없음 ─────────────────────────────────────────────
  const renderEmpty = () => (
    <div className="flex flex-col items-center justify-center px-[32px] pt-[48px] pb-[32px]">
      <img
        src={bookEmptyImg}
        alt=""
        draggable={false}
        className="block w-[150px] h-[99px] object-contain opacity-55 mb-[16px] select-none"
      />
      <p className="text-center text-[16px] font-[800] tracking-[-0.03em] text-layout-black dark:text-layout-white">
        <em className="not-italic text-primary-main-600">{submittedQuery}</em> 은 사전에 없어요
      </p>
      <p className="mt-[8px] text-center text-[10.5px] font-[500] leading-[1.6] text-layout-gray-300">
        철자를 다시 확인해 보세요.<br />
        직접 넣으면 <b className="font-[700] text-layout-gray-400">검증되지 않은 단어</b>로 담겨요.
      </p>
      <div className="flex gap-[10px] w-full mt-[20px]">
        <button
          type="button"
          onClick={handleCreateWord}
          className="flex-1 h-[48px] rounded-[10px] border-[1.5px] border-layout-gray-100 dark:border-[#3A3A3A] text-[15.5px] font-[700] tracking-[-0.03em] text-layout-gray-400 dark:text-layout-gray-200"
        >
          직접 추가
        </button>
      </div>
    </div>
  );

  // ── ⑤⑥ 단어 상세 — 사전 · 내 단어장 · 상점 한 줄기 ───────────
  const renderDetail = () => {
    const plant = myWord ? plantOf(myWord) : null;
    const books = myWord?.vocaBooks ?? [];

    return (
      <div className="flex flex-col px-[16px] pt-[2px] pb-[24px]">
        {/* 사전 상세 */}
        <div className="pt-[14px] pb-[2px]">
          <div className="flex items-center gap-[8px]">
            <span className="text-[24px] font-[800] tracking-[-0.04em] text-layout-black dark:text-layout-white break-all">
              {selectedWord.word}
            </span>
            <SpeakerButton
              text={selectedWord.word}
              lang="en"
              size={16}
              label="단어 발음 듣기"
              className="w-[30px] h-[30px] rounded-full bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-gray-400"
            />
            <div className="ml-auto flex items-center gap-[6px] shrink-0">
              {myWord ? (
                <span className="flex items-center gap-[5px] h-[28px] pl-[6px] pr-[11px] rounded-full bg-layout-gray-50 dark:bg-layout-gray-dark text-[12px] font-[800] tracking-[-0.02em] text-layout-black dark:text-layout-white">
                  <CropImage
                    stage={plant?.stage ?? 'seed'}
                    health={plant?.health ?? 'FRESH'}
                    size={36}
                  />
                  {cropLabelDetail(plant?.stage ?? 'UNPLANTED_SEED')}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleAddWord}
                  className="flex items-center gap-[3px] h-[32px] px-[13px] rounded-[8px] bg-primary-main-100 dark:bg-primary-main-dark text-[13px] font-[800] tracking-[-0.02em] text-primary-main-600 dark:text-primary-main-400"
                >
                  <Plus size={13} weight="bold" />
                  담기
                </button>
              )}
            </div>
          </div>

          {selectedWord.pronunciation && (
            <div className="flex items-center gap-[7px] mt-[6px]">
              <span className="text-[13px] font-[500] text-layout-gray-300">{selectedWord.pronunciation}</span>
            </div>
          )}

          {selectedWord.meanings?.length > 0 && (
            <div className="mt-[16px]">
              {selectedWord.meanings.map((meaning, i) => (
                <div key={i} className="flex items-start gap-[8px] py-[7px]">
                  <span className="shrink-0 mt-[2px] text-[12px] font-[800] text-layout-gray-200">{i + 1}</span>
                  <span className="flex-1 text-[14.5px] font-[600] leading-[1.5] tracking-[-0.02em] text-layout-black dark:text-layout-white">
                    {meaning}
                  </span>
                  <SpeakerButton
                    text={stripHtmlTags(meaning)}
                    lang="ko"
                    size={15}
                    label="뜻 발음 듣기"
                    className="w-[22px] h-[22px] text-layout-gray-200"
                  />
                </div>
              ))}
            </div>
          )}

          {selectedWord.examples?.length > 0 && (
            <div className="mt-[6px] flex flex-col gap-[7px]">
              {selectedWord.examples.map((ex, i) => (
                <div key={i} className="rounded-[10px] px-[12px] py-[10px] bg-[#FAFAFA] dark:bg-layout-gray-dark">
                  <div className="flex items-start gap-[7px]">
                    <span
                      className="min-w-0 text-[12.5px] font-[600] leading-[1.55] text-layout-black dark:text-layout-white"
                      dangerouslySetInnerHTML={{ __html: ex.origin || '' }}
                    />
                    <SpeakerButton
                      text={stripHtmlTags(ex.origin || '')}
                      lang="en"
                      size={14}
                      label="예문 발음 듣기"
                      className="w-[22px] h-[22px] text-layout-gray-200"
                    />
                  </div>
                  {ex.meaning && (
                    <div className="flex items-start gap-[7px] mt-[4px]">
                      <span
                        className="min-w-0 text-[11.5px] font-[500] leading-[1.5] text-layout-gray-300"
                        dangerouslySetInnerHTML={{ __html: ex.meaning }}
                      />
                      <SpeakerButton
                        text={stripHtmlTags(ex.meaning)}
                        lang="ko"
                        size={13}
                        label="예문 뜻 발음 듣기"
                        className="w-[22px] h-[22px] text-layout-gray-100"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 내 단어장 — 비어도 자리를 남긴다 (시안 find §6) */}
        {books.length > 0 ? (
          <>
            <GroupHead title="내 단어장" count={books.length} hint="이 단어가 심긴 밭" />
            {books.map((vb, i) => {
              const book = vocaBooks.find(v => String(v.vocaBookId) === String(vb.vocaBookId));
              const bg = resolveVocaBookBackground(book?.color?.background || '#FFF0F9', isDark);
              const stageLabel = cropLabelDetail(plant?.stage ?? 'UNPLANTED_SEED');
              const badge = dueBadge(plant, myWord?.fsrs);
              const sub = i === 0
                ? `${stageLabel} · 다음 복습 ${badge ? badge.text : '예정 없음'}`
                : `${stageLabel} · 같은 상태를 함께 써요`;
              return (
                <div
                  key={vb.vocaBookId}
                  className="flex items-center gap-[10px] rounded-[12px] px-[12px] py-[10px] mb-[7px]"
                  style={{ backgroundColor: bg }}
                >
                  <CropImage
                    stage={plant?.stage ?? 'seed'}
                    health={plant?.health ?? 'FRESH'}
                    size={52}
                    className="shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-[13.5px] font-[800] tracking-[-0.03em] text-layout-black dark:text-layout-white">
                      {book?.title || '단어장'}
                    </div>
                    <div className="mt-[2px] flex items-center gap-[4px] text-[11px] font-[600] tracking-[-0.02em] text-layout-gray-300 dark:text-layout-gray-200">
                      <CropImage
                        stage={plant?.stage ?? 'seed'}
                        health={plant?.health ?? 'FRESH'}
                        size={13}
                        alt=""
                        className="shrink-0"
                      />
                      <span className="truncate">{sub}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleMyVocaBookClick(vb.vocaBookId)}
                    className="shrink-0 flex items-center gap-[3px] text-[12px] font-[800] text-layout-gray-400 dark:text-layout-gray-200"
                  >
                    열기
                    <CaretRight size={11} weight="fill" />
                  </button>
                </div>
              );
            })}
          </>
        ) : (
          <>
            <GroupHead title="내 단어장" hint="아직 어느 밭에도 없어요" />
            <div className="flex items-center gap-[11px] rounded-[12px] p-[12px] bg-[#F7F7F7] dark:bg-layout-gray-dark">
              <span className="flex items-center justify-center w-[38px] h-[38px] shrink-0 rounded-[10px] bg-layout-white dark:bg-white/10">
                <Plus size={17} weight="bold" className="text-[#BBBBBB]" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-[800] tracking-[-0.03em] text-layout-gray-400 dark:text-layout-gray-200">
                  아직 담지 않은 단어예요
                </div>
                <div className="mt-[2px] text-[11px] font-[500] tracking-[-0.02em] text-layout-gray-300">
                  담으면 씨앗이 되고, 물을 주면 심겨요
                </div>
              </div>
            </div>
          </>
        )}

        {/* 상점 단어장 — 파는 곳이 없으면 헤더까지 숨긴다 */}
        {isSearching && (
          <p className="py-[14px] text-center text-[12px] text-layout-gray-300">불러오는 중...</p>
        )}
        {storeResults.length > 0 && (
          <>
            <GroupHead title="상점 단어장" count={storeResults.length} hint="이 단어가 들어 있어요" />
            {storeResults.map((item, index) => {
              const parsed = (() => {
                try { return typeof item.color === 'string' ? JSON.parse(item.color) : (item.color || {}); }
                catch { return {}; }
              })();
              const bg = resolveVocaBookBackground(parsed.background || '#EAF2FC', isDark);
              const store = bookStore?.find(b => String(b.id) === String(item.bookstore_id));
              return (
                <div
                  key={`${item.bookstore_id}-${index}`}
                  className="flex items-center gap-[10px] rounded-[12px] px-[12px] py-[10px] mb-[7px]"
                  style={{ backgroundColor: bg }}
                >
                  <CropImage stage="seed" health="FRESH" size={52} className="shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-[13.5px] font-[800] tracking-[-0.03em] text-layout-black dark:text-layout-white">
                      {item.bookstore_name}
                    </div>
                    <div className="mt-[2px] flex items-center gap-[4px] text-[11px] font-[600] tracking-[-0.02em] text-layout-gray-300 dark:text-layout-gray-200">
                      <CropImage stage="seed" health="FRESH" size={36} alt="" />
                      {store?.vocaCount ? `심을 씨앗 ${store.vocaCount}개` : '심을 씨앗이 들어 있어요'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleStoreVocaClick(item.bookstore_id)}
                    className="shrink-0 flex items-center gap-[3px] h-[30px] px-[11px] rounded-[8px] bg-primary-main-600 text-layout-white text-[12.5px] font-[800]"
                  >
                    {store?.gem !== undefined && store?.gem !== null ? (
                      <>
                        <img src={CROP_ASSETS.gem} alt="" className="w-[14px] h-[14px] object-contain" />
                        {store.gem}개로 구매
                      </>
                    ) : '구매하러 가기'}
                  </button>
                </div>
              );
            })}
          </>
        )}
      </div>
    );
  };

  return (
    <motion.div
      className="
        h-[calc(100vh-var(--current-header-height)-var(--current-bottom-nav-height)-var(--status-bar-height))]
        bg-layout-white dark:bg-layout-black
        overflow-y-auto
        transition-[height] duration-[250ms] ease
      "
      ref={scrollContainerRef}
      onScroll={handleScroll}
      initial={{ opacity: 0, y: 20, transition: { duration: 0.2 } }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.2 } }}
      exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
    >
      {renderSearchBar()}

      {view === 'detail' && renderDetail()}

      {view === 'search' && (
        noResults
          ? renderEmpty()
          : suggestions.length > 0
            ? renderSuggestions()
            : renderRecent()
      )}

      {view === 'list' && (
        <>
          {renderChips()}

          <div className="sticky top-[68px] z-10 bg-layout-white dark:bg-layout-black flex items-baseline gap-[8px] px-[16px] pb-[8px]">
            <span className="flex-1 text-[13px] font-[800] tracking-[-0.03em] text-layout-black dark:text-layout-white">
              내 단어 {allWords.length.toLocaleString()}
            </span>
            <div className="relative">
              <button
                type="button"
                onClick={() => { vibrate({ duration: 5 }); setShowSortDropdown(prev => !prev); }}
                className="flex items-center gap-[3px] text-[11.5px] font-[600] text-layout-gray-300"
              >
                {sortLabels[sortBy]}
                <CaretDown size={10} weight="fill" className="text-layout-gray-200" />
              </button>
              <AnimatePresence>
                {showSortDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.15 }}
                    className="
                      absolute right-0 top-[24px] z-10
                      bg-layout-white dark:bg-layout-black
                      border border-border dark:border-border-dark
                      rounded-[10px] shadow-md py-[6px] min-w-[120px]
                    "
                  >
                    {Object.entries(sortLabels).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          vibrate({ duration: 5 });
                          setSortBy(key);
                          setShowSortDropdown(false);
                        }}
                        className={`w-full text-left px-[14px] py-[8px] text-[13px] ${
                          sortBy === key
                            ? 'text-primary-main-600 font-[600]'
                            : 'text-layout-black dark:text-layout-white'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {showSortDropdown && (
            <div className="fixed inset-0 z-[9]" onClick={() => setShowSortDropdown(false)} />
          )}

          <div className="flex flex-col px-[16px] pb-[20px]">
            {isUserDictionaryLoading ? (
              <div className="flex items-center justify-center py-[40px]">
                <span className="text-[13px] text-layout-gray-300">불러오는 중...</span>
              </div>
            ) : allWords.length === 0 ? (
              <div className="flex items-center justify-center py-[40px]">
                <span className="text-[13px] text-layout-gray-300">
                  {filter === 'all' ? '아직 담은 단어가 없어요.' : '이 조건에 맞는 단어가 없어요.'}
                </span>
              </div>
            ) : (
              <>
                {wordsToShow.map(renderWordRow)}
                {isLoadingMore && (
                  <div className="flex justify-center py-[16px]">
                    <span className="text-[13px] text-layout-gray-300">불러오는 중...</span>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      <AnimatePresence>
        {showTopBtn && view === 'list' && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            onClick={() => scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            className="
              fixed bottom-[calc(var(--current-bottom-nav-height)+20px)] right-[16px] z-10
              transition-[bottom] duration-200
              w-[40px] h-[40px]
              flex items-center justify-center
              bg-primary-main-600 text-white
              rounded-full shadow-md
            "
          >
            <ArrowUp size={18} className="dark:text-layout-black" />
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default Main;
