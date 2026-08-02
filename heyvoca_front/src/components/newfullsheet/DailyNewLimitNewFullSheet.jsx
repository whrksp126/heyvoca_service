import React, { useState } from 'react';
import { Minus, Plus, Sparkle, SortAscending, Info } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useUser } from '../../context/UserContext';
import { updateUserInfoApi } from '../../api/auth';
import { vibrate } from '../../utils/osFunction';
import { readFarmSettings, writeFarmSettings } from '../../utils/farmSettings';
import { SheetBar, GroupLabel, SettingRow, InfoBox, Hint } from './settingsUi';

// 선택 가능한 단계: 0(무제한), 5, 10, 15, 20, 25, 30, 35, 40, 45, 50
const STEP = 5;
const MIN_LIMIT = 5;
const MAX_LIMIT = 50;
const UNLIMITED = 0;

const clampToStep = (value) => {
  if (value <= UNLIMITED) return UNLIMITED;
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.round(value / STEP) * STEP));
};

/**
 * 학습 설정 — 심는 양과 주는 양 (시안 설정 1절 ③).
 * 새 단어 수만 있던 자리에 복습량과 순서가 붙는다.
 * 저장 버튼이 없다 — 고르면 바로 저장된다(기존 음성/테마 설정과 같은 규칙).
 */
const DailyNewLimitNewFullSheet = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { userProfile, setUserProfile } = useUser();

  const rawLimit = userProfile?.daily_new_limit ?? 20;
  const [localLimit, setLocalLimit] = useState(
    rawLimit === UNLIMITED ? UNLIMITED : clampToStep(rawLimit)
  );
  const [farm, setFarm] = useState(readFarmSettings);

  const displayLabel = localLimit === UNLIMITED ? '무제한' : String(localLimit);

  // 값이 바뀌는 즉시 저장한다. 실패하면 이전 값으로 되돌린다.
  const commit = async (next) => {
    const prev = userProfile?.daily_new_limit;
    setLocalLimit(next);
    setUserProfile((p) => ({ ...p, daily_new_limit: next }));
    try {
      const result = await updateUserInfoApi({ daily_new_limit: next });
      if (!result || result.code !== 200) throw new Error('save failed');
    } catch (e) {
      setUserProfile((p) => ({ ...p, daily_new_limit: prev }));
      setLocalLimit(prev === UNLIMITED ? UNLIMITED : clampToStep(prev ?? 20));
    }
  };

  // 감소: 5 → 무제한(0), 나머지 -5
  const handleDecrement = () => {
    vibrate({ duration: 5 });
    if (localLimit === UNLIMITED) return;
    commit(localLimit <= MIN_LIMIT ? UNLIMITED : localLimit - STEP);
  };

  // 증가: 무제한 → 5, 나머지 +5
  const handleIncrement = () => {
    vibrate({ duration: 5 });
    if (localLimit >= MAX_LIMIT) return;
    commit(localLimit === UNLIMITED ? MIN_LIMIT : localLimit + STEP);
  };

  const isDecrementDisabled = localLimit === UNLIMITED;
  const isIncrementDisabled = localLimit >= MAX_LIMIT;

  const toggleFarm = (key) => {
    vibrate({ duration: 5 });
    setFarm(writeFarmSettings({ ...farm, [key]: !farm[key] }));
  };

  const stepBtn = (disabled) =>
    `w-[44px] h-[44px] rounded-[10px] border-[1.5px] flex items-center justify-center ${
      disabled
        ? 'border-[#EEEEEE] text-layout-gray-200 dark:border-[#2A2A2A]'
        : 'border-layout-gray-100 text-layout-gray-400 dark:border-[#3A3A3A] dark:text-layout-gray-200'
    }`;

  return (
    <div className="flex flex-col h-full w-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      <SheetBar title="학습 설정" />

      <div className="flex-1 overflow-y-auto px-[16px] pb-[20px]">
        {/* ── 하루 새 단어 ── */}
        <GroupLabel first>하루 새 단어</GroupLabel>
        <Hint>
          하루에 새로 심을 씨앗 수예요.
          많이 심으면 <b className="font-[700] text-layout-gray-400">나중에 물 줄 작물도 그만큼 늘어요.</b>
        </Hint>
        <div className="flex items-center justify-center gap-[14px] mt-[16px] mb-[4px]">
          <motion.button
            onClick={handleDecrement}
            disabled={isDecrementDisabled}
            className={stepBtn(isDecrementDisabled)}
            whileTap={isDecrementDisabled ? {} : { scale: 0.9 }}
          >
            <Minus size={17} />
          </motion.button>
          <span className="w-[86px] text-center text-[30px] font-[800] tracking-[-0.04em] text-primary-main-600 tabular-nums">
            {displayLabel}
          </span>
          <motion.button
            onClick={handleIncrement}
            disabled={isIncrementDisabled}
            className={stepBtn(isIncrementDisabled)}
            whileTap={isIncrementDisabled ? {} : { scale: 0.9 }}
          >
            <Plus size={17} />
          </motion.button>
        </div>
        <Hint className="text-center">
          5개씩 조절 · 5에서 한 번 더 내리면 <b className="font-[700] text-layout-gray-400">무제한</b>
        </Hint>

        {/* ── 하루 복습량 — 시스템 권장량이 이미 계산되고 있다 (시안 2절) ── */}
        <GroupLabel>하루 복습량</GroupLabel>
        <SettingRow
          first
          icon={<Sparkle size={16} />}
          title="자동으로 맞추기"
          sub="밭 크기에 따라 헤이보카가 정해요"
          toggle={farm.reviewAuto}
          onClick={() => toggleFarm('reviewAuto')}
        />
        <InfoBox tone="blue" icon={<Info size={13} />}>
          권장량을 넘긴 작물 중 <b className="font-[700]">오늘 안 주면 썩는 것</b>은
          자동으로 하루 더 보호돼요. 도구를 쓰지 않아요.
        </InfoBox>

        {/* ── 복습 순서 — CRITICAL 작물을 앞으로 (기획 8.4) ── */}
        <GroupLabel>복습 순서</GroupLabel>
        <SettingRow
          first
          icon={<SortAscending size={16} />}
          title="급한 것부터"
          sub="썩기 직전 작물을 앞으로"
          toggle={farm.reviewUrgentFirst}
          onClick={() => toggleFarm('reviewUrgentFirst')}
        />
      </div>
    </div>
  );
};

export default DailyNewLimitNewFullSheet;
