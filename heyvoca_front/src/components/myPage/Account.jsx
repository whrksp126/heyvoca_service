import React, { useState } from 'react';
import { CaretLeft, SignOut } from '@phosphor-icons/react';

import { useFullSheet } from '../../context/FullSheetContext';
import { motion } from 'framer-motion';
import google from '../../assets/images/google_logo.png'; 
import { useLogoutBottomSheet } from './LogoutBottomSheet';
import { useUser } from '../../context/UserContext';

const Account = () => {
  const { showLogOutBottomSheet } = useLogoutBottomSheet();
  const { handleBack } = useFullSheet();
  const { userProfile } = useUser();
  
  const handleLogout = () => {
    showLogOutBottomSheet();
  }


  return (
    <div className="flex flex-col h-full">
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
            onClick={handleBack}
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
            <li className="flex flex-col items-start gap-[10px] px-[20px] py-[20px] bg-[#fff] dark:bg-[#111]">
                <h2 className="text-[16px] font-[700] text-[#111] dark:text-[#fff]">계정 이메일</h2>
                <span className="text-[14px] font-[400] text-[#999] dark:text-[#999]">{userProfile?.email || "로그인 필요"}</span>
            </li>
          </ul>
          <li className="flex items-center justify-between px-[20px] py-[20px] border-b border-[#ddd] bg-[#fff] dark:bg-[#111]"
            onClick={handleLogout}
          >
              <h2 className="text-[16px] font-[700] text-[#111] dark:text-[#fff]">로그아웃</h2>
              <SignOut size={20} className="text-[#ccc] dark:text-[#ccc]" />
          </li>

        </div>
    </div>
  );
};

export default Account;   