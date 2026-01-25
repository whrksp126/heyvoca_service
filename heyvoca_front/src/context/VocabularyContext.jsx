import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useUser } from './UserContext';
import { getUserVocabularySheetsApi, addUserVocabularySheetApi, updateUserVocabularySheetApi, deleteUserVocabularySheetApi } from '../api/voca';
import { getBookStoreApi } from '../api/bookStore';
import { getUserRecentStudyDataApi, updateUserRecentStudyDataApi } from '../api/study';
import AchievementRewardOverlay from '../components/overlay/AchievementRewardOverlay';
import GemRewardOverlay from '../components/overlay/GemRewardOverlay';

const VocabularyContext = createContext(null);
export const VocabularyProvider = ({ children }) => {
  const { isLogin, isLoginChecked, setUserProfile } = useUser();

  const [vocabularySheets, setVocabularySheets] = useState([]);
  const [isVocabularySheetsLoading, setIsVocabularySheetsLoading] = useState(true);
  const [errorVocabularySheets, setErrorVocabularySheets] = useState(null);
  const [bookStore, setBookStore] = useState([]);
  const [isBookStoreLoading, setIsBookStoreLoading] = useState(true);
  const [errorBookStore, setErrorBookStore] = useState(null);
  const [recentStudy, setRecentStudy] = useState({});
  const [isRecentStudyLoading, setIsRecentStudyLoading] = useState(true);
  const [errorRecentStudy, setErrorRecentStudy] = useState(null);

  const [delayedWords, setDelayedWords] = useState([]);


  // 전체 통계 계산
  const statistics = useMemo(() => {
    const total = vocabularySheets.reduce((acc, sheet) => acc + sheet.total, 0);
    const memorized = vocabularySheets.reduce((acc, sheet) => acc + sheet.memorized, 0);
    const totalSheets = vocabularySheets.length;

    return {
      total,
      memorized,
      totalSheets,
      progressPercentage: total > 0 ? Math.round((memorized / total) * 100) : 0
    };
  }, [vocabularySheets]);

  // 최근 업데이트된 단어장 가져오기
  const getRecentVocabularySheets = useCallback((limit = 5) => {
    return [...vocabularySheets]
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, limit);
  }, [vocabularySheets]);

  // 학습 진도율로 정렬된 단어장 가져오기
  const getProgressSortedSheets = useCallback(() => {
    return [...vocabularySheets]
      .sort((a, b) => {
        const progressA = (a.memorized / a.total) * 100;
        const progressB = (b.memorized / b.total) * 100;
        return progressB - progressA;
      });
  }, [vocabularySheets]);

  // 특정 진도율 이하의 단어장 가져오기 (복습이 필요한 단어장)
  const getNeedsReviewSheets = useCallback((threshold = 50) => {
    return vocabularySheets.filter(sheet => {
      const progress = (sheet.memorized / sheet.total) * 100;
      return progress < threshold;
    });
  }, [vocabularySheets]);

  // 모든 단어장 데이터 불러오기
  const fetchVocabularySheets = useCallback(async () => {
    try {
      setIsVocabularySheetsLoading(true);
      const result = await getUserVocabularySheetsApi();
      if (result.code != 200) return alert('단어장 데이터를 불러오는데 실패했습니다.');
      setVocabularySheets(result.data);
      setErrorVocabularySheets(null);
    } catch (err) {
      setErrorVocabularySheets('단어장 데이터를 불러오는데 실패했습니다.');
      console.error('Failed to fetch vocabulary sheets:', err);
    } finally {
      setIsVocabularySheetsLoading(false);
    }
  }, []);

  // 모든 단어장 조회
  const getVocabularySheets = useCallback(() => {
    return vocabularySheets;
  }, [vocabularySheets]);


  // 단어장 추가
  const addVocabularySheet = useCallback(async (newVocabulary) => {
    try {
      const result = await addUserVocabularySheetApi(newVocabulary);
      if (!result || result.code != 200 || !result.data) {
        const errorMessage = result?.message || '단어장 추가에 실패했습니다.';
        alert(errorMessage);
        throw new Error(errorMessage);
      }
      newVocabulary.id = result.data.id
      newVocabulary.createdAt = result.data.createdAt
      newVocabulary.updatedAt = result.data.createdAt
      newVocabulary.bookstore_id = null;
      newVocabulary.memorized = 0;
      newVocabulary.total = 0;
      newVocabulary.words = [];

      setVocabularySheets(prev => [...prev, newVocabulary]);

      // 서버에서 반환된 최신 단어장 개수 업데이트
      if (result.data.book_cnt !== undefined) {
        setUserProfile(prev => ({ ...prev, book_cnt: result.data.book_cnt }));
      }

      // 업적 업데이트 (새로 완료된 업적이 있는 경우) - 먼저 표시
      if (result.data.goals && result.data.goals.length > 0) {
        // 업적 오버레이 표시
        if (window.overlayContext?.showAwaitOverlay) {
          result.data.goals.forEach(goal => {
            window.overlayContext.showAwaitOverlay(AchievementRewardOverlay, { goal });
          });
        }

        // UserMainPage의 goals 배열 업데이트
        if (window.userContext?.setUserMainPage) {
          window.userContext.setUserMainPage(prevMainPage => {
            const existingGoals = prevMainPage.goals || [];
            const updatedGoals = [...existingGoals];

            result.data.goals.forEach(newGoal => {
              const existingIndex = updatedGoals.findIndex(g => g.type === newGoal.type);
              if (existingIndex >= 0) {
                updatedGoals[existingIndex] = {
                  ...updatedGoals[existingIndex],
                  level: newGoal.level,
                  badge_img: newGoal.badge_img
                };
              } else {
                updatedGoals.push({
                  name: newGoal.name,
                  type: newGoal.type,
                  level: newGoal.level,
                  badge_img: newGoal.badge_img
                });
              }
            });

            return {
              ...prevMainPage,
              goals: updatedGoals
            };
          });
        }
      }

      // 보석 업데이트 및 오버레이 표시 - 나중에 표시
      if (result.data.gem && result.data.gem.after > result.data.gem.before) {
        if (window.overlayContext?.showAwaitOverlay) {
          window.overlayContext.showAwaitOverlay(GemRewardOverlay, {
            gemCount: result.data.gem.after - result.data.gem.before,
            title: "업적 달성 보상!",
            description: "독서왕 업적 달성 보석이 지급되었습니다."
          });
        }

        setUserProfile(prev => ({
          ...prev,
          gem_cnt: result.data.gem.after,
        }));
      }

      return newVocabulary;
    } catch (err) {
      setErrorVocabularySheets('단어장 추가에 실패했습니다.');
      throw err;
    }
  }, [vocabularySheets]);

  // 단어장 수정
  const updateVocabularySheet = useCallback(async (id, updates) => {
    try {
      const result = await updateUserVocabularySheetApi(id, updates);
      if (result.code != 200) return alert('단어장 수정에 실패했습니다.');
      setVocabularySheets(prev =>
        prev.map(sheet =>
          sheet.id === id
            ? {
              ...sheet,
              ...updates,
              updatedAt: result.data.updatedAt
            }
            : sheet
        )
      );
    } catch (err) {
      setErrorVocabularySheets('단어장 수정에 실패했습니다.');
      throw err;
    }
  }, []);

  // 단어장 수정(로컬만 업데이트)
  const updateVocabularySheetState = useCallback((id, updates) => {
    setVocabularySheets(prev => prev.map(sheet => sheet.id === id ? { ...sheet, ...updates, updatedAt: new Date().toISOString() } : sheet));
  }, []);

  // 단어장 수정(서버)
  const updateVocabularySheetServer = useCallback(async (id) => {
    try {
      const updates = vocabularySheets.find(sheet => sheet.id === id);
      const result = await updateUserVocabularySheetApi(id, updates);
      if (result.code != 200) return alert('단어장 수정에 실패했습니다.');
    } catch (err) {
      setErrorVocabularySheets('단어장 수정에 실패했습니다.');
      throw err;
    }
  }, [vocabularySheets]);

  // 단어장 삭제
  const deleteVocabularySheet = useCallback(async (id) => {
    try {
      const result = await deleteUserVocabularySheetApi(id);
      if (result.code != 200) return alert('단어장 삭제에 실패했습니다.');
      setVocabularySheets(prev => prev.filter(sheet => sheet.id !== id));
    } catch (err) {
      setErrorVocabularySheets('단어장 삭제에 실패했습니다.');
      throw err;
    }
  }, []);

  // 특정 단어장 조회
  const getVocabularySheet = useCallback((id) => {
    return vocabularySheets.find(sheet => sheet.id === id);
  }, [vocabularySheets]);

  // 단어 추가
  const addWord = useCallback(async (sheetId, word) => {
    try {
      const newWordData = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${Date.now()}`,
        ef: 2.5,
        repetition: 0,
        interval: 0,
        nextReview: null,
        lastStudyDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...word,
      };
      const vocabularySheet = getVocabularySheet(sheetId);
      console.log(`sheetId: ${sheetId}`);
      console.log(`vocabularySheet: ${JSON.stringify(vocabularySheet)}`);
      await updateVocabularySheet(sheetId, {
        total: vocabularySheet.words.length + 1,
        words: [...vocabularySheet.words, newWordData],
      });
      return newWordData;
    } catch (err) {
      setErrorVocabularySheets('단어 추가에 실패했습니다.');
      throw err;
    }
  }, [vocabularySheets]);

  // 단어 수정
  const updateWord = useCallback(async (sheetId, wordId, updates) => {
    try {
      const copyVocabularySheet = getVocabularySheet(sheetId);
      const updatedWord = { ...copyVocabularySheet.words.find(word => word.id === wordId), ...updates, updatedAt: new Date().toISOString() };
      const copyWords = copyVocabularySheet.words.map(word => word.id === wordId ? updatedWord : word);
      await updateVocabularySheet(sheetId, { words: copyWords });
      return updatedWord;
    } catch (err) {
      setErrorVocabularySheets('단어 수정에 실패했습니다.');
      throw err;
    }
  }, [vocabularySheets]);

  // 단어 수정(로컬만 업데이트)
  const updateWordState = useCallback((sheetId, wordId, updates) => {
    const copyVocabularySheet = getVocabularySheet(sheetId);
    const updatedWord = { ...copyVocabularySheet.words.find(word => word.id === wordId), ...updates, updatedAt: new Date().toISOString() };
    const copyWords = copyVocabularySheet.words.map(word => word.id === wordId ? updatedWord : word);
    updateVocabularySheetState(sheetId, { words: copyWords });
  }, [vocabularySheets]);

  // 단어 삭제
  const deleteWord = useCallback(async (sheetId, wordId) => {
    try {
      const copyVocabularySheet = getVocabularySheet(sheetId);
      const copyWords = copyVocabularySheet.words.filter(word => word.id !== wordId);
      await updateVocabularySheet(sheetId, { total: copyWords.length, words: copyWords });
    } catch (err) {
      setErrorVocabularySheets('단어 삭제에 실패했습니다.');
      throw err;
    }
  }, [vocabularySheets]);

  // 특정 단어장 단어 조회
  const getWord = useCallback((sheetId, wordId) => {
    return vocabularySheets.find(sheet => sheet.id === sheetId).words.find(word => word.id === wordId);
  }, [vocabularySheets]);

  // 필터링된 단어장 목록 가져오기
  const getFilteredVocabularySheets = useCallback((filterOptions = {}) => {
    const { searchTerm, sortBy } = filterOptions;

    let filtered = [...vocabularySheets];

    if (searchTerm) {
      filtered = filtered.filter(sheet =>
        sheet.title.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (sortBy) {
      switch (sortBy) {
        case 'title':
          filtered.sort((a, b) => a.title.localeCompare(b.title));
          break;
        case 'createdAt':
          filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          break;
        case 'updatedAt':
          filtered.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
          break;
        case 'wordCount':
          filtered.sort((a, b) => b.words.length - a.words.length);
          break;
        case 'progress':
          filtered.sort((a, b) => {
            const progressA = (a.memorized / a.total) * 100;
            const progressB = (b.memorized / b.total) * 100;
            return progressB - progressA;
          });
          break;
        default:
          break;
      }
    }

    return filtered;
  }, [vocabularySheets]);


  // 서점 데이터 조회
  const getBookStore = useCallback(() => {
    return bookStore;
  }, [bookStore]);

  // 서점 특정 단어장 조회
  const getBookStoreVocabularySheet = useCallback((bookStoreId) => {
    return bookStore.find(book => book.id === bookStoreId);
  }, [bookStore]);

  // 서점 데이터 불러오기
  const fetchBookStore = useCallback(async () => {
    try {
      setIsBookStoreLoading(true);
      const result = await getBookStoreApi();
      if (result.code != 200) return alert('서점 데이터를 불러오는데 실패했습니다.');
      setBookStore(result.data);
      setErrorBookStore(null);
    } catch (err) {
      setErrorBookStore('서점 데이터를 불러오는데 실패했습니다.');
      console.error('Failed to fetch book store:', err);
    } finally {
      setIsBookStoreLoading(false);
    }
  }, []);

  // 서점의 단어장 내 단어장에 추가
  const addBookStoreVocabularySheet = useCallback(async (vocabularySheet) => {
    try {
      const newVocabularySheet = await addVocabularySheet({
        bookstore_id: vocabularySheet.id,
        title: vocabularySheet.name,
        color: vocabularySheet.color,
      });
      await updateVocabularySheet(newVocabularySheet.id, {
        total: vocabularySheet.words.length,
        words: vocabularySheet.words.map((word, index) => {
          return {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${index}`,
            dictionaryId: word.id,
            origin: word.origin,
            meanings: word.meanings,
            examples: word.examples,
            pronunciation: word.pronunciation,
            ef: 2.5,
            repetition: 0,
            interval: 0,
            nextReview: null,
            lastStudyDate: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        }),
      })
    } catch (err) {
      setErrorVocabularySheets('단어장 추가에 실패했습니다.');
      throw err;
    }
  }, []);

  // 퀴즐렛 업로드 후 백엔드에서 생성된 단어장을 로컬 state에 추가
  const addVocabularySheetFromBackend = useCallback((vocabularySheet) => {
    try {
      setVocabularySheets(prev => [...prev, vocabularySheet]);

      // 서버에서 반환된 최신 단어장 개수 업데이트 (퀴즐렛 등)
      if (vocabularySheet.book_cnt !== undefined) {
        setUserProfile(prev => ({ ...prev, book_cnt: vocabularySheet.book_cnt }));
      }

      return vocabularySheet;
    } catch (err) {
      setErrorVocabularySheets('단어장 추가에 실패했습니다.');
      throw err;
    }
  }, []);

  // 최근 학습 데이터 조회
  const getRecentStudy = useCallback(() => {
    return recentStudy;
  }, [recentStudy]);

  // 최근 학습 데이터 불러오기
  const fetchRecentStudy = useCallback(async () => {
    try {
      setIsRecentStudyLoading(true);
      const result = await getUserRecentStudyDataApi();
      if (result.code != 200) return alert('서점 데이터를 불러오는데 실패했습니다.');
      setRecentStudy(result.data);
      setErrorRecentStudy(null);
    } catch (err) {
      setErrorRecentStudy('최근 학습 데이터를 불러오는데 실패했습니다.');
      console.error('Failed to fetch recent study:', err);
    } finally {
      setIsRecentStudyLoading(false);
    }
  }, []);

  // 최근 학습 데이터 수정
  const updateRecentStudy = useCallback(async (testType, curRecentStudy) => {
    try {
      const result = await updateUserRecentStudyDataApi({ curRecentStudy });
      if (result.code != 200) return alert('최근 학습 데이터를 추가하는데 실패했습니다.');
      setRecentStudy(prev => ({
        ...prev,
        [testType]: result.data,
      }));
      return result.data;
    } catch (err) {
      setErrorRecentStudy('최근 학습 데이터를 추가하는데 실패했습니다.');
      throw err;
    }
  }, []);

  // 최근 학습 데이터 수정(로컬만 업데이트)
  const updateRecentStudyState = useCallback((updates) => {
    setRecentStudy(prev => ({ ...prev, ...updates }));
  }, []);

  // 최근 학습 데이터 수정(서버)
  const updateRecentStudyServer = useCallback(async (testType) => {
    try {
      const result = await updateUserRecentStudyDataApi({ curRecentStudy: recentStudy[testType] });
      if (result.code != 200) return alert('최근 학습 데이터를 추가하는데 실패했습니다.');
      return result.data;
    } catch (err) {
      setErrorRecentStudy('최근 학습 데이터를 추가하는데 실패했습니다.');
      throw err;
    }
  }, [recentStudy]);

  // 복습 지연 단어 조회
  const getDelayedWords = useCallback(() => {
    return delayedWords
  }, [delayedWords]);

  // 복습 지연 단어 목록 업데이트
  const updateDelayedWords = useCallback(() => {
    let words = [];
    vocabularySheets.forEach(sheet => {
      sheet.words.forEach(word => {
        if (word.nextReview !== null && new Date(word.nextReview) < new Date()) {
          words.push(word);
        }
      });
    });
    setDelayedWords(words);
    return words;
  }, [vocabularySheets]);

  // 앱 시작시 데이터 로드 (로그인 상태 확인 후)
  useEffect(() => {
    if (isLogin && isLoginChecked) {
      const loadVocabularyData = async () => {
        try {
          await Promise.all([
            fetchVocabularySheets(),
            fetchBookStore(),
            fetchRecentStudy()
          ]);
        } catch (error) {
          console.error('❌ [VOCABULARY] 데이터 로드 중 오류 발생:', error);
        }
      };

      loadVocabularyData();
    }
  }, [isLogin, isLoginChecked]); // 함수 의존성 제거

  const value = {
    vocabularySheets,
    isVocabularySheetsLoading,
    errorVocabularySheets,
    statistics,
    getVocabularySheets,
    getVocabularySheet,
    addVocabularySheet,
    addVocabularySheetFromBackend,
    updateVocabularySheet,
    updateVocabularySheetState,
    updateVocabularySheetServer,
    deleteVocabularySheet,
    getWord,
    addWord,
    updateWord,
    updateWordState,
    deleteWord,
    getFilteredVocabularySheets,
    getRecentVocabularySheets,
    getProgressSortedSheets,
    getNeedsReviewSheets,
    fetchVocabularySheets,

    bookStore,
    isBookStoreLoading,
    errorBookStore,
    fetchBookStore,
    getBookStore,
    getBookStoreVocabularySheet,
    addBookStoreVocabularySheet,

    recentStudy,
    isRecentStudyLoading,
    errorRecentStudy,
    getRecentStudy,
    fetchRecentStudy,
    updateRecentStudy,
    updateRecentStudyState,
    updateRecentStudyServer,

    delayedWords,
    setDelayedWords,
    getDelayedWords,
    updateDelayedWords,
  };

  return (
    <VocabularyContext.Provider value={value}>
      {children}
    </VocabularyContext.Provider>
  );
};

export const useVocabulary = () => {
  const context = useContext(VocabularyContext);
  if (!context) {
    throw new Error('useVocabulary must be used within a VocabularyProvider');
  }
  return context;
}; 