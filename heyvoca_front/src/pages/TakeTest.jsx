import React, { useEffect, useState } from 'react';
import Main from '../components/takeTest/Main';
import Header from '../components/takeTest/Header';
import { useLocation } from 'react-router-dom';
import { useVocabulary } from '../context/VocabularyContext';
const TakeTest = () => {
  const { state } = useLocation();
  const { vocabularySheets } = useVocabulary();
  const [testQuestions, setTestQuestions] = useState([]);
  const [isTestQuestionsSetting, setIsTestQuestionsSetting] = useState(true);
  const [progressIndex, setProgressIndex] = useState(0);
  useEffect(() => {
    if(vocabularySheets){
      let testQuestions = [];
      if(state.data.vocabularySheetId){
        const vocabularySheet = vocabularySheets.find(vocabularySheet => vocabularySheet.id === state.data.vocabularySheetId);
        if(vocabularySheet){
          const otherWords = vocabularySheets.flatMap(sheet => sheet.words);
          testQuestions = vocabularySheet.words
            .sort(() => Math.random() - 0.5)
            .slice(0, state.data.count)
            .map(word => {
              const availableWords = otherWords.filter(w => w.id !== word.id);
              const randomOptions = availableWords
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
                vocabularySheetId: vocabularySheet.id,
                isCorrect: null,
              };
            });
        }
      }else{
        
        testQuestions = vocabularySheets.flatMap(vocabularySheet => 
          vocabularySheet.words.map(word => ({
            ...word,
            vocabularySheetId: vocabularySheet.id
          }))
        )
          .sort(() => Math.random() - 0.5)
          .slice(0, state.data.count)
          .map(word => {
            console.log("word", word);
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
      setTestQuestions(testQuestions);
      setIsTestQuestionsSetting(false);
    }
  }, []);

  if(isTestQuestionsSetting){
    return (
      <div>
        학습 데이터 세팅 중
      </div>
    );
  }

  return (
    <div>
      <Header />
      <Main testQuestions={testQuestions} progressIndex={progressIndex} setProgressIndex={setProgressIndex} />
    </div>
  );
};

export default TakeTest; 