import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useVocabulary } from '../../context/VocabularyContext';
import { Circle, X, BookOpenText, SpeakerHigh } from "@phosphor-icons/react";
import { getTextSound, prefetchTextSound } from '../../utils/common';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { ProblemDataNewBottomSheet } from '../newBottomSheet/ProblemDataNewBottomSheet';
import SkipListeningNewBottomSheet from '../newBottomSheet/SkipListeningNewBottomSheet';
import { isListeningType, isListeningSkipActive, activateListeningSkip } from '../../utils/listeningSkip';
import TtsRipple from '../common/TtsRipple';
import MemorizationStatus from "../common/MemorizationStatus";
import MemoryStateChangeBadge, {
  MEMORY_STATE_RANK as STATE_RANK,
  getMemoryStateKeyByStability,
} from "../common/MemoryStateChangeBadge";
import { vibrate } from '../../utils/osFunction';
import { playSuccessSound, playErrorSound } from '../../utils/audio';
import { getQuestionType } from '../../plugins/questionTypes';
import { logStudyQuestion } from '../../api/study';
import { getAdvanceDelay } from '../../utils/studyTiming';
import { getComboApi, protectComboApi, forfeitComboApi } from '../../api/game';
import ComboBar from './ComboBar';
import { ComboProtectNewBottomSheet } from '../newBottomSheet/ComboProtectNewBottomSheet';
import { useUser } from '../../context/UserContext';
import FarmStatusBar from '../farm/FarmStatusBar';
import { removePendingReplantIds } from '../../utils/replantPending';


// 백엔드 memory state 키(short/medium/long) → 프론트 키(leaf/plant/carrot) 정규화
const backendStateKeyMap = { unlearned: 'unlearned', short: 'leaf', medium: 'plant', long: 'carrot' };

// ── 부패 진단 문제 판별 (시안 6절) ────────────────────────────────────────────
// 삽으로 '다시 심기'를 예약한 작물은 다음 학습에서 진단 문제 1개로 만난다.
// 화면은 이 문제만 다르게 그린다 — 주황 진행바 + 채점 전부터 뜨는 삽 pill.
// 서버가 어떤 이름으로 표시를 내려주든 받도록 세 형태를 모두 본다
// (현재 /study/recommend 응답에는 표시 필드가 없다 — 보고 참고).
const isDiagnosisQuestion = (question) => {
  if (!question) return false;
  if (question.isDiagnosis) return true;
  if (question.pending_action === 'REPLANT' || question.pendingAction === 'REPLANT') return true;
  return question.questionType === 'multipleChoiceDiagnosis';
};

// 낙관적 fsrs 추정 — 백엔드 응답 도착 전까지 즉각 UI에 표시할 임시값.
// 첫 학습이라도 알고리즘 결과는 단순(정답=수일 후, 오답=1일 후)하니 추정해도 실값과 분류(leaf/plant/carrot)가 거의 같음.
// 백엔드 응답 도착 시 정확한 값으로 자연스럽게 덮어씌워짐.
const computeOptimisticFsrs = (prevFsrs, isCorrect) => {
  const wasNew = !prevFsrs || prevFsrs.state === 'new' || !prevFsrs.next_review;
  const prevStability = Number(prevFsrs?.stability) || 0;
  let stability, state, daysAhead;
  if (isCorrect) {
    if (wasNew) {
      stability = 3.13;            // FSRS 기본 GOOD 초기 stability ≈ w[2]
      state = 'learning';
      daysAhead = 3;
    } else {
      stability = Math.max(prevStability * 1.5, prevStability + 0.5, 1);
      state = 'review';
      daysAhead = Math.max(1, Math.round(stability));
    }
  } else {
    if (wasNew) {
      stability = 0.5;
      state = 'learning';
      daysAhead = 1;
    } else {
      stability = Math.max(prevStability * 0.3, 0.1);
      state = 'relearning';
      daysAhead = 1;
    }
  }
  const now = new Date();
  const next = new Date();
  next.setDate(next.getDate() + daysAhead);
  return {
    ...(prevFsrs || {}),
    state,
    stability,
    next_review: next.toISOString(),
    last_review: now.toISOString(),
    reps: (prevFsrs?.reps ?? 0) + 1,
    lapses: (prevFsrs?.lapses ?? 0) + (isCorrect ? 0 : 1),
  };
};

