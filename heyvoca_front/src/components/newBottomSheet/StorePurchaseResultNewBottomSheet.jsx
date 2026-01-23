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
        <div className="">
            <div className="
        flex flex-col gap-[30px]
        max-h-[calc(90vh-47px)] h-full
        p-[20px] pt-[40px] pb-[105px]
        overflow-y-auto
        items-center
      ">
                <div className="flex flex-col items-center gap-[20px] pt-[30px]">
                    <img src={image} alt="result" className="w-[120px] h-[120px] object-contain grayscale-[0.2]" />
                    <h1 className="text-[20px] font-[700] text-[#111] dark:text-[#fff] text-center whitespace-pre-line">
                        {success ? (
                            <>
                                <span className="text-[#FF8DD4]">{packageName}</span> 구매 완료!
                            </>
                        ) : (
                            message || '구매를 처리할 수 없습니다.'
                        )}
                    </h1>
                </div>
            </div>

            <div className="
        absolute bottom-0 left-0 right-0
        flex items-center justify-between gap-[15px] p-[20px]
        bg-[#fff]/80 backdrop-blur-[1px]
      ">
                <motion.button
                    onClick={success ? handleGoToVoca : popNewBottomSheet}
                    className="w-full h-[45px] rounded-[8px] bg-[#FF8DD4] text-[#fff] font-[700] text-[16px]"
                    whileTap={{ scale: 0.95 }}
                >
                    {success ? '내 단어장 바로가기' : '확인'}
                </motion.button>
            </div>
        </div>
    );
};
