import React, { useEffect, useRef, useState } from 'react';
import Main from '../components/takeTest/Main';
import Header from '../components/takeTest/Header';
import { useLocation, useNavigate } from 'react-router-dom';
import { useVocabulary } from '../context/VocabularyContext';
import { getQuestionType } from '../plugins/questionTypes';
import { isListeningSkipActive, mapSkippedQuestionType } from '../utils/listeningSkip';
import { useNewBottomSheetActions } from '../context/NewBottomSheetContext';
import { MEMORY_STATES } from '../utils/common';
import { ConfirmNewBottomSheet } from '../components/newBottomSheet/ConfirmNewBottomSheet';
import { AppHistory } from '../utils/appHistory';
import { getStudyRecommend, finishStudySession, predictReviews } from '../api/study';
import { warmTts, collectTestTexts } from '../api/tts';

const TakeTest = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { state } = useLocation();
  const { isRecentStudyLoading, isVocabularySheetsLoading, vocabularySheets, recentStudy, updateRecentStudy, updateVocabularySheetServer, updateRecentStudyServer, updateRecentStudyState, fetchVocabularySheets } = useVocabulary();
  const { pushAwaitNewBottomSheet } = useNewBottomSheetActions();
  const [testQuestions, setTestQuestions] = useState([]);
  const [isTestQuestionsSetting, setIsTestQuestionsSetting] = useState(true);
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

    // Phase 2.2: 사용자가 명시적으로 유형을 선택했는지 판단
    // questionType이 'recommended' 이거나 배열에 포함되면 백엔드 추천 우선 사용
    const isRecommendedMode =
      !state.data.questionType ||
      state.data.questionType === 'recommended' ||
      (Array.isArray(state.data.questionType) && state.data.questionType.includes('recommended'));

    // "듣기 문제 건너뛰기"가 활성이면 듣기 유형을 일반 유형으로 변환해 출제
    const skipListening = isListeningSkipActive();
    const resolveType = (type) => (skipListening ? mapSkippedQuestionType(type) : type);

    const wordsWithSheetId = selectedWords.map(word => ({
      ...word,
      vocabularySheetId: vocabularySheetId !== "all" ? vocabularySheetId : word.vocabularySheetId,
    }));

    const createMultipleChoiceQuestion = (word, questionType = 'multipleChoice') => {
      const otherWords = allWords.filter(w => (w.id ?? w.vocaIndexId) !== (word.id ?? word.vocaIndexId));
      const randomOptions = otherWords.sort(() => Math.random() - 0.5).slice(0, 3);
      const options = [word, ...randomOptions].sort(() => Math.random() - 0.5);
      const resultIndex = options.findIndex(w => (w.id ?? w.vocaIndexId) === (word.id ?? word.vocaIndexId));
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
      const suggestedType = isRecommendedMode ? (word.suggestedQuestionType ?? null) : null;
      const targetType = resolveType(suggestedType ?? fallbackType ?? 'multipleChoice');
      const plugin = getQuestionType(targetType);

      // plugin이 없거나 setupQuestions가 없는 유형 (multipleChoice 계열)
      if (!plugin || !plugin.setupQuestions) {
        return createMultipleChoiceQuestion(word, targetType);
      }

      // fillInTheBlank: 단일 단어로 시도, 예문 없으면 multipleChoice 폴백
      // 주의: 폴백 시 questionType은 반드시 'multipleChoice'로 고정해야 한다.
      //       fallbackType이 'fillInTheBlank'인 채로 createMultipleChoiceQuestion에
      //       넘기면 options가 word 객체 배열인 fillInTheBlank 문제가 생성되어
      //       FillInTheBlankQuestion 컴포넌트에서 렌더 오류가 발생한다.
      if (targetType === 'fillInTheBlank') {
        const generated = plugin.setupQuestions([word], allWords);
        if (generated.length > 0) return generated[0];
        // 폴백: 항상 multipleChoice (options가 word 객체 배열인 fillInTheBlank 생성 방지)
        return createMultipleChoiceQuestion(word, 'multipleChoice');
      }

      // cardMatch 계열은 단일 단어로 처리 불가 → multipleChoice 폴백
      return createMultipleChoiceQuestion(word, 'multipleChoice');
    };

    if (questionTypesArr.length === 1 && !isRecommendedMode) {
      const singleType = resolveType(questionTypesArr[0]);
      const plugin = getQuestionType(singleType);
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
      const suggestedType = isRecommendedMode ? (currentWord.suggestedQuestionType ?? null) : null;
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

  // ─── setupTestQuestions ─────────────────────────────────────────────────────
  // 백엔드 /study/recommend로 단어 + 세션을 받아 문제 구성. 응답 형식 오류 시 예외 throw.
  // 반환: { testQuestions, sessionId, composition, compositionStrategy }
  const setupTestQuestions = async (targetMemoryState, vocabularySheetId, count, testType) => {
    // bookIds 변환: "all" → null, 단일 id → [id], 배열 → 그대로
    let bookIds = null;
    if (vocabularySheetId && vocabularySheetId !== 'all') {
      bookIds = Array.isArray(vocabularySheetId) ? vocabularySheetId : [vocabularySheetId];
    }

    // targetMemoryState → targetStates: MEMORY_STATES 값 → 백엔드 호환 값 변환
    // 백엔드는 unlearned, short, medium, long, all 를 받음
    const memoryStateToBackend = {
      [MEMORY_STATES.UNLEARNED]: 'unlearned',
      [MEMORY_STATES.SHORT_TERM]: 'short',
      [MEMORY_STATES.MEDIUM_TERM]: 'medium',
      [MEMORY_STATES.LONG_TERM]: 'long',
      [MEMORY_STATES.ALL]: 'all',
      all: 'all',
    };
    const targetStatesArr = Array.isArray(targetMemoryState) ? targetMemoryState : [targetMemoryState];
    const backendTargetStates = targetStatesArr.map(s => memoryStateToBackend[s] ?? s);

    const selectionType = state.data?.selectionType ?? 'recommended';

    const res = await getStudyRecommend({
      type: testType,
      count,
      bookIds,
      targetStates: backendTargetStates,
      selection: selectionType,
    });

    if (res?.code !== 200 || !Array.isArray(res.data?.items)) {
      throw new Error('추천 API 응답 형식 오류');
    }

    const sessionId = res.data.session_id;
    const composition = res.data.composition;
    const compositionStrategy = res.data.composition_strategy ?? null;

    // allWords(오답 선택지용)는 로컬 vocabularySheets에서 구성
    let allWords = buildAllWordsPool(vocabularySheetId);

    const selectedWords = res.data.items.map(item => ({
      id: item.user_voca_id,
      vocaIndexId: item.user_voca_id,
      vocabularySheetId: item.user_voca_book_id,
      origin: item.word,
      meanings: item.meanings ?? [],
      examples: item.examples ?? [],
      fsrs: item.fsrs,
      priorityBucket: item.priority_bucket,
      suggestedQuestionType: item.suggested_question_type ?? null,
      reason: item.reason ?? null,
    }));

    if (allWords.length === 0) {
      allWords = selectedWords;
    }

    const testQuestions = buildTestQuestions(selectedWords, allWords, vocabularySheetId);

    return { testQuestions, sessionId, composition, compositionStrategy };
  };

  // 세션 시작 시 워밍: ① 캐시에 없는 TTS 미리 생성, ② 정답/오답 복습 예정일 미리 계산.
  // 둘 다 백그라운드(fire-and-forget) — 학습 진입을 막지 않는다.
  const warmSession = (questions) => {
    if (!Array.isArray(questions) || questions.length === 0) return;

    // ① TTS 사전 캐싱 + 클라이언트 blob prefetch (클릭/자동재생 즉시화)
    warmTts(collectTestTexts(questions));

    // ② 복습 예정일 예측 — 각 문제(및 cardMatch 내부 단어)에 predictedReview 부착
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

  useEffect(() => {
    const initializeTest = async () => {
      if (isRecentStudyLoading || isVocabularySheetsLoading) return;
      if (recentStudy && recentStudy[state.testType] && recentStudy[state.testType].status === "end") {
        setIsTestQuestionsSetting(false);
        return;
      }
      if (recentStudy && recentStudy[state.testType] && recentStudy[state.testType].status === "learning" && recentStudy[state.testType].study_data?.length > 0) {
        const studyData = recentStudy[state.testType].study_data;
        // cardMatch/cardMatchListening 질문에 words 배열이 없으면 잘못된 캐시 → 재생성
        const isCacheValid = studyData.every(q =>
          !['cardMatch', 'cardMatchListening'].includes(q.questionType) || Array.isArray(q.words)
        );
        if (isCacheValid) {
          setTestQuestions(studyData);
          setProgressIndex(recentStudy[state.testType].progress_index);
          setIsTestQuestionsSetting(false);
          warmSession(studyData);
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
            state.testType
          );

          // 출제 가능한 문제가 0개이면 (예: 빈칸 채우기 단독 선택인데 강조 예문이 없는 경우) 알림 후 복귀
          if (!tempTestQuestions || tempTestQuestions.length === 0) {
            window.alert('출제 가능한 문제가 없어요. 다른 유형을 함께 선택해주세요');
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

          await updateRecentStudy(state.testType, {
            ...recentStudy[state.testType],
            progress_index: 0,
            status: "learning",
            type: state.testType,
            study_data: tempTestQuestions,
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          });

          setTestQuestions(tempTestQuestions);
          setIsTestQuestionsSetting(false);
          warmSession(tempTestQuestions);
        } catch (e) {
          console.error('[TakeTest] 학습 데이터 초기화 실패:', e);
          window.alert('학습을 시작할 수 없어요. 잠시 후 다시 시도해주세요');
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
            학습을 종료하시겠습니까?😢
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
        // 학습 세션 종료 (fire-and-forget)
        if (studySessionRef?.current) {
          finishStudySession(studySessionRef.current)
            .catch(e => console.warn('[FSRS] finishStudySession 실패:', e));
        }
        await updateVocabularySheetAndRecentStudyData();
        navigate("/take-test/result", {
          state: {
            testQuestions: testQuestions,
            testType: state.testType,
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

      // 2. 학습 기록(RecentStudy) 업데이트
      await updateRecentStudyServer(state.testType);

      // 3. 최신 단어장 데이터 다시 가져오기
      await fetchVocabularySheets();

    } catch (error) {
      console.error('Error updating study data:', error);
    }
  };

  if (isTestQuestionsSetting) {
    // 학습 데이터 fetch 동안 빈 화면 유지. 정적 로딩 이미지 대신 짧은 깜빡임으로 처리.
    return null;
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
        />
      </div>
    );
  }

};

export default TakeTest; 