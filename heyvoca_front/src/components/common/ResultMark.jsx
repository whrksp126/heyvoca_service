import { memo, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Circle, X } from '@phosphor-icons/react';

// 채점 결과 큰 O/X 마크 — 모든 학습 문제 유형(사지선다·듣기 사지선다·역방향·빈칸 채우기·
// 빈칸 직접 입력·문장 만들기·받아쓰기) 공용. 기존 스프링 등장 애니메이션으로 확대되며
// 나타났다가 약 600ms 유지 후 200ms 페이드아웃으로 사라진다 — 그 뒤로는 칩 색·정답 문장·
// XP 바 등 카드 내용이 가려지지 않고 온전히 보인다.
//
// 이 컴포넌트는 "얼마나 오래 보이는지"만 책임진다. 자동 진행(advanceGate)이 다음 문제로
// 넘어가는 타이밍은 각 호출부의 기존 로직 그대로 유지된다 — 서로 독립적이다.
//
// 【2026-09-29 QA 4차 — O/X 깜빡임, 원인과 지금 구조】
// 예전 구현은 "지금 보이는지"를 React state(`visible`)로 들고, 그 state를 setTimeout으로
// 늦게 false로 바꿔 AnimatePresence의 exit 애니메이션이 재생되게 했다. 그런데 실기기·
// 헤드리스 크롬 양쪽에서 재현되는 문제가 있었다 — 완전히 무관한 형제 상태(카드의 TTS
// 재생 상태 등)가 늦게(채점 후 450ms 지연 재생이 끝나는 시점 근처, 공교롭게도 이 컴포넌트가
// 막 사라진 직후) 바뀌어 부모가 리렌더될 때, React.memo로 이 컴포넌트 자체의 리렌더를
// 막아도 완전히는 막히지 않는 경우가 있었다(타이밍에 따라 간헐적) — 그 순간 아이콘이 다시
// 완전한 밝기로 한 프레임 나타났다 사라지는 "깜빡임"으로 보였다.
//
// 그래서 지금은 "언제 사라질지"를 나중에 오는 별도의 React state 갱신(setTimeout →
// setState)에 전혀 맡기지 않는다 — 등장→유지→소멸까지의 전체 타임라인을 **마운트 시점에
// 단 한 번** Framer Motion의 keyframe 애니메이션 하나로 통째로 예약한다. 그 뒤로 부모가
// 몇 번을 리렌더해도(형제 상태가 바뀌어도) 이 애니메이션은 이미 진행 중인 하나의 타임라인일
// 뿐이라 다시 트리거될 여지가 없다.
//
// props:
//   result   — true(정답) / false(오답) / null(표시 안 함)
//   replayKey — 재개(resume) 등으로 같은 result 값을 다시 재생해야 할 때 바뀌는 값
//   size     — 아이콘 크기(px), 기본 150
//   className — 바깥 래퍼(위치잡기용) 클래스. 기본은 pointer-events-none만 적용
const HOLD_MS = 600;
const FADE_MS = 200;
const REDUCED_HOLD_MS = 250;
const REDUCED_FADE_MS = 80;

const ResultMark = memo(({ result, replayKey, size = 150, className = '' }) => {
  const reducedMotion = useReducedMotion();
  // activeResult/activeKey — 지금 재생 중인(또는 막 끝난) 정오답 인스턴스. result가 null로
  // 돌아가도(카드가 다음 문제로 넘어가는 배치) 즉시 지우지 않는다 — 이미 예약된 타임라인이
  // onAnimationComplete로 스스로 끝을 알릴 때(done) 비로소 렌더를 멈춘다.
  const [activeResult, setActiveResult] = useState(result);
  const [activeKey, setActiveKey] = useState(replayKey);
  const [done, setDone] = useState(result === null);

  useEffect(() => {
    if (result === null) return;
    setActiveResult(result);
    setActiveKey(replayKey);
    setDone(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, replayKey]);

  if (activeResult === null || done) {
    return <div className={`pointer-events-none ${className}`} />;
  }

  const holdMs = reducedMotion ? REDUCED_HOLD_MS : HOLD_MS;
  const fadeMs = reducedMotion ? REDUCED_FADE_MS : FADE_MS;
  const totalSec = (holdMs + fadeMs) / 1000;
  // 등장(스프링)이 시각적으로 자리 잡는 지점 — opacity 키프레임의 첫 구간 길이로만 쓴다.
  const enterSec = reducedMotion ? 0.01 : 0.15;
  const enterFraction = Math.min(enterSec / totalSec, 0.9);
  const holdEndFraction = Math.min(holdMs / 1000 / totalSec, 0.98);

  const enterTransition = reducedMotion
    ? { duration: 0.01 }
    : { type: 'spring', stiffness: 600, damping: 25, duration: 0.3 };
  const Icon = activeResult ? Circle : X;
  const colorClass = activeResult ? 'text-status-success-500' : 'text-status-error-500';

  return (
    <div className={`pointer-events-none ${className}`}>
      <motion.div
        key={`${activeResult}-${activeKey}`}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: [0, 1, 1, 0] }}
        transition={{
          scale: enterTransition,
          opacity: {
            duration: totalSec,
            times: [0, enterFraction, holdEndFraction, 1],
            ease: ['easeOut', 'linear', 'easeOut'],
          },
        }}
        onAnimationComplete={() => setDone(true)}
      >
        <Icon size={size} weight="bold" className={colorClass} />
      </motion.div>
    </div>
  );
});

export default ResultMark;
