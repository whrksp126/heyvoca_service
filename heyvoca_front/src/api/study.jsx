import { backendUrl, fetchDataAsync } from '../utils/common';

// 사용자 출석 체크 API
export const setUserCheckinApi = async () => {
  const url = `${backendUrl}/mainpage/checkin`;
  const method = 'GET';
  const fetchData = {};
  try{  
    const result = await fetchDataAsync(url, method, fetchData);
    return result;
  } catch (error) {
    console.error('getUserCheckinApi 오류:', error);
  }
}

// 사용자 학습 기록 달력 조회 API
export const getUserDatesApi = async () => {
  const url = `${backendUrl}/mainpage/user_dates`;
  const method = 'GET';
  const fetchData = {};
  try{
    const result = await fetchDataAsync(url, method, fetchData);
    return result
  }catch(error){
    console.error('getUserDatesApi 오류:', error);
  }
}

// 사용자 업적 조회 API
export const getUserGoalsApi = async () => {
  const url = `${backendUrl}/mainpage/user_goals`;
  const method = 'GET';
  const fetchData = {};
  try{
    const result = await fetchDataAsync(url, method, fetchData);
    return result
  }catch(error){
    console.error('getUserGoalsApi 오류:', error);
  }
}



// 사용자 학습 기록 업데이트 API
export const updateUserStudyHistoryApi = async ({today_study_complete, correct_cnt, incorrect_cnt}) => {
  const url = `${backendUrl}/mainpage/user_study_history`;
  const method = 'POST';
  const fetchData = {
    'today_study_complete': today_study_complete,
    'correct_cnt': correct_cnt,
    'incorrect_cnt': incorrect_cnt
  }
  try{
    const result = await fetchDataAsync(url, method, fetchData);
    return result
  }catch(error){
    console.error('updateUserStudyHistoryApi 오류:', error);
  }
}

// 사용자 최근 학습 데이터 조회 API
export const getUserRecentStudyDataApi = async () => {
  const url = `${backendUrl}/mainpage/user_recent_study_data`;
  const method = 'GET';
  const fetchData = {};
  try{
    const result = await fetchDataAsync(url, method, fetchData);
    return result
  }catch(error){
    console.error('getUserRecentStudyDataApi 오류:', error);
  }
}

// 사용자 최근 학습 데이터 업데이트 API
export const updateUserRecentStudyDataApi = async ({curRecentStudy}) => {
  const url = `${backendUrl}/mainpage/user_recent_study_create_update`;
  const method = 'POST';
  const fetchData = {
    ...curRecentStudy,
  };
  try{
    const result = await fetchDataAsync(url, method, fetchData);
    return result
  }catch(error){
    console.error('updateUserRecentStudyDataApi 오류:', error);
  }
}