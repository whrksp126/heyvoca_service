import React, { useEffect, useState } from 'react';
import Main from '../components/takeTest/Main';
import Header from '../components/takeTest/Header';
import { useLocation, useNavigate } from 'react-router-dom';
import { useVocabulary } from '../context/VocabularyContext';
import { getQuestionType } from '../plugins/questionTypes';
import { useNewBottomSheetActions } from '../context/NewBottomSheetContext';
import MakeStudyData from '../components/takeTest/MakeStudyData';
import SaveStudyData from '../components/takeTest/SaveStudyData';
import { MEMORY_STATES, getWordMemoryState, isWordOverdue } from '../utils/common';
import { ConfirmNewBottomSheet } from '../components/newBottomSheet/ConfirmNewBottomSheet';
import { AppHistory } from '../utils/appHistory';

const TakeTest = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { state } = useLocation();
  const { isRecentStudyLoading, isVocabularySheetsLoading, vocabularySheets, recentStudy, updateRecentStudy, updateVocabularySheetServer, updateRecentStudyServer, updateRecentStudyState, fetchVocabularySheets, updateWord } = useVocabulary();
  const { pushAwaitNewBottomSheet } = useNewBottomSheetActions();
  const [testQuestions, setTestQuestions] = useState([]);
  const [isTestQuestionsSetting, setIsTestQuestionsSetting] = useState(true);
  const [progressIndex, setProgressIndex] = useState(0);
  const navigate = useNavigate();
  // 업데이트해야 할 단어장 아이디를 저장할 Set (중복 방지)
  const [pendingUpdateSheetIds, setPendingUpdateSheetIds] = useState(new Set());
  // 업데이트해야 할 단어 아이디와 데이터를 저장할 Map (중복 방지, 마지막 상태 저장)
  const [pendingUpdateWords, setPendingUpdateWords] = useState(new Map());

  // Fisher-Yates 셔플 알고리즘 (더 정확한 랜덤 셔플)
  const shuffleArray = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };



  // React Compiler가 자동으로 useCallback 처리
  const setupTestQuestions = (targetMemoryState, vocabularySheetId, count, testType) => {
    let allWords = [];

    // 같은 word.id(= vocaIndexId)는 여러 단어장에 있어도 암기 상태를 공유하므로
    // 한 번만 출제한다. 기본적으로 처음 만난 단어장 버전을 유지하되,
    // 그 버전의 meanings가 비어있고 뒤에 등장한 버전엔 있으면 교체한다
    // (단어장에 따라 의미가 비어있는 매핑이 존재할 수 있기 때문).
    const hasMeanings = (w) => Array.isArray(w?.meanings) && w.meanings.length > 0;
    const dedupeByWordId = (entries) => {
      const byId = new Map();
      for (const w of entries) {
        const existing = byId.get(w.id);
        if (!existing) {
          byId.set(w.id, w);
          continue;
        }
        if (!hasMeanings(existing) && hasMeanings(w)) {
          byId.set(w.id, w);
        }
      }
      return Array.from(byId.values());
    };

    if (vocabularySheetId === "all") {
      allWords = dedupeByWordId(
        vocabularySheets.flatMap(sheet =>
          sheet.words.map(word => ({
            ...word,
            vocabularySheetId: sheet.id
          }))
        )
      );
    } else if (Array.isArray(vocabularySheetId)) {
      const idSet = new Set(vocabularySheetId);
      allWords = dedupeByWordId(
        vocabularySheets
          .filter(sheet => idSet.has(sheet.id))
          .flatMap(sheet =>
            sheet.words.map(word => ({
              ...word,
              vocabularySheetId: sheet.id
            }))
          )
      );
    } else {
      const vocabularySheet = vocabularySheets.find(sheet => sheet.id === vocabularySheetId);
      if (vocabularySheet) {
        allWords = vocabularySheet.words;
      }
    }

    // 현재 날짜 (시간 제거, 날짜만 비교)
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // 1. 미학습 단어들 (nextReview가 null이거나 없음, 또는 repetition === 0 && interval === 0)
    const unlearnedWords = allWords.filter(word => {
      const repetition = word.sm2?.repetition ?? word.repetition ?? 0;
      const interval = word.sm2?.interval ?? word.interval ?? 0;
      const nextReview = word.sm2?.nextReview ?? word.nextReview;
      return (!nextReview || nextReview === null) && repetition === 0 && interval === 0;
    });

    // 2. 복습 지연 단어들 (nextReview가 오늘 이전인 것들)
    const overdueWords = allWords.filter(word => {
      const nextReview = word.sm2?.nextReview ?? word.nextReview;
      if (!nextReview) return false;
      const nextReviewDate = new Date(nextReview);
      nextReviewDate.setHours(0, 0, 0, 0);
      return nextReviewDate < now;
    });

    // 3. 오늘 학습 예정 단어들 (nextReview가 오늘인 것들)
    const todayScheduledWords = allWords.filter(word => {
      const nextReview = word.sm2?.nextReview ?? word.nextReview;
      if (!nextReview) return false;
      const nextReviewDate = new Date(nextReview);
      nextReviewDate.setHours(0, 0, 0, 0);
      return nextReviewDate.getTime() === now.getTime();
    });

    // 4. 복습 지연 단어들을 nextReview 기준으로 정렬 (가장 오래된 것부터)
    const sortedOverdueWords = overdueWords.sort((a, b) => {
      const dateA = new Date(a.nextReview);
      const dateB = new Date(b.nextReview);
      return dateA - dateB; // 오름차순 (가장 오래된 것부터)
    });

    let selectedWords = [];

    // 오늘의 학습 (today): 망각 곡선 중심의 단어 추천
    if (testType === 'today') {
      // 우선순위 1: 복습 지연 단어들 (가장 오래된 것부터)
      selectedWords.push(...sortedOverdueWords.slice(0, count));

      // 우선순위 2: 오늘 학습 예정 단어들 (부족한 경우에만)
      if (selectedWords.length < count) {
        const remainingCount = count - selectedWords.length;
        const selectedWordIds = new Set(selectedWords.map(w => w.id));
        const availableTodayScheduled = todayScheduledWords.filter(w => !selectedWordIds.has(w.id));
        selectedWords.push(...availableTodayScheduled.slice(0, remainingCount));
      }

      // 우선순위 3: 미학습 단어들 (부족한 경우에만)
      if (selectedWords.length < count) {
        const remainingCount = count - selectedWords.length;
        const selectedWordIds = new Set(selectedWords.map(w => w.id));
        const availableUnlearned = unlearnedWords.filter(w => !selectedWordIds.has(w.id));
        selectedWords.push(...availableUnlearned.slice(0, remainingCount));
      }

      // 랜덤하게 섞기
      selectedWords = shuffleArray(selectedWords).slice(0, count);
    }
    // 빠른 복습: 망각 곡선 우선순위로 전체 사전에서 자동 선별
    else if (testType === 'quick') {
      // 우선순위 1: 복습 지연 (가장 오래된 것부터)
      selectedWords.push(...sortedOverdueWords.slice(0, count));

      // 우선순위 2: 오늘 학습 예정
      if (selectedWords.length < count) {
        const ids = new Set(selectedWords.map(w => w.id));
        selectedWords.push(
          ...todayScheduledWords.filter(w => !ids.has(w.id)).slice(0, count - selectedWords.length)
        );
      }

      // 우선순위 3: 단기 기억 (interval 1~10일, nextReview 임박한 것부터)
      if (selectedWords.length < count) {
        const ids = new Set(selectedWords.map(w => w.id));
        const shortTerm = allWords
          .filter(w => {
            const interval = w.sm2?.interval ?? w.interval ?? 0;
            return interval > 0 && interval < 10 && !ids.has(w.id);
          })
          .sort((a, b) => new Date(a.sm2?.nextReview ?? a.nextReview) - new Date(b.sm2?.nextReview ?? b.nextReview));
        selectedWords.push(...shortTerm.slice(0, count - selectedWords.length));
      }

      // 우선순위 4: 중기 기억 (interval 10~60일, nextReview 임박한 것부터)
      if (selectedWords.length < count) {
        const ids = new Set(selectedWords.map(w => w.id));
        const mediumTerm = allWords
          .filter(w => {
            const interval = w.sm2?.interval ?? w.interval ?? 0;
            return interval >= 10 && interval < 60 && !ids.has(w.id);
          })
          .sort((a, b) => new Date(a.sm2?.nextReview ?? a.nextReview) - new Date(b.sm2?.nextReview ?? b.nextReview));
        selectedWords.push(...mediumTerm.slice(0, count - selectedWords.length));
      }

      // 우선순위 5: 미학습 (한 번도 학습 안 한 단어 - 랜덤)
      if (selectedWords.length < count) {
        const ids = new Set(selectedWords.map(w => w.id));
        selectedWords.push(
          ...shuffleArray(unlearnedWords.filter(w => !ids.has(w.id))).slice(0, count - selectedWords.length)
        );
      }

      // 우선순위 6: 장기 기억 (interval 60일↑, nextReview 임박한 것부터)
      if (selectedWords.length < count) {
        const ids = new Set(selectedWords.map(w => w.id));
        const longTerm = allWords
          .filter(w => {
            const interval = w.sm2?.interval ?? w.interval ?? 0;
            return interval >= 60 && !ids.has(w.id);
          })
          .sort((a, b) => new Date(a.sm2?.nextReview ?? a.nextReview) - new Date(b.sm2?.nextReview ?? b.nextReview));
        selectedWords.push(...longTerm.slice(0, count - selectedWords.length));
      }

      selectedWords = shuffleArray(selectedWords).slice(0, count);
    }
    // 일반 학습 (test) 또는 테스트 (exam): 선택한 암기 상태의 단어 중 복습 우선 + 나머지 랜덤
    else if (testType === 'test' || testType === 'exam') {
      // 1. 먼저 사용자가 선택한 필터(상태)에 맞는 단어들을 거름
      const targetStates = Array.isArray(targetMemoryState) ? targetMemoryState : [targetMemoryState];
      const filteredByState = targetStates.includes(MEMORY_STATES.ALL)
        ? allWords
        : allWords.filter(word =>
            targetStates.some(state => {
              if (state === MEMORY_STATES.OVERDUE) return isWordOverdue(word);
              return !isWordOverdue(word) && getWordMemoryState(word) === state;
            })
          );

      // 2. 필터링된 단어들 중에서 '복습 지연' 및 '오늘 예정' 단어 추출
      const overdueInFilter = filteredByState.filter(word => {
        if (!word.nextReview) return false;
        const nextReviewDate = new Date(word.nextReview);
        nextReviewDate.setHours(0, 0, 0, 0);
        return nextReviewDate < now;
      }).sort((a, b) => new Date(a.nextReview) - new Date(b.nextReview));

      const todayScheduledInFilter = filteredByState.filter(word => {
        if (!word.nextReview) return false;
        const nextReviewDate = new Date(word.nextReview);
        nextReviewDate.setHours(0, 0, 0, 0);
        return nextReviewDate.getTime() === now.getTime();
      });

      // 3. 우선순위 적용하여 단어 채우기
      // 우선순위 1: 복습 지연
      selectedWords.push(...overdueInFilter.slice(0, count));

      // 우선순위 2: 오늘 학습 예정 (부족한 경우)
      if (selectedWords.length < count) {
        const remainingCount = count - selectedWords.length;
        const selectedWordIds = new Set(selectedWords.map(w => w.id));
        const availableToday = todayScheduledInFilter.filter(w => !selectedWordIds.has(w.id));
        selectedWords.push(...availableToday.slice(0, remainingCount));
      }

      // 우선순위 3: 나머지 단어들 중 랜덤 (부족한 경우)
      if (selectedWords.length < count) {
        const remainingCount = count - selectedWords.length;
        const selectedWordIds = new Set(selectedWords.map(w => w.id));
        const remainingAvailableWords = filteredByState.filter(w => !selectedWordIds.has(w.id));

        // 나머지 단어들을 랜덤하게 섞어서 채움
        const randomRemaining = shuffleArray(remainingAvailableWords).slice(0, remainingCount);
        selectedWords.push(...randomRemaining);
      }

      // 4. 최종 결과 섞기
      selectedWords = shuffleArray(selectedWords);
    }

    // questionType은 배열 (다중 선택 가능)
    const questionTypesArr = Array.isArray(state.data.questionType)
      ? state.data.questionType
      : [state.data.questionType];

    // 단어에 vocabularySheetId 보장
    const wordsWithSheetId = selectedWords.map(word => ({
      ...word,
      vocabularySheetId: vocabularySheetId !== "all" ? vocabularySheetId : word.vocabularySheetId,
    }));

    // multipleChoice 계열 단일 문제 생성 헬퍼
    const createMultipleChoiceQuestion = (word, questionType = 'multipleChoice') => {
      const otherWords = allWords.filter(w => w.id !== word.id);
      const randomOptions = otherWords.sort(() => Math.random() - 0.5).slice(0, 3);
      const options = [word, ...randomOptions].sort(() => Math.random() - 0.5);
      const resultIndex = options.findIndex(w => w.id === word.id);
      return {
        ...word,
        options,
        resultIndex,
        questionType,
        isCorrect: null,
      };
    };

    // 단일 타입
    if (questionTypesArr.length === 1) {
      const plugin = getQuestionType(questionTypesArr[0]);
      if (plugin?.setupQuestions) {
        return plugin.setupQuestions(wordsWithSheetId, allWords);
      }
      return wordsWithSheetId.map(word => createMultipleChoiceQuestion(word, questionTypesArr[0]));
    }

    // 다중 타입: 슬라이드마다 랜덤으로 타입을 배치
    const shuffledWords = shuffleArray([...wordsWithSheetId]);
    const allQuestions = [];
    let wordIdx = 0;

    while (wordIdx < shuffledWords.length) {
      // 슬라이드마다 랜덤 타입 선택
      const randomType = questionTypesArr[Math.floor(Math.random() * questionTypesArr.length)];
      const plugin = getQuestionType(randomType);

      if (plugin?.setupQuestions) {
        const remaining = shuffledWords.length - wordIdx;
        if (remaining >= 2) {
          // 최대 4개, 최소 2개 — 나머지는 setupQuestions 내부에서 유동 분배
          const chunkSize = Math.min(4, remaining);
          const chunk = shuffledWords.slice(wordIdx, wordIdx + chunkSize);
          const generated = plugin.setupQuestions(chunk, allWords);
          if (generated.length > 0) {
            allQuestions.push(...generated);
            wordIdx += chunkSize;
          } else {
            // 플러그인이 0개 반환 (예: fillInTheBlank 예문 없음) → 1개씩 multipleChoice fallback
            allQuestions.push(createMultipleChoiceQuestion(shuffledWords[wordIdx], 'multipleChoice'));
            wordIdx++;
          }
        } else {
          // 1개 남으면 항상 multipleChoice fallback (cardMatch/fillInTheBlank 등은 words가 없어 crash)
          allQuestions.push(createMultipleChoiceQuestion(shuffledWords[wordIdx], 'multipleChoice'));
          wordIdx++;
        }
      } else {
        allQuestions.push(createMultipleChoiceQuestion(shuffledWords[wordIdx], randomType));
        wordIdx++;
      }
    }
    return allQuestions;
  };

  useEffect(() => {
    const initializeTest = async () => {
      if (isRecentStudyLoading || isVocabularySheetsLoading) return;
      if (recentStudy && recentStudy[state.testType] && recentStudy[state.testType].status === "end") {
        setIsTestQuestionsSetting(false);
        return;
      }
      if (recentStudy && recentStudy[state.testType] && recentStudy[state.testType].status === "learning" && recentStudy[state.testType].study_data?.length > 0) {
        const studyData = recentStudy[state.testType].study_data;
        // cardMatch/cardMatchListening 질문에 words 배열이 없으면 잘못된 캐시 → 재생성
        const isCacheValid = studyData.every(q =>
          !['cardMatch', 'cardMatchListening'].includes(q.questionType) || Array.isArray(q.words)
        );
        if (isCacheValid) {
          setTestQuestions(studyData);
          setProgressIndex(recentStudy[state.testType].progress_index);
          setIsTestQuestionsSetting(false);
          return;
        }
        // 잘못된 캐시 → else 블록으로 fall-through해서 재생성
      }
      {
        // 학습 기록이 없거나 잘못된 캐시이면 새로운 학습 데이터 생성 후 학습 시작
        console.log("state", state.data.memoryState);

        // SM-2 알고리즘 기준으로 학습 데이터 세팅
        const tempTestQuestions = setupTestQuestions(
          state.data.memoryState,
          state.data.vocabularySheetId,
          state.data.count,
          state.testType
        );

        await updateRecentStudy(state.testType, {
          ...recentStudy[state.testType],
          progress_index: 0,
          status: "learning",
          type: state.testType,
          study_data: tempTestQuestions,
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        });
        setTestQuestions(tempTestQuestions);
        setIsTestQuestionsSetting(false);
      }
    };

    initializeTest();
  }, [isRecentStudyLoading, isVocabularySheetsLoading]);

  // 학습 종료 확인 및 네비게이션 함수
  const handleStopLearning = async () => {
    // 1. 이미 바텀시트가 열려있는지 확인 (중복 실행 방지)
    if (window.newBottomSheetContext && window.newBottomSheetContext.stack.length > 0) {
      window.newBottomSheetContext.popNewBottomSheet();
      return;
    }

    // 2. 학습 종료 확인 바텀시트 표시
    const ConfirmResult = await pushAwaitNewBottomSheet(
      ConfirmNewBottomSheet,
      {
        title: (
          <>
            학습할 단어가 남아있어요.<br />
            학습을 종료하시겠습니까?😢
          </>
        ),
        btns: {
          confirm: "종료",
          cancel: "취소",
        }
      },
      {
        isBackdropClickClosable: true,
        isDragToCloseEnabled: true
      }
    );

    // 3. 결과 처리
    if (ConfirmResult) {
      if (AppHistory.canGoBack()) {
        navigate(-1);
      } else {
        navigate('/home');
      }
    }
  };

  // 앱 종료 감지 (학습 중에만)
  useEffect(() => {
    let hasPageHideHandled = false;

    const handlePageHide = async () => {
      if (hasPageHideHandled) return;
      hasPageHideHandled = true;
      console.log('학습 중 페이지 숨김 감지');
      await updateVocabularySheetAndRecentStudyData();
      hasPageHideHandled = false;
    };

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'hidden') {
        if (hasPageHideHandled) return;
        hasPageHideHandled = true;
        console.log('학습 중 앱 백그라운드 전환 감지');
        await updateVocabularySheetAndRecentStudyData();
        hasPageHideHandled = false;
      }
    };

    const handleBeforeUnload = async (event) => {
      if (hasPageHideHandled) return;
      hasPageHideHandled = true;
      console.log('학습 중 앱 종료 감지');
      await updateVocabularySheetAndRecentStudyData();
      hasPageHideHandled = false;
    };


    // 뒤로가기 핸들러 재정의
    const originalOnBackPressed = window.onBackPressed;
    window.onBackPressed = handleStopLearning;

    // 이벤트 리스너 등록
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    // 컴포넌트 언마운트 시 정리
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);

      // 원래 뒤로가기 핸들러 복구
      window.onBackPressed = originalOnBackPressed;
    };
  }, []);

  // 
  useEffect(() => {
    const handleUpdateAndNavigate = async () => {
      if (recentStudy && recentStudy[state.testType] && recentStudy[state.testType].status === "end") {
        await updateVocabularySheetAndRecentStudyData();
        navigate("/take-test/result", { state: { testQuestions: testQuestions, testType: state.testType } });
      }
    };
    handleUpdateAndNavigate();
    // eslint-disable-next-line
  }, [recentStudy]);

  // React Compiler가 자동으로 useCallback 처리
  const updateVocabularySheetAndRecentStudyData = async () => {
    try {
      // 1. 단어장 메타데이터 업데이트 (기존 로직)
      if (pendingUpdateSheetIds.size > 0) {
        const sheetIds = Array.from(pendingUpdateSheetIds);
        pendingUpdateSheetIds.clear(); // Clear immediately to prevent double updates
        await Promise.all(sheetIds.map(async sheetId => {
          await updateVocabularySheetServer(sheetId);
        }));
      }

      // 2. [NEW] 개별 단어 업데이트 (암기 상태 저장)
      if (pendingUpdateWords.size > 0) {
        console.log(`Sending updates for ${pendingUpdateWords.size} words...`);
        const wordsToUpdate = Array.from(pendingUpdateWords.values());
        pendingUpdateWords.clear(); // Clear immediately

        await Promise.all(wordsToUpdate.map(async ({ sheetId, wordId, updateData }) => {
          try {
            await updateWord(sheetId, wordId, { sm2: updateData.sm2 });
          } catch (error) {
            console.error(`Failed to update word ${wordId}:`, error);
          }
        }));
      }

      // 3. 학습 기록(RecentStudy) 업데이트
      await updateRecentStudyServer(state.testType);

      // 4. 최신 단어장 데이터 다시 가져오기
      await fetchVocabularySheets();

    } catch (error) {
      console.error('Error updating study data:', error);
    }
  };

  if (isTestQuestionsSetting) {
    return (
      <div>
        <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
        <MakeStudyData />
      </div>
    );
  } else {
    if (recentStudy[state.testType].status === "end") {
      // 학습 종료 후 학습 결과 저장 중 ... 처리
      return (
        <div>
          <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
          <SaveStudyData />
        </div>
      );
    }

    return (
      <div>
        <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
        <Header
          testType={state?.testType ? state.testType : recentStudy[state.testType]?.type}
          onBackClick={handleStopLearning}
        />
        <Main
          testQuestions={testQuestions}
          setTestQuestions={setTestQuestions}
          progressIndex={progressIndex}
          setProgressIndex={setProgressIndex}
          setPendingUpdateSheetIds={setPendingUpdateSheetIds}
          setPendingUpdateWords={setPendingUpdateWords}
          testType={state?.testType ? state.testType : recentStudy[state.testType]?.type}
        />
      </div>
    );
  }

};

export default TakeTest; 