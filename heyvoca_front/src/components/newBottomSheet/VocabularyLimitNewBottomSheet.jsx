import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useNewFullSheet } from '../../hooks/useNewFullSheet';
import StoreNewFullSheet from '../newfullsheet/StoreNewFullSheet';
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
                    추가 가능 단어장이 부족해요
                </p>
                <p className="text-[14px] font-normal text-layout-black dark:text-layout-gray-100 tracking-[-0.28px]">
                    상점에서 단어장을 구매하세요.
                </p>
            </div>

            {/* Buttons */}
            <div className="flex gap-[15px] w-full">
                <motion.button
                    className="
            flex-[1] h-[52px] 
            rounded-[12px] 
            flex items-center justify-center
            border-[2px] border-border dark:border-border-dark bg-layout-white dark:bg-layout-black text-layout-gray-400 dark:text-layout-gray-100"
                    onClick={handleCancel}
                    whileTap={{ scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 500, damping: 15 }}
                >
                    {/* 글자색은 버튼이 정한다 — 면을 걷어낸 외곽선 형이라 흰 글자면 안 보인다 */}
                    <span className="text-[16px] font-bold tracking-[-0.03em]">
                        취소
                    </span>
                </motion.button>
                <motion.button
                    className="
            flex-[1] h-[52px] 
            bg-primary-main-600 
            rounded-[12px] 
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
