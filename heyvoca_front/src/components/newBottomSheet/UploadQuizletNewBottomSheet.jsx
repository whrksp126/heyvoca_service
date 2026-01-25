import React, { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Check } from '@phosphor-icons/react';
import { vibrate } from '../../utils/osFunction';
import { uploadQuizletApi } from '../../api/voca';
import { useNewBottomSheet } from '../../hooks/useNewBottomSheet';
import { useVocabulary } from '../../context/VocabularyContext';

export const VOCABULARY_COLORS = [
  { id: 'color-1', value: '#FF8DD4' },
  { id: 'color-2', value: '#CD8DFF' },
  { id: 'color-3', value: '#74D5FF' },
  { id: 'color-4', value: '#42F98B' },
  { id: 'color-5', value: '#FFBD3C' },
];

const getColorSet = (mainColor) => {
  switch (mainColor) {
    case '#FF8DD4': return { main: "#FF8DD4", sub: "#FF8DD44d", background: "#FFEFFA" };
    case '#CD8DFF': return { main: "#CD8DFF", sub: "#CD8DFF4d", background: "#F8E6FF" };
    case '#74D5FF': return { main: "#74D5FF", sub: "#74D5FF4d", background: "#EAF6FF" };
    case '#42F98B': return { main: "#42F98B", sub: "#42F98B4d", background: "#E6FFE9" };
    case '#FFBD3C': return { main: "#FFBD3C", sub: "#FFBD3C4d", background: "#FFF8E6" };
    default: return { main: "#FF8DD4", sub: "#FF8DD44d", background: "#FFEFFA" };
  }
};

/**
 * 전용 호출 훅
 */
export const useUploadQuizletNewBottomSheet = () => {
  const { pushAwaitNewBottomSheet } = useNewBottomSheet();
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
        alert('퀴즐렛 데이터가 성공적으로 추가되었습니다.');
        return true;
      } catch (error) {
        console.error('단어장 추가 실패:', error);
        alert('단어장 추가에 실패했습니다.');
        return false;
      }
    }
    return false;
  }, [pushAwaitNewBottomSheet, addVocabularySheetFromBackend]);

  return { showUploadQuizletNewBottomSheet };
};

export const UploadQuizletNewBottomSheet = () => {
  const { resolveNewBottomSheet } = useNewBottomSheet();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [currentColor, setCurrentColor] = useState(VOCABULARY_COLORS[0].value);
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async () => {
    if (!text.trim() || isUploading) return;
    if (!title.trim()) return alert('단어장 이름을 입력해주세요.');

    try {
      setIsUploading(true);
      const result = await uploadQuizletApi(text, title);

      if (result && result.code === 200) {
        // 백엔드 데이터에 선택한 색상 정보 추가
        const updatedData = {
          ...result.data,
          color: getColorSet(currentColor)
        };
        resolveNewBottomSheet(updatedData);
      } else {
        const errorMessage = result?.message || result?.error || `업로드에 실패했습니다. (코드: ${result?.code || '알 수 없음'})`;
        alert(errorMessage);
      }
    } catch (error) {
      console.error('퀴즐렛 업로드 오류:', error);
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
        <h1 className="text-[18px] font-bold text-[#111] dark:text-[#fff]">퀴즐렛 데이터 추가</h1>
      </div>

      <div className="flex flex-col gap-[30px] p-[20px]">
        {/* 단어장 이름 */}
        <div className="flex flex-col gap-[8px]">
          <h3 className="text-[14px] font-bold text-[#111] dark:text-[#fff]">단어장 이름</h3>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="단어장 이름을 입력하세요"
            className="
              w-full h-[45px] px-[15px]
              border border-[#ccc] rounded-[8px]
              font-normal text-[14px] text-[#111]
              outline-none focus:border-[#FF8DD4]
              transition-colors
            "
          />
        </div>

        {/* 색상 선택 */}
        <div className="flex flex-col gap-[8px]">
          <h3 className="text-[14px] font-bold text-[#111] dark:text-[#fff]">색상</h3>
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
                  {isSelected && <Check weight="bold" className="w-[15px] h-[15px] text-white" />}
                </motion.label>
              );
            })}
          </div>
        </div>

        {/* 퀴즐렛 텍스트 */}
        <div className="flex flex-col gap-[8px]">
          <h3 className="text-[14px] font-bold text-[#111] dark:text-[#fff]">퀴즐렛 텍스트 붙여넣기</h3>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="텍스트 예시 :&#10;apple, 사과&#10;banana, 바나나&#10;orange, 오렌지"
            className="
              w-full h-[200px] p-[15px]
              border border-[#ccc] rounded-[8px]
              font-normal text-[14px] text-[#111]
              outline-none resize-none
              focus:border-[#FF8DD4]
              transition-colors
            "
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-[15px] p-[20px]">
        <motion.button
          className="flex-1 h-[45px] rounded-[8px] bg-[#ccc] text-white text-[16px] font-bold"
          onClick={handleCancel}
          whileTap={{ scale: 0.95 }}
        >
          취소
        </motion.button>
        <motion.button
          className="flex-1 h-[45px] rounded-[8px] bg-[#FF8DD4] text-white text-[16px] font-bold disabled:opacity-50"
          disabled={!text.trim() || isUploading}
          onClick={() => {
            vibrate({ duration: 5 });
            handleUpload();
          }}
          whileTap={{ scale: 0.95 }}
        >
          {isUploading ? '업로드 중...' : '추가'}
        </motion.button>
      </div>
    </div>
  );
};