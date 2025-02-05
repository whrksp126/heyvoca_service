// import React from 'react';
// import Main from '../components/login/Main';

// const Login = () => {
//   return (
//     <div 
//       className="
//         flex flex-col items-center justify-center 
//         h-screen 
//         mx-auto
//       "
//     >
//       <Main />
//     </div>
//   );
// };

// export default Login; 


import React, { useEffect } from 'react';
import lottie from 'lottie-web';
import Main from '../components/login/Main';
import "../Login.css";

import animationData from '../assets/lottie/heyvoca logo-01.json';
import googleLogo from '../assets/images/google_logo.png';

const Login = () => {
  // useEffect(() => {
  //   // 로컬 스토리지에서 유저 정보 확인
  //   const userData = JSON.parse(localStorage.getItem("user"));
  //   if (!userData) {
  //     localStorage.setItem(
  //       "user",
  //       JSON.stringify({
  //         google_id: null,
  //         name: null,
  //         email: null,
  //         status: "logout",
  //       })
  //     );
  //   }
  //   if (userData?.status === "login") {
  //     window.location.href = "/vocabulary_list";
  //   }
  // }, []);

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

      return () => {
        anim.destroy(); // 언마운트 시 애니메이션 제거
      };
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
    <div className="background">
      <div id="lottie-container" className="logo"></div>
      <div className="buttons">
        <button className="google_btn" onClick={clickGoogleLogin}>
          <img src={googleLogo} alt="" />
          <span>Google 로그인</span>
        </button>
        <a className="non_members" href="#" onClick={clickNonMembers}>
          비회원 이용하기
        </a>
      </div>
    </div>
  );
};

export default Login; 