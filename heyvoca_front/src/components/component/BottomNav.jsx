import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Notepad, Storefront, User, House, BookBookmark, Lock } from "@phosphor-icons/react";
import { AnimatePresence, motion } from 'framer-motion';
import { vibrate } from '../../utils/osFunction';
import { getUnlockStatusApi } from '../../api/study';

// 탭 정의 — lockKey 있는 탭은 온보딩 점진 해금 대상
const NAV_ITEMS = [
  { path: '/home', label: '홈', Icon: House, lockKey: null },
  { path: '/vocabulary-sheets', label: '단어장', Icon: Notepad, lockKey: 'vocabook' },
  { path: '/dictionary', label: '사전', Icon: BookBookmark, lockKey: 'dict' },
  { path: '/book-store', label: '상점', Icon: Storefront, lockKey: 'store' },
  { path: '/mypage', label: '마이페이지', Icon: User, lockKey: null },
];

const BottomNav = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const navigate = useNavigate();
  const location = useLocation();

  const [unlock, setUnlock] = useState(null); // null=미조회(기본 전부 열림 취급)
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let alive = true;
    getUnlockStatusApi().then((res) => {
      if (alive && res?.code === 200) setUnlock(res.data);
    });
    return () => { alive = false; };
  }, []);

  const isLocked = (lockKey) => {
    if (!lockKey || !unlock || unlock.legacy) return false;
    return unlock.unlocked?.[lockKey] === false;
  };

  const remainingSessions = (lockKey) => {
    if (!unlock || !lockKey) return 0;
    const thr = unlock.thresholds?.[lockKey] ?? 0;
    return Math.max(0, thr - (unlock.completed_sessions ?? 0));
  };

  const handleTap = (item) => {
    vibrate({ duration: 5 });
    if (isLocked(item.lockKey)) {
      const n = remainingSessions(item.lockKey);
      setToast(`${item.label}은 학습 ${n}회 더 하면 열려요`);
      setTimeout(() => setToast(null), 2000);
      return;
    }
    navigate(item.path);
  };

  return (
    <footer
      data-bottom-nav
      className="fixed bottom-0 w-full border-t border-border bg-layout-white/90 dark:bg-layout-black/90 dark:border-border-dark backdrop-blur-md"
    >
      {/* 해금 안내 토스트 */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute -top-[44px] left-1/2 -translate-x-1/2 px-[14px] py-[8px] rounded-[20px] bg-layout-black/85 dark:bg-layout-white/90 whitespace-nowrap"
          >
            <span className="text-[12px] font-[600] text-layout-white dark:text-layout-black">{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <ul className="flex justify-around items-center h-[70px] max-w-md mx-auto">
        {NAV_ITEMS.map((item) => {
          const active = location.pathname === item.path;
          const locked = isLocked(item.lockKey);
          const { Icon } = item;
          const color = active ? 'text-primary-main-600' : 'text-[#999] dark:text-layout-gray-400';
          return (
            <li
              key={item.path}
              onClick={() => handleTap(item)}
              className="flex items-center justify-center flex-1 w-full h-full"
            >
              <div className={`relative flex flex-col items-center ${locked ? 'opacity-45' : ''}`}>
                <Icon weight="fill" className={`w-6 h-6 ${color}`} />
                {locked && (
                  <span className="absolute -top-[3px] -right-[7px] flex items-center justify-center w-[14px] h-[14px] rounded-full bg-layout-gray-300 dark:bg-layout-gray-400">
                    <Lock size={8} weight="bold" className="text-layout-white" />
                  </span>
                )}
                <span className={`text-[10px] mt-1 ${active ? 'text-primary-main-600 font-bold' : 'text-[#999] dark:text-layout-gray-400'}`}>
                  {item.label}
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
