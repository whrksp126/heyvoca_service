import React, { useEffect } from 'react';
import BottomNav from '../components/component/BottomNav';
import Header from '../components/class/Header';
import Main from '../components/class/Main';
import { useVocabulary } from '../context/VocabularyContext';


const Class = () => {
  const { recentStudy, isRecentStudyLoading } = useVocabulary();

  useEffect(() => {
    if(recentStudy.status ===  "learning") {
      console.log("학습 중");
    }
  }, [recentStudy]);

  return (
    <div>
      <Header />
      <Main />
      <BottomNav />
    </div>
  );
};

export default Class; 