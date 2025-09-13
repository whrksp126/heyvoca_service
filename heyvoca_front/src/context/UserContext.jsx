import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { backendUrl, fetchDataAsync, getValueFromURL, setCookie, getCookie } from '../utils/common';
import { getDevicePlatform } from '../utils/osFunction';

const UserContext = createContext(null);
export const UserProvider = ({ children }) => {
  const [userProfile, setUserProfile] = useState({});
  const [userMainPage, setUserMainPage] = useState({});
  const [isUserProfileLoading, setIsUserProfileLoading] = useState(true);
  const [errorUserProfile, setErrorUserProfile] = useState(null);
  
  // 인증 상태 (user 정보만 관리, accessToken은 쿠키로 관리)
  const [auth, setAuth] = useState({
    user: null,
  });

  // 로그인 상태 관리
  const [isLogin, setIsLogin] = useState(false);
  const [isLoginChecked, setIsLoginChecked] = useState(false);
  

  const fetchUserMainPage = useCallback(async () => {
    try {
      let userMainPageData = {};
      const setUserDates = async () => {
        const url = `${backendUrl}/mainpage/user_dates`;
        const method = 'GET';
        const fetchData = {};
        const result = await fetchDataAsync(url, method, fetchData);
        if(result.code == 200){
          userMainPageData.dates = result.data;
        }
      }
      const setUserGoals = async () => {
        const url = `${backendUrl}/mainpage/user_goals`;
        const method = 'GET';
        const fetchData = {};
        const result = await fetchDataAsync(url, method, fetchData);
        if(result.code == 200){
          userMainPageData.goals = result.data;
        }
      }
      await setUserDates()
      await setUserGoals()
      setUserMainPage(userMainPageData);
    } catch (err) {
    }
  }, []);
  const fetchUserProfile = useCallback(async () => {
    try {
      setIsUserProfileLoading(true);
      const url = `${backendUrl}/auth/get_user_info`;
      const method = 'GET';
      const fetchData = {};
      const result = await fetchDataAsync(url, method, fetchData);
      if(result.code != 200) return console.log('유저 정보를 불러오는데 실패했습니다.');
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
      console.log('유저 정보를 불러오는데 실패했습니다.');
      setErrorUserProfile('유저 정보를 불러오는데 실패했습니다.');
      console.error('Failed to fetch user profile:', err);
    } finally {
      setIsUserProfileLoading(false);
    }
  }, []);

  const getUserProfile = useCallback(() => {
    return userProfile;
  }, [userProfile, isUserProfileLoading]);

  const updateUserProfile = useCallback(async (updates) => {
    try {
      const url = `${backendUrl}/auth/update_user_info`;
      const method = 'PATCH';
      const result = await fetchDataAsync(url, method, updates);
      if(result.code != 200) return console.log('유저 정보를 불러오는데 실패했습니다.');
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
  }, [userProfile]);


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
      const result = await fetchDataAsync(url, method, fetchData);
      // 보석 업데이트 내용 적용
      setUserProfile(prevProfile => ({
        ...prevProfile,
        gem_cnt: result.data.gem.after,
      }))
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
  }, []); // userProfile 의존성 제거


  // 출석 체크
  const fetchUserCheckin = useCallback(async () => {
    try {
      const url = `${backendUrl}/mainpage/checkin`;
      const method = 'GET';
      const fetchData = {};
      const result = await fetchDataAsync(url, method, fetchData);
    //   {
    //     'gem': {
    //         'before': 1,
    //         'after': 2
    //     },
    //     'goals': goals
    // }
      if(result.code === 200){
        setUserProfile(prevProfile => ({
          ...prevProfile,
          gem_cnt: result.data.gem.after,
        }))
      }
    } catch (err) {
      console.log("오류 발생함")
    }
  }, []); // userProfile 의존성 제거

  // 로그인 처리 함수 (URL 파라미터 파싱 + 검증 + 로그인 처리)
  const Login = useCallback(async () => {
    // URL 파라미터 파싱
    const google_id = getValueFromURL('googleId');
    if (!google_id) return { success: false };

    const email = getValueFromURL('email');
    const name = getValueFromURL('name');
    const type = getValueFromURL('type');
    const status = getValueFromURL('status');
    const id_token = getValueFromURL('id_token');

    // 필수값 검증
    if (Number(status) !== 200) {
      console.log('google_id이 없습니다. (URL 파라미터 googleId 확인)');
      return { success: false };
    }

    try {
      
      const url = `${backendUrl}/auth/login`;
      const fetchData = {
        google_id,
        email,
        name
      };
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // 쿠키 포함 필수!
        body: JSON.stringify(fetchData),
      });
      
      if (!response.ok) {
        console.log('로그인 중 오류가 발생하였습니다.');
        return { success: false };
      }
      
      const data = await response.json();
      const accessToken = data.access_token;
      
      // accessToken을 쿠키에 저장
      setCookie('userAccessToken', accessToken);
      
      // Context에 user 정보 저장
      setAuth({
        user: {
          name,
          email,
        }
      });

      // 로그인 상태 업데이트
      setIsLogin(true);
      setIsLoginChecked(true);
      
      // 앱인 경우 토큰 전송
      if (type === 'app') {
        const message = JSON.stringify({
          type: "loginSuccess",
          data: data
        });
        window.ReactNativeWebView.postMessage(message);
      }
      
      return { success: true, accessToken };
    } catch (error) {
      console.error('로그인 오류:', error);
      console.log('로그인 중 오류가 발생하였습니다.');
      return { success: false };
    }
  }, [setAuth]);

  // 구글 로그인 클릭 처리 (웹/앱 자동 구분)
  const clickGoogleOauth = useCallback(() => {
    const device_type = getDevicePlatform();
    if(device_type == 'web'){
      window.location.href = `${backendUrl}/auth/google/oauth/web?device_type=${device_type}`;
    }else{
      window.ReactNativeWebView.postMessage('launchGoogleAuth');
    }
  }, []);

  // 로그인 상태 확인 함수 (전역 상태 업데이트)
  const checkLoginStatus = useCallback(async () => {
    const accessToken = getCookie('userAccessToken');
    
    if (accessToken) {
      try {
        // 서버에서 토큰 유효성 확인 + user 정보 가져오기
        await fetchUserProfile();
        const userProfile = getUserProfile();
        
        // 로그인 상태 업데이트
        setIsLogin(true);
        setIsLoginChecked(true);
        setAuth({ user: { name: userProfile?.name, email: userProfile?.email } });
        
        return { isLoggedIn: true, userProfile };
      } catch (error) {
        // 토큰이 유효하지 않으면 로그아웃 처리
        console.error('토큰 검증 실패:', error);
        setCookie('userAccessToken', '', -1);
        setAuth({ user: null });
        setIsLogin(false);
        setIsLoginChecked(true);
        
        return { isLoggedIn: false, userProfile: null };
      }
    } else {
      // 토큰이 없으면 로그인되지 않은 상태
      setAuth({ user: null });
      setIsLogin(false);
      setIsLoginChecked(true);
      
      return { isLoggedIn: false, userProfile: null };
    }
  }, [fetchUserProfile, getUserProfile, setAuth]);


  // 앱 시작시 로그인 상태 확인
  useEffect(() => {
    const initializeAuth = async () => {
      if (!isLoginChecked) {
        console.log('🔍 [USER] 로그인 상태 확인 시작');
        await checkLoginStatus();
      }
    };
    
    initializeAuth();
  }, [isLoginChecked, checkLoginStatus]);

  // 로그인 상태에 따른 데이터 로드
  useEffect(() => {
    if (isLogin && isLoginChecked) {
      console.log('🔐 [USER] 로그인 상태 확인됨, 추가 데이터 로드 시작');
      
      const loadAdditionalData = async () => {
        try {
          await Promise.all([
            fetchUserMainPage(),
            fetchUserCheckin()
          ]);
        } catch (error) {
          console.error('❌ [USER] 추가 데이터 로드 중 오류 발생:', error);
        }
      };
      
      loadAdditionalData();
    } else if (!isLogin && isLoginChecked) {
      console.log('🔓 [USER] 로그인되지 않은 상태, API 호출 건너뜀');
    }
  }, [isLogin, isLoginChecked]); // 함수 의존성 제거


  const value = {
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
    updateUserHistory,
    // 인증 상태 추가
    auth,
    setAuth,
    // 로그인 상태 관리
    isLogin,
    isLoginChecked,
    // 로그인 처리 함수들 추가
    Login,
    clickGoogleOauth,
    checkLoginStatus,
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