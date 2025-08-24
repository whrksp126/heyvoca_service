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
        id_token : null,
        google_id : null,
        name : null,
        email : null,
        status : "logout",
      })
    }

    if(userStorageData?.status == "login"){
      navigate('/');
    }
    const handleLogin = async () => {
      const google_id = getValueFromURL('googleId');
      if (!google_id) return;

      const email = getValueFromURL('email');
      const name = getValueFromURL('name');
      const type = getValueFromURL('type');
      const id_token = getValueFromURL("idToken");

      // 1) 필수값 검증
      if (!id_token) {
        alert('id_token이 없습니다. (URL 파라미터 idToken 확인)');
        return;
      }

      // 2) 로컬 스토리지/컨텍스트 반영용 객체 (키명 통일)
      const user = {
        id_token,
        google_id,
        name,
        email,
        status: 'login',
        accessToken : null,
        refreshToken : null,
      };

      // 3) 앱에서 넘어오는 케이스 → POST
      if (type === 'app') {
        const url = `${backendUrl}/login/google/app`;
        const method = 'POST';

        const fetchData = {
          id_token,
          google_id,
          email,
          name
        };

        try {
          let result = null;
          try {
            result = await fetchDataAsync(url, method, fetchData, false, null);
            // console.log('✅ [FETCH] 성공 결과:', result);
          } catch (fetchError) {
            console.error('❌ [FETCH] 상세 오류:', {
              message: fetchError.message,
              stack: fetchError.stack,
              url,
              method,
              fetchData
            });
            throw fetchError;
          }
          if (result.code !== 200) {
            alert('로그인 중 오류가 발생하였습니다.');
            return;
          }

          // 로그인 성공 후 사용자 정보 설정
          user.accessToken = result.accessToken;
          user.refreshToken = result.refreshToken;
          setUserStorageData(user);
          // 로그인 성공 후 앱에 토큰 전송
          const message = JSON.stringify({
            type : "loginSuccess",
            data : result
          });
          window.ReactNativeWebView.postMessage(message);
          navigate('/');
          // navigate('/');
        } catch (error) {
          console.error('[LOGIN][ERROR]', error);
          alert(`로그인 요청 실패: ${error?.message || error}`);
          // alert(JSON.stringify(error));
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
