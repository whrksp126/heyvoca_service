import React, { useState, useRef, useCallback } from 'react';
import { Check } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNewBottomSheet } from '../../hooks/useNewBottomSheet';
import { useVocabulary } from '../../context/VocabularyContext';
import { vibrate } from '../../utils/osFunction'; 

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
  const { pushNewBottomSheet, popNewBottomSheet } = useNewBottomSheet();
  const { addVocabularySheet, updateVocabularySheet, deleteVocabularySheet, vocabularySheets } = useVocabulary();

  // 모든 상태를 추적하기 위한 ref
  const currentStateRef = useRef({
    mode: 'add',
    vocabularyId: null,
    vocabularyTitle: "",
    selectedColor: VOCABULARY_COLORS[0].value
  });

  const handleClose = useCallback(() => {
    popNewBottomSheet();
    currentStateRef.current = {
      mode: 'add',
      vocabularyId: null,
      vocabularyTitle: "",
      selectedColor: VOCABULARY_COLORS[0].value
    };
  }, [popNewBottomSheet]);

  const handleAdd = useCallback(async (data) => {
    try {
      console.log("handleAdd data:", data);
      const newVocabularySheet = {
        title: data.name,
        color: getColorSet(data.color),
      };
      
      await addVocabularySheet(newVocabularySheet);
      handleClose();
    } catch (error) {
      console.error('단어장 추가 실패:', error);
    }
  }, [handleClose, addVocabularySheet]);

  const handleEdit = useCallback(async (data) => {
    try {
      const vocabularyId = currentStateRef.current.vocabularyId;
      const vocabularyTitle = data.name;
      const vocabularyColor = data.color;

      await updateVocabularySheet(vocabularyId, {
        title: vocabularyTitle,
        color: getColorSet(vocabularyColor),
      });
      handleClose();
    } catch (error) {
      console.error('단어장 수정 실패:', error);
    }
  }, [handleClose, updateVocabularySheet]);

  const handleDelete = useCallback(async () => {
    try {
      const vocabularyId = currentStateRef.current.vocabularyId;
      await deleteVocabularySheet(vocabularyId);
      handleClose();
    } catch (error) {
      console.error('단어장 삭제 실패:', error);
    }
  }, [handleClose, deleteVocabularySheet]);

  const handleColorChange = useCallback((newColor) => {
    currentStateRef.current.selectedColor = newColor;
    // 모달을 다시 열지 않고 상태만 업데이트
  }, []);

  const showVocabularySetBottomSheet = useCallback((id=null) => {
    let newMode = 'add';
    let newTitle = "";
    let newColor = VOCABULARY_COLORS[0].value;

    if (id) {
      const vocabularySheet = vocabularySheets.find(sheet => sheet.id === id);
      if (vocabularySheet) {
        newMode = 'edit';
        newTitle = vocabularySheet.title;
        newColor = vocabularySheet.color.main;
      }
    }
    
    // ref 업데이트
    currentStateRef.current = {
      mode: newMode,
      vocabularyId: id,
      vocabularyTitle: newTitle,
      selectedColor: newColor
    };

    pushNewBottomSheet(
      AddVocabularySheet,
      {
        id,
        title: newTitle,
        selectedColor: newColor,
        setSelectedColor: handleColorChange,
        onCancel: handleClose,
        onSet: newMode === 'add' ? handleAdd : handleEdit
      },
      {
        isBackdropClickClosable: false,
        isDragToCloseEnabled: true
      }
    );
  }, [handleColorChange, handleClose, handleAdd, handleEdit, vocabularySheets]);

  const showVocabularyDeleteBottomSheet = useCallback((id) => {
    currentStateRef.current.vocabularyId = id;
    pushNewBottomSheet(
      DeleteVocabularySheet,
      { id, onCancel: handleClose, onDelete: handleDelete },
      { isBackdropClickClosable: false, isDragToCloseEnabled: true }
    );
  }, [handleClose, pushNewBottomSheet]);

  return {
    showVocabularySetBottomSheet,
    showVocabularyDeleteBottomSheet,
    selectedColor: currentStateRef.current.selectedColor
  };
};

export const AddVocabularySheet = ({id, title, selectedColor, setSelectedColor, onCancel, onSet }) => {
  const nameInputRef = useRef(null);
  const [currentColor, setCurrentColor] = useState(selectedColor);

  const handleColorSelect = (newColor) => {
    setCurrentColor(newColor);
    setSelectedColor(newColor);
  };

  const handleSubmit = () => {
    const vocabularyName = nameInputRef.current?.value || '';
    onSet({ id: id, name: vocabularyName, color: currentColor });
  };

  return (
    <div className="">
      <div>
        <div className="left"></div>
        <div className="
          flex items-center justify-center
          p-[20px] pb-[0px]
          ">
          <h1 className="text-[18px] font-[700]">단어장 {id ? "수정" : "추가"}</h1>
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
              defaultValue={title}
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
            단어장 색상
          </h3>
          <div className="flex items-center justify-between">
            {VOCABULARY_COLORS.map((color) => {
              const isSelected = currentColor === color.value;
              
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
                    onChange={() => {
                      vibrate({ duration: 5 });
                      handleColorSelect(color.value);
                    }}
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
          onClick={() => {
            vibrate({ duration: 5 });
            onCancel();
          }}
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
          onClick={() => {
            vibrate({ duration: 5 });
            handleSubmit();
          }}
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

export const DeleteVocabularySheet = ({ id, onCancel, onDelete }) => {
  return (
    <div className="">
      <div className="
        flex flex-col gap-[15px] items-center justify-center 
        pt-[40px] px-[20px] pb-[10px]
      ">
        <h3 className="text-[18px] font-[700]">단어장을 정말 삭제하시겠어요?</h3>
        <p className="text-[14px] font-[400] text-[#111]">삭제 후에는 복구가 불가능해요 😢</p>
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
          onClick={() => {
            vibrate({ duration: 5 });
            onCancel();
          }}
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
          onClick={() => {
            vibrate({ duration: 5 });
            onDelete();
          }}
          whileTap={{ scale: 0.95 }}
          transition={{ 
            type: "spring", 
            stiffness: 500, 
            damping: 15
          }}
        >삭제</motion.button>
      </div>
    </div>
  );
};