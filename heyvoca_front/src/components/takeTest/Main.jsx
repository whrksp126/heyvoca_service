import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useVocabulary } from '../../context/VocabularyContext';
import { Circle, X, BookOpenText, Leaf, Plant, Carrot, EggCrack, SpeakerHigh, ArrowUpRight, ArrowDownRight } from "@phosphor-icons/react";
import { getTextSound, prefetchTextSound } from '../../utils/common';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { ProblemDataNewBottomSheet } from '../newBottomSheet/ProblemDataNewBottomSheet';
import SkipListeningNewBottomSheet from '../newBottomSheet/SkipListeningNewBottomSheet';
import { isListeningType, isListeningSkipActive, activateListeningSkip } from '../../utils/listeningSkip';
import TtsRipple from '../common/TtsRipple';
import MemorizationStatus from "../common/MemorizationStatus";
import { vibrate } from '../../utils/osFunction';
import { playSuccessSound, playErrorSound } from '../../utils/audio';
import { getQuestionType } from '../../plugins/questionTypes';
import { logStudyQuestion } from '../../api/study';
import { getAdvanceDelay } from '../../utils/studyTiming';
import { getComboApi, protectComboApi, forfeitComboApi } from '../../api/game';
import ComboBar from './ComboBar';
import { ComboProtectNewBottomSheet } from '../newBottomSheet/ComboProtectNewBottomSheet';
import { useUser } from '../../context/UserContext';


// stability 기반 암기 상태 키 (FSRS)
const getMemoryStateKeyByStability = (stability, state) => {
  if (!state || state === 'new') return 'unlearned';
  if (stability < 10) return 'leaf';
  if (stability < 60) return 'plant';
  return 'carrot';
};

// 백엔드 memory state 키(short/medium/long) → 프론트 키(leaf/plant/carrot) 정규화
const backendStateKeyMap = { unlearned: 'unlearned', short: 'leaf', medium: 'plant', long: 'carrot' };
const STATE_RANK = { unlearned: 0, leaf: 1, plant: 2, carrot: 3 };

const stateIconMap = {
  unlearned: <EggCrack size={10} weight="fill" />,
  leaf: <Leaf size={10} weight="fill" />,
  plant: <Plant size={10} weight="fill" />,
  carrot: <Carrot size={10} weight="fill" />,
};

const stateColorMap = {
  unlearned: { border: 'border-[#9D835A]', text: 'text-[#9D835A]', bg: 'bg-[#FFFCF3] dark:bg-[#FFFCF3]/20' },
  leaf: { border: 'border-[#77CE4F]', text: 'text-[#77CE4F]', bg: 'bg-[#F2FFEB] dark:bg-[#F2FFEB]/20' },
  plant: { border: 'border-[#38CE38]', text: 'text-[#38CE38]', bg: 'bg-[#EBFFEE] dark:bg-[#EBFFEE]/20' },
  carrot: { border: 'border-[#F68300]', text: 'text-[#F68300]', bg: 'bg-[#FFF8E8] dark:bg-[#FFF8E8]/20' },
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

// meanings가 여러 개면 랜덤하게 2~3개만 선택 (중복 제거)
const getDisplayMeanings = (meanings) => {
  if (!meanings || meanings.length === 0) return [];

  // 중복 제거
  const uniqueMeanings = [...new Set(meanings)];

  if (uniqueMeanings.length <= 2) return uniqueMeanings;

  // 2개 또는 3개를 랜덤하게 선택
  const count = Math.random() < 0.5 ? 2 : 3;
  const shuffled = [...uniqueMeanings].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, uniqueMeanings.length));
};

