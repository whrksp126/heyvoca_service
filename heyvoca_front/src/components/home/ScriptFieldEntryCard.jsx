// src/components/home/ScriptFieldEntryCard.jsx
//
// 홈 — "글자 밭"(문자 학습) 진입 카드. 오늘 할 일 카드 바로 아래, 필수 아님(권유 톤) —
// 무겁게 진행률을 보여주지 않고 짧은 한 줄 초대만 한다.

import React from 'react';
import { CaretRight, Translate } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { haptic, SPRING, TAP } from '../../lib/feel';
import { useUser } from '../../context/UserContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import ScriptFieldNewFullSheet from '../newfullsheet/ScriptFieldNewFullSheet';

const COPY = {
  ja: { title: '글자 밭', subtitle: '히라가나·가타카나부터 천천히 읽어봐요' },
  en: { title: '글자 밭', subtitle: '알파벳 이름과 소리부터 익혀봐요' },
};

const ScriptFieldEntryCard = () => {
  "use memo";
  const { learningLang } = useUser();
  const { pushNewFullSheet } = useNewFullSheetActions();
  const copy = COPY[learningLang] || COPY.en;

  return (
    <motion.button
      type="button"
      whileTap={{ scale: TAP.scale }}
      transition={SPRING.snappy}
      onTapStart={() => haptic('light')}
      onClick={() => {
        pushNewFullSheet(ScriptFieldNewFullSheet, {}, { smFull: true, closeOnBackdropClick: true });
      }}
      className="
        flex items-center gap-[12px] w-full
        rounded-[12px] p-[16px] text-left
        bg-layout-white dark:bg-layout-gray-dark
        border border-farm-line dark:border-transparent
      "
    >
      <span className="
        flex items-center justify-center shrink-0
        w-[38px] h-[38px] rounded-[10px]
        bg-primary-main-100 dark:bg-primary-main-dark text-primary-main-600
      ">
        <Translate size={19} weight="bold" />
      </span>
      <span className="flex-1 min-w-0 flex flex-col gap-[2px]">
        <b className="text-[15px] font-[800] text-layout-black dark:text-layout-white">{copy.title}</b>
        <span className="text-[12.5px] font-[600] text-layout-gray-400 truncate">{copy.subtitle}</span>
      </span>
      <CaretRight size={16} className="shrink-0 text-layout-gray-300" />
    </motion.button>
  );
};

export default ScriptFieldEntryCard;
