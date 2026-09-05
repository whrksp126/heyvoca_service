import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Check } from '@phosphor-icons/react';
import { vibrate, showToast } from '../../utils/osFunction';
import { uploadQuizletApi } from '../../api/voca';
import { useNewBottomSheet } from '../../hooks/useNewBottomSheet';
import { useVocabulary } from '../../context/VocabularyContext';
import ImportResultNewBottomSheet from './ImportResultNewBottomSheet';
import ImportProgressView from '../common/ImportProgressView';

export const VOCABULARY_COLORS = [
  { id: 'color-1', value: '#FF70D4' },
  { id: 'color-2', value: '#CD8DFF' },
  { id: 'color-3', value: '#74D5FF' },
  { id: 'color-4', value: '#42F98B' },
  { id: 'color-5', value: '#FFBD3C' },
];

const getColorSet = (mainColor) => {
  switch (mainColor) {
    case '#FF70D4': return { main: "#FF70D4", sub: "#FF70D44d", background: "var(--primary-main-100)" };
    case '#CD8DFF': return { main: "#CD8DFF", sub: "#CD8DFF4d", background: "#F8E6FF" };
    case '#74D5FF': return { main: "#74D5FF", sub: "#74D5FF4d", background: "#EAF6FF" };
    case '#42F98B': return { main: "#42F98B", sub: "#42F98B4d", background: "#E6FFE9" };
    case '#FFBD3C': return { main: "#FFBD3C", sub: "#FFBD3C4d", background: "#FFF8E6" };
    default: return { main: "#FF70D4", sub: "#FF70D44d", background: "var(--primary-main-100)" };
  }
};

/**
 * 전용 호출 훅
 */
export const useUploadQuizletNewBottomSheet = () => {
  const { pushAwaitNewBottomSheet, pushNewBottomSheet } = useNewBottomSheet();
  const { addVocabularySheetFromBackend } = useVocabulary();

  const showUploadQuizletNewBottomSheet = useCallback(async () => {
    const resultData = await pushAwaitNewBottomSheet(
      UploadQuizletNewBottomSheet,
      {},
      {
        isBackdropClickClosable: true,
        isDragToCloseEnabled: true
      }
    );

    if (resultData) {
      try {
        await addVocabularySheetFromBackend(resultData);
        pushNewBottomSheet(ImportResultNewBottomSheet, {
          success: true,
          title: resultData?.title,
          addedCount: resultData?.total ?? resultData?.vocaCount ?? null,
        });
        return true;
      } catch (error) {
        console.error('단어장 추가 실패:', error);
        pushNewBottomSheet(ImportResultNewBottomSheet, {
          success: false,
          message: '단어장 추가에 실패했어요.\n잠시 후 다시 시도해주세요.',
        });
        return false;
      }
    }
    return false;
  }, [pushAwaitNewBottomSheet, pushNewBottomSheet, addVocabularySheetFromBackend]);

  return { showUploadQuizletNewBottomSheet };
};

