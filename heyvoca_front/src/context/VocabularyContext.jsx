import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { backendUrl, fetchDataAsync } from '../utils/common';
// 나중에 API 호출 함수들을 여기로 이동
const mockVocabularyData = [
  {
    id: '1',
    title: '영어 단어장',
    color: {
      main : "#FF8DD4",
      sub : "#FF8DD44d",
      background : "#FFEFFA"
    },
    total : 500,
    memorized : 100,
    words: [
      { 
        id: '1', // 사용자 단어장 데이터 기준 단어 ID,
        dictionaryId : 1, // 헤이보카 사전의 단어 ID, 없으면 null
        origin: 'apple', // 학습할 단어
        meanings: ['사과', '빨간 사과', '빨간 비닐봉지 안에 있는 사과'], // 학습할 단어의 뜻
        examples: [{ // 학습할 단어의 예시 리스트
          origin: 'I eat an apple every day.', // 학습할 단어의 예시
          meaning: '나는 매일 사과를 먹는다.' // 학습할 단어의 예시의 뜻
        }],
        createdAt: new Date('2024-01-01').toISOString(), // 단어 등록 일자
        updatedAt: new Date('2024-01-01').toISOString(), // 단어 수정 일자
      },
    ],
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date('2024-01-01').toISOString(),
  },
  {
    id: '2',
    title: '일본어 단어장',
    color: {
      main : "#74D5FF",
      sub : "#74D5FF4d",
      background : "#EAF6FF"
    },
    total : 500,
    memorized : 100,
    words: [],
    createdAt: new Date('2024-01-02').toISOString(),
    updatedAt: new Date('2024-01-02').toISOString(),
  },
  {
    id: '3',
    title: '중국어 단어장',
    color: {
      main : "#42F98B",
      sub : "#42F98B4d",
      background : "#E6FFE9"
    },
    total : 500,
    memorized : 100,
    words: [],
    createdAt: new Date('2024-01-03').toISOString(),
    updatedAt: new Date('2024-01-03').toISOString(),
  },
  {
    id: '4',
    title: '한국어 단어장',
    color: {
      main : "#FFBD3C",
      sub : "#FFBD3C4d",
      background : "#FFF8E6"
    },
    total : 500,
    memorized : 100,
    words: [],
    createdAt: new Date('2024-01-04').toISOString(),
    updatedAt: new Date('2024-01-04').toISOString(),
  },
  {
    id: '5',
    title: '프랑스어 단어장',
    color: {
      main : "#CD8DFF",
      sub : "#CD8DFF4d",
      background : "#F8E6FF"
    },
    total : 500,
    memorized : 100,
    words: [],
    createdAt: new Date('2024-01-05').toISOString(),  
    updatedAt: new Date('2024-01-05').toISOString(),
  }
];

const VocabularyContext = createContext(null);

export const VocabularyProvider = ({ children }) => {
  const [vocabularySheets, setVocabularySheets] = useState([]);
  const [isVocabularySheetsLoading, setIsVocabularySheetsLoading] = useState(true);
  const [errorVocabularySheets, setErrorVocabularySheets] = useState(null);
  const [bookStore, setBookStore] = useState([]);
  const [isBookStoreLoading, setIsBookStoreLoading] = useState(true);
  const [errorBookStore, setErrorBookStore] = useState(null);

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
        ...newVocabulary,
        words: [],
        total: 0,
        memorized: 0,
      };
      const result = await fetchDataAsync(url, method, fetchData);
      if(result.code != 200) return alert('단어장 추가에 실패했습니다.');
      fetchData.id = result.data.id
      fetchData.createdAt = result.data.createdAt
      fetchData.updatedAt = result.data.updatedAt
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
        id: Date.now().toString(),
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



  // 앱 시작시 데이터 로드
  useEffect(() => {
    fetchVocabularySheets();
    fetchBookStore();
  }, [fetchVocabularySheets, fetchBookStore]);

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