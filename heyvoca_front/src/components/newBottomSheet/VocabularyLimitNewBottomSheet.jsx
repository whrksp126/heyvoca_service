import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useNewFullSheet } from '../../hooks/useNewFullSheet';
import StoreNewFullSheet from '../newFullSheet/StoreNewFullSheet';
import { vibrate } from '../../utils/osFunction';

export const VocabularyLimitNewBottomSheet = () => {
    const { resolveNewBottomSheet, closeNewBottomSheet } = useNewBottomSheetActions();
    const { pushNewFullSheet } = useNewFullSheet();
    const navigate = useNavigate();

    const handleCancel = () => {
        vibrate({ duration: 5 });
        resolveNewBottomSheet(false);
    };

    const handleGoToStore = () => {
        vibrate({ duration: 5 });
        closeNewBottomSheet();
        pushNewFullSheet(StoreNewFullSheet, {}, {
            smFull: true,
            closeOnBackdropClick: true
        });
    };

    return (
        <div className="flex flex-col items-center gap-[30px] p-[20px] pt-[40px] pb-[20px] bg-layout-white dark:bg-layout-black">
            {/* Header Info */}
            <div className="flex flex-col items-center justify-center gap-[15px] w-full text-center">
                <p className="text-[18px] font-bold text-layout-black dark:text-layout-white tracking-[-0.36px]">
                    추가 가능 단어장이 부족해요😢
                </p>
                <p className="text-[14px] font-normal text-layout-black dark:text-[#eee] tracking-[-0.28px]">
                    상점에서 단어장을 구매하세요.
                </p>
            </div>

            {/* Buttons */}
            <div className="flex gap-[15px] w-full">
                <motion.button
                    className="
            flex-[1] h-[45px] 
            bg-layout-gray-200 dark:bg-layout-gray-500 
            rounded-[8px] 
            flex items-center justify-center
          "
                    onClick={handleCancel}
                    whileTap={{ scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 500, damping: 15 }}
                >
                    <span className="text-[16px] font-bold text-layout-white tracking-[-0.32px]">
                        취소
                    </span>
                </motion.button>
                <motion.button
                    className="
            flex-[1] h-[45px] 
            bg-primary-main-600 
            rounded-[8px] 
            flex items-center justify-center
          "
                    onClick={handleGoToStore}
                    whileTap={{ scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 500, damping: 15 }}
                >
                    <span className="text-[16px] font-bold text-layout-white tracking-[-0.32px]">
                        상점 열기
                    </span>
                </motion.button>
            </div>
        </div>
    );
};
