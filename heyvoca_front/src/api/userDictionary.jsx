import { backendUrl, fetchDataAsync } from '../utils/common';

// 사용자 사전 조회
export const getUserDictionaryApi = async () => {
  const url = `${backendUrl}/vocaIndexs`;
  const method = 'GET';
  const fetchData = {};
  try {
    return await fetchDataAsync(url, method, fetchData);
  } catch (error) {
    console.error('getUserDictionaryApi 오류:', error);
    throw error;
  }
};

// 사용자 사전 단어 생성
export const createUserDictionaryWordApi = async (data) => {
  const url = `${backendUrl}/vocaIndexs`;
  const method = 'POST';
  // data should include origin, vocaBookId, sm2, meanings, examples
  try {
    return await fetchDataAsync(url, method, data);
  } catch (error) {
    console.error('createUserDictionaryWordApi 오류:', error);
    throw error;
  }
};

// 사용자 사전 단어 수정
export const updateUserDictionaryWordApi = async (vocaIndexId, updates) => {
  const url = `${backendUrl}/vocaIndexs/${vocaIndexId}`;
  const method = 'PATCH';
  try {
    return await fetchDataAsync(url, method, updates);
  } catch (error) {
    console.error('updateUserDictionaryWordApi 오류:', error);
    throw error;
  }
};

// 사용자 단어장 단어 수정 (특정 단어장 내에서의 의미/예문 수정)
export const updateUserBookWordApi = async (vocaIndexId, vocaBookId, updates) => {
  const url = `${backendUrl}/vocaIndexs/${vocaIndexId}/vocaBooks/${vocaBookId}`;
  const method = 'PUT';
  try {
    return await fetchDataAsync(url, method, updates);
  } catch (error) {
    console.error('updateUserBookWordApi 오류:', error);
    throw error;
  }
};

// 사용자 사전 단어 삭제
export const deleteUserDictionaryWordApi = async (vocaIndexId) => {
  const url = `${backendUrl}/vocaIndexs/${vocaIndexId}`;
  const method = 'DELETE';
  const fetchData = {};
  try {
    return await fetchDataAsync(url, method, fetchData);
  } catch (error) {
    console.error('deleteUserDictionaryWordApi 오류:', error);
    throw error;
  }
};

// 사용자 단어장 단어 삭제 (특정 단어장에서만 삭제)
export const deleteWordFromVocaBookApi = async (vocaIndexId, vocaBookId) => {
  const url = `${backendUrl}/vocaIndexs/${vocaIndexId}/vocaBooks/${vocaBookId}`;
  const method = 'DELETE';
  const fetchData = {};
  try {
    return await fetchDataAsync(url, method, fetchData);
  } catch (error) {
    console.error('deleteWordFromVocaBookApi 오류:', error);
    throw error;
  }
};
