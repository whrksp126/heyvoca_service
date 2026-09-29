// src/components/newfullsheet/ScriptSessionNewFullSheet.jsx
//
// 글자 밭 — 학습/복습/'이미 알아요' 확인 세션. TakeTest 헤더·진행바·문제 카드·사지선다·
// ResultMark·하단 전폭 CTA 규격을 그대로 따르되, 재출제·콤보·FSRS 같은 정식 학습 로직은
// 없다(기획서: "TakeTest에 억지로 끼우지 않아도 됨"). ScriptFieldNewFullSheet 위에 push되고,
// 뒤로가기는 popNewFullSheet 하나로 끝난다 — window.onBackPressed를 직접 건드리지 않아도
// utils/osFunction.jsx의 전역 핸들러가 newFullSheet 스택을 먼저 확인해 꺼 주므로,
// 예전 페이지 라우트 버전에서 있었던 "세션 중 하드웨어 뒤로가기 → 앱 종료" 문제가 없다.
//
// props: { script, chars:[item,...], pool:[item,...], mode:'learn'|'review'|'skip', rowLabel,
//          onComplete } — onComplete은 세션이 끝나고 ScriptFieldNewFullSheet로 돌아갈 때
//          진행도를 다시 받아오라는 신호(pop은 이 컴포넌트가 한다).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CaretLeft } from '@phosphor-icons/react';
import { vibrate, showToast } from '../../utils/osFunction';
import { stopCurrentSound } from '../../utils/common';
import { haptic } from '../../lib/feel';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import IntroCard from '../script/IntroCard';
import ChoiceCard from '../script/ChoiceCard';
import TraceCard from '../script/TraceCard';
import ScriptCompleteScreen from '../script/ScriptCompleteScreen';
import { buildLearnSteps, buildReviewSteps, buildSkipCheckSteps, summarizeResults } from '../../utils/scriptSession';
import { logScriptResultsApi, skipScriptCharsApi } from '../../api/script';
import { prefetchScriptSession } from '../../utils/scriptData';

const TITLE_BY_MODE = {
  learn: (rowLabel) => `${rowLabel || ''} 배우기`.trim(),
  review: () => '복습하기',
  skip: () => '이미 알아요 확인',
};

const ADVANCE_DELAY_MS = 850;
const SKIP_PASS_RATIO = 0.8;

