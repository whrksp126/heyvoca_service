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

// Excel 파일 업로드로 단어장 생성
export const uploadExcelApi = async (file, title, color) => {
  const url = `${backendUrl}/vocaBooks/upload/excel`;
  const method = 'POST';
  const data = {
    json_data: { title, color },
    form_data: [{ key: 'file', value: file }],
  };
  try {
    const result = await fetchDataAsync(url, method, data, true);

    // Response 객체인 경우 (에러 응답) 응답 본문 읽기
    if (result instanceof Response) {
      const errorData = await result.json().catch(() => ({ message: '알 수 없는 오류가 발생했습니다.' }));
      return {
        code: result.status,
        message: errorData.message || errorData.error || `요청 실패 (${result.status})`,
        ...errorData
      };
    }

    return result;
  } catch (error) {
    console.error('uploadExcelApi 오류:', error);
    throw error;
  }
};

// CSV 파일 업로드로 단어장 생성
export const uploadCsvApi = async (file, title, color) => {
  const url = `${backendUrl}/vocaBooks/upload/csv`;
  const method = 'POST';
  const data = {
    json_data: { title, color },
    form_data: [{ key: 'file', value: file }],
  };
  try {
    const result = await fetchDataAsync(url, method, data, true);

    // Response 객체인 경우 (에러 응답) 응답 본문 읽기
    if (result instanceof Response) {
      const errorData = await result.json().catch(() => ({ message: '알 수 없는 오류가 발생했습니다.' }));
      return {
        code: result.status,
        message: errorData.message || errorData.error || `요청 실패 (${result.status})`,
        ...errorData
      };
    }

    return result;
  } catch (error) {
    console.error('uploadCsvApi 오류:', error);
    throw error;
  }
};
