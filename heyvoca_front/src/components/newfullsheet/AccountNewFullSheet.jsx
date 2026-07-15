import React, { useState } from 'react';
import { CaretLeft, SignOut, PencilSimple, AppleLogo } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';

import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { motion } from 'framer-motion';
import google from '../../assets/images/google_logo.png';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { LogoutNewBottomSheet } from '../newBottomSheet/LogoutNewBottomSheet';
import { WithdrawNewBottomSheet } from '../newBottomSheet/WithdrawNewBottomSheet';
import { NicknameEditNewBottomSheet } from '../newBottomSheet/NicknameEditNewBottomSheet';
import { useUser } from '../../context/UserContext';
import { withdrawApi } from '../../api/auth';
import { setCookie } from '../../utils/common';
import { launchGoogleWithdraw, showToast, vibrate, getDevicePlatform } from '../../utils/osFunction';

const AccountNewFullSheet = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { pushNewBottomSheet, pushAwaitNewBottomSheet, clearStack: clearNewBottomSheetStack } = useNewBottomSheetActions();
  const { popNewFullSheet, clearStack: clearNewFullSheetStack } = useNewFullSheetActions();
  const { userProfile, setIsWithdrawInProgress, updateUserProfile, loginProvider } = useUser();
  const navigate = useNavigate();
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const handleNicknameEdit = async () => {
    const newNickname = await pushAwaitNewBottomSheet(
      NicknameEditNewBottomSheet,
      { initialNickname: userProfile?.username || '' },
      {
        isBackdropClickClosable: true,
        isDragToCloseEnabled: true
      }
    );
    if (!newNickname || newNickname === userProfile?.username) return;
    try {
      await updateUserProfile({ username: newNickname });
      showToast('닉네임이 변경되었습니다.');
    } catch (error) {
      console.error('닉네임 변경 실패:', error);
      showToast('닉네임 변경에 실패했습니다.');
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

      // 회원 탈퇴 프로세스 시작 표시 (로그아웃과 동일한 앱 콜백을 구분하기 위함)
      setIsWithdrawInProgress(true);

      const platform = getDevicePlatform();

      if (platform !== 'web') {
        // 앱 환경 — 로그인 방식에 따라 분기해야 한다.
        // 애플 로그인 사용자는 구글 세션이 없어 launchGoogleWithdraw()가 트리거하는
        // GoogleSignin.signOut()이 실패(callback status≠200)한다. 그 결과 UserContext의
        // handleAppGoogleAccountAction이 status===200 게이트를 통과하지 못해 performWithdraw가
        // 아예 실행되지 않고 탈퇴가 중단된다. 애플 사용자는 이 구글 로그아웃 채널을 타지 않고
        // 웹과 동일하게 withdrawApi를 직접 호출해 탈퇴를 완료시킨다.
        if (loginProvider === 'apple') {
          const result = await withdrawApi();

          if (result.code !== 200) {
            alert('회원 탈퇴 중 오류가 발생하였습니다.');
            setIsWithdrawing(false);
            setIsWithdrawInProgress(false);
            return;
          }

          localStorage.clear();
          sessionStorage.clear();
          setCookie('userAccessToken', '', -1);
          clearNewBottomSheetStack();
          clearNewFullSheetStack();
          window.location.href = '/login';
          return;
        }

        // 구글 로그인(또는 로그인 방식을 알 수 없는 경우) — 기존 앱 구글 계정 선택 팝업 흐름 유지.
        // 앱에서 google_logout_app_callback(status:200)을 받으면
        // UserContext.handleAppGoogleAccountAction이 isWithdrawInProgress를 보고 performWithdraw를 실행한다.
        await launchGoogleWithdraw();
        return;
      }

      // 웹 환경인 경우 회원 탈퇴 처리
      const result = await withdrawApi();

      if (result.code !== 200) {
        alert('회원 탈퇴 중 오류가 발생하였습니다.');
        setIsWithdrawing(false);
        setIsWithdrawInProgress(false);
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
      setIsWithdrawInProgress(false);
    }
  }


  return (
    <div className="flex flex-col h-full w-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      {/* Header */}
      <div
        data-page-header
        className="
        relative
        flex items-center justify-between
        h-[55px]
        pt-[20px] px-[16px] pb-[14px]
        border-b border-[#ddd]
      ">
        <div className="flex items-center gap-[4px]">
          <motion.button
            onClick={() => {
              vibrate({ duration: 5 });
              popNewFullSheet();
            }}
            className="
              text-layout-gray-200 dark:text-layout-white
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
        </div>
        <h1 className="
            absolute
            left-1/2 -translate-x-1/2
            text-[18px] font-[700]
            text-layout-black dark:text-layout-white
          ">
          계정
        </h1>
        <div
          className="
            flex items-center gap-[8px]
            text-layout-gray-200 dark:text-layout-white
          "
        >
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col gap-[10px] bg-layout-gray-50 dark:bg-layout-black">
        <ul className="flex flex-col">
          <li className="flex items-center justify-between px-[20px] py-[20px] border-b border-[#ddd] bg-layout-white dark:bg-layout-black"
            onClick={() => {
              vibrate({ duration: 5 });
              handleNicknameEdit();
            }}
          >
            <div className="flex flex-col items-start gap-[10px]">
              <h2 className="text-[16px] font-[700] text-layout-black dark:text-layout-white">닉네임</h2>
              <span className="text-[14px] font-[400] text-[#999] dark:text-layout-gray-300">{userProfile?.username || "미설정"}</span>
            </div>
            <PencilSimple size={20} className="text-layout-gray-200 dark:text-layout-gray-200" />
          </li>
          <li className="flex flex-col items-start gap-[10px] px-[20px] py-[20px] border-b border-[#ddd] bg-layout-white dark:bg-layout-black">
            <h2 className="text-[16px] font-[700] text-layout-black dark:text-layout-white">로그인 방식</h2>
            <div className="flex items-center gap-[5px]">
              {loginProvider === 'apple' ? (
                <>
                  <AppleLogo size={16} weight="fill" className="text-layout-black dark:text-layout-white" />
                  <span className="text-[14px] font-[400] text-[#999] dark:text-layout-gray-300">Apple 로그인</span>
                </>
              ) : (
                <>
                  <img src={google} alt="google" className="inline-block w-[16px] h-[16px]" />
                  <span className="text-[14px] font-[400] text-[#999] dark:text-layout-gray-300">Google 로그인</span>
                </>
              )}
            </div>
          </li>
          <li className="flex flex-col items-start gap-[10px] px-[20px] py-[20px] border-b border-[#ddd] bg-layout-white dark:bg-layout-black">
            <h2 className="text-[16px] font-[700] text-layout-black dark:text-layout-white">계정 이메일</h2>
            <span className="text-[14px] font-[400] text-[#999] dark:text-layout-gray-300">{userProfile?.email || "로그인 필요"}</span>
          </li>
        </ul>
        <li className="flex items-center justify-between px-[20px] py-[20px] border-b border-[#ddd] bg-layout-white dark:bg-layout-black"
          onClick={() => {
            vibrate({ duration: 5 });
            handleLogout();
          }}
        >
          <h2 className="text-[16px] font-[700] text-layout-black dark:text-layout-white">로그아웃</h2>
          <SignOut size={20} className="text-layout-gray-200 dark:text-layout-gray-200" />
        </li>

      </div>

      {/* 회원 탈퇴 버튼 */}
      <div className="flex justify-center py-[16px]">
        <button
          onClick={() => {
            vibrate({ duration: 5 });
            handleWithdraw();
          }}
          disabled={isWithdrawing}
          className="
              text-[12px] font-[400]
              text-[#999] dark:text-layout-gray-400
              underline
              hover:text-[#666] dark:hover:text-layout-gray-300
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

