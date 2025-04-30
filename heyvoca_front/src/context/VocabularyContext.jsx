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
      { id: '1', word: 'apple', meaning: '사과', example: 'I eat an apple every day.' },
      { id: '2', word: 'book', meaning: '책', example: 'I read a book yesterday.' }
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

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
      setIsLoading(true);
      const url = `${backendUrl}/user_voca_book/list`;
      const method = 'GET';
      const fetchData = {};
      const result = await fetchDataAsync(url, method, fetchData);
      if(result.code != 200) return alert('단어장 데이터를 불러오는데 실패했습니다.');
      setVocabularySheets(result.data);
      setError(null);
    } catch (err) {
      setError('단어장 데이터를 불러오는데 실패했습니다.');
      console.error('Failed to fetch vocabulary sheets:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

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
      setError('단어장 추가에 실패했습니다.');
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
      setError('단어장 수정에 실패했습니다.');
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
      setError('단어장 삭제에 실패했습니다.');
      throw err;
    }
  }, []);

  // 단어 추가
  const addWord = useCallback(async (sheetId, newWord) => {
    try {
      // TODO: API 호출로 변경
      const wordWithId = {
        ...newWord,
        id: Date.now().toString(),
      };

      setVocabularySheets(prev => 
        prev.map(sheet => 
          sheet.id === sheetId 
            ? {
                ...sheet,
                words: [...sheet.words, wordWithId],
                updatedAt: new Date().toISOString()
              }
            : sheet
        )
      );
      return wordWithId;
    } catch (err) {
      setError('단어 추가에 실패했습니다.');
      throw err;
    }
  }, []);

  // 단어 수정
  const updateWord = useCallback(async (sheetId, wordId, updates) => {
    try {
      // TODO: API 호출로 변경
      setVocabularySheets(prev => 
        prev.map(sheet => 
          sheet.id === sheetId 
            ? {
                ...sheet,
                words: sheet.words.map(word =>
                  word.id === wordId 
                    ? { ...word, ...updates }
                    : word
                ),
                updatedAt: new Date().toISOString()
              }
            : sheet
        )
      );
    } catch (err) {
      setError('단어 수정에 실패했습니다.');
      throw err;
    }
  }, []);

  // 단어 삭제
  const deleteWord = useCallback(async (sheetId, wordId) => {
    try {
      // TODO: API 호출로 변경
      setVocabularySheets(prev => 
        prev.map(sheet => 
          sheet.id === sheetId 
            ? {
                ...sheet,
                words: sheet.words.filter(word => word.id !== wordId),
                updatedAt: new Date().toISOString()
              }
            : sheet
        )
      );
    } catch (err) {
      setError('단어 삭제에 실패했습니다.');
      throw err;
    }
  }, []);

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

  // 앱 시작시 데이터 로드
  useEffect(() => {
    fetchVocabularySheets();
  }, [fetchVocabularySheets]);

  const value = {
    vocabularySheets,
    isLoading,
    error,
    statistics,
    addVocabularySheet,
    updateVocabularySheet,
    deleteVocabularySheet,
    addWord,
    updateWord,
    deleteWord,
    getFilteredVocabularySheets,
    getRecentVocabularySheets,
    getProgressSortedSheets,
    getNeedsReviewSheets,
    refreshData: fetchVocabularySheets,
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