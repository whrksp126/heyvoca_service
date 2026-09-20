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
 * @returns {number} 현재 애니메이션 중인 표시값(정수 반올림)
 */
export function useCountUp(value, { duration = 0.6 } = {}) {
  const target = Number(value) || 0;
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);
  const firstRef = useRef(true);

  useEffect(() => {
    // 최초 마운트에는 애니메이션 없이 바로 값을 보여준다 — 화면 진입 순간 0에서부터
    // 굴러가는 건 "값이 바뀌었다"는 신호가 아니라 그냥 로딩처럼 보인다.
    if (firstRef.current) {
      firstRef.current = false;
      prevRef.current = target;
      setDisplay(target);
      return;
    }
    const from = prevRef.current;
    if (from === target) return;
    const controls = animate(from, target, {
      duration,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    prevRef.current = target;
    return () => controls.stop();
  }, [target, duration]);

  return display;
}

export default useCountUp;
