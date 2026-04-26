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

// 구글 Drive에서 스프레드시트 목록 조회
export const fetchGoogleSheetListApi = async (accessToken) => {
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false")}&fields=${encodeURIComponent('files(id,name,modifiedTime)')}&orderBy=modifiedTime desc&pageSize=50`;
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return { code: response.status, message: error.error?.message || '스프레드시트 목록 조회에 실패했습니다.' };
    }
    const data = await response.json();
    return { code: 200, data: data.files || [] };
  } catch (error) {
    console.error('fetchGoogleSheetListApi 오류:', error);
    return { code: 500, message: '스프레드시트 목록 조회 중 오류가 발생했습니다.' };
  }
};

// 구글 스프레드시트의 시트 탭 목록 조회
export const fetchGoogleSheetTabsApi = async (accessToken, spreadsheetId) => {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`;
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return { code: response.status, message: error.error?.message || '시트 정보 조회에 실패했습니다.' };
    }
    const data = await response.json();
    const sheets = (data.sheets || []).map((s) => ({
      sheetId: s.properties.sheetId,
      title: s.properties.title,
    }));
    return { code: 200, data: sheets };
  } catch (error) {
    console.error('fetchGoogleSheetTabsApi 오류:', error);
    return { code: 500, message: '시트 정보 조회 중 오류가 발생했습니다.' };
  }
};

// 구글 스프레드시트 데이터 조회
export const fetchGoogleSheetDataApi = async (accessToken, spreadsheetId, sheetTitle) => {
  const range = encodeURIComponent(sheetTitle);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return { code: response.status, message: error.error?.message || '시트 데이터 조회에 실패했습니다.' };
    }
    const data = await response.json();
    return { code: 200, data: data.values || [] };
  } catch (error) {
    console.error('fetchGoogleSheetDataApi 오류:', error);
    return { code: 500, message: '시트 데이터 조회 중 오류가 발생했습니다.' };
  }
};

// Anki 파일 미리보기 (파싱)
export const uploadAnkiPreviewApi = async (file) => {
  const url = `${backendUrl}/vocaBooks/upload/anki/preview`;
  const method = 'POST';
  const data = {
    json_data: {},
    form_data: [{ key: 'file', value: file }],
  };
  try {
    const result = await fetchDataAsync(url, method, data, true);

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
    console.error('uploadAnkiPreviewApi 오류:', error);
    throw error;
  }
};

// Anki 파일 업로드로 단어장 생성
export const uploadAnkiApi = async (file, title, color, mapping, selectedNoteTypeId) => {
  const url = `${backendUrl}/vocaBooks/upload/anki`;
  const method = 'POST';
  const data = {
    json_data: { title, color, mapping, selectedNoteTypeId },
    form_data: [{ key: 'file', value: file }],
  };
  try {
    const result = await fetchDataAsync(url, method, data, true);

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
    console.error('uploadAnkiApi 오류:', error);
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
