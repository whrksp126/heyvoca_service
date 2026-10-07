// src/components/newBottomSheet/AchievementDetailNewBottomSheet.jsx
//
// 업적 달성 기준 — 위쪽 캐러셀로 업적을 고르고, 아래에 그 업적의 메달 카드와 레벨 사다리가 나온다.
//   캐러셀     고른 메달이 커지며 가운데로 온다. 아래쪽을 좌우로 밀어도 넘어간다.
//   메달 카드  지금 레벨 · 등급 · 다음 목표와 받을 보석. 메달을 누르면 한 바퀴 뒤집힌다.
//   사다리     달성 / 다음 목표 / 그 뒤를 한 줄로 이은 길. 열리면 '다음 목표' 줄로 스크롤한다.
// 업적 데이터(userMainPage.goals, achievementCriteria)는 읽기만 한다 — 표현만 맡는 화면이다.
import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Crown, LockSimple } from '@phosphor-icons/react';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useUser } from '../../context/UserContext';
import gem from '../../assets/images/farm/icon-gem.png';
import { vibrate } from '../../utils/osFunction';
import { feel, SPRING } from '../../lib/feel';
import AchievementMedal from '../achievement/AchievementMedal';
import AchievementLadder from '../achievement/AchievementLadder';
import {
    ACHIEVEMENT_TYPES,
    TIER_INK,
    TIER_LABEL,
    achievementTier,
    getAchievementState,
} from '../achievement/achievementMeta';

const SWIPE_PX = 56; // 이만큼 옆으로 밀면 다음 업적으로 넘어간다
const FOOTER_PX = 100; // 아래에 떠 있는 '닫기' 버튼이 가리는 높이

