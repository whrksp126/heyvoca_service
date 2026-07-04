import React from 'react';
import { UserCircle, CaretRight, EnvelopeSimple, EggCrack, Leaf, Plant, Carrot } from "@phosphor-icons/react";
import { motion } from 'framer-motion';
import { useUser } from '../../context/UserContext';
import { useVocabulary } from '../../context/VocabularyContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { vibrate } from '../../utils/osFunction';

import AccountNewFullSheet from '../newfullsheet/AccountNewFullSheet';
import GemNewFullSheet from '../newfullsheet/GemNewFullSheet';
import InviteHistoryNewFullSheet from '../newfullsheet/InviteHistoryNewFullSheet';
import ReviewScheduleNewFullSheet from '../newfullsheet/ReviewScheduleNewFullSheet';
import gemImg from '../../assets/images/gem.png';

const Main = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { userProfile } = useUser();
  const { memoryStats } = useVocabulary();
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
          <div className="flex items-center gap-[14px] min-w-0">
            <UserCircle weight="fill" className="text-[48px] text-primary-main-600 shrink-0" />
            <div className="flex flex-col gap-[2px] min-w-0">
              <span className="text-[18px] font-[800] text-layout-black dark:text-layout-white truncate">
                {userProfile?.username || '닉네임을 설정해주세요'}
              </span>
              <span className="text-[13px] font-[400] text-layout-gray-300 truncate">
                {userProfile?.email || '로그인 필요'}
              </span>
            </div>
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

        {/* 통계 요약 카드 → 복습 일정/분포 시트 */}
        <div className="flex flex-col gap-[10px]">
          <h3 className="text-[15px] font-[700] text-layout-black dark:text-layout-white">통계</h3>
          <div
            onClick={() => openSheet(ReviewScheduleNewFullSheet)}
            className="flex flex-col gap-[14px] p-[20px] rounded-[12px] bg-layout-gray-50 dark:bg-layout-gray-dark"
          >
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-[600] text-layout-black dark:text-layout-white">
                복습 예정 {memoryStats?.reviewDue ?? 0}개 · 오늘 {memoryStats?.dueToday ?? 0}개
              </span>
              <CaretRight className="text-[16px] text-layout-gray-300" />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-[4px]">
                <EggCrack weight="fill" className="text-[18px] text-[#9D835A]" />
                <span className="text-[13px] font-[600] text-layout-gray-400 dark:text-layout-gray-200">{memoryStats?.unlearned ?? 0}</span>
              </div>
              <div className="flex items-center gap-[4px]">
                <Leaf weight="fill" className="text-[18px] text-[#77CE4F]" />
                <span className="text-[13px] font-[600] text-layout-gray-400 dark:text-layout-gray-200">{memoryStats?.shortTerm ?? 0}</span>
              </div>
              <div className="flex items-center gap-[4px]">
                <Plant weight="fill" className="text-[18px] text-[#38CE38]" />
                <span className="text-[13px] font-[600] text-layout-gray-400 dark:text-layout-gray-200">{memoryStats?.mediumTerm ?? 0}</span>
              </div>
              <div className="flex items-center gap-[4px]">
                <Carrot weight="fill" className="text-[18px] text-[#F68300]" />
                <span className="text-[13px] font-[600] text-layout-gray-400 dark:text-layout-gray-200">{memoryStats?.longTerm ?? 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.main>
  );
};

export default Main;
