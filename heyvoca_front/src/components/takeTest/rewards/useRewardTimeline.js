// src/components/takeTest/rewards/useRewardTimeline.js
//
// 보상 슬라이드 한 장의 연출 시간표.
//
//   steps: [{ at, cue?, cueOpts?, run?(instant) }]
//     at   — 슬라이드가 뜬 뒤 몇 ms 에 실행할지
//     cue  — 그 순간에 울릴 손맛 큐(lib/feel). 소리·진동은 feel() 이 같은 순간으로 맞춘다
//     run  — 화면을 바꾸는 일. instant=true 면 **최종 상태만** 만들고 일회성 효과(파편 등)는 생략한다
//   readyAt — 연출이 끝나 「확인」이 켜지는 시각
//
// 건너뛰기(skip): 남은 step 을 instant 로 한꺼번에 실행하고 바로 「확인」을 켠다(소리는 켜짐 한 번만).
// 동작 줄이기(reducedMotion): 처음부터 전부 instant 로 실행하고 대표 큐 한 번만 울린다.
//
// run 은 같은 step 이 두 번 불려도 결과가 같게(멱등) 짠다 — 개발 모드의 이중 실행과 건너뛰기가 겹쳐도 안전하게.
import { useEffect, useRef, useState } from 'react';
import { feel } from '../../../lib/feel';

// 슬라이드가 옆에서 밀려 들어오는 동안(약 0.3초)에는 주인공이 아직 화면 밖이라 그만큼 늦게 시작한다
const START_DELAY_MS = 200;
const REDUCED_READY_MS = 350;

export function useRewardTimeline(build, { reducedMotion = false, reducedCue = 'bonus', readyCue = 'select', onReady, onSkip, skipRef } = {}) {
  const [ready, setReady] = useState(false);
  const onReadyRef = useRef(onReady);
  const skipFnRef = useRef(null);
  const onSkipRef = useRef(onSkip);
  useEffect(() => { onReadyRef.current = onReady; onSkipRef.current = onSkip; });

  useEffect(() => {
    const { steps = [], readyAt = 0 } = build();
    const sorted = steps.map((s, i) => ({ ...s, i })).sort((a, b) => (a.at - b.at) || (a.i - b.i));
    const timers = [];
    let next = 0;
    let done = false;

    const finish = (cue) => {
      if (done) return;
      done = true;
      setReady(true);
      if (cue) feel(cue);
      onReadyRef.current?.();
    };
    const skip = () => {
      if (done) return;
      timers.forEach(clearTimeout);
      onSkipRef.current?.();   // 날아다니던 일회성 효과를 치울 기회
      for (; next < sorted.length; next += 1) sorted[next].run?.(true);
      finish('select');
    };
    skipFnRef.current = skip;
    if (skipRef) skipRef.current = skip;

    if (reducedMotion) {
      sorted.forEach((s) => s.run?.(true));
      next = sorted.length;
      timers.push(setTimeout(() => { if (reducedCue) feel(reducedCue); }, START_DELAY_MS));
      timers.push(setTimeout(() => finish(null), START_DELAY_MS + REDUCED_READY_MS));
    } else {
      sorted.forEach((s, idx) => {
        timers.push(setTimeout(() => {
          if (done) return;
          next = idx + 1;
          if (s.cue) feel(s.cue, s.cueOpts);
          s.run?.(false);
        }, START_DELAY_MS + s.at));
      });
      timers.push(setTimeout(() => finish(readyCue), START_DELAY_MS + readyAt));
    }

    return () => {
      timers.forEach(clearTimeout);
      done = true;
      if (skipRef && skipRef.current === skip) skipRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ready, skip: () => skipFnRef.current?.() };
}

export default useRewardTimeline;
