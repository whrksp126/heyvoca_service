import React from 'react';
import { motion } from 'framer-motion';
import { PencilSimple, Trash, CaretRight } from '@phosphor-icons/react';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useVocabularySetNewBottomSheet } from './VocabularySetNewBottomSheet';
import { useVocabularyDeleteNewBottomSheet } from './VocabularyDeleteNewBottomSheet';
import { vibrate } from '../../utils/osFunction';

/**
 * 단어장 하나를 다루는 메뉴 — 이름·색 수정 / 삭제.
 *
 * 예전에는 단어장 **목록** 화면의 ✎ 아이콘이 "단어장 편집" 풀시트를 띄웠고,
 * 그 안에서 다시 어느 단어장인지 골라야 했다. 이미 그 단어장을 열어 둔 자리
 * (단어 목록 풀시트)에서 부르면 고르는 단계가 통째로 사라진다.
 *
 * 【모양】 설정 계열이 쓰는 행 규격을 그대로 따른다(settingsUi.jsx · 시안 설정 5·6절) —
 *   아이콘 사각 30px(무채색 면) · 제목 14.5px/700 · 부제 11.5px/500 · 우측 캐럿.
 * 테두리 친 알약 버튼을 나란히 세우던 옛 방식은 두 항목의 무게가 같아 보여서,
 * 되돌릴 수 없는 삭제가 이름 고치기와 똑같은 크기로 눈에 들어왔다.
 * 여기서는 삭제만 빨강을 쓰고 나머지는 무채색이다 — 색이 곧 경고다.
 */
export const VocabularyBookMenuNewBottomSheet = ({ bookId, title, onDeleted }) => {
  const { popNewBottomSheet } = useNewBottomSheetActions();
  const { showVocabularySetNewBottomSheet } = useVocabularySetNewBottomSheet();
  const { showVocabularyDeleteNewBottomSheet } = useVocabularyDeleteNewBottomSheet();

  // 두 동작 모두 자기 시트를 먼저 닫고 다음 시트를 띄운다 — 메뉴가 뒤에 남아 있으면
  // 수정을 마치고 돌아왔을 때 이미 볼 일이 끝난 시트가 다시 보인다.
  const rows = [
    {
      id: 'edit',
      icon: PencilSimple,
      title: '단어장 정보 수정',
      sub: '이름과 색을 바꿔요',
      danger: false,
      onClick: async () => {
        vibrate({ duration: 5 });
        popNewBottomSheet();
        await showVocabularySetNewBottomSheet(bookId);
      },
    },
    {
      id: 'delete',
      icon: Trash,
      title: '단어장 삭제',
      sub: '이 밭과 안에 심은 것이 모두 사라져요',
      danger: true,
      onClick: async () => {
        vibrate({ duration: 5 });
        popNewBottomSheet();
        const deleted = await showVocabularyDeleteNewBottomSheet(bookId);
        // 삭제됐으면 이 단어장을 보고 있던 풀시트도 함께 닫는다.
        // 남겨 두면 사라진 단어장의 빈 껍데기를 계속 보게 된다.
        if (deleted && onDeleted) onDeleted();
      },
    },
  ];

  return (
    <div className="flex flex-col px-[20px] pt-[18px] pb-[20px]">
      <h1 className="max-w-full truncate text-[16px] font-[700] tracking-[-0.03em] text-layout-black dark:text-layout-white">
        {title}
      </h1>

      <div className="mt-[10px]">
        {rows.map((row, idx) => {
          const Icon = row.icon;
          return (
            <motion.button
              key={row.id}
              type="button"
              onClick={row.onClick}
              whileTap={{ scale: 0.99, backgroundColor: 'rgba(0,0,0,0.03)' }}
              className={`
                flex items-center gap-[11px] w-full py-[12px] text-left rounded-[8px]
                ${idx > 0 ? 'border-t border-[#F4F4F4] dark:border-[rgba(255,255,255,.07)]' : ''}
              `}
            >
              <span
                className={`
                  w-[30px] h-[30px] shrink-0 rounded-[9px] flex items-center justify-center
                  ${row.danger
                    ? 'bg-status-error-50 dark:bg-status-error-dark text-status-error-600'
                    : 'bg-layout-gray-50 dark:bg-[#2A2A2A] text-layout-gray-400'}
                `}
              >
                <Icon size={16} weight="fill" />
              </span>

              <span className="flex-1 min-w-0">
                <span
                  className={`block text-[14.5px] font-[700] tracking-[-0.03em] ${
                    row.danger ? 'text-status-error-600' : 'text-layout-black dark:text-layout-white'
                  }`}
                >
                  {row.title}
                </span>
                <small className="block mt-[2px] text-[11.5px] font-[500] tracking-[-0.02em] text-layout-gray-300">
                  {row.sub}
                </small>
              </span>

              <CaretRight size={13} weight="bold" className="shrink-0 text-layout-gray-200" />
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default VocabularyBookMenuNewBottomSheet;
