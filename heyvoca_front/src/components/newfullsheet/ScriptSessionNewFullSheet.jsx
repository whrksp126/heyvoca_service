// src/components/newfullsheet/ScriptSessionNewFullSheet.jsx
//
// 글자(문자 학습) — 학습/복습/'이미 알아요' 확인 세션. TakeTest 헤더·진행바·문제 카드·사지선다·
// ResultMark·하단 전폭 CTA 규격을 그대로 따르되, 재출제·콤보·FSRS 같은 정식 학습 로직은
// 없다(기획서: "TakeTest에 억지로 끼우지 않아도 됨"). 학습장 "글자" 탭(components/script/
// ScriptFieldBody.jsx) 위에 push되고, 뒤로가기는 popNewFullSheet 하나로 끝난다 —
// window.onBackPressed를 직접 건드리지 않아도 utils/osFunction.jsx의 전역 핸들러가
// newFullSheet 스택을 먼저 확인해 꺼 주므로, 예전 페이지 라우트 버전에서 있었던
// "세션 중 하드웨어 뒤로가기 → 앱 종료" 문제가 없다.
//
// props: { script, chars:[item,...], pool:[item,...], mode:'learn'|'review'|'skip', rowLabel,
//          onComplete } — onComplete은 세션이 끝나고 "글자" 탭으로 돌아갈 때 진행도를
//          다시 받아오라는 신호(pop은 이 컴포넌트가 한다).

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
import { SLIDE_VARIANTS, SLIDE_TRANSITION, PROGRESS_FILL_TRANSITION } from '../../utils/studySlideMotion';

// 헤더 제목 — 슬라이드 종류별 안내 문구(2026-09-29 실기기 QA: "あ행 배우기"라는 고정
// 타이틀 대신, 지금 뭘 하는 화면인지 슬라이드마다 알려 달라는 피드백). 줄 완료 화면
// (ScriptCompleteScreen)은 이 헤더 자체를 쓰지 않으므로 여기 포함하지 않는다.
const STEP_TITLES = {
  intro: '글자를 익혀요',
  seePick: '알맞은 발음을 고르세요',
  listenPick: '소리를 듣고 글자를 고르세요',
  trace: '따라 써 보세요',
};

