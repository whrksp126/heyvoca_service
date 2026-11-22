import { AnimatePresence, motion } from 'framer-motion';
import { feel } from '../../lib/feel';

/*
  '먼저 떠올려 보기' 가림막 — 보기 영역 전체를 덮는 불투명한 큰 '알아요' 버튼 하나.
  보기 버튼과 같은 배경·테두리·라운드·글꼴·눌림 효과를 쓴다(variant 로 유형별 모양 선택).
  - 보기는 레이아웃 그대로 두고 투명하게만 만든다(opacity-0) → 공개 시 점프 없음, 비침 없음.
  - covered 가 false 가 되면 버튼이 짧게 페이드아웃하며 보기가 나타난다(블러 없음).
  className 은 바깥 래퍼용 — 보기 영역이 flex/grid 칸을 채워야 하면 'flex flex-col' 등을 넘긴다.

  variant
    option  사지선다·빈칸 고르기 보기 버튼(rounded 10)
    card    카드 맞추기 뜻 카드(rounded 12)
    chip    조각(칩) 은행(칩과 같은 rounded 10 + 아래 두꺼운 테두리)
*/
const VARIANTS = {
  option: { radius: 'rounded-[10px]', text: 'text-[17px]' },
  card: { radius: 'rounded-[12px]', text: 'text-[18px]' },
  chip: { radius: 'rounded-[10px] border-b-[3px] dark:border-[#3A3A3A]', text: 'text-[16px]' },
};

const RecallCover = ({ covered, onKnow, className = '', variant = 'option', children }) => {
  const v = VARIANTS[variant] ?? VARIANTS.option;
  return (
    <div
      className={`
        relative ${className}
        [&>*:not([data-recall-cover])]:transition-opacity [&>*:not([data-recall-cover])]:duration-[280ms]
        ${covered ? '[&>*:not([data-recall-cover])]:opacity-0 [&>*:not([data-recall-cover])]:pointer-events-none' : ''}
      `}
    >
      {children}
      <AnimatePresence>
        {covered && (
          <motion.button
            key="recall-cover"
            type="button"
            data-recall-cover=""
            onClick={() => { feel('tap'); onKnow?.(); }}
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            whileTap={{ scale: 0.97, transition: { type: 'spring', stiffness: 400, damping: 17 } }}
            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            className={`
              absolute inset-0 z-[5] flex items-center justify-center
              border-[1px] border-layout-gray-200
              bg-layout-white dark:bg-layout-black
              text-layout-black dark:text-layout-white
              font-[700] tracking-[-0.03em] ${v.text} ${v.radius}
            `}
          >
            알아요
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RecallCover;
