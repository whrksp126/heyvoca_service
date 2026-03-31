import React, { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check, Table, CaretRight, ArrowLeft, SpinnerGap } from '@phosphor-icons/react';
import { vibrate } from '../../utils/osFunction';
import { useNewBottomSheet } from '../../hooks/useNewBottomSheet';
import { useVocabulary } from '../../context/VocabularyContext';
import {
  fetchGoogleSheetListApi,
  fetchGoogleSheetTabsApi,
  fetchGoogleSheetDataApi,
  createVocaBookApi,
} from '../../api/vocaBooks';

const VOCABULARY_COLORS = [
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
 * 구글 시트 데이터를 파싱하여 vocaList 형식으로 변환
 * 백엔드 voca_books.py의 Excel 파싱 로직과 동일한 규칙
 */
const parseSheetDataToVocaList = (rows) => {
  if (!rows || rows.length === 0) return [];

  // 첫 행이 헤더인지 자동 감지
  const headerKeywords = new Set(['W', 'M', 'EE', 'EK', 'WORD', 'MEANING', 'EXAMPLE', '단어', '뜻', '예문']);
  const firstRow = rows[0].map((v) => (v || '').toString().trim().toUpperCase());
  const isHeader = firstRow.some((val) => headerKeywords.has(val));

  // 열 인덱스 매핑
  let colWord = 0, colMeaning = 1, colEe = 2, colEk = 3;
  let dataStartIndex = 0;

  if (isHeader) {
    colWord = colMeaning = colEe = colEk = null;
    firstRow.forEach((val, i) => {
      if (['W', 'WORD', '단어'].includes(val)) colWord = i;
      else if (['M', 'MEANING', '뜻'].includes(val)) colMeaning = i;
      else if (['EE', 'EXAMPLE', '예문'].includes(val)) colEe = i;
      else if (val === 'EK') colEk = i;
    });

    if (colWord === null) return { error: '헤더에 단어(W) 열이 없습니다.' };
    if (colMeaning === null) return { error: '헤더에 뜻(M) 열이 없습니다.' };
    dataStartIndex = 1;
  }

  const vocaList = [];
  for (let i = dataStartIndex; i < rows.length; i++) {
    const row = rows[i];
    const word = (colWord !== null && row[colWord]) ? row[colWord].toString().trim() : '';
    const meaning = (colMeaning !== null && row[colMeaning]) ? row[colMeaning].toString().trim() : '';
    const exampleEn = (colEe !== null && row[colEe]) ? row[colEe].toString().trim() : '';
    const exampleKo = (colEk !== null && row[colEk]) ? row[colEk].toString().trim() : '';

    if (!word || !meaning) continue;

    const meanings = meaning.split(',').map((m) => m.trim()).filter(Boolean);
    const examples = exampleEn ? [{ origin: exampleEn, meaning: exampleKo }] : [];

    vocaList.push({ origin: word, meanings, examples });
  }

  return vocaList;
};

// 스텝: 시트 목록 → 탭 선택 → 설정(이름/색상) → 업로드
const STEP = {
  SHEET_LIST: 'SHEET_LIST',
  TAB_SELECT: 'TAB_SELECT',
  SETTINGS: 'SETTINGS',
};

/**
 * 전용 호출 훅
 */
export const useUploadGoogleSheetNewBottomSheet = () => {
  const { pushAwaitNewBottomSheet } = useNewBottomSheet();
  const { addVocabularySheetFromBackend } = useVocabulary();

  const showUploadGoogleSheetNewBottomSheet = useCallback(async (accessToken) => {
    const resultData = await pushAwaitNewBottomSheet(
      UploadGoogleSheetNewBottomSheet,
      { accessToken },
      {
        isBackdropClickClosable: true,
        isDragToCloseEnabled: true,
      }
    );

    if (resultData) {
      try {
        await addVocabularySheetFromBackend(resultData);
        alert('구글 스프레드시트 데이터가 성공적으로 추가되었습니다.');
        return true;
      } catch (error) {
        console.error('단어장 추가 실패:', error);
        alert('단어장 추가에 실패했습니다.');
        return false;
      }
    }
    return false;
  }, [pushAwaitNewBottomSheet, addVocabularySheetFromBackend]);

  return { showUploadGoogleSheetNewBottomSheet };
};

export const UploadGoogleSheetNewBottomSheet = ({ accessToken }) => {
  "use memo";
  const { resolveNewBottomSheet } = useNewBottomSheet();

  const [step, setStep] = useState(STEP.SHEET_LIST);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // 시트 목록
  const [sheetList, setSheetList] = useState([]);
  // 선택된 스프레드시트
  const [selectedSheet, setSelectedSheet] = useState(null);
  // 탭 목록
  const [tabList, setTabList] = useState([]);
  // 선택된 탭
  const [selectedTab, setSelectedTab] = useState(null);

  // 설정
  const [title, setTitle] = useState('');
  const [currentColor, setCurrentColor] = useState(VOCABULARY_COLORS[0].value);

  // 시트 목록 로드
  useEffect(() => {
    const loadSheetList = async () => {
      setIsLoading(true);
      const result = await fetchGoogleSheetListApi(accessToken);
      if (result.code === 200) {
        setSheetList(result.data);
      } else {
        alert(result.message || '스프레드시트 목록을 불러올 수 없습니다.');
      }
      setIsLoading(false);
    };
    loadSheetList();
  }, [accessToken]);

  // 스프레드시트 선택 → 탭 목록 로드
  const handleSelectSheet = useCallback(async (sheet) => {
    vibrate({ duration: 5 });
    setSelectedSheet(sheet);
    setIsLoading(true);

    const result = await fetchGoogleSheetTabsApi(accessToken, sheet.id);
    if (result.code === 200) {
      setTabList(result.data);
      if (result.data.length === 1) {
        // 탭이 1개면 자동 선택 → 설정 단계로
        setSelectedTab(result.data[0]);
        setTitle(sheet.name);
        setStep(STEP.SETTINGS);
      } else {
        setStep(STEP.TAB_SELECT);
      }
    } else {
      alert(result.message || '시트 정보를 불러올 수 없습니다.');
    }
    setIsLoading(false);
  }, [accessToken]);

  // 탭 선택 → 설정 단계로
  const handleSelectTab = useCallback((tab) => {
    vibrate({ duration: 5 });
    setSelectedTab(tab);
    setTitle(selectedSheet?.name || '');
    setStep(STEP.SETTINGS);
  }, [selectedSheet]);

  // 뒤로가기
  const handleBack = useCallback(() => {
    vibrate({ duration: 5 });
    if (step === STEP.TAB_SELECT) {
      setStep(STEP.SHEET_LIST);
      setSelectedSheet(null);
      setTabList([]);
    } else if (step === STEP.SETTINGS) {
      if (tabList.length > 1) {
        setStep(STEP.TAB_SELECT);
      } else {
        setStep(STEP.SHEET_LIST);
        setSelectedSheet(null);
        setTabList([]);
      }
      setSelectedTab(null);
    }
  }, [step, tabList]);

  // 업로드
  const handleUpload = useCallback(async () => {
    if (!title.trim()) return alert('단어장 이름을 입력해주세요.');
    if (isUploading) return;

    setIsUploading(true);
    try {
      // 시트 데이터 조회
      const dataResult = await fetchGoogleSheetDataApi(accessToken, selectedSheet.id, selectedTab.title);
      if (dataResult.code !== 200) {
        alert(dataResult.message || '시트 데이터를 불러올 수 없습니다.');
        return;
      }

      // 파싱
      const parsed = parseSheetDataToVocaList(dataResult.data);
      if (parsed.error) {
        alert(`양식 오류: ${parsed.error}\n\n스프레드시트 양식을 확인해주세요.\n- 1행 헤더: W(단어), M(뜻), EE(예문), EK(예문 뜻)\n- W(단어)와 M(뜻)은 필수입니다.`);
        return;
      }
      if (!parsed.length) {
        alert('시트에 유효한 단어 데이터가 없습니다.\n\n스프레드시트 양식을 확인해주세요.\n- 1행 헤더: W(단어), M(뜻), EE(예문), EK(예문 뜻)\n- W(단어)와 M(뜻)은 필수입니다.');
        return;
      }

      // 백엔드에 단어장 생성 요청
      const color = getColorSet(currentColor);
      const result = await createVocaBookApi({
        title: title.trim(),
        color,
        vocaList: parsed,
      });

      if (result && (result.code === 200 || result.code === 201)) {
        resolveNewBottomSheet(result.data);
      } else {
        const errorMessage = result?.message || result?.error || '업로드에 실패했습니다.';
        alert(errorMessage);
      }
    } catch (error) {
      console.error('구글 시트 업로드 오류:', error);
      alert('업로드 중 오류가 발생했습니다.');
    } finally {
      setIsUploading(false);
    }
  }, [title, currentColor, accessToken, selectedSheet, selectedTab, isUploading, resolveNewBottomSheet]);

  const handleCancel = () => {
    vibrate({ duration: 5 });
    resolveNewBottomSheet(null);
  };

  // 날짜 포맷
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-center p-[20px] pb-[0px] relative">
        {step !== STEP.SHEET_LIST && (
          <motion.button
            className="absolute left-[20px]"
            onClick={handleBack}
            whileTap={{ scale: 0.9 }}
          >
            <ArrowLeft size={20} weight="bold" className="text-layout-black dark:text-layout-white" />
          </motion.button>
        )}
        <h1 className="text-[18px] font-bold text-layout-black dark:text-layout-white">
          {step === STEP.SHEET_LIST && '스프레드시트 선택'}
          {step === STEP.TAB_SELECT && '시트 탭 선택'}
          {step === STEP.SETTINGS && '단어장 설정'}
        </h1>
      </div>

      {/* 로딩 */}
      {isLoading && (
        <div className="flex items-center justify-center py-[40px]">
          <SpinnerGap size={32} weight="bold" className="text-primary-main-600 animate-spin" />
        </div>
      )}

      {/* STEP 1: 스프레드시트 목록 */}
      {!isLoading && step === STEP.SHEET_LIST && (
        <div className="flex flex-col p-[20px] max-h-[400px] overflow-y-auto">
          {sheetList.length === 0 ? (
            <p className="text-center text-[14px] text-layout-gray-400 py-[30px]">
              스프레드시트가 없습니다.
            </p>
          ) : (
            <div className="flex flex-col gap-[8px]">
              {sheetList.map((sheet) => (
                <motion.button
                  key={sheet.id}
                  className="
                    flex items-center gap-[12px]
                    w-full px-[15px] py-[12px]
                    border border-layout-gray-200 dark:border-[#333]
                    rounded-[8px]
                    bg-layout-white dark:bg-[#1A1A1A]
                    text-left
                  "
                  onClick={() => handleSelectSheet(sheet)}
                  whileTap={{ scale: 0.98 }}
                >
                  <Table size={20} weight="bold" className="text-primary-main-600 shrink-0" />
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-[14px] font-medium text-layout-black dark:text-layout-white truncate">
                      {sheet.name}
                    </span>
                    <span className="text-[12px] text-layout-gray-400">
                      {formatDate(sheet.modifiedTime)}
                    </span>
                  </div>
                  <CaretRight size={16} weight="bold" className="text-layout-gray-400 shrink-0" />
                </motion.button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* STEP 2: 탭 선택 */}
      {!isLoading && step === STEP.TAB_SELECT && (
        <div className="flex flex-col p-[20px] max-h-[400px] overflow-y-auto">
          <p className="text-[12px] text-layout-gray-400 mb-[12px]">
            {selectedSheet?.name}
          </p>
          <div className="flex flex-col gap-[8px]">
            {tabList.map((tab) => (
              <motion.button
                key={tab.sheetId}
                className="
                  flex items-center gap-[12px]
                  w-full px-[15px] py-[12px]
                  border border-layout-gray-200 dark:border-[#333]
                  rounded-[8px]
                  bg-layout-white dark:bg-[#1A1A1A]
                  text-left
                "
                onClick={() => handleSelectTab(tab)}
                whileTap={{ scale: 0.98 }}
              >
                <Table size={18} weight="bold" className="text-primary-main-600 shrink-0" />
                <span className="text-[14px] font-medium text-layout-black dark:text-layout-white truncate flex-1">
                  {tab.title}
                </span>
                <CaretRight size={16} weight="bold" className="text-layout-gray-400 shrink-0" />
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* STEP 3: 설정 (이름/색상) */}
      {!isLoading && step === STEP.SETTINGS && (
        <div className="flex flex-col gap-[30px] p-[20px]">
          {/* 선택된 시트 정보 */}
          <div className="flex items-center gap-[8px] px-[12px] py-[8px] bg-primary-main-100 dark:bg-[#2A2A2A] rounded-[8px]">
            <Table size={16} weight="bold" className="text-primary-main-600 shrink-0" />
            <span className="text-[13px] text-layout-black dark:text-layout-white truncate">
              {selectedSheet?.name} {tabList.length > 1 ? `/ ${selectedTab?.title}` : ''}
            </span>
          </div>

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

          {/* 헤더 정보 */}
          <p className="text-[12px] text-layout-gray-400">
            시트 헤더: W(단어), M(뜻), EE(예문-문장), EK(예문-뜻)
          </p>
        </div>
      )}

      {/* 하단 버튼 */}
      {!isLoading && (
        <div className="flex items-center justify-between gap-[15px] p-[20px]">
          <motion.button
            className="flex-1 h-[45px] rounded-[8px] bg-layout-gray-200 text-layout-white dark:text-layout-black text-[16px] font-bold"
            onClick={handleCancel}
            whileTap={{ scale: 0.95 }}
          >
            취소
          </motion.button>
          {step === STEP.SETTINGS && (
            <motion.button
              className="flex-1 h-[45px] rounded-[8px] bg-primary-main-600 text-layout-white dark:text-layout-black text-[16px] font-bold disabled:opacity-50"
              disabled={isUploading}
              onClick={() => {
                vibrate({ duration: 5 });
                handleUpload();
              }}
              whileTap={{ scale: 0.95 }}
            >
              {isUploading ? '업로드 중...' : '불러오기'}
            </motion.button>
          )}
        </div>
      )}
    </div>
  );
};
