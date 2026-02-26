import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useUser } from '../../context/UserContext';
import InviteKing from '../../assets/images/HeyCharacter/InviteKing.png';
import AttendanceKing from '../../assets/images/HeyCharacter/AttendanceKing.png';
import NoryeokKing from '../../assets/images/HeyCharacter/NoryeokKing.png';
import PerseveranceKing from '../../assets/images/HeyCharacter/PerseveranceKing.png';
import ReadingKing from '../../assets/images/HeyCharacter/ReadingKing.png';
import MemorizedKing from '../../assets/images/HeyCharacter/MemorizedKing.png';
import gem from '../../assets/images/gem.png';
import { vibrate } from '../../utils/osFunction';

// 업적 타입과 이미지 매핑
const ACHIEVEMENT_IMAGES = {
    '초대왕': InviteKing,
    '출석왕': AttendanceKing,
    '노력왕': NoryeokKing,
    '끈기왕': PerseveranceKing,
    '독서왕': ReadingKing,
    '암기왕': MemorizedKing,
};

// 레벨별 배경 색상
const getAchievementBackgroundStyle = (level) => {
    if (level >= 10) {
        return { background: 'linear-gradient(135deg, var(--primary-main-600) 0%, #CD8DFF 50%, #74D5FF 100%)' };
    } else if (level >= 6) {
        return { backgroundColor: '#F2D252' };
    } else if (level >= 3) {
        return { backgroundColor: '#C0C0C0' };
    } else {
        return { backgroundColor: '#D3A686' };
    }
};

// 레벨별 글자 색상
const getAchievementTextStyle = (level) => {
    if (level >= 10) {
        return {
            background: 'linear-gradient(135deg, var(--primary-main-600) 15%, #CD8DFF 50%, #74D5FF 85%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
        };
    } else if (level >= 7) {
        return {
            background: 'linear-gradient(154deg, #FFDE71 30%, #FFD04D 61%, #FFF2C6 68%, #FFE17D 78%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
        };
    } else if (level >= 4) {
        return {
            background: 'linear-gradient(154deg, #D4D4D4 30%, #C4C4C4 61%, #F2F2F2 68%, #C5C5C5 78%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
        };
    } else if (level >= 1) {
        return {
            background: 'linear-gradient(154deg, #EAAA7D 29%, #E2A173 62%, #F4C4A3 69%, #EDB38B 80%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
        };
    } else {
        return { color: '#D3A686' };
    }
};


