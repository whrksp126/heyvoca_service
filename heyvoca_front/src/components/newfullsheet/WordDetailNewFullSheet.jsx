import React from 'react';
import { CaretLeft, Plus, SpeakerHigh } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { getTextSound, stripHtmlTags } from '../../utils/common';
import { vibrate } from '../../utils/osFunction';
import AddWordNewBottomSheet from '../newBottomSheet/AddWordNewBottomSheet';

/**
 * OCR matched_words 또는 dictionary selectedWord 형식을 통합 표시용으로 정규화
 * - meanings: (string | {meaning}) → string[]
 * - examples: ({origin, meaning} | {exam_en, exam_ko}) → [{origin, meaning}]
 */
const normalizeWord = (word) => {
  if (!word) return null;

  const meanings = (word.meanings || []).map((m) =>
    typeof m === 'string' ? m : m?.meaning ?? ''
  ).filter(Boolean);

  const examples = (word.examples || []).map((ex) => {
    if (!ex) return null;
    if ('exam_en' in ex || 'exam_ko' in ex) {
      return { origin: ex.exam_en || '', meaning: ex.exam_ko || '' };
    }
    return { origin: ex.origin || '', meaning: ex.meaning || '' };
  }).filter(Boolean);

  return {
    id: word.id,
    word: word.word || word.origin || '',
    pronunciation: word.pronunciation || '',
    meanings,
    examples,
  };
};

const WordDetailNewFullSheet = ({ word }) => {
  "use memo";

  const { popNewFullSheet } = useNewFullSheetActions();
  const { pushNewBottomSheet } = useNewBottomSheetActions();

  const detail = normalizeWord(word);

  const handleAddWord = () => {
    vibrate({ duration: 5 });
    pushNewBottomSheet(AddWordNewBottomSheet, {
      prefillWord: detail?.word,
      prefillMeanings: detail?.meanings,
    });
  };

  if (!detail) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-layout-white dark:bg-layout-black">
        <p className="text-[14px] text-[#999]">단어 정보를 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-layout-white dark:bg-layout-black overflow-y-auto">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      {/* Header */}
      <div
        data-page-header
        className="
          relative
          flex items-center justify-center
          h-[55px]
          pt-[20px] px-[10px] pb-[14px]
        "
      >
        <motion.button
          onClick={() => {
            vibrate({ duration: 5 });
            popNewFullSheet();
          }}
          className="
            absolute top-[18px] left-[10px]
            flex items-center gap-[4px]
            text-layout-gray-200 dark:text-layout-white
            p-[4px]
            rounded-[8px]
          "
          whileHover={{ backgroundColor: 'rgba(0, 0, 0, 0.05)', scale: 1.05 }}
          whileTap={{ scale: 0.95, backgroundColor: 'rgba(0, 0, 0, 0.1)' }}
          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        >
          <CaretLeft size={22} weight="bold" />
        </motion.button>
        <h2 className="text-[16px] font-[700]">사전</h2>
      </div>

      {/* 단어 상세 카드 */}
      <div className="flex flex-col gap-[20px] px-[20px] pb-[20px] pt-[12px]">
        <div className="border border-border dark:border-border-dark rounded-[12px] p-[16px]">
          <div className="flex items-center justify-between">
            <div
              className="flex items-center gap-[8px] cursor-pointer"
              onClick={() => {
                vibrate({ duration: 5 });
                getTextSound(detail.word, 'en');
              }}
            >
              <span className="text-[22px] font-[700] text-layout-black dark:text-layout-white">
                {detail.word}
              </span>
              <SpeakerHigh size={18} className="text-layout-gray-300" />
            </div>
            <button
              onClick={handleAddWord}
              className="flex items-center gap-[4px] px-[10px] py-[6px] rounded-[8px] bg-primary-main-50 dark:bg-[#1a1a2e]"
            >
              <Plus size={16} className="text-primary-main-600" />
              <span className="text-[12px] font-[600] text-primary-main-600">단어장에 추가</span>
            </button>
          </div>

          {detail.pronunciation && (
            <p className="mt-[6px] text-[12px] text-[#999]">/{detail.pronunciation}/</p>
          )}

          {/* 의미 목록 */}
          {detail.meanings.length > 0 && (
            <div className="mt-[12px] flex flex-col gap-[4px]">
              {detail.meanings.map((meaning, i) => (
                <p
                  key={i}
                  className="text-[14px] text-[#555] dark:text-[#aaa] leading-[1.7] cursor-pointer"
                  onClick={() => {
                    vibrate({ duration: 5 });
                    getTextSound(stripHtmlTags(meaning), 'ko');
                  }}
                >
                  <span className="font-[600] text-[#999] mr-[6px]">{i + 1}.</span>
                  {meaning}
                </p>
              ))}
            </div>
          )}

          {/* 예문 목록 */}
          {detail.examples.length > 0 && (
            <div className="mt-[14px] flex flex-col gap-[8px]">
              <p className="text-[11px] font-[600] text-[#bbb] uppercase tracking-wide">예문</p>
              {detail.examples.map((ex, i) => (
                <div
                  key={i}
                  className="bg-layout-gray-50 dark:bg-[#111] rounded-[8px] px-[12px] py-[10px]"
                >
                  <p
                    className="text-[13px] text-layout-black dark:text-layout-white leading-[1.6] italic cursor-pointer"
                    onClick={() => {
                      vibrate({ duration: 5 });
                      getTextSound(stripHtmlTags(ex.origin || ''), 'en');
                    }}
                  >
                    "<span dangerouslySetInnerHTML={{ __html: ex.origin || '' }} />"
                  </p>
                  {ex.meaning && (
                    <p
                      className="text-[12px] text-[#999] mt-[4px] leading-[1.5] cursor-pointer"
                      onClick={() => {
                        vibrate({ duration: 5 });
                        getTextSound(stripHtmlTags(ex.meaning), 'ko');
                      }}
                    >
                      {ex.meaning}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WordDetailNewFullSheet;
