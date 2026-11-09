// src/components/onboarding/VirtualFarmNote.jsx
//
// 온보딩 체험 학습(가상 농장, 이슈 #25 4차) — 채점으로 작물이 되살아나거나 마를 때 문제 위에 잠깐 뜨는 한 줄.
// 농장 상태 바(FarmStatusBar)는 그림 한 장(채점 뒤 건강 상태)만 그려서 '시들었던 게 살아났다'·'말랐다'가
// 안 읽힌다. 상태 바는 다른 화면과 같은 것을 그대로 쓰고, 그 변화만 여기서 말로 덧붙인다.
// Main.jsx 가 가상 농장 payload 의 revived/withered 를 보고 note 를 넘긴다. 위치는 호출부(absolute 상단 가운데).
import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Plant, Drop } from '@phosphor-icons/react';

const COPY = {
  revived: '시들었던 작물이 다시 살아났어요',
  drying: '틀려서 작물이 마르기 시작했어요',
  wilted: '작물이 시들었어요. 다시 맞히면 살아나요',
};

const VirtualFarmNote = ({ note }) => {
  const reduced = useReducedMotion();
  const kind = note?.kind;
  const good = kind === 'revived';
  // 가운데 정렬은 바깥 줄(flex)이 맡는다 — 움직이는 쪽에 translate 클래스를 주면 framer 의 transform 이 덮어쓴다.
  return (
    <div className="pointer-events-none absolute top-[8px] inset-x-0 z-[5] flex justify-center">
    <AnimatePresence>
      {kind && (
        <motion.div
          key={`${kind}-${note.at}`}
          role="status"
          initial={{ opacity: 0, y: reduced ? 0 : -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, delay: reduced ? 0 : 0.35 }}
          className={`
            flex items-center gap-[6px] whitespace-nowrap rounded-full px-[12px] py-[6px]
            text-[12.5px] font-[700] tracking-[-0.02em]
            shadow-[0_2px_10px_rgba(0,0,0,0.08)] dark:shadow-none
            ${good
              ? 'bg-layout-white dark:bg-[#2E2E2E] text-status-success-600'
              : 'bg-layout-white dark:bg-[#2E2E2E] text-secondary-yellow-600'}
          `}
        >
          {good ? <Plant size={15} weight="fill" /> : <Drop size={15} weight="fill" />}
          {COPY[kind]}
        </motion.div>
      )}
    </AnimatePresence>
    </div>
  );
};

export default VirtualFarmNote;
