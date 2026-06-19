import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useVocabulary } from '../../context/VocabularyContext';
import { Circle, X, BookOpenText, WarningCircle, HandsClapping, Leaf, Plant, Carrot, EggCrack, SpeakerHigh } from "@phosphor-icons/react";
import { getTextSound, prefetchTextSound } from '../../utils/common';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { ProblemDataNewBottomSheet } from '../newBottomSheet/ProblemDataNewBottomSheet';
import { analyzeLearningPattern } from '../../utils/common';
import MemorizationStatus from "../common/MemorizationStatus";
import { vibrate } from '../../utils/osFunction';
import { playSuccessSound, playErrorSound } from '../../utils/audio';
import { getQuestionType } from '../../plugins/questionTypes';
import { logStudyQuestion } from '../../api/study';
import { getAdvanceDelay } from '../../utils/studyTiming';


const iconComponentMap = {
  WarningCircle: <WarningCircle size={32} weight="fill" color="#F26A6A" />,
  HandsClapping: <HandsClapping size={32} weight="fill" color="#39E859" />,
}

// stability 기반 암기 상태 키 (FSRS)
const getMemoryStateKeyByStability = (stability, state) => {
  if (!state || state === 'new') return 'unlearned';
  if (stability < 10) return 'leaf';
  if (stability < 60) return 'plant';
  return 'carrot';
};

const stateNameMap = { unlearned: '미학습', leaf: '단기 암기', plant: '중기 암기', carrot: '장기 암기' };

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

