import React from 'react';

/**
 * 학습장 헤더 — 찾기 탭(components/dictionary/Header.jsx)·상점 탭과 같은 규격이다.
 * 제목만 가운데 두고, 같은 높이(--current-header-height)·같은 패딩을 쓴다.
 * 예전에는 "{닉네임}의 단어장"을 좌측 정렬로 보여줬는데, 바텀 탭 두 번째 자리의 제목이
 * 다른 4탭과 다른 규격이라 통일한다(닉네임 문구는 뺀다 — 다른 탭 헤더 어디에도 없다).
 */
const Header = () => (
  <div
    data-page-header
    className='
    relative
    flex items-center justify-center
    w-full h-[var(--current-header-height)]
    overflow-hidden
    px-[16px]
    bg-layout-white
    dark:bg-layout-black
  '>
    <div className="center">
      <h2 className="text-[16px] font-[700]">학습장</h2>
    </div>
  </div>
);

export default Header;
