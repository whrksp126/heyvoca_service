import { backendUrl, fetchDataAsync } from '../utils/common';

// 로그인 API
export const loginApi = async ({ googleId, email, name }) => {
  const url = `${backendUrl}/auth/login`;
  const method = 'POST';
  const fetchData = {
    google_id: googleId,
    email,
    name
  };
  try {
    const result = await fetchDataAsync(url, method, fetchData);
    return result;
  } catch (error) {
    console.error('loginApi 오류:', error);
  }
}


// Apple 로그인 API
export const appleLoginApi = async ({ identityToken, fullName, email }) => {
  const url = `${backendUrl}/auth/apple/oauth/app`;
  const method = 'POST';
  const fetchData = {
    identityToken,
    fullName,
    email
  };
  try {
    const result = await fetchDataAsync(url, method, fetchData);
    return result;
  } catch (error) {
    console.error('appleLoginApi 오류:', error);
  }
}

// 개발자 로그인 API (Local Only)
export const devLoginApi = async ({ email }) => {
  const url = `${backendUrl}/auth/dev-login`;
  const method = 'POST';
  const fetchData = { email };
  try {
    const result = await fetchDataAsync(url, method, fetchData);
    return result;
  } catch (error) {
    console.error('devLoginApi 오류:', error);
    throw error;
  }
}


// 사용자 기본 정보 업데이트 API
export const updateUserInfoApi = async ({ username, level_id }) => {
  const url = `${backendUrl}/auth/update_user_info`;
  const method = 'PATCH';
  const fetchData = {
    username,
    level_id
  };
  try {
    const result = await fetchDataAsync(url, method, fetchData);
    return result;
  } catch (error) {
    console.error('updateUserInfoApi 오류:', error);
  }
}

// 사용자 정보 조회 API
export const getUserInfoApi = async () => {
  const url = `${backendUrl}/auth/get_user_info`;
  const method = 'GET';
  const fetchData = {};
  try {
    const result = await fetchDataAsync(url, method, fetchData);
    return result;
  } catch (error) {
    console.error('getUserInfoApi 오류:', error);
  }
}

// 사용자 보석 차감 API
export const deductGemApi = async ({ gem_cnt, bookstore_id }) => {
  const url = `${backendUrl}/auth/deduct_gem`;
  const method = 'POST';
  const fetchData = {
    gem_cnt: gem_cnt,
    ...(bookstore_id && { bookstore_id })
  };
  try {
    const result = await fetchDataAsync(url, method, fetchData);
    return result;
  } catch (error) {
    console.error('deductGemApi 오류:', error);
  }
}

// 회원 탈퇴 API
export const withdrawApi = async () => {
  const url = `${backendUrl}/auth/withdraw`;
  const method = 'DELETE';
  const fetchData = {};
  try {
    const result = await fetchDataAsync(url, method, fetchData);
    return result;
  } catch (error) {
    console.error('withdrawApi 오류:', error);
    throw error;
  }
}