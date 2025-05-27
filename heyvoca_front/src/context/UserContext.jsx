import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { backendUrl, fetchDataAsync } from '../utils/common';

const UserContext = createContext(null);
export const UserProvider = ({ children }) => {
  const [userProfile, setUserProfile] = useState({});
  const [isUserProfileLoading, setIsUserProfileLoading] = useState(true);
  const [errorUserProfile, setErrorUserProfile] = useState(null);
  const [userStorageData, setUserStorageData] = useState(JSON.parse(localStorage.getItem('user')));
  
  // 모든 단어장 데이터 불러오기
  const fetchUserProfile = useCallback(async () => {
    try {
      setIsUserProfileLoading(true);
      const url = `${backendUrl}/login/get_user_info`;
      const method = 'GET';
      const fetchData = {};
      const result = await fetchDataAsync(url, method, fetchData);
      if(result.code != 200) return alert('유저 정보를 불러오는데 실패했습니다.');
      setUserProfile(result.data);
      setErrorUserProfile(null);
    } catch (err) {
      console.log("오류 발생함")
      setErrorUserProfile('유저 정보를 불러오는데 실패했습니다.');
      console.error('Failed to fetch user profile:', err);
    } finally {
      setIsUserProfileLoading(false);
    }
  }, []);

  // 모든 단어장 조회
  const getUserProfile = useCallback(() => {
    return userProfile;
  }, [userProfile, isUserProfileLoading]);

  // 앱 시작시 데이터 로드
  useEffect(() => {
    
    fetchUserProfile();
  }, []);


  const value = {
    userStorageData,
    userProfile,
    isUserProfileLoading,
    errorUserProfile,
    getUserProfile,
    fetchUserProfile,
    setUserProfile,
    setUserStorageData,
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