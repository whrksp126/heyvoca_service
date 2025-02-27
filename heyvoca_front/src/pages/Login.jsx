import React, { useEffect } from 'react';
import lottie from 'lottie-web';
import animationData from '../assets/lottie/heyvoca logo-01.json';
import googleLogo from '../assets/images/google_logo.png';
import '../index.css';

const Login = () => {
  useEffect(() => {
    const container = document.getElementById("lottie-container");
    if (container) {
      const anim = lottie.loadAnimation({
        container,
        renderer: "svg",
        loop: false,
        autoplay: true,
        animationData,
      });
      return () => anim.destroy();
    }
  }, []);

  const clickGoogleLogin = () => {
    window.location.href = "https://vocaandgo.ghmate.com/login/google?device_type=web";
  };

  const clickNonMembers = () => {
    localStorage.setItem(
      "user",
      JSON.stringify({
        token: 1,
        email: "guest@heyvoca.com",
        name: "비회원",
        status: "login",
      })
    );
    window.location.href = "/vocabulary_list";
  };

  return (
    <div className="bg-[#FFEFFA] w-full h-screen absolute top-0 left-0 flex flex-col items-center">
      <div
        id="lottie-container"
        className="w-[240px] absolute top-[150px] left-1/2 transform -translate-x-1/2"
      ></div>
      <div className="absolute bottom-[140px] w-[300px] left-1/2 transform -translate-x-1/2 flex flex-col items-center">
        <button
          className="flex items-center justify-center w-full bg-white border border-[#CCCCCC] rounded-md py-[13.5px] px-5 text-black text-[15px] font-medium gap-2"
          onClick={clickGoogleLogin}
        >
          <img src={googleLogo} alt="Google Logo" className="h-[18px]" />
          <span>Google 로그인</span>
        </button>
        <a
          className="text-[#111111] text-[12px] text-center mt-2"
          href="#"
          onClick={clickNonMembers}
        >
          비회원 이용하기
        </a>
      </div>
    </div>
  );
};

export default Login;
