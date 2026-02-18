import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useUser } from './UserContext';
import { getUserVocabularySheetsApi, addUserVocabularySheetApi, updateUserVocabularySheetApi, deleteUserVocabularySheetApi } from '../api/voca';
import {
  getUserDictionaryApi,
  createUserDictionaryWordApi,
  updateUserDictionaryWordApi,
  updateUserBookWordApi,
  linkUserDictionaryWordApi,
  deleteUserDictionaryWordApi,
  deleteWordFromVocaBookApi
} from '../api/userDictionary';
import {
  getVocaBooksApi,
  getVocaBookDetailApi,
  createVocaBookApi,
  updateVocaBookApi,
  deleteVocaBookApi
} from '../api/vocaBooks';
import { getBookStoreApi } from '../api/bookStore';
import { getUserRecentStudyDataApi, updateUserRecentStudyDataApi } from '../api/study';
import AchievementRewardOverlay from '../components/overlay/AchievementRewardOverlay';
import GemRewardOverlay from '../components/overlay/GemRewardOverlay';

const VocabularyContext = createContext(null);
export const VocabularyProvider = ({ children }) => {
  const { isLogin, isLoginChecked, setUserProfile } = useUser();

  const [vocabularySheetsLegacy, setVocabularySheets] = useState([]); // Removed, but kept setter for safety locally if needed, actually we removed setter usage.

  // [NEW] User Dictionary & Voca Books State
  const [userDictionary, setUserDictionary] = useState({}); // Map: { [vocaIndexId]: WordData }
  const [vocaBooks, setVocaBooks] = useState([]);
  const [isUserDictionaryLoading, setIsUserDictionaryLoading] = useState(true);
  const [isVocaBooksLoading, setIsVocaBooksLoading] = useState(true);

  // Legacy loading states (mapped to new states or kept for compatibility)
  const [isVocabularySheetsLoading, setIsVocabularySheetsLoading] = useState(true);
  const [errorVocabularySheets, setErrorVocabularySheets] = useState(null);

  const [bookStore, setBookStore] = useState([]);
  const [isBookStoreLoading, setIsBookStoreLoading] = useState(true);
  const [errorBookStore, setErrorBookStore] = useState(null);
  const [recentStudy, setRecentStudy] = useState({});
  const [isRecentStudyLoading, setIsRecentStudyLoading] = useState(true);
  const [errorRecentStudy, setErrorRecentStudy] = useState(null);

  const [delayedWords, setDelayedWords] = useState([]);
  // [REF] vocabularySheets is now derived from vocaBooks and userDictionary
  const vocabularySheets = useMemo(() => {
    if (!vocaBooks.length) return [];

    return vocaBooks.map(book => {
      // Find all words that belong to this book
      const words = Object.values(userDictionary)
        .filter(word =>
          word.vocaBooks && word.vocaBooks.some(vb => String(vb.vocaBookId) === String(book.vocaBookId))
        )
        .map(word => {
          // Merge book-specific info (like meanings if overridden)
          const bookInfo = word.vocaBooks.find(vb => String(vb.vocaBookId) === String(book.vocaBookId));
          return {
            ...word,
            ...bookInfo,
            id: word.vocaIndexId // Ensure compatibility if components use 'id'
          };
        });

      return {
        ...book,
        id: book.vocaBookId, // Compatibility
        total: words.length,
        memorized: words.filter(w => w.repetition > 0).length, // Approximate memorized count
        words: words
      };
    });
  }, [vocaBooks, userDictionary]);

  // [REF] 통계 데이터 계산
  const statistics = useMemo(() => {
    const totalWords = Object.keys(userDictionary).length;
    const memorizedWords = Object.values(userDictionary).filter(word => word.repetition > 0).length;

    return {
      totalWords,
      memorizedWords,
      progress: totalWords > 0 ? (memorizedWords / totalWords) * 100 : 0
    };
  }, [userDictionary]);

  // [NEW] 사용자 사전 데이터 불러오기
  const fetchUserDictionary = useCallback(async () => {
    try {
      setIsUserDictionaryLoading(true);
      const result = await getUserDictionaryApi();
      if (result.code === 200) {
        // 배열을 Map 객체로 변환 (ID 기반 빠른 조회를 위해)
        const dictionaryMap = {};
        result.data.forEach(word => {
          dictionaryMap[word.vocaIndexId] = word;
        });
        setUserDictionary(dictionaryMap);
      } else {
        console.error('사용자 사전 로드 실패:', result);
      }
    } catch (err) {
      console.error('fetchUserDictionary 오류:', err);
    } finally {
      setIsUserDictionaryLoading(false);
    }
  }, []);

  // [NEW] 단어장(Books) 데이터 불러오기
  const fetchVocaBooks = useCallback(async () => {
    try {
      setIsVocaBooksLoading(true);
      const result = await getVocaBooksApi();
      if (result.code === 200) {
        setVocaBooks(result.data);
      } else {
        console.error('단어장 목록 로드 실패:', result);
      }
    } catch (err) {
      console.error('fetchVocaBooks 오류:', err);
    } finally {
      setIsVocaBooksLoading(false);
    }
  }, []);

  // [NEW] 사용자 사전 단어 추가 (또는 연결)
  const addUserDictionaryWord = useCallback(async (vocaBookId, wordData) => {
    try {
      // 1. 이미 존재하는 단어인지 확인 (origin 기준)
      const existingWord = Object.values(userDictionary).find(w => w.origin === wordData.origin);

      if (existingWord) {
        // 이미 존재하면 -> 연결 (Link)
        const result = await linkUserDictionaryWordApi(existingWord.vocaIndexId, vocaBookId, {
          meanings: wordData.meanings,
          examples: wordData.examples
        });

        if (result.code === 201 && result.data) {
          // 상태 업데이트 (기존 단어 정보 갱신)
          const updatedWord = result.data;
          setUserDictionary(prev => ({
            ...prev,
            [updatedWord.vocaIndexId]: updatedWord
          }));
          fetchVocaBooks(); // 단어장 목록 갱신
          return updatedWord;
        } else if (result.code === 409) {
          throw new Error('이미 해당 단어장에 등록된 단어입니다.');
        } else {
          throw new Error(result.message || '단어 연결 실패');
        }

      } else {
        // 존재하지 않으면 -> 생성 (Create)
        const payload = {
          ...wordData,
          vocaBookId,
          sm2: wordData.sm2 || {
            repetition: 0,
            interval: 0,
            ef: 2.5,
            nextReview: null,
            lastStudyDate: null,
            beforeScheduleCount: 0
          }
        };
        const result = await createUserDictionaryWordApi(payload);

        if (result.code === 201 && result.data) {
          const newWord = result.data;
          setUserDictionary(prev => ({
            ...prev,
            [newWord.vocaIndexId]: newWord
          }));
          fetchVocaBooks();
          return newWord;
        } else {
          throw new Error(result.message || '단어 추가 실패');
        }
      }
    } catch (err) {
      console.error('addUserDictionaryWord 오류:', err);
      throw err;
    }
  }, [userDictionary, fetchVocaBooks]);

  // [NEW] 사용자 사전 단어 수정
  const updateUserDictionaryWord = useCallback(async (vocaIndexId, updates) => {
    try {
      const result = await updateUserDictionaryWordApi(vocaIndexId, updates);
      if (result.code === 200 && result.data) {
        setUserDictionary(prev => ({
          ...prev,
          [vocaIndexId]: result.data
        }));
        return result.data;
      }
    } catch (err) {
      console.error('updateUserDictionaryWord 오류:', err);
      throw err;
    }
  }, []);

  // [NEW] 사용자 단어장 내 단어 정보(의미/예문) 수정
  const updateUserBookWord = useCallback(async (vocaIndexId, vocaBookId, updates) => {
    try {
      const result = await updateUserBookWordApi(vocaIndexId, vocaBookId, updates);
      if (result.code === 200 && result.data) {
        // userDictionary 내의 해당 단어 정보(vocaBooks 배열) 갱신
        setUserDictionary(prev => {
          const word = prev[vocaIndexId];
          if (!word) return prev;

          // vocaBooks 배열 내에서 현재 단어장 정보 찾아서 업데이트
          // API 응답이 전체 단어 객체인지, 수정된 부분만 오는지에 따라 다르지만
          // 여기서는 안전하게 전체 단어를 다시 fetch 하거나, 일단 result.data를 믿고 병합
          // 명세상 result.data가 단어장 정보.
          const newVocaBooks = word.vocaBooks.map(book =>
            String(book.vocaBookId) === String(vocaBookId) ? { ...book, ...result.data } : book
          );

          return {
            ...prev,
            [vocaIndexId]: { ...word, vocaBooks: newVocaBooks }
          };
        });
        return result.data;
      }
    } catch (err) {
      console.error('updateUserBookWord 오류:', err);
      throw err;
    }
  }, []);

  // [NEW] 사용자 사전 단어 삭제 (전체 삭제)
  const deleteUserDictionaryWord = useCallback(async (vocaIndexId) => {
    try {
      const result = await deleteUserDictionaryWordApi(vocaIndexId);
      if (result.code === 204) {
        setUserDictionary(prev => {
          const newState = { ...prev };
          delete newState[vocaIndexId];
          return newState;
        });
        // 연관된 단어장 정보도 갱신 필요할 수 있음
        fetchVocaBooks();
      }
    } catch (err) {
      console.error('deleteUserDictionaryWord 오류:', err);
      throw err;
    }
  }, [fetchVocaBooks]);

  // [NEW] 단어장 생성
  const createVocaBook = useCallback(async (data) => {
    try {
      const result = await createVocaBookApi(data);
      if (result.code === 201 && result.data) {
        setVocaBooks(prev => [...prev, result.data]);
        return result.data;
      }
    } catch (err) {
      console.error('createVocaBook 오류:', err);
      throw err;
    }
  }, []);

  // [NEW] 단어장 수정
  const updateVocaBook = useCallback(async (vocaBookId, updates) => {
    try {
      const result = await updateVocaBookApi(vocaBookId, updates);
      if (result.code === 200 && result.data) {
        setVocaBooks(prev => prev.map(book => book.vocaBookId === vocaBookId ? result.data : book));
        return result.data;
      }
    } catch (err) {
      console.error('updateVocaBook 오류:', err);
      throw err;
    }
  }, []);

  // [NEW] 단어장 삭제
  const deleteVocaBook = useCallback(async (vocaBookId) => {
    try {
      const result = await deleteVocaBookApi(vocaBookId);
      if (result.code === 204) {
        setVocaBooks(prev => prev.filter(book => book.vocaBookId !== vocaBookId));
      }
    } catch (err) {
      console.error('deleteVocaBook 오류:', err);
      throw err;
    }
  }, []);

  // [UPDATED] 모든 단어장 데이터 불러오기 (New APIs)
  const fetchVocabularySheets = useCallback(async () => {
    try {
      setIsVocabularySheetsLoading(true);
      await Promise.all([fetchVocaBooks(), fetchUserDictionary()]);
      setErrorVocabularySheets(null);
    } catch (err) {
      setErrorVocabularySheets('단어장 데이터를 불러오는데 실패했습니다.');
      console.error('Failed to fetch vocabulary sheets:', err);
    } finally {
      setIsVocabularySheetsLoading(false);
    }
  }, [fetchVocaBooks, fetchUserDictionary]);

  // 모든 단어장 조회
  const getVocabularySheets = useCallback(() => {
    return vocabularySheets;
  }, [vocabularySheets]);


  // [UPDATED] 단어장 추가
  const addVocabularySheet = useCallback(async (newVocabulary) => {
    try {
      const result = await createVocaBookApi(newVocabulary);
      if (!result || result.code != 201 || !result.data) {
        const errorMessage = result?.message || '단어장 추가에 실패했습니다.';
        alert(errorMessage);
        throw new Error(errorMessage);
      }

      const newBook = result.data;

      setVocaBooks(prev => [...prev, newBook]);

      // 서버에서 반환된 최신 단어장 개수 업데이트
      if (newBook.book_cnt !== undefined) {
        setUserProfile(prev => ({ ...prev, book_cnt: newBook.book_cnt }));
      }

      // 업적 업데이트 (새로 완료된 업적이 있는 경우) - 먼저 표시
      if (newBook.goals && newBook.goals.length > 0) {
        // 업적 오버레이 표시
        if (window.overlayContext?.showAwaitOverlay) {
          newBook.goals.forEach(goal => {
            window.overlayContext.showAwaitOverlay(AchievementRewardOverlay, { goal });
          });
        }

        // UserMainPage의 goals 배열 업데이트
        if (window.userContext?.setUserMainPage) {
          window.userContext.setUserMainPage(prevMainPage => {
            const existingGoals = prevMainPage.goals || [];
            const updatedGoals = [...existingGoals];

            newBook.goals.forEach(newGoal => {
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
      if (newBook.gem && newBook.gem.after > newBook.gem.before) {
        if (window.overlayContext?.showAwaitOverlay) {
          window.overlayContext.showAwaitOverlay(GemRewardOverlay, {
            gemCount: newBook.gem.after - newBook.gem.before,
            title: "업적 달성 보상!",
            description: "독서왕 업적 달성 보석이 지급되었습니다."
          });
        }

        setUserProfile(prev => ({
          ...prev,
          gem_cnt: newBook.gem.after,
        }));
      }

      return newBook;
    } catch (err) {
      setErrorVocabularySheets('단어장 추가에 실패했습니다.');
      throw err;
    }
  }, []);

  // [UPDATED] 단어장 수정
  const updateVocabularySheet = useCallback(async (id, updates) => {
    try {
      return await updateVocaBook(id, updates);
    } catch (err) {
      setErrorVocabularySheets('단어장 수정에 실패했습니다.');
      throw err;
    }
  }, [updateVocaBook]);

  // [UPDATED] 단어장 수정(로컬만 업데이트)
  const updateVocabularySheetState = useCallback((id, updates) => {
    setVocaBooks(prev =>
      prev.map(book =>
        book.vocaBookId === id
          ? { ...book, ...updates, updatedAt: new Date().toISOString() }
          : book
      )
    );
  }, []);

  // [UPDATED] 단어장 수정(서버)
  const updateVocabularySheetServer = useCallback(async (id) => {
    try {
      const book = vocaBooks.find(b => String(b.vocaBookId) === String(id));
      if (!book) return;

      const { title, color } = book;
      await updateVocaBook(id, { title, color });

    } catch (err) {
      setErrorVocabularySheets('단어장 수정에 실패했습니다.');
      throw err;
    }
  }, [vocaBooks, updateVocaBook]);

  // [UPDATED] 단어장 삭제
  const deleteVocabularySheet = useCallback(async (id) => {
    try {
      return await deleteVocaBook(id);
    } catch (err) {
      setErrorVocabularySheets('단어장 삭제에 실패했습니다.');
      throw err;
    }
  }, [deleteVocaBook]);

  // 특정 단어장 조회
  const getVocabularySheet = useCallback((id) => {
    // vocabularySheets is now memoized, so find works as before
    // id should be compared with compatible types
    return vocabularySheets.find(sheet => String(sheet.id) === String(id));
  }, [vocabularySheets]);

  // [UPDATED] 단어 추가
  const addWord = useCallback(async (sheetId, word) => {
    try {
      return await addUserDictionaryWord(sheetId, word);
    } catch (err) {
      setErrorVocabularySheets('단어 추가에 실패했습니다.');
      throw err;
    }
  }, [addUserDictionaryWord]);

  // [UPDATED] 단어 수정 (사전 수정으로 처리)
  const updateWord = useCallback(async (sheetId, wordId, updates) => {
    try {
      return await updateUserDictionaryWord(wordId, updates);
    } catch (err) {
      setErrorVocabularySheets('단어 수정에 실패했습니다.');
      throw err;
    }
  }, [updateUserDictionaryWord]);

  // [UPDATED] 단어 수정(로컬만 업데이트)
  const updateWordState = useCallback((sheetId, wordId, updates) => {
    setUserDictionary(prev => ({
      ...prev,
      [wordId]: { ...prev[wordId], ...updates }
    }));
  }, []);

  // [UPDATED] 단어 삭제
  const deleteWord = useCallback(async (sheetId, wordId) => {
    try {
      // 1. userDictionary에서 해당 단어 정보 확인
      const word = userDictionary[wordId];

      // 단어가 없거나 vocaBooks 정보가 없으면 안전하게 매핑 삭제 시도
      if (!word || !word.vocaBooks || word.vocaBooks.length <= 1) {
        // 이 단어장에만 있거나 정보가 불확실하면 -> 단어 자체 삭제 (Cascade로 매핑도 삭제됨)
        await deleteUserDictionaryWordApi(wordId);
      } else {
        // 다른 단어장에도 포함되어 있다면 -> 현재 단어장에서만 매핑 삭제
        await deleteWordFromVocaBookApi(wordId, sheetId);
      }

      fetchUserDictionary(); // Refresh to update relationships
    } catch (err) {
      setErrorVocabularySheets('단어 삭제에 실패했습니다.');
      throw err;
    }
  }, [userDictionary, fetchUserDictionary]);

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

  // 퀴즐렛 업로드 후 백엔드에서 생성된 단어장을 로컬 state에 추가 (리패치로 처리)
  const addVocabularySheetFromBackend = useCallback(async (vocabularySheet) => {
    try {
      // 데이터 무결성을 위해 전체 리로드
      await Promise.all([fetchVocaBooks(), fetchUserDictionary()]);

      // 서버에서 반환된 최신 단어장 개수 업데이트 (퀴즐렛 등)
      if (vocabularySheet.book_cnt !== undefined) {
        setUserProfile(prev => ({ ...prev, book_cnt: vocabularySheet.book_cnt }));
      }

      return vocabularySheet;
    } catch (err) {
      setErrorVocabularySheets('단어장 추가에 실패했습니다.');
      throw err;
    }
  }, [fetchVocaBooks, fetchUserDictionary]);

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
        const nextReview = word.sm2?.nextReview ?? word.nextReview;
        if (nextReview !== null && nextReview !== undefined && new Date(nextReview) < new Date()) {
          words.push(word);
        }
      });
    });
    setDelayedWords(words);
    return words;
  }, [vocabularySheets]);



  // 최근 학습한 단어장 목록 가져오기 (상위 5개)
  const getRecentVocabularySheets = useCallback(() => {
    return [...vocabularySheets]
      .sort((a, b) => new Date(b.lastStudyDate || 0) - new Date(a.lastStudyDate || 0))
      .slice(0, 5);
  }, [vocabularySheets]);

  // 진행률 높은 순 단어장 목록 가져오기
  const getProgressSortedSheets = useCallback(() => {
    return [...vocabularySheets]
      .sort((a, b) => {
        const progressA = (a.memorized / a.total) * 100 || 0;
        const progressB = (b.memorized / b.total) * 100 || 0;
        return progressB - progressA;
      });
  }, [vocabularySheets]);

  // 복습 필요한 단어장 목록 가져오기
  const getNeedsReviewSheets = useCallback(() => {
    // 복습 필요한 단어가 있는 단어장 (현재 단순 구현, 추후 구체화)
    return vocabularySheets.filter(sheet => {
      return sheet.words.some(word =>
        word.nextReview && new Date(word.nextReview) < new Date()
      );
    });
  }, [vocabularySheets]);




  // 앱 시작시 데이터 로드 (로그인 상태 확인 후)
  useEffect(() => {
    if (isLogin && isLoginChecked) {
      const loadVocabularyData = async () => {
        try {
          await Promise.all([
            fetchVocabularySheets(),
            fetchBookStore(),
            fetchRecentStudy(),
            // [NEW] 새로운 데이터 로드
            fetchUserDictionary(),
            fetchVocaBooks()
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

    // [NEW] Exports
    userDictionary,
    vocaBooks,
    isUserDictionaryLoading,
    isVocaBooksLoading,
    fetchUserDictionary,
    fetchVocaBooks,
    setUserDictionary, // 필요 시 외부에서 상태 업데이트용
    setVocaBooks,
    addUserDictionaryWord,
    updateUserDictionaryWord,
    updateUserBookWord,
    deleteUserDictionaryWord,
    createVocaBook,
    updateVocaBook,
    deleteVocaBook,

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