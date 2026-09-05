import { motion } from 'framer-motion';
import { EggCrack, Leaf, Plant, Carrot, ArrowUp, ArrowDown } from '@phosphor-icons/react';
import { STABILITY_LEAF_DAYS, STABILITY_CARROT_DAYS } from '../../utils/common';

// 암기 상태(FSRS 기반) 공용 아이콘/색상/랭크 맵.
// 사지선다(components/takeTest/Main.jsx)와 카드맞추기(plugins/questionTypes/cardMatch/*)에서 공용으로 사용.
export const MEMORY_STATE_ICON_MAP = {
  unlearned: <EggCrack size={10} weight="fill" />,
  leaf: <Leaf size={10} weight="fill" />,
  plant: <Plant size={10} weight="fill" />,
  carrot: <Carrot size={10} weight="fill" />,
};

export const MEMORY_STATE_COLOR_MAP = {
  unlearned: { border: 'border-[#9D835A]', text: 'text-[#9D835A]', bg: 'bg-[#FFFCF3] dark:bg-[#FFFCF3]/20' },
  leaf: { border: 'border-[#77CE4F]', text: 'text-[#77CE4F]', bg: 'bg-[#F2FFEB] dark:bg-[#F2FFEB]/20' },
  plant: { border: 'border-[#38CE38]', text: 'text-[#38CE38]', bg: 'bg-[#EBFFEE] dark:bg-[#EBFFEE]/20' },
  carrot: { border: 'border-[#F68300]', text: 'text-[#F68300]', bg: 'bg-[#FFF8E8] dark:bg-[#FFF8E8]/20' },
};

export const MEMORY_STATE_RANK = { unlearned: 0, leaf: 1, plant: 2, carrot: 3 };

// stability 기반 암기 상태 키(FSRS) — 사지선다/카드맞추기 공용 판정 로직
// 경계는 common.jsx 가 단일 소스 — 여기에 숫자를 다시 적으면 배지와 밭이 갈린다.
export const getMemoryStateKeyByStability = (stability, state) => {
  if (!state || state === 'new') return 'unlearned';
  if (stability < STABILITY_LEAF_DAYS) return 'leaf';
  if (stability < STABILITY_CARROT_DAYS) return 'plant';
  return 'carrot';
};

// 암기 상태 변경(상승/강등) 배지.
// - changed=true: 화살표가 통통 튀며 등장하는 애니메이션(상승: 아래→위 / 강등: 위→아래) 후 상태 아이콘 옆에 안착
// - changed=false: 상태 아이콘만 정적으로 페이드인
// size="large"는 사지선다(문제 카드 전체 위), size="small"은 카드맞추기(개별 카드 위)에서 사용.
const MemoryStateChangeBadge = ({ toKey, dir = 'up', changed = false, size = 'small' }) => {
  const colors = MEMORY_STATE_COLOR_MAP[toKey] ?? MEMORY_STATE_COLOR_MAP.unlearned;
  const icon = MEMORY_STATE_ICON_MAP[toKey];
  const isLarge = size === 'large';
  const arrowSize = isLarge ? 10 : 9;
  const arrowOffset = isLarge ? 7 : 6;
  const arrowMidOffset = isLarge ? 4 : 3;
  const ArrowIcon = dir === 'up' ? ArrowUp : ArrowDown;

  if (!changed) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: isLarge ? 0.15 : 0.2 }}
        className={`
          flex items-center justify-center
          w-[18px] h-[18px]
          border rounded-[18px]
          ${colors.border} ${colors.text} ${colors.bg}
        `}
      >
        {icon}
      </motion.div>
    );
  }

  return (
    <motion.div
      className={`
        flex items-center whitespace-nowrap border rounded-[50px]
        ${isLarge ? 'gap-[3px] py-[3px] px-[8px]' : 'gap-[2px] py-[2px] px-[6px]'}
        ${dir === 'up'
          ? `${colors.border} ${colors.text} ${colors.bg}`
          : 'border-layout-gray-200 text-layout-gray-300 bg-layout-gray-50 dark:bg-layout-gray-dark'}
      `}
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 15 }}
    >
      {/* 등장 애니메이션 — 상승: 아래→위 / 강등: 위→아래로 두 번 나타났다 중앙 안착 */}
      <motion.span
        className="flex items-center flex-shrink-0"
        initial={{ y: dir === 'up' ? arrowOffset : -arrowOffset, opacity: 0 }}
        animate={dir === 'up'
          ? { y: [arrowOffset, -arrowMidOffset, arrowOffset, -arrowMidOffset, 0], opacity: [0, 1, 0, 1, 1] }
          : { y: [-arrowOffset, arrowMidOffset, -arrowOffset, arrowMidOffset, 0], opacity: [0, 1, 0, 1, 1] }}
        transition={{ duration: 0.8, times: [0, 0.25, 0.5, 0.75, 1], ease: 'easeInOut' }}
      >
        <ArrowIcon size={arrowSize} weight="bold" />
      </motion.span>
      <span className="flex-shrink-0">{icon}</span>
    </motion.div>
  );
};

export default MemoryStateChangeBadge;
