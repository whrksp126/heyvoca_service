// src/components/common/ProgressSplash.jsx
// 학습 준비(TTS 캐싱 등) 등 "완료까지 대기"가 필요한 곳에서 progress/message만 바꿔 사용하는
// 공용 화면. 로그인 스플래시(pages/Index.jsx)는 자체 로티 로고를 그대로 쓰고 이 컴포넌트를
// 쓰지 않는다 — 그래서 여기 로고를 바꿔도 로그인 스플래시는 영향받지 않는다(QA §G 확인 사항).
//
// QA §G — 로티 로고 대신 물 주는 헤이(mascot-watering)를 쓴다. 2.4초 주기로 살짝
// 떠올랐다 내려오는(bob) 루프만 남겼다 — "준비 중"이라는 정적인 사실에 "지금 하고 있다"는
// 동작을 얹는다. 물방울 낙하 애니메이션은 제거했다(QA 피드백).
// prefers-reduced-motion 이면 framer-motion 의 useReducedMotion 훅으로 전부 정지한다.
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import mascotWatering from '../../assets/images/farm/mascot-watering.png';

const ProgressSplash = ({ progress = 0, message = '' }) => {
  const reduceMotion = useReducedMotion();

  // 최소 4% 보장(빈 바 방지) + 상한 100%
  const barWidth = Math.max(4, Math.min(1, progress) * 100);

  return (
    <div className="bg-primary-main-100 dark:bg-layout-gray-dark w-full h-screen absolute top-0 left-0 flex flex-col items-center z-[9999]">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>

      {/* 물 주는 헤이 — 화면 정중앙(로그인 스플래시와 같은 자리). 바깥 div는 순수 CSS
          transform(-translate-x/y-1/2)으로만 중앙 정렬한다 — framer-motion의 animate={{ y }}는
          엘리먼트의 transform을 인라인 스타일로 통째로 관리해서, 같은 엘리먼트에 Tailwind의
          중앙 정렬 translate 클래스를 같이 걸면 그 클래스가 지워지고 좌상단 기준으로 밀려버린다
          (QA에서 오른쪽 아래로 쏠려 보이던 원인). 그래서 bob 애니메이션은 안쪽 motion.div에서만
          건다 — reduceMotion 이면 아예 걸지 않는다(transition만 지우면 초기 프레임이 남아
          "멈춰 있다"가 아니라 어색하게 보임). */}
      <div className="w-[190px] max-w-[45vw] aspect-square absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <motion.div
          className="relative w-full h-full"
          animate={reduceMotion ? undefined : { y: [0, -6, 0] }}
          transition={reduceMotion ? undefined : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <img
            src={mascotWatering}
            alt=""
            draggable={false}
            className="block w-full h-full object-contain select-none"
          />
        </motion.div>
      </div>

      {/* 프로그래스 영역 — 하단(화면 하단에서 약 20% 지점) */}
      <div className="absolute bottom-[20%] left-1/2 -translate-x-1/2 flex flex-col items-center gap-[12px]">
        {/* 프로그래스바 트랙 */}
        <div className="w-[140px] h-[3px] rounded-full bg-primary-main-200 dark:bg-layout-gray-600 overflow-hidden">
          {/* 채움 */}
          <div
            className="h-full rounded-full bg-primary-main-600 transition-[width] duration-500 ease-out"
            style={{ width: `${barWidth}%` }}
          />
        </div>

        {/* 단계 텍스트 — 바 아래, 고정 높이 */}
        <div className="h-[16px] flex items-center justify-center">
          <span
            key={message}
            className="text-[11px] text-layout-gray-400 dark:text-layout-gray-300 text-center leading-none"
          >
            {message}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ProgressSplash;
