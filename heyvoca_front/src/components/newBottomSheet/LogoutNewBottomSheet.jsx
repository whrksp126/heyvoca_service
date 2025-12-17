import React, { useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useUser } from '../../context/UserContext';
import { launchGoogleLogout, getDevicePlatform } from '../../utils/osFunction';

// Hook 제거 - 직접 컴포넌트 사용

export const LogoutNewBottomSheet = ({ onCancel, onLogout }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { popNewBottomSheet, clearStack: clearNewBottomSheetStack } = useNewBottomSheetActions();
  const { clearStack: clearNewFullSheetStack } = useNewFullSheetActions();
  const navigate = useNavigate();
  const { performLogout } = useUser();

  // React Compiler가 자동으로 useCallback 처리
  const handleClose = () => {
    popNewBottomSheet();
  };

  const handleLogout = useCallback(async () => {
    try {
      // 앱 환경인 경우 앱에 로그아웃 요청 전송
      await launchGoogleLogout();
      
      // 앱 환경이면 launchGoogleLogout에서 처리하고 여기서 종료
      // 앱에서 google_logout_app_callback을 받으면 UserContext에서 실제 로그아웃 처리 진행
      if (getDevicePlatform() !== 'web') {
        return;
      }
      
      // 웹 환경인 경우 로그아웃 처리
      const result = await performLogout();
      
      if (!result.success) {
        alert('로그아웃 중 오류가 발생하였습니다.');
        return;
      }
      
      // 컨텍스트 초기화
      clearNewBottomSheetStack();
      clearNewFullSheetStack();
      
      // 로그인 페이지로 이동
      navigate('/login');
      
    } catch (error) {
      console.error('로그아웃 실패:', error);
      alert('로그아웃 중 오류가 발생하였습니다.');
    }
  }, [navigate, performLogout, clearNewBottomSheetStack, clearNewFullSheetStack]);

  return (
    <div className="">
      <div className="
        flex flex-col gap-[15px] items-center justify-center 
        pt-[40px] px-[20px] pb-[10px]
      ">
        <h3 className="text-[18px] font-[700]">정말 로그아웃 하시겠어요?</h3>
        <p className="text-[14px] font-[400] text-[#111]">단어 공부를 포기하지 마세요..😢</p>
      </div>
      <div className="flex items-center justify-between gap-[15px] p-[20px]">
        <motion.button 
          className="
            flex-1
            h-[45px]
            rounded-[8px]
            bg-[#ccc]
            text-[#fff] text-[16px] font-[700]
          "
          onClick={onCancel || handleClose}
          whileTap={{ scale: 0.95 }}
          transition={{ 
            type: "spring", 
            stiffness: 500, 
            damping: 15
          }}
        >취소</motion.button>
        <motion.button 
          className="
            flex-1
            h-[45px]
            rounded-[8px]
            bg-[#FF8DD4]
            text-[#fff] text-[16px] font-[700]
          "
          onClick={onLogout || handleLogout}
          whileTap={{ scale: 0.95 }}
          transition={{ 
            type: "spring", 
            stiffness: 500, 
            damping: 15
          }}
        >로그아웃</motion.button>
      </div>
    </div>
  );
};