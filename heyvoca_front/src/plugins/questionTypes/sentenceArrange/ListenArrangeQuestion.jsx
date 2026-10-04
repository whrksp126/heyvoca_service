import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { SpeakerHigh } from '@phosphor-icons/react';
import TtsRipple from '../../../components/common/TtsRipple';
import { feel } from '../../../lib/feel';
import { getTextSound, stripHtmlTags } from '../../../utils/common';
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
  const [isPerfect, setIsPerfect] = useState(false); // 한 번에 맞힘 → '완벽해요'
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakDuration, setSpeakDuration] = useState(null);
  const [speakingTarget, setSpeakingTarget] = useState(null); // 'normal' | 'slow' | null

  const startTimeRef = useRef(Date.now());
  const resumeReplayKey = useResumeReplayKey();
  const advanceGate = useStudyAdvanceGate();
  const wordTtsActiveRef = useRef(false);
  // 문장 재생(보통 속도 'normal' / 0.7배속 단어별 'slow') 중인지 — 조각을 슬롯에 놓을 때
  // (onPiecePlaced) 이 값이 true면 단어 TTS를 재생하지도, 문장 재생을 끊지도 않는다
  // (2026-09-29 추가 요청). getTextSound가 끝나는 시점(정상 종료)에 false, 다른 speak() 호출에
  // 가로채이거나(중단) 언마운트되어도 false로 되돌아간다. 조각 단어 TTS 자체(target=null)는
  // 이 ref를 true로 만들지 않는다.
  const isSentencePlayingRef = useRef(false);
  const speakGenRef = useRef(0);
  const wordGapTimeoutRef = useRef(null);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; });
  // 채점 후 "다음" 버튼을 누를 때 진행할 콜백(2026-09-29) — SentenceArrangeQuestion과 동일 규칙,
  // 출력형 문제는 자동으로 안 넘어가고 사용자가 직접 눌러야 진행한다.
  const nextRef = useRef(null);

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
    if (wordGapTimeoutRef.current) {
      clearTimeout(wordGapTimeoutRef.current);
      wordGapTimeoutRef.current = null;
    }
    if (wordTtsActiveRef.current) {
      wordTtsActiveRef.current = false;
      advanceGate.ttsEnd();
    }
    setIsSpeaking(true);
    setSpeakDuration(null);
    setSpeakingTarget(target);
    wordTtsActiveRef.current = true;
    advanceGate.ttsBegin();
    const isSentence = target === 'normal' || target === 'slow';
    if (isSentence) isSentencePlayingRef.current = true;
    try {
      await getTextSound(text, lang, (d) => { if (gen === speakGenRef.current) setSpeakDuration(d); }, rate);
    } finally {
      if (gen === speakGenRef.current) {
        setIsSpeaking(false);
        wordTtsActiveRef.current = false;
        advanceGate.ttsEnd();
      }
      if (isSentence && gen === speakGenRef.current) isSentencePlayingRef.current = false;
    }
  };

  // 0.7배속 = 문장을 단어 단위로 끊어 한 단어씩 재생 → WORD_GAP_MS 간격 → 다음 단어.
  // speak()와 같은 gen 카운터를 공유해서(speakGenRef) 다른 재생이 끼어들면 즉시 멈춘다.
  const WORD_GAP_MS = 70;
  const speakWordsSlowly = async (text, lang, target, rate) => {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return;
    const gen = ++speakGenRef.current;
    if (wordGapTimeoutRef.current) {
      clearTimeout(wordGapTimeoutRef.current);
      wordGapTimeoutRef.current = null;
    }
    if (wordTtsActiveRef.current) {
      wordTtsActiveRef.current = false;
      advanceGate.ttsEnd();
    }
    setIsSpeaking(true);
    setSpeakDuration(null);
    setSpeakingTarget(target);
    wordTtsActiveRef.current = true;
    advanceGate.ttsBegin();
    const isSentence = target === 'normal' || target === 'slow';
    if (isSentence) isSentencePlayingRef.current = true;
    try {
      for (let i = 0; i < words.length; i += 1) {
        if (gen !== speakGenRef.current) return;
        // eslint-disable-next-line no-await-in-loop
        await getTextSound(words[i], lang, (d) => { if (gen === speakGenRef.current) setSpeakDuration(d); }, rate);
        if (gen !== speakGenRef.current) return;
        if (i < words.length - 1) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => {
            wordGapTimeoutRef.current = setTimeout(() => {
              wordGapTimeoutRef.current = null;
              resolve();
            }, WORD_GAP_MS);
          });
        }
      }
    } finally {
      if (gen === speakGenRef.current) {
        setIsSpeaking(false);
        wordTtsActiveRef.current = false;
        advanceGate.ttsEnd();
      }
      if (isSentence && gen === speakGenRef.current) isSentencePlayingRef.current = false;
    }
  };

  // 문제 등장 시 보통 속도로 1회 자동 재생.
  useEffect(() => {
    if (plainAnswer) speak(plainAnswer, answerLang, 'normal', 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    speakGenRef.current += 1;
    if (wordGapTimeoutRef.current) {
      clearTimeout(wordGapTimeoutRef.current);
      wordGapTimeoutRef.current = null;
    }
    isSentencePlayingRef.current = false;
  }, []);

  const handlePlayNormal = () => {
    feel('tap');
    speak(plainAnswer, answerLang, 'normal', 1);
  };
  const handlePlaySlow = () => {
    feel('tap');
    speakWordsSlowly(plainAnswer, answerLang, 'slow', 0.7);
  };

  const handleSubmit = (userTokens) => {
    if (isAnswered) return;
    const correct = isAcceptedOrder(userTokens, accepted);
    const timeTakenMs = Date.now() - startTimeRef.current;

    // 소리·진동·시각(아래 setState)을 같은 틱에. 재출제(isRetry)가 아닌 첫 시도 정답이면 perfect.
    const perfect = correct && !question.isRetry;
    feel(perfect ? 'perfect' : (correct ? 'correct' : 'wrong'));
    setIsPerfect(perfect);

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

    // 자동으로 넘어가지 않는다(2026-09-29) — 결과를 보여준 채로 대기하다가 사용자가 "다음"을
    // 눌러야 진행한다. onCardMatched는 이미 채점 즉시 처리했다(로그 전송·재출제 타이밍 동일).
    nextRef.current = () => onCompleteRef.current?.([result], { processed: processedNow });
  };

  const handleNext = () => {
    feel('tap');
    nextRef.current?.();
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
                loop
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[0] pointer-events-none"
              />
            )}
            <span className={`relative z-[1] ${speakingNormal ? 'text-primary-main-600' : 'text-layout-gray-300'}`}>
              <SpeakerHigh size={40} weight="fill" />
            </span>
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
                loop
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[0] pointer-events-none"
              />
            )}
            <span className={`relative z-[1] inline-flex ${speakingSlow ? 'text-layout-black dark:text-layout-white' : 'text-layout-gray-300'}`}>
              <SpeakerHigh size={40} weight="fill" />
              <span className="absolute -bottom-[2px] -right-[10px] text-[11px] font-[800] leading-none">0.7</span>
            </span>
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
        answerText={answerText}
        postAnswerNode={postAnswerNode}
        isAnswered={isAnswered}
        isCorrect={isCorrect}
        perfect={isPerfect}
        question={question}
        farm={farm}
        resumeReplayKey={resumeReplayKey}
        advanceGate={advanceGate}
        onSubmit={handleSubmit}
        onPiecePlaced={(word) => {
          // 문장 재생(보통/0.7배속) 중이면 단어 TTS를 건너뛴다 — 문장 재생을 끊지도 않는다.
          // 재생 중이 아닐 때만 방금 놓은 조각을 읽는다.
          if (isSentencePlayingRef.current) return;
          speak(word, answerLang, null, 1);
        }}
        onNext={handleNext}
      />
    </div>
  );
};

export default ListenArrangeQuestion;
