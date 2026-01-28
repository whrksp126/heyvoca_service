import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import lottie from 'lottie-web';
import animationData from '../assets/lottie/heyvoca logo-01.json';
import googleLogo from '../assets/images/google_logo.png';
import '../index.css';
import { useUser } from '../context/UserContext';
import { AppleLogo } from '@phosphor-icons/react';
import { getValueFromURL } from '../utils/common';
import postMessageManager from '../utils/postMessageManager';
import { getDevicePlatform } from '../utils/osFunction';

const Login = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const navigate = useNavigate();
  const { auth, Login, AppleLogin, clickGoogleOauth, clickAppleOauth } = useUser();

  const platform = getDevicePlatform();
  // User Agent에 Android가 포함되어 있으면 안드로이드 환경으로 간주
  const isAndroid = platform === 'android' || navigator.userAgent.toLowerCase().includes('android');


  useEffect(() => {
    // auth.user가 있으면 로그인된 상태
    if (auth.user) {
      navigate('/');
    } else {
      // 로그인되지 않은 상태이면 로그인 처리
      handleLogin();
    }
  }, []);

  // React Compiler가 자동으로 useCallback 처리
  const handleAppGoogleAuth = async (data) => {
    const { googleId, email, name, status } = data;
    // 필수 정보 검증
    if (!googleId || !email || !name || !status) {
      console.error(`앱에서 받은 구글 사용자 정보가 불완전합니다: ${JSON.stringify(data)}`);
      return;
    }

    try {
      const result = await Login({ googleId, email, name, status });
      if (result.success) {
        navigate('/');
      } else {
        console.log(`앱 로그인 실패`);
      }
    } catch (error) {
      console.error(`앱 로그인 처리 중 오류: ${error}`);
    }
  };

  // 앱 구글 OAuth 처리
  useEffect(() => {
    // 앱 구글 OAuth 리스너 등록
    postMessageManager.setupAppGoogleAuth(handleAppGoogleAuth);

    // 컴포넌트 언마운트 시 리스너 제거
    return () => {
      postMessageManager.removeAppGoogleAuth();
    };
  }, [handleAppGoogleAuth]);

  // 앱 Apple OAuth 핸들러
  const handleAppAppleAuth = async (data) => {
    console.log(`앱 Apple OAuth 정보 받음: ${JSON.stringify(data)}`);
    // data: { identityToken, email, fullName, user, status }
    const { identityToken, email, fullName, status } = data;

    if (!identityToken || !status) {
      console.error('Apple 로그인 정보 불완전');
      return;
    }

    try {
      const result = await AppleLogin({ identityToken, fullName, email, status });
      if (result.success) {
        console.log("App Apple Login Success");
        navigate('/');
      } else {
        console.log("App Apple Login Failed");
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    postMessageManager.setupAppAppleAuth(handleAppAppleAuth);
    return () => {
      postMessageManager.removeAppAppleAuth();
    };
  }, [handleAppAppleAuth]);


  // React Compiler가 자동으로 useCallback 처리
  const handleLogin = async () => {
    // URL에서 파라미터 가져오기
    const googleId = getValueFromURL('googleId');
    const email = getValueFromURL('email');
    const name = getValueFromURL('name');
    const status = getValueFromURL('status');

    // 필수 파라미터가 있는지 확인
    if (!googleId || !email || !name || !status) {
      console.log('로그인에 필요한 파라미터가 없습니다.');
      return;
    }

    const result = await Login({ googleId, email, name, status });
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
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
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
        {!isAndroid && (
          <button
            className="flex items-center justify-center w-full bg-black border border-black rounded-md py-[13.5px] px-5 text-white text-[15px] font-medium gap-2 mt-[10px]"
            onClick={clickAppleOauth}
          >
            <AppleLogo size={20} weight="fill" color="#FFFFFF" />
            <span>Apple로 로그인</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default Login;
