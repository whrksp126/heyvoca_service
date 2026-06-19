import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Minus, Plus } from '@phosphor-icons/react';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useUser } from '../../context/UserContext';
import { purchaseBookApi } from '../../api/store';
import { StorePurchaseResultNewBottomSheet } from './StorePurchaseResultNewBottomSheet';
import { GemPurchaseNewBottomSheet } from './GemPurchaseNewBottomSheet';
import gem from '../../assets/images/gem.png';
import voca_1 from '../../assets/images/voca_book_1.png';
import { vibrate } from '../../utils/osFunction';

const PRICE_PER_BOOK = 3;
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 100;

export const BuyEmptyBookNewBottomSheet = () => {
  "use memo";

  const { popNewBottomSheet, openNewBottomSheet } = useNewBottomSheetActions();
  const { userProfile, setUserProfile } = useUser();

  const [count, setCount] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  const longPressIntervalRef = useRef(null);
  const longPressTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (longPressIntervalRef.current) clearInterval(longPressIntervalRef.current);
      if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);
    };
  }, []);

  const totalCost = count * PRICE_PER_BOOK;

  const handleLongPressStart = useCallback((delta) => {
    if (longPressIntervalRef.current) clearInterval(longPressIntervalRef.current);
    if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);

    setCount((prev) => {
      const next = prev + delta;
      if (next < MIN_AMOUNT) return MIN_AMOUNT;
      if (next > MAX_AMOUNT) return MAX_AMOUNT;
      vibrate({ duration: 5 });
      return next;
    });

    longPressTimeoutRef.current = setTimeout(() => {
      longPressIntervalRef.current = setInterval(() => {
        setCount((prev) => {
          const next = prev + delta;
          if (next < MIN_AMOUNT) return MIN_AMOUNT;
          if (next > MAX_AMOUNT) return MAX_AMOUNT;
          vibrate({ duration: 5 });
          return next;
        });
      }, 100);
    }, 500);
  }, []);

  const handleLongPressEnd = useCallback(() => {
    if (longPressIntervalRef.current) {
      clearInterval(longPressIntervalRef.current);
      longPressIntervalRef.current = null;
    }
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  }, []);

  const handleBuy = async () => {
    vibrate({ duration: 5 });

    if (userProfile.gem_cnt < totalCost) {
      // 보석 부족 → 현재 구매 시트를 보석 구매 바텀시트로 교체
      openNewBottomSheet(GemPurchaseNewBottomSheet, {
        notice: '보석이 부족해요!\n보석을 먼저 충전해 볼까요?',
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await purchaseBookApi(count);
      if (result && result.code === 200) {
        setUserProfile((prev) => ({
          ...prev,
          gem_cnt: result.data.gem_cnt,
          book_cnt: result.data.book_cnt,
        }));

        openNewBottomSheet(StorePurchaseResultNewBottomSheet, {
          options: {
            success: true,
            packageName: `빈 단어장 ${count}개`,
            image: voca_1,
          },
        });
      } else {
        alert(result?.message || '구매 중 오류가 발생했습니다.');
      }
    } catch (error) {
      console.error('빈 단어장 구매 오류:', error);
      alert('서버 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const isMin = count <= MIN_AMOUNT;
  const isMax = count >= MAX_AMOUNT;

  return (
    <div className="flex flex-col gap-[30px] items-center pt-[40px] pb-[20px] px-[20px] relative">
      {/* 타이틀 */}
      <div className="w-full flex flex-col items-center justify-center gap-[10px]">
        <h1 className="text-[18px] font-bold leading-[1.4] text-layout-black dark:text-layout-white text-center tracking-[-0.36px]">
          '빈 단어장' 을 구매하시겠어요?
        </h1>
        <p className="text-[14px] font-[500] leading-[1.5] text-layout-gray-200 text-center whitespace-pre-line">
          {`'빈 단어장'에는 단어가 들어있지 않아요.\n나만의 단어장을 만들어 보세요! 😎`}
        </p>
      </div>

      {/* 수량 카운터 */}
      <div className="flex flex-col gap-[15px] w-full">
        <p className="text-[14px] font-[600] text-layout-black dark:text-layout-white text-center">
          단어장 개수
        </p>
        <div className="flex items-center justify-center gap-[16px]">
          <motion.button
            type="button"
            className={`
              flex items-center justify-center w-[40px] h-[40px]
              border-[1px] rounded-[8px] select-none touch-none
              ${isMin
                ? 'border-layout-gray-200 text-layout-gray-200'
                : 'border-primary-main-600 text-primary-main-600'
              }
            `}
            onPointerDown={(e) => { e.stopPropagation(); handleLongPressStart(-1); }}
            onPointerUp={handleLongPressEnd}
            onPointerCancel={handleLongPressEnd}
            onPointerLeave={handleLongPressEnd}
            drag={false}
            style={{ touchAction: 'none' }}
          >
            <Minus size={18} />
          </motion.button>

          <span className="w-[80px] text-center text-[28px] font-[700] text-primary-main-600">
            {count}
          </span>

          <motion.button
            type="button"
            className={`
              flex items-center justify-center w-[40px] h-[40px]
              border-[1px] rounded-[8px] select-none touch-none
              ${isMax
                ? 'border-layout-gray-200 text-layout-gray-200'
                : 'border-primary-main-600 text-primary-main-600'
              }
            `}
            onPointerDown={(e) => { e.stopPropagation(); handleLongPressStart(1); }}
            onPointerUp={handleLongPressEnd}
            onPointerCancel={handleLongPressEnd}
            onPointerLeave={handleLongPressEnd}
            drag={false}
            style={{ touchAction: 'none' }}
          >
            <Plus size={18} />
          </motion.button>
        </div>
      </div>

      {/* 버튼 */}
      <div className="w-full flex gap-[15px] items-start">
        <motion.button
          onClick={() => { vibrate({ duration: 5 }); popNewBottomSheet(); }}
          className="flex-1 h-[45px] rounded-[8px] bg-layout-gray-200 text-layout-white dark:text-layout-black font-bold text-[16px] flex items-center justify-center"
          whileTap={{ scale: 0.95 }}
        >
          취소
        </motion.button>
        <motion.button
          onClick={handleBuy}
          disabled={isLoading}
          className="flex-1 h-[45px] rounded-[8px] bg-primary-main-600 text-layout-white font-bold text-[16px] flex items-center justify-center gap-[3px]"
          whileTap={{ scale: 0.95 }}
        >
          {isLoading ? (
            <div className="animate-spin rounded-full h-[20px] w-[20px] border-b-2 border-white"></div>
          ) : (
            <>
              <img src={gem} alt="보석" className="w-[20px] h-[18px]" />
              {totalCost}개로 구매
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
};