// meanings가 여러 개면 2~3개만 선택 (중복 제거).
// 표시 뜻은 '뜻 내용'을 시드로 결정적으로 고른다 → 정답 선택 등으로 재렌더돼도
// 옵션 텍스트가 바뀌지 않는다(기존엔 Math.random이라 재계산 시 옵션이 변경되는 버그).
const getDisplayMeanings = (meanings) => {
  if (!meanings || meanings.length === 0) return [];

  // 중복 제거
  const uniqueMeanings = [...new Set(meanings)];

  if (uniqueMeanings.length <= 2) return uniqueMeanings;

  // 내용 기반 시드 PRNG(mulberry32) — 같은 뜻 집합이면 항상 같은 결과.
  const seedStr = uniqueMeanings.join('|');
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  const rand = () => {
    h = (h + 0x6D2B79F5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const count = rand() < 0.5 ? 2 : 3;
  const shuffled = [...uniqueMeanings].sort(() => rand() - 0.5);
  return shuffled.slice(0, Math.min(count, uniqueMeanings.length));
};

// ─── 카드매칭 오답 → 사지선다 변환 (재출제용) ───────────────────────────────────
// 세션에 존재하는 모든 단어(사지선다류 문제 자신 + 카드매칭 세트의 words[])를 모아
// 오답 보기(distractor) 풀로 사용한다. 카드매칭 word 객체는 TakeTest.jsx의 setupTestQuestions에서
// 이미 meanings/origin/vocaIndexId/vocabularySheetId를 갖고 있으므로 추가 API 호출 없이 변환 가능.
const collectSessionWordPool = (questions) => {
  const pool = [];
  const seen = new Set();
  for (const q of questions ?? []) {
    if (Array.isArray(q.words)) {
      for (const w of q.words) {
        const wid = w.vocaIndexId ?? w.id;
        if (wid == null || seen.has(wid)) continue;
        seen.add(wid);
        pool.push(w);
      }
    } else {
      const wid = q.vocaIndexId ?? q.id;
      if (wid == null || seen.has(wid)) continue;
      seen.add(wid);
      pool.push(q);
    }
  }
  return pool;
};

// 카드매칭 word 객체(오답)를 사지선다(multipleChoice) question으로 변환.
// 오답 보기(distractor)는 같은 세션(다른 문제/다른 카드매칭 세트 포함)의 다른 단어 뜻을 재사용한다
// (allWords 풀에 API로 다시 접근하지 않고, 이미 로드된 testQuestions에서 충분히 구할 수 있음).
const buildMultipleChoiceFromWord = (word, pool) => {
  const wordId = word.vocaIndexId ?? word.id;
  const distractorCandidates = (pool ?? []).filter(w => {
    const wid = w.vocaIndexId ?? w.id;
    return wid !== wordId && Array.isArray(w.meanings) && w.meanings.length > 0;
  });
  const shuffledDistractors = [...distractorCandidates].sort(() => Math.random() - 0.5).slice(0, 3);
  const options = [word, ...shuffledDistractors].sort(() => Math.random() - 0.5);
  const resultIndex = options.findIndex(o => (o.vocaIndexId ?? o.id) === wordId);
  return {
    ...word,
    options,
    resultIndex: resultIndex >= 0 ? resultIndex : 0,
    questionType: 'multipleChoice',
    isCorrect: null,
    userResultIndex: null,
  };
};

const Main = ({ testQuestions, setTestQuestions, progressIndex, setProgressIndex, setPendingUpdateSheetIds, setPendingUpdateWords, testType, studySessionRef, pendingLogPromisesRef, loggedVocaIdsRef, retryCountMapRef, passedVocaIdsRef, totalUniqueVocaCountRef, cardRetryEnqueuedRef, guestMode }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const [isCorrect, setIsCorrect] = useState(null);
  const [userSelected, setUserSelected] = useState(null);
  // 진행률 바: 통과한 고유 단어 수 기준 (재출제 문제는 통과 시에만 카운트)
  const [passedCount, setPassedCount] = useState(0);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isStay, setIsStay] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakDuration, setSpeakDuration] = useState(null);
  // TTS 재생 "세대" 가드. getTextSound는 새 재생 시작 시 이전 재생을 강제 resolve하므로,
  // 등장 자동재생이 진행 중일 때 카드를 클릭하면 중단된 이전 재생의 finally가 isSpeaking을
  // false로 덮어써 음파(TtsRipple)가 사라진다. 각 재생에 세대 번호를 부여해, finally/onMeta는
  // "자신이 최신 재생일 때만" 상태를 갱신하도록 한다.
  const speakGenRef = useRef(0);
  const speakText = async (text, lang = 'en') => {
    const gen = ++speakGenRef.current;
    setIsSpeaking(true);
    setSpeakDuration(null);
    try {
      await getTextSound(text, lang, (d) => { if (gen === speakGenRef.current) setSpeakDuration(d); });
    } finally {
      if (gen === speakGenRef.current) setIsSpeaking(false);
    }
  };
  const [updateType, setUpdateType] = useState(null); // SM-2 업데이트 타입
  const startTimeRef = useRef(null);
  const endTimeRef = useRef(null);
  // ── 전역 콤보 (AI 추천 테스트 전용) ──
  const { userProfile, setUserProfile } = useUser();
  const [combo, setCombo] = useState(null);
  const comboSessionRef = useRef({ maxCombo: 0, bestUpdated: false, best: 0 });
  const comboPopupOpenRef = useRef(false);
  // 콤보 보존 팝업이 열려 있는 동안 대기시킬 카드 채점 로그 큐 (cardMatch/cardMatchListening 전용).
  // 백엔드 combo 로직(combo.py:163-167)이 AT_RISK 상태에서 새 로그가 들어오면 자동 포기시키므로,
  // 팝업 응답을 기다리는 카드 이후의 로그는 팝업이 닫힐 때까지 순서대로 큐잉해둔다.
  const pendingCardLogQueueRef = useRef([]);
  const isFlushingCardLogQueueRef = useRef(false);
  // 게스트 온보딩 맛보기(testType 'today' + guestMode)에서도 콤보 표시를 켠다.
  // 단, 아래 콤보 소스는 서버(quick)와 로컬(게스트 온보딩)로 분기된다 — isGuestCombo 참고.
  const isComboMode = testType === 'quick' || (guestMode && testType === 'today');
  // 게스트 온보딩 전용 로컬 콤보 — 서버 API(getComboApi/protect/forfeit)·보석 개념을 전혀 사용하지 않고
  // 클라이언트에서만 연속 정답을 카운트한다(정답 +1, 오답 0으로 리셋). 재출제(isRetry) 문제는
  // 이미 한 번 틀린 단어를 다시 푸는 것이라 스트릭에 반영하지 않는다(서버 로깅이 첫 시도만 집계하는 것과 동일한 원칙).
  const isGuestCombo = isComboMode && !!guestMode;
  const localComboCountRef = useRef(0);
  const bumpLocalCombo = (isCorrectAnswer) => {
    if (!isGuestCombo) return;
    localComboCountRef.current = isCorrectAnswer ? localComboCountRef.current + 1 : 0;
    setCombo({ current: localComboCountRef.current });
  };
  // 마지막 enqueueRetry가 큐에 실제로 삽입했는지 여부 저장 (세션 종료 판정 보정용)
  const lastRetryEnqueuedRef = useRef(false);
  // enqueueRetry가 실제로 큐에 삽입에 성공할 때마다 누적 증가하는 카운터.
  // handlePluginComplete(카드매칭 세트 완료 콜백)는 한 번에 여러 단어를 처리할 수 있어
  // boolean 플래그로는 "이번 호출에서 몇 개가 새로 재출제됐는지" 표현이 안 되므로 카운터로 추적한다.
  const retryEnqueueCounterRef = useRef(0);
  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { pushNewBottomSheet, pushAwaitNewBottomSheet } = useNewBottomSheetActions();
  // 듣기 문제 건너뛰기 활성 여부 (localStorage 기반, 5분간 유지)
  const [listeningSkipActive, setListeningSkipActive] = useState(() => isListeningSkipActive());
  const { updateWord, updateRecentStudy, recentStudy, setRecentStudy, updateWordState, updateRecentStudyState } = useVocabulary();
  const [tempSm2, setTempSm2] = useState(null);
  const [prevMemoryState, setPrevMemoryState] = useState(null);
  const [memoryStateChange, setMemoryStateChange] = useState(null);
  // ── 당근 농장 V2 상태 바 ──
  // /study/log 응답의 data.farm 을 그대로 담는다. 구버전 응답(payload 없음)이면 null 로 남고
  // 화면은 기존 암기상태 배지로 폴백한다 — 응답이 없을 때 화면이 비면 안 된다.
  // 응답이 늦게 도착해 이미 다음 문제로 넘어갔을 수 있어 vocaId 를 함께 들고 비교한다.
  const [farmStatus, setFarmStatus] = useState(null);
  // 카드 매칭은 카드마다 따로 채점되므로 단어별로 보관한다.
  const [cardFarmByWordId, setCardFarmByWordId] = useState({});

  const navigate = useNavigate();

  // ─── 재출제 유틸 ─────────────────────────────────────────────────────────────
  // 오답 문제를 큐의 맨 마지막에 재삽입 (마지막 슬라이드로 재출제)
  // 재출제용 문제는 options를 셔플해서 새 객체로 생성
  const enqueueRetry = (currentIdx, question) => {
    const retryMap = retryCountMapRef?.current;
    if (!retryMap) return false; // ref 없으면 재출제 스킵

    const vocaId = question.vocaIndexId ?? question.id;
    const prevCount = retryMap.get(vocaId) ?? 0;
    const MAX_RETRY = 10;
    if (prevCount >= MAX_RETRY) return false; // 상한 초과 → 재출제 안 함

    retryMap.set(vocaId, prevCount + 1);

    // options 셔플 + resultIndex 재계산
    let retryQuestion;
    if (Array.isArray(question.options) && question.options.length > 0) {
      const correctOption = question.options[question.resultIndex];
      const shuffled = [...question.options].sort(() => Math.random() - 0.5);
      const newResultIndex = shuffled.findIndex(
        (opt) => (opt.id ?? opt.vocaIndexId) === (correctOption.id ?? correctOption.vocaIndexId)
      );
      retryQuestion = {
        ...question,
        options: shuffled,
        resultIndex: newResultIndex >= 0 ? newResultIndex : question.resultIndex,
        isCorrect: null,
        userResultIndex: null,
        isRetry: true, // 재출제 표시 (로깅 스킵 판단용)
      };
    } else {
      retryQuestion = {
        ...question,
        isCorrect: null,
        userResultIndex: null,
        isRetry: true,
      };
    }

    // 큐의 맨 마지막에 삽입 (재출제분은 모든 신규 문제를 다 푼 뒤 마지막에 등장)
    setTestQuestions((prev) => {
      const next = [...prev];
      next.splice(next.length, 0, retryQuestion);
      return next;
    });
    retryEnqueueCounterRef.current += 1;
    return true;
  };

  // ── 콤보: 학습 진입 시 현재 상태 로드 ──
  // - 로그인 콤보(quick): 서버 /combo 상태를 조회
  // - 게스트 온보딩 콤보: 서버 호출 없이 로컬 카운터만 0으로 초기화 (보석 개념 없음)
  useEffect(() => {
    if (!isComboMode) return;
    if (isGuestCombo) {
      localComboCountRef.current = 0;
      setCombo({ current: 0 });
      return;
    }
    let mounted = true;
    (async () => {
      const res = await getComboApi();
      if (mounted && res?.code === 200) setCombo(res.data);
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isComboMode, isGuestCombo]);

  // 콤보 세션 요약을 결과 화면(StudyResult)에 전달 (sessionStorage 경유)
  const persistComboSummary = () => {
    try {
      sessionStorage.setItem('heyvoca_combo_summary', JSON.stringify({
        sessionId: studySessionRef?.current ?? null,
        ...comboSessionRef.current,
      }));
    } catch (e) { /* 저장 실패는 무시 */ }
  };

  // /study/log 응답의 combo payload 처리 — 상태 갱신 + 위기 시 보호 팝업
  const handleComboPayload = async (payload) => {
    if (!payload) return;
    const s = comboSessionRef.current;
    s.maxCombo = Math.max(s.maxCombo, payload.current ?? 0, payload.at_risk_combo ?? 0);
    s.bestUpdated = s.bestUpdated || !!payload?.events?.best_updated;
    s.best = payload.best ?? s.best;
    persistComboSummary();
    setCombo(payload);

    if (payload.status !== 'AT_RISK' || comboPopupOpenRef.current) return;
    comboPopupOpenRef.current = true;
    try {
      const choice = await pushAwaitNewBottomSheet(
        ComboProtectNewBottomSheet,
        {
          atRiskCombo: payload.at_risk_combo,
          protectCost: payload.protect_cost,
          gemCnt: userProfile?.gem_cnt ?? 0,
        },
        { isBackdropClickClosable: true, isDragToCloseEnabled: true }
      );
      if (choice === 'protect') {
        const res = await protectComboApi();
        if (res?.code === 200) {
          setCombo(res.data);
          if (typeof res.data.gem_cnt === 'number' && setUserProfile) {
            setUserProfile(prev => ({ ...prev, gem_cnt: res.data.gem_cnt }));
          }
          return;
        }
        // 보호 실패(보석 부족/네트워크) → 포기로 폴백
      }
      const res = await forfeitComboApi();
      if (res?.code === 200) setCombo(res.data);
    } finally {
      comboPopupOpenRef.current = false;
      // 팝업 응답 처리 완료 → 대기 중이던 카드 채점 로그를 순서대로 전송 재개
      flushCardLogQueue();
    }
  };

  // 첫 시도 1회만 /study/log를 보내는 래퍼
  // isRetry=true인 재출제 문제는 로깅 스킵
  const logIfFirstAttempt = (question, payload) => {
    if (!studySessionRef?.current) return;
    if (!loggedVocaIdsRef?.current) return;
    const vocaId = question.vocaIndexId ?? question.id;
    if (question.isRetry || loggedVocaIdsRef.current.has(vocaId)) {
      // 재출제 시도 — 로깅 스킵
      return;
    }
    loggedVocaIdsRef.current.add(vocaId);
    // 학습 시안 §6 — 삽은 누른 순간이 아니라 **진단 정답**에서 빠진다.
    // 확정은 서버(restore.complete_diagnosis)가 하고, 여기서는 화면 표시용 예약 기록만 지운다.
    if (isDiagnosisQuestion(question) && payload.was_correct) {
      removePendingReplantIds([vocaId]);
    }
    const promise = logStudyQuestion(payload)
      .then((logRes) => {
        if (logRes?.data?.combo) handleComboPayload(logRes.data.combo);
        // 농장 상태 바 payload — 없으면(구버전 응답) 기존 암기상태 배지가 그대로 보인다
        if (logRes?.data?.farm) {
          setFarmStatus({
            ...logRes.data.farm,
            vocaId,
            qIndex: progressIndex,
            wasCorrect: !!payload.was_correct,
          });
        }
        if (logRes?.data?.fsrs) {
          const idx = testQuestions.findIndex(
            (q) => (q.vocaIndexId ?? q.id) === vocaId && !q.isRetry
          );
          if (idx !== -1) {
            testQuestions[idx].fsrs = logRes.data.fsrs;
            // 결과 화면 '암기 상태 변화' 리스트용 — 백엔드 확정값으로 기록
            testQuestions[idx].nextMemoryStateKey = getMemoryStateKeyByStability(
              logRes.data.fsrs.stability ?? 0,
              logRes.data.fsrs.state
            );
            setTestQuestions([...testQuestions]);
          }
          if (logRes.data.memory_state_change) {
            const fromKey = backendStateKeyMap[logRes.data.memory_state_change.from] ?? logRes.data.memory_state_change.from;
            const toKey = backendStateKeyMap[logRes.data.memory_state_change.to] ?? logRes.data.memory_state_change.to;
            if (fromKey && toKey && fromKey !== toKey) {
              setMemoryStateChange({
                toKey,
                dir: (STATE_RANK[toKey] ?? 0) > (STATE_RANK[fromKey] ?? 0) ? 'up' : 'down',
              });
            }
          } else {
            const stability = logRes.data.fsrs.stability ?? 0;
            const newStateKey = getMemoryStateKeyByStability(stability, logRes.data.fsrs.state);
            if (prevMemoryState && prevMemoryState !== newStateKey) {
              setMemoryStateChange({
                toKey: newStateKey,
                dir: (STATE_RANK[newStateKey] ?? 0) > (STATE_RANK[prevMemoryState] ?? 0) ? 'up' : 'down',
              });
            }
          }
        }
      })
      .catch((e) => console.warn('[FSRS] logStudyQuestion 실패:', e));
    if (pendingLogPromisesRef) pendingLogPromisesRef.current.push(promise);
  };

  // 단어 통과 처리 — passedVocaIds에 추가하고 진행률 카운트 증가
  // 이미 통과된 단어는 카운트하지 않음
  const markVocaPassed = (vocaId) => {
    if (!passedVocaIdsRef?.current) return;
    if (passedVocaIdsRef.current.has(vocaId)) return;
    passedVocaIdsRef.current.add(vocaId);
    setPassedCount((prev) => prev + 1);
  };

  // 세션의 총 고유 단어 수 (분모)
  const totalUniqueCount = totalUniqueVocaCountRef?.current || testQuestions.length;

  // 현재 문제의 옵션들에 대해 displayMeanings를 한 번만 계산
  const optionsWithDisplayMeanings = useMemo(() => {
    if (!testQuestions[progressIndex] || !testQuestions[progressIndex].options) {
      return [];
    }
    return testQuestions[progressIndex].options.map(option => ({
      ...option,
      displayMeanings: getDisplayMeanings(option.meanings)
    }));
  }, [progressIndex, testQuestions]);

  useEffect(() => {
    console.log("testType,", testType);
  }, [])

  // 문제가 바뀔 때마다 듣기 건너뛰기 만료 여부 재확인 (만료되면 버튼 다시 노출)
  useEffect(() => {
    if (listeningSkipActive && !isListeningSkipActive()) setListeningSkipActive(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressIndex])

  // 문제가 변경될 때마다 텍스트 읽기 (cardMatch는 제외 - 단어 클릭 시 재생)
  useEffect(() => {
    setIsSpeaking(false);
    if (testQuestions[progressIndex]) {
      const question = testQuestions[progressIndex];
      if (!['cardMatch', 'cardMatchListening', 'fillInTheBlank'].includes(question.questionType) && question.origin) {
        speakText(question.origin, "en");
      }

      // 다음 1~2문제의 음성을 미리 받아 blob 캐시에 채워둔다 → 전환 시 즉시 재생.
      for (let d = 1; d <= 2; d++) {
        const nq = testQuestions[progressIndex + d];
        if (!nq) break;
        if (nq.origin) prefetchTextSound(nq.origin, 'en');
        if (Array.isArray(nq.words)) {
          nq.words.forEach(w => { if (w?.origin) prefetchTextSound(w.origin, 'en'); });
        }
      }
      const stability = question.fsrs?.stability ?? 0;
      const fsrsState = question.fsrs?.state ?? null;
      const prevKey = getMemoryStateKeyByStability(stability, fsrsState);
      setPrevMemoryState(prevKey);
      question.prevMemoryStateKey = prevKey;
      if (Array.isArray(question.words)) {
        question.words.forEach(w => {
          const wStability = w.fsrs?.stability ?? 0;
          const wState = w.fsrs?.state ?? null;
          w.prevMemoryStateKey = getMemoryStateKeyByStability(wStability, wState);
        });
      }
      setMemoryStateChange(null);
      setFarmStatus(null);
      setCardFarmByWordId({});
    }
    startTimeRef.current = Date.now();
    endTimeRef.current = null; // 항상 초기화!
  }, [progressIndex]);

  // 문제 시작 시
  useEffect(() => {

  }, [progressIndex]);

  // 안전성 체크: testQuestions가 비어있거나 progressIndex가 범위를 벗어난 경우.
  // 훅을 전부 부른 **뒤에** 빠져나간다 — 훅보다 위에 두면 이 분기가 실제로 걸리는 순간
  // 렌더마다 훅 개수가 달라져 "Rendered more hooks than during the previous render"로
  // 터진다. 안내 문구를 띄우려고 만든 방어 코드가 오히려 화면을 죽이던 자리였다.
  if (!testQuestions || testQuestions.length === 0 || !testQuestions[progressIndex]) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[16px] text-[#999]">문제를 불러오는 중...</p>
      </div>
    );
  }

  // React Compiler가 자동으로 useCallback 처리
  // 문제 선택지 선택 시
  const handleOptionClick = (index, option) => {
    if (isAnswered) return;
    setUserSelected(index);
    handleClickExamOption(index, option);
  }

  // 채점 직후 즉시 표시할 낙관적 fsrs + 복습 예정일 고정 + 암기상태 변경 알림.
  // predictedReview(백엔드 사전 계산)가 있으면 정확값으로 displayNextReview를 고정해
  // 이후 /study/log 응답에도 흔들리지 않게 한다(깜빡임 제거). 없으면 낙관적 추정으로 폴백.
  const applyOptimisticGrade = (idx, isCorrectAnswer) => {
    const q = testQuestions[idx];
    const predicted = q.predictedReview?.[isCorrectAnswer ? 'correct' : 'wrong'];
    const optimistic = computeOptimisticFsrs(q.fsrs, isCorrectAnswer);
    q.displayNextReview = predicted?.next_review ?? optimistic.next_review;
    q.fsrs = optimistic; // 추정 fsrs — 백엔드 응답 도착 시 갱신(배지/홈 카운터용)
    setTestQuestions([...testQuestions]);
    const dispStability = predicted?.stability ?? optimistic.stability;
    const dispState = predicted?.state ?? optimistic.state;
    const newStateKey = getMemoryStateKeyByStability(dispStability, dispState);
    // 결과 화면 '암기 상태 변화' 리스트용 낙관값 — 백엔드 응답 도착 시 확정값으로 덮임
    q.nextMemoryStateKey = newStateKey;
    if (prevMemoryState && prevMemoryState !== newStateKey) {
      setMemoryStateChange({
        toKey: newStateKey,
        dir: (STATE_RANK[newStateKey] ?? 0) > (STATE_RANK[prevMemoryState] ?? 0) ? 'up' : 'down',
      });
    }
  }

  // React Compiler가 자동으로 useCallback 처리
  // 아래 버튼 클릭 시 (fillInTheBlank 등 수동 넘기기 경로)
  const handleClickNext = async () => {
    if (userSelected === null) return;
    if (isFetching) return;
    const timeTakenSec = Math.round((endTimeRef.current - startTimeRef.current) / 1000);
    if (isStay) {
      setUpdateRecentStudyStateAndStatus();
      return;
    };
    if (isAnswered) return;
    endTimeRef.current = Date.now();
    const question = testQuestions[progressIndex];
    const resultIndex = question.resultIndex;
    const isCorrectAnswer = resultIndex === userSelected;
    let q = 0;
    if (isCorrectAnswer) {
      vibrate({ type: 'notificationSuccess' });
      playSuccessSound();
      setIsCorrect(true);
      question.isCorrect = true;
      question.userResultIndex = userSelected;
      q = timeTakenSec <= 5 ? 5 : timeTakenSec <= 10 ? 4 : timeTakenSec <= 15 ? 3 : 0;
    } else {
      vibrate({ type: 'notificationError' });
      playErrorSound();
      setIsCorrect(false);
      question.isCorrect = false;
      question.userResultIndex = userSelected;
      q = 0;
    }

    // 낙관적 UI: 답변 직후 즉시 임시 fsrs + 암기상태 변경 알림
    applyOptimisticGrade(progressIndex, isCorrectAnswer);

    // 첫 시도만 /study/log 로깅 (재출제는 스킵)
    logIfFirstAttempt(question, {
      session_id: studySessionRef?.current,
      user_voca_id: question.vocaIndexId ?? question.id,
      user_voca_book_id: question.vocabularySheetId ?? null,
      question_type: question.questionType,
      was_correct: isCorrectAnswer,
      time_taken_ms: timeTakenSec * 1000,
      client_now: new Date().toISOString(),
    });

    // 게스트 온보딩 로컬 콤보 — 첫 시도만 반영 (재출제는 스트릭에 영향 없음)
    if (!question.isRetry) bumpLocalCombo(isCorrectAnswer);

    if (studySessionRef?.current == null) {
      // 방어 가드: 세션이 없는 비정상 경로
      question.isCorrect = isCorrectAnswer;
    }

    // 재출제 큐 삽입 (오답인 경우)
    lastRetryEnqueuedRef.current = false;
    if (!isCorrectAnswer) {
      lastRetryEnqueuedRef.current = enqueueRetry(progressIndex, question);
    }

    setIsStay(true);
    setIsAnswered(true);
  }

  // React Compiler가 자동으로 useCallback 처리
  // 시험 모드에서 문제 선택지 선택 시 (multipleChoice/Listening 자동 넘기기 경로)
  const handleClickExamOption = (index, option) => {

    endTimeRef.current = Date.now();
    const timeTakenMs = endTimeRef.current - startTimeRef.current;
    const question = testQuestions[progressIndex];
    const resultIndex = question.resultIndex;
    const isCorrectAnswer = resultIndex === index;
    let q = 0;
    if (isCorrectAnswer) {
      vibrate({ type: 'notificationSuccess' });
      playSuccessSound();
      setIsCorrect(true);
      question.isCorrect = true;
      question.userResultIndex = index;
      q = timeTakenMs <= 5000 ? 5 : timeTakenMs <= 10000 ? 4 : timeTakenMs <= 15000 ? 3 : 0;
    } else {
      vibrate({ type: 'notificationError' });
      playErrorSound();
      setIsCorrect(false);
      question.isCorrect = false;
      question.userResultIndex = index;
      q = 0;
    }

    // 낙관적 UI: 답변 직후 즉시 임시 fsrs + 암기상태 변경 알림
    applyOptimisticGrade(progressIndex, isCorrectAnswer);

    // 첫 시도만 /study/log 로깅 (재출제는 스킵)
    logIfFirstAttempt(question, {
      session_id: studySessionRef?.current,
      user_voca_id: question.vocaIndexId ?? question.id,
      user_voca_book_id: question.vocabularySheetId ?? null,
      question_type: question.questionType,
      was_correct: isCorrectAnswer,
      time_taken_ms: timeTakenMs,
      client_now: new Date().toISOString(),
    });

    // 게스트 온보딩 로컬 콤보 — 첫 시도만 반영 (재출제는 스트릭에 영향 없음)
    if (!question.isRetry) bumpLocalCombo(isCorrectAnswer);

    if (studySessionRef?.current == null) {
      // 방어 가드: 세션이 없는 비정상 경로
      question.isCorrect = isCorrectAnswer;
    }

    // 재출제 큐 삽입 (오답인 경우)
    lastRetryEnqueuedRef.current = false;
    if (!isCorrectAnswer) {
      lastRetryEnqueuedRef.current = enqueueRetry(progressIndex, question);
    }

    setIsAnswered(true);

    // 오답일 때는 정답·해설을 충분히 인지하도록 전환을 더 천천히 (정답 1초 / 오답 2.5초)
    setTimeout(() => {
      setUpdateRecentStudyStateAndStatus();
    }, getAdvanceDelay(isCorrectAnswer));
  }


  // React Compiler가 자동으로 useCallback 처리
  // 문제 읽기
  const handleClickTTS = async () => {
    const question = testQuestions[progressIndex];
    await speakText(question.origin, "en");
  }

  // 듣기 문제 건너뛰기: 안내 바텀시트 확인 → 5분 활성화 + 진행 중 미답 듣기 문제를 일반 유형으로 즉시 변환
  const handleSkipListening = async () => {
    const result = await pushAwaitNewBottomSheet(SkipListeningNewBottomSheet, {});
    if (!result?.confirmed) return;
    activateListeningSkip();
    setListeningSkipActive(true);
    setTestQuestions(prev => prev.map((q, idx) => {
      if (idx < progressIndex) return q; // 이미 푼 문제는 유지
      if (idx === progressIndex && isAnswered) return q; // 채점 완료된 현재 문제는 그대로 유지
      if (q.questionType === 'cardMatchListening') return { ...q, questionType: 'cardMatch' };
      if (q.questionType === 'multipleChoiceListening') return { ...q, questionType: 'multipleChoice' };
      return q;
    }));
  }

  // React Compiler가 자동으로 useCallback 처리
  // 문제 힌트 데이터 표시
  const handleClickProblemHintData = () => {
    const question = testQuestions[progressIndex];
    pushNewBottomSheet(
      ProblemDataNewBottomSheet,
      {
        options: question.options,
        resultIndex: question.resultIndex
      },
      {
        isBackdropClickClosable: true,
        isDragToCloseEnabled: false
      }
    );
  }

  // React Compiler가 자동으로 useCallback 처리
  // 문제 완료 시 처리 (multipleChoice 수동 넘기기 경로)
  const setUpdateRecentStudyStateAndStatus = () => {
    const question = testQuestions[progressIndex];
    const sheetId = question.vocabularySheetId;
    const wordId = question.id;
    const vocaId = question.vocaIndexId ?? question.id;
    setIsFetching(true);

    const updateData = {
      fsrs: question.fsrs,
      isCorrect: question.isCorrect,
      updatedAt: new Date().toISOString(),
    };

    updateWordState(sheetId, wordId, updateData);
    setIsFetching(false);
    setPendingUpdateSheetIds(prev => new Set(prev.add(sheetId)));
    setPendingUpdateWords(prev => {
      const newMap = new Map(prev);
      newMap.set(wordId, { sheetId, wordId, updateData });
      return newMap;
    });

    // 정답 시 통과 처리 (진행률 카운트 증가)
    if (question.isCorrect) {
      markVocaPassed(vocaId);
    }

    // 세션 완료 판정:
    // 1차: "통과된 고유 단어 수 >= 전체 고유 단어 수"이면 정상 종료.
    // 2차(안전망): progressIndex+1이 큐 끝에 닿았는데 done이 아닌 경우 강제 종료.
    //   — enqueueRetry는 setTestQuestions(함수형 업데이트)로 비동기 삽입하므로
    //     이 클로저가 보는 testQuestions.length는 삽입 전 값이다.
    //     lastRetryEnqueuedRef.current가 true이면 큐에 +1이 삽입됐으므로 보정한다.
    //   — 이 경로에서도 isSessionDone=true 처리되어 결과 화면으로 이동한다.
    const currentPassedCount = passedVocaIdsRef?.current?.size ?? 0;
    const targetCount = totalUniqueVocaCountRef?.current || testQuestions.length;
    const nextIndex = progressIndex + 1;
    const adjustedQueueLen = testQuestions.length + (lastRetryEnqueuedRef.current ? 1 : 0);
    const isQueueExhausted = nextIndex >= adjustedQueueLen;
    const isSessionDone = currentPassedCount >= targetCount || isQueueExhausted;

    updateRecentStudyState({
      [testType]: {
        ...recentStudy[testType],
        progress_index: isSessionDone ? null : nextIndex,
        status: isSessionDone ? "end" : "learning",
        study_data: testQuestions,
        updated_at: new Date().toISOString(),
      }
    });
    if (!isSessionDone) {
      setProgressIndex(nextIndex);
      setIsCorrect(null);
      setUserSelected(null);
      setIsAnswered(false);
      setIsStay(false);
      setUpdateType(null);
      setMemoryStateChange(null);
    }
  };

  // 카드 1장 채점 로그 전송(실제 /study/log 호출 + combo/fsrs 반영). 큐에서 꺼내 호출하거나
  // 팝업이 열려있지 않을 때 즉시 호출한다.
  const sendCardLog = (payload, { sheetId, wordId, currentQuestion, setWords }) => {
    return logStudyQuestion(payload)
      .then(logRes => {
        if (logRes?.data?.combo) handleComboPayload(logRes.data.combo);
        // 농장 상태 바 payload — 카드 매칭은 카드(단어)마다 따로 붙는다
        if (logRes?.data?.farm) {
          setCardFarmByWordId(prev => ({
            ...prev,
            [wordId]: { ...logRes.data.farm, wasCorrect: !!payload.was_correct },
          }));
        }
        if (logRes?.data?.fsrs) {
          updateWordState(sheetId, wordId, { fsrs: logRes.data.fsrs });
          if (Array.isArray(setWords)) {
            const target = setWords.find(w => w.id === wordId);
            if (target) target.fsrs = logRes.data.fsrs;
          }
          if (currentQuestion?.id === wordId) currentQuestion.fsrs = logRes.data.fsrs;
          setTestQuestions([...testQuestions]);
        }
      })
      .catch(e => console.warn('[FSRS] logStudyQuestion(card) 실패:', e));
  };

  // 콤보 보존 팝업이 열려 있는 동안 큐잉된 카드 로그를 순서대로(직렬로) 전송한다.
  // 팝업이 떠 있는데(comboPopupOpenRef) 다음 로그가 도착하면 백엔드가 AT_RISK 콤보를
  // 자동 포기시키므로(combo.py:163-167), 팝업이 닫힐 때까지는 큐에서 꺼내지 않는다.
  // 큐에서 꺼낸 로그 자체가 다시 AT_RISK를 유발해 팝업을 새로 띄우면(handleComboPayload가
  // comboPopupOpenRef를 동기적으로 true로 세팅) while 조건에서 즉시 멈추고, 그 팝업이
  // 닫힐 때 다시 flushCardLogQueue가 호출되어 이어서 처리된다.
  const flushCardLogQueue = async () => {
    if (isFlushingCardLogQueueRef.current) return; // 중복 flush 방지
    isFlushingCardLogQueueRef.current = true;
    try {
      while (pendingCardLogQueueRef.current.length > 0 && !comboPopupOpenRef.current) {
        const job = pendingCardLogQueueRef.current.shift();
        await job();
      }
    } finally {
      isFlushingCardLogQueueRef.current = false;
    }
  };

  // 플러그인 컴포넌트용 완료 콜백 (cardMatch, fillInTheBlank 등)
  // 카드 1장 결과 처리(로그+콤보+농장+fsrs+통과/재출제) — 카드 채점 즉시/세트 완료 공용.
  // cardMatch는 카드 맞추기 UI 특성상 단어별 즉시 반복 재시도가 없다(세트 단위 1회 진행).
  // 정답 카드만 즉시 통과 처리(markVocaPassed)하고, 오답 카드는 사지선다(multipleChoice) 문제로
  // 변환해 enqueueRetry로 큐 맨 끝에 재출제한다(맞출 때까지 반복, 통과 처리하지 않음).
  // loggedVocaIdsRef로 중복 로깅 방지, cardRetryEnqueuedRef로 동일 단어의 중복 재출제
  // (카드 즉시 콜백 onCardMatched + 세트 완료 콜백 onComplete 이중 호출) 방지.
  const processCardWord = ({ sheetId, wordId, updateData, isCorrect: wordIsCorrect, timeTakenMs }, currentQuestion, setWords, questionType) => {
    if (wordId == null) return;
    updateWordState(sheetId, wordId, updateData);
    setPendingUpdateSheetIds(prev => new Set(prev.add(sheetId)));
    setPendingUpdateWords(prev => {
      const map = new Map(prev);
      map.set(wordId, { sheetId, wordId, updateData });
      return map;
    });
    let target = null;
    if (Array.isArray(setWords)) {
      target = setWords.find(w => w.id === wordId);
      if (target) target.isCorrect = wordIsCorrect ?? target.isCorrect;
    }

    // 게스트 온보딩 로컬 콤보 — 카드매칭은 항상 첫 시도(오답 카드는 사지선다로 재출제되어 이 경로를 다시 타지 않음)
    bumpLocalCombo(!!wordIsCorrect);

    if (studySessionRef?.current != null && loggedVocaIdsRef?.current && !loggedVocaIdsRef.current.has(wordId)) {
      loggedVocaIdsRef.current.add(wordId);
      const payload = {
        session_id: studySessionRef.current,
        user_voca_id: wordId,
        user_voca_book_id: sheetId ?? null,
        question_type: questionType,
        was_correct: !!wordIsCorrect,
        time_taken_ms: typeof timeTakenMs === 'number' ? timeTakenMs : 5000,
        client_now: new Date().toISOString(),
      };

      // pendingLogPromisesRef에는 실제 전송 시점과 무관하게(큐잉되더라도) 즉시 등록해야
      // 세션 종료 시(updateVocabularySheetAndRecentStudyData) 큐에 남은 로그까지 기다릴 수 있다.
      let resolvePending;
      const pendingPromise = new Promise((resolve) => { resolvePending = resolve; });
      if (pendingLogPromisesRef) pendingLogPromisesRef.current.push(pendingPromise);

      const job = () => sendCardLog(payload, { sheetId, wordId, currentQuestion, setWords }).finally(resolvePending);

      if (comboPopupOpenRef.current) {
        // 콤보 보존 팝업 응답 대기 중 — 이 카드 로그는 큐에 쌓아두고 팝업이 닫힌 뒤 전송
        pendingCardLogQueueRef.current.push(job);
      } else {
        job();
      }
    }

    if (wordIsCorrect) {
      markVocaPassed(wordId);
      return;
    }

    // 오답 카드: 통과 처리하지 않음(passedVocaIdsRef에 추가 안 함) → 세션이 재출제 소진까지 유지됨.
    // 사지선다로 변환해 큐 끝에 재출제 (단어당 1회만 — 즉시 콜백/세트 완료 콜백 이중 호출 방지)
    if (cardRetryEnqueuedRef?.current && !cardRetryEnqueuedRef.current.has(wordId)) {
      cardRetryEnqueuedRef.current.add(wordId);
      const wordObj = target ?? currentQuestion?.words?.find(w => w.id === wordId);
      if (wordObj) {
        const pool = collectSessionWordPool(testQuestions);
        const retryQuestion = buildMultipleChoiceFromWord(wordObj, pool);
        enqueueRetry(progressIndex, retryQuestion);
      }
    }
  };

  // 카드 1장 채점 즉시 호출 — 콤보/프로그래스가 슬라이드 끝이 아니라 바로 반영되도록.
  const handleCardMatched = (result) => {
    if (!result || result.wordId == null) return;
    const currentQuestion = testQuestions[progressIndex];
    processCardWord(result, currentQuestion, currentQuestion?.words, currentQuestion?.questionType);
  };

  const handlePluginComplete = (results) => {
    const currentQuestion = testQuestions[progressIndex];
    const setWords = currentQuestion.words;
    const questionType = currentQuestion.questionType;

    // 각 단어 처리(카드 채점 시 이미 처리된 단어는 loggedVocaIdsRef/passed Set/cardRetryEnqueuedRef로 중복 방지)
    const retryCountBefore = retryEnqueueCounterRef.current;
    results.forEach(r => processCardWord(r, currentQuestion, setWords, questionType));
    const retriesEnqueuedThisCall = retryEnqueueCounterRef.current - retryCountBefore;

    currentQuestion.isCorrect = results.every(r => r.isCorrect);

    const currentPassedCount = passedVocaIdsRef?.current?.size ?? 0;
    const targetCount = totalUniqueVocaCountRef?.current || testQuestions.length;
    const nextIndex = progressIndex + 1;
    // 큐 소진 안전망: 더 이상 출제할 문제가 없으면(다음 인덱스가 큐 끝) 세션 종료 보장.
    // — enqueueRetry는 setTestQuestions(함수형 업데이트)로 비동기 삽입하므로 이 클로저가 보는
    //   testQuestions.length는 삽입 전 값일 수 있다. 카드는 대부분 onCardMatched(즉시 콜백)에서
    //   먼저 재출제되어 이 시점엔 이미 반영돼 있지만, 혹시 이번 배치 호출(onComplete)에서
    //   새로 재출제된 게 있다면(retriesEnqueuedThisCall) 그만큼 큐 길이를 보정해
    //   재출제 슬라이드가 추가되기 전에 세션이 끝나버리지 않도록 한다.
    const isQueueExhausted = nextIndex >= (testQuestions.length + retriesEnqueuedThisCall);
    const isSessionDone = currentPassedCount >= targetCount || isQueueExhausted;

    updateRecentStudyState({
      [testType]: {
        ...recentStudy[testType],
        progress_index: isSessionDone ? null : nextIndex,
        status: isSessionDone ? "end" : "learning",
        study_data: testQuestions,
        updated_at: new Date().toISOString(),
      }
    });

    if (!isSessionDone) {
      setProgressIndex(nextIndex);
      setIsCorrect(null);
      setUserSelected(null);
      setIsAnswered(false);
      setIsStay(false);
      setUpdateType(null);
      setMemoryStateChange(null);
    }
  };

  const slideVariants = {
    enter: (direction) => ({
      x: direction > 0 ? '100%' : '-100%',
      opacity: 0
    }),
    center: {
      x: 0,
      opacity: 1
    },
    exit: (direction) => ({
      x: direction < 0 ? '100%' : '-100%',
      opacity: 0
    })
  };

  // 성능 최적화를 위한 transition 설정
  const optimizedTransition = {
    duration: 0.2,
    ease: [0.4, 0, 0.2, 1] // cubic-bezier for smoother animation
  };

  // 플러그인 컴포넌트가 있으면 동적 렌더링 (cardMatch 등)
  // 진행률 바: 통과 고유 단어 수 / 전체 고유 단어 수
  // totalUniqueCount는 세션 시작 시 확정된 값 (재출제 문제가 추가돼도 분모는 고정)
  const totalWordCount = totalUniqueCount;

  const currentPlugin = getQuestionType(testQuestions[progressIndex]?.questionType);

  // 부패 진단(시안 6절) — 진행바가 주황이 되고, 채점 전부터 삽 pill 이 붙는다.
  const isDiagnosis = isDiagnosisQuestion(testQuestions[progressIndex]);
  const progressFillClass = isDiagnosis ? 'bg-crop-carrot' : 'bg-primary-main-600';

  // 농장 상태 바 노출 여부 — 지금 보고 있는 문제의 payload 일 때만 띄운다(응답 지연 대비).
  // payload 가 없으면 기존 암기상태 배지·복습 예정일 배지가 그대로 보인다.
  const currentVocaId =
    testQuestions[progressIndex]?.vocaIndexId ?? testQuestions[progressIndex]?.id;
  const showFarmBar =
    isCorrect !== null &&
    !!farmStatus &&
    farmStatus.qIndex === progressIndex &&
    farmStatus.vocaId === currentVocaId;

  // 듣기 문제 건너뛰기 버튼 — 현재 문제가 듣기 유형이고, 아직 건너뛰기 비활성이면 노출
  // (채점 후에도 유지해 레이아웃 점프 방지 — 누르면 이후 문제들을 일반 유형으로 전환)
  const showListeningSkip =
    !listeningSkipActive &&
    isListeningType(testQuestions[progressIndex]?.questionType);
  const listeningSkipButton = showListeningSkip ? (
    <div className="flex-shrink-0 flex justify-center pt-[10px]">
      <motion.button
        type="button"
        onClick={() => { vibrate({ duration: 5 }); handleSkipListening(); }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        className="
          flex items-center justify-center
          px-[16px] py-[8px] rounded-[10px]
          text-[14px] font-[600]
          text-layout-gray-400 dark:text-layout-gray-300
        "
      >
        듣기 일시 중단
      </motion.button>
    </div>
  ) : null;

  if (currentPlugin?.component) {
    const PluginComponent = currentPlugin.component;
    return (
      <motion.div
        className="
          flex flex-col
          h-[calc(100vh-var(--current-header-height)-var(--status-bar-height))]
          px-[16px] pt-[5px] pb-[20px]
        "
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={optimizedTransition}
        style={{ willChange: 'transform, opacity' }}
      >
        {isComboMode && <ComboBar combo={combo} />}
        <motion.div className="
          relative
          w-full h-[16px]
          mb-[15px]
          rounded-[50px]
          bg-primary-main-100 dark:bg-layout-gray-dark
          overflow-hidden
        ">
          <motion.div
            className={`h-[100%] rounded-[50px] ${progressFillClass}`}
            initial={{ width: "0%" }}
            animate={{ width: `${Math.floor(passedCount / totalWordCount * 100)}%` }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            style={{ willChange: 'width' }}
          />
          <span className="
            absolute right-[10px] top-[50%] translate-y-[-50%]
            text-[#7b7b7b] text-[10px] font-semibold tracking-[-0.2px]
          ">
            {passedCount}/{totalWordCount}
          </span>
        </motion.div>
        <div className="relative flex flex-1 min-h-0 overflow-hidden">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={progressIndex}
              custom={1}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              style={{ willChange: 'transform, opacity' }}
              className="w-full h-full absolute"
            >
              <PluginComponent
                question={testQuestions[progressIndex]}
                testType={testType}
                onComplete={handlePluginComplete}
                onCardMatched={handleCardMatched}
                farmByWordId={cardFarmByWordId}
                farm={showFarmBar ? farmStatus : null}
              />
            </motion.div>
          </AnimatePresence>
        </div>
        {listeningSkipButton}
      </motion.div>
    );
  }

  return (
    <motion.div
      className="
        flex flex-col
        h-[calc(100vh-var(--current-header-height)-var(--status-bar-height))]
        px-[16px] pt-[5px] pb-[20px]
      "
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={optimizedTransition}
      style={{ willChange: 'transform, opacity' }}
    >
      {isComboMode && <ComboBar combo={combo} />}
      <motion.div className="
        relative
        w-full h-[16px]
        mb-[15px]
        rounded-[50px]
        bg-primary-main-100 dark:bg-layout-gray-dark
        overflow-hidden
      ">
        <motion.div
          className={`
            h-[100%]
            rounded-[50px]
            ${progressFillClass}
          `}
          initial={{ width: "0%" }}
          animate={{
            width: `${Math.floor(passedCount / totalWordCount * 100)}%`
          }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          style={{ willChange: 'width' }}
        />
        <span className="
          absolute right-[10px] top-[50%] translate-y-[-50%]
          text-[#7b7b7b] text-[10px] font-semibold tracking-[-0.2px]
        ">
          {passedCount}/{totalWordCount}
        </span>
      </motion.div>

      <div className="relative middle flex flex-1 min-h-0 overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={progressIndex}
            custom={1}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              duration: 0.25,
              ease: [0.4, 0, 0.2, 1]
            }}
            style={{ willChange: 'transform, opacity' }}
            className="flex flex-col gap-[15px] w-full h-full absolute"
          >
            {['multipleChoice', 'multipleChoiceListening'].includes(testQuestions[progressIndex]?.questionType) && (
              <>
                <motion.div
                  className={`
                    relative
                    flex items-center justify-center flex-1
                    w-full
                    rounded-[12px]
                    bg-layout-gray-50 dark:bg-layout-gray-dark
                    cursor-pointer
                  `}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileTap={{ scale: 0.96 }}
                  transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  style={{ willChange: 'transform, opacity' }}
                  onClick={() => {
                    vibrate({ duration: 5 });
                    handleClickTTS();
                  }}
                >

                  {/* 일반 유형 클릭(TTS 재생) 시 ripple — 아이콘 없이 카드 중앙에서 확산 */}
                  {testQuestions[progressIndex].questionType !== 'multipleChoiceListening' && isSpeaking && !isAnswered && (
                    <TtsRipple size={160} duration={speakDuration} className="z-[0]" />
                  )}

                  {/* 상단 중앙 - 암기 상태 배지 (채점 전에는 숨김)
                      농장 상태 바가 뜨면 같은 말을 두 번 하는 것이라 배지는 숨긴다.
                      부패 진단(6절)은 시안에 이 배지가 없다 — 하단 삽 pill 하나만 쓴다. */}
                  {isCorrect !== null && !showFarmBar && !isDiagnosis && (
                  <div className="
                    absolute top-[15px] left-[50%] translate-x-[-50%]
                    flex items-center justify-center
                    z-[2]
                    whitespace-nowrap
                  ">
                    {memoryStateChange ? (
                      <MemoryStateChangeBadge
                        toKey={memoryStateChange.toKey}
                        dir={memoryStateChange.dir}
                        changed={true}
                        size="large"
                      />
                    ) : (
                      (() => {
                        const stability = testQuestions[progressIndex].fsrs?.stability ?? 0;
                        const fsrsState = testQuestions[progressIndex].fsrs?.state ?? null;
                        const stateKey = getMemoryStateKeyByStability(stability, fsrsState);
                        return (
                          <MemoryStateChangeBadge
                            toKey={stateKey}
                            changed={false}
                            size="large"
                          />
                        );
                      })()
                    )}
                  </div>
                  )}

                  {testQuestions[progressIndex].questionType === 'multipleChoiceListening' && !isAnswered ? (
                    /* 듣기 모드: 채점 전 스피커 아이콘 */
                    <div className="relative flex items-center justify-center">
                      {/* 재생 중 ripple 애니메이션 */}
                      {isSpeaking && <TtsRipple size={110} duration={speakDuration} />}
                      <motion.div
                        animate={isSpeaking ? { scale: [1, 1.12, 1] } : { scale: 1 }}
                        transition={isSpeaking ? { duration: 0.6, repeat: Infinity, ease: "easeInOut" } : {}}
                      >
                        <SpeakerHigh
                          size={60}
                          weight="fill"
                          className={isSpeaking ? "text-primary-main-600" : "text-layout-gray-300"}
                        />
                      </motion.div>
                    </div>
                  ) : (
                    <h2 className="
                      relative z-[1]
                      max-w-[90%]
                      text-[28px] font-[700] text-layout-black dark:text-layout-white text-center
                    ">

                      <div className="
                        absolute top-[50%] left-[50%] z-[-1]
                        translate-x-[-50%] translate-y-[-50%]
                      ">
                        <AnimatePresence>
                          {isCorrect === true && (
                            <motion.div
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0, opacity: 0 }}
                              transition={{
                                type: "spring",
                                stiffness: 600,
                                damping: 25,
                                duration: 0.3
                              }}
                              style={{ willChange: 'transform, opacity' }}
                            >
                              <Circle size={150} weight="bold" className="text-status-success-500" />
                            </motion.div>
                          )}
                          {isCorrect === false && (
                            <motion.div
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0, opacity: 0 }}
                              transition={{
                                type: "spring",
                                stiffness: 600,
                                damping: 25,
                                duration: 0.3
                              }}
                              style={{ willChange: 'transform, opacity' }}
                            >
                              <X size={150} weight="bold" className="text-status-error-500" />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                      {testQuestions[progressIndex].origin}
                    </h2>
                  )}
                  {/* 하단 - 부패 진단(시안 6절): 채점 전부터 뜨는 `.fb.ng` 형.
                      삽 그림 + '삽 1개를 씁니다' + '맞히면 씨앗부터'.
                      삽은 누른 순간이 아니라 진단 정답에서 빠지므로 여기서는 안내만 한다.
                      채점 결과(농장 payload)가 오면 평소 상태 바로 교체된다. */}
                  {isDiagnosis && !showFarmBar && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                      className="absolute bottom-[14px] left-[14px] right-[14px] z-[2]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <FarmStatusBar diagnosis />
                    </motion.div>
                  )}

                  {/* 하단 - 채점 후: 농장 상태 바 (작물·성장 막대·다음 복습일) */}
                  {showFarmBar && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                      className={`
                        absolute bottom-[14px] left-[14px] z-[2]
                        ${testType === "test" && isAnswered ? 'right-[50px]' : 'right-[14px]'}
                      `}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <FarmStatusBar
                        crop={farmStatus.crop}
                        stage={farmStatus.stage}
                        crop_from={farmStatus.crop_from}
                        stage_from={farmStatus.stage_from}
                        grew={!!farmStatus.grew}
                        pct_from={farmStatus.pct_from}
                        pct_to={farmStatus.pct_to}
                        health={farmStatus.health}
                        days_to_review={farmStatus.days_to_review}
                        wasCorrect={farmStatus.wasCorrect}
                      />
                    </motion.div>
                  )}

                  {/* 하단 중앙 - 채점 후: 다음 복습 예정일 (채점 전에는 숨김) */}
                  {/* displayNextReview는 채점 시 고정 — 백엔드 응답으로 덮지 않아 깜빡임 없음 */}
                  {/* 농장 상태 바가 같은 자리에서 다음 복습일까지 말하므로 그때는 숨긴다 */}
                  {isCorrect !== null && !showFarmBar && !isDiagnosis && (() => {
                    const nextReviewDate = testQuestions[progressIndex].displayNextReview;
                    if (!nextReviewDate) return null;
                    const date = new Date(nextReviewDate);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    date.setHours(0, 0, 0, 0);
                    const daysDiff = Math.round((date - today) / (1000 * 60 * 60 * 24));
                    if (daysDiff < 1) return null;
                    const text = `${daysDiff}일 후 복습 예정`;
                    return (
                      <div className="absolute bottom-[15px] left-[50%] translate-x-[-50%] flex items-center justify-center z-[2]">
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                          className="flex items-center justify-center h-[18px] px-[6px] rounded-[3px] bg-primary-main-200 dark:bg-primary-main-dark text-[10px] font-[600] text-primary-main-600 whitespace-nowrap"
                        >
                          {text}
                        </motion.div>
                      </div>
                    );
                  })()}
                  {testType === "test" && isAnswered && (
                    <motion.button
                      onClick={(e) => {
                        e.stopPropagation();
                        vibrate({ duration: 5 });
                        handleClickProblemHintData();
                      }}
                      whileHover={{
                        backgroundColor: 'rgba(255, 141, 212, 0.1)',
                        scale: 1.05
                      }}
                      whileTap={{
                        scale: 0.95,
                        backgroundColor: 'rgba(255, 141, 212, 0.2)'
                      }}
                      transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 17
                      }}
                      style={{ willChange: 'transform, background-color' }}
                      className="
                      absolute bottom-[15px] right-[15px]
                      rounded-[8px] p-[5px]
                      text-primary-main-600
                    "
                    >
                      <BookOpenText size={22} weight="duotone" />
                    </motion.button>
                  )}

                </motion.div>
                <div className="
                  flex flex-col gap-[10px]
                ">
                  {optionsWithDisplayMeanings.map((option, index) => {
                    let btnStyle = "";
                    if (isCorrect !== null && testQuestions[progressIndex].resultIndex == index) {
                      btnStyle = 'border-status-success-500 text-status-success-600 bg-status-success-100';
                    } else if (isCorrect === false && userSelected === index) {
                      btnStyle = 'border-status-error-500 text-status-error-600 bg-status-error-100 dark:bg-status-error-dark';
                    } else if (isCorrect === null && userSelected == index) {
                      btnStyle = 'border-primary-main-600 bg-primary-main-50 dark:bg-primary-main-dark text-layout-black dark:text-layout-white';
                    } else {
                      btnStyle = 'border-layout-gray-200 text-layout-black dark:text-layout-white';
                    }

                    return (
                      <motion.button
                        key={index}
                        whileTap={{
                          scale: 0.92,
                          transition: {
                            type: "spring",
                            stiffness: 400,
                            damping: 17
                          }
                        }}
                        onClick={() => {
                          vibrate({ duration: 5 });
                          handleOptionClick(index, option);
                        }}
                        disabled={isAnswered}
                        style={{ willChange: 'transform' }}
                        className={`
                          flex items-center justify-center
                          w-full h-[50px]
                          px-[20px]
                          border-[1px] rounded-[10px]
                          text-[14px] font-[700]
                          text-center
                          overflow-hidden
                          whitespace-pre-line
                          break-keep
                          [display:-webkit-box]
                          [-webkit-line-clamp:2]
                          [-webkit-box-orient:vertical]
                          ${btnStyle}
                        `}
                      >
                        {option.displayMeanings.join(", ")}
                      </motion.button>
                    )
                  })}

                </div>
              </>
            )}
          </motion.div>

        </AnimatePresence>
      </div>
      {listeningSkipButton}
    </motion.div>
  );
};

export default Main; 