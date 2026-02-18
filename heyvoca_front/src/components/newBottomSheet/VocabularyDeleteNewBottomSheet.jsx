import React, { useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNewBottomSheet } from '../../hooks/useNewBottomSheet';
import { vibrate } from '../../utils/osFunction';
import { useVocabulary } from '../../context/VocabularyContext';

/**
 * 전용 호출 훅
 */
export const useVocabularyDeleteNewBottomSheet = () => {
    const { pushAwaitNewBottomSheet } = useNewBottomSheet();
    const { deleteVocabularySheet } = useVocabulary();

    const showVocabularyDeleteNewBottomSheet = useCallback(async (id) => {
        if (!id) return;

        const result = await pushAwaitNewBottomSheet(
            VocabularyDeleteNewBottomSheet,
            {},
            { isBackdropClickClosable: true, isDragToCloseEnabled: true }
        );

        if (result) {
            try {
                await deleteVocabularySheet(id);
                return true;
            } catch (error) {
                console.error('단어장 삭제 실패:', error);
                return false;
            }
        }
        return false;
    }, [pushAwaitNewBottomSheet, deleteVocabularySheet]);

    return { showVocabularyDeleteNewBottomSheet };
};

/**
 * 바텀시트 UI 컴포넌트
 */
export const VocabularyDeleteNewBottomSheet = () => {
    const { resolveNewBottomSheet } = useNewBottomSheet();

    const handleConfirm = () => {
        vibrate({ duration: 5 });
        resolveNewBottomSheet(true);
    };

    const handleCancel = () => {
        vibrate({ duration: 5 });
        resolveNewBottomSheet(false);
    };

    return (
        <div className="flex flex-col">
            <div className="flex flex-col gap-[15px] items-center justify-center pt-[40px] px-[20px] pb-[10px]">
                <h3 className="text-[18px] font-bold text-[#111] dark:text-[#fff]">
                    단어장을 정말 삭제하시겠어요?
                </h3>
                <p className="text-[14px] font-normal text-[#666] dark:text-[#999]">
                    삭제 후에는 복구가 불가능해요 😢
                </p>
            </div>

            <div className="flex items-center justify-between gap-[15px] p-[20px]">
                <motion.button
                    className="flex-1 h-[45px] rounded-[8px] bg-[#ccc] text-white text-[16px] font-bold"
                    onClick={handleCancel}
                    whileTap={{ scale: 0.95 }}
                >
                    취소
                </motion.button>
                <motion.button
                    className="flex-1 h-[45px] rounded-[8px] bg-primary-main-600 text-white text-[16px] font-bold"
                    onClick={handleConfirm}
                    whileTap={{ scale: 0.95 }}
                >
                    삭제
                </motion.button>
            </div>
        </div>
    );
};
