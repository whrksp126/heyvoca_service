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
const NAV_ITEMS = [
  { path: '/home', label: '홈', icon: navHome, lockKey: null },
  { path: '/vocabulary-sheets', label: '단어장', icon: navVocabulary, lockKey: 'vocabook' },
  { path: '/dictionary', label: '사전', icon: navDictionary, lockKey: 'dict' },
  { path: '/book-store', label: '상점', icon: navStore, lockKey: 'store' },
  { path: '/mypage', label: '마이페이지', icon: navMypage, lockKey: null },
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
                  {/* 꺼진 탭은 회색 아이콘을 따로 두지 않고 같은 그림을 탈색해서 쓴다.
                      투명도만 낮추면 크림색 면이 흰 배경에 녹아 사라지므로 밝기를 함께 떨어뜨린다. */}
                  <img
                    src={item.icon}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    className={`w-[27px] h-[27px] object-contain select-none ${
                      active ? '' : 'grayscale brightness-[.72] dark:brightness-[.62]'
                    }`}
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
