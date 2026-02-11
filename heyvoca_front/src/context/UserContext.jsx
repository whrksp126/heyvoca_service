import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { backendUrl, setCookie, getCookie, fetchDataAsync } from '../utils/common';
import { getDevicePlatform } from '../utils/osFunction';
import { loginApi, updateUserInfoApi, getUserInfoApi, withdrawApi, appleLoginApi, devLoginApi } from '../api/auth';
import { setUserCheckinApi, getUserDatesApi, getUserGoalsApi, updateUserStudyHistoryApi, getAchievementCriteriaApi } from '../api/study';
import AchievementRewardOverlay from '../components/overlay/AchievementRewardOverlay';
import GemRewardOverlay from '../components/overlay/GemRewardOverlay';
import { getGemItemsApi } from '../api/store';
import postMessageManager from '../utils/postMessageManager';

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
  const [gemItems, setGemItems] = useState([]);
  const [isWithdrawInProgress, setIsWithdrawInProgress] = useState(false);
  const [achievementCriteria, setAchievementCriteria] = useState({});
  const [isAchievementCriteriaLoading, setIsAchievementCriteriaLoading] = useState(false);

  // 로그인 상태 관리
  const fetchUserMainPage = useCallback(async () => {
    try {
      let userMainPageData = {};
      const setUserDates = async () => {
        const result = await getUserDatesApi()
        if (result.code == 200) {
          userMainPageData.dates = result.data;
        }
      }
      const setUserGoals = async () => {
        const result = await getUserGoalsApi()
        if (result.code == 200) {
          userMainPageData.goals = result.data;
        }
      }
      await setUserDates()
      await setUserGoals()
      setUserMainPage(userMainPageData);
    } catch (err) {
    }
  }, []);

  const fetchAchievementCriteria = useCallback(async () => {
    try {
      setIsAchievementCriteriaLoading(true);
      const result = await getAchievementCriteriaApi();
      if (result && result.code === 200) {
        setAchievementCriteria(result.data);
      }
    } catch (error) {
      console.error('fetchAchievementCriteria 오류:', error);
    } finally {
      setIsAchievementCriteriaLoading(false);
    }
  }, []);

  // 사용자 정보 조회
  const fetchUserProfile = useCallback(async () => {
    try {
      setIsUserProfileLoading(true);

      const result = await getUserInfoApi();
      if (result.code != 200) {
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

  // 사용자 정보 조회 함수
  const getUserProfile = useCallback(() => {
    return userProfile;
  }, [userProfile, isUserProfileLoading]);

  // 사용자 정보 업데이트 함수
  const updateUserProfile = useCallback(async ({ username, level_id }) => {
    const result = await updateUserInfoApi({ username, level_id });
    if (result.code != 200) return;
    setUserProfile(prevProfile => ({
      ...prevProfile,
      level_id: level_id,
      username: username,
    }));
  }, [userProfile]);

  // 업적, 보석, ... 업데이트 함수
  const updateUserHistory = useCallback(async ({ today_study_complete, correct_cnt, incorrect_cnt }) => {
    try {
      const result = await updateUserStudyHistoryApi({ today_study_complete, correct_cnt, incorrect_cnt });
      if (result.code != 200) return;

      // 보석 업데이트 내용 적용
      // (StudyResult.jsx에서 처리하므로 여기서 오버레이를 띄우지 않음)

      setUserProfile(prevProfile => ({
        ...prevProfile,
        gem_cnt: result.data.gem.after,
      }))

      // 오늘의 학습 완료 시 데일리 미션 업데이트
      if (result.data.today_study_complete) {
        const today = new Date();
        const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
        const todayName = dayNames[today.getDay()];

        setUserMainPage(prevMainPage => {
          const updatedDates = prevMainPage.dates?.map(date => {
            if (date.date === todayName) {
              return {
                ...date,
                daily_mission: true
              };
            }
            return date;
          }) || [];

          return {
            ...prevMainPage,
            dates: updatedDates
          };
        });
      }

      // 업적 업데이트 (새로 완료된 업적이 있는 경우)
      if (result.data.goals && result.data.goals.length > 0) {
        // 업적 오버레이 표시 (StudyResult.jsx에서 처리하므로 여기서 오버레이를 띄우지 않음)

        setUserMainPage(prevMainPage => {
          const existingGoals = prevMainPage.goals || [];

          // 기존 업적 목록을 복사하고, 새로 완료된 업적을 추가/업데이트
          const updatedGoals = [...existingGoals];

          result.data.goals.forEach(newGoal => {
            const existingIndex = updatedGoals.findIndex(g => g.type === newGoal.type);
            if (existingIndex >= 0) {
              // 기존 업적이 있으면 레벨 업데이트
              updatedGoals[existingIndex] = {
                ...updatedGoals[existingIndex],
                level: newGoal.level,
                badge_img: newGoal.badge_img
              };
            } else {
              // 새 업적 추가
              updatedGoals.push({
                name: newGoal.name,
                type: newGoal.type,
                level: newGoal.level,
                badge_img: newGoal.badge_img
              });
            }
          });

          return {
            ...prevMainPage,
            goals: updatedGoals
          };
        });
      }

      if (result.code == 200) {
        return result.data;
      } else {
        return null;
      }
    } catch (err) {
      console.log("오류 발생함", err)
    }
  }, []);

  // 출석 체크
  const fetchUserCheckin = useCallback(async () => {
    const result = await setUserCheckinApi();
    if (result.code != 200) return;

    // 업적 업데이트 (새로 완료된 업적이 있는 경우) - 먼저 표시
    if (result.data.goals && result.data.goals.length > 0) {
      // 업적 오버레이 표시
      if (window.overlayContext?.showAwaitOverlay) {
        result.data.goals.forEach(goal => {
          window.overlayContext.showAwaitOverlay(AchievementRewardOverlay, { goal });
        });
      }

      setUserMainPage(prevMainPage => {
        const existingGoals = prevMainPage.goals || [];
        const updatedGoals = [...existingGoals];

        result.data.goals.forEach(newGoal => {
          const existingIndex = updatedGoals.findIndex(g => g.type === newGoal.type);
          if (existingIndex >= 0) {
            updatedGoals[existingIndex] = {
              ...updatedGoals[existingIndex],
              level: newGoal.level,
              badge_img: newGoal.badge_img
            };
          } else {
            updatedGoals.push({
              name: newGoal.name,
              type: newGoal.type,
              level: newGoal.level,
              badge_img: newGoal.badge_img
            });
          }
        });

        return {
          ...prevMainPage,
          goals: updatedGoals
        };
      });
    }

    // 보석 업데이트 및 오버레이 표시 - 업적이 없을 때만 표시
    // 업적 완료 시 지급되는 보석은 업적 오버레이에 포함되므로 별도 표시 안 함
    if (result.data.gem && result.data.gem.after > result.data.gem.before) {
      // 업적이 완료되지 않은 경우에만 보석 오버레이 표시
      if (!result.data.goals || result.data.goals.length === 0) {
        if (window.overlayContext?.showAwaitOverlay) {
          window.overlayContext.showAwaitOverlay(GemRewardOverlay, {
            gemCount: result.data.gem.after - result.data.gem.before,
            title: "출석 보상!",
            description: "오늘의 보석 보상이 지급되었습니다."
          });
        }
      }
    }

    setUserProfile(prevProfile => ({
      ...prevProfile,
      gem_cnt: result.data.gem.after,
    }))
  }, []);

  // 상품 조회 함수
  const fetchGemItems = useCallback(async () => {
    try {
      const result = await getGemItemsApi();
      if (result.code != 200) {
        console.error('상품 조회 오류:', result.message);
        return;
      }
      setGemItems(result.data);
    } catch (err) {
      console.error('fetchGemItems 오류:', err);
    }
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

      const result = await loginApi({ googleId, email, name });
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
      if (userProfileResult.success) {
        setUserProfile(userProfileResult.userProfile);
      }
      return { success: true, accessToken };
    } catch (error) {
      console.error('로그인 오류:', error);
      console.log('로그인 중 오류가 발생하였습니다.');
      return { success: false };
    }
  }, []);

  // Apple 로그인 처리 함수
  const AppleLogin = useCallback(async ({ identityToken, fullName, email, status }) => {
    try {
      console.log("AppleLogin 함수 내부 시작됨");

      if (Number(status) !== 200) {
        console.log('status가 200이 아닙니다.');
        return { success: false };
      }

      const result = await appleLoginApi({ identityToken, fullName, email });
      if (!result || result.code !== 200) {
        console.log('Apple 로그인 API 실패');
        return { success: false };
      }

      const accessToken = result.accessToken;
      setCookie('userAccessToken', accessToken);

      // 이름 정보가 있으면 업데이트 (최초 로그인 시)
      let userName = 'Apple User';
      if (fullName) {
        if (typeof fullName === 'object') {
          const { familyName, givenName } = fullName;
          userName = `${familyName || ''}${givenName || ''}`;
        } else {
          userName = fullName;
        }
      }
      if (!userName.trim() && email) {
        userName = email.split('@')[0];
      }

      setAuth({
        user: {
          name: userName,
          email: email,
        }
      });
      setIsLogin(true);
      setIsLoginChecked(true);

      const userProfileResult = await fetchUserProfile();
      if (userProfileResult.success) {
        setUserProfile(userProfileResult.userProfile);
      }
      return { success: true, accessToken };
    } catch (error) {
      console.error('Apple 로그인 오류:', error);
      return { success: false };
    }
  }, []); // loginApi 의존성 제거

  // 개발자 로그인 처리 함수 (Local Only)
  const DevLogin = useCallback(async ({ email }) => {
    try {
      const result = await devLoginApi({ email });
      if (!result || result.code !== 200) {
        return { success: false, message: result?.message || '로그인 실패' };
      }

      const accessToken = result.accessToken;
      setCookie('userAccessToken', accessToken);

      const userName = result.user.name || 'Developer';

      setAuth({
        user: {
          name: userName,
          email: email,
        }
      });
      setIsLogin(true);
      setIsLoginChecked(true);

      const userProfileResult = await fetchUserProfile();
      if (userProfileResult.success) {
        setUserProfile(userProfileResult.userProfile);
      }
      return { success: true, accessToken };
    } catch (error) {
      console.error('Dev Login Error:', error);
      return { success: false, message: '서버 오류' };
    }
  }, []);

  // 구글 로그인 클릭 처리 (웹/앱 자동 구분)
  const clickGoogleOauth = useCallback(() => {
    const device_type = getDevicePlatform();
    if (device_type === 'web') {
      window.location.href = `${backendUrl}/auth/google/oauth/web?device_type=${device_type}`;
    } else {
      window.ReactNativeWebView.postMessage(JSON.stringify({ 'type': 'launchGoogleAuth' }));
    }
  }, []);

  // 애플 로그인 클릭 처리 (앱 전용)
  const clickAppleOauth = useCallback(() => {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ 'type': 'launchAppleAuth' }));
    } else {
      console.log("Apple Login is only supported in App environment.");
      alert("Apple 로그인은 앱에서만 가능합니다.");
    }
  }, []);

  // 로그아웃 처리 함수 (웹/앱 공통)
  const performLogout = useCallback(async () => {
    try {
      // 로그아웃 API 호출
      const url = `${backendUrl}/auth/logout`;
      const method = 'POST';
      const fetchData = {};

      const result = await fetchDataAsync(url, method, fetchData);
      if (result.code !== 200) {
        console.error('로그아웃 API 실패:', result);
        return { success: false, error: '로그아웃 API 실패' };
      }

      // 쿠키에서 accessToken 제거
      setCookie('userAccessToken', '', -1); // 쿠키 즉시 만료

      // auth 상태 초기화
      setAuth({
        user: null,
      });

      // 로그인 상태 초기화
      setIsLogin(false);
      setIsLoginChecked(true);

      return { success: true };
    } catch (error) {
      console.error('로그아웃 실패:', error);
      return { success: false, error: error.message };
    }
  }, [setAuth]);

  // 회원 탈퇴 처리 함수 (웹/앱 공통)
  const performWithdraw = useCallback(async () => {
    try {
      // 회원 탈퇴 API 호출
      const result = await withdrawApi();

      if (result.code !== 200) {
        console.error('회원 탈퇴 API 실패:', result);
        return { success: false, error: '회원 탈퇴 API 실패' };
      }

      // 모든 캐시 및 저장소 삭제
      localStorage.clear();
      sessionStorage.clear();

      // 쿠키에서 accessToken 제거
      setCookie('userAccessToken', '', -1);

      // auth 상태 초기화
      setAuth({
        user: null,
      });

      // 로그인 상태 초기화
      setIsLogin(false);
      setIsLoginChecked(true);

      return { success: true };
    } catch (error) {
      console.error('회원 탈퇴 실패:', error);
      return { success: false, error: error.message };
    }
  }, [setAuth]);

  // 앱 구글 로그아웃/회원탈퇴 콜백 처리 (앱에서는 두 경우 모두 같은 콜백을 보낼 수 있음)
  const handleAppGoogleAccountAction = useCallback(async (data) => {
    console.log(`앱 구글 계정 액션 콜백 받음 (탈퇴진행중: ${isWithdrawInProgress}): ${JSON.stringify(data)}`);

    const { status, error } = data;

    if (status === 200) {
      let result;
      if (isWithdrawInProgress) {
        // 회원 탈퇴 처리
        result = await performWithdraw();
      } else {
        // 로그아웃 처리
        result = await performLogout();
      }

      if (result.success) {
        // 컨텍스트 초기화 (전역 객체를 통해 접근)
        if (window.newBottomSheetContext && window.newBottomSheetContext.clearStack) {
          window.newBottomSheetContext.clearStack();
        }
        if (window.newFullSheetContext && window.newFullSheetContext.clearStack) {
          window.newFullSheetContext.clearStack();
        }

        // 로그인 페이지로 이동
        window.location.href = '/login';
      }

      // 상태 초기화
      setIsWithdrawInProgress(false);
    } else {
      console.error(`앱 계정 액션 실패: ${error || '알 수 없는 오류'}`);
      setIsWithdrawInProgress(false);
    }
  }, [performLogout, performWithdraw, isWithdrawInProgress]);



  // 앱 구글 로그아웃 리스너 등록
  useEffect(() => {
    // 앱에서 구글 로그아웃/회원탈퇴 시 동일한 콜백을 사용할 수 있으므로 하나로 관리
    postMessageManager.setupAppGoogleLogout(handleAppGoogleAccountAction);

    return () => {
      postMessageManager.removeAppGoogleLogout();
    };
  }, [handleAppGoogleAccountAction]);

  // 로그인 상태 확인 함수 (전역 상태 업데이트)
  const checkLoginStatus = useCallback(async () => {
    const accessToken = getCookie('userAccessToken');
    if (accessToken) {
      // 서버에서 토큰 유효성 확인 + user 정보 가져오기
      const userProfileResult = await fetchUserProfile();
      if (userProfileResult.success) {
        const userProfile = getUserProfile();
        // 로그인 상태 업데이트
        setIsLogin(true);
        setIsLoginChecked(true);
        setAuth({ user: { name: userProfile?.name, email: userProfile?.email } });
        return { isLoggedIn: true, userProfile };
      } else {
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
            fetchGemItems(),
            fetchAchievementCriteria()
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
    fetchUserCheckin,
    setUserProfile,
    setUserMainPage,
    updateUserHistory,
    // 인증 상태 추가
    auth,
    setAuth,
    // 로그인 상태 관리
    isLogin,
    isLoginChecked,
    // 회원 탈퇴 상태 관리
    isWithdrawInProgress,
    setIsWithdrawInProgress,
    // 로그인 처리 함수들 추가
    Login,
    AppleLogin,
    clickGoogleOauth,
    clickAppleOauth,
    clickAppleOauth,
    DevLogin,
    checkLoginStatus,
    performLogout,
    performWithdraw,

    // 상품 조회 함수
    gemItems,
    setGemItems,
    fetchGemItems,

    // 업적 기준 데이터
    achievementCriteria,
    isAchievementCriteriaLoading,
    fetchAchievementCriteria,
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