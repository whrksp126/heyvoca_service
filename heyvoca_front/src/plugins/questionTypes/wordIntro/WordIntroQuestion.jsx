import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import WordMeetCard from '../../../components/study/WordMeetCard';
import { getTextSound, stopCurrentSound, prefetchTtsList } from '../../../utils/common';
import { wordLang } from '../../../utils/lang';
import { stripTags } from '../highlightMarker';
import { feel } from '../../../lib/feel';

/*
  ① "만나기" 슬라이드(wordIntro) — 새 씨앗 심기(plant) 세션 전용, 채점 없음(2026-09-29).

  StudyMain(집중 반복 듣기)의 카드 렌더링(WordMeetCard)을 그대로 재사용하고, 이 컴포넌트는
  자기 자신의 재생 상태만 관리한다 — 설정 시트(반복/순서 변경)나 이전/다음 카드 이동은 없다
  (그 단어 하나만 보여주고 끝나면 "다음"으로 넘어간다). 재생 순서: 단어 → 뜻 → (예문마다)
  예문 원문 → 예문 뜻. 1회만 재생하고 반복하지 않는다.

  Main.jsx는 이 유형(questionType==='wordIntro')일 때 onComplete를 별도 핸들러
  (handleWordIntroNext)로 바꿔 넘긴다 — 정오답 채점·재출제·통과 카운트를 전혀 타지 않는다.
*/

const MIN_LINE_DWELL_MS = 650;

const meaningText = (item) => {
  if (item && typeof item === 'object') return item.meaning ?? item.text ?? '';
  return item ?? '';
};

const WORD_TO_MEANING_GAP_MS = 300;
const RETRY_DELAY_MS = 250;
// 카드 소유권 — takeTest/Main 은 AnimatePresence(popLayout)로 이전 카드를 exit 애니메이션이 끝날
// 때까지(~250ms) 마운트해 둔다. 그래서 새 카드가 재생을 시작한 뒤에야 이전 카드의 effect cleanup 이
// 돌고, 거기서 stopCurrentSound() 를 부르면 새 카드의 단어 재생을 끊는다(실기기 계측으로 확인).
// 가장 최근에 시퀀스를 시작한 카드만 cleanup 에서 소리를 끊을 수 있게 한다.
let latestIntroOwner = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 이 카드가 읽을 (텍스트, 언어) 목록 — 재생 순서와 같다. 프리로드(prefetchTtsList)용.
// 세션 시작 제스처(usePlantSession)·직전 카드(takeTest/Main)에서도 불러 첫 재생의
// fetch+decode 지연을 없앤다.
export const wordIntroSoundItems = (question, { withExamples = true } = {}) => {
  if (!question) return [];
  const lang = wordLang(question);
  const items = [];
  if (question.origin) items.push({ text: question.origin, language: lang });
  (question.meanings || []).forEach((m) => {
    const t = meaningText(m);
    if (t) items.push({ text: t, language: 'ko' });
  });
  if (withExamples) {
    (question.examples || []).forEach((ex) => {
      const o = stripTags(ex?.origin || ex?.sentence || '');
      const m = stripTags(ex?.meaning || ex?.translation || '');
      if (o) items.push({ text: o, language: lang });
      if (m) items.push({ text: m, language: 'ko' });
    });
  }
  return items;
};

