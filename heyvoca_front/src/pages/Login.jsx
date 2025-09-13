import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import lottie from 'lottie-web';
import animationData from '../assets/lottie/heyvoca logo-01.json';
import googleLogo from '../assets/images/google_logo.png';
import '../index.css';
import { useUser } from '../context/UserContext';

const Login = () => {
  const navigate = useNavigate();
  const { auth, Login, clickGoogleOauth } = useUser();

  useEffect(() => {
    // auth.user가 있으면 로그인된 상태
    if(auth.user){
      navigate('/');
    } else {
      // 로그인되지 않은 상태이면 로그인 처리
      handleLogin();
    }
  }, [navigate, auth.user]);
  
  const handleLogin = async () => {
    const result = await Login();
    if (result.success) {
      navigate('/');
    }
  }

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


  return (
    <div className="bg-[#FFEFFA] w-full h-screen absolute top-0 left-0 flex flex-col items-center">
      <div
        id="lottie-container"
        className="w-[240px] absolute top-[150px] left-1/2 transform -translate-x-1/2"
      ></div>
      <div className="absolute bottom-[140px] w-[300px] left-1/2 transform -translate-x-1/2 flex flex-col items-center">
        <button
          className="flex items-center justify-center w-full bg-white border border-[#CCCCCC] rounded-md py-[13.5px] px-5 text-black text-[15px] font-medium gap-2"
          onClick={clickGoogleOauth}
        >
          <img src={googleLogo} alt="Google Logo" className="h-[18px]" />
          <span>Google 로그인</span>
        </button>
      </div>
    </div>
  );
};

export default Login;
