import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { backendUrl, setCookie, getCookie } from '../utils/common';
import { getDevicePlatform } from '../utils/osFunction';
import { loginApi, updateUserInfoApi, getUserInfoApi } from '../api/auth';
import { setUserCheckinApi, getUserDatesApi, getUserGoalsApi, updateUserStudyHistoryApi } from '../api/study';


const UserContext = createContext(null);
export const UserProvider = ({ children }) => {
  const [userProfile, setUserProfile] = useState({});
  const [userMainPage, setUserMainPage] = useState({});
  const [isUserProfileLoading, setIsUserProfileLoading] = useState(true);
  const [isLogin, setIsLogin] = useState(false);
  const [isLoginChecked, setIsLoginChecked] = useState(false);  
  const [auth, setAuth] = useState({
    user: null,
  });

  // 로그인 상태 관리
  const fetchUserMainPage = useCallback(async () => {
    try {
      let userMainPageData = {};
      const setUserDates = async () => {
        const result = await getUserDatesApi()
        if(result.code == 200){
          userMainPageData.dates = result.data;
        }
      }
      const setUserGoals = async () => {
        const result = await getUserGoalsApi()
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

      const result = await getUserInfoApi();
      if(result.code != 200) {
        console.log('유저 정보를 불러오는데 실패했습니다.');
        return {
          success: false,
          userProfile: null,
        }
      }
      setUserProfile(result.data);
      return {
        success: true,
        userProfile: result.data,
      }
    } catch (err) {
      return {
        success: false,
        userProfile: null,
      }
    } finally {
      setIsUserProfileLoading(false);
    }
  }, []);

  const getUserProfile = useCallback(() => {
    return userProfile;
  }, [userProfile, isUserProfileLoading]);

  const updateUserProfile = useCallback(async ({username, level_id}) => {
    const result = await updateUserInfoApi({username, level_id});
    if(result.code != 200) return;
    setUserProfile(prevProfile => ({
      ...prevProfile,
      level_id: level_id,
      username: username,
    }));
  }, [userProfile]);


  // 업적, 보석, ... 업데이트 함수
  const updateUserHistory = useCallback(async ({today_study_complete, correct_cnt, incorrect_cnt}) => {
    try {
      const result = await updateUserStudyHistoryApi({today_study_complete, correct_cnt, incorrect_cnt});
      if(result.code != 200) return;
      // 보석 업데이트 내용 적용
      setUserProfile(prevProfile => ({
        ...prevProfile,
        gem_cnt: result.data.gem.after,
      }))
      if(result.code != 200) return result.data;
    } catch (err) {
      console.log("오류 발생함")
    }
  }, []); 


  // 출석 체크
  const fetchUserCheckin = useCallback(async () => {
    const result = await setUserCheckinApi();
    if(result.code != 200) return;
    setUserProfile(prevProfile => ({
      ...prevProfile,
      gem_cnt: result.data.gem.after,
    }))
  }, []); 

  // 로그인 처리 함수 (매개변수로 받은 정보로 로그인 처리)
  const Login = useCallback(async ({ googleId, email, name, status }) => {
    try {
      console.log("Login 함수 내부 시작됨");
      
      // 매개변수 검증
      if (!googleId) {
        console.log('googleId가 없습니다.');
        return { success: false };
      }

      if (!email) {
        console.log('email이 없습니다.');
        return { success: false };
      }

      if (!name) {
        console.log('name이 없습니다.');
        return { success: false };
      }

      // 필수값 검증
      if (Number(status) !== 200) {
        console.log('status가 200이 아닙니다.');
        return { success: false };
      }

      const result = await loginApi({googleId, email, name});
      const accessToken = result.access_token;
      setCookie('userAccessToken', accessToken);
      
      setAuth({
        user: {
          name,
          email,
        }
      });
      setIsLogin(true);
      setIsLoginChecked(true);
      
      // 서버에서 실제 사용자 프로필 정보 가져오기

      const userProfileResult = await fetchUserProfile();
      if(userProfileResult.success){
        setUserProfile(userProfileResult.userProfile);
      }
      return { success: true, accessToken };
    } catch (error) {
      console.error('로그인 오류:', error);
      console.log('로그인 중 오류가 발생하였습니다.');
      return { success: false };
    }
  }, []);

  // 구글 로그인 클릭 처리 (웹/앱 자동 구분)
  const clickGoogleOauth = useCallback(() => {
    const device_type = getDevicePlatform();
    if (device_type === 'web') {
      window.location.href = `${backendUrl}/auth/google/oauth/web?device_type=${device_type}`;
    } else {
      window.ReactNativeWebView.postMessage('launchGoogleAuth');
    }
  }, []);

  // 로그인 상태 확인 함수 (전역 상태 업데이트)
  const checkLoginStatus = useCallback(async () => {
    const accessToken = getCookie('userAccessToken');
    if (accessToken) {
      // 서버에서 토큰 유효성 확인 + user 정보 가져오기
      const userProfileResult = await fetchUserProfile(); 
      if(userProfileResult.success){
        const userProfile = getUserProfile();
        // 로그인 상태 업데이트
        setIsLogin(true);
        setIsLoginChecked(true);
        setAuth({ user: { name: userProfile?.name, email: userProfile?.email } });
        return { isLoggedIn: true, userProfile };
      }else{
        // 토큰이 유효하지 않으면 로그아웃 처리
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
        await checkLoginStatus();
      }
    };
    
    initializeAuth();
  }, [isLoginChecked]);

  // 로그인 상태에 따른 데이터 로드
  useEffect(() => {
    if (isLogin && isLoginChecked) {
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
    }
  }, [isLogin, isLoginChecked]); // 함수 의존성 제거


  const value = {
    userProfile,
    userMainPage,
    isUserProfileLoading,
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