const WordIntroQuestion = ({ question, onComplete }) => {
  "use memo";

  const reducedMotion = useReducedMotion();
  const [playingItemId, setPlayingItemId] = useState(null);
  const [playingItemIndex, setPlayingItemIndex] = useState(null);
  const [playDuration, setPlayDuration] = useState(null);

  // 자동 재생 취소 플래그 — 언마운트/개별 스피커 탭 시 true로 세워 시퀀스를 멈춘다.
  const cancelRef = useRef(false);
  const resolveRef = useRef(null);
  const runIdRef = useRef(0);

  const playOne = useCallback((itemId, index, text, lang) => {
    if (!text) return Promise.resolve(true);
    setPlayingItemId(itemId);
    setPlayingItemIndex(index);
    setPlayDuration(null);
    return new Promise((resolve) => {
      let settled = false;
      let started = false; // 실제 재생이 시작됐는지(onMeta 호출 = 디코드/메타 로드 성공)
      let audioDone = false;
      let minDone = false;
      let minTimer = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (minTimer) { clearTimeout(minTimer); minTimer = null; }
        if (resolveRef.current === forceSettle) resolveRef.current = null;
        resolve(started);
      };
      const forceSettle = () => finish();
      const maybeFinish = () => { if (audioDone && minDone) finish(); };
      resolveRef.current = forceSettle;
      minTimer = setTimeout(() => { minDone = true; maybeFinish(); }, MIN_LINE_DWELL_MS);
      Promise.resolve(getTextSound(text, lang, (d) => {
        started = true;
        if (!cancelRef.current) setPlayDuration(d);
      })).then(
        () => { audioDone = true; maybeFinish(); },
        () => { audioDone = true; maybeFinish(); },
      );
    });
  }, []);

  const stopSequence = useCallback(() => {
    cancelRef.current = true;
    if (resolveRef.current) { resolveRef.current(); resolveRef.current = null; }
    setPlayingItemId(null);
    setPlayingItemIndex(null);
    setPlayDuration(null);
  }, []);

  // 마운트 시 1회 자동 재생: 단어 → 뜻 → 예문1 원문 → 예문1 뜻 → 예문2 원문 → 예문2 뜻…
  useEffect(() => {
    cancelRef.current = false;
    const runId = ++runIdRef.current;
    const ownerId = ++latestIntroOwner;
    const cancelled = () => cancelRef.current || runIdRef.current !== runId;
    const meanings = question?.meanings || [];
    const examples = question?.examples || [];
    const lang = wordLang(question);

    // 이 카드의 모든 줄을 미리 받아 둔다(이미 받은 건 캐시·inflight 재사용) — 줄 사이 지연 제거.
    prefetchTtsList(wordIntroSoundItems(question), 4);

    // 한 줄 재생. 소리가 실제로 시작되지 않았으면(AudioContext 미깨움, 다른 호출에 선점 등) 한 번 재시도.
    const playLine = async (itemId, index, text, l) => {
      let ok = await playOne(itemId, index, text, l);
      if (!ok && !cancelled()) {
        await sleep(RETRY_DELAY_MS);
        if (cancelled()) return;
        await playOne(itemId, index, text, l);
      }
    };

    const run = async () => {
      if (cancelled()) return;
      await playLine('word', null, question?.origin || '', lang);
      for (let i = 0; i < meanings.length; i++) {
        if (cancelled()) return;
        if (i === 0) {
          await sleep(WORD_TO_MEANING_GAP_MS); // 단어 → (짧은 간격) → 뜻
          if (cancelled()) return;
        }
        await playLine('meanings', i, meaningText(meanings[i]), 'ko');
      }
      for (let i = 0; i < examples.length; i++) {
        if (cancelled()) return;
        const ex = examples[i] || {};
        const origin = stripTags(ex.origin || ex.sentence || '');
        if (origin) {
          if (cancelled()) return;
          await playLine('exampleSentences', i, origin, lang);
        }
        const meaning = stripTags(ex.meaning || ex.translation || '');
        if (meaning) {
          if (cancelled()) return;
          await playLine('exampleMeanings', i, meaning, 'ko');
        }
      }
      if (!cancelled()) {
        setPlayingItemId(null);
        setPlayingItemIndex(null);
        setPlayDuration(null);
      }
    };
    run();

    return () => {
      cancelRef.current = true;
      const lineInFlight = !!resolveRef.current; // 이 카드의 줄이 아직 재생 중이었나
      if (resolveRef.current) { resolveRef.current(); resolveRef.current = null; }
      // 이미 끝났거나(다음 카드가 자동 재생을 시작했을 수 있음) 더 새 카드가 시작했다면 끊지 않는다.
      if (lineInFlight && latestIntroOwner === ownerId) stopCurrentSound();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.id, question?.vocaIndexId]);

  // 개별 라인 스피커 탭 — 자동 재생 시퀀스를 멈추고 그 라인만 재생(StudyMain과 동일 규칙).
  const handleSpeakerClick = (itemId, index, text, lang) => {
    feel('tap');
    const isSameLine = playingItemId === itemId && playingItemIndex === index;
    stopSequence();
    stopCurrentSound();
    if (isSameLine) return; // 재생 중이던 라인을 다시 누르면 정지만 한다
    setPlayingItemId(itemId);
    setPlayingItemIndex(index);
    setPlayDuration(null);
    getTextSound(text, lang, (d) => setPlayDuration(d)).then(() => {
      setPlayingItemId((prev) => (prev === itemId ? null : prev));
      setPlayingItemIndex((prev) => (prev === index ? null : prev));
      setPlayDuration(null);
    });
  };

  const handleNext = () => {
    feel('tap');
    stopSequence();
    stopCurrentSound();
    onComplete();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-y-auto bg-layout-gray-50 dark:bg-layout-gray-dark rounded-[12px]">
        <WordMeetCard
          word={question}
          playingItemId={playingItemId}
          playingItemIndex={playingItemIndex}
          playDuration={playDuration}
          reducedMotion={reducedMotion}
          onSpeakerClick={handleSpeakerClick}
        />
      </div>
      <motion.button
        type="button"
        onClick={handleNext}
        className="mt-[14px] flex-shrink-0 h-[52px] rounded-[12px] text-[16px] font-[700] tracking-[-0.03em] bg-primary-main-600 text-layout-white"
        whileTap={{ scale: 0.97 }}
      >
        다음
      </motion.button>
    </div>
  );
};

export default WordIntroQuestion;
