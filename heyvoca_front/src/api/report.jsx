import { backendUrl, fetchDataAsync } from '../utils/common';

// 학습 중 데이터 오류 신고 1건 전송 — 백엔드 app/routes/content_report.py (POST /report)
// 같은 문항·같은 사유를 10분 안에 다시 보내면 서버가 새로 만들지 않고 data.duplicate=true 로 돌려준다.
export const createContentReportApi = async (body) => {
  const url = `${backendUrl}/report`;
  try {
    return await fetchDataAsync(url, 'POST', body);
  } catch (error) {
    console.error('createContentReportApi 오류:', error);
  }
};

// 사전에 없는 단어 '사전 추가 요청'(이슈 #25 12차) — 백엔드 POST /report/dict-missing.
// 같은 사용자·같은 단어(정규화)는 한 번만 저장되고, 다시 보내면 data.duplicate=true.
export const requestDictWordApi = async ({ word, lang, context, source, platform, app_version, web_version }) => {
  try {
    return await fetchDataAsync(`${backendUrl}/report/dict-missing`, 'POST', {
      word, lang, context, source, platform, app_version, web_version,
    });
  } catch (error) {
    console.error('requestDictWordApi 오류:', error);
  }
};

// 내가 이 단어를 이미 사전 추가 요청했는지 — data.requested
export const getDictWordRequestStatusApi = async ({ word, lang }) => {
  try {
    return await fetchDataAsync(`${backendUrl}/report/dict-missing/status`, 'GET', { word, lang });
  } catch (error) {
    console.error('getDictWordRequestStatusApi 오류:', error);
  }
};