const Main = ({ testQuestions, setTestQuestions, progressIndex, setProgressIndex, setPendingUpdateSheetIds, setPendingUpdateWords, testType, studySessionRef, pendingLogPromisesRef, loggedVocaIdsRef, retryCountMapRef, passedVocaIdsRef, totalUniqueVocaCountRef }) => {
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
  const [updateType, setUpdateType] = useState(null); // SM-2 업데이트 타입
  const startTimeRef = useRef(null);
  const endTimeRef = useRef(null);
  // ── 전역 콤보 (AI 추천 테스트 전용) ──
  const { userProfile, setUserProfile } = useUser();
  const [combo, setCombo] = useState(null);
  const comboSessionRef = useRef({ maxCombo: 0, bestUpdated: false, best: 0 });
  const comboPopupOpenRef = useRef(false);
  const isComboMode = testType === 'quick';
  // ── 당근 농장 세션 요약 (당근 수확 이벤트 누적) ──
  const farmSessionRef = useRef({ harvests: [], gems: 0 });
  // 마지막 enqueueRetry가 큐에 실제로 삽입했는지 여부 저장 (세션 종료 판정 보정용)
  const lastRetryEnqueuedRef = useRef(false);
  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { pushNewBottomSheet, pushAwaitNewBottomSheet } = useNewBottomSheetActions();
  // 듣기 문제 건너뛰기 활성 여부 (localStorage 기반, 5분간 유지)
  const [listeningSkipActive, setListeningSkipActive] = useState(() => isListeningSkipActive());
  const { updateWord, updateRecentStudy, recentStudy, setRecentStudy, updateWordState, updateRecentStudyState } = useVocabulary();
  const [tempSm2, setTempSm2] = useState(null);
  const [prevMemoryState, setPrevMemoryState] = useState(null);
  const [memoryStateChange, setMemoryStateChange] = useState(null);

  const navigate = useNavigate();

  // ─── 재출제 유틸 ─────────────────────────────────────────────────────────────
  // 오답 문제를 현재 위치에서 2~3문제 뒤에 재삽입
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

    // 현재 index에서 2~3문제 뒤 삽입 (최소한 현재 문제 바로 다음은 피함)
    const offset = Math.random() < 0.5 ? 2 : 3;
    const insertIdx = Math.min(currentIdx + offset, testQuestions.length);

    setTestQuestions((prev) => {
      const next = [...prev];
      next.splice(insertIdx, 0, retryQuestion);
      return next;
    });
    return true;
  };

  // ── 콤보: 학습 진입 시 현재 상태 로드 (AI 추천 테스트만) ──
  useEffect(() => {
    if (!isComboMode) return;
    let mounted = true;
    (async () => {
      const res = await getComboApi();
      if (mounted && res?.code === 200) setCombo(res.data);
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isComboMode]);

  // 콤보 세션 요약을 결과 화면(StudyResult)에 전달 (sessionStorage 경유)
  const persistComboSummary = () => {
    try {
      sessionStorage.setItem('heyvoca_combo_summary', JSON.stringify({
        sessionId: studySessionRef?.current ?? null,
        ...comboSessionRef.current,
      }));
    } catch (e) { /* 저장 실패는 무시 */ }
  };

  // /study/log 응답의 farm 이벤트 처리 — 당근 수확(장기 첫 도달) 누적 + 보석 갱신
  const handleFarmPayload = (payload, word) => {
    if (!payload || payload.type !== 'carrot_harvest') return;
    const f = farmSessionRef.current;
    f.harvests.push(word || '');
    f.gems += payload.gem ?? 0;
    if (typeof payload.gem_balance === 'number') {
      setUserProfile((prev) => (prev ? { ...prev, gem_cnt: payload.gem_balance } : prev));
    }
    try {
      sessionStorage.setItem('heyvoca_farm_summary', JSON.stringify({
        harvests: f.harvests,
        gems: f.gems,
      }));
    } catch (e) { /* 저장 실패 무시 */ }
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
    const promise = logStudyQuestion(payload)
      .then((logRes) => {
        if (logRes?.data?.combo) handleComboPayload(logRes.data.combo);
        if (logRes?.data?.farm) handleFarmPayload(logRes.data.farm, question.origin);
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

  // 안전성 체크: testQuestions가 비어있거나 progressIndex가 범위를 벗어난 경우
  if (!testQuestions || testQuestions.length === 0 || !testQuestions[progressIndex]) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[16px] text-[#999]">문제를 불러오는 중...</p>
      </div>
    );
  }

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
        (async () => {
          setIsSpeaking(true);
          setSpeakDuration(null);
          try {
            await getTextSound(question.origin, "en", setSpeakDuration);
          } finally {
            setIsSpeaking(false);
          }
        })();
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
    }
    startTimeRef.current = Date.now();
    endTimeRef.current = null; // 항상 초기화!
  }, [progressIndex]);

  // 문제 시작 시
  useEffect(() => {

  }, [progressIndex]);

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
    const textToRead = question.origin;
    const lang = "en";
    setIsSpeaking(true);
    setSpeakDuration(null);
    try {
      await getTextSound(textToRead, lang, setSpeakDuration);
    } finally {
      setIsSpeaking(false);
    }
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

  // 플러그인 컴포넌트용 완료 콜백 (cardMatch, fillInTheBlank 등)
  const handlePluginComplete = (results) => {
    const currentQuestion = testQuestions[progressIndex];
    const setWords = currentQuestion.words;
    const questionType = currentQuestion.questionType;

    // cardMatch 오답 단어 — 재출제 가능 여부 사전 판별
    // (enqueueRetry는 setTestQuestions를 호출해 큐를 늘리므로 results 순회 전에 목록 확정)
    const incorrectResults = results.filter(r => !r.isCorrect);

    results.forEach(({ sheetId, wordId, updateData, isCorrect: wordIsCorrect, timeTakenMs }) => {
      updateWordState(sheetId, wordId, updateData);
      setPendingUpdateSheetIds(prev => new Set(prev.add(sheetId)));
      setPendingUpdateWords(prev => {
        const map = new Map(prev);
        map.set(wordId, { sheetId, wordId, updateData });
        return map;
      });
      if (Array.isArray(setWords)) {
        const target = setWords.find(w => w.id === wordId);
        if (target) {
          target.isCorrect = wordIsCorrect ?? target.isCorrect;
        }
      }

      // 첫 시도 1회만 /study/log 로깅
      // cardMatch 세트 내 단어는 isRetry 없이 개별 wordId로 중복 방지
      if (studySessionRef?.current != null && loggedVocaIdsRef?.current) {
        if (!loggedVocaIdsRef.current.has(wordId)) {
          loggedVocaIdsRef.current.add(wordId);
          const promise = logStudyQuestion({
            session_id: studySessionRef.current,
            user_voca_id: wordId,
            user_voca_book_id: sheetId ?? null,
            question_type: questionType,
            was_correct: !!wordIsCorrect,
            time_taken_ms: typeof timeTakenMs === 'number' ? timeTakenMs : 5000,
            client_now: new Date().toISOString(),
          }).then(logRes => {
            if (logRes?.data?.combo) handleComboPayload(logRes.data.combo);
            if (logRes?.data?.farm) {
              const w = Array.isArray(setWords) ? setWords.find(x => x.id === wordId) : null;
              handleFarmPayload(logRes.data.farm, w?.origin);
            }
            if (logRes?.data?.fsrs) {
              updateWordState(sheetId, wordId, { fsrs: logRes.data.fsrs });
              if (Array.isArray(setWords)) {
                const target = setWords.find(w => w.id === wordId);
                if (target) target.fsrs = logRes.data.fsrs;
              }
              if (currentQuestion?.id === wordId) {
                currentQuestion.fsrs = logRes.data.fsrs;
              }
              setTestQuestions([...testQuestions]);
            }
          }).catch(e => console.warn('[FSRS] logStudyQuestion(plugin) 실패:', e));
          if (pendingLogPromisesRef) pendingLogPromisesRef.current.push(promise);
        }
      }

      // 정답 단어는 통과 처리 (진행률 카운트)
      if (wordIsCorrect) {
        markVocaPassed(wordId);
      }
    });

    // cardMatch 세트 안 오답 단어 처리:
    // cardMatch는 카드 맞추기 UI 특성상 단어별 즉시 반복 재시도가 없다(세트 단위로 1회 진행).
    // 따라서 오답 단어도 "해결됨"으로 통과 처리해 세션이 끝까지 진행되게 한다.
    // (FSRS에는 logStudyQuestion에서 was_correct:false로 이미 기록됨 → 다음 복습에 반영,
    //  결과 화면에서도 isCorrect=false로 표시됨)
    incorrectResults.forEach(({ wordId }) => {
      markVocaPassed(wordId);
    });

    currentQuestion.isCorrect = results.every(r => r.isCorrect);

    const currentPassedCount = passedVocaIdsRef?.current?.size ?? 0;
    const targetCount = totalUniqueVocaCountRef?.current || testQuestions.length;
    const nextIndex = progressIndex + 1;
    // 큐 소진 안전망: 더 이상 출제할 문제가 없으면(다음 인덱스가 큐 끝) 세션 종료 보장.
    const isQueueExhausted = nextIndex >= testQuestions.length;
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
            className="h-[100%] rounded-[50px] bg-primary-main-600"
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
                onCardMatched={() => {/* 진행률은 세션 완료 기준으로 관리 */}}
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
          className="
            h-[100%]
            rounded-[50px]
            bg-primary-main-600
          "
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

                  {/* 상단 중앙 - 암기 상태 배지 (채점 전에는 숨김) */}
                  {isCorrect !== null && (
                  <div className="
                    absolute top-[15px] left-[50%] translate-x-[-50%]
                    flex items-center justify-center
                    z-[2]
                    whitespace-nowrap
                  ">
                    {memoryStateChange ? (
                      <motion.div
                        className={`
                          flex items-center gap-[3px]
                          py-[3px] px-[8px]
                          border rounded-[50px]
                          whitespace-nowrap
                          ${memoryStateChange.dir === 'up'
                            ? `${stateColorMap[memoryStateChange.toKey]?.border ?? 'border-[#38CE38]'}
                               ${stateColorMap[memoryStateChange.toKey]?.text ?? 'text-[#38CE38]'}
                               ${stateColorMap[memoryStateChange.toKey]?.bg ?? 'bg-[#EBFFEE] dark:bg-[#EBFFEE]/20'}`
                            : 'border-layout-gray-200 text-layout-gray-300 bg-layout-gray-50 dark:bg-layout-gray-dark'}
                        `}
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                      >
                        {memoryStateChange.dir === 'up'
                          ? <ArrowUpRight size={10} weight="bold" />
                          : <ArrowDownRight size={10} weight="bold" />}
                        <span className="flex-shrink-0">{stateIconMap[memoryStateChange.toKey]}</span>
                      </motion.div>
                    ) : (
                      (() => {
                        const stability = testQuestions[progressIndex].fsrs?.stability ?? 0;
                        const fsrsState = testQuestions[progressIndex].fsrs?.state ?? null;
                        const stateKey = getMemoryStateKeyByStability(stability, fsrsState);
                        const colors = stateColorMap[stateKey];
                        return (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.15 }}
                            className={`
                              flex items-center justify-center
                              w-[18px] h-[18px]
                              border rounded-[18px]
                              ${colors.border} ${colors.text} ${colors.bg}
                            `}
                          >
                            {stateIconMap[stateKey]}
                          </motion.div>
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
                  {/* 하단 중앙 - 채점 후: 다음 복습 예정일 (채점 전에는 숨김) */}
                  {/* displayNextReview는 채점 시 고정 — 백엔드 응답으로 덮지 않아 깜빡임 없음 */}
                  {isCorrect !== null && (() => {
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