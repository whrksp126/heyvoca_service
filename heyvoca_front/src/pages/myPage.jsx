// src/pages/Home.js
import React from 'react';
import Header from '../components/myPage/Header';
import Main from '../components/myPage/Main';
// BottomNav는 components/TabShell.jsx가 탭 전체에 걸쳐 한 번만 그린다
// (5탭이 동시에 마운트되므로 각 페이지가 각자 그리면 5개가 겹친다).
const MyPage = () => {
  return (
    // h-screen + overflow-y-auto — 다른 4개 탭(홈·단어장·찾기·상점)은 이미 각자
    // h-screen 안에서 자체 overflow-y-auto로 스크롤한다. 마이페이지만 이 자체 스크롤이
    // 없어서 Layout.jsx의 앱 전역 .scroll-container(모든 탭이 TabShell 아래 함께 마운트된
    // 채로 공유)에 얹혀 스크롤했는데, TabShell이 탭을 오갈 때 비활성 탭을 문서 흐름에서
    // 빼버리면(position:fixed) 공유 스크롤 컨테이너의 scrollHeight가 매번 바뀌어 scrollTop이
    // 클램프되며 마이페이지로 돌아왔을 때 스크롤 위치가 날아간다. 자체 스크롤 컨테이너를
    // 두면 이 DOM 노드가 마운트된 채로 유지되는 동안 스크롤 위치도 그대로 보존된다.
    <div className="h-screen overflow-y-auto">
      {/*
        헤더 고정 — 스크롤은 본문(위 자체 스크롤 컨테이너)만 하고 헤더는 화면 위에 그대로 머문다.

        z-index 없이 DOM 순서(그리기 순서)만으로 위에 뜨는 방식은 BottomNav(맨 뒤에 렌더링)에만
        통한다. 헤더는 그 반대로 Main 보다 **먼저** 오는데, 본문(myPage/Main.jsx)의 루트가
        `<motion.main>`이라 framer-motion이 항상 transform(예: translateY(0px))을 인라인으로
        건다 — transform이 있으면 값과 무관하게 새 스택 컨텍스트가 생긴다. 그 결과 헤더(fixed,
        z-index 없음)와 Main(transform, z-index 없음)이 같은 층(z-index:auto)에서 경쟁하게 되고,
        DOM 순서상 나중에 그려지는 Main이 위로 올라와 본문 아이콘이 헤더를 덮었다.
        (BottomNav는 Main보다 뒤에 오므로 같은 문제가 없다.)

        그래서 헤더에는 명시적 z-index가 필요하다. 값은 새로 만들지 않고 기존 층위를 그대로 쓴다 —
        dictionary/Main.jsx의 스크롤-스티키 서브헤더가 이미 "본문 위, 모달류 아래" 층으로 z-20을
        쓰고 있어 그 값을 그대로 가져온다. 이 값은 풀시트(z-50, NewFullSheetProvider) · 바텀시트
        (z-[1000]/z-[1001], NewBottomSheetProvider) · 보상 오버레이(z-[9999], OverlayProvider) ·
        토스트(z-index:10000, osFunction.jsx) 보다 한참 아래라 모달류가 뜨면 항상 헤더 위로 온다.
        상태바 패딩까지 이 고정 박스 안에 같이 넣어야 스크롤해도 상태바 영역이 비지 않는다.
        Header.jsx 배경(bg-layout-white / dark:bg-layout-black)은 페이지 배경과 같은 토큰이라
        본문이 뒤로 비쳐 보이지 않는다.
      */}
      <div className="fixed top-0 left-0 right-0 z-20 w-full bg-layout-white dark:bg-layout-black">
        <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
        <Header />
      </div>
      {/* 고정 헤더가 차지하던 자리만큼 본문을 밀어내는 스페이서 — 첫 요소가 헤더에 가리지 않게 한다 */}
      <div style={{ paddingTop: 'calc(var(--status-bar-height) + 55px)' }}></div>
      <Main />
    </div>
  );
};

export default MyPage;