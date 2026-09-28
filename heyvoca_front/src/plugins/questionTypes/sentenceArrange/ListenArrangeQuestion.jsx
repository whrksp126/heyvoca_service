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
import { stripTags, isAcceptedOrder } from './arrangeUtils';
import ArrangeTray from './ArrangeTray';

/*
  듣고 받아쓰기(listenArrange) — 계약: SENTENCE_QUESTIONS_CONTRACT.md 3-1절.
  원문 어순만 정답(accepted는 항상 원소 1개) — sentenceArrange류와 채점 로직은 같고
  accepted 배열이 서버에서부터 1개로 강제돼 있을 뿐이라 isAcceptedOrder 그대로 재사용한다.

  위 = 좌우 카드 2장(각각이 곧 탭 영역, 안에 버튼을 두지 않는다):
    왼쪽(primary 틴트)  = 보통 속도 재생
    오른쪽(회색, 포인트 컬러 없음) = 0.7배속 재생, 스피커 오른쪽 아래에 작게 "0.7"
  등장 시 보통 속도로 1회 자동 재생. 안내 문구 없음.
  아래 = ArrangeTray, 채점 후 정오답과 무관하게 한국어 해석을 보여준다(원문은 이미 들었다).
*/
const ListenArrangeQuestion = ({ question, onComplete, onCardMatched, farmByWordId }) => {
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakDuration, setSpeakDuration] = useState(null);
  const [speakingTarget, setSpeakingTarget] = useState(null); // 'normal' | 'slow' | null

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
  const plainAnswer = stripTags(answerText);

  const farm = isAnswered ? (farmByWordId?.[question.id] ?? null) : null;

  // gate 를 붙잡는 재생만(target='gate' — 등장 자동재생 + 카드 탭) 'answer' 취급, 나머지는 없음.
  const speak = async (text, lang, target, rate = 1) => {
    if (!text) return;
    const gen = ++speakGenRef.current;
    if (wordTtsActiveRef.current) {
      wordTtsActiveRef.current = false;
      advanceGate.ttsEnd();
    }
    setIsSpeaking(true);
    setSpeakDuration(null);
    setSpeakingTarget(target);
    wordTtsActiveRef.current = true;
    advanceGate.ttsBegin();
    try {
      await getTextSound(text, lang, (d) => { if (gen === speakGenRef.current) setSpeakDuration(d); }, rate);
    } finally {
      if (gen === speakGenRef.current) {
        setIsSpeaking(false);
        wordTtsActiveRef.current = false;
        advanceGate.ttsEnd();
      }
    }
  };

  // 문제 등장 시 보통 속도로 1회 자동 재생.
  useEffect(() => {
    if (plainAnswer) speak(plainAnswer, answerLang, 'normal', 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    speakGenRef.current += 1;
  }, []);

  const handlePlayNormal = () => {
    haptic('light');
    speak(plainAnswer, answerLang, 'normal', 1);
  };
  const handlePlaySlow = () => {
    haptic('light');
    speak(plainAnswer, answerLang, 'slow', 0.7);
  };

  const handleSubmit = (userTokens) => {
    if (isAnswered) return;
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

    advanceGate.arm({
      minDelayMs: getAdvanceDelay(correct),
      onAdvance: () => onCompleteRef.current?.([result], { processed: processedNow }),
    });
  };

  // 채점 후: 정오답과 무관하게 한국어 해석 공개(원문은 이미 오디오로 들었다 — 문장 만들기와
  // 다르게 "정답 문장"을 다시 텍스트로 보여줄 필요가 적다는 판단, 목업 규칙 그대로).
  const postAnswerNode = (
    <p className="w-full mt-[16px] pt-[14px] border-t-[1px] border-layout-gray-200 dark:border-[#3A3A3A] text-[15px] leading-[1.7] text-layout-gray-400 dark:text-layout-gray-100 break-keep">
      <span className="block mb-[2px] text-[11px] font-[700] text-layout-gray-300">해석</span>
      {stripHtmlTags(ko)}
    </p>
  );

  const speakingNormal = isSpeaking && speakingTarget === 'normal';
  const speakingSlow = isSpeaking && speakingTarget === 'slow';

  return (
    <div className="flex flex-col gap-[15px] h-full">
      {/* 위 — 좌우 카드 2장, 각 카드 자체가 탭 영역 */}
      <div className="grid grid-cols-2 gap-[10px]">
        <motion.button
          type="button"
          aria-label="보통 속도로 듣기"
          onClick={handlePlayNormal}
          whileTap={{ scale: 0.96 }}
          transition={{ duration: 0.15 }}
          className="
            flex items-center justify-center
            h-[92px] rounded-[12px]
            bg-primary-main-50 dark:bg-primary-main-dark
          "
        >
          <span className="relative inline-flex">
            {speakingNormal && (
              <TtsRipple
                size={90}
                duration={speakDuration}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[0] pointer-events-none"
              />
            )}
            <motion.span
              className={`relative z-[1] ${speakingNormal ? 'text-primary-main-600' : 'text-layout-gray-300'}`}
              animate={speakingNormal && !reducedMotion ? { scale: [1, 1.12, 1] } : { scale: 1 }}
              transition={speakingNormal && !reducedMotion ? { duration: 0.6, repeat: Infinity, ease: 'easeInOut' } : {}}
            >
              <SpeakerHigh size={40} weight="fill" />
            </motion.span>
          </span>
        </motion.button>

        <motion.button
          type="button"
          aria-label="0.7배속으로 듣기"
          onClick={handlePlaySlow}
          whileTap={{ scale: 0.96 }}
          transition={{ duration: 0.15 }}
          className="
            flex items-center justify-center
            h-[92px] rounded-[12px]
            bg-layout-gray-50 dark:bg-layout-gray-dark
          "
        >
          <span className="relative inline-flex">
            {speakingSlow && (
              <TtsRipple
                size={90}
                duration={speakDuration}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[0] pointer-events-none"
              />
            )}
            <motion.span
              className={`relative z-[1] inline-flex ${speakingSlow ? 'text-layout-black dark:text-layout-white' : 'text-layout-gray-300'}`}
              animate={speakingSlow && !reducedMotion ? { scale: [1, 1.12, 1] } : { scale: 1 }}
              transition={speakingSlow && !reducedMotion ? { duration: 0.6, repeat: Infinity, ease: 'easeInOut' } : {}}
            >
              <SpeakerHigh size={40} weight="fill" />
              <span className="absolute -bottom-[2px] -right-[10px] text-[11px] font-[800] leading-none">0.7</span>
            </motion.span>
          </span>
        </motion.button>
      </div>

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

export default ListenArrangeQuestion;
