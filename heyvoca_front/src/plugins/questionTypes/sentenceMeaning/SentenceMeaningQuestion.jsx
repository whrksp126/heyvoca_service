import { useState, useRef, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { SpeakerHigh } from '@phosphor-icons/react';
import { FarmResultBar } from '../../../components/farm/FarmStatusBar';
import StudyTimingTag from '../../../components/farm/StudyTimingTag';
import TtsRipple from '../../../components/common/TtsRipple';
import LiftAboveBar from '../../../components/common/LiftAboveBar';
import ResultMark from '../../../components/common/ResultMark';
import FuriganaText from '../../../components/common/FuriganaText';
import { feel, pickVariant, ShineSweep } from '../../../lib/feel';
import { getTextSound } from '../../../utils/common';
import { getAdvanceDelay } from '../../../utils/studyTiming';
import { useStudyAdvanceGate } from '../../../hooks/useStudyAdvanceGate';
import { getMemoryStateKeyByStability } from '../../../components/common/MemoryStateChangeBadge';
import { useResumeReplayKey } from '../../../hooks/useResumeReplayKey';
import { wordLang, isJa } from '../../../utils/lang';
import { renderHighlightedText, stripTags } from '../highlightMarker';

/*
  문장 뜻 고르기(sentenceMeaning, 독해) — 2026-10-24 QA #15.
  위 카드 = 예문 원문(목표 단어 강조), 아래 = 그 예문의 한국어 뜻 4개(오답은 같은 학습 풀의 다른
  예문 뜻 — plugins/questionTypes/index.js buildSentenceMeaningQuestions).
  화면 문법(카드 · O/X · 농장 상태 바 · 선택지)은 빈칸 채우기(FillInTheBlankQuestion)와 같다.
  원문은 스피커를 눌러야 읽는다 — 독해 문제라 등장 시 자동으로 읽지 않는다(autoSpeakOnShow:false).
  채점 즉시 onCardMatched 로 로그·농장 payload·재출제를 처리하고, 넘어가기는 공용 전환 게이트를 따른다
  (새 씨앗 심기에서는 게이트가 '다음' 버튼 대기로 바뀐다).
*/
const SentenceMeaningQuestion = ({ question, onComplete, onCardMatched, farmByWordId }) => {
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakDuration, setSpeakDuration] = useState(null);
  const startTimeRef = useRef(Date.now());
  const resumeReplayKey = useResumeReplayKey();
  const reducedMotion = useReducedMotion();
  const advanceGate = useStudyAdvanceGate();
  const speakGenRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; });

  const prevStateKeyRef = useRef(
    getMemoryStateKeyByStability(question.fsrs?.stability ?? 0, question.fsrs?.state ?? null)
  );

  const { sentenceText = '', sentenceReadingTokens, options = [], resultIndex } = question;
  const lang = wordLang(question);
  const ja = isJa(lang);
  const farm = isAnswered ? (farmByWordId?.[question.id] ?? null) : null;

  // 원문 읽기 — 전환을 붙잡지 않는다(빈칸 채우기의 'shown' 재생과 같다).
  const speakSentence = async () => {
    const text = stripTags(sentenceText).trim();
    if (!text) return;
    const gen = ++speakGenRef.current;
    setIsSpeaking(true);
    setSpeakDuration(null);
    try {
      await getTextSound(text, lang, (d) => { if (gen === speakGenRef.current) setSpeakDuration(d); });
    } finally {
      if (gen === speakGenRef.current) setIsSpeaking(false);
    }
  };

  useEffect(() => () => { speakGenRef.current += 1; }, []);

  const handleOptionClick = (index) => {
    if (isAnswered) return;
    setSelectedIndex(index);
    const correct = index === resultIndex;
    const timeTakenMs = Date.now() - startTimeRef.current;
    feel(correct ? 'correct' : 'wrong');

    question.isCorrect = correct;
    question.userResultIndex = index;
    {
      const optimisticStability = correct ? 3.13 : 0.5;
      question.prevMemoryStateKey = question.prevMemoryStateKey ?? prevStateKeyRef.current;
      question.nextMemoryStateKey = getMemoryStateKeyByStability(optimisticStability, 'learning');
    }
    setIsCorrect(correct);
    setIsAnswered(true);

    const result = {
      sheetId: question.vocabularySheetId,
      wordId: question.id,
      isCorrect: correct,
      timeTakenMs,
      updateData: { fsrs: question.fsrs, isCorrect: correct, updatedAt: new Date().toISOString() },
    };
    const processedNow = typeof onCardMatched === 'function';
    if (processedNow) onCardMatched(result);

    advanceGate.arm({
      minDelayMs: getAdvanceDelay(correct),
      onAdvance: () => onCompleteRef.current?.([result], { processed: processedNow }),
    });
  };

  const highlighted = renderHighlightedText(sentenceText);

  return (
    <div className="flex flex-col gap-[15px] h-full">
      <motion.div
        data-lift-card=""
        className="
          relative flex flex-col flex-1 min-h-0 w-full
          rounded-[12px] text-left
          bg-layout-gray-50 dark:bg-layout-gray-dark
          overflow-hidden select-none
        "
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        style={{ willChange: 'transform, opacity' }}
      >
        <StudyTimingTag
          answered={isAnswered}
          fsrs={question.fsrs}
          stage={question.farmStage}
          farm={farm}
          wasCorrect={isCorrect}
          isRetry={!!question.isRetry}
        />
        <div className="relative z-[1] flex items-center flex-1 min-h-0 px-[20px] py-[45px]">
          <LiftAboveBar active={!!farm} topReserve={28} className="w-full">
            <div className="flex items-start gap-[12px] w-full">
              <motion.button
                type="button"
                aria-label="문장 듣기"
                whileTap={{ scale: 0.9 }}
                transition={{ duration: 0.15 }}
                className="relative flex-shrink-0 mt-[6px]"
                onClick={() => { feel('tap'); speakSentence(); }}
              >
                {isSpeaking && (
                  <TtsRipple
                    size={90}
                    duration={speakDuration}
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[0] pointer-events-none"
                  />
                )}
                <motion.span
                  className={`relative z-[1] transition-colors duration-200 ${isSpeaking ? 'text-primary-main-600' : 'text-layout-gray-300'}`}
                  animate={isSpeaking && !reducedMotion ? { scale: [1, 1.12, 1] } : { scale: 1 }}
                  transition={isSpeaking && !reducedMotion ? { duration: 0.6, repeat: Infinity, ease: 'easeInOut' } : {}}
                >
                  <SpeakerHigh size={22} weight="fill" />
                </motion.span>
              </motion.button>
              {ja ? (
                <FuriganaText
                  as="p"
                  html={sentenceText}
                  readingTokens={sentenceReadingTokens}
                  lang="ja"
                  className="flex-1 text-[22px] font-[700] leading-[1.8] text-layout-black dark:text-layout-white break-normal"
                />
              ) : (
                <p className="flex-1 text-[22px] font-[700] leading-[1.6] text-layout-black dark:text-layout-white break-keep">
                  {(highlighted ?? [{ key: 0, text: stripTags(sentenceText) }]).map((p) => (
                    <span key={p.key} className={p.hl ? 'text-primary-main-600' : undefined}>{p.text}</span>
                  ))}
                </p>
              )}
            </div>
          </LiftAboveBar>
        </div>

        <ResultMark
          result={isCorrect}
          replayKey={resumeReplayKey}
          className="absolute inset-0 z-[3] flex items-center justify-center"
        />
        <FarmResultBar
          farm={farm}
          replayKey={resumeReplayKey}
          onAnimStart={advanceGate.farmStarted}
          onSettled={advanceGate.farmSettled}
        />
      </motion.div>

      {/* 선택지 4개 — 문장 뜻은 길어서 두 줄까지 보이게 높이를 내용에 맞춘다(최소 50px). */}
      <div className="flex flex-col gap-[10px]">
        {options.map((option, index) => {
          let btnStyle = 'border-layout-gray-200 text-layout-black dark:text-layout-white';
          const isWrongSelected = isCorrect === false && selectedIndex === index;
          if (isCorrect !== null && resultIndex === index) {
            btnStyle = 'border-status-success-500 text-status-success-600 bg-status-success-100';
          } else if (isWrongSelected) {
            btnStyle = 'border-status-error-500 text-status-error-600 bg-status-error-100 dark:bg-status-error-dark';
          }
          return (
            <motion.button
              key={index}
              whileTap={{ scale: 0.95, transition: { type: 'spring', stiffness: 400, damping: 17 } }}
              animate={isWrongSelected
                ? pickVariant('shake', reducedMotion).animate
                : (isCorrect === true && selectedIndex === index ? pickVariant('correctPop', reducedMotion).animate : undefined)}
              onClick={() => handleOptionClick(index)}
              disabled={isAnswered}
              style={{ willChange: 'transform' }}
              className={`
                relative flex items-center justify-center
                w-full min-h-[50px] px-[16px] py-[8px]
                border-[1px] rounded-[10px]
                text-[14px] font-[600] leading-[1.4] text-center
                overflow-hidden break-keep
                transition-colors duration-150
                ${btnStyle}
              `}
            >
              <ShineSweep play={isCorrect === true && selectedIndex === index} />
              <span className="[display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical] overflow-hidden">
                {option}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default SentenceMeaningQuestion;
