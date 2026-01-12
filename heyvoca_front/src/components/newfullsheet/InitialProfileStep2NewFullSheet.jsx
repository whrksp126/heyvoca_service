import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CaretLeft } from '@phosphor-icons/react';
import HeyCharacter from '../../assets/images/HeyCharacter.png';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { AlertNewBottomSheet } from '../newBottomSheet/AlertNewBottomSheet';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import InitialProfileStep3NewFullSheet from './InitialProfileStep3NewFullSheet';
import { vibrate } from '../../utils/osFunction';

const InitialProfileStep2NewFullSheet = ({ userInitialProfile, setUserInitialProfile, endInitialProfile }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const profileRef = useRef();
  const { openAwaitNewBottomSheet } = useNewBottomSheetActions();
  const { popNewFullSheet, pushNewFullSheet } = useNewFullSheetActions();

  useEffect(() => {
    profileRef.current?.focus();
  }, []);

  // 항상 포커스 유지
  useEffect(() => {
    const handleBlur = () => {
      // blur 이벤트가 발생하면 즉시 다시 포커스
      setTimeout(() => {
        profileRef.current?.focus();
      }, 0);
    };

    const inputElement = profileRef.current;
    if (inputElement) {
      inputElement.addEventListener('blur', handleBlur);

      return () => {
        inputElement.removeEventListener('blur', handleBlur);
      };
    }
  }, []);

  // React Compiler가 자동으로 useCallback 처리
  const handleNextBtn = async () => {
    if (profileRef.current.value.length > 8) {
      await openAwaitNewBottomSheet(
        AlertNewBottomSheet,
        {
          title: '닉네임은 8자 이내로 입력해주세요.',
        },
        {
          isBackdropClickClosable: true,
          isDragToCloseEnabled: true
        }
      );
      return;
    };
    if (profileRef.current.value.length == 0) {
      await openAwaitNewBottomSheet(
        AlertNewBottomSheet,
        {
          title: '닉네임을 입력해주세요.',
        },
        {
          isBackdropClickClosable: true,
          isDragToCloseEnabled: true
        }
      );
      return;
    }
    const updatedProfile = {
      ...userInitialProfile,
      name: profileRef.current.value,
    };
    setUserInitialProfile(updatedProfile);

    // step3를 FullSheet로 열기
    pushNewFullSheet(
      InitialProfileStep3NewFullSheet,
      { userInitialProfile: updatedProfile, setUserInitialProfile, endInitialProfile },
      {
        smFull: true,
        closeOnBackdropClick: false,
        isDragToCloseEnabled: false
      }
    );
  };

  // 엔터 키 또는 모바일 키보드의 다음 버튼 처리
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.keyCode === 13) {
      e.preventDefault();
      handleNextBtn();
    }
  };

  return (
    <div className="
      flex flex-col h-full w-full
      bg-[#FFEFFA]
    ">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      {/* Header */}
      <div className="
        relative
        flex items-center justify-center
        h-[55px] 
        pt-[20px] px-[10px] pb-[14px]
      ">
        <motion.button
          onClick={() => {
            vibrate({ duration: 5 });
            popNewFullSheet();
          }}
          className="
            absolute top-[18px] left-[10px]
            flex items-center gap-[4px]
            text-[#CCC] dark:text-[#fff]
            p-[4px]
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
      <div className="
        relative
        flex flex-col items-center gap-[45px] justify-end 
        w-full h-[calc(100vh-var(--status-bar-height)-55px)]
        p-[20px]
        bg-[#FFEFFA]
      ">
        <div className="
            absolute top-[35px] left-[50%] translate-x-[-50%]
            flex flex-col items-center
            gap-[10px]
          ">
          <div
            className="
                w-[max-content]
                px-[15px] py-[12px]
                rounded-[10px]
                font-[16px] font-[600]
                bg-[#fff]
              "
            style={{ boxShadow: '0px 0px 4px 0px rgba(0,0,0,0.15)' }}
          >
            앞으로 제가 어떻게
            부르면 될까요?
          </div>
          <img src={HeyCharacter} alt="logo"
            className="
                w-[173px]
              "
          />
        </div>
        <div className="
          relative
          w-full
        ">

          <div className="
            relative
            flex flex-col items-center gap-[15px]
            w-full
            bg-[#FFEFFA]
          ">
            <input type="text" placeholder="닉네임을 입력해주세요(8자 이내)"
              id="name"
              name="name"
              ref={profileRef}
              defaultValue={userInitialProfile.name || ''}
              className="
                w-full h-[50px]
                rounded-[8px]
                bg-[#fff]
                border-[1px] border-[#ccc]
                px-[15px]
                font-[16px] font-[400]
                transition-all duration-200
                focus:outline-none
                focus:border-[#FF8DD4]
                focus:ring-2
                focus:ring-[#FF8DD4]/20
                hover:border-[#FF8DD4]/50
              "
              autoComplete="off"
              onKeyDown={handleKeyDown}
            />
            <motion.button
              whileHover={{
                scale: 1.02,
                backgroundColor: "#FF7AC4",
                boxShadow: "0 4px 8px rgba(0,0,0,0.1)"
              }}
              whileTap={{
                scale: 0.98,
                backgroundColor: "#FF6AB4"
              }}
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 17
              }}
              className="
                w-full h-[50px]
                rounded-[8px]
                bg-[#FF8DD4]
                text-[#fff] font-[16px] font-[700]
              "
              onClick={handleNextBtn}
            >다음</motion.button>
          </div>

        </div>
      </div>

    </div>
  );
};

export default InitialProfileStep2NewFullSheet;

