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
