import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { feel, hapticWarmup, pickVariant, ShineSweep } from '../../lib/feel';
import { useVocabulary } from '../../context/VocabularyContext';
import { BookOpenText, SpeakerHigh } from "@phosphor-icons/react";
import { getTextSound, prefetchTextSound, prefetchTtsList } from '../../utils/common';
import { wordIntroSoundItems } from '../../plugins/questionTypes/wordIntro/WordIntroQuestion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { ProblemDataNewBottomSheet } from '../newBottomSheet/ProblemDataNewBottomSheet';
import SkipListeningNewBottomSheet from '../newBottomSheet/SkipListeningNewBottomSheet';
import { isListeningType, isListeningSkipActive, activateListeningSkip } from '../../utils/listeningSkip';
import TtsRipple from '../common/TtsRipple';
import LiftAboveBar from '../common/LiftAboveBar';
import MemorizationStatus from "../common/MemorizationStatus";
import MemoryStateChangeBadge, {
  MEMORY_STATE_RANK as STATE_RANK,
  getMemoryStateKeyByStability,
} from "../common/MemoryStateChangeBadge";
import { getQuestionType, isSingleWordPluginType, isFillInTheBlankType, isSentenceQuestionType, isNoGradeQuestionType, isArrangeQuestionType } from '../../plugins/questionTypes';
import { getDisplayMeanings } from '../../utils/displayMeanings';
import { logStudyQuestion, getRequeueEasierApi, exampleSeenApi } from '../../api/study';
import { mapRecommendItemToWord } from '../../utils/studyRecommendMapping';
import { getAdvanceDelay } from '../../utils/studyTiming';
import { useStudyAdvanceGate } from '../../hooks/useStudyAdvanceGate';
import { optimisticFarmPayload, pendingFarmPayload } from '../../utils/farmOptimistic';
import { getComboApi, protectComboApi, forfeitComboApi } from '../../api/game';
import ComboBar, { getComboFillClass, COMBO_MILESTONE_STEP } from './ComboBar';
import StudyProgressBar from './StudyProgressBar';
import { ComboInterlude, PhaseInterlude } from './StudyInterlude';
import { holdStudyAdvance } from '../../hooks/useStudyAdvanceGate';
import { ComboProtectNewBottomSheet } from '../newBottomSheet/ComboProtectNewBottomSheet';
import { useUser } from '../../context/UserContext';
import FarmStatusBar, { FarmResultBar } from '../farm/FarmStatusBar';
import { retryCorrectApi } from '../../api/farm';
import StudyTimingTag from '../farm/StudyTimingTag';
import { HEALTH_STATES } from '../../utils/crop';
import { removePendingReplantIds } from '../../utils/replantPending';
import { useResumeReplayKey } from '../../hooks/useResumeReplayKey';
import { wordsOverlap } from '../../utils/meaningConcept';
import { wordLang, isJa } from '../../utils/lang';
import { getReading, shouldShowReading } from '../../utils/jaWord';
import ReadingLine from '../common/ReadingLine';
import ResultMark from '../common/ResultMark';
import { computeStudyProgress } from '../../utils/studyProgress';
import { SLIDE_VARIANTS, SLIDE_TRANSITION, CARD_ENTER_INITIAL, CARD_ENTER_ANIMATE, CARD_ENTER_TRANSITION } from '../../utils/studySlideMotion';


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

// 표시 뜻 선택(getDisplayMeanings)은 utils/displayMeanings.js 로 옮겼다 — 빈칸 채우기(영→한)
// 선택지도 같은 함수를 써야 유형 간 뜻 표기가 어긋나지 않는다.

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
// questionType 기본값 'multipleChoice' — requeue-easier(계약 6절)가 이 단어에 mcq 계열
// (multipleChoice/multipleChoiceListening/reverseMultipleChoice)을 배정했을 때도, 또는
// (실사용 가능성은 낮지만) cardMatch류를 배정했는데 단일 단어라 세트를 못 만들 때도 이 함수로
// mcq 폴백을 만든다 — buildQuestionForType 참고.
const buildMultipleChoiceFromWord = (word, pool, questionType = 'multipleChoice') => {
  const wordId = word.vocaIndexId ?? word.id;
  const distractorCandidates = (pool ?? []).filter(w => {
    const wid = w.vocaIndexId ?? w.id;
    return wid !== wordId && Array.isArray(w.meanings) && w.meanings.length > 0;
  });
  // 뜻이 겹치는 단어는 우선 배제(utils/meaningConcept.js) — 부족하면 나머지로 채운다.
  const nonOverlapping = distractorCandidates.filter(w => !wordsOverlap(word, w));
  let shuffledDistractors = [...nonOverlapping].sort(() => Math.random() - 0.5).slice(0, 3);
  if (shuffledDistractors.length < 3) {
    const used = new Set(shuffledDistractors.map(w => w.vocaIndexId ?? w.id));
    const fillers = distractorCandidates
      .filter(w => !used.has(w.vocaIndexId ?? w.id))
      .sort(() => Math.random() - 0.5)
      .slice(0, 3 - shuffledDistractors.length);
    shuffledDistractors = [...shuffledDistractors, ...fillers];
  }
  const options = [word, ...shuffledDistractors].sort(() => Math.random() - 0.5);
  const resultIndex = options.findIndex(o => (o.vocaIndexId ?? o.id) === wordId);
  return {
    ...word,
    options,
    resultIndex: resultIndex >= 0 ? resultIndex : 0,
    questionType,
    isCorrect: null,
    userResultIndex: null,
  };
};

// requeue-easier(계약 6절) 응답을 실제 렌더 가능한 question 객체로 만든다.
// word는 mapRecommendItemToWord로 이미 변환된 상태(questionPayload/suggestedQuestionType 포함) —
// type은 그 응답의 suggested_question_type을 그대로 받는다(서버가 정한 값, 로컬에서 다시 고르지 않음).
const buildQuestionForType = (word, type, pool) => {
  // cardMatch류는 세트(2개 이상)가 있어야 렌더된다 — 재출제는 항상 단어 하나뿐이라 세트를
  // 만들 수 없으므로 사지선다(듣기 여부만 유지)로 대체한다.
  if (type === 'cardMatch' || type === 'cardMatchListening') {
    return buildMultipleChoiceFromWord(word, pool, type === 'cardMatchListening' ? 'multipleChoiceListening' : 'multipleChoice');
  }
  const plugin = getQuestionType(type);
  if (plugin?.setupQuestions) {
    // 빈칸 채우기·출제형 4종 — setupQuestions가 word.questionPayload(또는 예문 강조 마커)
    // 유무로 스스로 판단한다. 못 만들면(서버가 그 유형을 배정했는데 payload가 비정상) mcq 폴백.
    const generated = plugin.setupQuestions([word], pool);
    if (generated.length > 0) return generated[0];
    return buildMultipleChoiceFromWord(word, pool, 'multipleChoice');
  }
  // multipleChoice / multipleChoiceListening / reverseMultipleChoice
  return buildMultipleChoiceFromWord(word, pool, type);
};

