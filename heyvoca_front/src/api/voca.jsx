import { backendUrl, fetchDataAsync } from '../utils/common';

// 사용자 단어장 목록 조회 API
export const getUserVocabularySheetsApi = async () => {
  const url = `${backendUrl}/user_voca_book/list`;
  const method = 'GET';
  const fetchData = {};
  try{
    const result = await fetchDataAsync(url, method, fetchData);
    return result
  }catch(error){
    console.error('getUserVocabularySheetsApi 오류:', error);
  }
}

// 사용자 단어장 추가 API
export const addUserVocabularySheetApi = async (newVocabulary) => {
  const url = `${backendUrl}/user_voca_book/create`;
  const method = 'POST';
  const fetchData = {
    words: [],
    total: 0,
    memorized: 0,
    ...newVocabulary,
  };
  try{
    const result = await fetchDataAsync(url, method, fetchData);
    return result
  }catch(error){
    console.error('addUserVocabularySheetApi 오류:', error);
  }
}

// 사용자 단어장 수정 API
export const updateUserVocabularySheetApi = async (id, updates) => {
  const url = `${backendUrl}/user_voca_book/update`;
  const method = 'PATCH';
  const fetchData = {
    ...updates,
    id: id,
  };
  try{
    const result = await fetchDataAsync(url, method, fetchData);
    return result
  }catch(error){
    console.error('updateUserVocabularySheetApi 오류:', error);
  }
};

// 사용자 단어장 삭제 API
export const deleteUserVocabularySheetApi = async (id) => {
  const url = `${backendUrl}/user_voca_book/delete`;
  const method = 'DELETE';
  const fetchData = {
    id: id,
  };
  try{
    const result = await fetchDataAsync(url, method, fetchData);
    return result
  }catch(error){
    console.error('deleteUserVocabularySheetApi 오류:', error);
  }
};

// 사용자 단어장 추가 가능 여부 확인 API
export const userBookCntCheckApi = async () => {
  const url = `${backendUrl}/mainpage/user_book_cnt_check`;
  const method = 'GET';
  const fetchData = {};
  try{
    const result = await fetchDataAsync(url, method, fetchData);
    return result
  }catch(error){
    console.error('userBookCntCheckApi 오류:', error);
  }
}