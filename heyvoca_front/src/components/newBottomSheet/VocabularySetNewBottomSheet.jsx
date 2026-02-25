import React, { useState, useRef, useCallback } from 'react';
import { Check } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNewBottomSheet } from '../../hooks/useNewBottomSheet';
import { useVocabulary } from '../../context/VocabularyContext';
import { vibrate } from '../../utils/osFunction';

export const VOCABULARY_COLORS = [
    { id: 'color-1', value: 'var(--primary-main-500)' },
    { id: 'color-2', value: 'var(--secondary-purple-500)' },
    { id: 'color-3', value: 'var(--secondary-blue-500)' },
    { id: 'color-4', value: 'var(--secondary-mint-500)' },
    { id: 'color-5', value: 'var(--secondary-yellow-500)' },
];

const getColorSet = (mainColor) => {
    switch (mainColor) {
        case 'var(--primary-main-500)': return { main: "var(--primary-main-500)", sub: "var(--primary-main-200)", background: "var(--primary-main-100)" };
        case 'var(--secondary-purple-500)': return { main: "var(--secondary-purple-500)", sub: "var(--secondary-purple-200)", background: "var(--secondary-purple-100)" };
        case 'var(--secondary-blue-500)': return { main: "var(--secondary-blue-500)", sub: "var(--secondary-blue-200)", background: "var(--secondary-blue-100)" };
        case 'var(--secondary-mint-500)': return { main: "var(--secondary-mint-500)", sub: "var(--secondary-mint-200)", background: "var(--secondary-mint-100)" };
        case 'var(--secondary-yellow-500)': return { main: "var(--secondary-yellow-500)", sub: "var(--secondary-yellow-200)", background: "var(--secondary-yellow-100)" };
        default: return { main: "var(--primary-main-500)", sub: "var(--primary-main-200)", background: "var(--primary-main-100)" };
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
                <h1 className="text-[18px] font-bold text-layout-black dark:text-layout-white">
                    단어장 {initialData.id ? "수정" : "생성"}
                </h1>
            </div>

            <div className="flex flex-col gap-[30px] p-[20px]">
                {/* 이름 입력 */}
                <div className="flex flex-col gap-[8px]">
                    <h3 className="text-[14px] font-bold text-layout-black dark:text-layout-white">단어장 이름</h3>
                    <input
                        ref={nameInputRef}
                        defaultValue={initialData.title}
                        type="text"
                        placeholder="단어장 이름을 입력하세요"
                        className="w-full h-[45px] px-[15px] border border-layout-gray-200 rounded-[8px] font-normal text-[14px] text-layout-black outline-none focus:border-primary-main-600 transition-colors"
                    />
                </div>

                {/* 색상 선택 */}
                <div className="flex flex-col gap-[8px]">
                    <h3 className="text-[14px] font-bold text-layout-black dark:text-layout-white">단어장 색상</h3>
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
                    className="flex-1 h-[45px] rounded-[8px] bg-layout-gray-200 text-white dark:text-layout-black text-[16px] font-bold"
                    onClick={handleCancel}
                    whileTap={{ scale: 0.95 }}
                >
                    취소
                </motion.button>
                <motion.button
                    className="flex-1 h-[45px] rounded-[8px] bg-primary-main-600 text-white dark:text-layout-black text-[16px] font-bold"
                    onClick={handleSubmit}
                    whileTap={{ scale: 0.95 }}
                >
                    {initialData.id ? "수정" : "생성"}
                </motion.button>
            </div>
        </div>
    );
};
