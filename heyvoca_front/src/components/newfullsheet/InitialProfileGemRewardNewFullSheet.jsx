import React from 'react';
import { motion } from 'framer-motion';
import gemImg from '../../assets/images/gem.png';
import ResultItemBackground01 from '../../assets/images/ResultItemBackground01.svg';
import ResultItemBackground02 from '../../assets/images/ResultItemBackground02.svg';
import { vibrate } from '../../utils/osFunction';

const InitialProfileGemRewardNewFullSheet = ({ gemCount, onConfirm }) => {
    return (
        <div className="flex flex-col h-full w-full bg-[#FFEFFA]">
            {/* 상단 여백 (헤더 높이만큼 비워둠) */}
            <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
            <div className="h-[55px]"></div>

            <div className="
                relative
                flex flex-col items-center justify-between
                w-full h-[calc(100vh-var(--status-bar-height)-55px)]
                p-[20px]
                bg-[#FFEFFA]
            ">
                <div></div>

                {/* 중앙 보석 연출 영역 */}
                <div className="relative flex flex-col items-center justify-center w-full flex-1">
                    {/* 글로우 배경 효과 (핑크 배경에 맞게 명도 조절) */}
                    <div className="absolute top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] w-[280px] h-[280px]">
                        <motion.img
                            src={ResultItemBackground01}
                            alt="bg01"
                            className="w-full h-full object-contain"
                            animate={{
                                rotate: [0, 360],
                                scale: [1, 1.15, 1],
                                opacity: [0.4, 0.7, 0.4],
                            }}
                            transition={{
                                duration: 8,
                                repeat: Infinity,
                                ease: "linear",
                            }}
                        />
                    </div>
                    <div className="absolute top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] w-[500px] h-[400px]">
                        <motion.img
                            src={ResultItemBackground02}
                            alt="bg02"
                            className="w-full h-full object-contain opacity-30"
                            animate={{
                                scale: [1, 1.1, 1],
                            }}
                            transition={{
                                duration: 4,
                                repeat: Infinity,
                                ease: "easeInOut",
                            }}
                        />
                    </div>

                    {/* 보석 및 텍스트 콘텐츠 */}
                    <div className="relative z-10 flex flex-col items-center gap-[25px]">
                        <motion.img
                            src={gemImg}
                            alt="gem"
                            className="w-[130px] h-[130px] object-contain"
                            initial={{ scale: 0, opacity: 0, rotate: -180 }}
                            animate={{
                                scale: [0, 1.3, 1, 1.15, 1],
                                opacity: 1,
                                rotate: [0, 10, -10, 0]
                            }}
                            transition={{
                                scale: {
                                    type: "tween",
                                    ease: "easeOut",
                                    duration: 0.7,
                                    times: [0, 0.5, 0.7, 0.85, 1]
                                },
                                opacity: { duration: 0.7 },
                                rotate: {
                                    delay: 1,
                                    duration: 3,
                                    repeat: Infinity,
                                    repeatType: "reverse",
                                    ease: "easeInOut"
                                }
                            }}
                        />
                        <motion.div
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.4 }}
                            className="flex flex-col items-center gap-[8px]"
                        >
                            <p className="text-[26px] font-[800] text-[#333] tracking-tight">
                                보석 <span className="text-[#FF6AB4]">{gemCount}개</span> 획득!
                            </p>
                            <p className="text-[16px] font-[500] text-[#888] text-center leading-tight">
                                초대 코드 보너스 보상이<br />
                                정상적으로 지급되었습니다.
                            </p>
                        </motion.div>
                    </div>
                </div>

                {/* 하단 버튼 - 다른 시트의 디자인 규격 준수 */}
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
                    onClick={() => {
                        vibrate({ duration: 5 });
                        if (onConfirm) onConfirm();
                    }}
                    className="
                        w-full h-[50px]
                        bg-[#FF8DD4]
                        rounded-[8px]
                        text-[#FFFFFF] font-[17px] font-[700]
                        shadow-md shadow-[#FF8DD4]/20
                    "
                >
                    확인
                </motion.button>
            </div>
        </div>
    );
};

export default InitialProfileGemRewardNewFullSheet;
