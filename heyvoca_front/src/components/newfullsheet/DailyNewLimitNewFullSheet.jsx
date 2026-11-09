import React, { useEffect, useRef, useState } from 'react';
import { Minus, Plus } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useUser } from '../../context/UserContext';
import { updateUserInfoApi } from '../../api/auth';
import { vibrate } from '../../utils/osFunction';
import { SheetBar, GroupLabel, Hint } from './settingsUi';

// 하루 새 단어 — 숫자를 자유롭게 정한다(이슈 #25 2차 QA 21). 백엔드(auth.py)와 같은 범위.
export const DAILY_NEW_MIN = 4;
export const DAILY_NEW_MAX = 200;
const DEFAULT_LIMIT = 20;
const SAVE_DELAY_MS = 500;

const clamp = (v) => Math.min(DAILY_NEW_MAX, Math.max(DAILY_NEW_MIN, Math.round(v)));
// 예전 '무제한'(0) 값은 상한으로 보여 준다(서버 값은 사용자가 바꿀 때까지 그대로).
const toDisplay = (raw) => {
  if (raw === null || raw === undefined) return DEFAULT_LIMIT;
  if (raw === 0) return DAILY_NEW_MAX;
  return clamp(raw);
};

/**
 * 학습 설정 — 하루 새 단어 수만 둔다.
 * 저장 버튼이 없다 — 바꾸면 잠시 뒤 자동 저장된다.
 */
const DailyNewLimitNewFullSheet = () => {
  "use memo";

  const { userProfile, setUserProfile } = useUser();

  const [value, setValue] = useState(() => toDisplay(userProfile?.daily_new_limit));
  const [draft, setDraft] = useState(String(value));
  const savedRef = useRef(userProfile?.daily_new_limit);
  const timerRef = useRef(null);

  const pendingRef = useRef(null);
  const saveRef = useRef(null);
  // 시트를 닫을 때 아직 안 보낸 값이 있으면 바로 저장한다
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (pendingRef.current !== null) saveRef.current?.(pendingRef.current);
  }, []);

  const save = async (next) => {
    pendingRef.current = null;
    const prev = savedRef.current;
    if (prev === next) return;
    savedRef.current = next;
    setUserProfile((p) => ({ ...p, daily_new_limit: next }));
    try {
      const result = await updateUserInfoApi({ daily_new_limit: next });
      if (!result || result.code !== 200) throw new Error('save failed');
    } catch (e) {
      savedRef.current = prev;
      setUserProfile((p) => ({ ...p, daily_new_limit: prev }));
      const back = toDisplay(prev);
      setValue(back);
      setDraft(String(back));
    }
  };

  saveRef.current = save;

  const apply = (next, { immediate = false } = {}) => {
    const v = clamp(next);
    setValue(v);
    setDraft(String(v));
    if (timerRef.current) clearTimeout(timerRef.current);
    pendingRef.current = v;
    if (immediate) {
      save(v);
    } else {
      timerRef.current = setTimeout(() => save(v), SAVE_DELAY_MS);
    }
  };

  const step = (delta) => {
    vibrate({ duration: 5 });
    apply(value + delta);
  };

  const commitDraft = () => {
    const n = parseInt(draft, 10);
    apply(Number.isFinite(n) ? n : value, { immediate: true });
  };

  const isMin = value <= DAILY_NEW_MIN;
  const isMax = value >= DAILY_NEW_MAX;

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
        <GroupLabel first>하루 새 단어</GroupLabel>
        <div className="flex items-center justify-center gap-[14px] mt-[16px] mb-[4px]">
          <motion.button
            onClick={() => step(-1)}
            disabled={isMin}
            className={stepBtn(isMin)}
            whileTap={isMin ? {} : { scale: 0.9 }}
            aria-label="줄이기"
          >
            <Minus size={17} />
          </motion.button>
          <input
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            min={DAILY_NEW_MIN}
            max={DAILY_NEW_MAX}
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
            onBlur={commitDraft}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            aria-label="하루 새 단어 수"
            className="w-[96px] h-[44px] rounded-[10px] text-center text-[30px] font-[800] tracking-[-0.04em] tabular-nums text-primary-main-600 bg-transparent outline-none focus:bg-layout-gray-50 dark:focus:bg-layout-gray-dark [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <motion.button
            onClick={() => step(1)}
            disabled={isMax}
            className={stepBtn(isMax)}
            whileTap={isMax ? {} : { scale: 0.9 }}
            aria-label="늘리기"
          >
            <Plus size={17} />
          </motion.button>
        </div>
        <Hint className="text-center">{DAILY_NEW_MIN}~{DAILY_NEW_MAX}개</Hint>
      </div>
    </div>
  );
};

export default DailyNewLimitNewFullSheet;
