import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, PencilSimple, Check } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useBottomSheet } from '../../context/BottomSheetContext';

const VOCABULARY_COLORS = [
  { id: 'color-1', value: '#FF8DD4' },
  { id: 'color-2', value: '#CD8DFF' },
  { id: 'color-3', value: '#74D5FF' },
  { id: 'color-4', value: '#42F98B' },
  { id: 'color-5', value: '#FFBD3C' },
];

const useBottomSheetState = () => {
  const [selectedColor, setSelectedColor] = useState(VOCABULARY_COLORS[0].value);
  const { showBottomSheet, hideBottomSheet } = useBottomSheet();

  const handleClose = useCallback(() => {
    hideBottomSheet();
  }, [hideBottomSheet]);

  const handleColorChange = useCallback((newColor) => {
    console.log('handleColorChange')
    setSelectedColor(newColor);
    // 색상이 변경될 때 바로 바텀시트를 업데이트
    showBottomSheet(
      <AddVocabularySheet 
        selectedColor={newColor}  // 새로운 색상 값을 직접 전달
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

  const handleAdd = useCallback((data) => {
    console.log('추가할 단어장 데이터:', data);
    handleClose();
  }, [handleClose]);

  const show = useCallback(() => {
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
    show,
    selectedColor
  };
};

const AddVocabularySheet = ({ selectedColor, setSelectedColor, onCancel, onAdd }) => {
  console.log('AddVocabularySheet')
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

const Header = () => {
  const { show } = useBottomSheetState();
  const buttonVariants = {
    tap: { 
      scale: 0.85,
      rotate: -8,
      backgroundColor: "rgba(255, 141, 212, 0.2)",
      transition: {
        type: "spring",
        stiffness: 500,
        damping: 15
      }
    }
  };

  const handleEditClick = () => {
    console.log('편집 버튼 클릭');
  };

  const handleAddClick = () => {
    console.log('추가 버튼 클릭');
    show();
  };

  return (
    <div className='
      flex items-center justify-between
      w-full h-[55px]
      px-[16px] py-[14px]
      bg-[#fff] 
      dark:bg-[#111]
    '>
      <div className="left">
        <h2
          className="
            text-[16px] font-[400] text-[#000] dark:text-[#fff]
          "
        >
          <strong className="
            text-[#FF8DD4] font-[700]
          ">헤이</strong>의 단어장
          </h2>
      </div>
      <div className="center">

      </div>
      <div className="right">
        <div className="btns flex items-center gap-[10px]">
          <motion.button 
            className="
            rounded-[20px]
              text-[#FF8DD4] text-[20px]
            "
            variants={buttonVariants}
            whileTap="tap"
            transition={{ 
              type: "spring", 
              stiffness: 500, 
              damping: 15
            }}
            onClick={handleEditClick}
            aria-label="단어장 편집"
          >
            <PencilSimple />
          </motion.button>
          <motion.button 
            className="
            rounded-[20px]
              text-[#FF8DD4] text-[20px]
            "
            variants={buttonVariants}
            whileTap="tap"
            transition={{ 
              type: "spring", 
              stiffness: 500, 
              damping: 15
            }}
            onClick={handleAddClick}
            aria-label="새 단어 추가"
          >
            <Plus />
          </motion.button>
        </div>
      </div>
    </div>
  );
};

export default Header; 