// 채점 후 정답 발음 재생이 끝난 뒤 다음 슬라이드로 넘어가기까지 두는 여유 시간.
// (2026-09-29 QA 4차: 예전엔 답을 고른 시점부터 고정 850ms 뒤 넘어갔는데, 정답 발음이
// 450ms 지연 후 재생을 시작해 850ms 안에 못 끝나는 경우가 많아 다음 슬라이드(특히
// 듣기 자동재생)의 소리와 겹쳤다. 지금은 ChoiceCard가 정답 발음 재생을 끝낸 뒤(Promise
// 완료 기준)를 기준으로 이 여유 시간만 더 기다린다 — 재생이 없는 스텝(만나기·따라 쓰기)은
// 그대로 자기 콜백에서 즉시 넘어간다.
const ADVANCE_AFTER_PLAYBACK_MS = 550;
// 재생 실패·네트워크 정체 등으로 ChoiceCard의 재생 완료 콜백이 영영 안 오는 경우를 대비한
// 상한 — 이 시간이 지나면 재생 여부와 무관하게 강제로 다음 슬라이드로 넘어간다.
const ADVANCE_SAFETY_CAP_MS = 3000;
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
  const advanceSafetyTimerRef = useRef(null);
  // 채점 후 다음으로 넘길 record — ChoiceCard의 재생 완료 콜백(또는 안전 상한 타이머)이
  // 이 값을 소비해 넘어간다. 한 번 소비되면 null로 비워 중복 advance를 막는다.
  const pendingRecordRef = useRef(null);

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
    if (advanceSafetyTimerRef.current) clearTimeout(advanceSafetyTimerRef.current);
    stopCurrentSound();
  }, []);

  const currentStep = steps[stepIndex];

  const goNext = (record) => {
    if (advanceTimerRef.current) { clearTimeout(advanceTimerRef.current); advanceTimerRef.current = null; }
    if (advanceSafetyTimerRef.current) { clearTimeout(advanceSafetyTimerRef.current); advanceSafetyTimerRef.current = null; }
    pendingRecordRef.current = null;
    // 슬라이드가 바뀌는 순간 재생 중인 소리는 끊는다 — 다음 스텝(특히 듣기 자동재생)의
    // 소리와 겹치지 않게(2026-09-29 QA 4차).
    stopCurrentSound();
    setCollectedAnswers((prev) => (record ? [...prev, record] : prev));
    if (stepIndex + 1 >= steps.length) {
      setFinished(true);
      return;
    }
    // TakeTest(Main.jsx)와 같은 방식 — 다음 스텝으로 넘어가는 그 순간에 answered/selectedIndex를
    // 같은 배치로 함께 초기화한다(따로 한 프레임 앞서 초기화하지 않는다).
    setStepIndex((i) => i + 1);
    setAnswered(false);
    setSelectedIndex(null);
  };

  const handleSelect = (index) => {
    if (answered) return;
    const correct = index === currentStep.answerIndex;
    setSelectedIndex(index);
    setAnswered(true);
    haptic(correct ? 'success' : 'error');
    const record = { ...currentStep, correct };
    pendingRecordRef.current = record;
    // 안전 상한 — ChoiceCard의 재생 완료 콜백(handleAnswerPlaybackSettled)이 어떤 이유로든
    // 안 오면 이 시간에 강제로 넘어간다.
    advanceSafetyTimerRef.current = setTimeout(() => {
      if (pendingRecordRef.current !== record) return;
      goNext(record);
    }, ADVANCE_SAFETY_CAP_MS);
  };

  // ChoiceCard가 채점 후 정답 발음 재생을 끝내면(성공/실패 무관) 호출된다 — 그때부터
  // ADVANCE_AFTER_PLAYBACK_MS만 더 기다렸다가 다음 슬라이드로 넘어간다.
  const handleAnswerPlaybackSettled = () => {
    const record = pendingRecordRef.current;
    if (!record) return; // 이미 안전 상한으로 넘어갔거나 중복 호출
    advanceTimerRef.current = setTimeout(() => {
      if (pendingRecordRef.current !== record) return;
      goNext(record);
    }, ADVANCE_AFTER_PLAYBACK_MS);
  };

  const handleTraceDone = () => goNext(null);
  const handleIntroNext = () => goNext(null);

  // 세션 종료 처리 — mode별로 서버에 알리는 방식이 다르다.
  //
  // 진행 반영 레이스(2026-09-29 QA 4차) — 줄 학습을 끝내고 글자 밭으로 돌아오면 방금
  // 학습한 글자가 바로 반영돼야 하는데, POST /script/log 가 아직 끝나기 전에 완료 화면의
  // "확인"을 눌러 onComplete(→ 글자 밭의 refreshKey 재조회)가 먼저 실행되는 레이스가 있었다
  // (skip 모드는 원래도 await 뒤에만 onComplete를 불러 안전했다 — 아래에서도 그 순서를 지킨다).
  // 지금은 로그 요청 Promise를 logPromiseRef에 들고 있다가, 완료 화면의 "확인"
  // (ScriptCompleteScreen onFinish)이 그 Promise를 반드시 기다린 뒤에만 onComplete를 부른다.
  // 게다가 /script/log·/script/skip 응답은 이번에 다룬 글자들의 갱신된 level을 그대로 담고
  // 있어(back app/routes/script.py _serialize), onComplete에 넘겨 글자 밭이 재조회 없이
  // 로컬 상태를 즉시 병합할 수 있게 한다(실패/무응답이면 null → 글자 밭이 안전하게 재조회로
  // 폴백한다).
  const logPromiseRef = useRef(Promise.resolve(null));

  useEffect(() => {
    if (!finished) return;
    let cancelled = false;

    const finalize = async () => {
      if (mode === 'skip') {
        const total = collectedAnswers.length;
        const correct = collectedAnswers.filter((a) => a.correct).length;
        const passed = total > 0 && correct / total >= SKIP_PASS_RATIO;
        if (passed) {
          const res = await skipScriptCharsApi(script, chars.map((c) => c.char));
          if (!cancelled) {
            showToast('이 줄은 이미 알고 있는 걸로 표시했어요');
            onComplete?.(res?.data?.items ?? null);
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
        const logPromise = logScriptResultsApi(script, results).then((res) => res?.data?.items ?? null);
        logPromiseRef.current = logPromise;
        await logPromise;
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
          rowLabel={rowLabel}
          onFinish={async () => {
            // logPromiseRef — /script/log 요청이 아직 진행 중이면(사용자가 결과 화면을
            // 빠르게 확인하고 나가는 경우) 그 응답을 기다린 뒤에만 onComplete를 부른다.
            const items = await logPromiseRef.current;
            onComplete?.(items);
            popNewFullSheet();
          }}
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
            {STEP_TITLES[currentStep.type] || '글자'}
          </h2>
        </div>
      </div>

      {/* 콘텐츠 영역 — TakeTest Main.jsx와 같은 규격(진행바 h-16 + flex-1 카드 영역 + 상단
          여백 pt-[5px])으로 채워서 화면이 위로 몰리지 않고 아래까지 꽉 차게 한다. */}
      <div className="flex flex-col flex-1 min-h-0 px-[16px] pt-[5px] pb-[20px]">
        <div className="relative w-full h-[16px] mb-[15px] rounded-[50px] bg-primary-main-100 dark:bg-layout-gray-dark overflow-hidden flex-shrink-0">
          <motion.div
            className="h-full rounded-[50px] bg-primary-main-600"
            initial={{ width: '0%' }}
            animate={{ width: `${progressPercent}%` }}
            transition={PROGRESS_FILL_TRANSITION}
          />
          <span className="absolute right-[10px] top-[50%] translate-y-[-50%] text-[#7b7b7b] text-[10px] font-semibold tracking-[-0.2px]">
            {stepIndex}/{steps.length}
          </span>
        </div>

        <div className="relative flex-1 min-h-0 overflow-hidden">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={currentStep.id}
              custom={1}
              variants={SLIDE_VARIANTS}
              initial="enter"
              animate="center"
              exit="exit"
              transition={SLIDE_TRANSITION}
              className="absolute inset-0 flex flex-col"
            >
              {currentStep.type === 'intro' && (
                <IntroCard key={currentStep.id} step={currentStep} onNext={handleIntroNext} />
              )}
              {(currentStep.type === 'seePick' || currentStep.type === 'listenPick') && (
                <ChoiceCard
                  key={currentStep.id}
                  step={currentStep}
                  answered={answered}
                  selectedIndex={selectedIndex}
                  onSelect={handleSelect}
                  onSettled={handleAnswerPlaybackSettled}
                />
              )}
              {currentStep.type === 'trace' && (
                <TraceCard key={currentStep.id} step={currentStep} onDone={handleTraceDone} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default ScriptSessionNewFullSheet;
