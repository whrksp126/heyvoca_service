import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Circle, X } from '@phosphor-icons/react';
import FarmStatusBar from '../../../components/farm/FarmStatusBar';
import TtsRipple from '../../../components/common/TtsRipple';
import { haptic, pickVariant } from '../../../lib/feel';
import { playSuccessSound, playErrorSound } from '../../../utils/audio';
import { getTextSound, stripHtmlTags } from '../../../utils/common';
import { getAdvanceDelay, ADVANCE_DELAY_GROW } from '../../../utils/studyTiming';
import { getMemoryStateKeyByStability } from '../../../components/common/MemoryStateChangeBadge';
import { useResumeReplayKey } from '../../../hooks/useResumeReplayKey';

/*
  빈칸 채우기 — 두 방향이 같은 화면을 쓴다.
  - fillInTheBlank(ko2en):        위 = 한국어 예문(강조), 아래 = 영어 예문의 빈칸 → 선택지는 영어 단어(기본형)
  - fillInTheBlankReverse(en2ko): 위 = 영어 예문(강조),  아래 = 한국어 예문의 빈칸 → 선택지는 뜻

  카드 모양·선택지·O/X·농장 상태 바는 사지선다(takeTest/Main.jsx)와 똑같이 맞춘다 — 유형이
  바뀔 때 화면 문법이 달라 보이지 않게. 카드 전체 탭 = 위 예문 읽기(TTS, 리플만, 아이콘 없음).
*/

const TARGET_WORD_RE = /<strong\b[^>]*\btarget-word\b[^>]*>([\s\S]*?)<\/strong\s*>/gi;
const stripTags = (html) => String(html ?? '').replace(/<[^>]*>/g, '');

// 강조 마커 부분만 primary 로 칠하고 나머지 태그는 벗겨 평문으로 그린다.
const renderHighlightedText = (html) => {
  if (!html) return null;
  const parts = [];
  let lastIndex = 0;
  let match;
  const re = new RegExp(TARGET_WORD_RE.source, 'gi');
  while ((match = re.exec(html)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={`t-${lastIndex}`}>{stripTags(html.slice(lastIndex, match.index))}</span>);
    }
    parts.push(
      <span key={`h-${match.index}`} className="text-primary-main-600 font-[700]">
        {stripTags(match[1])}
      </span>
    );
    lastIndex = re.lastIndex;
  }
  if (lastIndex < html.length) {
    parts.push(<span key={`t-${lastIndex}`}>{stripTags(html.slice(lastIndex))}</span>);
  }
  return parts;
};

// 빈칸 문장을 (앞 / 뒤) 평문으로 나눈다. 공백은 그대로 둔다(빈칸 pill 앞뒤 간격).
const splitAtBlank = (html) => {
  if (!html) return { before: '', after: '' };
  const re = new RegExp(TARGET_WORD_RE.source, 'i');
  const match = html.match(re);
  if (!match) return { before: stripTags(html), after: '' };
  return {
    before: stripTags(html.slice(0, match.index)),
    after: stripTags(html.slice(match.index + match[0].length)),
  };
};

