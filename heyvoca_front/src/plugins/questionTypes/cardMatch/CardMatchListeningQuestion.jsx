import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SpeakerHigh } from '@phosphor-icons/react';
import { getTextSound } from '../../../utils/common';
import { haptic } from '../../../lib/feel';
import { playSuccessSound, playErrorSound } from '../../../utils/audio';
import TtsRipple from '../../../components/common/TtsRipple';
import MemoryStateChangeBadge, {
  MEMORY_STATE_RANK as STATE_RANK,
  getMemoryStateKeyByStability,
} from '../../../components/common/MemoryStateChangeBadge';
import { FarmResultBar } from '../../../components/farm/FarmStatusBar';
import { useStudyAdvanceGate } from '../../../hooks/useStudyAdvanceGate';
import { getAdvanceDelay } from '../../../utils/studyTiming';
import StudyTimingTag from '../../../components/farm/StudyTimingTag';
import { useResumeReplayKey } from '../../../hooks/useResumeReplayKey';
import { wordLang } from '../../../utils/lang';

const FitText = ({ text, maxSize = 20, minSize = 12, className = '' }) => {
  const spanRef = useRef(null);
  const [fontSize, setFontSize] = useState(maxSize);

  useEffect(() => {
    setFontSize(maxSize);
  }, [text, maxSize]);

  useEffect(() => {
    const el = spanRef.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;
    let size = maxSize;
    el.style.fontSize = `${size}px`;
    while (el.scrollWidth > parent.clientWidth && size > minSize) {
      size -= 1;
      el.style.fontSize = `${size}px`;
    }
    setFontSize(size);
  }, [text, maxSize, minSize]);

  return (
    <span
      ref={spanRef}
      className={className}
      style={{ fontSize: `${fontSize}px` }}
    >
      {text}
    </span>
  );
};

// 카드 채점 깜빡임(초록/빨강 테두리) 길이 — 그 뒤 매칭 완료/실패 상태로 바뀐다.
const CARD_FLASH_MS = 800;

