import { backendUrl, fetchDataAsync } from '../utils/common';

// 단어장 목록 조회
export const getVocaBooksApi = async () => {
  const url = `${backendUrl}/vocaBooks`;
  const method = 'GET';
  const fetchData = {};
  try {
    return await fetchDataAsync(url, method, fetchData);
  } catch (error) {
    console.error('getVocaBooksApi 오류:', error);
    throw error;
  }
};

// 단어장 개별 조회
export const getVocaBookDetailApi = async (vocaBookId) => {
  const url = `${backendUrl}/vocaBooks/${vocaBookId}`;
  const method = 'GET';
  const fetchData = {};
  try {
    return await fetchDataAsync(url, method, fetchData);
  } catch (error) {
    console.error('getVocaBookDetailApi 오류:', error);
    throw error;
  }
};

// 단어장 생성
export const createVocaBookApi = async (data) => {
  const url = `${backendUrl}/vocaBooks`;
  const method = 'POST';
  // data: title, color, vocaList
  try {
    return await fetchDataAsync(url, method, data);
  } catch (error) {
    console.error('createVocaBookApi 오류:', error);
    throw error;
  }
};

// 단어장 수정
export const updateVocaBookApi = async (vocaBookId, updates) => {
  const url = `${backendUrl}/vocaBooks/${vocaBookId}`;
  const method = 'PATCH';
  try {
    return await fetchDataAsync(url, method, updates);
  } catch (error) {
    console.error('updateVocaBookApi 오류:', error);
    throw error;
  }
};

// 단어장 삭제
export const deleteVocaBookApi = async (vocaBookId) => {
  const url = `${backendUrl}/vocaBooks/${vocaBookId}`;
  const method = 'DELETE';
  const fetchData = {};
  try {
    return await fetchDataAsync(url, method, fetchData);
  } catch (error) {
    console.error('deleteVocaBookApi 오류:', error);
    throw error;
  }
};
