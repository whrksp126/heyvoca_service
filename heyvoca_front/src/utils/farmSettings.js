/**
 * 당근 농장 V2 설정값 — 시안 "설정" 2·3절.
 *
 * 주의: 아래 값들은 **아직 백엔드 계약이 없다.**
 *   - 돌봄 알림 4종(물주기/시듦/부패/연속 위험)과 주간 요약 → /fcm 은 is_study_allowed,
 *     is_marketing_allowed 두 개뿐이다.
 *   - 하루 복습량 자동 / 복습 순서 → user_farm_setting.daily_review_limit 컬럼은 있으나
 *     읽기·쓰기 엔드포인트가 없다.
 * 그래서 지금은 기기 로컬(localStorage)에만 남는다 — 서버·다른 기기에는 반영되지 않는다.
 * 엔드포인트가 생기면 이 모듈의 read/write 만 API 호출로 바꾸면 된다.
 */

const KEY = 'farmSettings';

export const FARM_SETTINGS_DEFAULT = {
  // 알림 (시안 설정 3절)
  notifyWater: true,    // 오늘의 물주기 — 오후 1시 · 저녁 9시
  notifyWilt: true,     // 시듦 경고 — 물 줄 때가 지난 작물이 있을 때
  notifyRot: true,      // 부패 임박 — 오늘 안 주면 썩는 작물이 있을 때
  notifyStreak: true,   // 연속 학습 위험 — 자정까지 5개를 못 맞혔을 때
  notifyWeekly: false,  // 주간 요약 — 기본 꺼짐
  // 학습 (시안 설정 2절)
  reviewAuto: true,     // 하루 복습량 자동으로 맞추기
  reviewUrgentFirst: true, // 복습 순서 — 급한 것부터
};

export const readFarmSettings = () => {
  try {
    return { ...FARM_SETTINGS_DEFAULT, ...(JSON.parse(localStorage.getItem(KEY)) || {}) };
  } catch (e) {
    return { ...FARM_SETTINGS_DEFAULT };
  }
};

export const writeFarmSettings = (next) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch (e) { /* noop */ }
  return next;
};

/** 돌봄 알림 묶음(물주기·시듦·부패·연속 위험) 중 하나라도 켜져 있으면 "켜짐" (시안 설정 2절) */
export const isCareNotifyOn = (settings) =>
  !!(settings.notifyWater || settings.notifyWilt || settings.notifyRot || settings.notifyStreak);
