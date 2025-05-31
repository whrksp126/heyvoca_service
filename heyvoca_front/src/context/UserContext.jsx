import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { backendUrl, fetchDataAsync } from '../utils/common';

const UserContext = createContext(null);
export const UserProvider = ({ children }) => {
  const [userProfile, setUserProfile] = useState({});
  const [isUserProfileLoading, setIsUserProfileLoading] = useState(true);
  const [errorUserProfile, setErrorUserProfile] = useState(null);
  const [userStorageData, setUserStorageData] = useState(JSON.parse(localStorage.getItem('user')));
  
  
  const fetchUserProfile = useCallback(async () => {
    try {
      setIsUserProfileLoading(true);
      const url = `${backendUrl}/login/get_user_info`;
      const method = 'GET';
      const fetchData = {};
      const result = await fetchDataAsync(url, method, fetchData);
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
      const url = `${backendUrl}/login/update_user_info`;
      const method = 'PATCH';
      const result = await fetchDataAsync(url, method, updates);
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
  }, [userProfile]);

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
    updateUserProfile,
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