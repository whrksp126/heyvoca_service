import React, { useState } from 'react';
import { CaretLeft, SignOut, Copy } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';

import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { motion } from 'framer-motion';
import google from '../../assets/images/google_logo.png'; 
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { LogoutNewBottomSheet } from '../newBottomSheet/LogoutNewBottomSheet';
import { WithdrawNewBottomSheet } from '../newBottomSheet/WithdrawNewBottomSheet';
import { useUser } from '../../context/UserContext';
import { withdrawApi } from '../../api/auth';
import { setCookie } from '../../utils/common';
import { launchGoogleWithdraw, getDevicePlatform, showToast } from '../../utils/osFunction';

const AccountNewFullSheet = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { pushNewBottomSheet, pushAwaitNewBottomSheet, clearStack: clearNewBottomSheetStack } = useNewBottomSheetActions();
  const { popNewFullSheet, clearStack: clearNewFullSheetStack } = useNewFullSheetActions();
  const { userProfile } = useUser();
  const navigate = useNavigate();
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const handleCopyInviteCode = async () => {
    if (!userProfile?.invite_code) return;
    
    try {
      await navigator.clipboard.writeText(userProfile.invite_code);
      setCopied(true);
      showToast('초대 코드가 복사되었습니다.');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('복사 실패:', error);
      // fallback: 텍스트 영역 생성하여 복사
      try {
        const textArea = document.createElement('textarea');
        textArea.value = userProfile.invite_code;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        setCopied(true);
        showToast('초대 코드가 복사되었습니다.');
        setTimeout(() => setCopied(false), 2000);
      } catch (fallbackError) {
        console.error('복사 fallback 실패:', fallbackError);
        showToast('복사에 실패했습니다.');
      }
    }
  }
  
  const handleLogout = () => {
    pushNewBottomSheet(
      LogoutNewBottomSheet,
      {},
      {
        isBackdropClickClosable: true,
        isDragToCloseEnabled: true
      }
    );
  }

  const handleWithdraw = async () => {
    try {
      // 확인 BottomSheet 표시
      const confirmed = await pushAwaitNewBottomSheet(
        WithdrawNewBottomSheet,
        {},
        {
          isBackdropClickClosable: true,
          isDragToCloseEnabled: true
        }
      );

      if (!confirmed) {
        return; // 취소한 경우
      }

      setIsWithdrawing(true);

      // 앱 환경인 경우 앱에 구글 계정 선택 요청 전송
      await launchGoogleWithdraw();
      
      // 앱 환경이면 launchGoogleWithdraw에서 처리하고 여기서 종료
      // 앱에서 google_logout_app_callback을 받으면 UserContext에서 실제 회원 탈퇴 처리 진행
      if (getDevicePlatform() !== 'web') {
        return;
      }
      
      // 웹 환경인 경우 회원 탈퇴 처리
      const result = await withdrawApi();
      
      if (result.code !== 200) {
        alert('회원 탈퇴 중 오류가 발생하였습니다.');
        setIsWithdrawing(false);
        return;
      }

      // 모든 캐시 및 저장소 삭제
      // localStorage 전체 삭제
      localStorage.clear();
      
      // sessionStorage 전체 삭제
      sessionStorage.clear();
      
      // 쿠키에서 accessToken 제거
      setCookie('userAccessToken', '', -1);

      // 컨텍스트 초기화
      clearNewBottomSheetStack();
      clearNewFullSheetStack();

      // 강제로 로그인 페이지로 이동 (캐시 무시)
      window.location.href = '/login';
    } catch (error) {
      console.error('회원 탈퇴 실패:', error);
      alert('회원 탈퇴 중 오류가 발생하였습니다.');
      setIsWithdrawing(false);
    }
  }


  return (
    <div className="flex flex-col h-full w-full bg-white">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      {/* Header */}
      <div className="
        relative
        flex items-center justify-between
        h-[55px] 
        pt-[20px] px-[16px] pb-[14px]
        border-b border-[#ddd]
      ">
        <div className="flex items-center gap-[4px]">
          <motion.button
            onClick={popNewFullSheet}
            className="
              text-[#CCC] dark:text-[#fff]
              rounded-[8px]
            "
            whileHover={{ 
              backgroundColor: 'rgba(0, 0, 0, 0.05)',
              scale: 1.05
            }}
            whileTap={{ 
              scale: 0.95,
              backgroundColor: 'rgba(0, 0, 0, 0.1)'
            }}
            transition={{ 
              type: "spring", 
              stiffness: 400, 
              damping: 17
            }}
          >
            <CaretLeft size={24} />
          </motion.button>
          <h1 className="
            text-[18px] font-[700]
            text-[#111] dark:text-[#fff]
          ">
          </h1>
        </div>
        <h1 className="
            absolute
            left-1/2 -translate-x-1/2
            text-[18px] font-[700]
            text-[#111] dark:text-[#fff]
          ">
            계정
          </h1>
        <div
          className="
            flex items-center gap-[8px]
            text-[#CCC] dark:text-[#fff]
          "
        >
        </div>
      </div>

      {/* Content */}
        <div className="flex flex-col gap-[10px] bg-[#F5F5F5] dark:bg-[#111]">
          <ul className="flex flex-col">
            <li className="flex flex-col items-start gap-[10px] px-[20px] py-[20px] border-b border-[#ddd] bg-[#fff] dark:bg-[#111]">
                <h2 className="text-[16px] font-[700] text-[#111] dark:text-[#fff]">로그인 방식</h2>
                <div className="flex items-center gap-[5px]">
                  <img src={google} alt="google" className="inline-block w-[16px] h-[16px]" />
                  <span className="text-[14px] font-[400] text-[#999] dark:text-[#999]">Google 로그인</span>
                </div>
            </li>
            <li className="flex flex-col items-start gap-[10px] px-[20px] py-[20px] border-b border-[#ddd] bg-[#fff] dark:bg-[#111]">
                <h2 className="text-[16px] font-[700] text-[#111] dark:text-[#fff]">계정 이메일</h2>
                <span className="text-[14px] font-[400] text-[#999] dark:text-[#999]">{userProfile?.email || "로그인 필요"}</span>
            </li>
            <li className="flex items-center justify-between px-[20px] py-[20px] border-b border-[#ddd] bg-[#fff] dark:bg-[#111]">
                <div className="flex flex-col items-start gap-[10px]">
                  <h2 className="text-[16px] font-[700] text-[#111] dark:text-[#fff]">초대 코드</h2>
                  <div className="flex items-center gap-[5px]" onClick={handleCopyInviteCode}>
                    <span className="text-[14px] font-[400] text-[#999] dark:text-[#999]">{userProfile?.invite_code || "-"}</span>
                    <Copy size={14} className="text-[#FF8DD4] dark:text-[#FF8DD4]" />

                  </div>
                </div>
            </li>
          </ul>
          <li className="flex items-center justify-between px-[20px] py-[20px] border-b border-[#ddd] bg-[#fff] dark:bg-[#111]"
            onClick={handleLogout}
          >
              <h2 className="text-[16px] font-[700] text-[#111] dark:text-[#fff]">로그아웃</h2>
              <SignOut size={20} className="text-[#ccc] dark:text-[#ccc]" />
          </li>

        </div>

        {/* 회원 탈퇴 버튼 */}
        <div className="flex justify-center py-[20px]">
          <button
            onClick={handleWithdraw}
            disabled={isWithdrawing}
            className="
              text-[12px] font-[400]
              text-[#999] dark:text-[#666]
              underline
              hover:text-[#666] dark:hover:text-[#999]
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors
            "
          >
            {isWithdrawing ? '처리 중...' : '회원 탈퇴'}
          </button>
        </div>
    </div>
  );
};

export default AccountNewFullSheet;

