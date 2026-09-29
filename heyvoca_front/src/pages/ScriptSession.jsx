// src/pages/ScriptSession.jsx
//
// 글자 밭 — 학습/복습/'이미 알아요' 확인 세션 경량 화면. TakeTest 헤더·진행바·ResultMark·
// 선택지 버튼 스타일을 따르되, 재출제·콤보·FSRS 같은 정식 학습 로직은 없다(기획서: "TakeTest에
// 억지로 끼우지 않아도 됨").
//
// location.state: { script, chars:[item,...], pool:[item,...], mode:'learn'|'review'|'skip', rowLabel }

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CaretLeft } from '@phosphor-icons/react';
import { vibrate, showToast } from '../utils/osFunction';
import { haptic } from '../lib/feel';
import IntroCard from '../components/script/IntroCard';
import ChoiceCard from '../components/script/ChoiceCard';
import TraceCard from '../components/script/TraceCard';
import ScriptCompleteScreen from '../components/script/ScriptCompleteScreen';
import { buildLearnSteps, buildReviewSteps, buildSkipCheckSteps, summarizeResults } from '../utils/scriptSession';
import { logScriptResultsApi, skipScriptCharsApi } from '../api/script';

const TITLE_BY_MODE = {
  learn: (rowLabel) => `${rowLabel || ''} 배우기`.trim(),
  review: () => '복습하기',
  skip: () => '이미 알아요 확인',
};

const ADVANCE_DELAY_MS = 850;
const SKIP_PASS_RATIO = 0.8;

const ScriptSession = () => {
  "use memo";

  const { state } = useLocation();
  const navigate = useNavigate();

  const { script, chars = [], pool = [], mode = 'learn', rowLabel = '' } = state || {};

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
    if (steps.length === 0) {
      navigate('/script', { replace: true });
    }
  }, [steps.length, navigate]);

  useEffect(() => {
    const prevHandler = window.onBackPressed;
    window.onBackPressed = () => navigate(-1);
    return () => { window.onBackPressed = prevHandler; };
  }, [navigate]);

  useEffect(() => () => { if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current); }, []);

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
            navigate('/script', { replace: true, state: { refresh: true } });
          }
        } else if (!cancelled) {
          showToast('조금 더 연습해봐요');
          navigate('/script', { replace: true });
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
    navigate(-1);
  };

  if (!script || chars.length === 0) return null;

  if (finished && mode !== 'skip') {
    const results = summarizeResults(collectedAnswers);
    return (
      <div className="flex flex-col h-screen bg-layout-white dark:bg-layout-black">
        <ScriptCompleteScreen
          results={results}
          onFinish={() => navigate('/script', { replace: true, state: { refresh: true } })}
        />
      </div>
    );
  }

  if (finished) return null; // skip 모드는 위 이펙트가 바로 이동시킨다

  if (!currentStep) return null;

  const progressPercent = Math.round((stepIndex / steps.length) * 100);

  return (
    <div className="flex flex-col h-screen bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      <div
        data-page-header
        className="relative flex items-end justify-center w-full h-[55px] px-[16px] py-[14px] bg-layout-white dark:bg-layout-black"
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

      <div className="w-full px-[16px] pt-[5px]">
        <div className="relative w-full h-[8px] rounded-full bg-primary-main-100 dark:bg-layout-gray-dark overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-primary-main-600"
            initial={{ width: '0%' }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-[20px] pt-[18px] pb-[24px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep.id}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.2 }}
          >
            {currentStep.type === 'intro' && (
              <>
                <IntroCard step={currentStep} />
                <div className="flex justify-center mt-[22px]">
                  <button
                    type="button"
                    onClick={handleIntroNext}
                    className="h-[44px] px-[26px] rounded-full bg-primary-main-600 text-layout-white text-[14px] font-[700]"
                  >
                    다음
                  </button>
                </div>
              </>
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
  );
};

export default ScriptSession;
