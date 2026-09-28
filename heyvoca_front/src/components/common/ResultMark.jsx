import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Circle, X } from '@phosphor-icons/react';

// 채점 결과 큰 O/X 마크 — 모든 학습 문제 유형(사지선다·듣기 사지선다·역방향·빈칸 채우기·
// 빈칸 직접 입력·문장 만들기·받아쓰기) 공용. 기존 스프링 등장 애니메이션으로 확대되며
// 나타났다가 약 600ms 유지 후 200ms 페이드아웃으로 사라진다 — 그 뒤로는 칩 색·정답 문장·
// XP 바 등 카드 내용이 가려지지 않고 온전히 보인다.
//
// 이 컴포넌트는 "얼마나 오래 보이는지"만 책임진다. 자동 진행(advanceGate)이 다음 문제로
// 넘어가는 타이밍은 각 호출부의 기존 로직 그대로 유지된다 — 서로 독립적이다.
//
// props:
//   result   — true(정답) / false(오답) / null(표시 안 함)
//   replayKey — 재개(resume) 등으로 같은 result 값을 다시 재생해야 할 때 바뀌는 값
//   size     — 아이콘 크기(px), 기본 150
//   className — 바깥 래퍼(위치잡기용) 클래스. 기본은 pointer-events-none만 적용
const HOLD_MS = 600;
const FADE_SEC = 0.2;
const REDUCED_HOLD_MS = 250;

const ResultMark = ({ result, replayKey, size = 150, className = '' }) => {
  const reducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(result !== null);

  useEffect(() => {
    if (result === null) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const holdMs = reducedMotion ? REDUCED_HOLD_MS : HOLD_MS;
    const timer = setTimeout(() => setVisible(false), holdMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, replayKey, reducedMotion]);

  const enterTransition = reducedMotion
    ? { duration: 0.01 }
    : { type: 'spring', stiffness: 600, damping: 25, duration: 0.3 };
  const exitTransition = { duration: reducedMotion ? 0.01 : FADE_SEC, ease: 'easeOut' };

  return (
    <div className={`pointer-events-none ${className}`}>
      <AnimatePresence>
        {visible && result === true && (
          <motion.div
            key={`correct-${replayKey}`}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0, transition: exitTransition }}
            transition={enterTransition}
            style={{ willChange: 'transform, opacity' }}
          >
            <Circle size={size} weight="bold" className="text-status-success-500" />
          </motion.div>
        )}
        {visible && result === false && (
          <motion.div
            key={`wrong-${replayKey}`}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0, transition: exitTransition }}
            transition={enterTransition}
            style={{ willChange: 'transform, opacity' }}
          >
            <X size={size} weight="bold" className="text-status-error-500" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ResultMark;
