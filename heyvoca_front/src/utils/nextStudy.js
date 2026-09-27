/*
  학습 결과 화면의 "다음 학습" — 방금 끝난 학습과 **같은 종류의 새 세션**을 정한다.

  넷플릭스 '다음화 자동 재생'처럼, 결과를 본 사람이 "이제 뭘 하지"를 고르지 않아도
  같은 흐름으로 이어지게 하는 것이 목적이다. 그래서 새 설정을 묻지 않고, 방금 들어온
  경로의 설정을 그대로 다시 쓴다.

    quick  (홈 주 CTA · AI 추천 테스트) → 새 추천 세트. 설정은 useQuickReview.buildState 와 같다.
                                          단어 수가 바뀌었을 수 있어 count 는 지금 기준으로 다시 잰다.
    test   (학습 탭 자유 설정 테스트)   → 같은 단어장·단계·유형·개수로 새 문제(백엔드 추천을 새로 받는다).
    exam   (단어장 상세 자유 설정 테스트) → 위와 같다. 대상 단어장이 하나로 고정돼 있다.
    today  (게스트 온보딩 맛보기)       → 없음. 결과 다음은 가입 흐름이다.

  같은 설정을 다시 쓰려면 그 설정(TakeTest 의 state.data)을 알아야 하는데,
  이어하기로 들어온 세션은 navigate state 에 data 가 없다(LearningInfo → onSet 은 testType 만 넘긴다).
  그래서 새 세션을 만들 때 설정을 기기에 적어 두고(saveStudyConfig), 결과 화면이 그걸 읽는다.
*/
import { QUICK_QUESTION_TYPES, countFillInTheBlankCandidates, isFillInTheBlankType } from '../plugins/questionTypes';
import { isWordStudiable, wordMemoryStage } from './vocaCrop';
import { MIN_TEST_VOCABULARY_COUNT } from './common';

// 결과를 볼 시간 — 사용자 제안(5~10초) 안에서 결과 목록을 한 번 훑을 수 있는 길이
export const NEXT_STUDY_COUNTDOWN_MS = 8000;

// useQuickReview.MAX_QUESTIONS 와 같은 값
const QUICK_MAX_QUESTIONS = 14;

const CONFIG_KEY = (testType) => `heyvoca_study_config_${testType}`;

/** 새 세션을 만들 때 그 설정을 적어 둔다 — 이어하기로 끝난 세션의 "다음 학습"이 쓴다 */
export const saveStudyConfig = (testType, data) => {
  if (!testType || !data) return;
  try {
    localStorage.setItem(CONFIG_KEY(testType), JSON.stringify(data));
  } catch (e) { /* 저장 실패 — 결과 화면이 navigate state 로만 판단한다 */ }
};

export const loadStudyConfig = (testType) => {
  if (!testType) return null;
  try {
    const raw = localStorage.getItem(CONFIG_KEY(testType));
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

const wordsOfSheets = (vocabularySheets, vocabularySheetId) => {
  const sheets = Array.isArray(vocabularySheets) ? vocabularySheets : [];
  if (!vocabularySheetId || vocabularySheetId === 'all') {
    return sheets.flatMap((s) => s.words || []);
  }
  const ids = new Set(Array.isArray(vocabularySheetId) ? vocabularySheetId : [vocabularySheetId]);
  return sheets.filter((s) => ids.has(s.id)).flatMap((s) => s.words || []);
};

/**
 * 다음 학습 계획.
 * @returns {{ available: boolean, reason?: string, state?: object }}
 *   state 는 navigate('/take-test', { state }) 에 그대로 넘긴다.
 */
export const planNextStudy = ({ testType, isGuest, config, vocabularySheets }) => {
  if (isGuest || !testType || testType === 'today') return { available: false, reason: null };

  if (testType === 'quick') {
    const studiable = wordsOfSheets(vocabularySheets, 'all').filter(isWordStudiable);
    if (studiable.length < MIN_TEST_VOCABULARY_COUNT) {
      return { available: false, reason: '지금은 더 학습할 단어가 없어요' };
    }
    return {
      available: true,
      state: {
        testType: 'quick',
        data: {
          questionType: QUICK_QUESTION_TYPES,
          useRecommendedTypes: true,
          vocabularySheetId: 'all',
          memoryState: null,
          count: Math.min(QUICK_MAX_QUESTIONS, studiable.length),
        },
      },
    };
  }

  if (testType === 'test' || testType === 'exam') {
    if (!config) return { available: false, reason: null };
    const studiable = wordsOfSheets(vocabularySheets, config.vocabularySheetId).filter(isWordStudiable);
    const stages = Array.isArray(config.memoryState) && config.memoryState.length > 0
      ? config.memoryState
      : null;
    // 설정 시트의 currentMemoryStateCount 와 같은 규칙 — 방금 학습으로 단계가 바뀐 단어는 빠진다
    const matching = stages ? studiable.filter((w) => stages.includes(wordMemoryStage(w))) : studiable;
    if (matching.length < MIN_TEST_VOCABULARY_COUNT) {
      return { available: false, reason: '같은 설정으로 풀 단어가 부족해요' };
    }
    const types = Array.isArray(config.questionType) ? config.questionType : [config.questionType];
    const onlyFill = types.length > 0 && types.every(isFillInTheBlankType);
    if (onlyFill && countFillInTheBlankCandidates(studiable) < MIN_TEST_VOCABULARY_COUNT) {
      return { available: false, reason: '같은 설정으로 풀 단어가 부족해요' };
    }
    const count = Math.max(
      MIN_TEST_VOCABULARY_COUNT,
      Math.min(Number(config.count) || MIN_TEST_VOCABULARY_COUNT, matching.length),
    );
    return {
      available: true,
      state: { testType, data: { ...config, testType, count } },
    };
  }

  return { available: false, reason: null };
};
