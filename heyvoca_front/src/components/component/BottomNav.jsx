import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Lock } from "@phosphor-icons/react";
import { vibrate } from '../../utils/osFunction';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useOnboardingUnlock } from '../../context/OnboardingUnlockContext';
import { UnlockGuideNewBottomSheet } from '../newBottomSheet/UnlockGuideNewBottomSheet';
import navHome from '../../assets/images/farm/home.png';
import navVocabulary from '../../assets/images/farm/vocabulary.png';
import navDictionary from '../../assets/images/farm/dictionary.png';
import navStore from '../../assets/images/farm/store.png';
import navMypage from '../../assets/images/farm/mypage.png';

// 탭 정의 — lockKey 있는 탭은 온보딩 점진 해금 대상
// 라벨은 화면에 그리지 않는다(아이콘이 곧 그 탭의 사물이라 같은 말이 두 번 된다).
// 스크린리더·툴팁 용도로만 남긴다.
//
// 시안 §10 화면 구조 — "농장 · 단어장 · 찾기 · 상점 · 마이"
//   기존 5탭 유지. 첫 탭은 "홈" → "농장", 셋째 탭은 "사전" → "찾기".
// 바뀐 것은 탭 이름뿐이고 경로는 그대로다.
//   /home     — 시안이 "홈(= 농장)"이라 부르는 그 화면 자체.
//               (구 /farm 농장 상세 화면은 시안에 없어 제거됐다 — App.jsx 에서 /home 으로 넘긴다)
//   /dictionary — 찾기는 기존 사전 탭을 다시 그린 것(시안 찾기 1절)이라 같은 화면이다.
// lockKey('dict' 등)는 온보딩 해금 키라서 이름과 무관하게 유지한다.
const NAV_ITEMS = [
  { path: '/home', label: '농장', icon: navHome, lockKey: null },
  { path: '/vocabulary-sheets', label: '단어장', icon: navVocabulary, lockKey: 'vocabook' },
  { path: '/dictionary', label: '찾기', icon: navDictionary, lockKey: 'dict' },
  { path: '/book-store', label: '상점', icon: navStore, lockKey: 'store' },
  { path: '/mypage', label: '마이', icon: navMypage, lockKey: null },
];

const BottomNav = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const navigate = useNavigate();
  const location = useLocation();
  const { pushNewBottomSheet } = useNewBottomSheetActions();
  const { isFeatureLocked } = useOnboardingUnlock();

  const isLocked = (lockKey) => {
    if (!lockKey) return false;
    return isFeatureLocked(lockKey);
  };

  const handleTap = (item) => {
    vibrate({ duration: 5 });
    if (isLocked(item.lockKey)) {
      pushNewBottomSheet(
        UnlockGuideNewBottomSheet,
        { highlightKey: item.lockKey },
        { isBackdropClickClosable: true, isDragToCloseEnabled: true }
      );
      return;
    }
    navigate(item.path);
  };

  return (
    <footer
      data-bottom-nav
      className="fixed bottom-0 w-full border-t border-[#EEEEEE] bg-layout-white/95 dark:bg-layout-black/95 dark:border-border-dark backdrop-blur-md"
    >
      <ul className="flex justify-around items-center h-[60px] max-w-md mx-auto">
        {NAV_ITEMS.map((item) => {
          const active = location.pathname === item.path;
          const locked = isLocked(item.lockKey);
          return (
            <li
              key={item.path}
              onClick={() => handleTap(item)}
              role="button"
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              title={item.label}
              className="flex items-center justify-center flex-1 w-full h-full"
            >
              <div
                className={`flex items-center justify-center w-[46px] h-[40px] rounded-[14px] ${
                  active ? 'bg-primary-main-100 dark:bg-primary-main-dark' : ''
                }`}
              >
                <span className={`relative flex items-center justify-center ${locked ? 'opacity-45' : ''}`}>
                  {/* 아이콘은 켜짐·꺼짐에 관계없이 **제 색 그대로** 둔다.
                      예전에는 꺼진 탭을 탈색(grayscale + brightness)했는데, 이 아이콘들은
                      각자 다른 사물(밭·책·돋보기·상점·토끼)이고 색이 곧 그 사물의 표식이라
                      색을 빼면 다섯 개가 다 비슷한 회색 덩어리가 되어 무엇이 무엇인지 흐려졌다.
                      켜짐·꺼짐은 아이콘이 아니라 **뒤에 깔리는 면**(위 div 의 분홍 알약)이 말한다.
                      잠금(opacity-45)은 다른 뜻이라 그대로 둔다 — 그건 '못 쓴다'는 표시다. */}
                  <img
                    src={item.icon}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    className="w-[27px] h-[27px] object-contain select-none"
                  />
                  {locked && (
                    <span className="absolute -top-[3px] -right-[5px] flex items-center justify-center w-[14px] h-[14px] rounded-full bg-layout-gray-300 dark:bg-layout-gray-400">
                      <Lock size={8} weight="bold" className="text-layout-white" />
                    </span>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <div style={{ height: 'calc(var(--safe-area-bottom) - 20px)' }}></div>
    </footer>
  );
};

export default BottomNav;