export const AchievementDetailNewBottomSheet = ({ selectedType = '초대왕' }) => {
    "use memo";
    const { resolveNewBottomSheet } = useNewBottomSheetActions();
    const { userMainPage, achievementCriteria, isAchievementCriteriaLoading } = useUser();
    const [activeTab, setActiveTab] = useState(selectedType);

    const achievementTypes = ['초대왕', '출석왕', '노력왕', '끈기왕', '독서왕', '암기왕'];
    const tabRefs = useRef({});

    useEffect(() => {
        if (activeTab && tabRefs.current[activeTab]) {
            tabRefs.current[activeTab].scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'center'
            });
        }
    }, [activeTab]);

    // 현재 사용자의 업적 레벨 가져오기
    const getUserAchievementLevel = (type) => {
        const goal = userMainPage?.goals?.find(g => g.type === type);
        return goal?.level || 0;
    };

    const currentUserLevel = getUserAchievementLevel(activeTab);
    const levels = achievementCriteria[activeTab] || [];

    if (isAchievementCriteriaLoading && levels.length === 0) {
        return (
            <div className="flex items-center justify-center p-[40px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#CD8DFF]"></div>
            </div>
        );
    }

    const handleClose = () => {
        vibrate({ duration: 5 });
        resolveNewBottomSheet();
    };

    const handleTabClick = (type) => {
        vibrate({ duration: 5 });
        setActiveTab(type);
    };

    return (
        <div className="relative bg-layout-white dark:bg-layout-black">
            {/* 컨텐츠 구역 */}
            <div className="flex flex-col gap-[20px] p-[20px] pb-[100px] overflow-y-auto max-h-[calc(90vh-47px)] h-full">
                {/* 헤더 */}
                <h1 className="text-[18px] font-[700] text-layout-black dark:text-layout-white text-center tracking-[-0.36px]">
                    업적 달성 기준
                </h1>

                {/* 업적 타입 탭 - 가로 스크롤 */}
                <div
                    className="flex gap-[10px] items-start overflow-x-auto overflow-y-hidden w-full min-h-[85px] pb-[10px] scrollbar-hide"
                    style={{ touchAction: 'pan-x' }}
                >
                    {achievementTypes.map((type) => {
                        const userLevel = getUserAchievementLevel(type);
                        const isActive = activeTab === type;

                        return (
                            <motion.div
                                key={type}
                                ref={(el) => (tabRefs.current[type] = el)}
                                className="flex flex-col items-center gap-[5px] cursor-pointer shrink-0"
                                onClick={() => handleTabClick(type)}
                                whileTap={{ scale: 0.95 }}
                                style={!isActive ? { opacity: 0.3 } : {}}
                            >
                                <div className="relative w-[60px] h-[60px]">
                                    <img
                                        src={ACHIEVEMENT_IMAGES[type]}
                                        alt={type}
                                        className="absolute bottom-0 left-[50%] translate-x-[-50%] w-[60px] h-[60px] object-contain"
                                    />
                                    <div
                                        className="w-[60px] h-[60px] rounded-[50%]"
                                        style={getAchievementBackgroundStyle(userLevel)}
                                    />
                                </div>
                                <span className="text-[12px] font-[600] text-layout-black dark:text-layout-white text-center w-[60px]">
                                    {type}
                                </span>
                            </motion.div>
                        );
                    })}
                </div>

                {/* 리스트 영역 - 연한 보라색 배경 */}
                <div className="flex flex-col gap-[15px] p-[20px] bg-secondary-purple-100 rounded-[12px]">
                    {/* 선택된 업적 이름 */}
                    <h2 className="text-[16px] font-[700] text-layout-black tracking-[-0.32px]">
                        {activeTab}
                    </h2>

                    {/* 레벨 리스트 */}
                    <div className="flex flex-col gap-[8px]">
                        {levels.map((levelInfo) => {
                            const isCompleted = currentUserLevel >= levelInfo.level;

                            return (
                                <div
                                    key={levelInfo.level}
                                    className="flex items-center justify-between"
                                >
                                    {/* 레벨 번호 및 목표 */}
                                    <div className="flex items-center gap-[8px] flex-1">
                                        <div
                                            className="text-[16px] font-[700] tracking-[-0.24px] w-[44px] flex items-baseline justify-start"
                                            style={{
                                                fontFamily: 'Cafe24Ssurround, sans-serif',
                                                // 레벨 1 이상일 때 하얀 외곽선 효과 적용 (그라데이션 텍스트 호환을 위해 filter 사용)
                                                ...(levelInfo.level >= 1 ? {
                                                    filter: 'drop-shadow(-1px -1px 0 var(--layout-white)) drop-shadow(1px -1px 0 var(--layout-white)) drop-shadow(-1px 1px 0 var(--layout-white)) drop-shadow(1px 1px 0 var(--layout-white))'
                                                } : {
                                                    textShadow: '-1.2px -1.2px 0 var(--layout-white), 1.2px -1.2px 0 var(--layout-white), -1.2px 1.2px 0 var(--layout-white), 1.2px 1.2px 0 var(--layout-white)'
                                                }),
                                                ...getAchievementTextStyle(levelInfo.level)
                                            }}
                                        >
                                            <span className="text-[10px]" style={{ fontFamily: 'Cafe24Ssurround' }}>Lv.</span>
                                            {String(levelInfo.level).padStart(2, '0')}
                                        </div>

                                        {/* 목표 설명 */}
                                        <span className="text-[13px] font-[400] text-layout-gray-500 tracking-[-0.26px] leading-[1.5]">
                                            {levelInfo.goal}
                                        </span>
                                    </div>

                                    {/* 우측: 완료된 레벨은 체크만, 미완료는 보석만 */}
                                    <div className="flex items-center gap-[8px]">
                                        {isCompleted ? (
                                            /* 완료된 레벨: 체크 아이콘만 */
                                            <div className="flex items-center justify-center w-[45px] h-[20px] bg-[#CD8DFF] rounded-[5px]">
                                                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                                                    <circle cx="6.5" cy="6.5" r="6.5" fill="white" />
                                                    <path d="M3.5 6.5L5.5 8.5L9.5 4.5" stroke="#CD8DFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            </div>
                                        ) : (
                                            /* 미완료 레벨: 보석 뱃지만 */
                                            <div
                                                className="flex items-center justify-center gap-[3px] w-[45px] h-[20px] px-[8px] py-[4px] rounded-[5px]"
                                                style={{ backgroundColor: '#EAD2FF' }}
                                            >
                                                <img src={gem} alt="보석" className="w-[13px] h-[12px]" />
                                                <span className="text-[11px] font-[500] text-layout-black text-center tracking-[-0.22px] leading-[1.4]">
                                                    {levelInfo.reward}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* 하단 버튼 구역 (고정) */}
            <div className="
                absolute bottom-0 left-0 right-0 
                p-[20px] pt-[50px] 
                bg-gradient-to-b from-transparent to-layout-white dark:to-layout-black
            ">
                <motion.button
                    className="w-full h-[45px] bg-layout-gray-200 text-layout-white dark:text-layout-black rounded-[8px] text-[16px] font-[700]"
                    onClick={handleClose}
                    whileTap={{ scale: 0.98 }}
                    transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 15
                    }}
                >
                    닫기
                </motion.button>
            </div>
        </div>
    );
};
