// src/components/common/ProgressSplash.jsx
// 로그인 스플래시(pages/Index.jsx)와 "동일한" 프로그래스 표현을 재사용하는 공용 화면.
// 학습 준비(TTS 캐싱 등) 등 "완료까지 대기"가 필요한 곳에서 progress/message만 바꿔 사용한다.
// 새 UI를 만들지 않고 기존 스플래시의 로고 + 프로그래스바 + 하단 문구를 그대로 사용한다.
import React, { useEffect, useRef } from 'react';
import lottie from 'lottie-web';
import animationData from '../../assets/lottie/heyvoca logo-01.json';

const ProgressSplash = ({ progress = 0, message = '' }) => {
  const lottieRef = useRef(null);

  useEffect(() => {
    if (!lottieRef.current) return;
    const anim = lottie.loadAnimation({
      container: lottieRef.current,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData,
    });
    return () => anim.destroy();
  }, []);

  // 최소 4% 보장(빈 바 방지) + 상한 100%
  const barWidth = Math.max(4, Math.min(1, progress) * 100);

  return (
    <div className="bg-primary-main-100 dark:bg-layout-gray-dark w-full h-screen absolute top-0 left-0 flex flex-col items-center z-[9999]">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>

      {/* Lottie 로고 — 화면 정중앙 (로그인 스플래시와 위치·크기 일치) */}
      <div
        ref={lottieRef}
        className="w-[240px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      ></div>

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