const ScriptSessionNewFullSheet = ({ script, chars = [], pool = [], mode = 'learn', rowLabel = '', onComplete }) => {
  "use memo";

  const { popNewFullSheet } = useNewFullSheetActions();

  const steps = useMemo(() => {
    if (!script || chars.length === 0) return [];
    const optionPool = pool.length > 0 ? pool : chars;
    if (mode === 'review') return buildReviewSteps(script, chars, optionPool);
    if (mode === 'skip') return buildSkipCheckSteps(script, chars, optionPool);
    return buildLearnSteps(script, chars, optionPool);
  }, [script, chars, pool, mode]);

  const [stepIndex, setStepIndex] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [collectedAnswers, setCollectedAnswers] = useState([]);
  const [finished, setFinished] = useState(false);
  const advanceTimerRef = useRef(null);

  useEffect(() => {
    if (steps.length === 0) popNewFullSheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps.length]);

  // 세션 시작 시 이 줄 글자들의 음성(글자 자체 + 예시 단어)을 미리 받아 둔다 —
  // 첫 탭에서도 끊김 없이 재생되게(안정성). 실패해도 조용히 무시(getTextSound가 이미
  // 캐시 미스에 관대하다).
  useEffect(() => {
    if (script && chars.length > 0) prefetchScriptSession(script, chars);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    stopCurrentSound();
  }, []);

  const currentStep = steps[stepIndex];

  const goNext = (record) => {
    setCollectedAnswers((prev) => (record ? [...prev, record] : prev));
    setAnswered(false);
    setSelectedIndex(null);
    if (stepIndex + 1 >= steps.length) {
      setFinished(true);
      return;
    }
    setStepIndex((i) => i + 1);
  };

  const handleSelect = (index) => {
    if (answered) return;
    const correct = index === currentStep.answerIndex;
    setSelectedIndex(index);
    setAnswered(true);
    haptic(correct ? 'success' : 'error');
    const record = { ...currentStep, correct };
    advanceTimerRef.current = setTimeout(() => goNext(record), ADVANCE_DELAY_MS);
  };

  const handleTraceDone = () => goNext(null);
  const handleIntroNext = () => goNext(null);

  // 세션 종료 처리 — mode별로 서버에 알리는 방식이 다르다.
  useEffect(() => {
    if (!finished) return;
    let cancelled = false;

    const finalize = async () => {
      if (mode === 'skip') {
        const total = collectedAnswers.length;
        const correct = collectedAnswers.filter((a) => a.correct).length;
        const passed = total > 0 && correct / total >= SKIP_PASS_RATIO;
        if (passed) {
          await skipScriptCharsApi(script, chars.map((c) => c.char));
          if (!cancelled) {
            showToast('이 줄은 이미 알고 있는 걸로 표시했어요');
            onComplete?.();
            popNewFullSheet();
          }
        } else if (!cancelled) {
          showToast('조금 더 연습해봐요');
          popNewFullSheet();
        }
        return;
      }

      const results = summarizeResults(collectedAnswers);
      if (results.length > 0) {
        await logScriptResultsApi(script, results);
      }
    };

    finalize();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  const handleBack = () => {
    vibrate({ duration: 5 });
    popNewFullSheet();
  };

  if (!script || chars.length === 0) return null;

  if (finished && mode !== 'skip') {
    const results = summarizeResults(collectedAnswers);
    return (
      <div className="flex flex-col h-full w-full bg-layout-white dark:bg-layout-black">
        <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
        <ScriptCompleteScreen
          results={results}
          onFinish={() => { onComplete?.(); popNewFullSheet(); }}
        />
      </div>
    );
  }

  if (finished) return null; // skip 모드는 위 이펙트가 바로 pop한다

  if (!currentStep) return null;

  const progressPercent = Math.round((stepIndex / steps.length) * 100);

  return (
    <div className="flex flex-col h-full w-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      <div
        data-page-header
        className="relative flex items-end justify-center w-full h-[55px] px-[16px] py-[14px] bg-layout-white dark:bg-layout-black flex-shrink-0"
      >
        <div className="absolute left-[10px] bottom-[13px] flex items-center justify-center">
          <button
            type="button"
            onClick={handleBack}
            className="text-layout-gray-200 dark:text-layout-white rounded-[8px]"
          >
            <CaretLeft size={24} />
          </button>
        </div>
        <div className="px-[44px]">
          <h2 className="text-[18px] font-[700] leading-[21px] text-center text-layout-black dark:text-layout-white">
            {TITLE_BY_MODE[mode]?.(rowLabel) || '글자 밭'}
          </h2>
        </div>
      </div>

      {/* 콘텐츠 영역 — TakeTest Main.jsx와 같은 규격(진행바 h-16 + flex-1 카드 영역)으로
          채워서 화면이 위로 몰리지 않고 아래까지 꽉 차게 한다. */}
      <div className="flex flex-col flex-1 min-h-0 px-[16px] pt-[14px] pb-[20px]">
        <div className="relative w-full h-[16px] mb-[15px] rounded-[50px] bg-primary-main-100 dark:bg-layout-gray-dark overflow-hidden flex-shrink-0">
          <motion.div
            className="h-full rounded-[50px] bg-primary-main-600"
            initial={{ width: '0%' }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          />
          <span className="absolute right-[10px] top-[50%] translate-y-[-50%] text-[#7b7b7b] text-[10px] font-semibold tracking-[-0.2px]">
            {stepIndex}/{steps.length}
          </span>
        </div>

        <div className="relative flex-1 min-h-0 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep.id}
              className="absolute inset-0 flex flex-col"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }}
            >
              {currentStep.type === 'intro' && (
                <IntroCard step={currentStep} onNext={handleIntroNext} />
              )}
              {(currentStep.type === 'seePick' || currentStep.type === 'listenPick') && (
                <ChoiceCard
                  step={currentStep}
                  answered={answered}
                  selectedIndex={selectedIndex}
                  onSelect={handleSelect}
                />
              )}
              {currentStep.type === 'trace' && (
                <TraceCard step={currentStep} onDone={handleTraceDone} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default ScriptSessionNewFullSheet;
