// src/components/onboarding/AuthSplash.jsx
// 로그인 처리 중 화면 — Index.jsx 스플래시와 같은 배경·같은 자리의 로고(진행바 없음).
// 가입/로그인 직후 홈으로 가는 동안 로그인 버튼 화면이 잠깐 보이던 것을 덮는다(이슈 #25 6차 QA):
//  - 웹: 구글 OAuth 콜백이 /login?googleId=… 로 돌아와 Login 화면이 그려진 채 로그인 처리를 기다렸다.
//  - 앱: 온보딩 가입 화면(구글·애플 버튼)이 Login() 의 서버 왕복 동안 그대로 남았다.
// 이 화면 → navigate('/') → Index 스플래시로 같은 그림이 이어져 홈까지 끊김 없이 들어간다.
import React, { useEffect, useRef } from 'react';
import lottie from 'lottie-web';
import animationData from '../../assets/lottie/heyvoca logo-01.json';

const AuthSplash = () => {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return undefined;
    const anim = lottie.loadAnimation({
      container: ref.current,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData,
    });
    return () => anim.destroy();
  }, []);

  return (
    <div className="bg-primary-main-100 dark:bg-layout-gray-dark w-full h-screen fixed inset-0 z-[100]">
      <div
        ref={ref}
        className="w-[240px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      />
    </div>
  );
};

export default AuthSplash;
