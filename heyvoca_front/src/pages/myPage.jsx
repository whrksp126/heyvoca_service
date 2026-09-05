// src/pages/Home.js
import React from 'react';
import Header from '../components/myPage/Header';
import Main from '../components/myPage/Main';
import BottomNav from '../components/component/BottomNav';
const MyPage = () => {
  return (
    <div>
      {/*
        헤더 고정 — 스크롤은 본문(.scroll-container, Layout.jsx)만 하고 헤더는 화면 위에 그대로 머문다.
        BottomNav(하단바)가 fixed + z-index 없이 그리기 순서로 본문 위에 뜨는 것과 같은 방식이라
        여기도 z-index를 새로 만들지 않는다.
        상태바 패딩까지 이 고정 박스 안에 같이 넣어야 스크롤해도 상태바 영역이 비지 않는다.
        Header.jsx 배경(bg-layout-white / dark:bg-layout-black)은 페이지 배경과 같은 토큰이라
        본문이 뒤로 비쳐 보이지 않는다.
      */}
      <div className="fixed top-0 left-0 right-0 w-full bg-layout-white dark:bg-layout-black">
        <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
        <Header />
      </div>
      {/* 고정 헤더가 차지하던 자리만큼 본문을 밀어내는 스페이서 — 첫 요소가 헤더에 가리지 않게 한다 */}
      <div style={{ paddingTop: 'calc(var(--status-bar-height) + 55px)' }}></div>
      <Main />
      <BottomNav />
    </div>
  );
};

export default MyPage;