import React, { useEffect } from 'react';
import BottomNav from '../components/component/BottomNav';
import Header from '../components/class/Header';
import Main from '../components/class/Main';
import { useVocabulary } from '../context/VocabularyContext';
import { useContinueLearningBottomSheet } from '../components/class/ContinueLearningBottomSheet';

const Class = () => {
  const { getRecentStudy } = useVocabulary();
  const { showContinueLearningBottomSheet } = useContinueLearningBottomSheet();
  const recentStudy = getRecentStudy();
  useEffect(() => {
    if(recentStudy.status == "learning"){
      showContinueLearningBottomSheet();
    };
  }, []);

  return (
    <div>
      <Header />
      <Main />
      <BottomNav />
    </div>
  );
};

export default Class; 