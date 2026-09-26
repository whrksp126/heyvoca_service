// src/lib/feel/useCountUp.js
//
// 숫자 카운트업 훅 — 보석 수·퍼센트 등 값이 바뀔 때 굴러가는 숫자로 보여준다.
// framer-motion 의 독립 실행형 animate(number)를 사용해 리렌더 비용 없이 보간한다.
import { useEffect, useRef, useState } from 'react';
import { animate } from 'framer-motion';

/**
 * @param {number} value 목표 값 (바뀔 때마다 현재 표시값에서 이 값으로 보간)
 * @param {object} [opts]
 * @param {number} [opts.duration=0.6] 초
 * @param {number} [opts.delay=0] 초 — 다른 연출(막대 등)과 출발을 맞출 때
 * @param {number} [opts.from] 최초 마운트 시 출발값. 주면 마운트 순간에도 이 값에서 target
 *   까지 굴러간다(채점 결과처럼 "마운트 자체가 값이 바뀐 사건"인 자리용). 안 주면 예전처럼
 *   최초 마운트는 애니메이션 없이 바로 target 을 보여준다.
 * @returns {number} 현재 애니메이션 중인 표시값(정수 반올림)
 */
export function useCountUp(value, { duration = 0.6, delay = 0, from: initialFrom } = {}) {
  const target = Number(value) || 0;
  const hasFrom = initialFrom != null && Number.isFinite(Number(initialFrom));
  const [display, setDisplay] = useState(hasFrom ? Number(initialFrom) : target);
  const prevRef = useRef(hasFrom ? Number(initialFrom) : target);
  const firstRef = useRef(true);

  useEffect(() => {
    // 최초 마운트에는 애니메이션 없이 바로 값을 보여준다 — 화면 진입 순간 0에서부터
    // 굴러가는 건 "값이 바뀌었다"는 신호가 아니라 그냥 로딩처럼 보인다.
    // (단 opts.from 을 준 호출부는 마운트 자체가 변화라 그 값에서 굴러간다.)
    if (firstRef.current) {
      firstRef.current = false;
      if (!hasFrom) {
        prevRef.current = target;
        setDisplay(target);
        return;
      }
    }
    // prevRef 는 "지금 화면에 보이는 값"이다 — 중간에 멈춰도(StrictMode 이중 실행, 값이 연달아
    // 바뀜) 멈춘 지점에서 다음 목표로 이어서 굴러가게 onUpdate 마다 갱신한다.
    const start = prevRef.current;
    if (start === target) return;
    const controls = animate(start, target, {
      duration,
      delay,
      ease: 'easeOut',
      onUpdate: (v) => {
        prevRef.current = v;
        setDisplay(Math.round(v));
      },
      onComplete: () => {
        prevRef.current = target;
        setDisplay(target);
      },
    });
    return () => controls.stop();
  }, [target, duration]);

  return display;
}

export default useCountUp;
