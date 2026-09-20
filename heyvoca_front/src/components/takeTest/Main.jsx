import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { haptic, pickVariant } from '../../lib/feel';
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
import { playSuccessSound, playErrorSound } from '../../utils/audio';
import { getQuestionType } from '../../plugins/questionTypes';
import { logStudyQuestion } from '../../api/study';
import { getAdvanceDelay, ADVANCE_DELAY_GROW } from '../../utils/studyTiming';
import { optimisticFarmPayload, pendingFarmPayload } from '../../utils/farmOptimistic';
import { getComboApi, protectComboApi, forfeitComboApi } from '../../api/game';
import ComboBar from './ComboBar';
import { ComboProtectNewBottomSheet } from '../newBottomSheet/ComboProtectNewBottomSheet';
import { useUser } from '../../context/UserContext';
import FarmStatusBar from '../farm/FarmStatusBar';
import { HEALTH_STATES } from '../../utils/crop';
import { removePendingReplantIds } from '../../utils/replantPending';
import { useResumeReplayKey } from '../../hooks/useResumeReplayKey';


// 백엔드 memory state 키(short/medium/long) → 프론트 키(leaf/plant/carrot) 정규화
const backendStateKeyMap = { unlearned: 'unlearned', short: 'leaf', medium: 'plant', long: 'carrot' };

// ── 콤보 "신기록" 판정 — 단일 소스 ──
// /study/log combo payload 의 events.best_updated 는 백엔드(combo.py apply_answer)가
// '이번 정답으로 current_combo 가 기존 best_combo 를 엄격히 초과했을 때만' true 를 준다
// (동률은 false, 최고 기록이 없던 최초 사용자는 첫 정답에서 true). 콤보 위기 팝업 노출
// 여부(판 단위, handleComboPayload)와 결과 화면 콤보 슬라이드 노출 여부(세션 단위,
// comboSessionRef.bestUpdated → heyvoca_combo_summary → StudyResult)가 이 값 하나만
// 신뢰하도록 묶어서, 두 지점의 "갱신" 기준이 갈라지지 않게 한다.
const isComboRecordEvent = (payload) => !!payload?.events?.best_updated;

// ── 같은 날 재복습 판정 — 단일 소스 ──
// FSRS-5 는 같은 날 두 번째 복습이면 `/study/log` 응답의 fsrs.elapsed_days(직전 복습 대비
// 경과일)가 0에 가까워 stability 가 사실상 안 올라(+0.01) 게이지 숫자가 그대로다 — 의도된
// 설계이고 백엔드 수정 대상이 아니다(농장 상태 바의 `+N%` 배지 자리에 시계 아이콘 +
// 상대시간으로만 알린다, FarmStatusBar.jsx 참고). 오답은 원래도 게이지가 안 자라거나
// 줄어드는 게 자연스러우므로 정답일 때만 본다.
const isSameDayReview = (wasCorrect, fsrs) =>
  !!wasCorrect && typeof fsrs?.elapsed_days === 'number' && fsrs.elapsed_days < 1;

