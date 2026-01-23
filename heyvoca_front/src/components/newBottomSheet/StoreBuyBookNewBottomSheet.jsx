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
                        message: '보석이 부족합니다.',
                        image: image
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
        <div className="">
            <div className="
        flex flex-col gap-[30px]
        max-h-[calc(90vh-47px)] h-full
        p-[20px] pt-[40px] pb-[105px]
        overflow-y-auto
        items-center
      ">
                <div className="flex flex-col items-center gap-[15px] pt-[20px]">
                    <h1 className="text-[20px] font-[700] text-[#111] dark:text-[#fff]">
                        {packageName}를 구매할까요?
                    </h1>
                    <img src={image} alt={packageName} className="w-[120px] h-[120px] object-contain" />
                </div>
            </div>

            <div className="
        absolute bottom-0 left-0 right-0
        flex items-center justify-between gap-[15px] p-[20px]
        bg-[#fff]/80 backdrop-blur-[1px]
      ">
                <motion.button
                    onClick={() => {
                        vibrate({ duration: 5 });
                        popNewBottomSheet();
                    }}
                    className="flex-1 h-[45px] rounded-[8px] bg-[#E9E9E9] text-[#777] font-[700] text-[16px]"
                    whileTap={{ scale: 0.95 }}
                >
                    취소
                </motion.button>
                <motion.button
                    onClick={handleBuy}
                    disabled={isLoading}
                    className="flex-1 h-[45px] rounded-[8px] bg-[#FF8DD4] text-[#fff] font-[700] text-[16px] flex items-center justify-center gap-[8px]"
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
