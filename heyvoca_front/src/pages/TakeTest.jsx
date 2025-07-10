import React, { useEffect, useState } from 'react';
import Main from '../components/takeTest/Main';
import Header from '../components/takeTest/Header';
import { useLocation, useNavigate } from 'react-router-dom';
import { useVocabulary } from '../context/VocabularyContext';
import StudyResult from '../components/takeTest/StudyResult';
const TakeTest = () => {
  const { state } = useLocation();
  const { isRecentStudyLoading, isVocabularySheetsLoading, vocabularySheets, recentStudy, updateRecentStudy, updateVocabularySheetServer, updateRecentStudyServer, updateRecentStudyState } = useVocabulary();
  const [testQuestions, setTestQuestions] = useState([]);
  const [isTestQuestionsSetting, setIsTestQuestionsSetting] = useState(true);
  const [progressIndex, setProgressIndex] = useState(0);
  const navigate = useNavigate();
  // 업데이트해야 할 단어장 아이디를 저장할 Set (중복 방지)
  const [pendingUpdateSheetIds, setPendingUpdateSheetIds] = useState(new Set());

  useEffect(() => {
    const initializeTest = async () => {
      if(isRecentStudyLoading || isVocabularySheetsLoading) return;
      if(recentStudy.status === "end"){
        setIsTestQuestionsSetting(false);

        return;
      }
      if(recentStudy.status === "learning") {
        // 학습 중 이면 기존 학습 기록 그대로 적용해서 학습 시작
        setTestQuestions(recentStudy.study_data);
        setProgressIndex(recentStudy.progress_index);
        setIsTestQuestionsSetting(false);
      }else{
        // 학습 기록이 없으면 새로운 학습 데이터 생성 후 학습 시작
        let tempTestQuestions = [];
        if(state.data.vocabularySheetId){
          const vocabularySheet = vocabularySheets.find(vocabularySheet => vocabularySheet.id === state.data.vocabularySheetId);
          if(vocabularySheet){
            const otherWords = vocabularySheets.flatMap(sheet => sheet.words);
            tempTestQuestions = vocabularySheet.words
              .sort(() => Math.random() - 0.5)
              .slice(0, state.data.count)
              .map(word => {
                const otherWords = vocabularySheets.flatMap(sheet => sheet.words).filter(w => w.id !== word.id);
                const randomOptions = otherWords
                  .sort(() => Math.random() - 0.5)
                  .slice(0, 3);
                const options = [word, ...randomOptions];
                const shuffledOptions = options.sort(() => Math.random() - 0.5);
                const resultIndex = shuffledOptions.findIndex(w => w.id === word.id);
                return {
                  ...word,
                  // initialViewType: state.data.initialViewType,
                  options: shuffledOptions,
                  resultIndex,
                  questionType: state.data.questionType,
                  vocabularySheetId: word.vocabularySheetId,
                  isCorrect: null,
                };
              });
          }
        }else{
          tempTestQuestions = vocabularySheets.flatMap(vocabularySheet => 
            vocabularySheet.words.map(word => ({
              ...word,
              vocabularySheetId: vocabularySheet.id
            }))
          )
            .sort(() => Math.random() - 0.5)
            .slice(0, state.data.count)
            .map(word => {
              const otherWords = vocabularySheets.flatMap(sheet => sheet.words).filter(w => w.id !== word.id);
              const randomOptions = otherWords
                .sort(() => Math.random() - 0.5)
                .slice(0, 3);
              const options = [word, ...randomOptions];
              const shuffledOptions = options.sort(() => Math.random() - 0.5);
              const resultIndex = shuffledOptions.findIndex(w => w.id === word.id);
              return {
                ...word,
                // initialViewType: state.data.initialViewType,
                options: shuffledOptions,
                resultIndex,
                questionType: state.data.questionType,
                vocabularySheetId: word.vocabularySheetId,
                isCorrect: null,
              };
            });
        }
        await updateRecentStudy({
          ...recentStudy,
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
      if(recentStudy.status === "end"){
        await updateVocabularySheetAndRecentStudyData();
        navigate("/take-test/result" , {state: {testQuestions: testQuestions}});
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
      await updateRecentStudyServer();
    }
  };

  if(isTestQuestionsSetting){
    return (
      <div>
        학습 데이터 세팅 중
      </div>
    );
  }else{
    if(recentStudy.status === "end"){
      // 학습 종료 후 학습 결과 저장 중 ... 처리
      return (
        <div>
          학습 결과 저장 중...
        </div>
      );
    }
  
    return (
      <div>
        <Header />
        <Main testQuestions={testQuestions} setTestQuestions={setTestQuestions} progressIndex={progressIndex} setProgressIndex={setProgressIndex} setPendingUpdateSheetIds={setPendingUpdateSheetIds} />
      </div>
    );
  }

};

export default TakeTest; 