// 판정(위)이 참일 때만 시간 단위 값을 만든다 — FarmStatusBar 는 이 값이 null 이면 평소처럼
// `+N%` 배지 자리를 그대로 쓰고, 숫자가 오면 "N시간 전"/"방금 전"으로 바꿔 그린다.
// 서버 응답 없이 프론트에서 근사한 낙관값(computeOptimisticFsrs)에는 elapsed_days 가 없어
// 항상 null — 낙관 폴백·재출제 경로에서 배지가 뜨지 않는 이유가 여기에 있다.
// (payload 필드명과 겹치지만 별개 — FarmStatusBar 의 prop 이름 `sameDayElapsedHours` 와
// 맞춰 이 함수가 그 값을 만든다는 걸 바로 알 수 있게 이름을 같게 뒀다.)
const computeSameDayElapsedHours = (wasCorrect, fsrs) =>
  isSameDayReview(wasCorrect, fsrs) ? Number(fsrs.elapsed_days) * 24 : null;

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
  // 백그라운드→포그라운드 복귀 시 1씩 증가 — 정답 링/성장 게이지가 framer-motion의
  // "경과 실시간 기반 애니메이션 스냅" 버그로 최종 상태에 정적으로 멈춰 보이는 것을 막기 위해
  // 복귀 시점에 해당 엘리먼트를 강제로 재마운트(key 변경)해 연출을 다시 재생시킨다.
  // (상세 이유는 useResumeReplayKey 주석 참고)
  const resumeReplayKey = useResumeReplayKey();
  // 오답 선택지 shake 연출용 — prefers-reduced-motion 이면 흔들림을 최소화한다
  const reducedMotion = useReducedMotion();
  // 진행률 바: 통과한 고유 단어 수 기준 (재출제 문제는 통과 시에만 카운트)
  // 이어하기/백그라운드 복귀로 재마운트될 때 passedVocaIdsRef가 이미 이전 진행분으로
  // 시딩되어 있으므로(TakeTest.jsx 복원 로직 참고), 그 값으로 초기화해야 진행 바가
  // 0%부터 다시 차오르지 않고 실제 진행률을 곧바로 보여준다.
  const [passedCount, setPassedCount] = useState(() => passedVocaIdsRef?.current?.size ?? 0);
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

  /*
    다음 문제로 넘기는 타이머.

    지연을 채점 시점에 한 번 정하고 끝낼 수 없다. 단계가 올랐는지(grew)는
    **로그인 사용자에게는 /study/log 응답이 도착한 뒤에야** 알 수 있는데, 그때는 이미
    1초짜리 타이머가 돌고 있다. 그래서 타이머를 ref 로 들고 있다가, 진화가 확정되면
    **채점 시각 기준 절대 시간**으로 다시 건다 — 늦게 온 응답이 전체 지연을
    2200ms 로 늘리되, 응답까지 걸린 시간만큼은 이미 흘러간 것으로 친다.
  */
  const advanceTimerRef = useRef(null);
  const gradedAtRef = useRef(0);
  const advanceActionRef = useRef(null);

  const scheduleAdvance = (totalMs) => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    const elapsed = Date.now() - gradedAtRef.current;
    advanceTimerRef.current = setTimeout(() => {
      advanceTimerRef.current = null;
      advanceActionRef.current?.();
    }, Math.max(0, totalMs - elapsed));
  };

  useEffect(() => () => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
  }, []);
  // ── 전역 콤보 (AI 추천 테스트 전용) ──
  const { userProfile, setUserProfile } = useUser();
  const [combo, setCombo] = useState(null);
  const comboSessionRef = useRef({ maxCombo: 0, bestUpdated: false, best: 0 });
  const comboPopupOpenRef = useRef(false);
  /*
    현재 진행 중인 콤보 판(스트릭)이 기존 최고 기록을 갱신 중인지 추적.

    AT_RISK 로 전환되는 순간(오답)엔 combo.py apply_answer 가 current_combo 를 이미 0으로
    리셋해버려 그 payload 만으로는 "이 판이 신기록이었는지" 판정할 수 없다(신기록을 넘긴
    판이든 예전 최고 기록과 동률로 끝난 판이든, AT_RISK 시점엔 둘 다 at_risk_combo === best
    로 보인다). 그래서 판이 진행되는 동안 정답마다 isComboRecordEvent 로 누적해뒀다가
    위기 시점에 이 값으로 "위기 안내 팝업을 띄울지" 정한다. 판이 끝나면(조용한 리셋 또는
    위기 콤보 포기 확정) false 로 되돌린다 — 보호(protect) 는 같은 판이 이어지는 것이므로
    유지한다.
  */
  const comboRunIsRecordRef = useRef(false);
  /*
    연속 학습(streak) 세션 요약 — /study/log 응답의 streak.qualified_now 를 그대로 담아 둔다.

    /farm/session-summary(getSessionFarmSummaryApi)의 streak 는 {current, milestone}뿐이라
    '오늘 이미 5개 정답 문턱을 넘겼는지'를 담지 않는다. 그 판정은 정답을 채점하는 순간에만
    알 수 있고(streak_v2.record_correct_word — CheckIn.streak_qualified 가 false→true 로
    바뀌는 그 answer 에서만 qualified_now=true), 세션이 끝난 뒤에는 다시 계산할 방법이 없다.
    그래서 콤보 요약과 같은 방식으로 세션 도중 캡처해 결과 화면에 넘긴다.
  */
  const streakSessionRef = useRef({ qualifiedNow: false, current: null });
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

  /*
    단어별 **마지막** 농장 payload.

    재출제 문제는 /study/log 를 보내지 않고(첫 시도만 기록한다) 게스트 낙관 payload 도
    만들지 않았다. 그래서 다시 풀 때는 farmStatus 가 비어 상태 바가 안 뜨고,
    화면이 **구버전 UI**(암기상태 배지 + '3일 후 복습 예정' pill)로 폴백했다 —
    같은 세션 안에서 같은 단어가 두 번 다른 얼굴로 채점되는 셈이었다.
    첫 시도 때의 payload 를 들고 있다가 재출제에서 그대로 다시 세운다.
  */
  const lastFarmByVocaRef = useRef({});

  /*
    단어(vocaId 또는 카드 wordId)별 **낙관값 폴백 함수**.

    /study/log 응답이 확실히 올 자리(로그인 첫 시도)는 이제 낙관값으로 먼저 그리지 않고
    `pendingFarmPayload`(정지 상태)만 보여준다(아래 applyOptimisticGrade·processCardWord).
    그런데 요청 자체가 실패하면(네트워크 오류 등) 그 정지 상태를 영영 갈아 끼워 줄 응답이
    안 온다 — 이때만 예외적으로 낙관값을 최후 폴백으로 쓴다. 요청을 보내기 직전에 낙관값을
    미리 계산해 "그 값을 발행하는 함수"를 여기 담아 두고, catch 에서 딱 한 번 호출한다.
    성공(then)하면 더 이상 필요 없으므로 지운다 — 늦게 도착한 실패 콜백이 이미 정본으로
    갈아 끼워진 화면을 다시 낙관값으로 덮어쓰는 사고를 막는다.
  */
  const farmFallbackRef = useRef({});

  const publishFarm = (payload, vocaId, qIndex) => {
    lastFarmByVocaRef.current[vocaId] = payload;
    setFarmStatus({ ...payload, vocaId, qIndex });
  };

  /*
    단계가 올랐으면 전환을 2.2초로 늦춘다.

    게스트는 채점과 동시에(applyOptimisticGrade), 로그인 사용자는 /study/log 응답과 함께
    grew 가 정해진다. 두 경로 모두 farmStatus 가 새로 꽂히는 순간을 잡으면 되므로 여기서 한 번만 건다.
    이미 넘어간 문제의 뒤늦은 응답은 대기 중인 타이머가 없으므로 그냥 지나간다.
  */
  useEffect(() => {
    if (!farmStatus?.grew) return;
    if (!advanceTimerRef.current) return;
    scheduleAdvance(ADVANCE_DELAY_GROW);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmStatus]);

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

  // 연속 학습 세션 요약을 결과 화면(StudyResult)에 전달 (sessionStorage 경유, 콤보와 같은 방식)
  const persistStreakSummary = () => {
    try {
      sessionStorage.setItem('heyvoca_streak_summary', JSON.stringify(streakSessionRef.current));
    } catch (e) { /* 저장 실패는 무시 */ }
  };

  // /study/log 응답의 streak payload 처리 — qualifiedNow 는 세션 중 한 번이라도 true 면 계속 true.
  const handleStreakPayload = (payload) => {
    if (!payload) return;
    const s = streakSessionRef.current;
    s.current = payload.streak ?? s.current;
    s.qualifiedNow = s.qualifiedNow || !!payload.qualified_now;
    persistStreakSummary();
  };

  // /study/log 응답의 combo payload 처리 — 상태 갱신 + 위기 시 보호 팝업
  const handleComboPayload = async (payload) => {
    if (!payload) return;
    const s = comboSessionRef.current;
    s.maxCombo = Math.max(s.maxCombo, payload.current ?? 0, payload.at_risk_combo ?? 0);
    s.bestUpdated = s.bestUpdated || isComboRecordEvent(payload);
    s.best = payload.best ?? s.best;
    persistComboSummary();
    setCombo(payload);

    // 판 단위 신기록 추적 — AT_RISK 가 아닌 응답만으로 갱신한다(현재 판이 계속 진행 중이거나
    // 조용히 0으로 리셋된 경우). current === 0 이면 판이 끝난 것이므로 다음 판을 위해 초기화.
    if (payload.status !== 'AT_RISK') {
      comboRunIsRecordRef.current = (payload.current ?? 0) === 0
        ? false
        : (comboRunIsRecordRef.current || isComboRecordEvent(payload));
    }

    if (payload.status !== 'AT_RISK' || comboPopupOpenRef.current) return;

    // 이번에 위기에 처한 판이 기존 최고 기록을 갱신하지 못했다면(동률 포함) 안내 없이
    // 조용히 포기 처리 — MIN_PROTECT_COMBO 미만이라 애초에 조용히 리셋되는 경우와 같은 취급.
    if (!comboRunIsRecordRef.current) {
      const res = await forfeitComboApi();
      if (res?.code === 200) setCombo(res.data);
      return;
    }

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
          return; // 같은 판이 이어지므로 comboRunIsRecordRef 는 그대로 유지
        }
        // 보호 실패(보석 부족/네트워크) → 포기로 폴백
      }
      const res = await forfeitComboApi();
      if (res?.code === 200) setCombo(res.data);
      comboRunIsRecordRef.current = false; // 판 종료
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
        if (logRes?.data?.duplicate) {
          // 백엔드 멱등 가드가 "이미 처리된 요청"으로 판단해 FSRS/콤보/연속학습일을 전혀
          // 재적용하지 않았다 — 이 요청 기준으로는 아무 것도 안 늘지 않았다.
          //
          // 【정지 상태가 한 번도 안 풀린 채였다면 낙관값으로 대신 푼다】 "중복"은 **먼저
          // 보낸 요청이 이미 서버에 반영됐다**는 뜻이다 — 실제로는 자랐는데, 그 첫 응답을
          // 이 화면이 못 받았을 뿐이다(예: 두 요청 중 하나가 늦게 도착). `farmFallbackRef`
          // 는 정지 상태가 아직 실제 값으로 안 풀렸을 때만 살아있으므로(성공 응답을 받으면
          // 바로 지운다), 그 존재 여부로 판단한다 — 살아있으면 "farm payload 없음"과 같은
          // 취급으로 낙관값 폴백을 쓴다. 이미 실제 값으로 확정된 뒤라면(폴백이 이미 지워진
          // 뒤) 이 콜백은 완전한 no-op이다 — 이미 맞는 값을 괜히 다시 덮어써 같은 날
          // 재복습 배지 같은 부가 정보를 잃을 이유가 없다.
          //
          // 이 분기가 없던 예전엔 held(정지 상태, pct_from===pct_to===0 근방)를 그대로
          // "변화 없음"으로 확정해 버려서, 미학습(봉투) 단어를 처음 맞혀도 게이지가 전혀
          // 안 오르는 버그로 이어졌다.
          farmFallbackRef.current[vocaId]?.();
          delete farmFallbackRef.current[vocaId];
          return;
        }
        if (logRes?.data?.combo) handleComboPayload(logRes.data.combo);
        if (logRes?.data?.streak) handleStreakPayload(logRes.data.streak);
        // 농장 상태 바 payload — 채점 직후엔 pendingFarmPayload(정지 상태)만 떠 있었다.
        // 이 응답이 도착해야 비로소 실제 값으로 **한 번** 움직인다(farmOptimistic.js 상단 주석).
        if (logRes?.data?.farm) {
          publishFarm(
            {
              ...logRes.data.farm,
              wasCorrect: !!payload.was_correct,
              sameDayElapsedHours: computeSameDayElapsedHours(payload.was_correct, logRes.data.fsrs),
            },
            vocaId,
            progressIndex,
          );
        } else {
          // 구버전 응답(farm payload 없음) — 정지 상태를 풀어 줄 정본이 영영 없으므로
          // 요청 실패 때와 같은 낙관값 폴백을 대신 쓴다.
          farmFallbackRef.current[vocaId]?.();
        }
        // 늦게 도착한 catch 가 방금 세운 값을 다시 낙관값으로 덮어쓰는 사고를 막는다.
        delete farmFallbackRef.current[vocaId];
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
            // 함수형 업데이트 필수: 이 콜백은 /study/log 응답(비동기) 도착 시 실행되는데,
            // 그 사이 enqueueRetry가 큐 끝에 재출제 문제를 이미 삽입했을 수 있다.
            // 여기서 닫혀 있는 testQuestions는 요청을 보낼 당시(답변 시점)의 스냅샷이라
            // [...testQuestions]로 덮으면 그 사이 삽입된 재출제 문제가 통째로 사라져
            // progressIndex가 배열 범위를 벗어나 "문제를 불러오는 중..."에서 멈춘다.
            setTestQuestions((prev) => [...prev]);
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
      .catch((e) => {
        console.warn('[FSRS] logStudyQuestion 실패:', e);
        // 요청 자체가 실패해 정본을 영영 못 받는다 — 정지해 있던 게이지를 낙관값으로라도
        // 한 번은 움직여 준다(farmOptimistic.js 상단 주석 — 최후 폴백).
        farmFallbackRef.current[vocaId]?.();
        delete farmFallbackRef.current[vocaId];
      });
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
  const isMissingQuestion = !testQuestions || testQuestions.length === 0 || !testQuestions[progressIndex];
  // 정상적인 최초 진입 시에도 아주 짧게 이 상태를 스칠 수 있어(문제 세팅 직후 첫 렌더 등),
  // 몇 초 이상 지속될 때만 "멈췄다"고 보고 다음 행동을 보여준다 — 원인 불명 상태를
  // 무한 로딩으로 방치하지 않기 위함(예: 위 fsrs 응답 경쟁 조건이 다시 생기는 경우의 안전망).
  const [showStuckFallback, setShowStuckFallback] = useState(false);
  useEffect(() => {
    if (!isMissingQuestion) {
      setShowStuckFallback(false);
      return;
    }
    const timer = setTimeout(() => setShowStuckFallback(true), 4000);
    return () => clearTimeout(timer);
  }, [isMissingQuestion]);

  if (isMissingQuestion) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-[14px] px-[24px]">
        <p className="text-[16px] text-[#999]">문제를 불러오는 중...</p>
        {showStuckFallback && (
          <>
            <p className="text-[13px] text-layout-gray-300 text-center">
              문제를 불러오지 못했어요. 학습을 종료하고 다시 시도해주세요.
            </p>
            <button
              type="button"
              onClick={() => navigate('/home', { replace: true })}
              className="
                px-[18px] py-[10px] rounded-[10px]
                bg-primary-main-600
                text-layout-white text-[14px] font-[700]
              "
            >
              홈으로 돌아가기
            </button>
          </>
        )}
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

  /*
    게스트(온보딩 첫 학습)용 농장 상태 바 payload.

    상태 바는 원래 `/study/log` 응답의 `farm` 으로 그린다. 그런데 게스트는 학습 세션이
    없어 그 요청을 아예 보내지 않아(logIfFirstAttempt 첫 줄) 온보딩에서만 구버전 화면
    (상단 암기상태 배지 + 하단 '3일 후 복습 예정' pill)이 남아 있었다.
    온보딩에서 본 화면과 실제가 다르면 안 되므로(시안 study.html 2절) 같은 값을 만든다.

    온보딩 단어는 전부 **한 번도 심지 않은 씨앗**이라 계산이 단순하다 —
    첫 정답이 곧 씨앗 심기이고(기획 5.1 조건 4), 그 순간이 유일한 승급이다.
    막대는 0 이다. 서버도 같다: 심은 씨앗의 진행률은 '심은 시각 → 첫 예정 복습' 사이의
    경과 비율인데(farm_v2/answer.py stage_progress) 막 심은 참이라 아직 0 이다.
  */
  const daysUntilReview = (iso) => {
    if (!iso) return null;
    const target = new Date(iso);
    const today = new Date();
    target.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((target - today) / 86400000);
    return diff >= 1 ? diff : null;
  };

  const guestFarmPayload = (wasCorrect, nextReviewIso) => ({
    crop: 'seed',
    stage: wasCorrect ? 'PLANTED_SEED' : 'UNPLANTED_SEED',
    crop_from: 'seed',
    stage_from: 'UNPLANTED_SEED',
    grew: !!wasCorrect,
    pct_from: 0,
    pct_to: 0,
    health: HEALTH_STATES.FRESH,
    days_to_review: daysUntilReview(nextReviewIso),
    wasCorrect: !!wasCorrect,
  });

  // 채점 직후 즉시 표시할 낙관적 fsrs + 복습 예정일 고정 + 암기상태 변경 알림.
  // predictedReview(백엔드 사전 계산)가 있으면 정확값으로 displayNextReview를 고정해
  // 이후 /study/log 응답에도 흔들리지 않게 한다(깜빡임 제거). 없으면 낙관적 추정으로 폴백.
  const applyOptimisticGrade = (idx, isCorrectAnswer) => {
    const q = testQuestions[idx];
    const predicted = q.predictedReview?.[isCorrectAnswer ? 'correct' : 'wrong'];
    const fsrsBefore = q.fsrs;          // 아래에서 덮이기 전의 값 — 막대의 '학습 전'이다
    const optimistic = computeOptimisticFsrs(q.fsrs, isCorrectAnswer);
    q.displayNextReview = predicted?.next_review ?? optimistic.next_review;
    q.fsrs = optimistic; // 추정 fsrs — 백엔드 응답 도착 시 갱신(배지/홈 카운터용)
    // 함수형 업데이트 필수: 지금은 호출부(enqueueRetry보다 먼저 호출됨)에 기대어 안전하지만,
    // 위 486행과 같은 이유로 닫혀 있는 testQuestions를 그대로 덮으면 호출 순서가 바뀌는 순간
    // 같은 버그(재출제 문제 유실 → progressIndex 범위 초과)가 재발한다.
    setTestQuestions((prev) => [...prev]);
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

    /*
      상태 바는 **언제나** 뜬다. 구버전 UI 로 폴백하던 자리를 전부 없앴으므로
      여기서 값을 못 만들면 화면이 빈다.

      【언제 낙관값을 바로 쓰고, 언제 정지시키나】 서버 payload 를 못 받는 두 경우
      (게스트 온보딩 · 재출제)는 이 값을 갈아 끼워 줄 다음 이벤트가 영영 없으므로
      낙관값(optimisticFarmPayload)을 바로 보여준다 — 예전과 동일.
      로그인 첫 시도(=logIfFirstAttempt 가 실제로 /study/log 를 보낼 자리)는 이제
      낙관값으로 먼저 움직이지 않는다. 프론트 낙관식과 서버 FSRS 가 달라서(재시도 이력·
      fuzz 등) 값이 어긋나면, 낙관값으로 한 번 움직인 뒤 응답이 오면 또 움직여
      "찼다가 되돌아간다"로 보였다(2026-09 QA). 대신 pendingFarmPayload 로 **채점 전 값에
      멈춰** 세워 두고, 응답이 오면(logIfFirstAttempt) 그 값 하나로만 움직인다.
      요청이 실패했을 때만 예외적으로 낙관값을 최후 폴백으로 쓴다 — farmFallbackRef 에
      "낙관값을 발행하는 함수"를 미리 담아 두고 logIfFirstAttempt 의 catch 에서 호출한다.
    */
    const vid = q.vocaIndexId ?? q.id;
    const base = lastFarmByVocaRef.current[vid];
    // logIfFirstAttempt 의 로깅 게이트(505~513행)와 정확히 같은 조건이어야 한다 —
    // 여기서 "응답이 온다"고 판단했는데 실제로는 로깅이 스킵되면 정지 화면이 영영
    // 안 풀린다.
    const willReceiveServerFarm = !!studySessionRef?.current
      && !!loggedVocaIdsRef?.current
      && !q.isRetry
      && !loggedVocaIdsRef.current.has(vid);
    const buildOptimisticFarm = () => optimisticFarmPayload({
      base,
      fsrsBefore,
      fsrsAfter: optimistic,
      wasCorrect: isCorrectAnswer,
      // 게스트 온보딩은 **마지막** 정오답을 서버로 보낸다(TakeTest 의 answers 집계).
      // 그러니 재출제에서 맞히면 실제로 심긴다 — 화면도 그때 심는 연출을 해야 한다.
      // 정규 학습은 반대다. 서버가 세션 로그로 독립 회상을 판정해 재출제를 성장으로
      // 치지 않으므로(기획 5.2), 화면도 제자리에 세운다.
      isRetry: !!q.isRetry && !guestMode,
      daysToReview: daysUntilReview(q.displayNextReview),
    });

    if (willReceiveServerFarm) {
      publishFarm(pendingFarmPayload({ base, fsrsBefore, wasCorrect: isCorrectAnswer }), vid, idx);
      farmFallbackRef.current[vid] = () => publishFarm(buildOptimisticFarm(), vid, idx);
    } else {
      publishFarm(buildOptimisticFarm(), vid, idx);
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
      haptic('success');
      playSuccessSound();
      setIsCorrect(true);
      question.isCorrect = true;
      question.userResultIndex = userSelected;
      q = timeTakenSec <= 5 ? 5 : timeTakenSec <= 10 ? 4 : timeTakenSec <= 15 ? 3 : 0;
    } else {
      haptic('error');
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
      haptic('success');
      playSuccessSound();
      setIsCorrect(true);
      question.isCorrect = true;
      question.userResultIndex = index;
      q = timeTakenMs <= 5000 ? 5 : timeTakenMs <= 10000 ? 4 : timeTakenMs <= 15000 ? 3 : 0;
    } else {
      haptic('error');
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

    // 오답일 때는 정답·해설을 충분히 인지하도록 전환을 더 천천히 (정답 1초 / 오답 2.5초).
    // 단계가 오른 정답은 아래 useEffect 가 2.2초로 다시 건다 — 진화 연출이 1초라 여기서 넘기면 잘린다.
    gradedAtRef.current = Date.now();
    advanceActionRef.current = setUpdateRecentStudyStateAndStatus;
    scheduleAdvance(getAdvanceDelay(isCorrectAnswer));
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
        if (logRes?.data?.duplicate) {
          // 비카드 경로(logIfFirstAttempt)와 같은 원리 — 자세한 이유는 그쪽 주석 참고.
          // farmFallbackRef 는 이 카드가 정지 상태에서 실제 값으로 아직 안 풀렸을 때만
          // 살아있다(성공 응답을 받으면 바로 지운다) — 살아있으면 "farm payload 없음"과
          // 같은 취급으로 낙관값 폴백을 쓴다. 이미 확정된 뒤라면 완전한 no-op 이다.
          // 이 분기가 없던 예전엔 정지 상태를 그대로 "변화 없음"으로 확정해 버려서,
          // 미학습(봉투) 카드를 처음 맞혀도 게이지가 전혀 안 오르는 버그로 이어졌다.
          farmFallbackRef.current[wordId]?.();
          delete farmFallbackRef.current[wordId];
          return;
        }
        if (logRes?.data?.combo) handleComboPayload(logRes.data.combo);
        if (logRes?.data?.streak) handleStreakPayload(logRes.data.streak);
        // 농장 상태 바 payload — 카드 매칭은 카드(단어)마다 따로 붙는다.
        // 채점 직후엔 pendingFarmPayload(정지 상태)만 떠 있었다 — 이 응답이 도착해야
        // 비로소 실제 값으로 **한 번** 움직인다(farmOptimistic.js 상단 주석).
        if (logRes?.data?.farm) {
          setCardFarmByWordId(prev => ({
            ...prev,
            [wordId]: {
              ...logRes.data.farm,
              wasCorrect: !!payload.was_correct,
              sameDayElapsedHours: computeSameDayElapsedHours(payload.was_correct, logRes.data.fsrs),
            },
          }));
        } else {
          // 구버전 응답(farm payload 없음) — 정지 상태를 풀어 줄 정본이 영영 없으므로
          // 요청 실패 때와 같은 낙관값 폴백을 대신 쓴다.
          farmFallbackRef.current[wordId]?.();
        }
        // 늦게 도착한 catch 가 방금 세운 값을 다시 낙관값으로 덮어쓰는 사고를 막는다.
        delete farmFallbackRef.current[wordId];
        if (logRes?.data?.fsrs) {
          updateWordState(sheetId, wordId, { fsrs: logRes.data.fsrs });
          if (Array.isArray(setWords)) {
            const target = setWords.find(w => w.id === wordId);
            if (target) target.fsrs = logRes.data.fsrs;
          }
          if (currentQuestion?.id === wordId) currentQuestion.fsrs = logRes.data.fsrs;
          // 함수형 업데이트 필수 — 위 logIfFirstAttempt와 동일한 이유(비동기 응답 도착 전
          // enqueueRetry가 재출제 카드를 큐에 이미 넣었을 수 있음).
          setTestQuestions((prev) => [...prev]);
        }
      })
      .catch(e => {
        console.warn('[FSRS] logStudyQuestion(card) 실패:', e);
        // 요청 자체가 실패해 정본을 영영 못 받는다 — 정지해 있던 카드 게이지를 낙관값으로라도
        // 한 번은 움직여 준다(farmOptimistic.js 상단 주석 — 최후 폴백).
        farmFallbackRef.current[wordId]?.();
        delete farmFallbackRef.current[wordId];
      });
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

    /*
      카드별 농장 상태 바 — 카드는 카드(단어)마다 따로 붙는다. 구버전 UI 폴백을 없앴기
      때문에 값이 비면 화면이 빈다 — 그건 그대로 유지한다.

      【언제 낙관값을 바로 쓰고, 언제 정지시키나】 applyOptimisticGrade(MCQ 경로)와 같은
      원칙이다 — 상세 이유는 그쪽 주석과 farmOptimistic.js 상단 참고. 이 카드가 실제로
      /study/log 를 보낼 대상(아래 로깅 게이트와 정확히 같은 조건)이면 pendingFarmPayload
      로 채점 전 값에 멈춰 세워 두고, sendCardLog 응답이 도착했을 때 그 값 하나로만
      움직인다. 게스트·이미 로깅된 카드처럼 응답이 안 오는 자리만 낙관값을 바로 쓴다.
    */
    const optimistic = computeOptimisticFsrs(target?.fsrs, !!wordIsCorrect);
    const buildOptimisticCardFarm = (base) => optimisticFarmPayload({
      base,
      fsrsBefore: target?.fsrs,
      fsrsAfter: optimistic,
      wasCorrect: !!wordIsCorrect,
      isRetry: !!currentQuestion?.isRetry && !guestMode,
      daysToReview: daysUntilReview(optimistic?.next_review),
    });
    // sendCardLog 가 실제로 호출될 조건(아래 if)과 정확히 같아야 한다 — 다르면
    // 정지 화면이 영영 안 풀리거나, 낙관값을 두 번 쓰는 경우가 생긴다.
    const willReceiveServerFarm = studySessionRef?.current != null
      && !!loggedVocaIdsRef?.current
      && !loggedVocaIdsRef.current.has(wordId);

    if (willReceiveServerFarm) {
      setCardFarmByWordId(prev => ({
        ...prev,
        [wordId]: pendingFarmPayload({ base: prev[wordId], fsrsBefore: target?.fsrs, wasCorrect: !!wordIsCorrect }),
      }));
      farmFallbackRef.current[wordId] = () => {
        setCardFarmByWordId(prev => ({ ...prev, [wordId]: buildOptimisticCardFarm(prev[wordId]) }));
      };
    } else {
      setCardFarmByWordId(prev => ({ ...prev, [wordId]: buildOptimisticCardFarm(prev[wordId]) }));
    }

    if (willReceiveServerFarm) {
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
  // 채점하면 applyOptimisticGrade 가 낙관값이라도 반드시 세우므로 이 조건은 사실상
  // "채점했고 그 문제의 값인가"만 본다. 폴백 UI 는 없다.
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
        onClick={() => { haptic('light'); handleSkipListening(); }}
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
        {isComboMode && <ComboBar combo={combo} isRecord={comboRunIsRecordRef.current} />}
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
      {isComboMode && <ComboBar combo={combo} isRecord={comboRunIsRecordRef.current} />}
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
                    haptic('light');
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
                              key={`correct-${resumeReplayKey}`}
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
                              key={`wrong-${resumeReplayKey}`}
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
                      key={`diagbar-${resumeReplayKey}`}
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
                      key={`farmbar-${resumeReplayKey}`}
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
                        pending={!!farmStatus.pending}
                        sameDayElapsedHours={farmStatus.sameDayElapsedHours ?? null}
                      />
                    </motion.div>
                  )}

                  {/* 하단 중앙 - 채점 후: 다음 복습 예정일 (채점 전에는 숨김) */}
                  {/* displayNextReview는 채점 시 고정 — 백엔드 응답으로 덮지 않아 깜빡임 없음 */}
                  {/* 농장 상태 바가 같은 자리에서 다음 복습일까지 말하므로 그때는 숨긴다 */}
                  
                  {testType === "test" && isAnswered && (
                    <motion.button
                      onClick={(e) => {
                        e.stopPropagation();
                        haptic('light');
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
                    const isWrongSelected = isCorrect === false && userSelected === index;
                    if (isCorrect !== null && testQuestions[progressIndex].resultIndex == index) {
                      btnStyle = 'border-status-success-500 text-status-success-600 bg-status-success-100';
                    } else if (isWrongSelected) {
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
                        // 오답으로 확정되는 순간에만(isWrongSelected 가 false→true 로 바뀌는
                        // 그 렌더) 흔들린다 — 매 렌더 재생되지 않도록 animate 값 자체를 조건부로 둔다.
                        animate={isWrongSelected ? pickVariant('shake', reducedMotion).animate : undefined}
                        onClick={() => {
                          haptic('light');
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