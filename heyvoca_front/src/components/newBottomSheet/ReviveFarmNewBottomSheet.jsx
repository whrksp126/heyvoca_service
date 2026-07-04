import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { vibrate } from '../../utils/osFunction';
import PlantIllustration from '../common/PlantIllustration';
import { reviveFarmApi, buyReviveApi } from '../../api/game';
import { useUser } from '../../context/UserContext';
import gemImg from '../../assets/images/gem.png';

/**
 * 죽은 단어 부활 팝업.
 * - 부활템 보유 시: 1개 사용해 부활.
 * - 부족 시: 보석으로 구매(1보석=5개) 유도.
 * pushAwaitNewBottomSheet로 호출 → { revived: true, user_voca_id } | { cancelled: true }
 */
const ReviveFarmNewBottomSheet = ({ plant, reviveItemCnt = 0, gemCnt = 0 }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { resolveNewBottomSheet } = useNewBottomSheetActions();
  const { setUserProfile } = useUser();

  const [items, setItems] = useState(reviveItemCnt);
  const [gems, setGems] = useState(gemCnt);
  const [busy, setBusy] = useState(false);

  const hasItem = items >= 1;
  const canBuy = gems >= 1;

  const handleRevive = async () => {
    if (busy || !hasItem) return;
    vibrate({ duration: 5 });
    setBusy(true);
    try {
      const res = await reviveFarmApi(plant.user_voca_id);
      if (res?.code === 200) {
        setUserProfile((prev) => (prev ? { ...prev, revive_item_cnt: res.data.revive_item_cnt } : prev));
        resolveNewBottomSheet({ revived: true, user_voca_id: plant.user_voca_id });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleBuy = async () => {
    if (busy || !canBuy) return;
    vibrate({ duration: 5 });
    setBusy(true);
    try {
      const res = await buyReviveApi();
      if (res?.code === 200) {
        setItems(res.data.revive_item_cnt);
        setGems(res.data.gem_cnt);
        setUserProfile((prev) =>
          prev ? { ...prev, gem_cnt: res.data.gem_cnt, revive_item_cnt: res.data.revive_item_cnt } : prev
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-[18px] p-[20px] pb-[28px]">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 18 }}
      >
        <PlantIllustration stage={plant.stage} wilt="dead" size={72} />
      </motion.div>

      <div className="flex flex-col items-center gap-[6px]">
        <h1 className="text-[18px] font-[800] text-layout-black dark:text-layout-white">
          '{plant.word}'가 죽었어요
        </h1>
        <p className="text-[13px] font-[400] text-layout-gray-300 text-center">
          부활템을 사용하면 단어를 되살려 다시 키울 수 있어요.
        </p>
      </div>

      <div className="flex flex-col w-full gap-[10px]">
        {hasItem ? (
          <motion.button
            type="button"
            onClick={handleRevive}
            whileTap={{ scale: 0.97 }}
            disabled={busy}
            className="flex items-center justify-center gap-[6px] w-full py-[14px] rounded-[8px] bg-primary-main-600 text-layout-white text-[16px] font-[700] disabled:opacity-40"
          >
            부활템으로 되살리기
          </motion.button>
        ) : (
          <motion.button
            type="button"
            onClick={handleBuy}
            whileTap={canBuy ? { scale: 0.97 } : undefined}
            disabled={busy || !canBuy}
            className="flex items-center justify-center gap-[6px] w-full py-[14px] rounded-[8px] bg-primary-main-600 text-layout-white text-[16px] font-[700] disabled:opacity-40"
          >
            <img src={gemImg} alt="보석" className="w-[18px] h-[16px]" />
            1개로 부활템 5개 사기
          </motion.button>
        )}
        <motion.button
          type="button"
          onClick={() => { vibrate({ duration: 5 }); resolveNewBottomSheet({ cancelled: true }); }}
          whileTap={{ scale: 0.97 }}
          className="w-full py-[14px] rounded-[8px] bg-layout-gray-50 dark:bg-layout-gray-dark text-[15px] font-[600] text-layout-gray-400 dark:text-layout-gray-200"
        >
          나중에 할게요
        </motion.button>
        <p className="text-center text-[12px] font-[400] text-layout-gray-300">
          부활템 {items}개 · 보석 {gems}개
        </p>
      </div>
    </div>
  );
};

export default ReviveFarmNewBottomSheet;