export const AchievementDetailNewBottomSheet = ({ selectedType = '초대왕' }) => {
    "use memo";
    const { resolveNewBottomSheet } = useNewBottomSheetActions();
    const { userMainPage, achievementCriteria, isAchievementCriteriaLoading } = useUser();
    const reducedMotion = useReducedMotion();
    const [activeTab, setActiveTab] = useState(selectedType);
    // 넘어가는 방향(1 = 오른쪽 업적으로) — 카드가 들어오고 나가는 쪽을 정한다
    const [direction, setDirection] = useState(1);

    const tabRefs = useRef({});
    const scrollRef = useRef(null);
    const nextRowRef = useRef(null);
    const heroMedalRef = useRef(null);

    useEffect(() => {
        if (activeTab && tabRefs.current[activeTab]) {
            tabRefs.current[activeTab].scrollIntoView({
                behavior: reducedMotion ? 'auto' : 'smooth',
                block: 'nearest',
                inline: 'center'
            });
        }
    }, [activeTab, reducedMotion]);

    // 현재 사용자의 업적 레벨 가져오기
    const getUserAchievementLevel = (type) => {
        const goal = userMainPage?.goals?.find(g => g.type === type);
        return goal?.level || 0;
    };

    const levels = achievementCriteria[activeTab] || [];
    const state = getAchievementState(getUserAchievementLevel(activeTab), levels);
    const tier = achievementTier(state.level);
    const ink = TIER_INK[tier.key];
    const hasLevels = levels.length > 0;
    const isMax = state.isMax;

    // '다음 목표' 줄이 보이도록 스크롤 — 시트가 올라오고 사다리가 그려진 뒤에 맞춘다
    useEffect(() => {
        if (!hasLevels) return undefined;
        const timer = setTimeout(() => {
            const box = scrollRef.current;
            const row = nextRowRef.current;
            if (!box) return;
            // 전부 달성한 업적은 맨 위(메달 카드)를 보여준다
            if (isMax || !row) {
                box.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
                return;
            }
            const boxRect = box.getBoundingClientRect();
            const rowRect = row.getBoundingClientRect();
            // 이미 '닫기' 버튼 위쪽에 다 보이면 그대로 둔다 — 메달 카드를 괜히 밀어 올리지 않는다
            if (rowRect.bottom <= boxRect.bottom - FOOTER_PX && rowRect.top >= boxRect.top) return;
            const visible = box.clientHeight - FOOTER_PX;
            const top = box.scrollTop + (rowRect.top - boxRect.top) - (visible - rowRect.height) / 2;
            box.scrollTo({ top: Math.max(0, top), behavior: reducedMotion ? 'auto' : 'smooth' });
        }, 420);
        return () => clearTimeout(timer);
    }, [activeTab, hasLevels, isMax, reducedMotion]);

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

    const changeTab = (type) => {
        if (!type || type === activeTab) return;
        feel('select');
        setDirection(ACHIEVEMENT_TYPES.indexOf(type) > ACHIEVEMENT_TYPES.indexOf(activeTab) ? 1 : -1);
        setActiveTab(type);
    };

    // 아래쪽을 좌우로 밀어 넘기기 — 세로 스크롤과 헷갈리지 않게 가로가 훨씬 클 때만
    const handlePanEnd = (_event, info) => {
        const { x, y } = info.offset;
        if (Math.abs(x) < SWIPE_PX || Math.abs(x) < Math.abs(y) * 1.6) return;
        const index = ACHIEVEMENT_TYPES.indexOf(activeTab);
        changeTab(ACHIEVEMENT_TYPES[index + (x < 0 ? 1 : -1)]);
    };

    const handleTapMedal = () => {
        feel('tap');
        heroMedalRef.current?.play();
    };

    const slide = reducedMotion ? 0 : 28;

    return (
        <div className="relative bg-layout-white dark:bg-layout-black">
            <div className="flex flex-col max-h-[calc(90vh-47px)]">
                {/* 헤더 + 업적 캐러셀 — 스크롤해도 위에 남는다 */}
                <div className="shrink-0 px-[20px] pt-[20px]">
                    <h1 className="text-[18px] font-[700] text-layout-black dark:text-layout-white text-center tracking-[-0.36px]">
                        업적 달성 기준
                    </h1>

                    <div
                        className="flex items-end gap-[6px] overflow-x-auto overflow-y-hidden mx-[-20px] px-[20px] pt-[16px] pb-[12px] scrollbar-hide"
                        style={{ touchAction: 'pan-x' }}
                    >
                        {ACHIEVEMENT_TYPES.map((type, index) => {
                            const itemState = getAchievementState(getUserAchievementLevel(type), achievementCriteria[type]);
                            const isActive = activeTab === type;

                            return (
                                <motion.div
                                    key={type}
                                    ref={(el) => (tabRefs.current[type] = el)}
                                    role="tab"
                                    aria-selected={isActive}
                                    className="relative flex w-[68px] shrink-0 cursor-pointer flex-col items-center pb-[9px]"
                                    onClick={() => changeTab(type)}
                                    whileTap={{ scale: 0.92 }}
                                    animate={{ opacity: isActive ? 1 : 0.5, scale: isActive ? 1 : 0.84 }}
                                    transition={reducedMotion ? { duration: 0.12 } : SPRING.bouncy}
                                >
                                    <AchievementMedal
                                        type={type}
                                        level={itemState.level}
                                        ratio={itemState.ratio}
                                        isMax={itemState.isMax}
                                        size={56}
                                        delay={0.04 * index}
                                        alive={isActive}
                                    />
                                    <span className={`mt-[10px] text-[12px] tracking-[-0.03em] text-layout-black dark:text-layout-white ${isActive ? 'font-[800]' : 'font-[600]'}`}>
                                        {type}
                                    </span>
                                    {isActive && (
                                        <motion.span
                                            layoutId="achievement-tab-dot"
                                            className="absolute bottom-0 h-[4px] w-[18px] rounded-full bg-primary-main-600"
                                            transition={reducedMotion ? { duration: 0 } : SPRING.snappy}
                                        />
                                    )}
                                </motion.div>
                            );
                        })}
                    </div>
                </div>

                {/* 메달 카드 + 레벨 사다리 — 좌우로 밀면 다음 업적 */}
                <motion.div
                    ref={scrollRef}
                    onPanEnd={handlePanEnd}
                    className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-[20px] pt-[4px] pb-[110px]"
                    style={{ touchAction: 'pan-y' }}
                >
                    <AnimatePresence mode="wait" initial={false} custom={direction}>
                        <motion.div
                            key={activeTab}
                            custom={direction}
                            variants={{
                                enter: (dir) => ({ opacity: 0, x: dir * slide }),
                                center: { opacity: 1, x: 0 },
                                exit: (dir) => ({ opacity: 0, x: dir * -slide }),
                            }}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={{ duration: reducedMotion ? 0.1 : 0.16, ease: 'easeOut' }}
                            className="flex flex-col gap-[10px]"
                        >
                            {/* 메달 카드 */}
                            <div className="flex items-center gap-[16px] rounded-[16px] bg-layout-gray-50 px-[18px] pb-[20px] pt-[18px] dark:bg-layout-gray-dark">
                                <div onClick={handleTapMedal} className="cursor-pointer">
                                    <AchievementMedal
                                        ref={heroMedalRef}
                                        type={activeTab}
                                        level={state.level}
                                        ratio={state.ratio}
                                        isMax={state.isMax}
                                        size={92}
                                        tapEffect="flip"
                                    />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-[6px]">
                                        <h2 className="text-[18px] font-[800] tracking-[-0.04em] text-layout-black dark:text-layout-white">
                                            {activeTab}
                                        </h2>
                                        {state.isLocked ? (
                                            <span className="flex items-center gap-[2px] rounded-full bg-layout-white px-[7px] py-[3px] text-[10.5px] font-[800] leading-none text-layout-gray-300 dark:bg-[#333333]">
                                                <LockSimple size={10} weight="fill" />
                                                잠김
                                            </span>
                                        ) : (
                                            <span
                                                className="rounded-full border-[1.5px] bg-layout-white px-[7px] py-[2px] text-[10.5px] font-[800] leading-[1.2] text-[color:var(--ink)] dark:bg-[#1C1C1C] dark:text-[color:var(--ink-d)]"
                                                style={{ borderColor: tier.color, '--ink': ink.light, '--ink-d': ink.dark }}
                                            >
                                                {TIER_LABEL[tier.key]} 등급
                                            </span>
                                        )}
                                    </div>
                                    {state.max > 0 && (
                                        <div className="mt-[3px] text-[12px] font-[700] tabular-nums tracking-[-0.02em] text-layout-gray-300">
                                            {state.level} / {state.max} 레벨 달성
                                        </div>
                                    )}
                                    {state.isMax ? (
                                        <div className="mt-[9px] flex items-center gap-[4px] text-[12.5px] font-[800] tracking-[-0.03em] text-secondary-purple-500 dark:text-[#DDB0FF]">
                                            <Crown size={14} weight="fill" />
                                            모든 레벨을 달성했어요
                                        </div>
                                    ) : state.next ? (
                                        <div className="mt-[9px]">
                                            <div className="text-[10.5px] font-[800] leading-none text-primary-main-600 dark:text-[#FFAAE6]">
                                                {state.isLocked ? '첫 목표' : '다음 목표'}
                                            </div>
                                            <div className="mt-[4px] flex items-center gap-[6px]">
                                                <span className="min-w-0 text-[13px] font-[700] leading-[1.35] tracking-[-0.03em] text-layout-black [word-break:keep-all] dark:text-layout-white">
                                                    {state.next.goal}
                                                </span>
                                                <span className="flex shrink-0 items-center gap-[2px] rounded-full bg-[#EAD2FF] px-[7px] py-[3px] text-[11.5px] font-[800] tabular-nums leading-none text-layout-black">
                                                    <img src={gem} alt="보석" draggable={false} className="h-[13px] w-[13px] object-contain" />
                                                    +{state.next.reward}
                                                </span>
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            </div>

                            {/* 레벨 사다리 */}
                            <div className="rounded-[16px] bg-secondary-purple-100 px-[12px] py-[12px] dark:bg-secondary-purple-dark">
                                <AchievementLadder
                                    levels={levels}
                                    currentLevel={state.level}
                                    reducedMotion={reducedMotion}
                                    nextRowRef={nextRowRef}
                                />
                            </div>
                        </motion.div>
                    </AnimatePresence>
                </motion.div>
            </div>

            {/* 하단 버튼 구역 (고정) */}
            <div className="
                absolute bottom-0 left-0 right-0
                p-[20px] pt-[50px]
                bg-gradient-to-b from-transparent to-layout-white dark:to-layout-black
                pointer-events-none
            ">
                <motion.button
                    className="pointer-events-auto w-full h-[52px] rounded-[12px] text-[16px] font-[700] tracking-[-0.03em]
            border-[2px] border-border dark:border-border-dark bg-layout-white dark:bg-layout-black text-layout-gray-400 dark:text-layout-gray-100"
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
