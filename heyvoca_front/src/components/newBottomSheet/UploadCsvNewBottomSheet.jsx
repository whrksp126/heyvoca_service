import React, { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Check, FileCsv, UploadSimple, X } from '@phosphor-icons/react';
import { vibrate, showToast } from '../../utils/osFunction';
import { uploadCsvApi } from '../../api/vocaBooks';
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
export const useUploadCsvNewBottomSheet = () => {
  const { pushAwaitNewBottomSheet, pushNewBottomSheet } = useNewBottomSheet();
  const { addVocabularySheetFromBackend } = useVocabulary();

  const showUploadCsvNewBottomSheet = useCallback(async () => {
    const resultData = await pushAwaitNewBottomSheet(
      UploadCsvNewBottomSheet,
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
          addedCount: resultData?.vocaCount ?? null,
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

  return { showUploadCsvNewBottomSheet };
};

export const UploadCsvNewBottomSheet = () => {
  "use memo";
  const { resolveNewBottomSheet, pushNewBottomSheet } = useNewBottomSheet();
  const [title, setTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [currentColor, setCurrentColor] = useState(VOCABULARY_COLORS[0].value);
  const [isUploading, setIsUploading] = useState(false);
  const [nameError, setNameError] = useState('');
  const [fileError, setFileError] = useState('');
  const [step, setStep] = useState(1);
  const [progress, setProgress] = useState({ label: '단어장 추가 중', done: 0, total: 0 });
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setFileError('.csv 파일만 선택할 수 있어요.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.size > 1 * 1024 * 1024) {
      setFileError('파일 크기는 1MB 이하만 가능해요.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setFileError('');
    setSelectedFile(file);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setFileError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpload = async () => {
    if (isUploading) return;

    let valid = true;
    if (!title.trim()) {
      setNameError('단어장 이름을 입력해주세요.');
      valid = false;
    }
    if (!selectedFile) {
      setFileError('CSV 파일을 선택해주세요.');
      valid = false;
    }
    if (!valid) return;

    setIsUploading(true);
    setProgress({ label: '단어장 추가 중', done: 0, total: 0 });
    setStep('progress');
    try {
      const color = getColorSet(currentColor);
      const result = await uploadCsvApi(selectedFile, title.trim(), color);

      if (result && (result.code === 200 || result.code === 201)) {
        resolveNewBottomSheet(result.data);
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
      console.error('CSV 업로드 오류:', error);
      setStep(1);
      showToast('업로드 중 오류가 발생했어요.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancel = () => {
    vibrate({ duration: 5 });
    if (step === 'progress') {
      // 저장 중 취소 — 응답이 곧 도착할 수 있으나 사용자가 명시적으로 닫으면 무시
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
        title="CSV 불러오기"
        label={progress.label}
        value={progress.done}
        total={progress.total}
        helperText={'파일 크기에 따라 시간이 걸릴 수 있어요.'}
        onCancel={handleCancel}
        cancelDisabled={isUploading}
      />
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center justify-center p-[20px] pb-[0px]">
        <h1 className="text-[18px] font-[700] text-layout-black dark:text-layout-white">CSV 파일 불러오기</h1>
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

        {/* 파일 선택 */}
        <div className="flex flex-col gap-[8px]">
          <h3 className="text-[14px] font-[700] text-layout-black dark:text-layout-white">파일 선택</h3>
          <p className="text-[12px] text-layout-gray-400">
            CSV 헤더: W(단어), M(뜻), EE(예문-문장), EK(예문-뜻)
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileSelect}
            className="hidden"
          />

          {!selectedFile ? (
            <motion.button
              className={`
                flex flex-col items-center justify-center gap-[8px]
                w-full h-[100px]
                border-2 border-dashed
                rounded-[8px]
                text-layout-gray-400
                bg-layout-white dark:bg-layout-black
                transition-colors
                ${fileError ? 'border-red-500' : 'border-layout-gray-200'}
              `}
              onClick={() => fileInputRef.current?.click()}
              whileTap={{ scale: 0.98 }}
            >
              <UploadSimple size={24} weight="bold" />
              <span className="text-[13px]">.csv 파일을 선택하세요</span>
            </motion.button>
          ) : (
            <div className="
              flex items-center justify-between
              w-full px-[15px] py-[12px]
              border border-primary-main-600
              rounded-[8px]
              bg-layout-white dark:bg-layout-black
            ">
              <div className="flex items-center gap-[8px] flex-1 min-w-0">
                <FileCsv size={20} weight="bold" className="text-primary-main-600 shrink-0" />
                <span className="text-[13px] text-layout-black dark:text-layout-white truncate">
                  {selectedFile.name}
                </span>
              </div>
              <motion.button
                onClick={handleRemoveFile}
                whileTap={{ scale: 0.9 }}
                className="shrink-0 ml-[8px]"
              >
                <X size={16} weight="bold" className="text-layout-gray-400" />
              </motion.button>
            </div>
          )}
          {fileError && (
            <p className="mt-[4px] text-[12px] text-red-500">{fileError}</p>
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
          className="flex-1 h-[45px] rounded-[8px] bg-layout-gray-200 text-layout-white dark:text-layout-black text-[16px] font-[700]"
          onClick={handleCancel}
          whileTap={{ scale: 0.95 }}
        >
          취소
        </motion.button>
        <motion.button
          className="flex-1 h-[45px] rounded-[8px] bg-primary-main-600 text-layout-white dark:text-layout-black text-[16px] font-[700]"
          onClick={() => {
            vibrate({ duration: 5 });
            handleUpload();
          }}
          whileTap={{ scale: 0.95 }}
        >
          업로드 하기
        </motion.button>
      </div>
    </div>
  );
};
