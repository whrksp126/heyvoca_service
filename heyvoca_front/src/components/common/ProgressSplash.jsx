// src/components/common/ProgressSplash.jsx
// 학습 준비(TTS 캐싱 등) 등 "완료까지 대기"가 필요한 곳에서 progress/message만 바꿔 사용하는
// 공용 화면. 로그인 스플래시(pages/Index.jsx)는 자체 로티 로고를 그대로 쓰고 이 컴포넌트를
// 쓰지 않는다 — 그래서 여기 로고를 바꿔도 로그인 스플래시는 영향받지 않는다(QA §G 확인 사항).
//
// QA §G — 로티 로고 대신 물 주는 헤이(mascot-watering)를 쓴다. 2.4초 주기로 살짝
// 떠올랐다 내려오고(bob), 물뿌리개 주둥이 앞에서 물방울 3개가 0.6초 간격으로 떨어지며
// 사라지는 루프를 더했다 — "준비 중"이라는 정적인 사실에 "지금 하고 있다"는 동작을 얹는다.
// prefers-reduced-motion 이면 framer-motion 의 useReducedMotion 훅으로 전부 정지한다.
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import mascotWatering from '../../assets/images/farm/mascot-watering.png';

const DROPLET_COUNT = 3;
const DROPLET_INTERVAL = 0.6;              // 초 — 물방울 사이 간격
const DROPLET_CYCLE = DROPLET_COUNT * DROPLET_INTERVAL; // 1.8초 — 다 돌면 처음 방울과 다시 겹친다
// 물뿌리개 주둥이 위치 — 그림 기준 x 52~60% · y 44~46%. 세 방울 모두 같은 자리에서 시작한다.
const DROPLET_ORIGIN = { left: '56%', top: '45%' };

const ProgressSplash = ({ progress = 0, message = '' }) => {
  const reduceMotion = useReducedMotion();

  // 최소 4% 보장(빈 바 방지) + 상한 100%
  const barWidth = Math.max(4, Math.min(1, progress) * 100);

  return (
    <div className="bg-primary-main-100 dark:bg-layout-gray-dark w-full h-screen absolute top-0 left-0 flex flex-col items-center z-[9999]">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>

      {/* 물 주는 헤이 — 화면 정중앙(로그인 스플래시와 같은 자리). bob 애니메이션은
          reduceMotion 이면 아예 걸지 않는다 — transition 을 지워도 초기 프레임이 남아
          움직임이 없는 게 아니라 "멈춰 있다"로 보이는 편이 낫다. */}
      <motion.div
        className="w-[190px] h-[190px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        animate={reduceMotion ? undefined : { y: [0, -6, 0] }}
        transition={reduceMotion ? undefined : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <img
          src={mascotWatering}
          alt=""
          draggable={false}
          className="block w-full h-full object-contain select-none"
        />

        {/* 물방울 3개 — 방울마다 0.6초씩 늦게 시작해서 순서대로 떨어지고, 1.8초마다 처음부터
            반복한다. 한 방울의 움직임 구간(0~50%)만 낙하·소멸이고 나머지 구간은 다음 차례를
            기다리며 숨어 있다 — times 로 그 구간을 정해 준다. */}
        {!reduceMotion && Array.from({ length: DROPLET_COUNT }).map((_, i) => (
          <motion.span
            key={i}
            aria-hidden
            className="absolute w-[6px] h-[6px] rounded-full bg-[#9ED2FF]"
            style={DROPLET_ORIGIN}
            animate={{ y: [0, 26, 26], opacity: [1, 0, 0] }}
            transition={{
              duration: DROPLET_CYCLE,
              times: [0, 0.5, 1],
              repeat: Infinity,
              delay: i * DROPLET_INTERVAL,
              ease: 'easeIn',
            }}
          />
        ))}
      </motion.div>

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
