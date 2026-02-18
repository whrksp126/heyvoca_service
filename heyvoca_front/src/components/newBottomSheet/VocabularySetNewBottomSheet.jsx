import React, { useState, useRef, useCallback } from 'react';
import { Check } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNewBottomSheet } from '../../hooks/useNewBottomSheet';
import { useVocabulary } from '../../context/VocabularyContext';
import { vibrate } from '../../utils/osFunction';

export const VOCABULARY_COLORS = [
    { id: 'color-1', value: '#FF70D4' },
    { id: 'color-2', value: '#CD8DFF' },
    { id: 'color-3', value: '#74D5FF' },
    { id: 'color-4', value: '#42F98B' },
    { id: 'color-5', value: '#FFBD3C' },
];

const getColorSet = (mainColor) => {
    switch (mainColor) {
        case '#FF70D4': return { main: "#FF70D4", sub: "#FF70D44d", background: "#FFEFFA" };
        case '#CD8DFF': return { main: "#CD8DFF", sub: "#CD8DFF4d", background: "#F8E6FF" };
        case '#74D5FF': return { main: "#74D5FF", sub: "#74D5FF4d", background: "#EAF6FF" };
        case '#42F98B': return { main: "#42F98B", sub: "#42F98B4d", background: "#E6FFE9" };
        case '#FFBD3C': return { main: "#FFBD3C", sub: "#FFBD3C4d", background: "#FFF8E6" };
        default: return { main: "#FF70D4", sub: "#FF70D44d", background: "#FFEFFA" };
    }
};

/**
 * 전용 호출 훅
 */
export const useVocabularySetNewBottomSheet = () => {
    const { pushAwaitNewBottomSheet } = useNewBottomSheet();
    const { addVocabularySheet, updateVocabularySheet, vocabularySheets } = useVocabulary();

    const showVocabularySetNewBottomSheet = useCallback(async (id = null) => {
        let initialData = {
            id: null,
            title: "",
            selectedColor: VOCABULARY_COLORS[0].value
        };

        if (id) {
            const vocabularySheet = vocabularySheets.find(sheet => sheet.id === id);
            if (vocabularySheet) {
                initialData = {
                    id: id,
                    title: vocabularySheet.title,
                    selectedColor: vocabularySheet.color.main
                };
            }
        }

        const result = await pushAwaitNewBottomSheet(
            VocabularySetNewBottomSheet,
            { initialData },
            { isBackdropClickClosable: true, isDragToCloseEnabled: true }
        );

        if (result) {
            try {
                if (id) {
                    await updateVocabularySheet(id, {
                        title: result.name,
                        color: getColorSet(result.color),
                    });
                } else {
                    await addVocabularySheet({
                        title: result.name,
                        color: getColorSet(result.color),
                    });
                }
                return true;
            } catch (error) {
                console.error('단어장 저장 실패:', error);
                return false;
            }
        }
        return false;
    }, [pushAwaitNewBottomSheet, addVocabularySheet, updateVocabularySheet, vocabularySheets]);

    return { showVocabularySetNewBottomSheet };
};

/**
 * 바텀시트 UI 컴포넌트
 */
export const VocabularySetNewBottomSheet = ({ initialData }) => {
    const { resolveNewBottomSheet } = useNewBottomSheet();
    const nameInputRef = useRef(null);
    const [currentColor, setCurrentColor] = useState(initialData.selectedColor);

    const handleSubmit = () => {
        vibrate({ duration: 5 });
        const vocabularyName = nameInputRef.current?.value || '';
        if (!vocabularyName.trim()) return alert('단어장 이름을 입력해주세요.');

        resolveNewBottomSheet({
            name: vocabularyName,
            color: currentColor
        });
    };

    const handleCancel = () => {
        vibrate({ duration: 5 });
        resolveNewBottomSheet(null);
    };

    return (
        <div className="flex flex-col">
            <div className="flex items-center justify-center p-[20px] pb-[0px]">
                <h1 className="text-[18px] font-bold text-[#111] dark:text-[#fff]">
                    단어장 {initialData.id ? "수정" : "생성"}
                </h1>
            </div>

            <div className="flex flex-col gap-[30px] p-[20px]">
                {/* 이름 입력 */}
                <div className="flex flex-col gap-[8px]">
                    <h3 className="text-[14px] font-bold text-[#111] dark:text-[#fff]">단어장 이름</h3>
                    <input
                        ref={nameInputRef}
                        defaultValue={initialData.title}
                        type="text"
                        placeholder="단어장 이름을 입력하세요"
                        className="w-full h-[45px] px-[15px] border border-[#ccc] rounded-[8px] font-normal text-[14px] text-[#111] outline-none focus:border-primary-main-600 transition-colors"
                    />
                </div>

                {/* 색상 선택 */}
                <div className="flex flex-col gap-[8px]">
                    <h3 className="text-[14px] font-bold text-[#111] dark:text-[#fff]">단어장 색상</h3>
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
            </div>

            {/* 버튼 구역 */}
            <div className="flex items-center justify-between gap-[15px] p-[20px]">
                <motion.button
                    className="flex-1 h-[45px] rounded-[8px] bg-[#ccc] text-white text-[16px] font-bold"
                    onClick={handleCancel}
                    whileTap={{ scale: 0.95 }}
                >
                    취소
                </motion.button>
                <motion.button
                    className="flex-1 h-[45px] rounded-[8px] bg-primary-main-600 text-white text-[16px] font-bold"
                    onClick={handleSubmit}
                    whileTap={{ scale: 0.95 }}
                >
                    {initialData.id ? "수정" : "생성"}
                </motion.button>
            </div>
        </div>
    );
};
