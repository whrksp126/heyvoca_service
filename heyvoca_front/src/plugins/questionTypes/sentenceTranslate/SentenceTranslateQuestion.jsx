import { useState, useRef, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { SpeakerHigh } from '@phosphor-icons/react';
import TtsRipple from '../../../components/common/TtsRipple';
import { feel } from '../../../lib/feel';
import { getTextSound, stripHtmlTags } from '../../../utils/common';
import { useStudyAdvanceGate } from '../../../hooks/useStudyAdvanceGate';
import { getMemoryStateKeyByStability } from '../../../components/common/MemoryStateChangeBadge';
import { useResumeReplayKey } from '../../../hooks/useResumeReplayKey';
import { wordLang } from '../../../utils/lang';
import ArrangeTray from '../sentenceArrange/ArrangeTray';

/*
  문장 뜻 맞추기(sentenceTranslate) — 계약: heyvoca_service/docs/LEVEL_AND_MEANING_CONTRACT.md §3.

  - 위 카드: 외국어 예문(목표 단어 강조) + 스피커. 등장 시 1회 자동 재생(lang en/ja).
  - 아래: 문장 만들기와 같은 ArrangeTray — 한국어 블록을 눌러 답 줄에 나열, 놓은 블록을 누르면 되돌린다.
  - 채점: 고른 블록 text 배열이 accepted 중 하나와 같으면 정답(문장부호·공백 무시).
    accepted 는 서버가 '성분 묶음'(관형어+명사, 명사+동안 등) 단위로 서술어 앞 순서를 바꾼 경우를
    모두 담아 보낸다(QA 3차) — 어순 판정 규칙은 서버 한 곳(sentence_meaning.py)에만 둔다.
    긴 번역은 앞부분이 prefix 로 미리 채워져 오고, accepted 는 나머지 부분만 담는다.
    틀리면 트레이 아래에 정답 문장(translation)을 보여 준다.
*/

// 비교용 정규화 — 공백·문장부호 제거(계약 §3 채점 규칙).
const norm = (t) => String(t ?? '').replace(/[\s\p{P}\p{S}]+/gu, '').toLowerCase();

const isAccepted = (tokens, accepted) => accepted.some((acc) =>
  Array.isArray(acc) && acc.length === tokens.length && acc.every((t, i) => norm(t) === norm(tokens[i])));

// sentence_html 의 <b>/<strong> 강조만 살려 조각으로 나눈다.
const splitEmphasis = (html, plain) => {
  if (!html) return [{ text: plain, hl: false }];
  return String(html)
    .split(/(<(?:b|strong)\b[^>]*>[\s\S]*?<\/(?:b|strong)>)/i)
    .filter(Boolean)
    // stripHtmlTags 는 앞뒤 공백을 trim 해서 강조 경계의 띄어쓰기가 사라진다("Bananasare") — 공백은 살린다.
    .map((part) => {
      const lead = /^\s/.test(part) ? ' ' : '';
      const trail = /\s$/.test(part) ? ' ' : '';
      return { text: `${lead}${stripHtmlTags(part)}${trail}`, hl: /^<(?:b|strong)\b/i.test(part) };
    });
};

const SentenceTranslateQuestion = ({ question, onComplete, onCardMatched, farmByWordId }) => {
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(null);
  const [isPerfect, setIsPerfect] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakDuration, setSpeakDuration] = useState(null);

  const startTimeRef = useRef(Date.now());
  const resumeReplayKey = useResumeReplayKey();
  const reducedMotion = useReducedMotion();
  const advanceGate = useStudyAdvanceGate();
  const nextRef = useRef(null);
  const speakGenRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; });

  const prevStateKeyRef = useRef(
    getMemoryStateKeyByStability(question.fsrs?.stability ?? 0, question.fsrs?.state ?? null)
  );

  const meaning = question.meaning ?? {};
  const { sentence = '', sentence_html: sentenceHtml = '', tiles = [], accepted = [], translation = '' } = meaning;
  // 9어절 이상 번역은 서버가 앞부분을 미리 채워 보낸다(prefix) — 맞출 조각·accepted 는 그 뒷부분만.
  const prefix = meaning.prefix ?? '';
  const lang = meaning.lang ?? wordLang(question);
  const bank = tiles.map((t) => t?.text ?? '');
  // 트레이의 칩 색(맞음/틀림) 비교는 원문 그대로 하므로 accepted 를 블록 표기에 맞춰 둔다.
  const trayAccepted = accepted.map((acc) => (Array.isArray(acc)
    ? acc.map((tok) => bank.find((b) => norm(b) === norm(tok)) ?? tok)
    : acc));

  const farm = isAnswered ? (farmByWordId?.[question.id] ?? null) : null;

  const speak = async () => {
    const text = stripHtmlTags(sentence);
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

  useEffect(() => {
    speak();
    return () => { speakGenRef.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (userTokens) => {
    if (isAnswered) return;
    const correct = isAccepted(userTokens, accepted);
    const timeTakenMs = Date.now() - startTimeRef.current;
    const perfect = correct && !question.isRetry;
    feel(perfect ? 'perfect' : (correct ? 'correct' : 'wrong'));
    setIsPerfect(perfect);

    // 실수 유형 — 정답에 없는 블록을 골랐으면 방해 조각, 아니면 어순.
    let errorType = null;
    if (!correct) {
      const answerSet = new Set(accepted.flat().map(norm));
      errorType = userTokens.some((t) => !answerSet.has(norm(t))) ? 'distractor' : 'order';
    }

    question.isCorrect = correct;
    question.prevMemoryStateKey = question.prevMemoryStateKey ?? prevStateKeyRef.current;
    question.nextMemoryStateKey = getMemoryStateKeyByStability(correct ? 3.13 : 0.5, 'learning');

    setIsCorrect(correct);
    setIsAnswered(true);

    const result = {
      sheetId: question.vocabularySheetId,
      wordId: question.id,
      isCorrect: correct,
      timeTakenMs,
      errorType,
      updateData: { fsrs: question.fsrs, isCorrect: correct, updatedAt: new Date().toISOString() },
    };
    const processedNow = typeof onCardMatched === 'function';
    if (processedNow) onCardMatched(result);
    nextRef.current = () => onCompleteRef.current?.([result], { processed: processedNow });
  };

  const handleNext = () => {
    feel('tap');
    nextRef.current?.();
  };

  const postAnswerNode = isCorrect === false && translation ? (
    <div className="w-full mt-[16px] pt-[14px] border-t-[1px] border-layout-gray-200 dark:border-[#3A3A3A]">
      <span className="block mb-[2px] text-[11px] font-[700] leading-[1.7] text-layout-gray-300">정답</span>
      <p className="text-[15px] leading-[1.7] text-layout-gray-400 dark:text-layout-gray-100 break-keep">{translation}</p>
    </div>
  ) : null;

  return (
    <div className="flex flex-col gap-[15px] h-full">
      {/* 위 카드 — 외국어 예문. 스피커를 누르면 다시 읽는다. */}
      <motion.div
        className="relative overflow-hidden w-full px-[20px] py-[18px] rounded-[12px] text-left bg-primary-main-50 dark:bg-primary-main-dark"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="relative z-[1] flex items-start gap-[12px]">
          <motion.button
            type="button"
            aria-label="문장 듣기"
            whileTap={{ scale: 0.9 }}
            transition={{ duration: 0.15 }}
            className="relative flex-shrink-0 mt-[3px]"
            onClick={() => { feel('tap'); speak(); }}
          >
            {isSpeaking && (
              <TtsRipple
                size={90}
                duration={speakDuration}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[0] pointer-events-none"
              />
            )}
            <motion.span
              className={`relative z-[1] block transition-colors duration-200 ${isSpeaking ? 'text-primary-main-600' : 'text-layout-gray-300'}`}
              animate={isSpeaking && !reducedMotion ? { scale: [1, 1.12, 1] } : { scale: 1 }}
              transition={isSpeaking && !reducedMotion ? { duration: 0.6, repeat: Infinity, ease: 'easeInOut' } : {}}
            >
              <SpeakerHigh size={22} weight="fill" />
            </motion.span>
          </motion.button>
          <p className="text-[19px] font-[600] leading-[1.6] text-layout-black dark:text-layout-white break-keep">
            {splitEmphasis(sentenceHtml, stripHtmlTags(sentence)).map((p, i) => (
              <span key={i} className={p.hl ? 'text-primary-main-600 dark:text-primary-main-400' : ''}>{p.text}</span>
            ))}
          </p>
        </div>
      </motion.div>

      <ArrangeTray
        bank={bank}
        prefix={prefix}
        suffix=""
        accepted={trayAccepted}
        answerLang="ko"
        answerText={translation}
        postAnswerNode={postAnswerNode}
        isAnswered={isAnswered}
        isCorrect={isCorrect}
        perfect={isPerfect}
        question={question}
        farm={farm}
        resumeReplayKey={resumeReplayKey}
        advanceGate={advanceGate}
        onSubmit={handleSubmit}
        onNext={handleNext}
        lookupChips={false}
      />
    </div>
  );
};

export default SentenceTranslateQuestion;
