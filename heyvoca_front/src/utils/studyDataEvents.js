// src/utils/studyDataEvents.js
//
// "서버의 학습 기록이 바뀌었다" 신호 — /study/log 응답이 돌아올 때마다 한 번 쏜다.
//
// 홈 통계 캐시(StatsContext)는 원래 학습 결과 화면(StudyResult)이 lastSessionResult 를
// 바꿀 때만 다시 조회했다. 그 한 경로가 빠지면(학습 도중 종료, 결과 저장 API 실패,
// 결과 화면 구성 중 예외 …) 서버 FSRS 는 이미 바뀌었는데 홈 숫자는 그대로 굳었다
// ("아직 46개가 기다리고 있어요"가 학습해도 줄지 않음). 이 신호는 그 경로와 무관하게
// "캐시가 낡았다"는 사실만 알린다 — 실제 재조회 시점은 StatsContext 가 정한다.

export const STUDY_DATA_CHANGED_EVENT = 'heyvoca:study-data-changed';

export const notifyStudyDataChanged = () => {
  try {
    window.dispatchEvent(new CustomEvent(STUDY_DATA_CHANGED_EVENT));
  } catch { /* 이벤트 실패는 무시 — 다음 탭 진입 재조회가 받쳐 준다 */ }
};

// "게스트 온보딩 이전(/onboarding/migrate)이 끝났다" 신호.
//
// 단어장·사전·홈 통계는 **로그인되는 순간**(= migrate 전에) 한 번 받아 둔다. migrate 가
// 온보딩 단어장(+단어)을 막 만들었는데 그 캐시를 다시 받지 않으면, 가입 직후 단어장 탭이
// 비어 있다가 당겨서 새로고침해야 보였다(이슈 #25). migrate 를 부르는 곳이 두 군데
// (pages/Index.jsx 게스트 가입 경로, pages/Onboarding.jsx 로그인 상태 완료 경로)라
// 각 Context 가 이 신호 하나로 스스로 다시 받게 한다.
export const ONBOARDING_MIGRATED_EVENT = 'heyvoca:onboarding-migrated';

export const notifyOnboardingMigrated = () => {
  try {
    window.dispatchEvent(new CustomEvent(ONBOARDING_MIGRATED_EVENT));
  } catch { /* 이벤트 실패는 무시 — 당겨서 새로고침이 받쳐 준다 */ }
};
