import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { backendUrl, fetchDataAsync } from '../utils/common';

const VocabularyContext = createContext(null);
export const VocabularyProvider = ({ children }) => {
  const [vocabularySheets, setVocabularySheets] = useState([]);
  const [isVocabularySheetsLoading, setIsVocabularySheetsLoading] = useState(true);
  const [errorVocabularySheets, setErrorVocabularySheets] = useState(null);
  const [bookStore, setBookStore] = useState([]);
  const [isBookStoreLoading, setIsBookStoreLoading] = useState(true);
  const [errorBookStore, setErrorBookStore] = useState(null);
  const [recentStudy, setRecentStudy] = useState({});
  const [isRecentStudyLoading, setIsRecentStudyLoading] = useState(true);
  const [errorRecentStudy, setErrorRecentStudy] = useState(null);


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
      const url = `${backendUrl}/user_voca_book/list`;
      const method = 'GET';
      const fetchData = {};
      const result = await fetchDataAsync(url, method, fetchData);
      if(result.code != 200) return alert('단어장 데이터를 불러오는데 실패했습니다.');
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
      const url = `${backendUrl}/user_voca_book/create`;
      const method = 'POST';
      const fetchData = {
        words: [],
        total: 0,
        memorized: 0,
        ...newVocabulary,
      };
      const result = await fetchDataAsync(url, method, fetchData);
      if(result.code != 200) return alert('단어장 추가에 실패했습니다.');
      fetchData.id = result.data.id
      fetchData.createdAt = result.data.createdAt
      fetchData.updatedAt = result.data.createdAt
      setVocabularySheets(prev => [...prev, fetchData]);
      return fetchData;
    } catch (err) {
      setErrorVocabularySheets('단어장 추가에 실패했습니다.');
      throw err;
    }
  }, []);

  // 단어장 수정
  const updateVocabularySheet = useCallback(async (id, updates) => {
    try {
      const url = `${backendUrl}/user_voca_book/update`;
      const method = 'PATCH';
      const fetchData = {
        ...updates,
        id: id,
      };
      const result = await fetchDataAsync(url, method, fetchData);
      if(result.code != 200) return alert('단어장 수정에 실패했습니다.');
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

  // 단어장 삭제
  const deleteVocabularySheet = useCallback(async (id) => {
    try {
      const url = `${backendUrl}/user_voca_book/delete`;
      const method = 'DELETE';
      const fetchData = {
        id: id,
      };
      const result = await fetchDataAsync(url, method, fetchData);
      if(result.code != 200) return alert('단어장 삭제에 실패했습니다.');
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...word,
      };
      const vocabularySheet = getVocabularySheet(sheetId);
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
      await updateVocabularySheet(sheetId, {words: copyWords});
      return updatedWord;
    } catch (err) {
      setErrorVocabularySheets('단어 수정에 실패했습니다.');
      throw err;
    }
  }, [vocabularySheets]);

  // 단어 삭제
  const deleteWord = useCallback(async (sheetId, wordId) => {
    try {
      const copyVocabularySheet = getVocabularySheet(sheetId);
      const copyWords = copyVocabularySheet.words.filter(word => word.id !== wordId);
      await updateVocabularySheet(sheetId, {total: copyWords.length, words: copyWords});
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
    console.log("bookStore", bookStore)
    return bookStore.find(book => book.id === bookStoreId);
  }, [bookStore]);

  // 서점 데이터 불러오기
  const fetchBookStore = useCallback(async () => {
    try {
      setIsBookStoreLoading(true);
      const url = `${backendUrl}/search/bookstore`;
      const method = 'GET';
      const fetchData = {};
      const result = await fetchDataAsync(url, method, fetchData);
      if(result.code != 200) return alert('서점 데이터를 불러오는데 실패했습니다.');
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
        bookStoreId : vocabularySheet.id,
        title : vocabularySheet.name,
        color : vocabularySheet.color,
      });
      console.log("newVocabularySheet", newVocabularySheet)
      await updateVocabularySheet(newVocabularySheet.id, {
        total : vocabularySheet.words.length,
        words: vocabularySheet.words.map((word, index)=>{
          return {
            id : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${index}`,
            dictionaryId : word.id,
            origin : word.origin,
            meanings : word.meanings,
            examples : word.examples,
            pronunciation : word.pronunciation,
            ef : 2.5,
            repetition : 0,
            interval : 0,
            nextReview : null,
            createdAt : new Date().toISOString(),
            updatedAt : new Date().toISOString(),
          }
        }),
      })
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
      const url = `${backendUrl}/mainpage/user_recent_study_data`;
      const method = 'GET';
      const fetchData = {};
      const result = await fetchDataAsync(url, method, fetchData);
      if(result.code != 200) return alert('서점 데이터를 불러오는데 실패했습니다.');
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
  const updateRecentStudy = useCallback(async (recentStudy) => {
    try {
      const url = `${backendUrl}/mainpage/user_recent_study_create_update`;
      const method = 'POST';
      const fetchData = {
        ...recentStudy,
      };
      const result = await fetchDataAsync(url, method, fetchData);
      if(result.code != 200) return alert('최근 학습 데이터를 추가하는데 실패했습니다.');
      return result.data;
    } catch (err) {
      setErrorRecentStudy('최근 학습 데이터를 추가하는데 실패했습니다.');
      throw err;
    }
  }, []);

  // 앱 시작시 데이터 로드
  useEffect(() => {
    fetchVocabularySheets();
    fetchBookStore();
    fetchRecentStudy();
  }, [fetchVocabularySheets, fetchBookStore, fetchRecentStudy]);

  const value = {
    vocabularySheets,
    isVocabularySheetsLoading,
    errorVocabularySheets,
    statistics,
    getVocabularySheets,
    getVocabularySheet,
    addVocabularySheet,
    updateVocabularySheet,
    deleteVocabularySheet,
    getWord,
    addWord,
    updateWord,
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