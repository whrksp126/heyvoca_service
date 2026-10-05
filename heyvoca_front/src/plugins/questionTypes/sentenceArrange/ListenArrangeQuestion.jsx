import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { SpeakerHigh } from '@phosphor-icons/react';
import TtsSpeedPlayer from '../../../components/common/TtsSpeedPlayer';
import TtsRipple from '../../../components/common/TtsRipple';
import { feel } from '../../../lib/feel';
import { getTextSound, stopCurrentSound, prefetchTextSound, stripHtmlTags } from '../../../utils/common';
import { useStudyAdvanceGate } from '../../../hooks/useStudyAdvanceGate';
import { getMemoryStateKeyByStability } from '../../../components/common/MemoryStateChangeBadge';
import { useResumeReplayKey } from '../../../hooks/useResumeReplayKey';
import { wordLang } from '../../../utils/lang';
import { stripTags, isAcceptedOrder } from './arrangeUtils';
import ArrangeTray from './ArrangeTray';
import { loadSlowWords, playSlowWords, stopSlowWords } from './slowWordPlayback';

/*
  듣고 받아쓰기(listenArrange) — 계약: SENTENCE_QUESTIONS_CONTRACT.md 3-1절.
  원문 어순만 정답(accepted는 항상 원소 1개) — sentenceArrange류와 채점 로직은 같고
  accepted 배열이 서버에서부터 1개로 강제돼 있을 뿐이라 isAcceptedOrder 그대로 재사용한다.

  위 = 한 박스 [스피커 | 0.7 스피커](TtsSpeedPlayer) — 각 스피커 아이콘만 탭 영역:
    왼쪽 = 보통 속도 재생, 오른쪽 = 0.7배속(문장 전체) 재생
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
  // 문장 재생(보통 속도 'normal' / 0.7배속 'slow') 중인지 — 조각을 슬롯에 놓을 때
  // (onPiecePlaced) 이 값이 true면 단어 TTS를 재생하지도, 문장 재생을 끊지도 않는다
  // (2026-09-29 추가 요청). getTextSound가 끝나는 시점(정상 종료)에 false, 다른 speak() 호출에
  // 가로채이거나(중단) 언마운트되어도 false로 되돌아간다. 조각 단어 TTS 자체(target=null)는
  // 이 ref를 true로 만들지 않는다.
  const isSentencePlayingRef = useRef(false);
  const speakGenRef = useRef(0);
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
  const speak = async (text, lang, target, rate = 1, customPlay = null) => {
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
    const isSentence = target === 'normal' || target === 'slow';
    if (isSentence) isSentencePlayingRef.current = true;
    try {
      if (customPlay) {
        // Web Audio 로 직접 재생(느린 단어별 재생) — 진행 중인 <audio> 재생을 먼저 끊는다.
        stopCurrentSound();
        await customPlay();
      } else {
        await getTextSound(text, lang, (d) => { if (gen === speakGenRef.current) setSpeakDuration(d); }, rate);
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

  // 느린 재생용 단어별 버퍼 — 마운트 직후 일반 속도 문장 음성을 받은 뒤 백그라운드로 미리 받아 둔다.
  // 준비 전이면 0.7 버튼은 문장 전체 0.7배속 재생으로 폴백한다.
  const slowWordsRef = useRef(null);
  useEffect(() => {
    let cancelled = false;
    if (plainAnswer && answerLang === 'en') {
      prefetchTextSound(plainAnswer, answerLang)
        .catch(() => null)
        .then(() => loadSlowWords(plainAnswer, answerLang, () => cancelled))
        .then((loaded) => { if (!cancelled) slowWordsRef.current = loaded; })
        .catch(() => { /* 폴백 사용 */ });
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    speakGenRef.current += 1;
    isSentencePlayingRef.current = false;
    stopSlowWords();
  }, []);

  const handlePlayNormal = () => {
    feel('tap');
    speak(plainAnswer, answerLang, 'normal', 1);
  };
  const handlePlaySlow = () => {
    feel('tap');
    // 단어별 버퍼가 준비됐으면 앞뒤 무음을 자른 단어를 고정 간격으로 이어 재생, 아니면 문장 전체 0.7배속.
    const loaded = slowWordsRef.current;
    if (loaded) speak(plainAnswer, answerLang, 'slow', 0.7, () => playSlowWords(loaded));
    else speak(plainAnswer, answerLang, 'slow', 0.7);
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

  // 채점 후: 틀렸으면 실제 정답 문장(원문)을 해석 위에 보여 준다 — 문장 만들기(SentenceArrangeQuestion)의
  // '정답 문장' 블록과 같은 규격(왼쪽 스피커로 문장 전체 TTS). 정오답과 무관하게 한국어 해석은 항상 공개.
  const answerPlaying = isSpeaking && speakingTarget === 'answer';
  const postAnswerNode = (
    <div className="w-full mt-[16px]">
      {isCorrect === false && plainAnswer && (
        <div className="relative w-full pt-[14px] border-t-[1px] border-layout-gray-200 dark:border-[#3A3A3A]">
          <motion.button
            type="button"
            aria-label="정답 문장 듣기"
            whileTap={{ scale: 0.9 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-[14px] z-[1]"
            onClick={() => {
              feel('tap');
              speak(plainAnswer, answerLang, 'answer', 1);
            }}
          >
            {answerPlaying && (
              <TtsRipple
                size={70}
                duration={speakDuration}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[0] pointer-events-none"
              />
            )}
            <span className={`relative z-[1] block transition-colors duration-200 ${answerPlaying ? 'text-primary-main-600' : 'text-layout-gray-300'}`}>
              <SpeakerHigh size={22} weight="fill" />
            </span>
          </motion.button>
          <p className="w-full pr-[32px] text-[15px] leading-[1.7] text-layout-gray-400 dark:text-layout-gray-100 break-keep">
            <span className="block mb-[2px] text-[11px] font-[700] text-layout-gray-300">정답 문장</span>
            {plainAnswer}
          </p>
        </div>
      )}
      <p className={`w-full pt-[14px] ${isCorrect === false && plainAnswer ? '' : 'border-t-[1px] border-layout-gray-200 dark:border-[#3A3A3A]'} text-[15px] leading-[1.7] text-layout-gray-400 dark:text-layout-gray-100 break-keep`}>
        <span className="block mb-[2px] text-[11px] font-[700] text-layout-gray-300">해석</span>
        {stripHtmlTags(ko)}
      </p>
    </div>
  );

  const speakingNormal = isSpeaking && speakingTarget === 'normal';
  const speakingSlow = isSpeaking && speakingTarget === 'slow';

  return (
    <div className="flex flex-col gap-[15px] h-full">
      {/* 위 — 한 박스 안에 [스피커 | 0.7 스피커], 아이콘만 탭 영역 */}
      <TtsSpeedPlayer
        onPlayNormal={handlePlayNormal}
        onPlaySlow={handlePlaySlow}
        speakingNormal={speakingNormal}
        speakingSlow={speakingSlow}
      />

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
