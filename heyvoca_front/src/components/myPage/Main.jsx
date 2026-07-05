import React from 'react';
import { CaretRight, EnvelopeSimple } from "@phosphor-icons/react";
import { motion } from 'framer-motion';
import { useUser } from '../../context/UserContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { vibrate } from '../../utils/osFunction';

import AccountNewFullSheet from '../newfullsheet/AccountNewFullSheet';
import GemNewFullSheet from '../newfullsheet/GemNewFullSheet';
import InviteHistoryNewFullSheet from '../newfullsheet/InviteHistoryNewFullSheet';
import ReviewScheduleContent from './ReviewScheduleContent';
import gemImg from '../../assets/images/gem.png';

const Main = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { userProfile } = useUser();
  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { pushNewFullSheet } = useNewFullSheetActions();

  const openSheet = (Component) => {
    vibrate({ duration: 5 });
    pushNewFullSheet(Component, {}, {
      smFull: true,
      closeOnBackdropClick: true
    });
  };

  return (
    <motion.main
      className="flex-grow"
      initial={{ opacity: 0, y: 20, transition: { duration: 0.2 } }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.2 } }}
      exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
    >
      <div className="flex flex-col gap-[16px] px-[16px] py-[20px]">
        {/* 프로필 카드 → 계정 시트 */}
        <div
          onClick={() => openSheet(AccountNewFullSheet)}
          className="flex items-center justify-between p-[20px] rounded-[12px] bg-layout-gray-50 dark:bg-layout-gray-dark"
        >
          <div className="flex flex-col gap-[2px] min-w-0">
            <span className="text-[18px] font-[800] text-layout-black dark:text-layout-white truncate">
              {userProfile?.username || '닉네임을 설정해주세요'}
            </span>
            <span className="text-[13px] font-[400] text-layout-gray-300 truncate">
              {userProfile?.email || '로그인 필요'}
            </span>
          </div>
          <CaretRight className="text-[20px] text-layout-gray-300 shrink-0" />
        </div>

        {/* 보석 / 초대하기 퀵액션 */}
        <div className="grid grid-cols-2 gap-[10px]">
          <div
            onClick={() => openSheet(GemNewFullSheet)}
            className="flex items-center justify-between p-[16px] rounded-[12px] bg-layout-gray-50 dark:bg-layout-gray-dark"
          >
            <div className="flex items-center gap-[8px] min-w-0">
              <img src={gemImg} alt="보석" className="w-[20px] h-[18px] shrink-0" />
              <span className="text-[15px] font-[700] text-layout-black dark:text-layout-white">보석</span>
            </div>
            <span className="text-[14px] font-[700] text-primary-main-600 shrink-0">
              {userProfile?.gem_cnt ?? 0}
            </span>
          </div>
          <div
            onClick={() => openSheet(InviteHistoryNewFullSheet)}
            className="flex items-center justify-between p-[16px] rounded-[12px] bg-layout-gray-50 dark:bg-layout-gray-dark"
          >
            <div className="flex items-center gap-[8px] min-w-0">
              <EnvelopeSimple weight="fill" className="text-[20px] text-primary-main-600 shrink-0" />
              <span className="text-[15px] font-[700] text-layout-black dark:text-layout-white">초대하기</span>
            </div>
            <CaretRight className="text-[16px] text-layout-gray-300 shrink-0" />
          </div>
        </div>

        {/* 통계 — 풀시트로 들어가지 않고 마이페이지에서 바로 상세 표시 */}
        <div className="flex flex-col gap-[12px]">
          <h3 className="text-[15px] font-[700] text-layout-black dark:text-layout-white">통계</h3>
          <ReviewScheduleContent />
        </div>
      </div>
    </motion.main>
  );
};

export default Main;
