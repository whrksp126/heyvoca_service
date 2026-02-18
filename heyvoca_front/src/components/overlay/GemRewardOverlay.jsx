import React from 'react';
import { motion } from 'framer-motion';
import { vibrate } from '../../utils/osFunction';
import { useOverlayActions } from '../../context/OverlayContext';
import gemImg from '../../assets/images/gem.png';
import ResultItemBackground01 from '../../assets/images/ResultItemBackground01.svg';
import ResultItemBackground02 from '../../assets/images/ResultItemBackground02.svg';

const GemRewardOverlay = ({ gemCount, title = "보석 획득!", description = "보상이 정상적으로 지급되었습니다." }) => {
    const { resolveOverlay } = useOverlayActions();

    React.useEffect(() => {
        vibrate({ type: 'notificationSuccess' });
    }, []);

    const handleConfirm = () => {
        vibrate({ duration: 5 });
        resolveOverlay({ confirmed: true });
    };

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

                {/* 중앙 보석 연출 영역 */}
                <div className="relative flex flex-col items-center justify-center w-full flex-1 min-h-[400px]">

                    {/* 보석 및 텍스트 콘텐츠 (중앙 정렬) */}
                    <div className="relative z-10 flex flex-col items-center gap-[40px] w-full">
                        {/* 보석 컨테이너 (글로우 포함) */}
                        <div className="relative flex items-center justify-center">
                            {/* 글로우 배경 효과 (보석 중앙 기준) */}
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

                            {/* 보석 */}
                            <motion.img
                                src={gemImg}
                                alt="gem"
                                className="relative z-10 w-[100px] h-[100px] object-contain drop-shadow-[0_0_30px_rgba(255,141,212,0.4)]"
                                initial={{ scale: 0, opacity: 0, rotate: -180 }}
                                animate={{
                                    scale: [0, 1.2, 1, 1.05, 1],
                                    opacity: 1,
                                    rotate: [0, 5, -5, 0]
                                }}
                                transition={{
                                    scale: {
                                        type: "tween",
                                        ease: "easeOut",
                                        duration: 0.8,
                                        times: [0, 0.4, 0.6, 0.8, 1]
                                    },
                                    opacity: { duration: 0.5 },
                                    rotate: {
                                        delay: 1,
                                        duration: 4,
                                        repeat: Infinity,
                                        repeatType: "reverse",
                                        ease: "easeInOut"
                                    }
                                }}
                            />

                        </div>
                        <motion.div
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.4, type: "spring", stiffness: 100 }}
                            className="flex flex-col items-center gap-[12px]"
                        >
                            <p className="text-[30px] font-[900] text-layout-white tracking-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.3)]">
                                보석 <span className="text-primary-main-600">{gemCount}개</span> 획득!
                            </p>
                            <div className="flex flex-col items-center">
                                <span className="text-[18px] font-[500] text-[#FFFFFF]/80 text-center leading-[1.4] drop-shadow-[0_1px_5px_rgba(0,0,0,0.2)]">{title}</span>
                                <span className="text-[16px] font-[400] text-[#FFFFFF]/80 text-center leading-[1.4] drop-shadow-[0_1px_5px_rgba(0,0,0,0.2)]">{description}</span>
                            </div>
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
                            bg-primary-main-600
                            rounded-[8px]
                            text-layout-white text-[16px] font-[700]
                        "
                    >
                        확인
                    </motion.button>
                </div>
            </div>
        </div>
    );
};

export default GemRewardOverlay;