const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const CardMatchListeningQuestion = ({ question, testType, onComplete, onCardMatched, farmByWordId }) => {
  const [leftWords] = useState(() => question.words);
  const [rightWords] = useState(() => shuffleArray(question.words));
  const [selectedLeft, setSelectedLeft] = useState(null);
  const [selectedRight, setSelectedRight] = useState(null);
  const [matchedWordIds, setMatchedWordIds] = useState(new Set());
  const [failedWordIds, setFailedWordIds] = useState(new Set());
  const [correctFlashWordIds, setCorrectFlashWordIds] = useState(new Set());
  const [wrongFlashLeftWordIds, setWrongFlashLeftWordIds] = useState(new Set());
  const [wrongFlashRightWordIds, setWrongFlashRightWordIds] = useState(new Set());
  const [animatingWordIds, setAnimatingWordIds] = useState(new Set());
  const [speakingWordId, setSpeakingWordId] = useState(null);
  const [speakingDuration, setSpeakingDuration] = useState(null);
  const [wordResolvedStates, setWordResolvedStates] = useState({});
  // 백그라운드 복귀 시 성장 게이지가 최종 상태로 정적으로 스냅되는 것을 막기 위한
  // 재마운트용 키 (이유는 useResumeReplayKey 주석 참고)
  const resumeReplayKey = useResumeReplayKey();
  const wordResultsRef = useRef({});
  const questionStartRef = useRef(Date.now());
  const wordStartRef = useRef({});

  /*
    전환 게이트 — 모든 유형 공통 규칙(utils/studyTiming.js). 세트의 **마지막 카드**가 채점된
    순간을 기준으로, 최소 대기(그 카드 정답 1초/오답 2.5초, 단 카드 깜빡임 0.8초 + 0.6초 이상),
    모든 카드 상태 바의 XP 연출 끝 + 0.7초, 단어 TTS 끝 + 0.2초 중 가장 늦은 시각에 넘어간다.
    예전엔 마지막 카드 채점 1.4초 뒤 고정이라, 서버 응답이 늦으면 XP 가 오르는 도중에 넘어갔다.
  */
  const advanceGate = useStudyAdvanceGate();
  const gradedCountRef = useRef(0);
  const farmStartedIdsRef = useRef(new Set());
  const farmSettledIdsRef = useRef(new Set());
  const speakGenRef = useRef(0);
  // 넘어갈 때는 최신 onComplete 를 부른다(채점 순간 함수는 재출제 삽입 전 testQuestions 를 본다).
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; });

  // 게이트에 세트 전체의 XP 연출 상태를 알린다 — 모든 카드가 끝났으면 settled, 하나라도 도는 중이면 started.
  const syncFarmGate = () => {
    if (!advanceGate.isArmed()) return;
    const ids = question.words.map(w => w.id);
    if (ids.every(id => farmSettledIdsRef.current.has(id))) advanceGate.farmSettled();
    else if (ids.some(id => farmStartedIdsRef.current.has(id))) advanceGate.farmStarted();
  };
  const handleFarmStart = (wordId) => {
    farmStartedIdsRef.current.add(wordId);
    farmSettledIdsRef.current.delete(wordId);
    syncFarmGate();
  };
  const handleFarmSettled = (wordId) => {
    farmSettledIdsRef.current.add(wordId);
    syncFarmGate();
  };

  const buildResults = (wordResults) => {
    return question.words.map(word => {
      const result = wordResults[word.id] ?? { attempts: 1, isCorrect: false, timeTakenMs: 5000 };
      return {
        wordId: word.id,
        sheetId: word.vocabularySheetId ?? question.vocabularySheetId,
        isCorrect: result.isCorrect,
        timeTakenMs: result.timeTakenMs ?? 5000,
        updateData: { fsrs: word.fsrs, isCorrect: result.isCorrect, updatedAt: new Date().toISOString() },
      };
    });
  };

  const resolveWordState = (word, isMatch, attempts) => {
    // 시각적 피드백용 — 실제 FSRS 업데이트는 백엔드 /study/log에서 처리
    const prevStability = word.fsrs?.stability ?? 0;
    const prevState = word.fsrs?.state ?? null;
    const prevKey = getMemoryStateKeyByStability(prevStability, prevState);

    // 낙관적 추정
    const optimisticStability = isMatch ? Math.max(prevStability, 3.13) : Math.max(prevStability * 0.3, 0.5);
    const optimisticState = prevState && prevState !== 'new' ? (isMatch ? 'review' : 'relearning') : 'learning';
    const newKey = getMemoryStateKeyByStability(optimisticStability, optimisticState);
    const stateNameMap = { unlearned: '미학습', leaf: '단기 암기', plant: '중기 암기', carrot: '장기 암기' };

    // 항상 미래 next_review로 새로 계산. 학습 직전 fsrs.next_review는 오늘/과거라 그대로 두면 표시 안 됨.
    const daysAhead = Math.max(1, Math.round(optimisticStability));
    const next = new Date();
    next.setDate(next.getDate() + daysAhead);
    const optimisticNextReview = next.toISOString();

    // 결과 화면 '암기 상태 변화' 리스트용 — word 객체에 직접 기록 (StudyResult가 flatten해서 읽음)
    word.prevMemoryStateKey = word.prevMemoryStateKey ?? prevKey;
    word.nextMemoryStateKey = newKey;

    setWordResolvedStates(prev => ({
      ...prev,
      [word.id]: {
        prevKey,
        newKey,
        to: stateNameMap[newKey] ?? newKey,
        dir: (STATE_RANK[newKey] ?? 0) > (STATE_RANK[prevKey] ?? 0) ? 'up' : 'down',
        nextReview: optimisticNextReview,
        changed: prevKey !== newKey,
        isCorrect: isMatch,
      },
    }));
  };

  const checkMatch = (leftIdx, rightIdx) => {
    const leftWord = leftWords[leftIdx];
    const rightWord = rightWords[rightIdx];
    const isMatch = leftWord.id === rightWord.id;

    const prev = wordResultsRef.current[leftWord.id] ?? { attempts: 0, isCorrect: false };
    const newAttempts = prev.attempts + 1;
    if (!wordStartRef.current[leftWord.id]) wordStartRef.current[leftWord.id] = questionStartRef.current;
    const timeTakenMs = Date.now() - wordStartRef.current[leftWord.id];
    wordResultsRef.current[leftWord.id] = { attempts: newAttempts, isCorrect: isMatch, timeTakenMs };

    setSelectedLeft(null);
    setSelectedRight(null);
    setAnimatingWordIds(prev => new Set([...prev, leftWord.id]));

    // 마지막 카드가 채점된 순간 전환 게이트를 건다(위 advanceGate 주석).
    gradedCountRef.current += 1;
    const isLastCard = gradedCountRef.current === question.words.length;

    // 카드 1장 채점 즉시 부모에 결과 전달 → 콤보/프로그래스 바로 반영
    // (CardMatchQuestion.jsx의 notifyResolved와 동일한 데이터 구조/타이밍)
    const notifyResolved = () => {
      onCardMatched?.({
        wordId: leftWord.id,
        sheetId: leftWord.vocabularySheetId ?? question.vocabularySheetId,
        isCorrect: isMatch,
        timeTakenMs,
        updateData: { fsrs: leftWord.fsrs, isCorrect: isMatch, updatedAt: new Date().toISOString() },
      });
    };

    if (isMatch) {
      haptic('success');
      playSuccessSound();
      resolveWordState(leftWord, true, newAttempts);
      // 카드가 풀린 **그 순간** 부모에 알린다. 800ms 뒤에 알리면 그동안 구버전 표시가
      // 먼저 떴다가 농장 상태 바로 바뀌어, 채점 결과가 두 번 다른 모습으로 나타난다.
      notifyResolved();
      setCorrectFlashWordIds(prev => new Set([...prev, leftWord.id]));

      setTimeout(() => {
        setCorrectFlashWordIds(prev => { const s = new Set(prev); s.delete(leftWord.id); return s; });
        setMatchedWordIds(prev => new Set([...prev, leftWord.id]));
        setAnimatingWordIds(prev => { const s = new Set(prev); s.delete(leftWord.id); return s; });

      }, CARD_FLASH_MS);
    } else {
      haptic('error');
      playErrorSound();
      resolveWordState(leftWord, false, newAttempts);
      notifyResolved();   // 정답 분기와 같은 이유 — 표시가 두 번 바뀌지 않게 즉시 알린다
      setWrongFlashLeftWordIds(prev => new Set([...prev, leftWord.id]));
      setWrongFlashRightWordIds(prev => new Set([...prev, rightWord.id]));

      setTimeout(() => {
        setWrongFlashLeftWordIds(prev => { const s = new Set(prev); s.delete(leftWord.id); return s; });
        setWrongFlashRightWordIds(prev => { const s = new Set(prev); s.delete(rightWord.id); return s; });
        setFailedWordIds(prev => new Set([...prev, leftWord.id]));
        setAnimatingWordIds(prev => { const s = new Set(prev); s.delete(leftWord.id); return s; });

      }, CARD_FLASH_MS);
    }

    if (isLastCard) {
      advanceGate.arm({
        minDelayMs: Math.max(CARD_FLASH_MS + 600, getAdvanceDelay(isMatch)),
        // 모든 카드는 채점 순간 onCardMatched 로 이미 처리됐다 — 넘어갈 때는 진행만(processed).
        onAdvance: () => onCompleteRef.current?.(buildResults(wordResultsRef.current), { processed: typeof onCardMatched === 'function' }),
      });
      syncFarmGate();
    }
  };

  const handleLeftClick = (index) => {
    const word = leftWords[index];
    if (matchedWordIds.has(word.id) || failedWordIds.has(word.id) || animatingWordIds.has(word.id)) return;

    const wordId = word.id;
    setSpeakingWordId(wordId);
    setSpeakingDuration(null);
    // 단어를 읽는 중에는 세트를 넘기지 않는다(끝 + 0.2초) — 다른 유형과 같은 규칙.
    const gen = ++speakGenRef.current;
    advanceGate.ttsBegin();
    getTextSound(word.origin, wordLang(word, wordLang(question)), setSpeakingDuration).finally(() => {
      setSpeakingWordId(prev => prev === wordId ? null : prev);
      if (gen === speakGenRef.current) advanceGate.ttsEnd();
    });

    if (selectedRight !== null) {
      checkMatch(index, selectedRight);
    } else {
      setSelectedLeft(index === selectedLeft ? null : index);
    }
  };

  const handleRightClick = (index) => {
    const word = rightWords[index];
    if (matchedWordIds.has(word.id) || wrongFlashRightWordIds.has(word.id)) return;

    if (selectedLeft !== null) {
      checkMatch(selectedLeft, index);
    } else {
      setSelectedRight(index === selectedRight ? null : index);
    }
  };

  const getLeftCardStyle = (index) => {
    const word = leftWords[index];
    // 풀린 카드는 **글자만** 흐리게 한다(getLeftTextStyle). 카드 전체에 opacity 를 걸면 안에 뜬
    // 농장 상태 바까지 반투명해져, 다른 유형과 달리 카드 맞추기만 XP 결과가 흐리게 보였다.
    if (matchedWordIds.has(word.id)) return 'bg-status-success-100 dark:bg-status-success-dark border-transparent';
    if (failedWordIds.has(word.id)) return 'border-transparent bg-status-error-100 dark:bg-status-error-dark';
    if (correctFlashWordIds.has(word.id)) return 'border-status-success-500 bg-status-success-100 dark:bg-status-success-dark';
    if (wrongFlashLeftWordIds.has(word.id)) return 'border-status-error-500 bg-status-error-100 dark:bg-status-error-dark';
    if (selectedLeft === index) return 'border-primary-main-600 bg-primary-main-50 dark:bg-primary-main-dark';
    return 'border-transparent';
  };

  const getLeftIconStyle = (index) => {
    const word = leftWords[index];
    if (matchedWordIds.has(word.id) || correctFlashWordIds.has(word.id)) return 'text-status-success-500';
    if (failedWordIds.has(word.id) || wrongFlashLeftWordIds.has(word.id)) return 'text-status-error-500';
    if (speakingWordId === word.id || selectedLeft === index) return 'text-primary-main-600';
    return 'text-layout-gray-300';
  };

  const getLeftTextStyle = (index) => {
    const word = leftWords[index];
    if (matchedWordIds.has(word.id)) return 'text-status-success-600 opacity-50';
    if (failedWordIds.has(word.id)) return 'text-status-error-600 opacity-50';
    if (correctFlashWordIds.has(word.id)) return 'text-status-success-600';
    if (wrongFlashLeftWordIds.has(word.id)) return 'text-status-error-600';
    return 'text-layout-black dark:text-layout-white';
  };

  const getRightStyle = (index) => {
    const word = rightWords[index];
    if (matchedWordIds.has(word.id)) return 'opacity-50 bg-status-success-100 dark:bg-status-success-dark border-status-success-500';
    if (correctFlashWordIds.has(word.id)) return 'border-status-success-500 bg-status-success-100 dark:bg-status-success-dark';
    if (wrongFlashRightWordIds.has(word.id)) return 'border-status-error-500 bg-status-error-100 dark:bg-status-error-dark';
    if (selectedRight === index) return 'border-primary-main-600';
    return 'border-layout-gray-200 bg-layout-white dark:bg-layout-black';
  };

  const getRightTextStyle = (index) => {
    const word = rightWords[index];
    if (matchedWordIds.has(word.id) || correctFlashWordIds.has(word.id)) return 'text-status-success-600';
    if (wrongFlashRightWordIds.has(word.id)) return 'text-status-error-600';
    return 'text-layout-black dark:text-layout-white';
  };

  return (
    <div className="grid grid-cols-2 gap-[10px] w-full h-full">
      {/* 좌측: 스피커 (채점 후 단어 텍스트 공개) */}
      <div className="flex flex-col gap-[10px]">
        {leftWords.map((word, index) => {
          const isResolved = matchedWordIds.has(word.id) || failedWordIds.has(word.id);
          const isAnimating = animatingWordIds.has(word.id);
          const showText = isResolved || !!wordResolvedStates[word.id];
          const isSpeaking = speakingWordId === word.id;
          return (
            /*
              【카드 크기는 채점 전후 절대 변하지 않는다 — 2026-09-26 실기기 피드백】
              예전엔 상태 바가 뜨는 순간에만 pt/pb 를 늘려(단어가 바에 가리지 않게) 카드 내용
              높이가 커졌고, flex-1 의 min-height:auto 때문에 카드가 세로로 늘어나 오른쪽 뜻 카드·
              아래 카드와 어긋났다. 지금은 우측 상단 시점 문구(24px)·하단 상태 바(50px) 자리를
              **처음부터** 비워 두고(단어는 늘 그 사이 가운데), min-h-0 으로 내용이 카드를 밀지
              못하게 한다. 상태 바·시점 문구는 absolute 오버레이라 높이에 관여하지 않는다.
              테두리도 1px 을 늘 깔아 둔다(평소엔 투명) — 선택·정오답 깜빡임에서만 border-[1px] 이
              붙던 시절엔 그 순간 카드가 2px 커졌다(flex-basis 0 이어도 border-box 최소치는 테두리 포함).
            */
            <motion.button
              key={word.id}
              className={`
                relative overflow-hidden
                flex flex-col items-center justify-center
                flex-1 min-h-0 rounded-[12px] border-[1px] px-[10px] pt-[24px] pb-[50px]
                bg-layout-gray-50 dark:bg-layout-gray-dark
                transition-[color,background-color,border-color] duration-150
                ${getLeftCardStyle(index)}
              `}
              onClick={() => handleLeftClick(index)}
              disabled={isResolved || isAnimating}
              whileTap={!isResolved && !isAnimating ? { scale: 0.95 } : {}}
              onTapStart={!isResolved && !isAnimating ? () => haptic('light') : undefined}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            >
              {/* 우측 상단 - 매칭 전: 최근 학습 시점 / 매칭 후: 다음 복습 예정일(오답은 비움).
                  카드 매칭은 단어 카드(왼쪽 열)가 곧 이 단어의 "문제 카드"라 각 단어 카드의
                  우측 상단에 둔다 — 같은 카드 하단의 좁은 상태 바와 한 쌍으로 읽힌다.
                  뜻 카드(오른쪽 열)는 섞여 있어 단어와 짝이 아직 안 맞으므로 두지 않는다. */}
              <StudyTimingTag
                compact
                answered={!!farmByWordId?.[word.id]}
                fsrs={word.fsrs}
                stage={word.farmStage}
                farm={farmByWordId?.[word.id] ?? null}
              />
              

              {showText ? (
                <FitText
                  text={word.origin}
                  maxSize={20}
                  minSize={12}
                  className={`font-[800] w-full text-center ${getLeftTextStyle(index)}`}
                />
              ) : (
                <div className="relative flex items-center justify-center">
                  {isSpeaking && <TtsRipple size={62} duration={speakingDuration} />}
                  <motion.div
                    animate={isSpeaking ? { scale: [1, 1.12, 1] } : { scale: 1 }}
                    transition={isSpeaking ? { duration: 0.6, repeat: Infinity, ease: "easeInOut" } : {}}
                  >
                    <SpeakerHigh
                      size={32}
                      weight="fill"
                      className={`${getLeftIconStyle(index)} transition-colors duration-150`}
                    />
                  </motion.div>
                </div>
              )}

              {/* 하단 - 채점 후: 농장 상태 바 좁은 형 — 유형 공통(FarmResultBar compact) */}
              <FarmResultBar
                compact
                farm={farmByWordId?.[word.id] ?? null}
                replayKey={`${word.id}-${resumeReplayKey}`}
                onAnimStart={() => handleFarmStart(word.id)}
                onSettled={() => handleFarmSettled(word.id)}
              />

              {/* 하단 중앙 - 복습 예정일 (채점 후)
                  농장 상태 바가 같은 자리에서 다음 복습일까지 말하므로 그때는 숨긴다 */}
              
            </motion.button>
          );
        })}
      </div>

      {/* 우측: 의미 */}
      <div className="flex flex-col gap-[10px]">
        {rightWords.map((word, index) => {
          const isMatchResolved = matchedWordIds.has(word.id);
          const isFlashingWrong = wrongFlashRightWordIds.has(word.id);
          const displayMeanings = (word.meanings ?? []).slice(0, 2).join(', ');
          return (
            <motion.button
              key={word.id}
              className={`
                flex flex-col items-center justify-center
                flex-1 min-h-0 rounded-[12px] border-[1px] border-layout-gray-200 p-[10px]
                transition-colors duration-150
                ${getRightStyle(index)}
              `}
              onClick={() => handleRightClick(index)}
              disabled={isMatchResolved || isFlashingWrong}
              whileTap={!isMatchResolved && !isFlashingWrong ? { scale: 0.95 } : {}}
              onTapStart={!isMatchResolved && !isFlashingWrong ? () => haptic('light') : undefined}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            >
              <span className={`text-[14px] font-[600] ${getRightTextStyle(index)} text-center leading-snug break-keep`}>
                {displayMeanings}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default CardMatchListeningQuestion;
