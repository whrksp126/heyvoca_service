// 듣기 문제 건너뛰기 — 5분간 듣기 유형 문제를 일반 유형으로 출제한다.
// localStorage에 만료 시각을 저장하므로 앱(브라우저)을 재시작해도 5분 동안 유지된다.

const STORAGE_KEY = 'listeningSkipUntil';
export const LISTENING_SKIP_DURATION_MIN = 5;
const SKIP_DURATION_MS = LISTENING_SKIP_DURATION_MIN * 60 * 1000;

// 듣기 유형 → 대응되는 일반 유형 매핑
const LISTENING_TYPE_MAP = {
  cardMatchListening: 'cardMatch',
  multipleChoiceListening: 'multipleChoice',
};

export const isListeningType = (type) => Object.prototype.hasOwnProperty.call(LISTENING_TYPE_MAP, type);

// 듣기 유형이면 대응 일반 유형으로, 아니면 그대로 반환
export const mapSkippedQuestionType = (type) => LISTENING_TYPE_MAP[type] ?? type;

// 현재 "듣기 문제 건너뛰기"가 활성 상태인지
export const isListeningSkipActive = () => {
  try {
    const until = parseInt(localStorage.getItem(STORAGE_KEY) ?? '0', 10);
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
};

// 5분간 듣기 문제 건너뛰기 활성화. 만료 시각(ms epoch)을 반환.
export const activateListeningSkip = () => {
  const until = Date.now() + SKIP_DURATION_MS;
  try {
    localStorage.setItem(STORAGE_KEY, String(until));
  } catch {
    // localStorage 접근 불가 시 무시
  }
  return until;
};
