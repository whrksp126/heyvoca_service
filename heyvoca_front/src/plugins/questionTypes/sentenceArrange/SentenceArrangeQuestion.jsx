import { useState, useRef, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { SpeakerHigh } from '@phosphor-icons/react';
import TtsRipple from '../../../components/common/TtsRipple';
import { haptic } from '../../../lib/feel';
import { playSuccessSound, playErrorSound } from '../../../utils/audio';
import { getTextSound, stripHtmlTags } from '../../../utils/common';
import { getAdvanceDelay } from '../../../utils/studyTiming';
import { useStudyAdvanceGate } from '../../../hooks/useStudyAdvanceGate';
import { getMemoryStateKeyByStability } from '../../../components/common/MemoryStateChangeBadge';
import { useResumeReplayKey } from '../../../hooks/useResumeReplayKey';
import { wordLang } from '../../../utils/lang';
import { stripTags, isAcceptedOrder, renderHighlightedText, tokenizeWords, wrongRefWords } from './arrangeUtils';
import ArrangeTray from './ArrangeTray';

/*
  문장 만들기(sentenceArrangePartial / sentenceArrange) — 계약: SENTENCE_QUESTIONS_CONTRACT.md 3-1절.

  화면 규격은 기존 빈칸 채우기(fillInTheBlank)와 최대한 같게 맞춘다.
  - 위 카드(primary 틴트, 스피커 아이콘): 한국어 해석(question.arrange.ko). 카드 전체 탭 = TTS.
    마운트 시 1회 자동 재생.
  - 아래 = ArrangeTray(트레이 카드 + 조각 은행 + 확인 버튼) — 두 유형(부분/전체 조립)이 페이로드
    모양이 완전히 같아 이 컴포넌트 하나로 함께 처리한다(questionType 문자열만 다르다).
*/
const SentenceArrangeQuestion = ({ question, onComplete, onCardMatched, farmByWordId }) => {
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakDuration, setSpeakDuration] = useState(null);
  const [speakingTarget, setSpeakingTarget] = useState(null); // 'shown' | 'answer' | null
  // 채점 직전 사용자가 배열한 조각 — "정답 문장"에서 틀린 위치의 정답 단어를 강조하는 데 쓴다.
  const [submittedTokens, setSubmittedTokens] = useState([]);

  const startTimeRef = useRef(Date.now());
  const resumeReplayKey = useResumeReplayKey();
  const reducedMotion = useReducedMotion();
  const advanceGate = useStudyAdvanceGate();
  const wordTtsActiveRef = useRef(false);
  const speakGenRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; });

  const prevStateKeyRef = useRef(
    getMemoryStateKeyByStability(question.fsrs?.stability ?? 0, question.fsrs?.state ?? null)
  );

  const arrange = question.arrange ?? {};
  const { bank = [], prefix = '', suffix = '', accepted = [], answer_text: answerText = '', ko = '' } = arrange;
  const answerLang = wordLang(question);

  const farm = isAnswered ? (farmByWordId?.[question.id] ?? null) : null;

  const speak = async (text, lang, target = null) => {
    if (!text) return;
    const gen = ++speakGenRef.current;
    if (wordTtsActiveRef.current) {
      wordTtsActiveRef.current = false;
      advanceGate.ttsEnd();
    }
    setIsSpeaking(true);
    setSpeakDuration(null);
    setSpeakingTarget(target);
    if (target === 'answer') {
      wordTtsActiveRef.current = true;
      advanceGate.ttsBegin();
    }
    try {
      await getTextSound(text, lang, (d) => { if (gen === speakGenRef.current) setSpeakDuration(d); });
    } finally {
      if (gen === speakGenRef.current) setIsSpeaking(false);
      if (target === 'answer' && gen === speakGenRef.current) {
        wordTtsActiveRef.current = false;
        advanceGate.ttsEnd();
      }
    }
  };

  const speakShown = () => speak(stripHtmlTags(ko), 'ko', 'shown');

  useEffect(() => {
    speakShown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    speakGenRef.current += 1;
  }, []);

  const handleCardClick = () => {
    haptic('light');
    speakShown();
  };

  const handleSubmit = (userTokens) => {
    if (isAnswered) return;
    setSubmittedTokens(userTokens);
    const correct = isAcceptedOrder(userTokens, accepted);
    const timeTakenMs = Date.now() - startTimeRef.current;

    if (correct) {
      haptic('success');
      playSuccessSound();
    } else {
      haptic('error');
      playErrorSound();
    }

    question.isCorrect = correct;

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

    // 채점 후 정답 문장 TTS(계약 3-1절 표시 규칙) — 정오답 무관하게 정답을 들려준다.
    const plainAnswer = stripTags(answerText);
    if (plainAnswer) speak(plainAnswer, answerLang, 'answer');

    advanceGate.arm({
      minDelayMs: getAdvanceDelay(correct),
      onAdvance: () => onCompleteRef.current?.([result], { processed: processedNow }),
    });
  };

  const showTtsRipple = isSpeaking && speakingTarget === 'shown';

  // 틀렸을 때만 정답 문장을 강조 표시(계약 3-1절 표시 규칙) — 맞았을 때는 사용자가 놓은
  // 조각이 이미 정답이므로 다시 보여줄 필요가 없다.
  // 오답 상세 피드백(2026-09-28) — 목표 단어 강조(hl)와 별개로, 사용자가 놓은 조각 중
  // 틀린 위치의 정답 단어를 빨강으로 한 번 더 강조한다(듀오링고식). 단어 단위 매칭이라
  // 문장에 같은 단어가 두 번 나오면 전부 강조될 수 있음 — 조립 구간이 보통 짧아 실사용상
  // 드문 경우로 판단해 단순 구현을 택했다.
  const wrongWords = isCorrect === false ? wrongRefWords(submittedTokens, accepted) : new Set();
  const postAnswerNode = isCorrect === false ? (
    <p className="w-full mt-[16px] pt-[14px] border-t-[1px] border-layout-gray-200 dark:border-[#3A3A3A] text-[15px] leading-[1.7] text-layout-gray-400 dark:text-layout-gray-100 break-keep">
      <span className="block mb-[2px] text-[11px] font-[700] text-layout-gray-300">정답 문장</span>
      {(renderHighlightedText(answerText) ?? []).map((p) => (
        <span key={p.key}>
          {tokenizeWords(p.text).map((tok, i) => {
            const isWrong = tok.type === 'word' && wrongWords.has(tok.clean.toLowerCase());
            if (isWrong) {
              return (
                <span key={i} className="text-status-error-600 dark:text-status-error-400 font-[700] underline decoration-2 underline-offset-[3px]">
                  {tok.text}
                </span>
              );
            }
            return (
              <span key={i} className={p.hl ? 'text-primary-main-600 font-[700]' : undefined}>
                {tok.text}
              </span>
            );
          })}
        </span>
      ))}
    </p>
  ) : null;

  return (
    <div className="flex flex-col gap-[15px] h-full">
      {/* 위 카드 — 한국어 해석. 카드 전체 탭 = 읽기(TTS) */}
      <motion.button
        type="button"
        aria-label="해석 듣기"
        className="
          relative overflow-hidden
          w-full px-[20px] py-[18px]
          rounded-[12px] text-left
          bg-primary-main-50 dark:bg-primary-main-dark
        "
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        whileTap={{ scale: 0.96 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        style={{ willChange: 'transform, opacity' }}
        onClick={handleCardClick}
      >
        <div className="relative z-[1] flex items-start gap-[12px]">
          <span className="relative flex-shrink-0 mt-[3px]">
            {showTtsRipple && (
              <TtsRipple
                size={90}
                duration={speakDuration}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[0] pointer-events-none"
              />
            )}
            <motion.span
              className={`relative z-[1] transition-colors duration-200 ${showTtsRipple ? 'text-primary-main-600' : 'text-layout-gray-300'}`}
              animate={showTtsRipple && !reducedMotion ? { scale: [1, 1.12, 1] } : { scale: 1 }}
              transition={showTtsRipple && !reducedMotion ? { duration: 0.6, repeat: Infinity, ease: 'easeInOut' } : {}}
            >
              <SpeakerHigh size={22} weight="fill" />
            </motion.span>
          </span>
          <p className="text-[19px] font-[600] leading-[1.6] text-layout-black dark:text-layout-white break-keep">
            {stripHtmlTags(ko)}
          </p>
        </div>
      </motion.button>

      {/* 아래 — 트레이(회색 카드) + 조각 은행 + 확인 */}
      <ArrangeTray
        bank={bank}
        prefix={prefix}
        suffix={suffix}
        accepted={accepted}
        answerLang={answerLang}
        postAnswerNode={postAnswerNode}
        isAnswered={isAnswered}
        isCorrect={isCorrect}
        question={question}
        farm={farm}
        resumeReplayKey={resumeReplayKey}
        advanceGate={advanceGate}
        onSubmit={handleSubmit}
      />
    </div>
  );
};

export default SentenceArrangeQuestion;
