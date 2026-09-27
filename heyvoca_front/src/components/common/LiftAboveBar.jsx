import { useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

/*
  【문제 카드 안 텍스트는 카드 실제 정중앙 — 2026-09-27 실기기 피드백】
  카드 안 단어·음파·O/X 는 카드 박스 전체 기준 정중앙에 선다(대칭 padding).
  하단 농장 상태 바(absolute 오버레이)가 떴는데 카드가 작아 단어 아래 끝이 바에 닿을 때만,
  닿지 않을 만큼만 단어를 위로 부드럽게 비킨다. 카드 크기는 절대 바뀌지 않는다(transform 만).

  - 카드 루트에 `data-lift-card`, 상태 바 루트에 `data-farm-result-bar` 가 있어야 한다.
  - 측정은 offsetTop 누적(= transform 무시한 레이아웃 좌표)이라 카드 scale·바 등장 y 연출에
    흔들리지 않는다.
  - 위로 비키는 양은 우측 상단 시점 문구 자리(topReserve)를 넘지 않는다.
*/

const offsetWithin = (el, ancestor) => {
  let top = 0;
  let node = el;
  while (node && node !== ancestor) {
    top += node.offsetTop;
    node = node.offsetParent;
  }
  return node === ancestor ? top : null;
};

const LiftAboveBar = ({ active, topReserve = 0, gap = 4, className = '', children }) => {
  const ref = useRef(null);
  const [lift, setLift] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!active || !el) {
      setLift(0);
      return undefined;
    }
    const card = el.closest('[data-lift-card]');
    if (!card) return undefined;

    const measure = () => {
      const bar = card.querySelector('[data-farm-result-bar]');
      const top = offsetWithin(el, card);
      const barTop = bar ? offsetWithin(bar, card) : null;
      if (top == null || barTop == null) {
        setLift(0);
        return;
      }
      const need = top + el.offsetHeight + gap - barTop;
      const room = top - topReserve;
      setLift(Math.max(0, Math.round(Math.min(need, room))));
    };

    measure();
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    });
    ro.observe(card);
    ro.observe(el);
    const bar = card.querySelector('[data-farm-result-bar]');
    if (bar) ro.observe(bar);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [active, topReserve, gap]);

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={false}
      animate={{ y: -lift }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
};

export default LiftAboveBar;
