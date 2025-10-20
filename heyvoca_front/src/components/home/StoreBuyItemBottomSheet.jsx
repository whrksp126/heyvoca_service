import React, { useCallback, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useBottomSheet } from '../../context/BottomSheetContext';
import postMessageManager from '../../utils/postMessageManager';

export const useStoreBuyItemBottomSheet = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { pushBottomSheet, handleBack } = useBottomSheet();
  const handleClose = useCallback(() => {
    handleBack();
  }, [handleBack]);

  const showStoreBuyItemBottomSheet = useCallback(({options}) => {
    pushBottomSheet(
      <StoreBuyItemBottomSheet 
        onCancel={handleClose}
        options={options}
      />,
      {
        isBackdropClickClosable: true,
        isDragToCloseEnabled: false
      }
    );
  }, [handleClose]);

  return {
    showStoreBuyItemBottomSheet
  };
};


const StoreBuyItemBottomSheet = ({onCancel, options}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [purchaseResult, setPurchaseResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // 결제 성공 콜백 등록
    const handlePurchaseSuccess = (data) => {
      console.log(`🎯 결제 성공 데이터 전체: ${JSON.stringify(data, null, 2)}`);
      
      // 실제 젬 데이터는 serverResponse.data 안에 있음
      const serverData = data.data?.serverResponse?.data;
      
      if (serverData) {
        console.log(`🎯 서버 데이터: ${JSON.stringify(serverData, null, 2)}`);
        setPurchaseResult(serverData);
        setIsLoading(false);
      } else {
        console.error('❌ serverResponse.data가 없습니다!');
        setError('결제 데이터를 받지 못했습니다.');
        setIsLoading(false);
      }
    };

    // 결제 실패 콜백 등록 (필요시)
    const handlePurchaseError = (data) => {
      console.log('결제 실패 데이터:', data);
      setError(data.data || '결제 중 오류가 발생했습니다.');
      setIsLoading(false);
    };

    // 포스트메시지 리스너 등록
    postMessageManager.setupIAPPurchaseSuccess(handlePurchaseSuccess);
    
    // 컴포넌트 언마운트 시 리스너 정리
    return () => {
      postMessageManager.removeIAPPurchaseSuccess();
    };
  }, []);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center p-[40px] gap-[20px]">
          <div className="animate-spin rounded-full h-[40px] w-[40px] border-b-2 border-[#007AFF]"></div>
          <div className="text-[16px] text-[#666]">결제 중입니다...</div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center p-[40px] gap-[20px]">
          <div className="text-[48px]">❌</div>
          <div className="text-[18px] font-[700] text-[#FF3B30]">결제 실패</div>
          <div className="text-[14px] text-[#666] text-center">{error}</div>
        </div>
      );
    }

    if (purchaseResult) {
      return (
        <div className="flex flex-col items-center justify-center p-[40px] gap-[20px]">
          <div className="text-[48px]">✅</div>
          <div className="text-[18px] font-[700] text-[#34C759]">결제 완료</div>
          <div className="text-[14px] text-[#666] text-center">
            {purchaseResult.gem_added}개의 젬을 획득했습니다!
          </div>
          <div className="text-[12px] text-[#999] text-center">
            보유 젬: {purchaseResult.total_gems}개
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="">
      <div>
        <div className="left"></div>
        <div className="
          flex items-center justify-center
          p-[20px] pb-[0px]
          ">
          <h1 className="text-[18px] font-[700]">
            {isLoading ? '결제 진행 중' : error ? '결제 실패' : '결제 완료'}
          </h1>
        </div>
        <div className="right"></div>
      </div>

      <div className="
        flex flex-col gap-[30px]
        max-h-[calc(90vh-47px)] h-full
        p-[20px] pb-[105px]
        overflow-y-auto
      ">
        {renderContent()}
        
        <div className="
          absolute bottom-0 left-0 right-0
          flex items-center justify-between gap-[15px] p-[20px]
          bg-[#fff]/80 backdrop-blur-[1px]
        ">
          <motion.button 
            className="
              flex-1
              h-[45px]
              rounded-[8px]
              bg-[#ccc]
              text-[#fff] text-[16px] font-[700]
            "
            onClick={onCancel}
            whileTap={{ scale: 0.95 }}
            transition={{ 
              type: "spring", 
              stiffness: 500, 
              damping: 15
            }}
          >닫기</motion.button>
        </div>
      </div>
    </div>
  );
}; 