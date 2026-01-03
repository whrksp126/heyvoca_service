import React, { useEffect, useState } from 'react';
import Main from '../components/takeTest/Main';
import Header from '../components/takeTest/Header';
import { useLocation, useNavigate } from 'react-router-dom';
import { useVocabulary } from '../context/VocabularyContext';
import MakeStudyData from '../components/takeTest/MakeStudyData';
import SaveStudyData from '../components/takeTest/SaveStudyData';
import { MEMORY_STATES, getWordMemoryState } from '../utils/common';

const TakeTest = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { state } = useLocation();
  const { isRecentStudyLoading, isVocabularySheetsLoading, vocabularySheets, recentStudy, updateRecentStudy, updateVocabularySheetServer, updateRecentStudyServer, updateRecentStudyState, fetchVocabularySheets } = useVocabulary();
  const [testQuestions, setTestQuestions] = useState([]);
  const [isTestQuestionsSetting, setIsTestQuestionsSetting] = useState(true);
  const [progressIndex, setProgressIndex] = useState(0);
  const navigate = useNavigate();
  // 업데이트해야 할 단어장 아이디를 저장할 Set (중복 방지)
  const [pendingUpdateSheetIds, setPendingUpdateSheetIds] = useState(new Set());

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
    
    if (vocabularySheetId !== "all") {
      const vocabularySheet = vocabularySheets.find(sheet => sheet.id === vocabularySheetId);
      if (vocabularySheet) {
        allWords = vocabularySheet.words;
      }
    } else {
      // 전체 단어장 선택 시 vocabularySheetId를 각 단어에 추가
      allWords = vocabularySheets.flatMap(sheet => 
        sheet.words.map(word => ({
          ...word,
          vocabularySheetId: sheet.id
        }))
      );
    }

    // 현재 날짜 (시간 제거, 날짜만 비교)
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    // 1. 미학습 단어들 (nextReview가 null이거나 없음, 또는 repetition === 0 && interval === 0)
    const unlearnedWords = allWords.filter(word => {
      const repetition = word.memoryState?.repetition ?? word.repetition ?? 0;
      const interval = word.memoryState?.interval ?? word.interval ?? 0;
      return (!word.nextReview || word.nextReview === null) && repetition === 0 && interval === 0;
    });
    
    // 2. 복습 지연 단어들 (nextReview가 오늘 이전인 것들)
    const overdueWords = allWords.filter(word => {
      if (!word.nextReview) return false;
      const nextReviewDate = new Date(word.nextReview);
      nextReviewDate.setHours(0, 0, 0, 0);
      return nextReviewDate < now;
    });

    // 3. 오늘 학습 예정 단어들 (nextReview가 오늘인 것들)
    const todayScheduledWords = allWords.filter(word => {
      if (!word.nextReview) return false;
      const nextReviewDate = new Date(word.nextReview);
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
    // 일반 학습 (test) 또는 테스트 (exam): 선택한 암기 상태의 단어만
    else if (testType === 'test' || testType === 'exam') {
      // 전체를 선택한 경우: 모든 암기 상태의 단어 포함
      if (targetMemoryState === MEMORY_STATES.ALL) {
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
        
        // 우선순위 4: 모든 단어 중 부족한 경우에만 추가
        if (selectedWords.length < count) {
          const remainingCount = count - selectedWords.length;
          const selectedWordIds = new Set(selectedWords.map(w => w.id));
          const availableWords = allWords.filter(w => !selectedWordIds.has(w.id));
          selectedWords.push(...availableWords.slice(0, remainingCount));
        }
        
        // 랜덤하게 섞기
        selectedWords = shuffleArray(selectedWords).slice(0, count);
      } else {
        // 목표 학습 상태에 해당하는 단어들 선택
        const targetStateWords = allWords.filter(word => {
          const memoryState = getWordMemoryState(word);
          // 목표 상태와 일치하는 단어만 선택
          return memoryState === targetMemoryState;
        });

        console.log(`[TakeTest] 목표 암기 상태: ${targetMemoryState}, 찾은 단어 수: ${targetStateWords.length}`);
        console.log('[TakeTest] 전체 단어 수:', allWords.length);
        
        // 디버깅: 첫 번째 단어 정보 출력
        if (targetStateWords.length > 0) {
          const firstWord = targetStateWords[0];
          console.log('[TakeTest] 첫 번째 장기 암기 단어:', {
            word: firstWord.origin,
            repetition: firstWord.repetition,
            interval: firstWord.interval,
            ef: firstWord.ef,
            memoryState: getWordMemoryState(firstWord)
          });
        }

        // 미학습을 선택한 경우: 모든 미학습 단어를 랜덤하게 선택 (복습 지연 우선순위 제거)
        if (targetMemoryState === MEMORY_STATES.UNLEARNED) {
          selectedWords = shuffleArray(targetStateWords).slice(0, count);
        } else {
          // 다른 암기 상태를 선택한 경우: 복습 지연 우선순위 적용
          // 우선순위 1: 복습 지연 단어들 중에서 목표 상태인 것들 (가장 오래된 것부터)
          const overdueTargetStateWords = sortedOverdueWords.filter(word => {
            const memoryState = getWordMemoryState(word);
            return memoryState === targetMemoryState;
          });
          selectedWords.push(...overdueTargetStateWords.slice(0, count));
          
          // 우선순위 2: 목표 상태 단어들 중 복습 지연이 아닌 것들 (부족한 경우에만)
          if (selectedWords.length < count) {
            const remainingCount = count - selectedWords.length;
            const selectedWordIds = new Set(selectedWords.map(w => w.id));
            const availableTargetState = targetStateWords.filter(w => 
              !selectedWordIds.has(w.id) && 
              (!w.nextReview || new Date(w.nextReview) >= now)
            );
            selectedWords.push(...availableTargetState.slice(0, remainingCount));
          }
          
          // 랜덤하게 섞기
          selectedWords = shuffleArray(selectedWords).slice(0, count);
        }
      }
    }
    
    // 문제 생성
    return selectedWords
      .map(word => {
        const otherWords = allWords.filter(w => w.id !== word.id);
        const randomOptions = otherWords
          .sort(() => Math.random() - 0.5)
          .slice(0, 3);
        const options = [word, ...randomOptions];
        const shuffledOptions = options.sort(() => Math.random() - 0.5);
        const resultIndex = shuffledOptions.findIndex(w => w.id === word.id);
        
        return {
          ...word,
          options: shuffledOptions,
          resultIndex,
          questionType: state.data.questionType,
          vocabularySheetId: vocabularySheetId !== "all" ? vocabularySheetId : word.vocabularySheetId,
          isCorrect: null,
        };
      });
  };

  useEffect(() => {
    const initializeTest = async () => {
      if(isRecentStudyLoading || isVocabularySheetsLoading) return;
      if(recentStudy && recentStudy[state.testType] && recentStudy[state.testType].status === "end"){
        setIsTestQuestionsSetting(false);
        return;
      }
      if(recentStudy &&  recentStudy[state.testType] && recentStudy[state.testType].status === "learning") {
        // 학습 중 이면 기존 학습 기록 그대로 적용해서 학습 시작
        setTestQuestions(recentStudy[state.testType].study_data);
        setProgressIndex(recentStudy[state.testType].progress_index);
        setIsTestQuestionsSetting(false);
      }else{
        // 학습 기록이 없으면 새로운 학습 데이터 생성 후 학습 시작
        console.log("state", state.data.memoryState);
        
        // SM-2 알고리즘 기준으로 학습 데이터 세팅
        const tempTestQuestions = setupTestQuestions(
          state.data.memoryState,
          state.data.vocabularySheetId,
          state.data.count,
          state.testType
        );

        await updateRecentStudy(state.testType,{
          ...recentStudy[state.testType],
          progress_index : 0,
          status: "learning",
          type: state.testType,
          study_data: tempTestQuestions,
          updated_at : new Date().toISOString(),
          created_at : new Date().toISOString(),
        });
        setTestQuestions(tempTestQuestions);
        setIsTestQuestionsSetting(false);
      }
    };

    initializeTest();
  }, [isRecentStudyLoading, isVocabularySheetsLoading]);

  // 앱 종료 감지 (학습 중에만)
  useEffect(() => {
    let hasPageHideHandled = false;

    const handlePageHide = async () => {
      if(hasPageHideHandled) return;
      hasPageHideHandled = true;
      console.log('학습 중 페이지 숨김 감지');
      await updateVocabularySheetAndRecentStudyData();
      hasPageHideHandled = false;
    };

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'hidden') {
        if(hasPageHideHandled) return;
        hasPageHideHandled = true;
        console.log('학습 중 앱 백그라운드 전환 감지');
        await updateVocabularySheetAndRecentStudyData();
        hasPageHideHandled = false;
      }
    };

    const handleBeforeUnload = async (event) => {
      if(hasPageHideHandled) return;
      hasPageHideHandled = true;
      console.log('학습 중 앱 종료 감지');
      await updateVocabularySheetAndRecentStudyData();
      hasPageHideHandled = false;
    };

    

    // 이벤트 리스너 등록
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    // 컴포넌트 언마운트 시 정리
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [ ]);

  // 
  useEffect(() => {
    const handleUpdateAndNavigate = async () => {
      if(recentStudy && recentStudy[state.testType] && recentStudy[state.testType].status === "end"){
        await updateVocabularySheetAndRecentStudyData();
        navigate("/take-test/result" , {state: {testQuestions: testQuestions, testType: state.testType}});
      }
    };
    handleUpdateAndNavigate();
    // eslint-disable-next-line
  }, [recentStudy]);

  // React Compiler가 자동으로 useCallback 처리
  const updateVocabularySheetAndRecentStudyData = async () => {
    if(pendingUpdateSheetIds.size > 0){
      // 학습 데이터 업데이트!
      const sheetIds = Array.from(pendingUpdateSheetIds);
      pendingUpdateSheetIds.clear();
      await Promise.all(sheetIds.map(async sheetId => {
        await updateVocabularySheetServer(sheetId);
      }));

      // 학습 기록 업데이트!
      await updateRecentStudyServer(state.testType);
      
      // 최신 단어장 데이터 다시 가져오기
      await fetchVocabularySheets();
    }
  };

  if(isTestQuestionsSetting){
    return (
      <div>
        <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
        <MakeStudyData />
      </div>
    );
  }else{
    if(recentStudy[state.testType].status === "end"){
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
        <Header testType={state?.testType ? state.testType : recentStudy[state.testType]?.type} />
        <Main 
          testQuestions={testQuestions} 
          setTestQuestions={setTestQuestions} 
          progressIndex={progressIndex} 
          setProgressIndex={setProgressIndex} 
          setPendingUpdateSheetIds={setPendingUpdateSheetIds} 
          testType={state?.testType ? state.testType : recentStudy[state.testType]?.type}
        />
      </div>
    );
  }

};

export default TakeTest; 