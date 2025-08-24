import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { backendUrl, fetchDataAsync } from '../utils/common';

const UserContext = createContext(null);
export const UserProvider = ({ children }) => {
  const [userProfile, setUserProfile] = useState({});
  const [userMainPage, setUserMainPage] = useState({});
  const [isUserProfileLoading, setIsUserProfileLoading] = useState(true);
  const [errorUserProfile, setErrorUserProfile] = useState(null);
  const [userStorageData, setUserStorageData] = useState(JSON.parse(localStorage.getItem('user')));
  
  const fetchUserMainPage = useCallback(async () => {
    try {
      let userMainPageData = {};
      const setUserDates = async () => {
        const url = `${backendUrl}/mainpage/user_dates`;
        const method = 'GET';
        const fetchData = {};
        const result = await fetchDataAsync(url, method, fetchData, false, userStorageData?.accessToken);
        if(result.code == 200){
          userMainPageData.dates = result.data;
        }
      }
      const setUserGoals = async () => {
        const url = `${backendUrl}/mainpage/user_goals`;
        const method = 'GET';
        const fetchData = {};
        const result = await fetchDataAsync(url, method, fetchData, false, userStorageData?.accessToken);
        if(result.code == 200){
          userMainPageData.goals = result.data;
        }
      }
      await setUserDates()
      await setUserGoals()
      setUserMainPage(userMainPageData);
    } catch (err) {
    }
  }, [userStorageData?.accessToken]);
  const fetchUserProfile = useCallback(async () => {
    try {
      setIsUserProfileLoading(true);
      const url = `${backendUrl}/login/get_user_info`;
      const method = 'GET';
      const fetchData = {};
      const result = await fetchDataAsync(url, method, fetchData, false, userStorageData?.accessToken);
      if(result.code != 200) return alert('유저 정보를 불러오는데 실패했습니다.');
      // book_cnt: 3
      // code: null
      // gem_cnt: 0
      // id: "132902cb-33ba-45ce-9339-811e33e01662"
      // level_id: null
      // set_goal_cnt: 3
      // username: null
      setUserProfile(result.data);
      setErrorUserProfile(null);
    } catch (err) {
      console.log("오류 발생함")
      alert('유저 정보를 불러오는데 실패했습니다.');
      setErrorUserProfile('유저 정보를 불러오는데 실패했습니다.');
      console.error('Failed to fetch user profile:', err);
    } finally {
      setIsUserProfileLoading(false);
    }
  }, [userStorageData?.accessToken]);

  const getUserProfile = useCallback(() => {
    console.log('userProfile', userProfile);
    return userProfile;
  }, [userProfile, isUserProfileLoading]);

  const updateUserProfile = useCallback(async (updates) => {
    try {
      const url = `${backendUrl}/login/update_user_info`;
      const method = 'PATCH';
      const result = await fetchDataAsync(url, method, updates, false, userStorageData?.accessToken);
      if(result.code != 200) return alert('유저 정보를 불러오는데 실패했습니다.');
      setUserProfile({
        ...userProfile,
        level_id: updates.level_id,
        username: updates.username,
      });
      setErrorUserProfile(null);
    } catch (err) {
      console.log("오류 발생함")
      setErrorUserProfile('유저 정보를 불러오는데 실패했습니다.');
      console.error('Failed to fetch user profile:', err);
    }
  }, [userProfile, userStorageData?.accessToken]);


  // 업적, 보석, ... 업데이트 함수
  const updateUserHistory = useCallback(async ({today_study_complete, correct_cnt, incorrect_cnt}) => {
    try {
      const url = `${backendUrl}/mainpage/user_study_history`;
      const method = 'POST';
      const fetchData = {
        'today_study_complete': today_study_complete,
        'correct_cnt': correct_cnt,
        'incorrect_cnt': incorrect_cnt
    }
      const result = await fetchDataAsync(url, method, fetchData, false, userStorageData?.accessToken);
      // 보석 업데이트 내용 적용
      setUserProfile({
        ...userProfile,
        gem_cnt: result.data.gem.after,
      })
      // 업적 업데이트 내용 적용

      // 오늘의 학습이고 최초 학습이면 오늘의 학습 기록 업데이트


    //   {
    //     'exp': {
    //         'before' : 1,
    //         'after' : 3,
    //     },
    //     'gem': {
    //         'before': 2,
    //         'after': 4
    //     },
    //     'today_study_complete': today_study_complete,
    //     'goals': goals
    //   }

      if(result.code != 200) return result.data;
    } catch (err) {
      console.log("오류 발생함")
    }
  }, []);


  // 출석 체크
  const fetchUserCheckin = useCallback(async () => {
    try {
      const url = `${backendUrl}/mainpage/checkin`;
      const method = 'GET';
      const fetchData = {};
      const result = await fetchDataAsync(url, method, fetchData, false, userStorageData?.accessToken);
    //   {
    //     'gem': {
    //         'before': 1,
    //         'after': 2
    //     },
    //     'goals': goals
    // }
      if(result.code === 200){
        setUserProfile({
          ...userProfile,
          gem_cnt: result.data.gem.after,
        })
      }
    } catch (err) {
      console.log("오류 발생함")
    }
  }, []);


  // 앱 시작시 데이터 로드
  useEffect(() => {
    // 로그인 상태일 때만 API 호출
    if (userStorageData?.status === 'login' && userStorageData?.accessToken) {
      console.log('🔐 [USER] 로그인 상태 확인됨, API 호출 시작');
      fetchUserCheckin();
      fetchUserProfile();
      fetchUserMainPage();
    } else {
      console.log('🔓 [USER] 로그인되지 않은 상태, API 호출 건너뜀');
    }
  }, [userStorageData?.status, userStorageData?.accessToken]);


  const value = {
    userStorageData,
    userProfile,
    userMainPage,
    isUserProfileLoading,
    errorUserProfile,
    getUserProfile,
    updateUserProfile,
    fetchUserProfile,
    fetchUserMainPage,
    setUserProfile,
    setUserMainPage,
    setUserStorageData,
    updateUserHistory,
  };  

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}; 