// Main.jsx 는 testType 도 넘기지만 이 화면은 모드에 따라 달라지는 것이 없어 받지 않는다.
const FillInTheBlankQuestion = ({ question, onComplete, farmByWordId }) => {
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakDuration, setSpeakDuration] = useState(null);
  const startTimeRef = useRef(Date.now());
  // 백그라운드 복귀 시 정답 링/성장 게이지가 최종 상태로 정적으로 스냅되는 것을 막기 위한
  // 재마운트용 키 (이유는 useResumeReplayKey 주석 참고)
  const resumeReplayKey = useResumeReplayKey();
  const reducedMotion = useReducedMotion();

  const advanceTimerRef = useRef(null);
  const gradedAtRef = useRef(0);
  const advanceActionRef = useRef(null);
  // TTS 재생 세대 가드 — getTextSound 는 새 재생 시작 시 이전 재생을 강제 resolve 하므로
  // 연타 시 이전 재생의 finally 가 isSpeaking 을 false 로 덮지 않게 한다(Main.jsx 와 같은 방식).
  const speakGenRef = useRef(0);

  const scheduleAdvance = (totalMs) => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    const elapsed = Date.now() - gradedAtRef.current;
    advanceTimerRef.current = setTimeout(() => {
      advanceTimerRef.current = null;
      advanceActionRef.current?.();
    }, Math.max(0, totalMs - elapsed));
  };

  // 채점 전 현재 암기 상태 캡처 — 판정은 MemoryStateChangeBadge 의 공용 함수를 쓴다.
  const prevStateKeyRef = useRef(
    getMemoryStateKeyByStability(question.fsrs?.stability ?? 0, question.fsrs?.state ?? null)
  );

  const { shownText, blankText, blankFill, options = [], resultIndex } = question;
  const direction = question.direction ?? (question.questionType === 'fillInTheBlankReverse' ? 'en2ko' : 'ko2en');
  // 위 예문 언어 — ko2en 은 한국어 예문을 보여 주고, en2ko 는 영어 예문을 보여 준다.
  const shownLang = direction === 'ko2en' ? 'ko' : 'en';
  const { before, after } = splitAtBlank(blankText);

  // 농장 상태 바 — 카드 맞추기와 같은 경로(Main.processCardWord → cardFarmByWordId[wordId]).
  // 채점 전에는 절대 띄우지 않는다(문제 전환 직후 이전 문제 값이 한 프레임 남아 있을 수 있음).
  const farm = isAnswered ? (farmByWordId?.[question.id] ?? null) : null;

  const speakShown = async () => {
    const text = stripHtmlTags(shownText);
    if (!text) return;
    const gen = ++speakGenRef.current;
    setIsSpeaking(true);
    setSpeakDuration(null);
    try {
      await getTextSound(text, shownLang, (d) => { if (gen === speakGenRef.current) setSpeakDuration(d); });
    } finally {
      if (gen === speakGenRef.current) {
        setIsSpeaking(false);
        setSpeakDuration(null);
      }
    }
  };

  const handleCardClick = () => {
    haptic('light');
    speakShown();
  };

  const handleOptionClick = (index) => {
    if (isAnswered) return;
    setSelectedIndex(index);

    const correct = index === resultIndex;
    const timeTakenMs = Date.now() - startTimeRef.current;

    if (correct) {
      haptic('success');
      playSuccessSound();
    } else {
      haptic('error');
      playErrorSound();
    }

    // FSRS 업데이트는 백엔드 /study/log 에서 처리(Main.processCardWord)
    question.isCorrect = correct;
    question.userResultIndex = index;

    // 결과 화면 '암기 상태 변화' 리스트용 낙관값 — 백엔드 응답 도착 시 확정값으로 덮임
    {
      const optimisticStability = correct ? 3.13 : 0.5;
      question.prevMemoryStateKey = question.prevMemoryStateKey ?? prevStateKeyRef.current;
      question.nextMemoryStateKey = getMemoryStateKeyByStability(optimisticStability, 'learning');
    }

    setIsCorrect(correct);
    setIsAnswered(true);

    // 오답일 때는 더 천천히 다음 문제로 전환 (정답 1초 / 오답 2.5초).
    // 단계가 오른 정답은 아래 useEffect 가 2.2초로 다시 건다 — 진화 연출이 1초라 여기서 넘기면 잘린다.
    gradedAtRef.current = Date.now();
    advanceActionRef.current = () => onComplete([{
      sheetId: question.vocabularySheetId,
      wordId: question.id,
      isCorrect: correct,
      timeTakenMs,
      updateData: { fsrs: question.fsrs, isCorrect: correct, updatedAt: new Date().toISOString() },
    }]);
    scheduleAdvance(getAdvanceDelay(correct));
  };

  /*
    전환 타이머 — 단계가 올랐으면 2.2초로 다시 건다.
    grew 는 /study/log 응답과 함께 farmByWordId 로 들어오는데, 그때는 이미 1초짜리
    타이머가 돌고 있다. 채점 시각 기준 절대 시간으로 다시 걸어, 응답이 늦게 왔더라도
    전체 지연이 2.2초가 되게 한다. 이미 넘어간 문제의 뒤늦은 응답은 대기 타이머가 없어 무시된다.
  */
  useEffect(() => {
    if (!farm?.grew) return;
    if (!advanceTimerRef.current) return;
    scheduleAdvance(ADVANCE_DELAY_GROW);
  }, [farm]);

  useEffect(() => () => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    speakGenRef.current += 1; // 언마운트 뒤 늦게 끝나는 재생이 상태를 건드리지 않게
  }, []);

  return (
    <div className="flex flex-col gap-[15px] h-full">
      {/* 카드 — 사지선다 카드와 같은 모양. 카드 전체 탭 = 위 예문 읽기 */}
      <motion.div
        className="
          relative
          flex flex-col flex-1
          w-full
          rounded-[12px]
          bg-layout-gray-50 dark:bg-layout-gray-dark
          overflow-hidden
          cursor-pointer
        "
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        whileTap={{ scale: 0.96 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        style={{ willChange: 'transform, opacity' }}
        onClick={handleCardClick}
      >
        {/* 읽는 동안 카드 중앙에서 퍼지는 파동 — 아이콘 없이 리플만 */}
        {isSpeaking && (
          <TtsRipple size={160} duration={speakDuration} className="z-[0]" />
        )}

        <div className="relative z-[1] flex flex-col flex-1 px-[20px] pt-[20px] pb-[60px]">
          {/* 위: 보여 주는 예문(강조 표시 유지) */}
          <p className="text-[20px] font-[600] leading-[1.6] text-layout-gray-500 dark:text-layout-gray-200 break-keep">
            {renderHighlightedText(shownText)}
          </p>

          <div className="h-[1px] mt-[16px] bg-layout-gray-100 dark:bg-[#333333]" />

          {/* 아래: 빈칸 예문 — pill 은 채점 전후 모두 중립색, 채점 후 활용형이 들어간다 */}
          <div className="flex items-center flex-1">
            <p className="text-[22px] font-[700] leading-[1.8] text-layout-black dark:text-layout-white break-keep">
              {before}
              <span
                className="
                  inline-flex items-center justify-center align-middle
                  min-w-[84px] h-[34px] px-[14px]
                  rounded-[8px] border-[1px] border-layout-gray-200 dark:border-[#444444]
                  bg-layout-white dark:bg-layout-black
                  text-[17px] font-[700] text-layout-black dark:text-layout-white
                "
              >
                {isAnswered ? blankFill : ''}
              </span>
              {after}
            </p>
          </div>
        </div>

        {/* O/X — 카드 중앙 */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[3] pointer-events-none">
          <AnimatePresence>
            {isCorrect === true && (
              <motion.div
                key={`correct-${resumeReplayKey}`}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 600, damping: 25, duration: 0.3 }}
                style={{ willChange: 'transform, opacity' }}
              >
                <Circle size={150} weight="bold" className="text-status-success-500" />
              </motion.div>
            )}
            {isCorrect === false && (
              <motion.div
                key={`wrong-${resumeReplayKey}`}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 600, damping: 25, duration: 0.3 }}
                style={{ willChange: 'transform, opacity' }}
              >
                <X size={150} weight="bold" className="text-status-error-500" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 하단 - 채점 후: 농장 상태 바 (작물·성장 막대·다음 복습일) */}
        {farm && (
          <motion.div
            key={`farmbar-${resumeReplayKey}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="absolute bottom-[14px] left-[14px] right-[14px] z-[2]"
            onClick={(e) => e.stopPropagation()}
          >
            <FarmStatusBar
              crop={farm.crop}
              stage={farm.stage}
              crop_from={farm.crop_from}
              stage_from={farm.stage_from}
              grew={!!farm.grew}
              pct_from={farm.pct_from}
              pct_to={farm.pct_to}
              health={farm.health}
              days_to_review={farm.days_to_review}
              wasCorrect={farm.wasCorrect}
              pending={!!farm.pending}
              sameDayElapsedHours={farm.sameDayElapsedHours ?? null}
            />
          </motion.div>
        )}
      </motion.div>

      {/* 선택지 4개 — 사지선다 버튼과 동일 */}
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
              whileTap={{ scale: 0.92, transition: { type: 'spring', stiffness: 400, damping: 17 } }}
              // 오답으로 확정되는 순간에만 흔들린다 — 매 렌더 재생되지 않도록 animate 값 자체를 조건부로 둔다.
              animate={isWrongSelected ? pickVariant('shake', reducedMotion).animate : undefined}
              onClick={() => {
                haptic('light');
                handleOptionClick(index);
              }}
              disabled={isAnswered}
              style={{ willChange: 'transform' }}
              className={`
                relative
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
              {option}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default FillInTheBlankQuestion;
