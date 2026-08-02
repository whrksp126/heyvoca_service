import React from 'react';
import BottomNav from '../components/component/BottomNav';
import StoreNewFullSheet from '../components/newfullsheet/StoreNewFullSheet';

// 상점 — 단어장 · 농장 도구 · 보석 3탭 (시안 shop.txt §1).
//
// 바텀 네비의 "상점" 탭이 도착하는 화면이다. 이전에는 서점 1탭(components/bookStore/*)이
// 여기 걸려 있어서 시안이 정한 3탭 상점이 네비에서 아예 도달하지 않았다.
// 화면 본체는 홈·마이·단어장 한도에서 풀시트로도 열리는 StoreNewFullSheet 하나를 그대로 쓴다
// — 같은 상점이 두 벌 존재하면 규격이 갈린다. asPage 는 뒤로가기를 지우고
// 바텀 네비 높이만큼 아래 여백을 준다(상단 status bar 여백은 시트가 이미 갖고 있다).
const BookStore = () => {
  return (
    <>
      <StoreNewFullSheet asPage />
      <BottomNav />
    </>
  );
};

export default BookStore;
