import React from 'react';
import { useUser } from '../../context/UserContext';

/**
 * 단어장 목록 헤더 — 제목만 둔다.
 *
 * 여기에 있던 두 아이콘을 모두 내렸다.
 *   ＋ 만들기 — 목록 맨 아래 "단어장 만들기" 버튼과 **같은 일을 하는 두 번째 입구**였다.
 *                시안(vocabooks §1①)이 그리는 자리는 목록 끝이라 그쪽을 남긴다.
 *                맨 아래 버튼은 카드 흐름의 끝에 붙어 "여기서 더 만들 수 있다"를 말하지만,
 *                헤더의 ＋는 목록을 보기도 전에 같은 말을 미리 한다.
 *   ✎ 편집   — 단어장 하나의 이름·색을 고치는 일인데, 목록 화면에서 누르면 "무엇을
 *                고칠지"부터 다시 골라야 했다. 그 단어장을 이미 열어 둔 자리(단어 목록
 *                풀시트)에 두면 고를 필요가 없다 → VocabularyWordsNewFullSheet 로 옮겼다.
 */
const Header = () => {
  "use memo";

  const { userProfile } = useUser();

  return (
    <div
      data-page-header
      className='
      flex items-center
      w-full h-[55px]
      px-[16px] py-[14px]
      bg-layout-white
      dark:bg-layout-black
    '>
      <h2 className="text-[16px] font-[400] text-[#000] dark:text-layout-white">
        <strong className="text-primary-main-600 font-[700]">{userProfile.username}</strong>의 단어장
      </h2>
    </div>
  );
};

export default Header;