const Main = ({ testQuestions, setTestQuestions, progressIndex, setProgressIndex, setPendingUpdateSheetIds, setPendingUpdateWords, testType, studySessionRef, pendingLogPromisesRef, loggedVocaIdsRef, retryCountMapRef, passedVocaIdsRef, totalUniqueVocaCountRef, cardRetryEnqueuedRef, guestMode, plantAttemptsRef }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  /*
    plant(새 씨앗 심기) — 새 단어 전용 세션(2026-09-29). 문제마다 /study/log 를 보내지 않고
    (재출제 재시도 정답 통지도 마찬가지), 단어별 "세션 내 모든 첫 시도가 정답이었는지"만
    plantAttemptsRef 에 AND 로 접어 두면 TakeTest.jsx 가 세션 종료 시 단어당 1회씩 일괄
    전송한다. 문제 카드의 농장 상태 바 등 "그 문제에 대한 서버 응답"에 의존하는 표시는
    응답이 영영 오지 않으므로 숨긴다(showFarmBar 참고).
  */
  const isPlantMode = testType === 'plant';
  /*
    글자 학습(script) — plant와 마찬가지로 **같은 vocaId(글자)가 세션 안에서 여러 단계
    (①만나기·②보고 고르기·③듣고 고르기·④따라 쓰기…)로 반복 등장한다**(2026-09-30, 글자
    하나 = 단어 하나). 그래서 로깅·세션 종료 판정·재출제 삽입 위치·농장 상태 바 숨김까지
    plant와 같은 규칙을 쓴다 — 아래 isMultiStepMode. 서버는 (session, 단어)당 FSRS를 한 번만
    적용하므로(study.py 중복 가드) 슬라이드마다 즉시 로깅하면 첫 슬라이드 1건만 반영되고,
    나머지 슬라이드의 상태 바 상승은 저장되지 않는 낙관 표시가 된다(2026-09-30 실기기:
    진행 중엔 XP가 계속 올랐는데 격자엔 12XP만 남음). 세션 종료 시 글자당 1회 일괄 전송.
  */
  const isMultiStepMode = isPlantMode || testType === 'script';
  const recordPlantAttempt = (vocaId, wasCorrect) => {
    if (vocaId == null || !plantAttemptsRef?.current) return;
    const prev = plantAttemptsRef.current.has(vocaId) ? plantAttemptsRef.current.get(vocaId) : true;
    plantAttemptsRef.current.set(vocaId, prev && !!wasCorrect);
  };

  // 학습 구간(문장 만들기·오답 복습)이 있는 세션 — 구간의 첫 문제에 phaseStart 표식('sentence'|'retry')이
  // 붙어 있다(안내 슬라이드는 없다 — 그 표식 앞에서 전체 화면 인터루드만 뜬다). 이런 세션은 같은 단어가
  // 문장 구간·재출제로 다시 나오므로 세션 종료를 큐 소진으로만 판정한다.
  const hasPhaseFlow = (testQuestions ?? []).some((q) => !!q?.phaseStart);

  const [isCorrect, setIsCorrect] = useState(null);
  const [isFinishing, setIsFinishing] = useState(false); // 마지막 슬라이드 후 진행바 100% 연출 중
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
  const [, setProgressTick] = useState(0);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isStay, setIsStay] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakDuration, setSpeakDuration] = useState(null);
  // reverseMultipleChoice(뜻→단어) 전용 — 지금 재생 중인 게 "뜻(카드)"인지 "단어(정답 선택지)"인지.
  // 채점 전엔 뜻이, 채점 직후엔 정답 단어가 재생되는데 둘 다 isSpeaking=true라 이것만으로는
  // 구분이 안 돼 리플(카드)/스피커 배지(선택지) 중 하나만 켜야 하는 자리에서 헷갈렸다.
  // 다른 유형(multipleChoice/Listening)은 이 값을 쓰지 않는다(항상 null로 둬도 무방).
  const [speakingTarget, setSpeakingTarget] = useState(null); // 'meaning' | 'word' | null
  // TTS 재생 "세대" 가드. getTextSound는 새 재생 시작 시 이전 재생을 강제 resolve하므로,
  // 등장 자동재생이 진행 중일 때 카드를 클릭하면 중단된 이전 재생의 finally가 isSpeaking을
  // false로 덮어써 음파(TtsRipple)가 사라진다. 각 재생에 세대 번호를 부여해, finally/onMeta는
  // "자신이 최신 재생일 때만" 상태를 갱신하도록 한다.
  const speakGenRef = useRef(0);
  // 채점 → 다음 슬라이드 전환 게이트(모든 유형 공통 규칙, utils/studyTiming.js).
  // 여기 쓰는 사지선다·역방향·듣기만 담당한다 — 플러그인(카드·빈칸)은 각자 같은 훅을 쓴다.
  const advanceGate = useStudyAdvanceGate();
  const speakText = async (text, lang = wordLang(null), target = null) => {
    const gen = ++speakGenRef.current;
    setIsSpeaking(true);
    setSpeakDuration(null);
    setSpeakingTarget(target);
    // 읽는 중에는 넘기지 않는다(끝 + 200ms). 새 재생이 이전 재생을 끊으면 이전 finally 는
    // 세대가 달라 ttsEnd 를 부르지 않는다 — 새 재생이 끝날 때 한 번만 풀린다.
    advanceGate.ttsBegin();
    try {
      await getTextSound(text, lang, (d) => { if (gen === speakGenRef.current) setSpeakDuration(d); });
    } finally {
      if (gen === speakGenRef.current) {
        setIsSpeaking(false);
        advanceGate.ttsEnd();
      }
    }
  };
  const [updateType, setUpdateType] = useState(null); // SM-2 업데이트 타입
  const startTimeRef = useRef(null);
  const endTimeRef = useRef(null);

  // 학습 화면 진입 시 햅틱 엔진 예열(앱 1.1.2+, 페이지당 1회) — 첫 진동이 늦게 울리는 것을 막는다.
  useEffect(() => { hapticWarmup(); }, []);

  // ── 전역 콤보 (AI 추천 테스트 전용) ──
  const { userProfile, setUserProfile } = useUser();
  const [combo, setCombo] = useState(null);
  const comboSessionRef = useRef({ maxCombo: 0, bestUpdated: false, best: 0 });
  const comboPopupOpenRef = useRef(false);
  /*
    콤보 마일스톤(5의 배수) 인터루드 — 연출만(보상 없음). 정답 직후 콤보가 5·10 에 닿으면
    pendingInterludeRef 에 "어느 문제(atIndex)에서 닿았는지"를 적어 두고, 그 문제가 다음으로
    넘어가는 순간(advanceWithInterlude)에 한 번 꺼내 쓴다. 다음 문제는 인터루드가 끝난 뒤에야
    마운트되므로(progressIndex 를 그때 올린다) 자동 음성·타이머·포커스가 인터루드 중에 시작하지 않는다.
    같은 마일스톤은 세션에서 한 번(횟수 상한 없음). 마지막 문제·안내 슬라이드 앞에서는 생략한다.
  */
  // 인터루드 대기열 — 앞에서부터 하나씩 보여 준다(콤보 → 구간 안내 순서). 항목: { id, type: 'combo'|'phase',
  // n, milestone, kind, hold }. hold=true 는 "지금 보고 있는 문제가 구간 첫 문제인 채로 (재)진입"한 경우로,
  // 인터루드가 끝날 때까지 문제 화면 자체를 그리지 않는다(TTS 자동재생·타이머가 먼저 시작하지 않게).
  const [initialPhaseKind] = useState(() => testQuestions?.[progressIndex]?.phaseStart ?? null);
  const [interludeQueue, setInterludeQueue] = useState(
    () => (initialPhaseKind ? [{ id: 0, type: 'phase', kind: initialPhaseKind, hold: true }] : []),
  );
  const interlude = interludeQueue[0] ?? null;
  const interludeIdRef = useRef(1);
  const shownPhasesRef = useRef(new Set(initialPhaseKind ? [initialPhaseKind] : [])); // 이미 보여 준 구간 종류
  const questionsRef = useRef(testQuestions); // 클로저가 낡았을 때(재출제 직후) 다음 문제를 보기 위한 최신 큐
  useEffect(() => { questionsRef.current = testQuestions; });
  const pendingInterludeRef = useRef(null);        // { n, milestone, atIndex }
  const shownMilestonesRef = useRef(new Set());
  const interludeNextRef = useRef(null);
  const prevComboCurrentRef = useRef(null);
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

  const navigate = useNavigate();

  // ─── 재출제 유틸 ─────────────────────────────────────────────────────────────
  // 재출제 문제를 큐 맨 끝에 붙인다. 큐에 오답 복습 구간 표식(phaseStart 'retry')이 아직 없으면 이번
  // 재출제를 그 구간의 첫 문제로 표시한다 — 재출제는 항상 맨 끝에만 붙으므로 표식은 첫 재출제에만
  // 생기고 이후 재출제는 그 뒤에 이어진다. 표식 앞에서 "틀린 문제를 복습해봐요" 인터루드가 뜬다.
  // 게스트 맛보기는 자체 안내 문구가 있어 표식을 붙이지 않는다. 순수 함수(상태 업데이터 안에서 호출된다).
  const appendRetryAtEnd = (prev, retryQuestion) => {
    const hasRetryPhase = prev.some((q) => q.phaseStart === 'retry');
    const marked = (!hasRetryPhase && !guestMode) ? { ...retryQuestion, phaseStart: 'retry' } : retryQuestion;
    return [...prev, marked];
  };

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
      // 선택지가 단어 객체(사지선다)면 id, 문자열(빈칸 채우기)이면 문자열 자체로 비교한다 —
      // 예전엔 객체만 가정해 문자열 선택지의 resultIndex 가 어긋났다.
      const optionKey = (opt) => (opt !== null && typeof opt === 'object') ? (opt.id ?? opt.vocaIndexId) : opt;
      const newResultIndex = shuffled.findIndex((opt) => optionKey(opt) === optionKey(correctOption));
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

    delete retryQuestion.phaseStart; // 구간 표식은 구간 첫 문제에만 — 복사본에 따라오지 않게

    // 큐 삽입 위치 — 글자 학습(script)은 그 글자 블록 안(남은 단계 뒤, 다음 글자로 넘어가기
    // 전)에 다시 나오게 한다(isMultiStepMode && !isPlantMode). buildScriptLearnQuestions가 한
    // 글자의 모든 단계를 배열에서 연속으로 배치하므로, currentIdx 다음부터 "같은 vocaId가
    // 연속으로 이어지는 구간"의 끝(=다음 글자가 시작되는 자리, 또는 배열 끝)에 끼워 넣는다.
    // 그 외(일반 학습·plant)는 **맨 끝 구간**에서만 하나씩 다시 나온다(2026-10-02 QA — 예전
    // plant는 그 단어 슬라이드 직후에 나왔다). 첫 재출제가 들어갈 때 그 앞에 "틀린 문제를
    // 복습해봐요" 안내 슬라이드를 한 번만 끼운다(appendRetryAtEnd).
    setTestQuestions((prev) => {
      if (isMultiStepMode && !isPlantMode) {
        const next = [...prev];
        let end = currentIdx + 1;
        while (end < next.length && (next[end].vocaIndexId ?? next[end].id) === vocaId) end++;
        next.splice(end, 0, retryQuestion);
        return next;
      }
      return appendRetryAtEnd(prev, retryQuestion);
    });
    retryEnqueueCounterRef.current += 1;
    return true;
  };

  // 단어별로 이번 세션에서 이미 실패한 유형(계약 6절 exclude_types) — 같은 유형이 requeue-easier로
  // 반복 배정되는 것을 막는다. Main.jsx 생애주기 동안만 유효하면 충분해 prop이 아닌 로컬 ref.
  const retryExcludeTypesRef = useRef(new Map());

  /*
    자동 추천 세션(tierShown이 있는 문제)의 오답 재출제 — 계약 6절 GET /study/requeue-easier.
    조립/타이핑류는 서버가 조각을 새로 섞고 payload를 다시 조립해야 해서 로컬로 만들 수 없고,
    그 외 유형(사지선다·카드매칭)도 "한 칸 쉬운 tier"를 프론트가 알 방법이 없어 이 엔드포인트로
    통일한다. 실패(네트워크 오류·404 — 더 쉬운 tier에 이 단어가 쓸 유형이 없음)하면 조용히
    포기한다(다음 단어로 진행) — enqueueRetry의 "그대로 재출제"로 되돌리지 않는다. 계약이
    "이 경우 프론트는 다음 단어로 넘어가면 된다"고 명시했기 때문이다.
  */
  const requeueEasier = async (question) => {
    const vocaId = question.vocaIndexId ?? question.id;
    if (vocaId == null) return false;

    const retryMap = retryCountMapRef?.current;
    const prevCount = retryMap?.get(vocaId) ?? 0;
    const MAX_RETRY = 10;
    if (retryMap && prevCount >= MAX_RETRY) return false;

    const excludeSet = retryExcludeTypesRef.current.get(vocaId) ?? new Set();
    excludeSet.add(question.questionType);
    retryExcludeTypesRef.current.set(vocaId, excludeSet);

    const res = await getRequeueEasierApi({
      userVocaId: vocaId,
      fromTier: typeof question.tierShown === 'number' ? question.tierShown : undefined,
      excludeTypes: [...excludeSet],
    });
    if (res?.code !== 200 || !res.data) return false;

    retryMap?.set(vocaId, prevCount + 1);

    const pool = collectSessionWordPool(testQuestions);
    const word = mapRecommendItemToWord(res.data);
    const retryQuestion = buildQuestionForType(word, res.data.suggested_question_type, pool);
    retryQuestion.isRetry = true;
    delete retryQuestion.phaseStart;
    retryQuestion.isCorrect = null;
    retryQuestion.userResultIndex = null;
    // requeue-easier 응답은 tier_target이 항상 null(계약 6절 — 자동 tier 진행에 영향 없음).
    retryQuestion.tierTarget = null;
    retryQuestion.tierShown = res.data.tier_shown ?? null;

    setTestQuestions((prev) => appendRetryAtEnd(prev, retryQuestion));
    retryEnqueueCounterRef.current += 1;
    return true;
  };

  // 오답 문제 재출제 — 자동 추천 세션(tierShown 有)이면 서버 requeue-easier로, 아니면(설정
  // 시트로 유형을 직접 고른 테스트) 기존처럼 같은 유형을 로컬에서 다시 만든다.
  // 반환값은 항상 boolean(동기) — requeue-easier는 비동기라 즉시 true/false를 알 수 없으므로,
  // 낙관적으로 true를 반환하고(대부분 성공) 실패 시 뒤늦게 재출제 카운터를 되돌리지 않는다
  // (세션 종료 판정은 passedVocaIdsRef 기준이 1차이고, 이 값은 안전망일 뿐이라 근사치로 충분하다 —
  // handlePluginComplete/setUpdateRecentStudyStateAndStatus 주석 참고).
  const enqueueRetryAuto = (currentIdx, question) => {
    if (typeof question.tierShown === 'number') {
      requeueEasier(question);
      return true;
    }
    return enqueueRetry(currentIdx, question);
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

  // 콤보가 COMBO_MILESTONE_STEP 의 배수를 처음 넘는 순간을 기록(최초 값은 기준선일 뿐 트리거하지 않는다)
  const comboCurrent = combo?.current ?? null;
  useEffect(() => {
    if (comboCurrent === null) return;
    const prev = prevComboCurrentRef.current;
    prevComboCurrentRef.current = comboCurrent;
    if (prev === null || comboCurrent <= prev) return;
    // (prev, current] 안의 가장 큰 주기 배수 — 이미 보여준 마일스톤은 건너뛴다.
    const top = Math.floor(comboCurrent / COMBO_MILESTONE_STEP) * COMBO_MILESTONE_STEP;
    const crossed = top >= COMBO_MILESTONE_STEP && top > prev && !shownMilestonesRef.current.has(top) ? top : null;
    if (crossed) pendingInterludeRef.current = { n: comboCurrent, milestone: crossed, atIndex: progressIndex };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comboCurrent]);

  // 다음 문제로 넘어가는 지점 공통 — 보여 줄 인터루드(콤보 마일스톤 → 구간 안내 순)가 있으면 먼저 보여주고
  // applyNext 를 미룬다. 다음 문제는 인터루드가 끝난 뒤에야 마운트되므로 그 문제의 TTS 자동재생·타이머도
  // 그때 시작한다. applyNext 는 setProgressIndex + 문제 상태 초기화를 담은 클로저(세션 종료가 아닐 때만 부른다).
  // 두 인터루드가 같은 지점에서 겹치면 둘 다 순서대로 하나씩 보여 준다(각각 탭하면 즉시 넘어감).
  const advanceWithInterlude = (nextIndex, applyNext) => {
    const items = [];
    const pending = pendingInterludeRef.current;
    pendingInterludeRef.current = null;
    if (pending
      && pending.atIndex === progressIndex
      && !shownMilestonesRef.current.has(pending.milestone)
      && interludeQueue.length === 0) {
      shownMilestonesRef.current.add(pending.milestone);
      items.push({ id: interludeIdRef.current++, type: 'combo', n: pending.n, milestone: pending.milestone });
    }
    // 구간 첫 문제 — 큐에 표식이 있으면 그것, 아직 큐 반영 전(재출제를 방금 끝에 붙인 직후)이라 다음 문제가
    // 안 보이면 오답 복습 구간 진입으로 본다(재출제는 항상 맨 끝에 붙는다).
    const nextQ = questionsRef.current?.[nextIndex] ?? testQuestions[nextIndex];
    const retryAtEnd = !guestMode && !(isMultiStepMode && !isPlantMode);
    const phaseKind = nextQ ? (nextQ.phaseStart ?? null) : (retryAtEnd ? 'retry' : null);
    if (phaseKind && !shownPhasesRef.current.has(phaseKind) && interludeQueue.length === 0) {
      shownPhasesRef.current.add(phaseKind);
      items.push({ id: interludeIdRef.current++, type: 'phase', kind: phaseKind });
    }
    if (items.length === 0) {
      applyNext();
      return;
    }
    interludeNextRef.current = applyNext;
    setInterludeQueue(items);
  };
  const handleInterludeDone = () => {
    if (interludeQueue.length > 1) {
      setInterludeQueue((prev) => prev.slice(1));
      return;
    }
    const fn = interludeNextRef.current;
    interludeNextRef.current = null;
    setInterludeQueue([]);
    fn?.();
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
    // 시트가 떠 있는 동안(결정 + 보호/포기 API 완료까지) 모든 문제의 자동 전환을 멈춘다 — 사용자가
    // 틀린 내용을 확인하고 유지/포기를 정할 수 있게. 풀린 뒤 짧은 여유를 두고 전환이 재개된다.
    const releaseAdvance = holdStudyAdvance();
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
          // 보호로 복구된 콤보 값은 "새로 오른 값"이 아니다 — 마일스톤 판정의 기준선을 먼저 맞춰
          // 이미 지난(또는 지난 세션의) 마일스톤 축하가 다시 터지지 않게 한다.
          prevComboCurrentRef.current = res.data.current ?? prevComboCurrentRef.current;
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
      // flush 가 새 위기 시트를 동기적으로 띄웠다면 그 시트의 hold 가 이미 잡혀 있어 끊김 없이 이어진다.
      releaseAdvance();
    }
  };

  // 본 예문 노출 기록 전송 — 실패·지연이 학습 흐름에 영향 없게 fire-and-forget, 종료 시 await 되도록 등록만 한다.
  const sendExampleSeen = (items) => {
    if (guestMode || !studySessionRef?.current) return;
    const list = (items ?? []).filter((it) => it?.user_voca_id != null && it?.example_hash);
    if (list.length === 0) return;
    const p = exampleSeenApi(list).catch(() => null);
    if (pendingLogPromisesRef) pendingLogPromisesRef.current.push(p);
  };

  /*
    plant — 단어의 1차 출제 문제(재출제·만나기·안내 제외)를 **모두** 끝낸 순간 그 단어의 /study/log 를
    즉시 보낸다(단어당 1회, loggedVocaIdsRef 가 "이미 보냄" 표시 — plant 는 이 ref 를 다른 용도로 안 쓴다).
    중간 이탈해도 이미 끝낸 단어는 심어져 다음 심기에 또 나오지 않는다. 세션 종료 일괄 전송
    (TakeTest.jsx)은 이 ref 에 있는 단어를 건너뛴다. was_correct 는 기존 규칙 그대로
    plantAttemptsRef(첫 시도 AND, 문장 만들기·재출제 제외)다. 문제 하나의 완료는 "큐 인덱스"로 센다 —
    카드 세트는 단어마다, 재출제는 맨 끝에만 삽입되므로 1차 문제의 인덱스는 변하지 않는다.
  */
  const plantDoneIdxRef = useRef(new Map());
  const plantQuestionDone = (vocaId, questionIndex) => {
    if (!isPlantMode || vocaId == null || !studySessionRef?.current || guestMode) return;
    if (loggedVocaIdsRef?.current?.has(vocaId)) return;
    const done = plantDoneIdxRef.current.get(vocaId) ?? new Set();
    done.add(questionIndex);
    plantDoneIdxRef.current.set(vocaId, done);
    const primary = [];
    testQuestions.forEach((q, i) => {
      if (!q || q.isRetry || isNoGradeQuestionType(q.questionType)) return;
      const has = Array.isArray(q.words) ? q.words.some((w) => w.id === vocaId) : (q.vocaIndexId ?? q.id) === vocaId;
      if (has) primary.push({ q, i });
    });
    if (primary.length === 0 || !primary.every(({ i }) => done.has(i))) return;
    if (!plantAttemptsRef?.current?.has(vocaId)) return;
    loggedVocaIdsRef.current.add(vocaId);

    const wasCorrect = plantAttemptsRef.current.get(vocaId);
    const firstGraded = primary.find(({ q }) => !Array.isArray(q.words)) ?? primary[0];
    const sentenceQs = primary.map(({ q }) => q).filter((q) => (
      !Array.isArray(q.words) && q.exampleHash
      && (isFillInTheBlankType(q.questionType) || isSentenceQuestionType(q.questionType))
    ));
    const exampleHash = sentenceQs.length > 0 ? sentenceQs[sentenceQs.length - 1].exampleHash : null;
    const p = logStudyQuestion({
      session_id: studySessionRef.current,
      user_voca_id: vocaId,
      user_voca_book_id: firstGraded.q.vocabularySheetId ?? null,
      question_type: Array.isArray(firstGraded.q.words) ? 'multipleChoice' : firstGraded.q.questionType,
      was_correct: true, // plant 는 서버가 항상 정답으로 처리 — 정오답은 결과 화면 표시용(plantAttemptsRef)으로만 남긴다
      time_taken_ms: 5000,
      client_now: new Date().toISOString(),
      ...(exampleHash ? { example_hash: exampleHash } : {}),
    }).then((logRes) => {
      // 결과 목록 "다음 복습 예정일"용 정본 fsrs — 세션 종료 일괄 전송과 같은 자리에 붙인다.
      const fsrs = logRes?.data?.fsrs;
      if (fsrs) {
        const target = testQuestions.find((qq) => !qq.isRetry && !Array.isArray(qq.words)
          && (qq.vocaIndexId ?? qq.id) === vocaId && !isNoGradeQuestionType(qq.questionType));
        if (target) target.fsrs = fsrs;
      }
    }).catch((e) => {
      // 실패하면 종료 일괄 전송이 다시 시도하도록 "보냄" 표시를 되돌린다
      loggedVocaIdsRef.current.delete(vocaId);
      console.warn('[plant] 단어 즉시 /study/log 실패:', e);
    });
    if (pendingLogPromisesRef) pendingLogPromisesRef.current.push(p);

    // 이 단어가 본 예문(빈칸·타이핑·문장 만들기 1차 문제 전부)을 한 번에 배치 전송 — 문장 만들기를
    // 틀려 /study/log 에 안 실리는 예문도 여기서 노출 기록된다(서버는 멱등).
    const seen = [...new Set(sentenceQs.map((q) => q.exampleHash))];
    const arrangeSeen = primary.map(({ q }) => q).filter((q) => !Array.isArray(q.words) && q.exampleHash && isArrangeQuestionType(q.questionType)).map((q) => q.exampleHash);
    sendExampleSeen([...new Set([...seen, ...arrangeSeen])].map((h) => ({ user_voca_id: vocaId, example_hash: h })));
  };

  // 첫 시도 1회만 /study/log를 보내는 래퍼
  // isRetry=true인 재출제 문제는 로깅 스킵
  const logIfFirstAttempt = (question, payload) => {
    if (!studySessionRef?.current) return;
    const vocaId = question.vocaIndexId ?? question.id;
    // plant — 같은 단어가 블록마다(최대 5회) 다시 등장하므로 아래 loggedVocaIdsRef(단어당
    // 1회 전역 가드)를 타면 두 번째 블록부터 전부 스킵된다. 여기서는 그 가드를 쓰지 않고
    // "이 문제(블록) 자체가 재출제가 아닌 첫 시도인지"만 보고 AND로 접어 기록한다 —
    // 실제 서버 전송은 세션 종료 시 TakeTest.jsx가 단어당 1회로 일괄한다.
    if (isMultiStepMode) {
      if (!question.isRetry) {
        recordPlantAttempt(vocaId, payload.was_correct);
        plantQuestionDone(vocaId, progressIndex);
      }
      return;
    }
    if (!loggedVocaIdsRef?.current) return;
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

  // 재출제(isRetry) 문제를 결국 정답으로 맞힌 순간에만 서버에 알린다. logIfFirstAttempt는
  // isRetry 답을 /study/log로 보내지 않으므로(FSRS 첫 시도 원칙, 위 496행 주석), 재출제 정답은
  // 이 호출이 없으면 영영 "새로 심은 단어"로 반영되지 않고 추천에서 계속 "최근 틀림"으로 남는다.
  // fire-and-forget — retryCorrectApi가 실패를 콘솔 경고로만 삼키므로 여기서도 await/catch 불필요.
  // 같은 세션·단어 중복 호출은 retryCorrectNotifiedRef로 막는다(정답 재출제는 단어당 한 번뿐이라
  // 정상 흐름에서는 중복이 없지만, 카드 즉시 콜백/세트 완료 콜백 이중 호출 같은 방어용).
  const retryCorrectNotifiedRef = useRef(new Set());
  const notifyRetryCorrect = (vocaId, questionType) => {
    // plant — 첫 시도를 아예 서버에 보내지 않으므로(logIfFirstAttempt 위 분기) "재출제
    // 정답"을 알릴 첫 시도 로그 자체가 없다. 세션 종료 일괄 전송이 최종 정오답을 담는다.
    if (isMultiStepMode) return;
    if (!studySessionRef?.current || vocaId == null) return;
    if (retryCorrectNotifiedRef.current.has(vocaId)) return;
    retryCorrectNotifiedRef.current.add(vocaId);
    retryCorrectApi({
      userVocaId: vocaId,
      sessionId: studySessionRef.current,
      questionType,
    });
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

  // 역방향 사지선다(뜻→단어) 상단 카드에 띄울 정답 단어의 뜻 — 옵션과 같은 결정적 선택 함수 사용
  const currentQuestionDisplayMeanings = useMemo(() => {
    if (!testQuestions[progressIndex]) return [];
    return getDisplayMeanings(testQuestions[progressIndex].meanings);
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
      if (question.questionType === 'reverseMultipleChoice') {
        // reverseMultipleChoice(뜻→단어): 단어(영어) 대신 뜻(한국어)을 자동 재생한다 —
        // 일반 사지선다가 등장 시 단어를 읽어 주는 것과 같은 타이밍/훅. 카드에 보이는
        // 뜻 문자열(currentQuestionDisplayMeanings)을 그대로 읽되, 너무 길어지지 않게
        // 최대 2개까지만 이어 읽는다. 단어 발음은 정답 공개 후에만(handleClickExamOption).
        const meaningsToSpeak = currentQuestionDisplayMeanings.slice(0, 2).join(', ');
        if (meaningsToSpeak) speakText(meaningsToSpeak, 'ko', 'meaning');
      // sentenceArrangePartial/sentenceArrange/listenArrange/fillInTheBlankTyping 도
      // fillInTheBlank와 같은 이유로 제외한다 — 각 플러그인 컴포넌트가 마운트 시 직접
      // 정답 문장(ko 또는 answer_text)을 읽는다. 여기서 origin(주제 단어)까지 읽으면
      // 문장 대신 단어만 들리는 버그가 된다(2026-09-28). fillInTheBlankTyping은 정답
      // 단어(예: graduation)를 미리 읽어 버리는 버그였다(2026-09-29). wordIntro(①만나기)도
      // 같은 이유로 제외 — WordIntroQuestion이 마운트 시 자기만의 순서(단어→뜻→예문)로
      // 직접 재생한다. 여기서 또 origin을 읽으면 단어가 두 번 겹쳐 재생된다.
      } else if (!['cardMatch', 'cardMatchListening', 'fillInTheBlank', 'fillInTheBlankTyping', 'sentenceArrangePartial', 'sentenceArrange', 'listenArrange', 'wordIntro'].includes(question.questionType) && question.origin) {
        speakText(question.origin, wordLang(question));
      }

      // 다음 1~2문제의 음성을 미리 받아 blob 캐시에 채워둔다 → 전환 시 즉시 재생.
      // 만나기 카드는 현재 카드부터(첫 카드 포함) 단어·뜻·예문 줄 전체를 받아 둔다.
      if (question.questionType === 'wordIntro') prefetchTtsList(wordIntroSoundItems(question), 4);
      for (let d = 1; d <= 2; d++) {
        const nq = testQuestions[progressIndex + d];
        if (!nq) break;
        if (nq.questionType === 'wordIntro') prefetchTtsList(wordIntroSoundItems(nq), 4);
        if (nq.origin) prefetchTextSound(nq.origin, wordLang(nq));
        if (Array.isArray(nq.words)) {
          nq.words.forEach(w => { if (w?.origin) prefetchTextSound(w.origin, wordLang(w, wordLang(nq))); });
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
      // 소리·진동·시각을 같은 틱에 — feel() 직후 같은 핸들러에서 setIsCorrect 로 시각을 바꾼다.
      feel('correct');
      setIsCorrect(true);
      question.isCorrect = true;
      question.userResultIndex = userSelected;
      q = timeTakenSec <= 5 ? 5 : timeTakenSec <= 10 ? 4 : timeTakenSec <= 15 ? 3 : 0;
      // 진행 바는 "정답 처리된 이 순간" 채운다 — 정답 피드백이 뜨는 동안 채워지도록,
      // 다음 문제로 전환되는 시점(setUpdateRecentStudyStateAndStatus)까지 기다리지 않는다.
      // 마지막 문제를 맞히면 이 호출로 이미 14/14가 되고, 그 뒤 채점 연출이 끝나야
      // 결과 화면으로 넘어간다(오답은 여기서 호출되지 않으므로 재출제 규칙과 충돌하지 않는다).
      markVocaPassed(question.vocaIndexId ?? question.id);
    } else {
      feel('wrong');
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
      // 문제에 쓰인 예문(FRESH_SENTENCE_CONTRACT §4·5) — 없으면 보내지 않는다.
      ...(question.exampleHash ? { example_hash: question.exampleHash } : {}),
    });

    // 게스트 온보딩 로컬 콤보 — 첫 시도만 반영 (재출제는 스트릭에 영향 없음)
    if (!question.isRetry) bumpLocalCombo(isCorrectAnswer);

    // 재출제 문제를 결국 맞혔을 때만 — 위 notifyRetryCorrect 주석 참고
    if (question.isRetry && isCorrectAnswer) {
      notifyRetryCorrect(question.vocaIndexId ?? question.id, question.questionType);
    }

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
      // 소리·진동·시각을 같은 틱에 — feel() 직후 같은 핸들러에서 setIsCorrect 로 시각을 바꾼다.
      feel('correct');
      setIsCorrect(true);
      question.isCorrect = true;
      question.userResultIndex = index;
      q = timeTakenMs <= 5000 ? 5 : timeTakenMs <= 10000 ? 4 : timeTakenMs <= 15000 ? 3 : 0;
      // 진행 바는 "정답 처리된 이 순간" 채운다 — 아래 markVocaPassed 호출 참고(handleClickNext와 동일 규칙).
      markVocaPassed(question.vocaIndexId ?? question.id);
    } else {
      feel('wrong');
      setIsCorrect(false);
      question.isCorrect = false;
      question.userResultIndex = index;
      q = 0;
    }

    // 낙관적 UI: 답변 직후 즉시 임시 fsrs + 암기상태 변경 알림
    applyOptimisticGrade(progressIndex, isCorrectAnswer);

    // 첫 시도만 /study/log 로깅 (재출제는 스킵). tier_target/tier_shown은 /study/recommend가
    // 이 문항에 실어 준 값을 그대로 되돌려 보낸다(계약 4절) — 설정 시트로 유형을 직접 고른
    // 테스트 등 값이 없던 문항은 null로 보내면 서버가 조용히 무시한다.
    logIfFirstAttempt(question, {
      session_id: studySessionRef?.current,
      user_voca_id: question.vocaIndexId ?? question.id,
      user_voca_book_id: question.vocabularySheetId ?? null,
      question_type: question.questionType,
      was_correct: isCorrectAnswer,
      time_taken_ms: timeTakenMs,
      client_now: new Date().toISOString(),
      tier_target: question.tierTarget ?? null,
      tier_shown: question.tierShown ?? null,
      // 문제에 쓰인 예문(FRESH_SENTENCE_CONTRACT §4·5) — 없으면 보내지 않는다.
      ...(question.exampleHash ? { example_hash: question.exampleHash } : {}),
    });

    // 게스트 온보딩 로컬 콤보 — 첫 시도만 반영 (재출제는 스트릭에 영향 없음)
    if (!question.isRetry) bumpLocalCombo(isCorrectAnswer);

    // 재출제 문제를 결국 맞혔을 때만 — 위 notifyRetryCorrect 주석 참고
    if (question.isRetry && isCorrectAnswer) {
      notifyRetryCorrect(question.vocaIndexId ?? question.id, question.questionType);
    }

    if (studySessionRef?.current == null) {
      // 방어 가드: 세션이 없는 비정상 경로
      question.isCorrect = isCorrectAnswer;
    }

    // 재출제 큐 삽입 (오답인 경우) — 자동 추천 세션이면 requeue-easier(계약 6절), 아니면 기존 로컬 재출제.
    lastRetryEnqueuedRef.current = false;
    if (!isCorrectAnswer) {
      lastRetryEnqueuedRef.current = enqueueRetryAuto(progressIndex, question);
    }

    setIsAnswered(true);

    // reverseMultipleChoice(뜻→단어): 정답 공개 후 단어 발음 재생 — 뜻 화면에서는
    // 자동 재생하지 않았으므로(위 progressIndex useEffect), 여기서 한 번 들려준다.
    // target='word' — 카드(뜻) 리플이 아니라 정답 선택지 버튼에 스피커 표시를 띄운다.
    if (question.questionType === 'reverseMultipleChoice') {
      speakText(question.origin, wordLang(question), 'word');
    }

    // 전환은 가장 늦은 조건을 기다린다 — 최소 대기(정답 1초/오답 2.5초), XP 연출 끝 + 0.7초,
    // TTS 끝 + 0.2초. 서버 응답이 안 와 연출이 시작되지 않으면 3초에 포기(utils/studyTiming.js).
    advanceGate.arm({
      minDelayMs: getAdvanceDelay(isCorrectAnswer),
      onAdvance: setUpdateRecentStudyStateAndStatus,
    });
  }


  // React Compiler가 자동으로 useCallback 처리
  // 문제 읽기
  const handleClickTTS = async () => {
    const question = testQuestions[progressIndex];
    // reverseMultipleChoice(뜻→단어): 채점 전에는 카드에 뜻만 보이고 정답(단어)은 아직
    // 비공개라, 카드를 눌러도 단어 발음은 재생하지 않는다(정답을 알려주는 셈이라 금지) —
    // 대신 뜻(한국어)을 다시 들려준다. 채점 후에는 기존대로 단어(영어) 발음.
    if (question.questionType === 'reverseMultipleChoice' && !isAnswered) {
      const meaningsToSpeak = currentQuestionDisplayMeanings.slice(0, 2).join(', ');
      if (meaningsToSpeak) await speakText(meaningsToSpeak, 'ko', 'meaning');
      return;
    }
    // reverseMultipleChoice 채점 후 카드 재탭 — target='word'로 선택지 스피커 표시를 다시 띄운다.
    // 다른 유형은 target을 안 쓰므로 넘겨도 무해하다.
    await speakText(question.origin, wordLang(question), question.questionType === 'reverseMultipleChoice' ? 'word' : null);
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

  // 마지막 슬라이드 채점 직후 진행바가 100%로 꽉 찬 다음(PROGRESS_FILL_TRANSITION 0.3s + 여유) 결과로 넘긴다.
  // 종료가 아니면 즉시 반영한다.
  const FINISH_DELAY_MS = 550;
  const commitStudyState = (isSessionDone, nextState) => {
    if (!isSessionDone) {
      updateRecentStudyState(nextState);
      return;
    }
    setIsFinishing(true);
    setTimeout(() => updateRecentStudyState(nextState), FINISH_DELAY_MS);
  };

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

    // 정답 시 통과 처리 (진행률 카운트 증가) — 실제로는 채점 순간(handleClickNext/
    // handleClickExamOption)에 이미 처리됐다. markVocaPassed는 passedVocaIdsRef 기준
    // 멱등이라 여기서 다시 불러도 중복 증가하지 않는다 — 그 경로를 타지 않는 케이스에 대한
    // 안전망으로 남겨둔다.
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
    // plant(새 씨앗 심기)·script(글자 학습)는 1차 판정을 쓰지 않는다(isMultiStepMode) —
    // 같은 단어/글자가 여러 단계(같은 vocaId)로 반복 등장하므로, 그중 아무 단계 하나만
    // 맞혀도 "통과"로 잡혀 나머지 단계(빈칸 채우기·문장 만들기·듣고 고르기·따라 쓰기 등)를
    // 건너뛰고 세션이 조기 종료되는 버그가 된다. 큐를 끝까지(재출제 포함) 소진했을 때만
    // 끝난 것으로 본다.
    const currentPassedCount = passedVocaIdsRef?.current?.size ?? 0;
    const targetCount = totalUniqueVocaCountRef?.current || testQuestions.length;
    const nextIndex = progressIndex + 1;
    const adjustedQueueLen = testQuestions.length + (lastRetryEnqueuedRef.current ? 1 : 0);
    const isQueueExhausted = nextIndex >= adjustedQueueLen;
    // 구간 안내(문장 만들기·오답 복습)가 있는 세션은 같은 단어가 문장 구간·재출제로 다시 나오므로
    // "통과 고유 단어 수" 판정을 쓰지 않고 큐를 끝까지 소진했을 때만 끝난 것으로 본다.
    const isSessionDone = (isMultiStepMode || hasPhaseFlow) ? isQueueExhausted : (currentPassedCount >= targetCount || isQueueExhausted);

    commitStudyState(isSessionDone, {
      [testType]: {
        ...recentStudy[testType],
        progress_index: isSessionDone ? null : nextIndex,
        status: isSessionDone ? "end" : "learning",
        study_data: testQuestions,
        updated_at: new Date().toISOString(),
      }
    });
    if (!isSessionDone) {
      advanceWithInterlude(nextIndex, () => {
        setProgressIndex(nextIndex);
        setIsCorrect(null);
        setUserSelected(null);
        setIsAnswered(false);
        setIsStay(false);
        setUpdateType(null);
        setMemoryStateChange(null);
      });
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
  const processCardWord = ({ sheetId, wordId, updateData, isCorrect: wordIsCorrect, timeTakenMs, typo }, currentQuestion, setWords, questionType) => {
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
    // 단일 단어 플러그인(빈칸 채우기 + 출제형 4종) — 문제 객체 자체가 단어를 스프레드한 것이라
    // words[] 가 없다. fsrs 기준값과 재출제용 단어 객체를 문제 자신에서 얻는다.
    const isSingleWordQuestion = !Array.isArray(setWords) && currentQuestion?.id === wordId;
    // 진행바(utils/studyProgress.js)가 채점 순간 이 단위를 채우도록 정오답을 즉시 기록한다 —
    // 값은 세트 완료 콜백(handlePluginComplete)이 나중에 쓰는 results.every 와 같다(단일 결과).
    if (isSingleWordQuestion && currentQuestion) currentQuestion.isCorrect = !!wordIsCorrect;
    const fsrsBefore = target?.fsrs ?? (isSingleWordQuestion ? currentQuestion?.fsrs : undefined);
    // tier_target/tier_shown(계약 4·5절) — cardMatch는 words[] 안의 단어별로, 단일 단어
    // 플러그인은 문제 자신(currentQuestion)에 붙어 있다(둘 다 mapRecommendItemToWord 출처).
    const tierTarget = target?.tierTarget ?? (isSingleWordQuestion ? currentQuestion?.tierTarget : null) ?? null;
    const tierShown = target?.tierShown ?? (isSingleWordQuestion ? currentQuestion?.tierShown : null) ?? null;
    // 문제에 쓰인 예문(FRESH_SENTENCE_CONTRACT §4·5) — cardMatch는 뜻/카드 매칭이라 해당 없음(target에 없음).
    const exampleHash = target?.exampleHash ?? (isSingleWordQuestion ? currentQuestion?.exampleHash : null) ?? null;

    /*
      문장 만들기(조립형 3종)는 암기 상태와의 연관을 최소화한다(2026-10-02 QA) — **오답이어도
      단어 상태(FSRS·작물·시듦·XP·콤보)에 페널티를 주지 않는다.** 서버 /study/log 는
      was_correct=false 를 받으면 FSRS lapse·콤보 리셋을 만들므로, 오답은 로그 자체를 보내지
      않는다(농장 상태 바·낙관 fsrs 표시도 만들지 않는다). 정답일 때만 평소 경로로 기록한다 —
      그 단어를 이 세션에서 아직 기록하지 않았다면(loggedVocaIdsRef) 재출제(isRetry) 정답도
      첫 기록으로 인정한다. plant 는 세션 일괄 기록(plantAttemptsRef)에서 이 유형을 아예 뺀다.
    */
    const isArrangeQ = isArrangeQuestionType(questionType);
    const skipGrading = isArrangeQ && !wordIsCorrect;
    // 일반 학습 — 조립형은 오답이면 /study/log 를 안 보내므로(skipGrading) 본 예문 기록이 빠진다.
    // 정답·오답 모두 가벼운 노출 기록(FSRS 무영향)을 보낸다. plant 는 단어 완료 시 plantQuestionDone 이 배치 전송한다.
    if (isArrangeQ && !isMultiStepMode && !currentQuestion?.isRetry) {
      sendExampleSeen([{ user_voca_id: wordId, example_hash: exampleHash }]);
    }
    if (skipGrading && currentQuestion) {
      // 컴포넌트가 낙관값(stability 0.5)으로 적어 둔 "다음 상태"를 되돌린다 — 결과 화면
      // '암기 상태 하락' 집계에 이 오답이 잡히지 않게.
      currentQuestion.nextMemoryStateKey = currentQuestion.prevMemoryStateKey ?? currentQuestion.nextMemoryStateKey;
    }

    // 게스트 온보딩 로컬 콤보 — 첫 시도만 반영. 카드매칭은 항상 첫 시도(오답 카드는 사지선다로
    // 재출제되어 이 경로를 다시 타지 않음)지만, 빈칸 채우기는 같은 유형으로 재출제되어 다시 온다.
    if (!currentQuestion?.isRetry && !skipGrading) bumpLocalCombo(!!wordIsCorrect);

    /*
      카드별 농장 상태 바 — 카드는 카드(단어)마다 따로 붙는다. 구버전 UI 폴백을 없앴기
      때문에 값이 비면 화면이 빈다 — 그건 그대로 유지한다.

      【언제 낙관값을 바로 쓰고, 언제 정지시키나】 applyOptimisticGrade(MCQ 경로)와 같은
      원칙이다 — 상세 이유는 그쪽 주석과 farmOptimistic.js 상단 참고. 이 카드가 실제로
      /study/log 를 보낼 대상(아래 로깅 게이트와 정확히 같은 조건)이면 pendingFarmPayload
      로 채점 전 값에 멈춰 세워 두고, sendCardLog 응답이 도착했을 때 그 값 하나로만
      움직인다. 게스트·이미 로깅된 카드처럼 응답이 안 오는 자리만 낙관값을 바로 쓴다.
    */
    if (isMultiStepMode) {
      // plant — 카드마다 /study/log 를 보내지 않는다. 이 카드(블록)가 재출제가 아닌
      // 첫 시도일 때만 AND 로 접어 기록한다(logIfFirstAttempt 쪽 주석 참고). 농장 상태
      // 바(cardFarmByWordId)는 만들지 않는다 — 응답이 영영 안 오므로 그대로 두면 정지
      // 상태로 남는데, plant 는 그 표시 자체를 쓰지 않는다(플러그인 컴포넌트가
      // farmByWordId 없으면 알아서 숨긴다).
      if (!currentQuestion?.isRetry && !isArrangeQ) recordPlantAttempt(wordId, !!wordIsCorrect);
      if (!currentQuestion?.isRetry) plantQuestionDone(wordId, progressIndex);
    } else if (!skipGrading) {
      const optimistic = computeOptimisticFsrs(fsrsBefore, !!wordIsCorrect);
      const buildOptimisticCardFarm = (base) => optimisticFarmPayload({
        base,
        fsrsBefore,
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
          [wordId]: pendingFarmPayload({ base: prev[wordId], fsrsBefore, wasCorrect: !!wordIsCorrect }),
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
          tier_target: tierTarget,
          tier_shown: tierShown,
          // fillInTheBlankTyping 오타 허용 정답(계약 3-2·4절) — 그 외 유형은 항상 false.
          typo: !!typo,
          // 문제에 쓰인 예문(FRESH_SENTENCE_CONTRACT §4·5) — 없으면 보내지 않는다.
          ...(exampleHash ? { example_hash: exampleHash } : {}),
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
    }

    // 재출제(빈칸 채우기 등, isSingleWordQuestion) 카드를 결국 맞혔을 때만 — 위
    // notifyRetryCorrect 주석 참고. cardMatch/cardMatchListening 재출제는 사지선다로
    // 변환돼 이 경로로 다시 오지 않으므로(handleClickExamOption 쪽에서 처리) 여기선
    // 사실상 fillInTheBlank류 재출제에만 해당한다.
    // (문장 만들기는 위에서 정답 시 직접 /study/log 로 기록했으므로 재출제 정답 통지를 따로 보내지 않는다)
    if (wordIsCorrect && currentQuestion?.isRetry && !isArrangeQ) {
      notifyRetryCorrect(wordId, questionType);
    }

    if (wordIsCorrect) {
      // 일반 구간과 별도로 붙은 문장 만들기(isSentenceExtra)는 진행률(통과 집합)에 관여하지 않는다.
      if (!currentQuestion?.isSentenceExtra) markVocaPassed(wordId);
      return;
    }

    // 오답 단일 단어 문제(빈칸 채우기 + 출제형 4종): 자동 추천 세션(tierShown 有)이면
    // requeue-easier(계약 6절)로 한 칸 쉬운 유형을 받아 재출제 — 조립/타이핑류는 서버가 조각을
    // 새로 섞어야 해서 로컬로는 다시 만들 수 없다. 아니면(설정 시트로 유형을 직접 고른 테스트)
    // 기존처럼 **같은 유형**으로 다시 만든다(예문·선택지 새로 섞음). 카드와 달리 콜백이
    // onComplete 하나라 이중 호출이 없으므로 cardRetryEnqueuedRef 가드를 타지 않는다 —
    // 재출제에서 또 틀리면 다시 재출제(상한은 enqueueRetry/requeueEasier의 MAX_RETRY).
    // 같은 유형으로 못 만들면(예문이 사라진 비정상 캐시 등) 사지선다로 폴백한다.
    //
    // 출제형 4종(sentenceArrange/sentenceArrangePartial/listenArrange/fillInTheBlankTyping)은
    // 예외(2026-09-29 실기기 QA) — "더 쉬운 유형으로 강등"이 아니라 **같은 유형·같은 문제**로
    // 그대로 재출제한다(난이도/목적이 다른 콘텐츠라 강등이 어색함). requeueEasier를 아예 호출하지
    // 않고, 아래 로컬 재구성(같은 questionPayload 재사용)으로 곧장 떨어진다.
    if (isSingleWordQuestion && isSingleWordPluginType(questionType)) {
      if (typeof currentQuestion?.tierShown === 'number' && !isSentenceQuestionType(questionType)) {
        requeueEasier(currentQuestion);
        return;
      }
      // 문제 전용 필드를 벗겨 순수 단어 객체로 되돌린 뒤 다시 출제한다
      const wordObj = { ...currentQuestion };
      ['options', 'resultIndex', 'shownText', 'blankText', 'blankFill', 'arrange', 'typing',
        'questionType', 'isCorrect', 'userResultIndex', 'isRetry'].forEach(k => { delete wordObj[k]; });
      const pool = collectSessionWordPool(testQuestions);
      const regenerated = getQuestionType(questionType)?.setupQuestions?.([wordObj], pool) ?? [];
      const retryQuestion = regenerated[0] ?? buildMultipleChoiceFromWord(wordObj, pool);
      enqueueRetry(progressIndex, retryQuestion);
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
    // words[].isCorrect 는 제자리 변경이라 리렌더 트리거가 따로 필요하다(진행바 즉시 반영).
    setProgressTick((t) => t + 1);
  };

  // opts.processed — 플러그인이 채점 순간 onCardMatched 로 모든 단어를 이미 처리했다는 표시.
  // (2026-09-26) 빈칸 채우기는 예전엔 넘어가는 순간에야 처리(=로그·농장 payload 생성)해서
  // 채점 후 상태 바가 사실상 안 보였다. 지금은 카드와 같이 채점 즉시 처리하고, 여기서는
  // 세션 진행만 한다 — 다시 처리하면 게스트 콤보가 두 번 오르고 서버값이 낙관값으로 덮인다.
  const handlePluginComplete = (results, opts = {}) => {
    const currentQuestion = testQuestions[progressIndex];
    const setWords = currentQuestion.words;
    const questionType = currentQuestion.questionType;

    // 각 단어 처리(카드 채점 시 이미 처리된 단어는 loggedVocaIdsRef/passed Set/cardRetryEnqueuedRef로 중복 방지)
    const retryCountBefore = retryEnqueueCounterRef.current;
    if (!opts.processed) results.forEach(r => processCardWord(r, currentQuestion, setWords, questionType));
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
    // plant·script는 위 setUpdateRecentStudyStateAndStatus와 같은 이유(isMultiStepMode)로
    // 1차 판정(통과 고유 단어 수)을 쓰지 않는다 — 같은 단어/글자가 여러 단계(같은 vocaId)로
    // 반복 등장해 조기 종료로 이어지기 때문. 큐 소진만으로 판단한다.
    const isSessionDone = (isMultiStepMode || hasPhaseFlow) ? isQueueExhausted : (currentPassedCount >= targetCount || isQueueExhausted);

    commitStudyState(isSessionDone, {
      [testType]: {
        ...recentStudy[testType],
        progress_index: isSessionDone ? null : nextIndex,
        status: isSessionDone ? "end" : "learning",
        study_data: testQuestions,
        updated_at: new Date().toISOString(),
      }
    });

    if (!isSessionDone) {
      advanceWithInterlude(nextIndex, () => {
        setProgressIndex(nextIndex);
        setIsCorrect(null);
        setUserSelected(null);
        setIsAnswered(false);
        setIsStay(false);
        setUpdateType(null);
        setMemoryStateChange(null);
      });
    }
  };

  // 채점 없는 "정보 전달" 슬라이드 완료 — wordIntro(plant ①만나기)·scriptIntro(글자 ①만나기)
  // 공통(NO_GRADE_QUESTION_TYPES, plugins/questionTypes/index.js). processCardWord/
  // markVocaPassed/logIfFirstAttempt를 전혀 타지 않는다 — 이 슬라이드는 정오답이 없고,
  // 결과 화면 집계에서도 제외된다(pages/TakeTest.jsx resultQuestions 필터).
  // 큐 순서로만 다음으로 넘어간다(이 단어의 나머지 단계가 항상 뒤따르므로 큐 소진도
  // 사실상 발생하지 않는다 — 방어적으로만 처리).
  const handleNoGradeNext = () => {
    const nextIndex = progressIndex + 1;
    const isSessionDone = nextIndex >= testQuestions.length;

    commitStudyState(isSessionDone, {
      [testType]: {
        ...recentStudy[testType],
        progress_index: isSessionDone ? null : nextIndex,
        status: isSessionDone ? "end" : "learning",
        study_data: testQuestions,
        updated_at: new Date().toISOString(),
      }
    });

    if (!isSessionDone) {
      advanceWithInterlude(nextIndex, () => {
        setProgressIndex(nextIndex);
        setIsCorrect(null);
        setUserSelected(null);
        setIsAnswered(false);
        setIsStay(false);
        setUpdateType(null);
        setMemoryStateChange(null);
      });
    }
  };

  // 슬라이드 전환 variants/transition은 utils/studySlideMotion.js 단일 소스(2026-09-29 —
  // 글자 학습 문제 유형 플러그인(plugins/questionTypes/script/*)도 같은 값을 써서
  // 전환이 어긋나지 않게 한다).
  const slideVariants = SLIDE_VARIANTS;

  // 성능 최적화를 위한 transition 설정
  const optimizedTransition = {
    duration: 0.2,
    ease: [0.4, 0, 0.2, 1] // cubic-bezier for smoother animation
  };

  // 역방향 사지선다(뜻→단어) 여부 — 카드 상단 텍스트/선택지 텍스트/TTS 타이밍을 이 값으로 분기
  const isReverseChoice = testQuestions[progressIndex]?.questionType === 'reverseMultipleChoice';
  // TtsRipple(카드 영역) 노출 조건 — 일반 유형은 "등장 자동재생 중(채점 전)"에만.
  // reverseMultipleChoice는 카드에 "뜻"만 있으므로, 뜻을 읽는 동안(speakingTarget==='meaning')만
  // 카드에 리플을 띄운다 — 채점 후 "단어"를 읽을 때는 소리만 재생하고 선택지 버튼에는
  // 아무 표시도 띄우지 않는다(카드/선택지 어디에도 스피커 아이콘 없음).
  const showTtsRipple = isReverseChoice
    ? (isSpeaking && speakingTarget === 'meaning')
    : (testQuestions[progressIndex]?.questionType !== 'multipleChoiceListening' && isSpeaking && !isAnswered);

  // 플러그인 컴포넌트가 있으면 동적 렌더링 (cardMatch 등)
  // 진행바(듀오링고 방식, 모든 세션 유형 공통) — 계산은 utils/studyProgress.js 순수 함수.
  // 분모 = 학습 시작 시 정해진 채점 단위 수(단일 문제 1, 카드 맞추기류는 세트 단어 수 / 비채점
  // 슬라이드·재출제 제외). 분자 = 채점 순간 정답으로 채워진 단위 수(오답은 그대로, 재출제 정답 시 채움).
  // testQuestions 의 isCorrect 에서 매 렌더 재계산하므로 복원·재마운트에도 그대로 복구된다.
  // 세션 종료 판정(passedVocaIdsRef·큐 소진)과는 무관한 표시 전용 값이다.
  const studyProgress = computeStudyProgress(testQuestions);
  const totalWordCount = Math.max(1, studyProgress.total);
  const displayPassedCount = isFinishing ? totalWordCount : Math.min(studyProgress.done, totalWordCount);

  const currentPlugin = getQuestionType(testQuestions[progressIndex]?.questionType);

  // 부패 진단(시안 6절) — 진행바가 주황이 되고, 채점 전부터 삽 pill 이 붙는다.
  const isDiagnosis = isDiagnosisQuestion(testQuestions[progressIndex]);
  // 콤보 마일스톤(5·10)에서 진행바 색 단계 전환 — 진단(부패) 모드의 주황이 우선.
  const progressFillClass = isDiagnosis
    ? 'bg-crop-carrot'
    : (isComboMode ? getComboFillClass(combo?.current ?? 0) : 'bg-primary-main-600');

  // 농장 상태 바 노출 여부 — 지금 보고 있는 문제의 payload 일 때만 띄운다(응답 지연 대비).
  // 채점하면 applyOptimisticGrade 가 낙관값이라도 반드시 세우므로 이 조건은 사실상
  // "채점했고 그 문제의 값인가"만 본다. 폴백 UI 는 없다.
  const currentVocaId =
    testQuestions[progressIndex]?.vocaIndexId ?? testQuestions[progressIndex]?.id;
  // plant — 문제별 서버 응답(farm payload)에 의존하는 표시라 세션 종료 전까지 응답 자체가
  // 없다. applyOptimisticGrade 가 세워 둔 낙관값이 있어도 이 화면에서는 늘 숨긴다.
  const showFarmBar =
    !isMultiStepMode &&
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
        onClick={() => { feel('tap'); handleSkipListening(); }}
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

  // 콤보 마일스톤 인터루드(전체 화면 포털) — 두 렌더 경로 공통
  const interludeEl = !interlude ? null : (interlude.type === 'phase'
    ? <PhaseInterlude key={interlude.id} kind={interlude.kind} onDone={handleInterludeDone} />
    : <ComboInterlude key={interlude.id} n={interlude.n} milestone={interlude.milestone} onDone={handleInterludeDone} />);

  // 구간 첫 문제로 (재)진입한 직후 — 인터루드가 끝나기 전엔 문제를 그리지 않는다.
  if (interlude?.hold) {
    return (
      <div className="flex flex-col h-[calc(100vh-var(--current-header-height)-var(--status-bar-height))] px-[16px] pt-[5px] pb-[20px]">
        {interludeEl}
      </div>
    );
  }

  if (currentPlugin?.component) {
    const PluginComponent = currentPlugin.component;
    // 채점 없는 슬라이드(wordIntro·scriptIntro)는 일반 플러그인 완료 콜백(handlePluginComplete,
    // processCardWord/markVocaPassed/로깅을 태운다)이 아니라 전용 핸들러로 그냥 다음
    // 슬라이드로만 넘어간다(위 handleNoGradeNext 주석 참고).
    const isNoGrade = isNoGradeQuestionType(testQuestions[progressIndex]?.questionType);
    const pluginOnComplete = isNoGrade ? handleNoGradeNext : handlePluginComplete;
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
        {interludeEl}
        <StudyProgressBar
          displayPassedCount={displayPassedCount}
          totalWordCount={totalWordCount}
          fillClass={progressFillClass}
        />
          <div className="relative flex flex-1 min-h-0 overflow-hidden">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={progressIndex}
              custom={1}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={SLIDE_TRANSITION}
              style={{ willChange: 'transform, opacity' }}
              className="w-full h-full absolute"
            >
              <PluginComponent
                question={testQuestions[progressIndex]}
                testType={testType}
                onComplete={pluginOnComplete}
                onCardMatched={handleCardMatched}
                farmByWordId={cardFarmByWordId}
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
        {interludeEl}
      <StudyProgressBar
        displayPassedCount={displayPassedCount}
        totalWordCount={totalWordCount}
        fillClass={progressFillClass}
      />

      <div className="relative middle flex flex-1 min-h-0 overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={progressIndex}
            custom={1}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={SLIDE_TRANSITION}
            style={{ willChange: 'transform, opacity' }}
            className="flex flex-col gap-[15px] w-full h-full absolute"
          >
            {['multipleChoice', 'multipleChoiceListening', 'reverseMultipleChoice'].includes(testQuestions[progressIndex]?.questionType) && (
              <>
                {/*
                  【카드 크기·단어 위치는 채점 전후 같다 — 2026-09-26 실기기 피드백】
                  padding 을 위아래 대칭(45px)으로 두어 단어·음파·O/X 가 카드 실제 정중앙에 선다
                  (2026-09-27 — 예전 pt 30 / pb 60 은 단어가 카드 중심보다 15px 위였다).
                  상태 바가 단어 아래 끝에 닿는 작은 카드에서만 LiftAboveBar 가 필요한 만큼 위로 비킨다.
                  min-h-0: 채점 후 늘어나는 내용(ja 읽기 줄 등)이 flex-1 카드를 밀어 키우지 못하게.
                  상태 바·시점 문구·힌트 버튼은 absolute 오버레이라 높이에 관여하지 않는다.
                */}
                <motion.div
                  data-lift-card=""
                  className={`
                    relative
                    flex items-center justify-center flex-1 min-h-0
                    w-full
                    py-[45px]
                    rounded-[12px]
                    bg-layout-gray-50 dark:bg-layout-gray-dark
                    cursor-pointer
                  `}
                  initial={CARD_ENTER_INITIAL}
                  animate={CARD_ENTER_ANIMATE}
                  whileTap={{ scale: 0.96 }}
                  transition={CARD_ENTER_TRANSITION}
                  style={{ willChange: 'transform, opacity' }}
                  onClick={() => {
                    feel('tap');
                    handleClickTTS();
                  }}
                >

                  {/* 일반 유형 클릭(TTS 재생) 시 ripple — 아이콘 없이 단어 중심에서 확산.
                      padding 이 대칭이라 단어 중심 = 카드 정중앙 → 카드 전체를 앵커로 쓴다.
                      (채점 전에만 뜨므로 LiftAboveBar 로 단어가 비킬 일과 겹치지 않는다) */}
                  {showTtsRipple && (
                    <div aria-hidden className="absolute inset-0 pointer-events-none">
                      <TtsRipple size={160} duration={speakDuration} className="z-[0]" />
                    </div>
                  )}

                  {/* 우측 상단 - 채점 전: 최근 학습 시점 / 채점 후: 다음 복습 예정일(오답은 비움).
                      농장 상태 바에서 옮겨 온 "언제" 문구 — StudyTimingTag.jsx 참고. */}
                  <StudyTimingTag
                    answered={isCorrect !== null}
                    fsrs={testQuestions[progressIndex]?.fsrs}
                    stage={testQuestions[progressIndex]?.farmStage}
                    farm={showFarmBar ? farmStatus : null}
                    wasCorrect={isCorrect}
                    nextReviewIso={testQuestions[progressIndex]?.displayNextReview ?? null}
                    isRetry={!!testQuestions[progressIndex]?.isRetry}
                  />

                  {/* 상단 중앙 - 암기 상태 배지 (채점 전에는 숨김)
                      농장 상태 바가 뜨면 같은 말을 두 번 하는 것이라 배지는 숨긴다.
                      부패 진단(6절)은 시안에 이 배지가 없다 — 하단 삽 pill 하나만 쓴다. */}
                  

                  <LiftAboveBar
                    active={showFarmBar || isDiagnosis}
                    topReserve={28}
                    className="relative z-[1] w-full flex justify-center"
                  >
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

                      <ResultMark
                        result={isCorrect}
                        replayKey={resumeReplayKey}
                        className="
                          absolute top-[50%] left-[50%] z-[-1]
                          translate-x-[-50%] translate-y-[-50%]
                        "
                      />
                      {isReverseChoice
                        ? currentQuestionDisplayMeanings.join(', ')
                        : <span lang={isJa(wordLang(testQuestions[progressIndex])) ? 'ja' : undefined}>{testQuestions[progressIndex].origin}</span>}
                      {/* ja: 채점 후에만 읽기(히라가나)를 보여 준다 — 채점 전엔 정답 힌트가 되므로 숨김 */}
                      {!isReverseChoice && isAnswered && isJa(wordLang(testQuestions[progressIndex])) && (() => {
                        const q = testQuestions[progressIndex];
                        return shouldShowReading(q)
                          ? <ReadingLine reading={getReading(q)} className="block mt-[4px]" />
                          : null;
                      })()}
                    </h2>
                  )}
                  </LiftAboveBar>
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
                      data-farm-result-bar=""
                      onClick={(e) => e.stopPropagation()}
                    >
                      <FarmStatusBar diagnosis />
                    </motion.div>
                  )}

                  {/* 하단 - 채점 후: 농장 상태 바 — 유형 공통(FarmResultBar). 연출 끝 신호로 전환 게이트를 푼다. */}
                  {showFarmBar && (
                    <FarmResultBar
                      farm={farmStatus}
                      replayKey={resumeReplayKey}
                      className={`
                        absolute bottom-[14px] left-[14px] z-[2]
                        ${testType === "test" && isAnswered ? 'right-[50px]' : 'right-[14px]'}
                      `}
                      onAnimStart={advanceGate.farmStarted}
                      onSettled={advanceGate.farmSettled}
                    />
                  )}

                  {/* 하단 중앙 - 채점 후: 다음 복습 예정일 (채점 전에는 숨김) */}
                  {/* displayNextReview는 채점 시 고정 — 백엔드 응답으로 덮지 않아 깜빡임 없음 */}
                  {/* 농장 상태 바가 같은 자리에서 다음 복습일까지 말하므로 그때는 숨긴다 */}
                  
                  {testType === "test" && isAnswered && (
                    <motion.button
                      onClick={(e) => {
                        e.stopPropagation();
                        feel('tap');
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
                        animate={isWrongSelected
                          ? pickVariant('shake', reducedMotion).animate
                          : (isCorrect === true && userSelected === index ? pickVariant('correctPop', reducedMotion).animate : undefined)}
                        // 탭 = 곧바로 채점 → 톡 대신 채점 큐(correct/wrong)가 그 순간을 맡는다(handleClickExamOption).
                        onClick={() => handleOptionClick(index, option)}
                        disabled={isAnswered}
                        style={{ willChange: 'transform' }}
                        className={`
                          relative
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
                          transition-colors duration-150
                          ${btnStyle}
                        `}
                      >
                        <ShineSweep play={isCorrect === true && userSelected === index} />
                        {isReverseChoice ? option.origin : option.displayMeanings.join(", ")}
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