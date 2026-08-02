import React from 'react';
import { motion } from 'framer-motion';
import { Warning } from '@phosphor-icons/react';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { vibrate } from '../../utils/osFunction';
import gem from '../../assets/images/gem.png';

/**
 * 탈퇴 확인 — 숫자로 말한다 (시안 설정 1절 ⑤, 4절).
 * "모든 데이터"는 추상적이라 실제로 얼마나 큰지 가늠이 안 된다.
 * 812 · 3 · 58일이라고 적으면 정말 지울 사람은 그대로 지우고, 잘못 누른 사람만 멈춘다.
 * 겁을 주려는 게 아니라 정확히 말하려는 것이다.
 */
export const WithdrawNewBottomSheet = ({
  plants, golden, streakCurrent, streakBest, tools, gem: gemCnt,
}) => {
  "use memo";
  const { resolveNewBottomSheet } = useNewBottomSheetActions();

  const handleClose = () => resolveNewBottomSheet(false);
  const handleConfirm = () => resolveNewBottomSheet(true);

  const rows = [
    plants !== undefined && ['기른 작물', `${plants}개`],
    golden !== undefined && ['황금 당근', `${golden}개`],
    streakBest !== undefined && ['연속 학습 기록', `${streakCurrent ?? 0}일 · 최고 ${streakBest}일`],
  ].filter(Boolean);

  return (
    <div className="flex flex-col px-[20px] pt-[6px] pb-[20px] bg-layout-white dark:bg-layout-black">
      {/* 결과 머리 */}
      <div className="text-center">
        <div className="w-[84px] h-[84px] mx-auto mt-[2px] mb-[14px] rounded-full flex items-center justify-center bg-status-error-100 dark:bg-status-error-dark">
          <Warning size={32} className="text-[#F04438]" />
        </div>
        <h3 className="text-[19px] font-[800] leading-[1.35] tracking-[-0.04em] text-layout-black dark:text-layout-white">
          정말 농장을 접으시겠어요?
        </h3>
        <p className="mt-[8px] text-[12.5px] leading-[1.6] tracking-[-0.02em] text-layout-gray-400 dark:text-layout-gray-300">
          탈퇴하면 아래 기록이 <b className="font-[700]">모두 사라지고<br />되돌릴 수 없어요.</b>
        </p>
      </div>

      {/* 사라지는 것 — 숫자로 */}
      <div className="mt-[14px] px-[14px] py-[12px] rounded-[12px] bg-[#FAFAFA] dark:bg-layout-gray-dark">
        {rows.map(([k, v], idx) => (
          <div key={k} className={`flex items-center gap-[8px] text-[12.5px] tracking-[-0.02em] ${idx === 0 ? '' : 'mt-[8px]'}`}>
            <span className="flex-1 font-[600] text-layout-gray-400 dark:text-layout-gray-300">{k}</span>
            <span className="font-[800] text-layout-black dark:text-layout-white">{v}</span>
          </div>
        ))}
        <div className={`flex items-center gap-[8px] text-[12.5px] tracking-[-0.02em] ${rows.length ? 'mt-[8px]' : ''}`}>
          <span className="flex-1 font-[600] text-layout-gray-400 dark:text-layout-gray-300">남은 보석 · 도구</span>
          <span className="flex items-center gap-[4px] font-[800] text-layout-black dark:text-layout-white">
            <img src={gem} alt="보석" className="w-[14px] h-[13px]" />
            {gemCnt ?? 0}
            {tools !== undefined && ` · ${tools}개`}
          </span>
        </div>
      </div>

      {/* 환불되지 않는다는 사실은 반드시 적는다 (시안 4절) */}
      <div className="flex gap-[8px] mt-[12px] px-[11px] py-[10px] rounded-[10px] text-[11.5px] leading-[1.55] tracking-[-0.02em] bg-secondary-yellow-100 dark:bg-secondary-yellow-dark text-[#B54708] dark:text-[#FDB022]">
        <Warning size={13} className="shrink-0 mt-[1px] text-[#FB6514]" />
        <span>
          남은 보석과 도구는 <b className="font-[700]">환불되지 않아요.</b> 같은 계정으로 다시 가입해도 복구되지 않아요.
        </span>
      </div>

      <div className="flex gap-[10px] mt-[16px]">
        <motion.button
          className="flex-1 h-[48px] rounded-[10px] bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-gray-400 dark:text-layout-gray-200 text-[15px] font-[700]"
          onClick={() => { vibrate({ duration: 5 }); handleClose(); }}
          whileTap={{ scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 500, damping: 15 }}
        >
          취소
        </motion.button>
        <motion.button
          className="flex-1 h-[48px] rounded-[10px] bg-[#F04438] text-layout-white text-[15px] font-[700]"
          onClick={() => { vibrate({ duration: 5 }); handleConfirm(); }}
          whileTap={{ scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 500, damping: 15 }}
        >
          탈퇴하기
        </motion.button>
      </div>
    </div>
  );
};
