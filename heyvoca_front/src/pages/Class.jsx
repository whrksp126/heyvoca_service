import React, { useEffect } from 'react';
import BottomNav from '../components/component/BottomNav';
import Header from '../components/class/Header';
import Main from '../components/class/Main';
// import { useVocabulary } from '../context/VocabularyContext';
// import { useLearningInfoBottomSheet } from '../components/class/LearningInfoBottomSheet';

const Class = () => {
  // const { recentStudy, isRecentStudyLoading } = useVocabulary();
  // const { showLearningInfoBottomSheet } = useLearningInfoBottomSheet();
  // useEffect(() => {
  //   if(recentStudy.status ===  "learning") {
  //     showLearningInfoBottomSheet();
  //   }
  // }, [isRecentStudyLoading]);

  return (
    <div>
      <Header />
      <Main />
      <BottomNav />
    </div>
  );
};

export default Class; 