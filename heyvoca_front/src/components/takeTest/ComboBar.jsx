import React, { useEffect, useRef, useState } from 'react';
import { Flame } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 콤보 팝업 — AI 추천 테스트에서 콤보가 "오를 때"만 프로그래스 바 위에 텍스트로 잠깐 달렸다 사라짐.
 * - 진입 시 초기 콤보값으로는 표시하지 않음(초기 노출 버그 방지).
 * - 다음 문제 슬라이드 전환(정답 ~1s) 전에 사라지도록 800ms 후 숨김.
 * - 레이아웃을 차지하지 않도록 0높이 relative 컨테이너 + absolute.
 */
const ComboBar = ({ combo }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const current = combo?.current ?? 0;
  const [show, setShow] = useState(false);
  const prevRef = useRef(null); // null = 아직 초기화 전(첫 값은 트리거하지 않음)
  const timerRef = useRef(null);

  useEffect(() => {
    if (prevRef.current === null) {
      // 진입 직후 최초 콤보값 — 표시하지 않고 기준값만 세팅
      prevRef.current = current;
      return;
    }
    if (current >= 2 && current > prevRef.current) {
      setShow(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setShow(false), 800);
    } else if (current < prevRef.current) {
      setShow(false); // 콤보 깨짐
    }
    prevRef.current = current;
  }, [current]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <div className="relative w-full">
      <AnimatePresence>
        {show && (
          <motion.div
            key={current}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="absolute bottom-[2px] right-[2px] z-[6] flex items-center gap-[3px] text-primary-main-600 whitespace-nowrap"
          >
            <Flame weight="fill" className="text-[14px]" />
            <span className="text-[13px] font-[800]">{current}콤보!</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ComboBar;
