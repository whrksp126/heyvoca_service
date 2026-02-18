import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CaretLeft } from '@phosphor-icons/react';
import HeyCharacter from '../../assets/images/HeyCharacter.png';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { AlertNewBottomSheet } from '../newBottomSheet/AlertNewBottomSheet';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import InitialProfileStep3NewFullSheet from './InitialProfileStep3NewFullSheet';
import { backendUrl, fetchDataAsync } from '../../utils/common';
import { vibrate } from '../../utils/osFunction';

const InitialProfileStepPromoCodeNewFullSheet = ({ userInitialProfile, setUserInitialProfile, endInitialProfile }) => {
    "use memo";

    const codeRef = useRef();
    const { openAwaitNewBottomSheet } = useNewBottomSheetActions();
    const { popNewFullSheet, pushNewFullSheet } = useNewFullSheetActions();

    useEffect(() => {
        codeRef.current?.focus();
    }, []);

    const handleNextBtn = async () => {
        const inviteCode = codeRef.current.value.trim();

        if (inviteCode.length === 0) {
            handleSkipBtn();
            return;
        }

        if (inviteCode.includes(' ')) {
            await openAwaitNewBottomSheet(
                AlertNewBottomSheet,
                { title: '초대 코드에 공백을 포함할 수 없습니다.' },
                { isBackdropClickClosable: true, isDragToCloseEnabled: true }
            );
            return;
        }

        // 초대 코드 실시간 검증
        try {
            // NOTE: backendUrl and fetchDataAsync are assumed to be defined or imported elsewhere.
            const url = `${backendUrl}/auth/validate_invite_code`;
            const method = 'POST';
            const fetchData = { invite_code: inviteCode };
            const result = await fetchDataAsync(url, method, fetchData, false);

            if (result.code !== 200) {
                await openAwaitNewBottomSheet(
                    AlertNewBottomSheet,
                    { title: result.message || '유효하지 않은 초대 코드입니다.' },
                    { isBackdropClickClosable: true, isDragToCloseEnabled: true }
                );
                return;
            }

            // 검증 성공 시
            const updatedProfile = {
                ...userInitialProfile,
                inviteCode: inviteCode,
            };
            setUserInitialProfile(updatedProfile);

            pushNewFullSheet(
                InitialProfileStep3NewFullSheet,
                { userInitialProfile: updatedProfile, setUserInitialProfile, endInitialProfile },
                {
                    smFull: true,
                    closeOnBackdropClick: false,
                    isDragToCloseEnabled: false
                }
            );
        } catch (error) {
            console.error('초대 코드 검증 중 오류:', error);
            await openAwaitNewBottomSheet(
                AlertNewBottomSheet,
                { title: '네트워크 오류가 발생했습니다. 다시 시도해주세요.' },
                { isBackdropClickClosable: true, isDragToCloseEnabled: true }
            );
        }
    };

    const handleSkipBtn = () => {
        const updatedProfile = {
            ...userInitialProfile,
            inviteCode: null,
        };
        setUserInitialProfile(updatedProfile);

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

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' || e.keyCode === 13) {
            e.preventDefault();
            handleNextBtn();
        }
    };

    return (
        <div className="flex flex-col h-full w-full bg-[#FFEFFA]">
            <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
            <div className="relative flex items-center justify-center h-[55px] pt-[20px] px-[10px] pb-[14px]">
                <motion.button
                    onClick={() => {
                        vibrate({ duration: 5 });
                        popNewFullSheet();
                    }}
                    className="absolute top-[18px] left-[10px] flex items-center gap-[4px] text-[#CCC] p-[4px] rounded-[8px]"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                >
                    <CaretLeft size={24} />
                </motion.button>
            </div>
            <div className="relative flex flex-col items-center gap-[45px] justify-end w-full h-[calc(100vh-var(--status-bar-height)-55px)] p-[20px] bg-[#FFEFFA]">
                <div className="absolute top-[35px] left-[50%] translate-x-[-50%] flex flex-col items-center gap-[10px]">
                    <div
                        className="w-[max-content] px-[20px] py-[14px] rounded-[14px] font-[18px] font-[700] bg-[#fff] text-center relative"
                        style={{ boxShadow: '0px 4px 12px 0px rgba(0,0,0,0.08)' }}
                    >
                        초대 코드가 있다면 입력해 주세요!
                        {/* 말풍선 꼬리 */}
                        <div className="absolute bottom-[-8px] right-[40px] w-[16px] h-[16px] bg-white rotate-45" style={{ boxShadow: '4px 4px 12px 0px rgba(0,0,0,0.02)' }}></div>
                    </div>
                    <img src={HeyCharacter} alt="logo" className="w-[200px]" />
                </div>
                <div className="relative w-full">
                    <div className="relative flex flex-col items-center gap-[15px] w-full bg-[#FFEFFA]">
                        <input
                            type="text"
                            placeholder="초대 코드를 입력해주세요"
                            ref={codeRef}
                            className="w-full h-[55px] rounded-[10px] bg-[#fff] border-[1px] border-[#ccc] px-[20px] text-[18px] focus:outline-none focus:border-primary-main-600 focus:ring-2 focus:ring-primary-main-600/20"
                            autoComplete="off"
                            onKeyDown={handleKeyDown}
                        />
                        <div className="flex w-full gap-[12px]">
                            <motion.button
                                whileTap={{ scale: 0.98 }}
                                className="flex-1 h-[55px] rounded-[10px] bg-[#ccc] text-[#fff] font-[20px] font-[700]"
                                onClick={handleSkipBtn}
                            >없음</motion.button>
                            <motion.button
                                whileTap={{ scale: 0.98 }}
                                className="flex-1 h-[55px] rounded-[10px] bg-primary-main-600 text-[#fff] font-[20px] font-[700]"
                                onClick={handleNextBtn}
                            >입력</motion.button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InitialProfileStepPromoCodeNewFullSheet;
