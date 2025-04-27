import React, { useState, useRef, useCallback } from 'react';
import { Check } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useBottomSheet } from '../../context/BottomSheetContext';
import { useVocabulary } from '../../context/VocabularyContext';

export const VOCABULARY_COLORS = [
  { id: 'color-1', value: '#FF8DD4' },
  { id: 'color-2', value: '#CD8DFF' },
  { id: 'color-3', value: '#74D5FF' },
  { id: 'color-4', value: '#42F98B' },
  { id: 'color-5', value: '#FFBD3C' },
];

const getColorSet = (mainColor) => {
  switch(mainColor) {
    case '#FF8DD4': return {
        main : "#FF8DD4",
        sub : "#FF8DD44d",
        background : "#FFEFFA"
      };
      case '#CD8DFF': return {
        main : "#CD8DFF",
        sub : "#CD8DFF4d",
        background : "#F8E6FF"
      };
      case '#74D5FF': return {
        main : "#74D5FF",
        sub : "#74D5FF4d",
        background : "#EAF6FF"
      };
      case '#42F98B': return {
        main : "#42F98B",
        sub : "#42F98B4d",
        background : "#E6FFE9"
      };
      case '#FFBD3C': return {
        main : "#FFBD3C",
        sub : "#FFBD3C4d",
        background : "#FFF8E6"
      };
      default: return {
        main : "#FF8DD4",
        sub : "#FF8DD44d",
        background : "#FFEFFA"
      };
  }
};

export const useVocabularySetBottomSheet = () => {
  const [selectedColor, setSelectedColor] = useState(VOCABULARY_COLORS[0].value);
  const { showBottomSheet, hideBottomSheet } = useBottomSheet();
  const { addVocabularySheet } = useVocabulary();

  const handleClose = useCallback(() => {
    hideBottomSheet();
  }, [hideBottomSheet]);

  const handleColorChange = useCallback((newColor) => {
    setSelectedColor(newColor);
    showBottomSheet(
      <AddVocabularySheet 
        selectedColor={newColor}
        setSelectedColor={handleColorChange}
        onCancel={handleClose}
        onAdd={handleAdd}
      />,
      {
        isBackdropClickClosable: false,
        isDragToCloseEnabled: true
      }
    );
  }, [showBottomSheet, handleClose]);

  const handleAdd = useCallback(async (data) => {
    try {
      const newVocabularySheet = {
        title: data.name,
        color: getColorSet(data.color),
        total: 0,
        memorized: 0,
        words: []
      };
      
      await addVocabularySheet(newVocabularySheet);
      handleClose();
    } catch (error) {
      console.error('단어장 추가 실패:', error);
      // TODO: 에러 처리
    }
  }, [handleClose, addVocabularySheet]);

  const showVocabularySetBottomSheet = useCallback(() => {
    showBottomSheet(
      <AddVocabularySheet 
        selectedColor={selectedColor}
        setSelectedColor={handleColorChange}
        onCancel={handleClose}
        onAdd={handleAdd}
      />,
      {
        isBackdropClickClosable: false,
        isDragToCloseEnabled: true
      }
    );
  }, [selectedColor, handleColorChange, handleClose, handleAdd, showBottomSheet]);

  return {
    showVocabularySetBottomSheet,
    selectedColor
  };
};

const AddVocabularySheet = ({ selectedColor, setSelectedColor, onCancel, onAdd }) => {
  const nameInputRef = useRef(null);

  const handleSubmit = () => {
    const vocabularyName = nameInputRef.current?.value || '';
    onAdd({ name: vocabularyName, color: selectedColor });
  };

  return (
    <div className="">
      <div>
        <div className="left"></div>
        <div className="
          flex items-center justify-center
          p-[20px] pb-[0px]
          ">
          <h1 className="text-[18px] font-[700]">단어장 추가</h1>
        </div>
        <div className="right"></div>
      </div>
      <div className="
        flex flex-col gap-[30px]
        p-[20px]
      ">
        <div 
          className="
            flex justify-between flex-col gap-[8px]
          "
        >
          <h3 
            className="
              text-[14px] font-[700] text-[#111] 
            dark:text-[#fff]
            "
          >
            단어장 이름
          </h3>
          <div>
            <input 
              ref={nameInputRef}
              type="text" 
              placeholder="단어장 이름을 입력하세요"
              className="
                w-full h-[45px]
                px-[15px]
                border-[1px] border-[#ccc] rounded-[8px]
                font-[400] text-[14px] text-[#111]
                outline-none
                focus:border-[#FF8DD4]
                transition-colors
              "
            />
          </div>
        </div>
        <div>
          <h3 
            className="
              text-[14px] font-[700] text-[#111] 
            dark:text-[#fff]
            "
          >
            단어장 색상
          </h3>
          <div className="flex items-center justify-between">
            {VOCABULARY_COLORS.map((color) => {
              const isSelected = selectedColor === color.value;
              
              return (
                <motion.label 
                  key={color.id}
                  htmlFor={color.id}
                  style={{ backgroundColor: color.value }}
                  className="
                    flex items-center justify-center
                    w-[30px] h-[30px] rounded-[30px]
                    cursor-pointer
                    relative
                  "
                  whileTap={{ scale: 0.9 }}
                  transition={{ 
                    type: "spring", 
                    stiffness: 500, 
                    damping: 15
                  }}
                >
                  <input 
                    type="radio" 
                    name="color" 
                    id={color.id}
                    className="hidden" 
                    value={color.value}
                    checked={isSelected}
                    onChange={() => setSelectedColor(color.value)}
                  />
                  {isSelected && (
                    <Check 
                      weight="bold" 
                      className="
                        w-[15px] h-[15px] text-[#fff]
                        absolute
                      " 
                    />
                  )}
                </motion.label>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-[15px] p-[20px]">
        <motion.button 
          className="
            flex-1
            h-[45px]
            rounded-[8px]
            bg-[#ccc]
            text-[#fff] text-[16px] font-[700]
          "
          onClick={onCancel}
          whileTap={{ scale: 0.95 }}
          transition={{ 
            type: "spring", 
            stiffness: 500, 
            damping: 15
          }}
        >취소</motion.button>
        <motion.button 
          className="
            flex-1
            h-[45px]
            rounded-[8px]
            bg-[#FF8DD4]
            text-[#fff] text-[16px] font-[700]
          "
          onClick={handleSubmit}
          whileTap={{ scale: 0.95 }}
          transition={{ 
            type: "spring", 
            stiffness: 500, 
            damping: 15
          }}
        >추가</motion.button>
      </div>
    </div>
  );
}; 