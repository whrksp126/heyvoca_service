import React, { useEffect, useRef, useState } from 'react';
import Main from '../components/takeTest/Main';
import Header from '../components/takeTest/Header';
import { useLocation, useNavigate } from 'react-router-dom';
import { useVocabulary } from '../context/VocabularyContext';
import { getQuestionType, isFillInTheBlankType, isSingleWordPluginType, isSentenceQuestionType, isNoGradeQuestionType } from '../plugins/questionTypes';
import { mapRecommendItemToWord } from '../utils/studyRecommendMapping';
import { buildScriptTestQuestions } from '../utils/scriptQuestions';
import { isListeningSkipActive, mapSkippedQuestionType } from '../utils/listeningSkip';
import { useNewBottomSheetActions } from '../context/NewBottomSheetContext';
import { MEMORY_STATES } from '../utils/common';
import { ConfirmNewBottomSheet } from '../components/newBottomSheet/ConfirmNewBottomSheet';
import { AlertNewBottomSheet } from '../components/newBottomSheet/AlertNewBottomSheet';
import { AppHistory } from '../utils/appHistory';
import { getStudyRecommend, finishStudySession, predictReviews, logStudyQuestion } from '../api/study';
import { warmTts, collectTestTexts, collectTestFullTexts, prepareTtsWithProgress } from '../api/tts';
import ProgressSplash from '../components/common/ProgressSplash';
import { useUser } from '../context/UserContext';
import { useOnboardingUnlock } from '../context/OnboardingUnlockContext';
import { saveStudyConfig, loadStudyConfig } from '../utils/nextStudy';
import { getGuestTrial, clearGuestTrial, patchGuest } from '../utils/guestStorage';
import { getPendingReplantIds } from '../utils/replantPending';
import { beginStudySession } from '../utils/studySessionGuard';
import { wordsOverlap } from '../utils/meaningConcept';
import { attachStudyHistory } from '../utils/studyHistory';

// 발음(TTS) 준비 게이트 최대 대기(ms). 이 시간을 넘기면 준비가 덜 됐어도 학습에 진입한다
// (나머지는 백그라운드에서 계속 준비) — 준비 화면에서 무한 대기하는 것을 방지.
const PREPARE_MAX_WAIT_MS = 8000;
// 진입 게이트로 "대기"할 앞쪽 문제 수. 전체를 기다리면 너무 오래 걸리므로, 처음 몇 문제의
// 자동재생 단어만 확실히 준비되면 진입하고 나머지는 백그라운드로 이어서 캐싱한다.
const GATE_PRIORITY_QUESTIONS = 3;

// 설정 시트(navigate state.data)가 "AI 추천 유형"을 쓰는지, "직접 고른 유형"을 쓰는지 판정 —
// buildTestQuestions(로컬 유형 분배)와 setupTestQuestions(/study/recommend 요청 파라미터
// 구성) 양쪽에서 같은 기준을 써야 한다(계약 7절 — 안 그러면 서버는 추천 모드로 알고
// 응답했는데 프론트만 "직접 선택"으로 착각해 tier/questionPayload 해석이 어긋난다).
// useRecommendedTypes — quick(홈 물주기/빠른 복습) 전용 플래그. quick은 questionType에
// "폴백용 후보 배열"(QUICK_QUESTION_TYPES)을 넘기면서 동시에 백엔드 suggested_question_type을
// 우선 쓰길 원하므로, questionType 배열 자체에 'recommended' 문자열을 섞는(=유효하지 않은
// 타입으로 오염시키는) 대신 별도 플래그로 분리했다.
const isRecommendedModeData = (data) =>
  !!data?.useRecommendedTypes ||
  !data?.questionType ||
  data.questionType === 'recommended' ||
  (Array.isArray(data.questionType) && data.questionType.includes('recommended'));