export const UploadQuizletNewBottomSheet = () => {
  "use memo";
  const { resolveNewBottomSheet, pushNewBottomSheet } = useNewBottomSheet();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [currentColor, setCurrentColor] = useState(VOCABULARY_COLORS[0].value);
  const [isUploading, setIsUploading] = useState(false);
  const [nameError, setNameError] = useState('');
  const [textError, setTextError] = useState('');
  const [step, setStep] = useState(1);
  const [progress, setProgress] = useState({ label: '단어장 추가 중', done: 0, total: 0 });

  const handleUpload = async () => {
    if (isUploading) return;

    let valid = true;
    if (!title.trim()) {
      setNameError('단어장 이름을 입력해주세요.');
      valid = false;
    }
    if (!text.trim()) {
      setTextError('단어 데이터를 입력해주세요.');
      valid = false;
    }
    if (!valid) return;

    setIsUploading(true);
    setProgress({ label: '단어장 추가 중', done: 0, total: 0 });
    setStep('progress');
    try {
      const result = await uploadQuizletApi(text, title.trim());

      if (result && result.code === 200) {
        const updatedData = {
          ...result.data,
          color: getColorSet(currentColor)
        };
        resolveNewBottomSheet(updatedData);
      } else {
        const message = result?.message || result?.error
          || `업로드에 실패했어요. (코드: ${result?.code || '알 수 없음'})`;
        setStep(1);
        pushNewBottomSheet(ImportResultNewBottomSheet, {
          success: false,
          message,
        });
      }
    } catch (error) {
      console.error('퀴즐렛 업로드 오류:', error);
      setStep(1);
      showToast('업로드 중 오류가 발생했어요.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancel = () => {
    vibrate({ duration: 5 });
    if (step === 'progress') {
      setIsUploading(false);
      setStep(1);
      return;
    }
    resolveNewBottomSheet(null);
  };

  const focusScroll = (e) => {
    e.target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  };

  if (step === 'progress') {
    return (
      <ImportProgressView
        title="퀴즐렛 데이터 추가"
        label={progress.label}
        value={progress.done}
        total={progress.total}
        helperText={'데이터 양에 따라 시간이 걸릴 수 있어요.'}
        onCancel={handleCancel}
        cancelDisabled={isUploading}
      />
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center justify-center p-[20px] pb-[0px]">
        <h1 className="text-[18px] font-[700] text-layout-black dark:text-layout-white">퀴즐렛 데이터 추가</h1>
      </div>

      <div className="flex flex-col gap-[24px] max-h-[calc(90vh-47px)] p-[20px] pb-[105px] overflow-y-auto">
        {/* 단어장 이름 */}
        <div className="flex flex-col gap-[8px]">
          <h3 className="text-[14px] font-[700] text-layout-black dark:text-layout-white">단어장 이름</h3>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (nameError) setNameError('');
            }}
            onFocus={focusScroll}
            placeholder="단어장 이름을 입력하세요"
            className={`
              w-full h-[45px] px-[15px]
              border-[1px] rounded-[8px]
              font-[400] text-[14px] text-layout-black dark:text-layout-white
              bg-layout-white dark:bg-layout-black
              outline-none transition-colors
              ${nameError ? 'border-red-500' : 'border-layout-gray-200 focus:border-primary-main-600'}
            `}
          />
          {nameError && (
            <p className="mt-[4px] text-[12px] text-red-500">{nameError}</p>
          )}
        </div>

        {/* 색상 선택 */}
        <div className="flex flex-col gap-[8px]">
          <h3 className="text-[14px] font-[700] text-layout-black dark:text-layout-white">색상</h3>
          <div className="flex items-center justify-between">
            {VOCABULARY_COLORS.map((color) => {
              const isSelected = currentColor === color.value;
              return (
                <motion.label
                  key={color.id}
                  style={{ backgroundColor: color.value }}
                  className="flex items-center justify-center w-[30px] h-[30px] rounded-full cursor-pointer relative"
                  whileTap={{ scale: 0.9 }}
                >
                  <input
                    type="radio"
                    name="color"
                    className="hidden"
                    value={color.value}
                    checked={isSelected}
                    onChange={() => {
                      vibrate({ duration: 5 });
                      setCurrentColor(color.value);
                    }}
                  />
                  {isSelected && <Check weight="bold" className="w-[15px] h-[15px] text-layout-white" />}
                </motion.label>
              );
            })}
          </div>
        </div>

        {/* 퀴즐렛 텍스트 */}
        <div className="flex flex-col gap-[8px]">
          <h3 className="text-[14px] font-[700] text-layout-black dark:text-layout-white">퀴즐렛 텍스트 붙여넣기</h3>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (textError) setTextError('');
            }}
            onFocus={focusScroll}
            placeholder="텍스트 예시 :&#10;apple, 사과&#10;banana, 바나나&#10;orange, 오렌지"
            className={`
              w-full h-[200px] p-[15px]
              border-[1px] rounded-[8px]
              font-[400] text-[14px] text-layout-black dark:text-layout-white
              bg-layout-white dark:bg-layout-black
              outline-none resize-none transition-colors
              ${textError ? 'border-red-500' : 'border-layout-gray-200 focus:border-primary-main-600'}
            `}
          />
          {textError && (
            <p className="mt-[4px] text-[12px] text-red-500">{textError}</p>
          )}
        </div>
      </div>

      <div className="
        absolute bottom-0 left-0 right-0
        flex items-center justify-between gap-[15px]
        p-[20px]
        bg-gradient-to-b from-transparent to-layout-white dark:to-layout-black
      ">
        <motion.button
          className="flex-1 h-[52px] rounded-[12px] text-[16px] font-[700] tracking-[-0.03em]
            border-[2px] border-border dark:border-border-dark bg-layout-white dark:bg-layout-black text-layout-gray-400 dark:text-layout-gray-100"
          onClick={handleCancel}
          whileTap={{ scale: 0.95 }}
        >
          취소
        </motion.button>
        <motion.button
          className="flex-1 h-[52px] rounded-[12px] bg-primary-main-600 text-layout-white dark:text-layout-black text-[16px] font-[700] tracking-[-0.03em]"
          onClick={() => {
            vibrate({ duration: 5 });
            handleUpload();
          }}
          whileTap={{ scale: 0.95 }}
        >
          추가
        </motion.button>
      </div>
    </div>
  );
};
