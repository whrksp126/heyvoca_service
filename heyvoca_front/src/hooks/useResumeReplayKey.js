import { useEffect, useState } from 'react';

/*
  백그라운드 복귀(visibilitychange → visible) 시 1씩 증가하는 카운터.

  왜 필요한가 — framer-motion(MainThreadAnimation.tick, node_modules/framer-motion/dist/es/
  animation/animators/MainThreadAnimation.mjs)은 애니메이션 진행률을 프레임마다
  "현재 실제 시각 - 시작 시각"(절대 wall-clock 차)으로 계산한다. RN WebView가 백그라운드로
  가면 requestAnimationFrame 자체가 멈추고(브라우저 탭 숨김과 동일하게 동작), 그 사이 흐른
  실제 시간은 이 앱의 채점 연출(링 팝인 스프링 ~0.3s, 성장 게이지 tween 0.45~1s)보다 항상
  길다. 그래서 WebView가 포그라운드로 돌아와 rAF가 재개되는 첫 프레임에서 "경과 시간이
  이미 duration을 넘었다"고 계산되어, 애니메이션이 중간 프레임 없이 최종 상태로 즉시
  스냅된다 — 정답 링이 처음부터 꽉 찬 채로 뜨고 성장 게이지가 차오르는 과정 없이 고정값으로
  보이는 버그가 이 경로로 재현된다.

  고치는 방법은 "그 애니메이션을 다시 새로 마운트해서 replay 하는 것"이다. framer-motion은
  각 애니메이션을 생성(createdAt)한 실제 시각을 기준으로 삼으므로, 복귀 시점에 React key를
  바꿔 해당 motion 엘리먼트를 강제로 재마운트하면 새 애니메이션이 "지금" 시각을 기준으로
  다시 생성되어 initial→animate 전환이 정상적으로 재생된다.

  이 훅은 그 "지금 시각" 신호를 하나의 카운터로 제공한다. 사용하는 쪽에서 애니메이션이 걸린
  엘리먼트의 key(또는 key의 일부)에 이 값을 섞어주면 된다:

    <motion.div key={`correct-${resumeReplayKey}`} initial={...} animate={...} />

  탭이 백그라운드로 갔다가 돌아올 때만 증가하므로, 평소 문제 전환 중에는 아무 영향이 없다.
*/
export const useResumeReplayKey = () => {
  const [resumeReplayKey, setResumeReplayKey] = useState(0);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setResumeReplayKey((prev) => prev + 1);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  return resumeReplayKey;
};

export default useResumeReplayKey;
