import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useVocabulary } from '../../context/VocabularyContext';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { vibrate } from '../../utils/osFunction';
import WordDetaileNewBottomSheet from './WordDetaileNewBottomSheet';

// 한 단어가 여러 단어장에 속해 있을 때, 어떤 단어장 컨텍스트로 상세를 열지 고르는 바텀시트.
// 탭 즉시 해당 단어장의 WordDetaileNewBottomSheet로 교체된다.
const SelectVocaBookForWordNewBottomSheet = ({ vocaIndexId, vocaBookIds }) => {
  "use memo";

  const { vocabularySheets } = useVocabulary();
  const { popNewBottomSheet, pushNewBottomSheet } = useNewBottomSheetActions();

  const targetSheets = useMemo(() => {
    const idSet = new Set(vocaBookIds ?? []);
    return vocabularySheets.filter(sheet => idSet.has(sheet.id));
  }, [vocabularySheets, vocaBookIds]);

  const handleCancel = () => {
    vibrate({ duration: 5 });
    popNewBottomSheet();
  };

  const handleSelect = (sheetId) => {
    vibrate({ duration: 5 });
    popNewBottomSheet();
    pushNewBottomSheet(WordDetaileNewBottomSheet, {
      vocabularyId: sheetId,
      id: vocaIndexId,
    });
  };

  return (
    <div className="">
      <div className="flex flex-col gap-[10px] pt-[20px] px-[20px] pb-[10px]">
        <h3 className="text-layout-black dark:text-layout-white text-[18px] font-[700]">
          어느 단어장의 내용을 볼까요?
        </h3>
        <p className="text-[#666] dark:text-[#999] text-[13px] font-[400]">
          이 단어는 여러 단어장에 포함되어 있어요.
        </p>
      </div>

      <ul className="flex flex-col gap-[10px] px-[20px] pt-[10px] pb-[10px] max-h-[50vh] overflow-y-auto">
        {targetSheets.map((sheet) => {
          const word = sheet.words?.find(w => w.id === vocaIndexId);
          const preview = Array.isArray(word?.meanings) ? word.meanings.join(', ') : '';
          return (
            <motion.li
              key={sheet.id}
              style={{ backgroundColor: sheet.color?.background }}
              className="
                flex flex-col gap-[6px]
                p-[16px]
                rounded-[12px]
                cursor-pointer
              "
              onClick={() => handleSelect(sheet.id)}
              whileTap={{ scale: 0.97 }}
              whileHover={{ scale: 1.02 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <h4 className="text-[15px] font-[700] text-layout-black">{sheet.title}</h4>
              {preview && (
                <p className="text-[13px] text-[#555] line-clamp-2 leading-[1.5]">
                  {preview}
                </p>
              )}
            </motion.li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between gap-[15px] p-[20px]">
        <motion.button
          className="
            flex-1
            h-[45px]
            rounded-[8px]
            bg-layout-gray-200
            text-layout-white dark:text-layout-black text-[16px] font-[700]
          "
          onClick={handleCancel}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 500, damping: 15 }}
        >
          취소
        </motion.button>
      </div>
    </div>
  );
};

export default SelectVocaBookForWordNewBottomSheet;