const TakeTest = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { state: rawState } = useLocation();
  const { isLogin } = useUser();
  // 기기 WebView에서 navigate state가 유실돼도 맛보기가 게스트로 뜨도록 localStorage에서 복원.
  const [pendingGuestTrial] = useState(() => getGuestTrial());
  const state = rawState || (
    !isLogin && Array.isArray(pendingGuestTrial) && pendingGuestTrial.length > 0
      ? { testType: 'today', guestMode: true, guestQuestions: pendingGuestTrial }
      : rawState
  );
  const { isRecentStudyLoading, isVocabularySheetsLoading, vocabularySheets, recentStudy, updateRecentStudy, updateVocabularySheetServer, updateRecentStudyServer, updateRecentStudyState, fetchVocabularySheets, userDictionary } = useVocabulary();
  const { pushAwaitNewBottomSheet } = useNewBottomSheetActions();
  const { completeMission } = useOnboardingUnlock();
  const [testQuestions, setTestQuestions] = useState([]);
  const [isTestQuestionsSetting, setIsTestQuestionsSetting] = useState(true);
  // TTS 사전 캐싱(발음 준비) 게이트 — 준비가 끝나기 전엔 학습 화면 대신 준비 스플래시를 보여준다.
  const [isPreparingTts, setIsPreparingTts] = useState(false);
  const [prepareProgress, setPrepareProgress] = useState(0);
  const [progressIndex, setProgressIndex] = useState(0);
  const navigate = useNavigate();
  // 업데이트해야 할 단어장 아이디를 저장할 Set (중복 방지)
  const [pendingUpdateSheetIds, setPendingUpdateSheetIds] = useState(new Set());
  // 업데이트해야 할 단어 아이디와 데이터를 저장할 Map (중복 방지, 마지막 상태 저장)
  const [pendingUpdateWords, setPendingUpdateWords] = useState(new Map());
  // 백엔드 세션 ID (추천 응답에서 받음)
  const studySessionRef = useRef(null);
  // 진행 중인 /study/log Promise 큐 — 결과 화면/홈 카운터 갱신 전에 모두 await
  const pendingLogPromisesRef = useRef([]);
  // plant(새 씨앗 심기) 전용 — 단어별 "세션 내 모든 첫 시도가 정답이었는지"(Main.jsx가
  // 문제마다 채워 넣는다. /study/log는 문제마다 보내지 않고, 세션이 끝날 때(아래
  // handleUpdateAndNavigate) 이 값을 읽어 단어당 1회씩 일괄 전송한다.
  const plantAttemptsRef = useRef(new Map());

  // ─── 재출제 시스템용 ref ───────────────────────────────────────────────────
  // 세션에서 /study/log를 이미 보낸 user_voca_id 집합 (첫 시도 1회만 로깅 보장)
  const loggedVocaIdsRef = useRef(new Set());
  // 단어별 재시도 횟수 Map (무한루프 방지 상한: 10회)
  const retryCountMapRef = useRef(new Map());
  // 세션에서 최소 1번 정답 처리된 고유 단어 ID 집합 (완료 판정 + 진행률용)
  const passedVocaIdsRef = useRef(new Set());
  // 세션의 고유 단어 수 (진행률 분모 — 초기화 시 확정)
  const totalUniqueVocaCountRef = useRef(0);
  // 카드매칭 오답 → 사지선다 변환 재출제가 이미 큐에 삽입된 단어 ID 집합
  // (카드 1장 즉시 콜백(onCardMatched)과 세트 완료 콜백(onComplete)이 같은 단어를 중복 처리하므로
  //  단어당 재출제를 정확히 1회만 큐잉하도록 방지)
  const cardRetryEnqueuedRef = useRef(new Set());

  // initializeTest가 이 마운트에서 이미 실제로 초기화(캐시 복원 또는 신규 생성)를 마쳤는지.
  // ── 왜 필요한가 ──
  // 학습 중 앱이 백그라운드로 가면 아래 handleVisibilityChange(hidden)가
  // updateVocabularySheetAndRecentStudyData → fetchVocabularySheets()를 호출하고, 이 함수는
  // VocabularyContext의 isVocabularySheetsLoading을 true→false로 토글한다. 그런데 이 fetch가
  // RN WebView가 백그라운드에서 네트워크/타이머를 멈추는 바람에 정지해있다가, 앱이 다시
  // 포그라운드로 돌아오는 순간에야 완료되는 경우가 많다 — 그 순간 isVocabularySheetsLoading이
  // false로 바뀌면서 아래 initializeTest useEffect(dep: [isRecentStudyLoading,
  // isVocabularySheetsLoading])가 재실행된다.
  // 재실행된 initializeTest는 "복원" 분기를 다시 타서 recentStudy[testType].study_data /
  // progress_index로 testQuestions·progressIndex를 덮어쓰는데, 이 recentStudy 스냅샷은
  // 카드매칭 같은 "세트 단위" 문제 진행 중엔 세트가 끝나기 전까지 갱신되지 않는다
  // (Main.jsx의 handleCardMatched는 카드 1장을 즉시 채점하지만 updateRecentStudyState는
  //  handlePluginComplete=세트 완료 시에만 호출한다). 그 결과 복귀 시 "같은 문제가 스플래시 없이
  // 다시 그려지고, 문제 화면(Main)이 통째로 재마운트되며 콤보 상태(Main의 combo useState +
  // 서버 재조회 useEffect)가 0부터 리셋됐다가 서버 최신값으로 점프해 콤보 배지가 다시
  // 팝업되는" 것처럼 보인다. 실제로는 reload가 아니라 이 effect의 불필요한 재실행이다.
  // 고치는 방법: initializeTest는 이 컴포넌트가 마운트된 동안 "한 번만" 실제로 초기화하도록
  // 가드한다. loading 플래그가 이후에 다시 토글돼도(백그라운드 복귀 포함) 이미 진행 중인
  // 세션 상태(testQuestions/progressIndex/각종 ref)는 절대 덮어쓰지 않는다.
  const hasInitializedTestRef = useRef(false);

  // 이 화면이 떠 있는 동안(게스트 맛보기 포함) "학습 세션 활성" 상태를 전역에 알린다.
  // buildVersion.js가 이 신호를 보고 백그라운드 복귀 시 페이지를 reload하지 않도록 막는다
  // (reload가 학습 도중 발생하면 진행 중이던 슬라이드가 초기화되고, 재출제 로깅 ref가 리셋되며
  //  /study/log가 중복 전송돼 암기 게이지가 과다 상승하는 문제로 이어졌다).
  useEffect(() => {
    const endSession = beginStudySession();
    return () => endSession();
  }, []);

  // Fisher-Yates 셔플 알고리즘 (더 정확한 랜덤 셔플)
  const shuffleArray = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };



  // 오답 선택지 풀 구성용 (백엔드 추천 응답에는 단어 본문만 오므로 vocabularySheets에서 풀을 구성)
  const buildAllWordsPool = (vocabularySheetId) => {
    const hasMeanings = (w) => Array.isArray(w?.meanings) && w.meanings.length > 0;
    const dedupeByWordId = (entries) => {
      const byId = new Map();
      for (const w of entries) {
        const existing = byId.get(w.id);
        if (!existing) {
          byId.set(w.id, w);
          continue;
        }
        if (!hasMeanings(existing) && hasMeanings(w)) {
          byId.set(w.id, w);
        }
      }
      return Array.from(byId.values());
    };

    if (vocabularySheetId === "all") {
      return dedupeByWordId(
        vocabularySheets.flatMap(sheet =>
          sheet.words.map(word => ({ ...word, vocabularySheetId: sheet.id }))
        )
      );
    }
    if (Array.isArray(vocabularySheetId)) {
      const idSet = new Set(vocabularySheetId);
      return dedupeByWordId(
        vocabularySheets
          .filter(sheet => idSet.has(sheet.id))
          .flatMap(sheet =>
            sheet.words.map(word => ({ ...word, vocabularySheetId: sheet.id }))
          )
      );
    }
    const vocabularySheet = vocabularySheets.find(sheet => sheet.id === vocabularySheetId);
    return vocabularySheet ? vocabularySheet.words : [];
  };

  // ─── 문제 유형 분배 ───────────────────────────────────────────────────────
  const buildTestQuestions = (selectedWords, allWords, vocabularySheetId) => {
    const questionTypesArr = Array.isArray(state.data.questionType)
      ? state.data.questionType
      : [state.data.questionType];

    // Phase 2.2: 사용자가 명시적으로 유형을 선택했는지 판단(판정 기준: 위 isRecommendedModeData).
    const isRecommendedMode = isRecommendedModeData(state.data);

    // "듣기 문제 건너뛰기"가 활성이면 듣기 유형을 일반 유형으로 변환해 출제
    const skipListening = isListeningSkipActive();
    const resolveType = (type) => (skipListening ? mapSkippedQuestionType(type) : type);

    // 백엔드가 이 단어에 제안한 suggested_question_type을 "지금 이 화면에서 실제로 쓸 수 있는지"
    // 검증한다.
    // 버그 수정(2026-09): 출제형 4종(sentenceArrange/sentenceArrangePartial/listenArrange/
    // fillInTheBlankTyping)은 서버가 word.suggestedQuestionType과 **정확히 같은** 유형에만
    // question_payload를 실어 준다(plugins/questionTypes/index.js buildArrangeQuestions·
    // buildTypingQuestions). 직접 유형 선택(추천 아님) 모드에서 이 값을 계속 무시하고
    // questionTypesArr 안에서 프론트가 따로 무작위로 유형을 고르면, 그 무작위 선택이
    // 서버가 실어 준 payload의 유형과 거의 항상 어긋나 setupQuestions가 매번 빈 배열을
    // 반환하고 매 단어가 (선택하지 않은) multipleChoice로 로컬 폴백됐다 — "문장 만들기+빈칸
    // 입력만 골랐는데 사지선다가 나온다" 버그의 원인. 직접 선택 모드에서도 백엔드가 준 제안을
    // 따르되(서버가 이미 question_types 파라미터로 이 단어가 실제로 쓸 수 있는 유형 중에서만
    // 배정했다 — SENTENCE_QUESTIONS_CONTRACT.md 7절), 방어적으로 questionTypesArr(사용자가
    // 고른 유형) 안에 있는 값인지 한 번 더 검증한다 — 아니면(백엔드 완전 폴백 등) 무시하고
    // null(호출부의 randomType/fallbackType 경로)로 넘긴다. 프론트 플러그인이 비활성
    // (enabled:false, 예: fillInTheBlank)이어도 마찬가지.
    const resolveSuggestedType = (word) => {
      const suggested = word?.suggestedQuestionType;
      if (!suggested) return null;
      const plugin = getQuestionType(suggested);
      if (plugin && plugin.enabled === false) return null;
      if (!isRecommendedMode && !questionTypesArr.includes(suggested)) return null;
      return suggested;
    };

    const wordsWithSheetId = selectedWords.map(word => ({
      ...word,
      vocabularySheetId: vocabularySheetId !== "all" ? vocabularySheetId : word.vocabularySheetId,
    }));

    // 역방향(뜻→단어) 오답 선택지용 — 두 단어의 뜻이 하나라도 겹치는지(concept_id 교집합
    // 우선, 없으면 정규화 뜻 문자열 교집합으로 폴백. 단일 소스: utils/meaningConcept.js).
    // 겹치는 단어를 오답으로 섞으면 정답이 사실상 2개가 되어 버린다.
    // 품사(pos)는 이 화면까지 내려오는 단어 데이터에 없어 "같은 품사 우선" 규칙은
    // 적용하지 못했다 — 뜻 비대칭만 걸러내고 부족분은 임의로 채운다.

    const createMultipleChoiceQuestion = (word, questionType = 'multipleChoice') => {
      const wordKey = (w) => w.id ?? w.vocaIndexId;
      const otherWords = allWords.filter(w => wordKey(w) !== wordKey(word));

      let randomOptions;
      if (questionType === 'reverseMultipleChoice') {
        const nonOverlapping = otherWords.filter(w => !wordsOverlap(word, w));
        randomOptions = nonOverlapping.sort(() => Math.random() - 0.5).slice(0, 3);
        if (randomOptions.length < 3) {
          // 뜻이 안 겹치는 단어만으로 3개를 못 채우면 나머지는 임의로 보충
          const usedKeys = new Set(randomOptions.map(wordKey));
          const fillers = otherWords
            .filter(w => !usedKeys.has(wordKey(w)))
            .sort(() => Math.random() - 0.5)
            .slice(0, 3 - randomOptions.length);
          randomOptions = [...randomOptions, ...fillers];
        }
      } else {
        // 정방향(단어→뜻) 오답 선택지도 동일하게 뜻이 겹치는 단어는 우선 배제한다.
        const nonOverlapping = otherWords.filter(w => !wordsOverlap(word, w));
        randomOptions = nonOverlapping.sort(() => Math.random() - 0.5).slice(0, 3);
        if (randomOptions.length < 3) {
          const usedKeys = new Set(randomOptions.map(wordKey));
          const fillers = otherWords
            .filter(w => !usedKeys.has(wordKey(w)))
            .sort(() => Math.random() - 0.5)
            .slice(0, 3 - randomOptions.length);
          randomOptions = [...randomOptions, ...fillers];
        }
      }

      const options = [word, ...randomOptions].sort(() => Math.random() - 0.5);
      const resultIndex = options.findIndex(w => wordKey(w) === wordKey(word));
      return {
        ...word,
        options,
        resultIndex,
        questionType,
        isCorrect: null,
      };
    };

    // Phase 2.2: 단일 단어에 대해 suggestedQuestionType을 시도하고 실패 시 폴백
    const buildSingleWordQuestion = (word, fallbackType) => {
      const suggestedType = resolveSuggestedType(word);
      const targetType = resolveType(suggestedType ?? fallbackType ?? 'multipleChoice');
      const plugin = getQuestionType(targetType);

      // plugin이 없거나 setupQuestions가 없는 유형 (multipleChoice 계열)
      if (!plugin || !plugin.setupQuestions) {
        return createMultipleChoiceQuestion(word, targetType);
      }

      // 단일 단어 플러그인(빈칸 채우기 + 출제형 4종): 단일 단어로 시도, 자격 예문/서버 payload가
      // 없으면 multipleChoice 폴백.
      // 주의: 폴백 시 questionType은 반드시 'multipleChoice'로 고정해야 한다.
      //       fallbackType이 이 플러그인 id 인 채로 createMultipleChoiceQuestion에
      //       넘기면 options가 word 객체 배열인 문제가 생성되어 렌더 오류가 발생한다.
      if (isSingleWordPluginType(targetType)) {
        // 서버 payload 기반 유형은 suggested 유형과 같을 때만 만들어지므로, plant 응답의
        // 유형별 payload(questionPayloads)로 그 단계용 단어를 만들어 넘긴다.
        const payload = word.questionPayloads?.[type];
        const stepWord = payload && Object.keys(payload).length > 0
          ? { ...word, suggestedQuestionType: type, questionPayload: payload }
          : word;
        const generated = plugin.setupQuestions([stepWord], allWords);
        if (generated.length > 0) return generated[0];
        // 폴백: 항상 multipleChoice (options가 word 객체 배열인 문제 생성 방지)
        return createMultipleChoiceQuestion(word, 'multipleChoice');
      }

      // cardMatch 계열은 단일 단어로 처리 불가 → multipleChoice 폴백
      return createMultipleChoiceQuestion(word, 'multipleChoice');
    };

    if (questionTypesArr.length === 1 && !isRecommendedMode) {
      const singleType = resolveType(questionTypesArr[0]);
      const plugin = getQuestionType(singleType);
      // 단일 단어 플러그인 단독 선택: 자격 예문/서버 payload가 없는 단어를 통째로 버리지 않고
      // 단어별로 사지선다 폴백
      if (isSingleWordPluginType(singleType)) {
        return wordsWithSheetId.map(word => buildSingleWordQuestion(word, singleType));
      }
      if (plugin?.setupQuestions) {
        return plugin.setupQuestions(wordsWithSheetId, allWords);
      }
      return wordsWithSheetId.map(word => createMultipleChoiceQuestion(word, singleType));
    }

    // 추천 모드이거나 복수 유형인 경우: 단어별 suggestedQuestionType 우선 처리
    // cardMatch/cardMatchListening 계열은 세트 단위로 묶어야 하므로 별도 처리
    const shuffledWords = shuffleArray([...wordsWithSheetId]);
    const allQuestions = [];
    let wordIdx = 0;

    while (wordIdx < shuffledWords.length) {
      const currentWord = shuffledWords[wordIdx];

      // Phase 2.2: 추천 모드일 때 suggestedQuestionType 우선
      const suggestedType = resolveSuggestedType(currentWord);
      const randomType = questionTypesArr[Math.floor(Math.random() * questionTypesArr.length)];
      const chosenType = resolveType(suggestedType ?? randomType);

      const plugin = getQuestionType(chosenType);

      if (plugin?.setupQuestions) {
        const remaining = shuffledWords.length - wordIdx;

        // cardMatch 계열: 세트 단위 처리 (최소 2개 필요)
        if (chosenType === 'cardMatch' || chosenType === 'cardMatchListening') {
          if (remaining >= 2) {
            const chunkSize = Math.min(4, remaining);
            const chunk = shuffledWords.slice(wordIdx, wordIdx + chunkSize);
            const generated = plugin.setupQuestions(chunk, allWords);
            if (generated.length > 0) {
              allQuestions.push(...generated);
              wordIdx += chunkSize;
            } else {
              allQuestions.push(buildSingleWordQuestion(currentWord, randomType));
              wordIdx++;
            }
          } else {
            // 단어 1개만 남았으면 multipleChoice 폴백
            allQuestions.push(buildSingleWordQuestion(currentWord, randomType));
            wordIdx++;
          }
        } else {
          // fillInTheBlank 등 단일 단어 처리 가능한 유형
          allQuestions.push(buildSingleWordQuestion(currentWord, randomType));
          wordIdx++;
        }
      } else {
        // setupQuestions 없는 유형 (multipleChoice 계열)
        allQuestions.push(buildSingleWordQuestion(currentWord, chosenType));
        wordIdx++;
      }
    }
    return allQuestions;
  };

  // ─── plant(새 씨앗 심기) 전용 문제 구성 ───────────────────────────────────────
  // 새 단어 학습은 **단어 단위**로 진행된다(2026-09-29 실기기 피드백 반영). 한 단어를
  // ① 만나기(wordIntro, 채점 없음) → ② 영→한 사지선다 → ③ 한→영 사지선다 → ④ 빈칸 채우기
  // → ⑤ 빈칸 입력 → ⑥ 문장 만들기 순으로 끝까지 진행한 뒤에야 다음 단어로 넘어간다
  // (예전엔 유형별 블록으로 5단어를 번갈아 냈는데, 실기기 사용자가 "이 방식이 아니라 한
  // 단어를 끝까지"라고 명시적으로 요청했다). 단어 순서는 한 번만 섞고, 그 순서 그대로
  // 각 단어의 6단계를 이어 붙인다. 그 단어가 그 유형을 만들 수 없으면(예문 없음, 서버가
  // 이 단어에 그 유형의 payload를 안 실어줌 등 — 플러그인 setupQuestions의 기존 판단
  // 그대로) mcq로 대체하지 않고 그 단계만 건너뛴다.
  // 사지선다 오답 선택지는 buildTestQuestions.createMultipleChoiceQuestion과 같은 규칙
  // (뜻이 겹치는 단어는 배제)이지만, 저 함수는 buildTestQuestions 내부 클로저라 재사용할 수
  // 없어 여기 따로 둔다.
  const PLANT_STEP_TYPES = ['multipleChoice', 'reverseMultipleChoice', 'fillInTheBlank', 'fillInTheBlankTyping', 'sentenceArrange'];

  const buildPlantMcq = (word, allWords, questionType) => {
    const wordKey = (w) => w.id ?? w.vocaIndexId;
    const otherWords = (allWords ?? []).filter(w => wordKey(w) !== wordKey(word));
    const nonOverlapping = otherWords.filter(w => !wordsOverlap(word, w));
    let randomOptions = shuffleArray(nonOverlapping).slice(0, 3);
    if (randomOptions.length < 3) {
      const usedKeys = new Set(randomOptions.map(wordKey));
      const fillers = shuffleArray(otherWords.filter(w => !usedKeys.has(wordKey(w))))
        .slice(0, 3 - randomOptions.length);
      randomOptions = [...randomOptions, ...fillers];
    }
    const options = shuffleArray([word, ...randomOptions]);
    const resultIndex = options.findIndex(w => wordKey(w) === wordKey(word));
    return { ...word, options, resultIndex, questionType, isCorrect: null, userResultIndex: null };
  };

  // ① 만나기 슬라이드 — 채점 없음(Main.jsx가 questionType==='wordIntro'일 때 별도
  // 완료 핸들러로 바꿔치기해 정오답/통과 집계를 전혀 타지 않게 한다).
  const buildPlantIntroQuestion = (word) => ({
    ...word,
    questionType: 'wordIntro',
    isCorrect: null,
    userResultIndex: null,
  });

  const buildPlantTestQuestions = (selectedWords, allWords) => {
    const out = [];
    const order = shuffleArray(selectedWords); // 단어 순서는 한 번만 섞는다 — 블록 내부는 이 순서를 유지.
    for (const word of order) {
      out.push(buildPlantIntroQuestion(word));
      for (const type of PLANT_STEP_TYPES) {
        if (type === 'multipleChoice' || type === 'reverseMultipleChoice') {
          out.push(buildPlantMcq(word, allWords, type));
          continue;
        }
        const plugin = getQuestionType(type);
        if (!plugin?.setupQuestions) continue;
        // 서버 payload 기반 유형은 suggested 유형과 같을 때만 만들어지므로, plant 응답의
        // 유형별 payload(questionPayloads)로 그 단계용 단어를 만들어 넘긴다.
        const payload = word.questionPayloads?.[type];
        const stepWord = payload && Object.keys(payload).length > 0
          ? { ...word, suggestedQuestionType: type, questionPayload: payload }
          : word;
        const generated = plugin.setupQuestions([stepWord], allWords);
        if (generated.length > 0) out.push(generated[0]);
        // 못 만들면(예문/서버 payload 없음) 그 단계만 건너뛴다 — mcq 대체 없음.
      }
    }
    return out;
  };

  // ─── setupTestQuestions ─────────────────────────────────────────────────────
  // 백엔드 /study/recommend로 단어 + 세션을 받아 문제 구성. 응답 형식 오류 시 예외 throw.
  // 반환: { testQuestions, sessionId, composition, compositionStrategy }
  const setupTestQuestions = async (targetMemoryState, vocabularySheetId, count, testType, taskBucket) => {
    // ── plant(새 씨앗 심기) ──────────────────────────────────────────────────
    // "만나기" 단계(usePlantSession → StudyMain)가 GET /study/recommend?mode=plant를
    // 이미 한 번 호출해 5단어 + session_id를 확보해 뒀다. 여기서 또 부르면(오늘 남은 새
    // 씨앗 한도를 두 번 쓰거나, 카드에서 본 단어와 다른 단어가 나올 위험) 두 단계가 서로
    // 다른 단어를 보게 된다 — 같은 단어 목록을 그대로 이어 쓴다.
    if (testType === 'plant' && Array.isArray(state.data?.words) && state.data.words.length > 0) {
      const selectedWords = state.data.words;
      attachStudyHistory(selectedWords, userDictionary);
      let allWords = buildAllWordsPool('all');
      if (allWords.length === 0) allWords = selectedWords;
      const testQuestions = buildPlantTestQuestions(selectedWords, allWords);
      return {
        testQuestions,
        sessionId: state.data.sessionId ?? null,
        composition: null,
        compositionStrategy: null,
      };
    }

    // ── 글자(문자 학습) ──────────────────────────────────────────────────────
    // 학습장 "글자" 탭(components/script/ScriptFieldBody.jsx)이 GET /script/session으로
    // 이미 이번 줄/복습 대상 글자 + session_id를 받아 뒀다(plant와 같은 자리 — usePlantSession
    // 주석 참고). 여기서 또 부르지 않고 그대로 이어 쓴다. words는 utils/scriptData.js
    // mapScriptSessionItem으로 매핑된 "글자=단어" 모양이다.
    if (testType === 'script' && Array.isArray(state.data?.words) && state.data.words.length > 0) {
      const { script, mode } = state.data;
      const testQuestions = buildScriptTestQuestions(script, state.data.words, mode);
      return {
        testQuestions,
        sessionId: state.data.sessionId ?? null,
        composition: null,
        compositionStrategy: null,
      };
    }

    // bookIds 변환: "all" → null, 단일 id → [id], 배열 → 그대로
    let bookIds = null;
    if (vocabularySheetId && vocabularySheetId !== 'all') {
      bookIds = Array.isArray(vocabularySheetId) ? vocabularySheetId : [vocabularySheetId];
    }

    // targetMemoryState → targetStates: 백엔드 호환 값 변환
    // 테스트 설정 시트는 농장 작물 단계 키(unlearned/seed/sprout/leaf/carrot)를 보내고 백엔드도
    // 그 다섯 키를 그대로 받는다 — 여기서는 통과시킨다. 아래 레거시 키(shortTerm 등)는 다른
    // 호출부(예전 캐시·재시작 데이터)가 아직 4단계 값을 들고 있을 때를 위한 매핑이다.
    const memoryStateToBackend = {
      unlearned: 'unlearned',
      seed: 'seed',
      sprout: 'sprout',
      leaf: 'leaf',
      carrot: 'carrot',
      [MEMORY_STATES.SHORT_TERM]: 'short',
      [MEMORY_STATES.MEDIUM_TERM]: 'medium',
      [MEMORY_STATES.LONG_TERM]: 'long',
      [MEMORY_STATES.ALL]: 'all',
      all: 'all',
    };
    // targetMemoryState가 null/undefined면 "필터 없음"이므로 빈 배열로 둔다.
    // [null]처럼 원소가 falsy인 배열로 감싸면 join(',')이 ''가 돼 백엔드에 빈 값으로
    // 전송되고, 서버가 이를 "명시적 필터"로 오인해 AI 추천 모드가 꺼진다(보고 참조).
    const targetStatesArr = Array.isArray(targetMemoryState)
      ? targetMemoryState.filter(Boolean)
      : (targetMemoryState ? [targetMemoryState] : []);
    const backendTargetStates = targetStatesArr.map(s => memoryStateToBackend[s] ?? s);

    const selectionType = state.data?.selectionType ?? 'recommended';

    // 설정 시트로 유형을 직접 고른 테스트(AI 추천이 아닌 경우)만 question_types를 실어 보낸다
    // (계약 7절) — 자동 추천(tier) 경로는 절대 보내지 않는다. 보내면 서버가 tier 로직을
    // 완전히 건너뛰어 tier_target/tier_shown이 항상 null로 나오기 때문이다.
    const isRecommendedMode = isRecommendedModeData(state.data);
    const directQuestionTypes = isRecommendedMode
      ? null
      : (Array.isArray(state.data.questionType) ? state.data.questionType : [state.data.questionType])
        .filter(Boolean);

    // 새 단어 학습 분리(2026-09-29) — 이 함수를 부르는 모든 곳(quick·자유 설정 테스트·단어장
    // 상세 테스트)은 항상 복습 전용(mode=review, 심은 단어만)이다. 새 단어는 오직 'plant'
    // 세션(아래 buildPlantTestQuestions 분기)에서만 나온다 — mode 분기를 여기 한 곳에만 두면
    // useQuickReview.jsx/utils/nextStudy.js처럼 이 함수를 호출하는 쪼재는 따로 손댈 필요가 없다.
    const mode = testType === 'plant' ? 'plant' : 'review';

    const res = await getStudyRecommend({
      type: testType,
      count,
      bookIds,
      targetStates: backendTargetStates,
      selection: selectionType,
      taskBucket,
      questionTypes: directQuestionTypes,
      mode,
      force: !!state.data?.force,
    });

    if (res?.code !== 200 || !Array.isArray(res.data?.items)) {
      throw new Error('추천 API 응답 형식 오류');
    }

    const sessionId = res.data.session_id;
    const composition = res.data.composition;
    const compositionStrategy = res.data.composition_strategy ?? null;

    // allWords(오답 선택지용)는 로컬 vocabularySheets에서 구성
    let allWords = buildAllWordsPool(vocabularySheetId);

    // 부패 진단(학습 시안 §6) — 삽으로 다시 심기를 예약한 단어는 이번 학습에서 진단 문제로 만난다.
    // 서버 응답에 진단 표시가 없어(pending_action / pending_targets 미노출) 기기에 적어 둔
    // 예약 id 로 표시한다. 서버가 표시를 내려주면 아래 두 줄만 지우면 된다.
    const pendingReplant = getPendingReplantIds();

    const selectedWords = res.data.items.map(item => mapRecommendItemToWord(item, {
      // 서버가 표시를 내려주면 그쪽이 정본이다(mapRecommendItemToWord가 이미 pending_action도 본다)
      isDiagnosis: pendingReplant.has(String(item.user_voca_id)),
    }));

    // 추천 응답 fsrs 에는 last_review·reps 가 없다 — 사전에서 채워야 "N일 전 학습"이 맞게 나온다
    // (utils/studyHistory.js, 채우지 않으면 새싹 단어도 "첫 학습"으로 보였다).
    attachStudyHistory(selectedWords, userDictionary);

    if (allWords.length === 0) {
      allWords = selectedWords;
    }

    const testQuestions = buildTestQuestions(selectedWords, allWords, vocabularySheetId);

    return { testQuestions, sessionId, composition, compositionStrategy };
  };

  // 발음(TTS) 준비가 끝난 뒤에 학습 화면을 연다.
  //  - 게이트(대기) 대상: 테스트에서 "자동 재생"되는 단어(발음)만 — 이것만 기다리면 자동재생이 안 끊긴다.
  //  - 서버 배치 생성(prewarm)으로 없는 음성만 만들고, 클라이언트 blob prefetch로 즉시 재생 준비.
  //  - 최대 대기(PREPARE_MAX_WAIT_MS) 초과 시 준비가 덜 됐어도 진입(무한 대기 방지).
  //  - 진입 게이트 이후, 의미·예문 등 나머지 음성은 백그라운드로 계속 캐싱(결과·단어상세 TTS 대비).
  const prepareThenReveal = async (questions) => {
    // 게이트(대기) 대상: 앞쪽 몇 문제의 자동재생 단어만 — 진입을 빠르게 하고 첫 재생을 안정화.
    const gateTexts = collectTestTexts(questions.slice(0, GATE_PRIORITY_QUESTIONS));
    if (gateTexts.length === 0) {
      // 준비할 자동재생 음성이 없으면 곧바로 진입.
      setIsTestQuestionsSetting(false);
      warmTts(collectTestFullTexts(questions)); // 나머지는 백그라운드
      return;
    }

    setPrepareProgress(0);
    setIsPreparingTts(true);
    setIsTestQuestionsSetting(false); // 준비 스플래시로 전환(빈 화면 대신)

    // 생성 청크 단위로 진행률을 세밀하게 올리며 준비.
    const prepare = prepareTtsWithProgress(gateTexts, setPrepareProgress);

    // 최대 대기 초과 시 진입(나머지는 백그라운드 계속 진행)
    await Promise.race([
      prepare.catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, PREPARE_MAX_WAIT_MS)),
    ]);

    setPrepareProgress(1);
    setIsPreparingTts(false);

    // 진입 이후: 의미·예문까지 포함한 전체 음성을 백그라운드로 계속 데운다(결과/단어상세 대비).
    warmTts(collectTestFullTexts(questions));
    // 복습 예정일 예측(TTS와 별개) — 준비와 무관하게 백그라운드로 진행.
    warmSession(questions);
  };

  // 세션 시작 시 복습 예정일 예측 — 각 문제에 predictedReview 부착(백그라운드).
  // (TTS 사전 캐싱은 prepareThenReveal 게이트에서 처리하므로 여기선 예측만 담당.)
  const warmSession = (questions) => {
    if (!Array.isArray(questions) || questions.length === 0) return;

    // 복습 예정일 예측 — 각 문제(및 cardMatch 내부 단어)에 predictedReview 부착
    const ids = [];
    const pushId = (id) => { if (id != null) ids.push(id); };
    for (const q of questions) {
      pushId(q.vocaIndexId ?? q.id);
      if (Array.isArray(q.words)) q.words.forEach(w => pushId(w.id));
    }
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return;
    predictReviews(uniqueIds).then(res => {
      const map = res?.data;
      if (!map) return;
      const attach = (obj, id) => {
        const p = map[id] ?? map[String(id)];
        if (p) obj.predictedReview = p;
      };
      for (const q of questions) {
        attach(q, q.vocaIndexId ?? q.id);
        if (Array.isArray(q.words)) q.words.forEach(w => attach(w, w.id));
      }
      setTestQuestions(prev => [...prev]);
    }).catch(() => { /* 예측 실패 시 기존 낙관적 추정으로 폴백 */ });
  };

  // 게스트 맛보기 모드 — 로컬 문제 배열로 실제 UI 재사용 (추천/세션/로깅 없음)
  const isGuestMode = !!state?.guestMode;

  useEffect(() => {
    if (!isGuestMode) return;
    const gq = Array.isArray(state.guestQuestions) ? state.guestQuestions : [];
    setTestQuestions(gq);
    setProgressIndex(0);
    studySessionRef.current = null;            // 세션 없음 → 로깅/finish 자동 스킵
    loggedVocaIdsRef.current = new Set();
    retryCountMapRef.current = new Map();
    passedVocaIdsRef.current = new Set();
    cardRetryEnqueuedRef.current = new Set();
    // 진행률 분모: 고유 단어 수 (카드매치 세트는 words 개별 단어를 카운트)
    {
      const uniqueIds = new Set();
      for (const q of gq) {
        if (Array.isArray(q.words)) {
          q.words.forEach((w) => { if (w.id != null) uniqueIds.add(w.id); });
        } else {
          const id = q.vocaIndexId ?? q.id;
          if (id != null) uniqueIds.add(id);
        }
      }
      totalUniqueVocaCountRef.current = uniqueIds.size || gq.length;
    }
    setIsTestQuestionsSetting(false);
    // 게스트 온보딩 TTS 사전 캐싱 — 로그인 경로(warmSession)와 동일하게 문제 단어들을 prefetch.
    // 캐시 미스 단어의 /tts/resolve가 404라 소리가 안 나는 이슈 대응 배선(백엔드가 게스트 온보딩
    // 단어 TTS 생성/허용을 지원해야 실제로 재생됨 — 미지원 시에도 prefetch 자체는 안전한 fire-and-forget).
    warmTts(collectTestTexts(gq));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuestMode]);

  useEffect(() => {
    if (isGuestMode) return; // 게스트는 위 전용 이펙트에서 처리
    // 마운트당 1회만 초기화 — 이미 초기화를 마쳤다면 loading 플래그가 다시 토글돼도
    // (백그라운드 복귀로 인한 재조회 포함) 진행 중인 세션 상태를 재조회 결과로 덮어쓰지 않는다.
    if (hasInitializedTestRef.current) return;
    const initializeTest = async () => {
      if (isRecentStudyLoading || isVocabularySheetsLoading) return;
      // 아직 로딩 중이 아니면 지금부터 실제 초기화를 진행한다 — 이 시점부터 "초기화 완료"로
      // 표시해 이후 이 effect가 다시 실행되더라도(아래 dep 배열 참고) 더는 아무 일도 하지 않는다.
      hasInitializedTestRef.current = true;
      if (recentStudy && recentStudy[state.testType] && recentStudy[state.testType].status === "end") {
        setIsTestQuestionsSetting(false);
        return;
      }
      if (recentStudy && recentStudy[state.testType] && recentStudy[state.testType].status === "learning" && recentStudy[state.testType].study_data?.length > 0) {
        const studyData = recentStudy[state.testType].study_data;
        // cardMatch/cardMatchListening 질문에 words 배열이 없으면 잘못된 캐시 → 재생성.
        // 빈칸 채우기는 문자열 선택지 4개 + 빈칸 문장 + resultIndex 가 있어야 한다
        // (예전 스키마의 exampleText/targetWord 캐시는 여기서 걸러 재생성).
        // 제거된 역방향(fillInTheBlankReverse) 캐시는 플러그인이 없어 렌더할 수 없으므로 재생성.
        const isCacheValid = studyData.every(q => {
          if (q.questionType === 'fillInTheBlankReverse') return false;
          if (['cardMatch', 'cardMatchListening'].includes(q.questionType)) return Array.isArray(q.words);
          if (isFillInTheBlankType(q.questionType)) {
            return Array.isArray(q.options) && q.options.length === 4
              && typeof q.blankText === 'string' && typeof q.resultIndex === 'number';
          }
          // 출제형 4종(조립·타이핑) 캐시 — 조립형은 arrange.bank 배열, 타이핑은
          // typing.answer_text 문자열이 있어야 렌더 가능. 재출제(requeue-easier)로 받은
          // 문제는 이 모양을 그대로 갖고 있어야 새로고침/백그라운드 복귀 후에도 안전하다.
          if (isSentenceQuestionType(q.questionType)) {
            if (q.questionType === 'fillInTheBlankTyping') {
              return typeof q.typing?.answer_text === 'string' && q.typing.answer_text.length > 0;
            }
            return Array.isArray(q.arrange?.bank) && q.arrange.bank.length > 0
              && Array.isArray(q.arrange?.accepted);
          }
          return true;
        });
        if (isCacheValid) {
          // 저장된 문제도 추천 응답 모양이라 학습 이력(last_review 등)이 비어 있다 — 사전에서 채운다.
          attachStudyHistory(studyData, userDictionary);
          setTestQuestions(studyData);
          setProgressIndex(recentStudy[state.testType].progress_index);
          // 재출제 ref 리셋 (복원 시 안전하게 클린 스타트)
          retryCountMapRef.current = new Map();
          cardRetryEnqueuedRef.current = new Set();
          // 고유 단어 수 재계산 + 이미 정답 처리된 고유 단어 복원
          // (버그 수정: 예전엔 passedVocaIdsRef를 무조건 빈 Set으로 리셋해서, 이어하기/
          //  백그라운드 복귀로 재마운트될 때마다 상단 진행 바가 0부터 다시 시작했다.
          //  study_data에 저장된 문제별 isCorrect를 기준으로 진행률 분자를 다시 채운다.)
          //
          // loggedVocaIdsRef도 같은 이유로 무조건 빈 Set으로 리셋하면 안 된다 — 이미 첫 시도가
          // 채점되어 /study/log를 보낸 단어(isCorrect가 true/false로 확정된 단어, null=미응답)까지
          // "안 보낸 것"으로 착각해서, 복원 직후 같은 단어가 다시 채점되는 경로를 타면 /study/log를
          // 중복 전송한다 → 백엔드가 FSRS review()를 두 번 적용해 암기 게이지가 실제보다 과다 상승한다
          // (heyvoca_back/app/routes/study.py: POST /study/log에 세션·단어 단위 멱등 가드가 없어
          //  중복 요청을 그대로 다 반영한다). isCorrect!==null(응답 완료, 정오답 무관)을 "이미 로깅됨"
          // 신호로 재시딩해서 막는다.
          {
            const uniqueIds = new Set();
            const passedIds = new Set();
            const loggedIds = new Set();
            for (const q of studyData) {
              if (Array.isArray(q.words)) {
                q.words.forEach(w => {
                  if (w.id == null) return;
                  uniqueIds.add(w.id);
                  if (w.isCorrect === true) passedIds.add(w.id);
                  if (w.isCorrect !== null && w.isCorrect !== undefined) loggedIds.add(w.id);
                });
              } else {
                const id = q.vocaIndexId ?? q.id;
                if (id == null) continue;
                uniqueIds.add(id);
                if (q.isCorrect === true) passedIds.add(id);
                if (!q.isRetry && q.isCorrect !== null && q.isCorrect !== undefined) loggedIds.add(id);
              }
            }
            totalUniqueVocaCountRef.current = uniqueIds.size || studyData.length;
            passedVocaIdsRef.current = passedIds;
            loggedVocaIdsRef.current = loggedIds;
          }
          // 발음(TTS) 준비 완료까지 준비 화면을 보여준 뒤 학습으로 진입.
          await prepareThenReveal(studyData);
          return;
        }
        // 잘못된 캐시 → else 블록으로 fall-through해서 재생성
      }
      {
        // 학습 기록이 없거나 잘못된 캐시이면 새로운 학습 데이터 생성 후 학습 시작
        try {
          const { testQuestions: tempTestQuestions, sessionId } = await setupTestQuestions(
            state.data.memoryState,
            state.data.vocabularySheetId,
            state.data.count,
            state.testType,
            state.data.taskBucket
          );

          // 재출제 시스템 ref 초기화 (새 세션마다 리셋)
          loggedVocaIdsRef.current = new Set();
          retryCountMapRef.current = new Map();
          passedVocaIdsRef.current = new Set();
          cardRetryEnqueuedRef.current = new Set();

          // 출제 가능한 문제가 0개이면 (예: 빈칸 채우기 단독 선택인데 강조 예문이 없는 경우) 알림 후 복귀
          if (!tempTestQuestions || tempTestQuestions.length === 0) {
            await pushAwaitNewBottomSheet(
              AlertNewBottomSheet,
              { title: '출제 가능한 문제가 없어요', subTitle: '다른 유형을 함께 선택해주세요' },
              { isBackdropClickClosable: false, isDragToCloseEnabled: false }
            );
            setIsTestQuestionsSetting(false);
            if (AppHistory.canGoBack()) {
              navigate(-1);
            } else {
              navigate('/home');
            }
            return;
          }

          // 추천 응답의 session_id를 ref에 저장 (정식 세션 ID)
          studySessionRef.current = sessionId ?? null;
          // 결과 화면 "다음 학습"이 같은 설정으로 새 세션을 열 수 있게 적어 둔다
          // (이어하기로 들어온 세션은 navigate state 에 data 가 없다 — utils/nextStudy.js)
          saveStudyConfig(state.testType, state.data);

          // 재출제 시스템: 고유 단어 수 확정 (cardMatch는 words 배열 개별 단어 카운트)
          {
            const uniqueIds = new Set();
            for (const q of tempTestQuestions) {
              if (Array.isArray(q.words)) {
                q.words.forEach(w => { if (w.id != null) uniqueIds.add(w.id); });
              } else {
                const id = q.vocaIndexId ?? q.id;
                if (id != null) uniqueIds.add(id);
              }
            }
            totalUniqueVocaCountRef.current = uniqueIds.size || tempTestQuestions.length;
          }

          // plant(새 씨앗 심기)·script(글자 학습) — 백엔드 RecentStudyType enum에 이 값들이
          // 없어(TEST/EXAM/TODAY/QUICK만 존재) 서버에 그대로 보내면 500이 나 "최근 학습
          // 데이터를 추가하는데 실패했습니다" 네이티브 알림이 뜬다(버그 원인, plant에서 먼저
          // 발견됨). enum에 값을 추가하려면 DB 마이그레이션(ALTER TABLE … MODIFY type
          // ENUM(...))이 필요해 이 작업 범위를 넘어서므로, 둘 다 서버 왕복 없이 로컬 상태로만
          // 이 세션의 진행(단어/글자 단위 진행 판단·"세션 끝" 신호)을 추적한다 — 앱을 완전히
          // 종료하면 이어하기는 안 되고 새로 시작한다.
          if (state.testType === 'plant' || state.testType === 'script') {
            updateRecentStudyState({
              [state.testType]: {
                ...recentStudy[state.testType],
                progress_index: 0,
                status: "learning",
                type: state.testType,
                study_data: tempTestQuestions,
                updated_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
              },
            });
          } else {
            await updateRecentStudy(state.testType, {
              ...recentStudy[state.testType],
              progress_index: 0,
              status: "learning",
              type: state.testType,
              study_data: tempTestQuestions,
              updated_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
            });
          }

          setTestQuestions(tempTestQuestions);
          // 발음(TTS) 준비 완료까지 준비 화면을 보여준 뒤 학습으로 진입.
          await prepareThenReveal(tempTestQuestions);
        } catch (e) {
          console.error('[TakeTest] 학습 데이터 초기화 실패:', e);
          await pushAwaitNewBottomSheet(
            AlertNewBottomSheet,
            { title: '학습을 시작할 수 없어요', subTitle: '잠시 후 다시 시도해주세요' },
            { isBackdropClickClosable: false, isDragToCloseEnabled: false }
          );
          setIsTestQuestionsSetting(false);
          if (AppHistory.canGoBack()) {
            navigate(-1);
          } else {
            navigate('/home');
          }
        }
      }
    };

    initializeTest();
  }, [isRecentStudyLoading, isVocabularySheetsLoading]);

  // 학습 종료 확인 및 네비게이션 함수
  const handleStopLearning = async () => {
    // 게스트 첫 학습: 확인 바텀시트 없이 온보딩 예고 화면으로 복귀 —
    // 중간에 그만둔 것이므로 다시 시작할 수 있는 자리로 되돌린다
    if (isGuestMode) {
      clearGuestTrial();
      navigate('/onboarding', { state: { step: 'ready' }, replace: true });
      return;
    }

    // 1. 이미 바텀시트가 열려있는지 확인 (중복 실행 방지)
    if (window.newBottomSheetContext && window.newBottomSheetContext.stack.length > 0) {
      window.newBottomSheetContext.popNewBottomSheet();
      return;
    }

    // 2. 학습 종료 확인 바텀시트 표시
    const ConfirmResult = await pushAwaitNewBottomSheet(
      ConfirmNewBottomSheet,
      {
        title: (
          <>
            학습할 단어가 남아있어요.<br />
            학습을 종료할까요?
          </>
        ),
        btns: {
          confirm: "종료",
          cancel: "취소",
        }
      },
      {
        isBackdropClickClosable: true,
        isDragToCloseEnabled: true
      }
    );

    // 3. 결과 처리
    if (ConfirmResult) {
      if (AppHistory.canGoBack()) {
        navigate(-1);
      } else {
        navigate('/home');
      }
    }
  };

  // 앱 종료 감지 (학습 중에만)
  useEffect(() => {
    let hasPageHideHandled = false;

    const handlePageHide = async () => {
      if (hasPageHideHandled) return;
      hasPageHideHandled = true;
      console.log('학습 중 페이지 숨김 감지');
      await updateVocabularySheetAndRecentStudyData();
      hasPageHideHandled = false;
    };

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'hidden') {
        if (hasPageHideHandled) return;
        hasPageHideHandled = true;
        console.log('학습 중 앱 백그라운드 전환 감지');
        await updateVocabularySheetAndRecentStudyData();
        hasPageHideHandled = false;
      }
    };

    const handleBeforeUnload = async (event) => {
      if (hasPageHideHandled) return;
      hasPageHideHandled = true;
      console.log('학습 중 앱 종료 감지');
      await updateVocabularySheetAndRecentStudyData();
      hasPageHideHandled = false;
    };


    // 뒤로가기 핸들러 재정의
    const originalOnBackPressed = window.onBackPressed;
    window.onBackPressed = handleStopLearning;

    // 이벤트 리스너 등록
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    // 컴포넌트 언마운트 시 정리
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);

      // 원래 뒤로가기 핸들러 복구
      window.onBackPressed = originalOnBackPressed;
    };
  }, []);

  //
  useEffect(() => {
    const handleUpdateAndNavigate = async () => {
      if (recentStudy && recentStudy[state.testType] && recentStudy[state.testType].status === "end") {
        // 게스트 맛보기 종료 → 서버 동기화 없이 답안만 챙겨 온보딩 보상으로
        if (isGuestMode) {
          /*
            단어별 **마지막** 정오답을 보낸다.

            예전에는 `if (q.isRetry) return;` 으로 재출제를 통째로 빼고 첫 시도만 보냈다.
            그러면 틀렸다가 맞힌 단어가 `correct: false` 로 가서 가입 시 심기지 않는데,
            정작 온보딩은 "맞힐 때까지 뒤에서 다시 물어봐요"라고 약속하고
            결과 화면은 "14개를 씨앗으로 심었어요"라고 센다 — 셋이 서로 어긋났다.
            맞힐 때까지 물어보는 화면이라면 맞힌 것으로 보내는 게 맞다.

            (정규 학습의 재출제는 여전히 성장으로 치지 않는다. 그쪽은 서버가 세션 로그로
             독립 회상 여부를 판정한다 — 기획 5.2. 여기는 로그가 없는 맛보기 구간이다.)
          */
          const byId = new Map();
          const putAns = (id, correct) => {
            if (id == null || correct == null) return;   // 아직 안 푼 문항은 덮지 않는다
            byId.set(id, !!correct);
          };
          testQuestions.forEach((q) => {
            if (Array.isArray(q.words)) {
              // 카드매치 세트 — 단어별 정오답
              q.words.forEach((w) => putAns(w.vocaIndexId ?? w.id, w.isCorrect));
            } else {
              putAns(q.vocaIndexId ?? q.id, q.isCorrect);
            }
          });
          const answers = [...byId].map(([voca_id, correct]) => ({ voca_id, correct }));
          patchGuest({ answers });   // 가입 후 migrate가 읽음
          clearGuestTrial();
          // 결과는 실제 StudyResult 화면을 그대로 재사용 (재출제 제외, 고유 단어 기준)
          const seenIds = new Set();
          const resultQuestions = testQuestions.filter((q) => {
            if (q.isRetry) return false;
            if (Array.isArray(q.words)) return true;
            const id = q.vocaIndexId ?? q.id;
            if (seenIds.has(id)) return false;
            seenIds.add(id);
            return true;
          });
          navigate('/take-test/result', {
            state: { testQuestions: resultQuestions, testType: state.testType, guestMode: true },
            replace: true,
          });
          return;
        }
        // plant(새 씨앗 심기) — 문제마다 /study/log를 보내지 않았다(Main.jsx). 세션이
        // 끝난 지금, 단어당 1회씩 일괄 전송한다. isCorrect = 그 단어가 세션 안 모든 문제를
        // 첫 시도에 맞혔는지(plantAttemptsRef가 Main.jsx에서 이미 AND로 접어 둔 값).
        // 중간 이탈(status !== 'end')이면 이 분기 자체를 안 타므로 아무것도 기록되지 않는다.
        if (state.testType === 'plant' && studySessionRef?.current && plantAttemptsRef.current.size > 0) {
          const entries = [...plantAttemptsRef.current.entries()];
          const results = await Promise.allSettled(entries.map(([vocaId, wasCorrect]) => {
            // wordIntro(①만나기)는 채점 없는 슬라이드라 questionType이 그 값이면 안 된다 —
            // 단어 블록의 첫 항목이 항상 wordIntro이므로, 이걸 빼지 않으면 find()가 그것부터
            // 찾아 서버에 잘못된 question_type을 보낸다.
            const q = testQuestions.find(qq => (qq.vocaIndexId ?? qq.id) === vocaId && !qq.isRetry && qq.questionType !== 'wordIntro');
            return logStudyQuestion({
              session_id: studySessionRef.current,
              user_voca_id: vocaId,
              user_voca_book_id: q?.vocabularySheetId ?? null,
              question_type: q?.questionType ?? 'multipleChoice',
              was_correct: wasCorrect,
              time_taken_ms: 5000,
              client_now: new Date().toISOString(),
            }).then((logRes) => ({ vocaId, logRes }));
          }));
          for (const r of results) {
            if (r.status !== 'fulfilled') continue;
            const { vocaId, logRes } = r.value;
            const fsrs = logRes?.data?.fsrs;
            if (!fsrs) continue;
            // 결과 목록 "다음 복습 예정일"용 — 방금 받은 정본 fsrs로 채운다(고유 단어당
            // 첫 등장 문제 하나에만 적어도 결과 화면 dedup 로직이 그 항목을 쓴다). wordIntro는
            // 결과 화면에서 제외되는 슬라이드라 여기 붙이면 화면에 안 보이므로 제외한다.
            const idx = testQuestions.findIndex(qq => (qq.vocaIndexId ?? qq.id) === vocaId && !qq.isRetry && qq.questionType !== 'wordIntro');
            if (idx !== -1) testQuestions[idx].fsrs = fsrs;
          }
        }

        // 학습 세션 종료 (fire-and-forget)
        if (studySessionRef?.current) {
          finishStudySession(studySessionRef.current)
            .catch(e => console.warn('[FSRS] finishStudySession 실패:', e));
        }
        // 온보딩 미션 완료 신호 — M1(AI 추천 테스트)·M5(집중 반복 학습)·M6(자유 설정 테스트).
        // 게스트/맛보기(today)는 위에서 이미 return됨.
        // 보상(보석 지급 등)은 백엔드가 이 호출 시점에 이미 처리하고, "보상 받기" 연출은
        // OnboardingMissionRewardWatcher가 학습 결과 화면(/take-test, /take-test/result)을
        // 벗어난 뒤 안전하게 자동으로 보여준다 — 여기서는 신호만 보내면 된다.
        if (state.testType === 'quick') {
          completeMission('ai_test');
        } else if (state.testType === 'study') {
          completeMission('focus_study');
        } else if (state.testType === 'test') {
          completeMission('free_test');
        }
        await updateVocabularySheetAndRecentStudyData();
        // 결과 화면: 재출제 문제(isRetry=true)는 제외하고 고유 단어 기준 첫 시도만 전달
        // (재출제로 맞춘 걸 정답으로 뒤집지 않기 위해 첫 등장 순서 기준). plant의 ①만나기
        // (wordIntro)·글자 학습의 ①만나기(scriptIntro)는 채점이 없는 슬라이드라 먼저
        // 제외한다(NO_GRADE_QUESTION_TYPES) — 안 그러면 단어/글자당 첫 등장이 항상 그
        // 슬라이드라 seenIds에 먼저 찍히고, 실제 채점된 단계(사지선다 등)가 "이미 본 단어"로
        // 걸러져 결과 목록에서 통째로 빠진다. 글자는 같은 글자가 여러 유형(scriptSeePick/
        // scriptListenPick/scriptTrace)으로 반복 등장하므로 여기서도 첫 등장 하나만 남는다.
        const seenIds = new Set();
        const resultQuestions = testQuestions.filter(q => {
          if (q.isRetry) return false; // 재출제 문제 제외
          if (isNoGradeQuestionType(q.questionType)) return false; // 채점 없는 슬라이드 제외
          // cardMatch 세트는 words 기준 중복 없으면 포함
          if (Array.isArray(q.words)) return true;
          const id = q.vocaIndexId ?? q.id;
          if (seenIds.has(id)) return false;
          seenIds.add(id);
          return true;
        });
        navigate("/take-test/result", {
          state: {
            testQuestions: resultQuestions,
            testType: state.testType,
            // 농장 세션 요약(/farm/session-summary) 조회에 필요 — 결과 화면이 이 값으로 조회한다
            sessionId: studySessionRef?.current ?? null,
            // "다음 학습"(같은 종류의 새 세션)을 만들 설정 — 이어하기 세션은 기기에 적어 둔 값
            studyConfig: state.data ?? loadStudyConfig(state.testType),
          },
          replace: true,
        });
      }
    };
    handleUpdateAndNavigate();
    // eslint-disable-next-line
  }, [recentStudy]);

  // React Compiler가 자동으로 useCallback 처리
  const updateVocabularySheetAndRecentStudyData = async () => {
    try {
      // 0. 진행 중인 /study/log 응답을 모두 기다림 — 서버 fsrs 가 반영되어야 다음 fetch 가 의미 있음
      if (pendingLogPromisesRef.current.length > 0) {
        await Promise.allSettled(pendingLogPromisesRef.current);
        pendingLogPromisesRef.current = [];
      }

      // 1. 단어장 메타데이터 업데이트
      if (pendingUpdateSheetIds.size > 0) {
        const sheetIds = Array.from(pendingUpdateSheetIds);
        pendingUpdateSheetIds.clear();
        await Promise.all(sheetIds.map(async sheetId => {
          await updateVocabularySheetServer(sheetId);
        }));
      }

      // 2. 학습 기록(RecentStudy) 업데이트 — plant(새 씨앗 심기)·script(글자 학습)는 서버에
      // 쓰지 않는다. 백엔드 RecentStudyType enum에 이 값들이 없어(TEST/EXAM/TODAY/QUICK만
      // 존재) 그대로 보내면 500이 나 "최근 학습 데이터를 추가하는데 실패했습니다" 네이티브
      // 알림이 뜬다(아래 세션 생성 시점의 같은 분기 주석 참고). 둘 다 recentStudy를 세션 중
      // 로컬 상태로만 쓰고(단어/글자 단위 진행 판단용) 서버에는 절대 쓰지 않는다 — 앱을
      // 완전히 종료하면 이어하기는 안 되고 새로 시작한다(기획 확인, 보고 참고).
      if (state.testType !== 'plant' && state.testType !== 'script') {
        await updateRecentStudyServer(state.testType);
      }

      // 3. 최신 단어장 데이터 다시 가져오기
      await fetchVocabularySheets();

    } catch (error) {
      console.error('Error updating study data:', error);
    }
  };

  if (isTestQuestionsSetting || isPreparingTts) {
    // 게스트 맛보기는 기존처럼 빈 화면으로 빠르게 진입(준비 스플래시 미사용).
    if (isGuestMode) return null;
    // 로그인 학습: 로그인 스플래시와 동일한 프로그래스 화면으로 준비 상태를 보여준다.
    // 상황에 무관한 범용 문구 사용(발음/데이터 등 단계 노출 안 함).
    const message = '학습을 준비하는 중';
    const prog = isPreparingTts ? prepareProgress : 0.06;
    return <ProgressSplash progress={prog} message={message} />;
  } else {
    if (recentStudy[state.testType]?.status === "end") {
      // 학습 종료 → 결과 페이지로 navigate 진행 중. 깜빡임 방지를 위해 빈 화면 유지.
      return null;
    }

    return (
      <div>
        <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
        <Header
          testType={state?.testType ? state.testType : recentStudy[state.testType]?.type}
          onBackClick={handleStopLearning}
          /* 학습 시안 §6 — 부패 진단은 헤더가 "알맞은 뜻을 선택하세요"가 아니라
             "다시 심기 진단"이다. 이 화면이 일반 학습과 다르다는 첫 신호다. */
          questionType={
            testQuestions[progressIndex]?.isDiagnosis
              ? 'multipleChoiceDiagnosis'
              : testQuestions[progressIndex]?.questionType
          }
        />
        <Main
          testQuestions={testQuestions}
          setTestQuestions={setTestQuestions}
          progressIndex={progressIndex}
          setProgressIndex={setProgressIndex}
          setPendingUpdateSheetIds={setPendingUpdateSheetIds}
          setPendingUpdateWords={setPendingUpdateWords}
          testType={state?.testType ? state.testType : recentStudy[state.testType]?.type}
          studySessionRef={studySessionRef}
          pendingLogPromisesRef={pendingLogPromisesRef}
          loggedVocaIdsRef={loggedVocaIdsRef}
          retryCountMapRef={retryCountMapRef}
          passedVocaIdsRef={passedVocaIdsRef}
          totalUniqueVocaCountRef={totalUniqueVocaCountRef}
          cardRetryEnqueuedRef={cardRetryEnqueuedRef}
          guestMode={isGuestMode}
          plantAttemptsRef={plantAttemptsRef}
        />
      </div>
    );
  }

};

export default TakeTest; 