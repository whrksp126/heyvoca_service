import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { vibrate } from '../../utils/osFunction';

export const StorePurchaseResultNewBottomSheet = ({ options }) => {
    "use memo";
    const navigate = useNavigate();
    const { popNewBottomSheet, clearStack: clearBottomStack } = useNewBottomSheetActions();
    const { popNewFullSheet } = useNewFullSheetActions();
    const { success, packageName, message, image } = options;

    const handleGoToVoca = () => {
        vibrate({ duration: 5 });
        clearBottomStack();
        popNewFullSheet();
        navigate('/vocabulary-sheets');
    };

    return (
        <div className="flex flex-col gap-[30px] items-center pt-[40px] pb-[20px] px-[20px] relative">
            {/* 결과 아이콘 및 텍스트 구역 */}
            <div className="flex flex-col items-center gap-[10px] w-full">
                <div className="relative size-[80px] flex items-center justify-center">
                    <img
                        src={image}
                        alt="result"
                        className={`object-contain ${success ? 'w-full h-full' : 'w-[50px] h-[45px] opacity-80'}`}
                    />
                </div>
                <h1 className="text-[18px] font-bold leading-[1.4] text-[#111] dark:text-[#fff] text-center tracking-[-0.36px]">
                    {success ? (
                        <>
                            <span className="text-primary-main-600">{packageName}</span> 구매 완료!
                        </>
                    ) : (
                        <span className="whitespace-pre-line">{message || '구매를 처리할 수 없습니다.'}</span>
                    )}
                </h1>
            </div>

            {/* 버튼 구역 */}
            <div className="w-full">
                <motion.button
                    onClick={success ? handleGoToVoca : popNewBottomSheet}
                    className="w-full h-[45px] rounded-[8px] bg-primary-main-600 text-white font-bold text-[16px] tracking-[-0.32px] flex items-center justify-center"
                    whileTap={{ scale: 0.95 }}
                >
                    {success ? '내 단어장 바로가기' : '확인'}
                </motion.button>
            </div>
        </div>
    );
};