const Main = ({ testQuestions, setTestQuestions, progressIndex, setProgressIndex, setPendingUpdateSheetIds, setPendingUpdateWords, testType, studySessionRef, pendingLogPromisesRef }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const [isCorrect, setIsCorrect] = useState(null);
  const [userSelected, setUserSelected] = useState(null);
  const [progressBarIndex, setProgressBarIndex] = useState(progressIndex || 0);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isStay, setIsStay] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [updateType, setUpdateType] = useState(null); // SM-2 업데이트 타입
  const startTimeRef = useRef(null);
  const endTimeRef = useRef(null);
  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { pushNewBottomSheet } = useNewBottomSheetActions();
  const { updateWord, updateRecentStudy, recentStudy, setRecentStudy, updateWordState, updateRecentStudyState } = useVocabulary();
  const [isSuspicious, setIsSuspicious] = useState(null);

  const [tempSm2, setTempSm2] = useState(null);
  const [prevMemoryState, setPrevMemoryState] = useState(null);
  const [memoryStateChange, setMemoryStateChange] = useState(null);

  const navigate = useNavigate();

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

  // 문제가 변경될 때마다 텍스트 읽기 (cardMatch는 제외 - 단어 클릭 시 재생)
  useEffect(() => {
    setIsSpeaking(false);
    if (testQuestions[progressIndex]) {
      const question = testQuestions[progressIndex];
      if (!['cardMatch', 'cardMatchListening', 'fillInTheBlank'].includes(question.questionType) && question.origin) {
        (async () => {
          setIsSpeaking(true);
          try {
            await getTextSound(question.origin, "en");
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
    if (prevMemoryState && prevMemoryState !== newStateKey) {
      setMemoryStateChange({
        from: stateNameMap[prevMemoryState] ?? prevMemoryState,
        to: stateNameMap[newStateKey] ?? newStateKey,
        stateKey: newStateKey,
      });
    }
  }

  // React Compiler가 자동으로 useCallback 처리
  // 아래 버튼 클릭 시
  const handleClickNext = async () => {
    if (userSelected === null) return;
    if (isFetching) return;
    const timeTakenSec = Math.round((endTimeRef.current - startTimeRef.current) / 1000);
    if (isStay) {
      if (isSuspicious) return;
      setUpdateRecentStudyStateAndStatus();
      return;
    };
    if (isAnswered) return;
    endTimeRef.current = Date.now();
    const resultIndex = testQuestions[progressIndex].resultIndex;
    // 정답/오답 설정과 동시에 프로그레스바 증가
    let q = 0;
    if (resultIndex === userSelected) {
      vibrate({ type: 'notificationSuccess' });
      playSuccessSound();
      setIsCorrect(true);
      testQuestions[progressIndex].isCorrect = true;
      testQuestions[progressIndex].userResultIndex = userSelected;
      q = timeTakenSec <= 5 ? 5 : timeTakenSec <= 10 ? 4 : timeTakenSec <= 15 ? 3 : 0
    } else {
      vibrate({ type: 'notificationError' });
      playErrorSound();
      setIsCorrect(false);
      testQuestions[progressIndex].isCorrect = false;
      testQuestions[progressIndex].userResultIndex = userSelected;
      q = 0;
    }
    const learningPattern = analyzeLearningPattern(testQuestions[progressIndex], q);

    if (learningPattern.isSuspicious && learningPattern.confidence === "high") {
      setIsSuspicious({
        ...learningPattern,
        fsrs: testQuestions[progressIndex].fsrs,
      });
    }

    // 낙관적 UI: 답변 직후 즉시 임시 fsrs + 암기상태 변경 알림
    {
      const isCorrectAnswer = resultIndex === userSelected;
      applyOptimisticGrade(progressIndex, isCorrectAnswer);
    }

    if (studySessionRef?.current != null) {
      // 백엔드 모드: logStudyQuestion 호출, 응답 fsrs로 상태 업데이트
      const question = testQuestions[progressIndex];
      const idx = progressIndex;
      const promise = logStudyQuestion({
        session_id: studySessionRef.current,
        user_voca_id: question.vocaIndexId ?? question.id,
        user_voca_book_id: question.vocabularySheetId ?? null,
        question_type: question.questionType,
        was_correct: resultIndex === userSelected,
        time_taken_ms: timeTakenSec * 1000,
        client_now: new Date().toISOString(),
      }).then(logRes => {
        if (logRes?.data?.fsrs) {
          testQuestions[idx].fsrs = logRes.data.fsrs;
          setTestQuestions([...testQuestions]);
          // 암기 상태 변화 감지 (현재 진행 중인 문제만 배지 갱신)
          if (idx === progressIndex) {
            if (logRes.data.memory_state_change) {
              const fromKey = logRes.data.memory_state_change.from;
              const toKey = logRes.data.memory_state_change.to;
              if (fromKey && toKey && fromKey !== toKey) {
                setMemoryStateChange({ from: stateNameMap[fromKey] ?? fromKey, to: stateNameMap[toKey] ?? toKey, stateKey: toKey });
              }
            } else {
              const stability = logRes.data.fsrs.stability ?? 0;
              const newStateKey = getMemoryStateKeyByStability(stability, logRes.data.fsrs.state);
              if (prevMemoryState && prevMemoryState !== newStateKey) {
                setMemoryStateChange({ from: stateNameMap[prevMemoryState], to: stateNameMap[newStateKey], stateKey: newStateKey });
              }
            }
          }
        }
      }).catch(e => console.warn('[FSRS] logStudyQuestion 실패:', e));
      if (pendingLogPromisesRef) pendingLogPromisesRef.current.push(promise);
    } else {
      // 방어 가드: 세션이 없는 비정상 경로 (학습 시작 실패에도 도달 시 isCorrect만 갱신)
      testQuestions[progressIndex].isCorrect = resultIndex === userSelected;
    }

    setProgressBarIndex(progressBarIndex + 1);
    setIsStay(true);
    setIsAnswered(true);
  }

  // React Compiler가 자동으로 useCallback 처리
  // 시험 모드에서 문제 선택지 선택 시
  const handleClickExamOption = (index, option) => {

    const timeTakenSec = Math.round((endTimeRef.current - startTimeRef.current) / 1000);
    endTimeRef.current = Date.now();
    const resultIndex = testQuestions[progressIndex].resultIndex;
    // 정답/오답 설정과 동시에 프로그레스바 증가
    let q = 0;
    if (resultIndex === index) {
      vibrate({ type: 'notificationSuccess' });
      playSuccessSound();
      setIsCorrect(true);
      testQuestions[progressIndex].isCorrect = true;
      testQuestions[progressIndex].userResultIndex = index;
      q = timeTakenSec <= 5 ? 5 : timeTakenSec <= 10 ? 4 : timeTakenSec <= 15 ? 3 : 0
    } else {
      vibrate({ type: 'notificationError' });
      playErrorSound();
      setIsCorrect(false);
      testQuestions[progressIndex].isCorrect = false;
      testQuestions[progressIndex].userResultIndex = index;
      q = 0;
    }

    // 낙관적 UI: 답변 직후 즉시 임시 fsrs + 암기상태 변경 알림
    {
      const isCorrectAnswer = resultIndex === index;
      applyOptimisticGrade(progressIndex, isCorrectAnswer);
    }

    if (studySessionRef?.current != null) {
      // 백엔드 모드: logStudyQuestion 호출, 응답 fsrs로 상태 업데이트
      const question = testQuestions[progressIndex];
      const idx = progressIndex;
      const timeTakenMsExam = endTimeRef.current - startTimeRef.current;
      const promise = logStudyQuestion({
        session_id: studySessionRef.current,
        user_voca_id: question.vocaIndexId ?? question.id,
        user_voca_book_id: question.vocabularySheetId ?? null,
        question_type: question.questionType,
        was_correct: resultIndex === index,
        time_taken_ms: timeTakenMsExam,
        client_now: new Date().toISOString(),
      }).then(logRes => {
        if (logRes?.data?.fsrs) {
          testQuestions[idx].fsrs = logRes.data.fsrs;
          setTestQuestions([...testQuestions]);
        }
      }).catch(e => console.warn('[FSRS] logStudyQuestion 실패:', e));
      if (pendingLogPromisesRef) pendingLogPromisesRef.current.push(promise);
    } else {
      // 방어 가드: 세션이 없는 비정상 경로
      testQuestions[progressIndex].isCorrect = resultIndex === index;
    }

    setProgressBarIndex(progressBarIndex + 1);
    setIsAnswered(true);

    // 오답일 때는 정답·해설을 충분히 인지하도록 전환을 더 천천히 (정답 1초 / 오답 2.5초)
    setTimeout(() => {
      setUpdateRecentStudyStateAndStatus();
    }, getAdvanceDelay(resultIndex === index));
  }


  // React Compiler가 자동으로 useCallback 처리
  // 이전 기록 유지
  const handleClickMistake = () => {
    // 실수였으므로 fsrs 상태를 되돌린다 (이전 fsrs 유지)
    // isSuspicious는 UI 분기 데이터만 가지고 있으므로 별도 fsrs 롤백 없이 그냥 진행
    setIsSuspicious(null);
    setUpdateRecentStudyStateAndStatus();
  }
  // React Compiler가 자동으로 useCallback 처리
  // 새로운 기록 적용
  const handleClickNormal = () => {
    setIsSuspicious(null);
    setUpdateRecentStudyStateAndStatus();
  }

  // React Compiler가 자동으로 useCallback 처리
  // 문제 읽기
  const handleClickTTS = async () => {
    const question = testQuestions[progressIndex];
    const textToRead = question.origin;
    const lang = "en";
    setIsSpeaking(true);
    try {
      await getTextSound(textToRead, lang);
    } finally {
      setIsSpeaking(false);
    }
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
  // 문제 완료 시 처리
  const setUpdateRecentStudyStateAndStatus = () => {
    const sheetId = testQuestions[progressIndex].vocabularySheetId;
    const wordId = testQuestions[progressIndex].id;
    setIsFetching(true);

    const updateData = {
      fsrs: testQuestions[progressIndex].fsrs,
      isCorrect: testQuestions[progressIndex].isCorrect,
      updatedAt: new Date().toISOString(),
    }

    updateWordState(sheetId, wordId, updateData);
    setIsFetching(false);
    setPendingUpdateSheetIds(prev => new Set(prev.add(sheetId)));
    // [NEW] 변경된 단어 저장큐에 추가
    setPendingUpdateWords(prev => {
      const newMap = new Map(prev);
      newMap.set(wordId, { sheetId, wordId, updateData });
      return newMap;
    });

    const isNotLastQuestion = progressIndex !== testQuestions.length - 1;


    updateRecentStudyState({
      [testType]: {
        ...recentStudy[testType],
        progress_index: isNotLastQuestion ? progressIndex + 1 : null,
        status: isNotLastQuestion ? "learning" : "end",
        study_data: testQuestions,
        updated_at: new Date().toISOString(),
      }
    });
    if (isNotLastQuestion) {
      setProgressIndex(progressIndex + 1);
      setIsCorrect(null);
      setUserSelected(null);
      setIsAnswered(false);
      setIsStay(false);
      setUpdateType(null); // 업데이트 타입 초기화
      setMemoryStateChange(null); // 암기 상태 변화 초기화
    }


    // if(progressIndex === testQuestions.length-1){ // 마지막 문제
    //   updateRecentStudyState({
    //     ...recentStudy,
    //     progress_index : null,
    //     status: "end",
    //     study_data: testQuestions,
    //     updated_at : new Date().toISOString(),
    //   });
    // }else{
    //   updateRecentStudyState({
    //     ...recentStudy,
    //     progress_index : progressIndex + 1,
    //     status: "learning",
    //     study_data: testQuestions,
    //     updated_at : new Date().toISOString(),
    //   });


    //   setProgressIndex(progressIndex + 1);
    //   setIsCorrect(null);
    //   setUserSelected(null);
    //   setIsAnswered(false);
    //   setIsStay(false);
    // }  
  }

  // 플러그인 컴포넌트용 완료 콜백 (cardMatch, fillInTheBlank 등)
  const handlePluginComplete = (results) => {
    const setWords = testQuestions[progressIndex].words;
    const questionType = testQuestions[progressIndex].questionType;
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

      // 백엔드 /study/log 로그 + fsrs 갱신
      if (studySessionRef?.current != null) {
        const promise = logStudyQuestion({
          session_id: studySessionRef.current,
          user_voca_id: wordId,
          user_voca_book_id: sheetId ?? null,
          question_type: questionType,
          was_correct: !!wordIsCorrect,
          time_taken_ms: typeof timeTakenMs === 'number' ? timeTakenMs : 5000,
          client_now: new Date().toISOString(),
        }).then(logRes => {
          if (logRes?.data?.fsrs) {
            // 단어장 컨텍스트 갱신 (홈 카운터용)
            updateWordState(sheetId, wordId, { fsrs: logRes.data.fsrs });
            // 결과 화면용으로 testQuestions 의 해당 word 도 업데이트
            if (Array.isArray(setWords)) {
              const target = setWords.find(w => w.id === wordId);
              if (target) target.fsrs = logRes.data.fsrs;
            }
            // FillInTheBlank처럼 question 자체가 단일 단어인 경우도 갱신
            if (testQuestions[progressIndex]?.id === wordId) {
              testQuestions[progressIndex].fsrs = logRes.data.fsrs;
            }
            // 플러그인이 새 fsrs로 placeholder→실값 전환할 수 있도록 리렌더 트리거
            setTestQuestions([...testQuestions]);
          }
        }).catch(e => console.warn('[FSRS] logStudyQuestion(plugin) 실패:', e));
        if (pendingLogPromisesRef) pendingLogPromisesRef.current.push(promise);
      }
    });

    const isNotLastQuestion = progressIndex !== testQuestions.length - 1;
    // cardMatch는 모두 정답 처리 완료 시 호출되므로 isCorrect는 세트 기준 true
    testQuestions[progressIndex].isCorrect = results.every(r => r.isCorrect);

    updateRecentStudyState({
      [testType]: {
        ...recentStudy[testType],
        progress_index: isNotLastQuestion ? progressIndex + 1 : null,
        status: isNotLastQuestion ? "learning" : "end",
        study_data: testQuestions,
        updated_at: new Date().toISOString(),
      }
    });

    if (isNotLastQuestion) {
      setProgressIndex(progressIndex + 1);
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
  // 전체 단어/카드 수 (cardMatch 세트는 words.length, 나머지는 1)
  const totalWordCount = testQuestions.reduce((sum, q) =>
    ['cardMatch', 'cardMatchListening'].includes(q.questionType) ? sum + (q.words?.length ?? 4) : sum + 1, 0
  );

  const currentPlugin = getQuestionType(testQuestions[progressIndex]?.questionType);
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
            animate={{ width: `${Math.floor(progressBarIndex / totalWordCount * 100)}%` }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            style={{ willChange: 'width' }}
          />
          <span className="
            absolute right-[10px] top-[50%] translate-y-[-50%]
            text-[#7b7b7b] text-[10px] font-semibold tracking-[-0.2px]
          ">
            {Math.floor(progressBarIndex)}/{totalWordCount}
          </span>
        </motion.div>
        <div className="relative flex h-full overflow-hidden">
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
                onCardMatched={() => setProgressBarIndex(prev => prev + 1)}
              />
            </motion.div>
          </AnimatePresence>
        </div>
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
            width: `${Math.floor(progressBarIndex / totalWordCount * 100)}%`
          }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          style={{ willChange: 'width' }}
        />
        <span className="
          absolute right-[10px] top-[50%] translate-y-[-50%]
          text-[#7b7b7b] text-[10px] font-semibold tracking-[-0.2px]
        ">
          {progressBarIndex}/{totalWordCount}
        </span>
      </motion.div>

      <div className="relative middle flex h-full overflow-hidden">
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
                          text-[10px] font-[600]
                          overflow-hidden
                          whitespace-nowrap
                          ${stateColorMap[memoryStateChange.stateKey]?.border ?? 'border-[#38CE38]'}
                          ${stateColorMap[memoryStateChange.stateKey]?.text ?? 'text-[#38CE38]'}
                          ${stateColorMap[memoryStateChange.stateKey]?.bg ?? 'bg-[#EBFFEE] dark:bg-[#EBFFEE]/20'}
                        `}
                        initial={{ maxWidth: 28 }}
                        animate={{ maxWidth: 300 }}
                        transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
                      >
                        <span className="flex-shrink-0">{stateIconMap[memoryStateChange.stateKey]}</span>
                        <motion.span
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.2, duration: 0.25 }}
                        >
                          암기 상태가 {memoryStateChange.to}로 변경되었어요!
                        </motion.span>
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
                      {isSpeaking && (
                        <>
                          <motion.div
                            className="absolute rounded-full border-2 border-primary-main-600"
                            initial={{ width: 60, height: 60, opacity: 0.7 }}
                            animate={{ width: 110, height: 110, opacity: 0 }}
                            transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
                          />
                          <motion.div
                            className="absolute rounded-full border-2 border-primary-main-600"
                            initial={{ width: 60, height: 60, opacity: 0.7 }}
                            animate={{ width: 110, height: 110, opacity: 0 }}
                            transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut", delay: 0.4 }}
                          />
                        </>
                      )}
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
      <AnimatePresence>
        {isSuspicious && (
          <motion.div
            className="
            absolute bottom-0 left-0 right-0
            flex flex-col gap-[30px] items-center justify-end
            h-[210px]
            px-[16px] py-[20px]
            bg-[linear-gradient(180deg,rgba(255,233,233,0)_0%,rgba(255,233,233,.5)_10%,rgba(255,233,233,1)_30%,rgba(255,233,233,1)_100%)]
          "
            initial={{ y: 210 }}
            animate={{ y: 0 }}
            exit={{ y: 210 }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 30,
              duration: 0.3
            }}
            style={{ willChange: 'transform' }}
          >
            <div className="
            flex flex-col items-center gap-[10px]
            text-layout-white text-[14px] font-[700]
          ">
              {iconComponentMap[isSuspicious.icon]}
              <span className="
              text-layout-black dark:text-layout-white text-[16px] font-[600]
            ">
                {isSuspicious.message}
              </span>
              <span className="
              text-layout-black dark:text-layout-white text-[14px] font-[400]
            ">
                암기 상태를 수정하시겠습니까?
              </span>
            </div>
            <div
              className="
              flex items-center justify-between gap-[10px] w-full
            "
            >
              {
                isSuspicious.btn.map((btn, index) => (
                  <motion.button
                    key={index}
                    className={`
                    flex-1
                    h-[45px]
                    rounded-[8px]
                    text-layout-white text-[16px] font-[700]
                    ${btn.color}
                  `}
                    whileTap={{ scale: 0.95 }}
                    transition={{
                      type: "spring",
                      stiffness: 500,
                      damping: 15
                    }}
                    onClick={() => {
                      vibrate({ duration: 5 });
                      btn.type === "mistake" ? handleClickMistake() : handleClickNormal();
                    }}
                  >
                    {btn.text}
                  </motion.button>
                ))
              }
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default Main; 