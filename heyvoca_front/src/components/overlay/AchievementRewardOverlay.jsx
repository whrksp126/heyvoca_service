import React from 'react';
import { motion } from 'framer-motion';
import { vibrate } from '../../utils/osFunction';
import { useOverlayActions } from '../../context/OverlayContext';

// 이미지 import
import ResultItemBackground01 from '../../assets/images/ResultItemBackground01.svg';
import ResultItemBackground02 from '../../assets/images/ResultItemBackground02.svg';
import InviteKing from '../../assets/images/HeyCharacter/InviteKing.png';
import AttendanceKing from '../../assets/images/HeyCharacter/AttendanceKing.png';
import NoryeokKing from '../../assets/images/HeyCharacter/NoryeokKing.png';
import WordKing from '../../assets/images/HeyCharacter/WordKing.png';
import PerseveranceKing from '../../assets/images/HeyCharacter/PerseveranceKing.png';
import ReadingKing from '../../assets/images/HeyCharacter/ReadingKing.png';
import MemorizedKing from '../../assets/images/HeyCharacter/MemorizedKing.png';

// 업적 타입과 이미지 매핑
const ACHIEVEMENT_IMAGES = {
    '초대왕': InviteKing,
    '출석왕': AttendanceKing,
    '노력왕': NoryeokKing,
    '단어왕': WordKing,
    '끈기왕': PerseveranceKing,
    '독서왕': ReadingKing,
    '암기왕': MemorizedKing,
};

// 레벨별 배경 색상 및 스타일
const getAchievementBackgroundStyle = (level) => {
    if (level >= 10) {
        return { background: 'linear-gradient(135deg, #FF8DD4 0%, #CD8DFF 50%, #74D5FF 100%)' };
    } else if (level >= 6) {
        return { backgroundColor: '#F2D252' };
    } else if (level >= 3) {
        return { backgroundColor: '#C0C0C0' };
    } else {
        return { backgroundColor: '#D3A686' };
    }
};

// 레벨별 글자 색상 및 스타일
const getAchievementTextStyle = (level) => {
    if (level >= 10) {
        return {
            background: 'linear-gradient(135deg, #FF8DD4 0%, #CD8DFF 50%, #74D5FF 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            color: 'transparent',
        };
    } else if (level >= 6) {
        return { color: '#F2D252' };
    } else if (level >= 3) {
        return { color: '#C0C0C0' };
    } else {
        return { color: '#D3A686' };
    }
};

const AchievementRewardOverlay = ({ goal }) => {
    const { resolveOverlay } = useOverlayActions();

    React.useEffect(() => {
        vibrate({ type: 'notificationSuccess' });
    }, []);

    const handleConfirm = () => {
        vibrate({ duration: 5 });
        resolveOverlay({ confirmed: true });
    };

    if (!goal) return null;

    const goalType = goal.type || '출석왕';
    const goalLevel = goal.level || 0;
    const badgeImg = goal.badge_img; // 백엔드에서 내려준 이미지 URL

    return (
        <div className="flex flex-col items-center justify-center h-full w-full pointer-events-none">
            <div className="
                relative
                flex flex-col items-center justify-between
                w-full max-w-[400px] aspect-[9/16]
                p-[20px]
                pointer-events-auto
            ">
                <div style={{ height: 'var(--status-bar-height)' }}></div>

                {/* 중앙 업적 연출 영역 */}
                <div className="relative flex flex-col items-center justify-center w-full flex-1 min-h-[400px]">

                    {/* 업적 및 텍스트 콘텐츠 (중앙 정렬) */}
                    <div className="relative z-10 flex flex-col items-center gap-[40px] w-full">
                        {/* 업적 컨테이너 (글로우 포함) */}
                        <div className="relative flex items-center justify-center">
                            {/* 글로우 배경 효과 (업적 중앙 기준) */}
                            <motion.img
                                src={ResultItemBackground01}
                                alt="bg01"
                                className="absolute max-w-none w-[320px] h-[320px] object-contain"
                                animate={{
                                    rotate: [0, 360],
                                    scale: [1, 1.1, 1],
                                    opacity: [0.3, 0.6, 0.3],
                                }}
                                transition={{
                                    duration: 10,
                                    repeat: Infinity,
                                    ease: "linear",
                                }}
                            />
                            <motion.img
                                src={ResultItemBackground02}
                                alt="bg02"
                                className="absolute max-w-none w-[600px] h-[500px] object-contain opacity-20"
                                animate={{
                                    scale: [1, 1.05, 1],
                                }}
                                transition={{
                                    duration: 5,
                                    repeat: Infinity,
                                    ease: "easeInOut",
                                }}
                            />

                            {/* 업적 배지 */}
                            <motion.div
                                className="relative z-10 h-[70px]"
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{
                                    scale: 1,
                                    opacity: 1,
                                    y: [0, -8, 0]
                                }}
                                transition={{
                                    scale: { type: "spring", stiffness: 200, damping: 15, duration: 0.6 },
                                    opacity: { duration: 0.6 },
                                    y: { delay: 0.7, duration: 2.5, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }
                                }}
                            >
                                <img
                                    src={ACHIEVEMENT_IMAGES[goalType] || badgeImg}
                                    alt={goalType}
                                    className="absolute bottom-[10px] left-[50%] translate-x-[-50%] w-[60px] h-[60px] object-contain"
                                />
                                <div
                                    className="w-[60px] h-[60px] rounded-[50%]"
                                    style={getAchievementBackgroundStyle(goalLevel)}
                                ></div>
                                <span
                                    className="
                                        absolute bottom-[0] left-[50%] 
                                        translate-x-[-50%]
                                        text-[16px] font-[700]
                                        [text-shadow:_-1.2px_-1.2px_0_#fff,1.2px_-1.2px_0_#fff,-1.2px_1.2px_0_#fff,1.2px_1.2px_0_#fff]
                                    "
                                    style={{ ...getAchievementTextStyle(goalLevel), fontFamily: 'Cafe24Ssurround, sans-serif' }}
                                >
                                    <span className="text-[10px]" style={{ fontFamily: 'Cafe24Ssurround' }}>LV.</span>{goalLevel}
                                </span>
                            </motion.div>
                        </div>

                        <motion.div
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.5, duration: 0.5 }}
                            className="flex flex-col items-center gap-[12px]"
                        >
                            <p className="text-[20px] font-[700] text-[#FFFFFF] text-center whitespace-pre-wrap">
                                <strong className="text-[#FF8DD4]">{goalType} {goalLevel}레벨</strong>을 달성했어요!
                            </p>
                        </motion.div>
                    </div>
                </div>

                <div className="w-full pb-[20px]">
                    <motion.button
                        whileTap={{ scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 500, damping: 15 }}
                        onClick={handleConfirm}
                        className="
                            w-full h-[45px]
                            bg-[#FF8DD4]
                            rounded-[8px]
                            text-[#FFFFFF] text-[16px] font-[700]
                        "
                    >
                        확인
                    </motion.button>
                </div>
            </div>
        </div>
    );
};

export default AchievementRewardOverlay;
