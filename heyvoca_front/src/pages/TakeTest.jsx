import React, { useEffect, useRef, useState } from 'react';
import Main from '../components/takeTest/Main';
import Header from '../components/takeTest/Header';
import { useLocation, useNavigate } from 'react-router-dom';
import { useVocabulary } from '../context/VocabularyContext';
import { getQuestionType } from '../plugins/questionTypes';
import { useNewBottomSheetActions } from '../context/NewBottomSheetContext';
import MakeStudyData from '../components/takeTest/MakeStudyData';
import SaveStudyData from '../components/takeTest/SaveStudyData';
import { MEMORY_STATES, getWordMemoryState, isWordOverdue, deriveSm2FromFsrs } from '../utils/common';
import { sortByForgettingPriority } from '../utils/forgettingPriority';
import { ConfirmNewBottomSheet } from '../components/newBottomSheet/ConfirmNewBottomSheet';
import { AppHistory } from '../utils/appHistory';
// Phase 1.3: 추천 API (정식). createStudySession은 폴백 모드용으로 유지
import { getStudyRecommend, createStudySession } from '../api/study';

const TakeTest = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { state } = useLocation();
  const { isRecentStudyLoading, isVocabularySheetsLoading, vocabularySheets, recentStudy, updateRecentStudy, updateVocabularySheetServer, updateRecentStudyServer, updateRecentStudyState, fetchVocabularySheets, updateWord } = useVocabulary();
  const { pushAwaitNewBottomSheet } = useNewBottomSheetActions();
  const [testQuestions, setTestQuestions] = useState([]);
  const [isTestQuestionsSetting, setIsTestQuestionsSetting] = useState(true);
  const [progressIndex, setProgressIndex] = useState(0);
  const navigate = useNavigate();
  // 업데이트해야 할 단어장 아이디를 저장할 Set (중복 방지)
  const [pendingUpdateSheetIds, setPendingUpdateSheetIds] = useState(new Set());
  // 업데이트해야 할 단어 아이디와 데이터를 저장할 Map (중복 방지, 마지막 상태 저장)
  const [pendingUpdateWords, setPendingUpdateWords] = useState(new Map());
  // Phase 1.3: 백엔드 세션 ID (정식. 추천 응답에서 받거나 폴백 시 createStudySession으로 받음)
  const studySessionRef = useRef(null);
  // Phase 2.2: composition_strategy (결과 화면 전달용)
  const compositionStrategyRef = useRef(null);

  // Fisher-Yates 셔플 알고리즘 (더 정확한 랜덤 셔플)
  const shuffleArray = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };



  // ─── 기존 로컬 정렬 로직 (폴백용, Phase 1.4 삭제 예정) ───────────────────────
  const legacyLocalSelection = (targetMemoryState, vocabularySheetId, count, testType) => {
    let allWords = [];

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
      allWords = dedupeByWordId(
        vocabularySheets.flatMap(sheet =>
          sheet.words.map(word => ({ ...word, vocabularySheetId: sheet.id }))
        )
      );
    } else if (Array.isArray(vocabularySheetId)) {
      const idSet = new Set(vocabularySheetId);
      allWords = dedupeByWordId(
        vocabularySheets
          .filter(sheet => idSet.has(sheet.id))
          .flatMap(sheet =>
            sheet.words.map(word => ({ ...word, vocabularySheetId: sheet.id }))
          )
      );
    } else {
      const vocabularySheet = vocabularySheets.find(sheet => sheet.id === vocabularySheetId);
      if (vocabularySheet) {
        allWords = vocabularySheet.words;
      }
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const unlearnedWords = allWords.filter(word => {
      const repetition = word.sm2?.repetition ?? word.repetition ?? 0;
      const interval = word.sm2?.interval ?? word.interval ?? 0;
      const nextReview = word.sm2?.nextReview ?? word.nextReview;
      return (!nextReview || nextReview === null) && repetition === 0 && interval === 0;
    });

    const overdueWords = allWords.filter(word => {
      const nextReview = word.sm2?.nextReview ?? word.nextReview;
      if (!nextReview) return false;
      const nextReviewDate = new Date(nextReview);
      nextReviewDate.setHours(0, 0, 0, 0);
      return nextReviewDate < now;
    });

    const todayScheduledWords = allWords.filter(word => {
      const nextReview = word.sm2?.nextReview ?? word.nextReview;
      if (!nextReview) return false;
      const nextReviewDate = new Date(nextReview);
      nextReviewDate.setHours(0, 0, 0, 0);
      return nextReviewDate.getTime() === now.getTime();
    });

    const sortedOverdueWords = overdueWords.sort((a, b) => {
      const dateA = new Date(a.sm2?.nextReview ?? a.nextReview);
      const dateB = new Date(b.sm2?.nextReview ?? b.nextReview);
      return dateA - dateB;
    });

    let selectedWords = [];

    if (testType === 'today') {
      selectedWords.push(...sortedOverdueWords.slice(0, count));
      if (selectedWords.length < count) {
        const remainingCount = count - selectedWords.length;
        const selectedWordIds = new Set(selectedWords.map(w => w.id));
        selectedWords.push(...todayScheduledWords.filter(w => !selectedWordIds.has(w.id)).slice(0, remainingCount));
      }
      if (selectedWords.length < count) {
        const remainingCount = count - selectedWords.length;
        const selectedWordIds = new Set(selectedWords.map(w => w.id));
        selectedWords.push(...unlearnedWords.filter(w => !selectedWordIds.has(w.id)).slice(0, remainingCount));
      }
      selectedWords = shuffleArray(selectedWords).slice(0, count);
    } else if (testType === 'quick') {
      selectedWords = sortByForgettingPriority(allWords).slice(0, count);
    } else if (testType === 'test' || testType === 'exam') {
      const targetStates = Array.isArray(targetMemoryState) ? targetMemoryState : [targetMemoryState];
      const candidatePool = allWords.filter(word => {
        if (targetStates.includes('all')) return true;
        const wordState = getWordMemoryState(word);
        return targetStates.includes(wordState);
      });
      const selectionType = state.data.selectionType ?? 'recommended';
      if (selectionType === 'random') {
        selectedWords = [...candidatePool].sort(() => Math.random() - 0.5).slice(0, count);
      } else {
        selectedWords = sortByForgettingPriority(candidatePool).slice(0, count);
      }
    }

    return { selectedWords, allWords };
  };

  // ─── 문제 유형 분배 (백엔드/폴백 공통, 기존 183~253 라인 로직) ───────────────
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
      const targetType = suggestedType ?? fallbackType ?? 'multipleChoice';
      const plugin = getQuestionType(targetType);

      // plugin이 없거나 setupQuestions가 없는 유형 (multipleChoice 계열)
      if (!plugin || !plugin.setupQuestions) {
        return createMultipleChoiceQuestion(word, targetType);
      }

      // fillInTheBlank: 단일 단어로 시도, 예문 없으면 폴백
      if (targetType === 'fillInTheBlank') {
        const generated = plugin.setupQuestions([word], allWords);
        if (generated.length > 0) return generated[0];
        // 폴백: 원래 fallbackType 또는 multipleChoice
        return createMultipleChoiceQuestion(word, fallbackType ?? 'multipleChoice');
      }

      // cardMatch 계열은 단일 단어로 처리 불가 → 폴백
      return createMultipleChoiceQuestion(word, fallbackType ?? 'multipleChoice');
    };

    if (questionTypesArr.length === 1 && !isRecommendedMode) {
      const plugin = getQuestionType(questionTypesArr[0]);
      if (plugin?.setupQuestions) {
        return plugin.setupQuestions(wordsWithSheetId, allWords);
      }
      return wordsWithSheetId.map(word => createMultipleChoiceQuestion(word, questionTypesArr[0]));
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
      const chosenType = suggestedType ?? randomType;

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

  // ─── setupTestQuestions (Phase 1.3 정식) ─────────────────────────────────────
  // 반환: { testQuestions, sessionId, composition, compositionStrategy }
  const setupTestQuestions = async (targetMemoryState, vocabularySheetId, count, testType) => {
    const useBackend = import.meta.env.VITE_RECOMMEND_BACKEND !== 'false';

    let selectedWords, sessionId, composition, compositionStrategy, allWords;

    if (useBackend) {
      try {
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

        if (res?.code === 200 && Array.isArray(res.data?.items)) {
          sessionId = res.data.session_id;
          composition = res.data.composition;
          // Phase 2.2: composition_strategy 저장
          compositionStrategy = res.data.composition_strategy ?? null;

          // 백엔드 응답 item → 클라이언트 word 형식으로 매핑
          // allWords(오답 선택지용)는 로컬 vocabularySheets에서 구성
          const legacyResult = legacyLocalSelection(targetMemoryState, vocabularySheetId, count, testType);
          allWords = legacyResult.allWords;

          selectedWords = res.data.items.map(item => {
            const derivedSm2 = deriveSm2FromFsrs(item.fsrs);
            return {
              // 기존 컴포넌트가 기대하는 필드 (id 필드 우선)
              id: item.user_voca_id,
              vocaIndexId: item.user_voca_id,
              vocabularySheetId: item.user_voca_book_id,
              origin: item.word,
              meanings: item.meanings ?? [],
              examples: item.examples ?? [],
              // FSRS 데이터
              fsrs: item.fsrs,
              // SM2 폴백 (다른 화면 호환, deriveSm2FromFsrs 변환값)
              sm2: derivedSm2,
              // 최상위 필드도 sm2에서 채움 (기존 컴포넌트 호환)
              ef: derivedSm2?.ef ?? 2.5,
              repetition: derivedSm2?.repetition ?? 0,
              interval: derivedSm2?.interval ?? 0,
              nextReview: derivedSm2?.nextReview ?? null,
              lastStudyDate: derivedSm2?.lastStudyDate ?? null,
              beforeScheduleCount: 0,
              // 버킷 정보
              priorityBucket: item.priority_bucket,
              // Phase 2.2: 백엔드 추천 문제 유형 및 이유 멘트
              suggestedQuestionType: item.suggested_question_type ?? null,
              reason: item.reason ?? null,
            };
          });
        } else {
          throw new Error('추천 API 응답 형식 오류');
        }
      } catch (e) {
        console.warn('[FSRS] /study/recommend 실패, 로컬 정렬로 폴백:', e);
        const legacyResult = legacyLocalSelection(targetMemoryState, vocabularySheetId, count, testType);
        selectedWords = legacyResult.selectedWords;
        allWords = legacyResult.allWords;
        sessionId = null;
        composition = null;
        compositionStrategy = null;

        // 폴백 모드에서 세션 생성 (선택사항, 실패해도 무시)
        try {
          const bookIds = Array.isArray(vocabularySheetId)
            ? vocabularySheetId
            : vocabularySheetId && vocabularySheetId !== 'all'
              ? [vocabularySheetId]
              : [];
          const sessionRes = await createStudySession({ testType, bookIds });
          sessionId = sessionRes?.data?.session_id ?? null;
        } catch (sessionErr) {
          console.warn('[FSRS] 폴백 세션 생성 실패 (무시):', sessionErr);
        }
      }
    } else {
      // VITE_RECOMMEND_BACKEND=false 명시적 폴백
      const legacyResult = legacyLocalSelection(targetMemoryState, vocabularySheetId, count, testType);
      selectedWords = legacyResult.selectedWords;
      allWords = legacyResult.allWords;
      sessionId = null;
      composition = null;
      compositionStrategy = null;
    }

    // 오답 선택지용 allWords가 없는 경우 안전하게 selectedWords로 대체
    if (!allWords || allWords.length === 0) {
      allWords = selectedWords;
    }

    // 문제 유형 분배 (기존 로직 그대로)
    const testQuestions = buildTestQuestions(selectedWords, allWords, vocabularySheetId);

    return { testQuestions, sessionId, composition, compositionStrategy };
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
          return;
        }
        // 잘못된 캐시 → else 블록으로 fall-through해서 재생성
      }
      {
        // 학습 기록이 없거나 잘못된 캐시이면 새로운 학습 데이터 생성 후 학습 시작
        console.log("state", state.data.memoryState);

        // Phase 1.3: 백엔드 추천 API 호출 (VITE_RECOMMEND_BACKEND !== 'false' 이면 기본 활성)
        const { testQuestions: tempTestQuestions, sessionId, compositionStrategy } = await setupTestQuestions(
          state.data.memoryState,
          state.data.vocabularySheetId,
          state.data.count,
          state.testType
        );

        // 추천 응답의 session_id를 ref에 저장 (정식 세션 ID)
        studySessionRef.current = sessionId ?? null;
        // Phase 2.2: compositionStrategy를 ref에 저장 (결과 화면 전달용)
        compositionStrategyRef.current = compositionStrategy ?? null;

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
        await updateVocabularySheetAndRecentStudyData();
        navigate("/take-test/result", {
          state: {
            testQuestions: testQuestions,
            testType: state.testType,
            // Phase 2.2: composition_strategy 전달
            compositionStrategy: compositionStrategyRef.current ?? null,
          }
        });
      }
    };
    handleUpdateAndNavigate();
    // eslint-disable-next-line
  }, [recentStudy]);

  // React Compiler가 자동으로 useCallback 처리
  const updateVocabularySheetAndRecentStudyData = async () => {
    try {
      // 1. 단어장 메타데이터 업데이트 (기존 로직)
      if (pendingUpdateSheetIds.size > 0) {
        const sheetIds = Array.from(pendingUpdateSheetIds);
        pendingUpdateSheetIds.clear(); // Clear immediately to prevent double updates
        await Promise.all(sheetIds.map(async sheetId => {
          await updateVocabularySheetServer(sheetId);
        }));
      }

      // 2. [NEW] 개별 단어 업데이트 (암기 상태 저장)
      if (pendingUpdateWords.size > 0) {
        console.log(`Sending updates for ${pendingUpdateWords.size} words...`);
        const wordsToUpdate = Array.from(pendingUpdateWords.values());
        pendingUpdateWords.clear(); // Clear immediately

        await Promise.all(wordsToUpdate.map(async ({ sheetId, wordId, updateData }) => {
          try {
            await updateWord(sheetId, wordId, { sm2: updateData.sm2 });
          } catch (error) {
            console.error(`Failed to update word ${wordId}:`, error);
          }
        }));
      }

      // 3. 학습 기록(RecentStudy) 업데이트
      await updateRecentStudyServer(state.testType);

      // 4. 최신 단어장 데이터 다시 가져오기
      await fetchVocabularySheets();

    } catch (error) {
      console.error('Error updating study data:', error);
    }
  };

  if (isTestQuestionsSetting) {
    return (
      <div>
        <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
        <MakeStudyData />
      </div>
    );
  } else {
    if (recentStudy[state.testType]?.status === "end") {
      // 학습 종료 후 학습 결과 저장 중 ... 처리
      return (
        <div>
          <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
          <SaveStudyData studySessionRef={studySessionRef} />
        </div>
      );
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
        />
      </div>
    );
  }

};

export default TakeTest; 