import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useUser } from '../../context/UserContext';
import { purchaseBookApi } from '../../api/store';
import { StorePurchaseResultNewBottomSheet } from './StorePurchaseResultNewBottomSheet';
import gem from '../../assets/images/gem.png';
import { vibrate } from '../../utils/osFunction';

export const StoreBuyBookNewBottomSheet = ({ options }) => {
    "use memo";
    const { popNewBottomSheet, openNewBottomSheet } = useNewBottomSheetActions();
    const { userProfile, setUserProfile } = useUser();
    const [isLoading, setIsLoading] = useState(false);

    const { packageType, packageName, cost, amount, image } = options;

    const handleBuy = async () => {
        vibrate({ duration: 5 });
        if (userProfile.gem_cnt < cost) {
            // 보석 부족 결과 표시 - 기존 스택을 대체하여 확인 창이 남지 않도록 함
            openNewBottomSheet(
                StorePurchaseResultNewBottomSheet,
                {
                    options: {
                        success: false,
                        message: '보석이 부족해요!\n보석을 먼저 충전해 볼까요?',
                        image: gem
                    }
                }
            );
            return;
        }

        setIsLoading(true);
        try {
            const result = await purchaseBookApi(packageType);
            if (result && result.code === 200) {
                // 유저 정보 업데이트
                setUserProfile(prev => ({
                    ...prev,
                    gem_cnt: result.data.gem_cnt,
                    book_cnt: result.data.book_cnt
                }));

                // 성공 결과 표시 - 기존 스택을 대체하여 확인 창이 남지 않도록 함
                openNewBottomSheet(
                    StorePurchaseResultNewBottomSheet,
                    {
                        options: {
                            success: true,
                            packageName: packageName,
                            image: image
                        }
                    }
                );
            } else {
                alert(result?.message || '구매 중 오류가 발생했습니다.');
            }
        } catch (error) {
            console.error('구매 오류:', error);
            alert('서버 오류가 발생했습니다.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-[30px] items-center pt-[40px] pb-[20px] px-[20px] relative">
            {/* 타이틀 구역 */}
            <div className="w-full flex flex-col items-center justify-center">
                <h1 className="text-[18px] font-bold leading-[1.4] text-[#111] dark:text-[#fff] text-center tracking-[-0.36px]">
                    {packageName}를 구매할까요?
                </h1>
            </div>

            {/* 버튼 구역 */}
            <div className="w-full flex gap-[15px] items-start">
                <motion.button
                    onClick={() => {
                        vibrate({ duration: 5 });
                        popNewBottomSheet();
                    }}
                    className="flex-1 h-[45px] rounded-[8px] bg-[#ccc] text-white font-bold text-[16px] tracking-[-0.32px] flex items-center justify-center"
                    whileTap={{ scale: 0.95 }}
                >
                    취소
                </motion.button>
                <motion.button
                    onClick={handleBuy}
                    disabled={isLoading}
                    className="flex-1 h-[45px] rounded-[8px] bg-primary-main-600 text-white font-bold text-[16px] tracking-[-0.32px] flex items-center justify-center gap-[3px]"
                    whileTap={{ scale: 0.95 }}
                >
                    {isLoading ? (
                        <div className="animate-spin rounded-full h-[20px] w-[20px] border-b-2 border-white"></div>
                    ) : (
                        <>
                            <img src={gem} alt="heart" className="w-[20px] h-[18px]" />
                            {cost}개로 구매
                        </>
                    )}
                </motion.button>
            </div>
        </div>
    );
};
