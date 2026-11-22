import { AnimatePresence, motion } from 'framer-motion';
import { feel } from '../../lib/feel';

/*
  '먼저 떠올려 보기' 가림막 — 보기 영역을 그대로 두고 그 위에 얹는다(레이아웃·크기 불변).
  covered 가 false 가 되면 블러가 풀리며 걷힌다. 가림 중에는 아래 보기가 눌리지 않는다.
  className 은 바깥 래퍼용 — 보기 영역이 flex/grid 칸을 채워야 하면 'flex flex-col' 등을 넘긴다.
*/
const RecallCover = ({ covered, onKnow, className = '', rounded = 'rounded-[12px]', children }) => (
  <div className={`relative ${className}`}>
    {children}
    <AnimatePresence>
      {covered && (
        <motion.div
          key="recall-cover"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
          className={`
            absolute inset-0 z-[5] flex items-center justify-center ${rounded}
            bg-[color-mix(in_srgb,var(--layout-gray-50)_82%,transparent)]
            backdrop-blur-xl
          `}
        >
          <motion.button
            type="button"
            onClick={() => { feel('tap'); onKnow?.(); }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            className="h-[44px] px-[28px] rounded-[22px] bg-primary-main-600 text-layout-white text-[16px] font-[700] tracking-[-0.03em] shadow-[0_2px_8px_rgba(0,0,0,0.12)]"
          >
            알아요
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

export default RecallCover;
