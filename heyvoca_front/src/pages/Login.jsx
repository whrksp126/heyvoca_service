import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import lottie from 'lottie-web';
import animationData from '../assets/lottie/heyvoca logo-01.json';
import googleLogo from '../assets/images/google_logo.png';
import '../index.css';
import { backendUrl, fetchDataAsync, getValueFromURL } from '../utils/common';
import { useUser } from '../context/UserContext';
import { getDevicePlatform } from '../utils/osFunction';

const Login = () => {
  const navigate = useNavigate();
  const { userStorageData, setUserStorageData } = useUser();
  useEffect(() => {
    if(!userStorageData){
      setUserStorageData({
        google_id : null,
        name : null,
        email : null,
        status : "logout",
      })
    }
    console.log(userStorageData);
    if(userStorageData?.status == "login"){
      navigate('/');
    }
    const handleLogin = async () => {
      const google_id = getValueFromURL('googleId');
      if (!google_id) return;
      const access_token = getValueFromURL('accessToken');
      const refresh_token = getValueFromURL('refreshToken');
      const email = getValueFromURL('email');
      const name = getValueFromURL('name');
      const status = getValueFromURL('status');
      const type = getValueFromURL('type');
      const user = {
        google_id: google_id,
        name: name,
        email: email,
        status: 'login',
      };
      if (type === 'app') {
        const url = `${backendUrl}/login/login_google/callback/app`;
        const method = 'POST';
        const fetchData = {
          google_id: google_id,
          access_token: access_token,
          refresh_token: refresh_token,
          email: email,
          name: name
        };
        try {
          const result = await fetchDataAsync(url, method, fetchData);
          if (result.code !== 200) {
            alert('로그인 중 오류가 발생하였습니다.');
            return;
          }
        } catch (error) {
          alert(JSON.stringify(error));
          return;
        } 
      }
      setUserStorageData(user);
      navigate('/');
    };

    handleLogin();
  }, [navigate]);

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
    const device_type = getDevicePlatform();
    if(device_type == 'web'){
      window.location.href = `${backendUrl}/login/google?device_type=${device_type}`;
    }else{
      window.ReactNativeWebView.postMessage('launchGoogleAuth');
    }
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
      </div>
    </div>
  );
};

export default Login;
