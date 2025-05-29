import React, { useRef, useState, useEffect } from 'react';
import { backendUrl, fetchDataAsync } from '../../utils/common';
import { useUser } from '../../context/UserContext';
import Step1 from './step1';
import Step2 from './step2';
import Step3 from './step3';
import Step4 from './step4';
import Step5 from './step5';

const Main = () => {
  const { getUserProfile } = useUser();
  const [step, setStep] = useState(1);
  const [userProfile, setUserProfile] = useState({
    name: null,
    level: null,
    vocabook: null,
  });

  const saveUserProfile = async () => {
    console.log(userProfile);
    // 이름, 레벨 저장

    // 단어장 추가

    // const url = `${backendUrl}/login/save_user_profile`;
    // const method = 'POST';
    // const fetchData = {userProfile};
    // const result = await fetchDataAsync(url, method, fetchData);

    
  }

  return (
    <>
      {step === 1 && <Step1 setStep={setStep} setUserProfile={setUserProfile} />}
      {step === 2 && <Step2 setStep={setStep} userProfile={userProfile} setUserProfile={setUserProfile} />}
      {step === 3 && <Step3 setStep={setStep} userProfile={userProfile} setUserProfile={setUserProfile} />}
      {step === 4 && <Step4 setStep={setStep} userProfile={userProfile} setUserProfile={setUserProfile} />}
      {step === 5 && <Step5 saveUserProfile={saveUserProfile} />}
    </>
  );
};

export default Main;
