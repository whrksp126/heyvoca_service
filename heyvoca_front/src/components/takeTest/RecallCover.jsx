import { AnimatePresence, motion } from 'framer-motion';
import { HandTap } from '@phosphor-icons/react';
import { feel } from '../../lib/feel';

/*
  '먼저 떠올려 보기' 가림막 — 보기 영역 위에 덮는 유리막(frosted glass) 한 장.
  - 보기는 원래 스타일 그대로 레이아웃에 두고(점프 없음), 그 위에 강한 backdrop-blur + 표면색 틴트를 덮는다.
  - 안전장치: backdrop-filter 가 안 먹는 WebView 에서도 읽히지 않도록, 가림 중엔 보기 내용 자체에도
    filter: blur 를 함께 건다(두 겹). 어떤 환경에서도 글자 윤곽이 판독되지 않는다. 공개하면 둘 다 풀린다.
  - 영역 전체가 탭 대상이다(칩·버튼 모양 없이 블러 위에 짧은 안내 문구만).
  className 은 바깥 래퍼용 — 보기 영역이 flex/grid 칸을 채워야 하면 'flex flex-col' 등을 넘긴다.

  variant
    option  사지선다·빈칸 고르기 보기 영역(보기 버튼과 같은 rounded 10)
    card    카드 맞추기 뜻 카드 한 장(rounded 12, 좁아서 글자·아이콘을 줄임)
    chip    조각(칩) 은행 영역
*/
const VARIANTS = {
  option: { radius: 'rounded-[10px]', label: '탭하면 열려요', compact: false },
  card: { radius: 'rounded-[12px]', label: '탭하면 열려요', compact: true },
  chip: { radius: 'rounded-[10px]', label: '탭하면 열려요', compact: false },
};

const RecallCover = ({ covered, onKnow, className = '', variant = 'option', children }) => {
  const v = VARIANTS[variant] ?? VARIANTS.option;
  return (
    <div
      className={`
        relative ${v.radius} ${className}
        ${covered ? 'overflow-hidden' : ''}
        [&>*:not([data-recall-cover])]:transition-[filter] [&>*:not([data-recall-cover])]:duration-[280ms]
        ${covered ? '[&>*:not([data-recall-cover])]:blur-[6px] [&>*:not([data-recall-cover])]:pointer-events-none [&>*:not([data-recall-cover])]:select-none' : ''}
      `}
    >
      {children}
      <AnimatePresence>
        {covered && (
          <motion.button
            key="recall-cover"
            type="button"
            data-recall-cover=""
            aria-label={v.label}
            onClick={(e) => { e.stopPropagation(); feel('tap'); onKnow?.(); }}
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            className={`absolute inset-0 z-[5] flex items-center justify-center cursor-pointer active:opacity-80 transition-opacity ${v.radius} backdrop-blur-[24px] [-webkit-backdrop-filter:blur(24px)]`}
          >
            {/* 표면색 틴트 — 대비를 눌러 윤곽만 어렴풋이 */}
            <span aria-hidden="true" className={`absolute inset-0 ${v.radius} bg-layout-white dark:bg-layout-black opacity-[0.5]`} />
            <span
              className={`
                relative flex items-center justify-center gap-[4px]
                text-layout-gray-400 dark:text-layout-gray-200
                font-[600] tracking-[-0.03em]
                ${v.compact ? 'text-[11px] gap-[3px]' : 'text-[14px]'}
              `}
            >
              <HandTap size={v.compact ? 13 : 17} weight="bold" />
              {v.label}
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RecallCover;
