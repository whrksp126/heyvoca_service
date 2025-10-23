import React, { useEffect, useState } from 'react';
import Main from '../components/takeTest/Main';
import Header from '../components/takeTest/Header';
import { useLocation, useNavigate } from 'react-router-dom';
import { useVocabulary } from '../context/VocabularyContext';
import StudyResult from '../components/takeTest/StudyResult';
import MakeStudyData from '../components/takeTest/MakeStudyData';
import SaveStudyData from '../components/takeTest/SaveStudyData';

// SM-2 알고리즘 기준 학습 상태 정의
const MEMORY_STATES = {
  UNLEARNED: 'unlearned',      // 미학습 (repetition: 0, ef: 2.5)
  SHORT_TERM: 'shortTerm',     // 단기 복습 (repetition: 1-2, interval: 1-6일)
  MEDIUM_TERM: 'mediumTerm',   // 중기 복습 (repetition: 3-4, interval: 7-30일)
  LONG_TERM: 'longTerm'        // 장기 복습 (repetition: 5+, interval: 30일+)
};

const TakeTest = () => {
  const { state } = useLocation();
  const { isRecentStudyLoading, isVocabularySheetsLoading, vocabularySheets, recentStudy, updateRecentStudy, updateVocabularySheetServer, updateRecentStudyServer, updateRecentStudyState } = useVocabulary();
  const [testQuestions, setTestQuestions] = useState([]);
  const [isTestQuestionsSetting, setIsTestQuestionsSetting] = useState(true);
  const [progressIndex, setProgressIndex] = useState(0);
  const navigate = useNavigate();
  // 업데이트해야 할 단어장 아이디를 저장할 Set (중복 방지)
  const [pendingUpdateSheetIds, setPendingUpdateSheetIds] = useState(new Set());

  // SM-2 알고리즘 기준으로 단어의 학습 상태를 판단하는 함수
  const getWordMemoryState = (word) => {
    if (!word.memoryState) return MEMORY_STATES.UNLEARNED;
    
    const { repetition, interval, ef } = word.memoryState;
    
    // 미학습
    if (repetition === 0) return MEMORY_STATES.UNLEARNED;
    
    // 단기 복습 (1-2회 연속 정답, 간격 1-6일)
    if (repetition >= 1 && repetition <= 2 && interval <= 6) return MEMORY_STATES.SHORT_TERM;
    
    // 중기 복습 (3-4회 연속 정답, 간격 7-30일)
    if (repetition >= 3 && repetition <= 4 && interval <= 30) return MEMORY_STATES.MEDIUM_TERM;
    
    // 장기 복습 (5회 이상 연속 정답, 간격 30일 이상)
    if (repetition >= 5) return MEMORY_STATES.LONG_TERM;
    
    return MEMORY_STATES.UNLEARNED;
  };



  // 학습 데이터를 세팅하는 함수
  const setupTestQuestions = (targetMemoryState, vocabularySheetId, count) => {
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

    // 1. nextReview가 있는 단어들만 필터링 (미학습 제외)
    const wordsWithNextReview = allWords.filter(word => 
      word.nextReview !== null
    );
    // 2. 복습 지연 단어들 먼저 필터링 (현재 날짜보다 nextReview가 과거인 것들)
    const now = new Date();
    
    const overdueWords = wordsWithNextReview.filter(word => {
      const nextReviewDate = new Date(word.nextReview);
      const isOverdue = nextReviewDate < now;
      return isOverdue;
    });

    // 3. 복습 지연 단어들을 nextReview 기준으로 정렬 (가장 오래된 것부터)
    const sortedOverdueWords = overdueWords.sort((a, b) => {
      const dateA = new Date(a.nextReview);
      const dateB = new Date(b.nextReview);
      return dateA - dateB; // 오름차순 (가장 오래된 것부터)
    });

    // 4. 목표 학습 상태에 해당하는 단어들 선택
    const targetStateWords = allWords.filter(word => getWordMemoryState(word) === targetMemoryState);

    // 5. 최종 단어 목록 구성
    let selectedWords = [];
    
    // 복습 지연 단어들을 우선적으로 추가 (가장 오래된 것부터)
    selectedWords.push(...sortedOverdueWords.slice(0, count));
    
    // 목표 상태 단어들 추가 (부족한 경우에만)
    if (selectedWords.length < count) {
      const remainingCount = count - selectedWords.length;
      selectedWords.push(...targetStateWords.slice(0, remainingCount));
    }
    
    // 6. 우선순위 순서대로 문제 생성
    return selectedWords
      .slice(0, count)
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
          state.data.count
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

  // 학습 데이터 서버에 업데이트
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
    }
  };

  if(isTestQuestionsSetting){
    return (
      <div>
        <MakeStudyData />
      </div>
    );
  }else{
    if(recentStudy[state.testType].status === "end"){
      // 학습 종료 후 학습 결과 저장 중 ... 처리
      return (
        <div>
          <SaveStudyData />
        </div>
      );
    }
  
    return (
      <div>
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