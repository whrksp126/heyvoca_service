// src/components/overlay/AchievementRewardOverlay.jsx
//
// 학습 결과 밖에서 업적 레벨을 달성했을 때의 연출 — 출석 체크(UserContext), 서점 구매·단어장 추가
// (VocabularyContext), 가입 직후 홈 첫 진입 대기열(home/Main.jsx)이 showAwaitOverlay 로 띄운다.
//
// 2026-11 QA #25: 예전에는 따로 만든 옛 연출(빙글 도는 배경 + 3초 자동 닫힘)이었다. 이제 학습 결과의
// 업적 슬라이드(takeTest/rewards/AchievementSlide)를 같은 껍데기(RewardShell)에 담아 그대로 보여 준다
// — 메달 승급 연출·문구·「확인」 버튼까지 학습 결과와 같다. 헤더 제목만 「업적 달성」.
import React, { useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useOverlayActions } from '../../context/OverlayContext';
import { haptic } from '../../lib/feel';
import RewardShell from '../takeTest/rewards/RewardShell';
import AchievementSlide from '../takeTest/rewards/AchievementSlide';

const AchievementRewardOverlay = ({ goal }) => {
  const { resolveOverlay } = useOverlayActions();
  const reducedMotion = useReducedMotion();
  const [ready, setReady] = useState(false);
  const skipRef = useRef(null);

  if (!goal) return null;

  return (
    <div className="fixed inset-0 bg-layout-white dark:bg-layout-black text-layout-black dark:text-layout-white">
      <RewardShell
        slideKey="achievement"
        title="업적 달성"
        ready={ready}
        onSkip={() => skipRef.current?.()}
        onConfirm={() => { haptic('selection'); resolveOverlay({ confirmed: true }); }}
      >
        <AchievementSlide
          goal={goal}
          reducedMotion={reducedMotion}
          skipRef={skipRef}
          onReady={() => setReady(true)}
        />
      </RewardShell>
    </div>
  );
};

export default AchievementRewardOverlay;
