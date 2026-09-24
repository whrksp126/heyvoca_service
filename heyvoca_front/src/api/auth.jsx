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
// authorizationCode: 최초 로그인 시에만 앱에서 전달되는 1회성 코드.
// 백엔드가 이 코드로 apple refresh_token을 교환해 저장 → 이후 회원 탈퇴 시 revoke에 사용.
export const appleLoginApi = async ({ identityToken, fullName, email, authorizationCode }) => {
  const url = `${backendUrl}/auth/apple/oauth/app`;
  const method = 'POST';
  const fetchData = {
    identityToken,
    fullName,
    email,
    authorizationCode
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
export const updateUserInfoApi = async ({ username, level_id, daily_new_limit, learning_lang } = {}) => {
  const url = `${backendUrl}/auth/update_user_info`;
  const method = 'PATCH';
  const fetchData = {};
  if (username !== undefined) fetchData.username = username;
  if (level_id !== undefined) fetchData.level_id = level_id;
  if (daily_new_limit !== undefined) fetchData.daily_new_limit = daily_new_limit;
  // 학습 언어('en'|'ja') — 서버가 값 검증. 이후 모든 조회가 이 언어 기준으로 바뀐다.
  if (learning_lang !== undefined) fetchData.learning_lang = learning_lang;
  try {
    const result = await fetchDataAsync(url, method, fetchData);
    return result;
  } catch (error) {
    console.error('updateUserInfoApi 오류:', error);
  }
}

// 초대 기록 조회 API (내 초대 코드 + 초대한 사용자 목록)
export const getInvitesApi = async () => {
  const url = `${backendUrl}/auth/invites`;
  const method = 'GET';
  try {
    const result = await fetchDataAsync(url, method, {});
    return result;
  } catch (error) {
    console.error('getInvitesApi 오류:', error);
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