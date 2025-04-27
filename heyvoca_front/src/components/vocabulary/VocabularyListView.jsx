import React from 'react';
import { useVocabulary } from '../../context/VocabularyContext';
import { DotsThreeVertical, CaretLeft } from '@phosphor-icons/react';
import { useFullSheet } from '../../context/FullSheetContext';

const VocabularyListView = ({ list }) => {
  const { vocabularyItems = [] } = list;
  const { handleBack } = useFullSheet();

  const CustomBackButton = (
    <button
      onClick={handleBack}
      className="
        flex items-center gap-[4px]
        text-[#111] dark:text-[#fff]
      "
    >
      <CaretLeft size={20} weight="bold" />
      <span className="text-[16px] font-[400]">단어장 목록</span>
    </button>
  );

  return (
    <div className="flex flex-col gap-2 p-4">
      {vocabularyItems.map((item, index) => (
        <div
          key={index}
          className="
            flex items-center justify-between
            p-4
            bg-surface-container dark:bg-surface-container-dark
            rounded-xl
          "
        >
          <div className="flex flex-col gap-1">
            <span className="
              text-base font-medium
              text-on-surface dark:text-on-surface-dark
            ">
              {item.word}
            </span>
            <span className="
              text-sm
              text-on-surface-variant dark:text-on-surface-variant-dark
            ">
              {item.meaning}
            </span>
          </div>
          <DotsThreeVertical size={24} />
        </div>
      ))}
    </div>
  );
};

export default VocabularyListView; 