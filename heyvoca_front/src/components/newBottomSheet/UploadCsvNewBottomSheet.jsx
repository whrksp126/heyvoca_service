import React, { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Check, FileCsv, UploadSimple, X } from '@phosphor-icons/react';
import { vibrate } from '../../utils/osFunction';
import { uploadCsvApi } from '../../api/vocaBooks';
import { useNewBottomSheet } from '../../hooks/useNewBottomSheet';
import { useVocabulary } from '../../context/VocabularyContext';

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
  const { pushAwaitNewBottomSheet } = useNewBottomSheet();
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
        alert('CSV 데이터가 성공적으로 추가되었습니다.');
        return true;
      } catch (error) {
        console.error('단어장 추가 실패:', error);
        alert('단어장 추가에 실패했습니다.');
        return false;
      }
    }
    return false;
  }, [pushAwaitNewBottomSheet, addVocabularySheetFromBackend]);

  return { showUploadCsvNewBottomSheet };
};

export const UploadCsvNewBottomSheet = () => {
  const { resolveNewBottomSheet } = useNewBottomSheet();
  const [title, setTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [currentColor, setCurrentColor] = useState(VOCABULARY_COLORS[0].value);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      // 파일 크기 체크 (1MB 이하)
      if (file.size > 1 * 1024 * 1024) {
        alert('파일 크기는 1MB 이하만 가능합니다.');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || isUploading) return;
    if (!title.trim()) return alert('단어장 이름을 입력해주세요.');

    try {
      setIsUploading(true);
      const color = getColorSet(currentColor);
      const result = await uploadCsvApi(selectedFile, title, color);

      if (result && (result.code === 200 || result.code === 201)) {
        resolveNewBottomSheet(result.data);
      } else {
        const errorMessage = result?.message || result?.error || `업로드에 실패했습니다. (코드: ${result?.code || '알 수 없음'})`;
        alert(errorMessage);
      }
    } catch (error) {
      console.error('CSV 업로드 오류:', error);
      alert('업로드 중 오류가 발생했습니다.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancel = () => {
    vibrate({ duration: 5 });
    resolveNewBottomSheet(null);
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-center p-[20px] pb-[0px]">
        <h1 className="text-[18px] font-bold text-layout-black dark:text-layout-white">CSV 파일 불러오기</h1>
      </div>

      <div className="flex flex-col gap-[30px] p-[20px]">
        {/* 단어장 이름 */}
        <div className="flex flex-col gap-[8px]">
          <h3 className="text-[14px] font-bold text-layout-black dark:text-layout-white">단어장 이름</h3>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="단어장 이름을 입력하세요"
            className="
              w-full h-[45px] px-[15px]
              border border-layout-gray-200 rounded-[8px]
              font-normal text-[14px] text-layout-black dark:text-layout-white
              bg-layout-white dark:bg-layout-black
              outline-none focus:border-primary-main-600
              transition-colors
            "
          />
        </div>

        {/* 색상 선택 */}
        <div className="flex flex-col gap-[8px]">
          <h3 className="text-[14px] font-bold text-layout-black dark:text-layout-white">색상</h3>
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
          <h3 className="text-[14px] font-bold text-layout-black dark:text-layout-white">파일 선택</h3>
          <p className="text-[12px] text-layout-gray-400">
            CSV 파일 형식: 1열(단어), 2열(뜻), 3열(예문-문장), 4열(예문-뜻)
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            className="hidden"
          />

          {!selectedFile ? (
            <motion.button
              className="
                flex flex-col items-center justify-center gap-[8px]
                w-full h-[100px]
                border-2 border-dashed border-layout-gray-200
                rounded-[8px]
                text-layout-gray-400
                bg-layout-white dark:bg-layout-black
                transition-colors
              "
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
        </div>
      </div>

      <div className="flex items-center justify-between gap-[15px] p-[20px]">
        <motion.button
          className="flex-1 h-[45px] rounded-[8px] bg-layout-gray-200 text-layout-white dark:text-layout-black text-[16px] font-bold"
          onClick={handleCancel}
          whileTap={{ scale: 0.95 }}
        >
          취소
        </motion.button>
        <motion.button
          className="flex-1 h-[45px] rounded-[8px] bg-primary-main-600 text-layout-white dark:text-layout-black text-[16px] font-bold disabled:opacity-50"
          disabled={!selectedFile || isUploading}
          onClick={() => {
            vibrate({ duration: 5 });
            handleUpload();
          }}
          whileTap={{ scale: 0.95 }}
        >
          {isUploading ? '업로드 중...' : '업로드 하기'}
        </motion.button>
      </div>
    </div>
  );
};
