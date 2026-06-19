import React, { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check, Table, CaretRight, ArrowLeft, SpinnerGap } from '@phosphor-icons/react';
import { vibrate, showToast } from '../../utils/osFunction';
import { useNewBottomSheet } from '../../hooks/useNewBottomSheet';
import { useVocabulary } from '../../context/VocabularyContext';
import {
  fetchGoogleSheetListApi,
  fetchGoogleSheetTabsApi,
  fetchGoogleSheetDataApi,
  createVocaBookApi,
  appendVocasToBookApi,
} from '../../api/vocaBooks';
import { normalizeTargetWord } from '../../utils/targetWord';
import ImportResultNewBottomSheet from './ImportResultNewBottomSheet';
import ImportProgressView from '../common/ImportProgressView';

const CHUNK_SIZE = 200;

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
 * 1행은 반드시 헤더(W, M 필수 / EE, EK 선택)여야 함
 */
const parseSheetDataToVocaList = (rows) => {
  if (!rows || rows.length === 0) return { error: '시트가 비어 있습니다.' };

  const firstRow = rows[0].map((v) => (v || '').toString().trim().toUpperCase());

  let colWord = null, colMeaning = null, colEe = null, colEk = null;
  firstRow.forEach((val, i) => {
    if (['W', 'WORD', '단어'].includes(val)) colWord = i;
    else if (['M', 'MEANING', '뜻'].includes(val)) colMeaning = i;
    else if (['EE', 'EXAMPLE', '예문'].includes(val)) colEe = i;
    else if (val === 'EK') colEk = i;
  });

  if (colWord === null) return { error: '1행 헤더에 단어(W) 열이 없습니다.' };
  if (colMeaning === null) return { error: '1행 헤더에 뜻(M) 열이 없습니다.' };

  const vocaList = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const word = (colWord !== null && row[colWord]) ? row[colWord].toString().trim() : '';
    const meaning = (colMeaning !== null && row[colMeaning]) ? row[colMeaning].toString().trim() : '';
    const exampleEn = (colEe !== null && row[colEe]) ? row[colEe].toString().trim() : '';
    const exampleKo = (colEk !== null && row[colEk]) ? row[colEk].toString().trim() : '';

    if (!word || !meaning) continue;

    if (word.length > 50) {
      const preview = word.length > 30 ? `${word.slice(0, 30)}…` : word;
      return { error: `단어(W) 열에 50자를 초과하는 값이 있습니다 (${word.length}자): "${preview}". 단어는 50자를 넘지 않도록 해주세요.` };
    }

    const meanings = meaning.split(',').map((m) => m.trim()).filter(Boolean);
    const examples = exampleEn ? [{
      origin: normalizeTargetWord(exampleEn),
      meaning: normalizeTargetWord(exampleKo),
    }] : [];

    vocaList.push({ origin: word, meanings, examples });
  }

  return vocaList;
};

// 스텝: 시트 목록 → 탭 선택 → 설정(이름/색상) → 진행률 → 업로드
const STEP = {
  SHEET_LIST: 'SHEET_LIST',
  TAB_SELECT: 'TAB_SELECT',
  SETTINGS: 'SETTINGS',
  PROGRESS: 'PROGRESS',
};

/**
 * 전용 호출 훅
 */
export const useUploadGoogleSheetNewBottomSheet = () => {
  const { pushAwaitNewBottomSheet, pushNewBottomSheet } = useNewBottomSheet();
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

  return { showUploadGoogleSheetNewBottomSheet };
};

export const UploadGoogleSheetNewBottomSheet = ({ accessToken }) => {
  "use memo";
  const { resolveNewBottomSheet, pushNewBottomSheet } = useNewBottomSheet();

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
  const [nameError, setNameError] = useState('');
  const [progress, setProgress] = useState({ label: '단어장 추가 중', done: 0, total: 0 });
  const previousStepRef = React.useRef(STEP.SETTINGS);

  // 시트 목록 로드
  useEffect(() => {
    const loadSheetList = async () => {
      setIsLoading(true);
      const result = await fetchGoogleSheetListApi(accessToken);
      if (result.code === 200) {
        setSheetList(result.data);
      } else {
        showToast(result.message || '스프레드시트 목록을 불러올 수 없어요.');
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
      showToast(result.message || '시트 정보를 불러올 수 없어요.');
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
    if (isUploading) return;
    if (!title.trim()) {
      setNameError('단어장 이름을 입력해주세요.');
      return;
    }

    setIsUploading(true);
    previousStepRef.current = STEP.SETTINGS;
    setProgress({ label: '단어장 추가 중', done: 0, total: 0 });
    setStep(STEP.PROGRESS);
    try {
      // 시트 데이터 조회
      const dataResult = await fetchGoogleSheetDataApi(accessToken, selectedSheet.id, selectedTab.title);
      if (dataResult.code !== 200) {
        setStep(STEP.SETTINGS);
        pushNewBottomSheet(ImportResultNewBottomSheet, {
          success: false,
          message: dataResult.message || '시트 데이터를 불러올 수 없어요.',
        });
        return;
      }

      // 파싱
      const parsed = parseSheetDataToVocaList(dataResult.data);
      if (parsed.error) {
        setStep(STEP.SETTINGS);
        pushNewBottomSheet(ImportResultNewBottomSheet, {
          success: false,
          message: `양식 오류: ${parsed.error}\n\n스프레드시트 양식을 확인해주세요.\n- 1행 헤더: W(단어), M(뜻), EE(예문), EK(예문 뜻)\n- W(단어)와 M(뜻)은 필수예요.`,
        });
        return;
      }
      if (!parsed.length) {
        setStep(STEP.SETTINGS);
        pushNewBottomSheet(ImportResultNewBottomSheet, {
          success: false,
          message: '시트에 유효한 단어 데이터가 없어요.\n\n2행부터 단어 데이터를 입력했는지 확인해주세요.\n- W(단어)와 M(뜻)은 필수예요.',
        });
        return;
      }

      // 청크 분할 저장 (Anki와 동일 패턴)
      const color = getColorSet(currentColor);
      const total = parsed.length;
      let saved = 0;

      if (total <= CHUNK_SIZE * 2.5) {
        setProgress({ label: '단어장 추가 중', done: 0, total });
        const result = await createVocaBookApi({ title: title.trim(), color, vocaList: parsed });
        if (!(result && (result.code === 200 || result.code === 201))) {
          const message = result?.message || result?.error || '업로드에 실패했어요.';
          setStep(STEP.SETTINGS);
          pushNewBottomSheet(ImportResultNewBottomSheet, { success: false, message });
          return;
        }
        setProgress({ label: '단어장 추가 중', done: total, total });
        resolveNewBottomSheet({ ...result.data, vocaCount: total });
        return;
      }

      // 큰 데이터셋: 첫 청크로 단어장 생성 + 나머지는 append
      setProgress({ label: '단어장 추가 중', done: 0, total });
      const firstChunk = parsed.slice(0, CHUNK_SIZE);
      const firstResult = await createVocaBookApi({ title: title.trim(), color, vocaList: firstChunk });
      if (!(firstResult && (firstResult.code === 200 || firstResult.code === 201))) {
        const message = firstResult?.message || '업로드에 실패했어요.';
        setStep(STEP.SETTINGS);
        pushNewBottomSheet(ImportResultNewBottomSheet, { success: false, message });
        return;
      }
      saved = firstChunk.length;
      setProgress({ label: '단어장 추가 중', done: saved, total });

      const vocaBookId = firstResult.data?.vocaBookId;
      if (!vocaBookId) {
        setStep(STEP.SETTINGS);
        pushNewBottomSheet(ImportResultNewBottomSheet, {
          success: false,
          message: '단어장 ID를 받지 못했어요.',
        });
        return;
      }

      for (let i = CHUNK_SIZE; i < total; i += CHUNK_SIZE) {
        const chunk = parsed.slice(i, i + CHUNK_SIZE);
        // eslint-disable-next-line no-await-in-loop
        const chunkResult = await appendVocasToBookApi(vocaBookId, chunk);
        if (!(chunkResult && (chunkResult.code === 200 || chunkResult.code === 201))) {
          const message = chunkResult?.message || `${i + chunk.length}/${total} 단어 저장 중 오류가 발생했어요.`;
          setStep(STEP.SETTINGS);
          pushNewBottomSheet(ImportResultNewBottomSheet, { success: false, message });
          return;
        }
        saved += chunk.length;
        setProgress({ label: '단어장 추가 중', done: saved, total });
      }

      resolveNewBottomSheet({ ...firstResult.data, vocaCount: total });
    } catch (error) {
      console.error('구글 시트 업로드 오류:', error);
      setStep(STEP.SETTINGS);
      showToast('업로드 중 오류가 발생했어요.');
    } finally {
      setIsUploading(false);
    }
  }, [title, currentColor, accessToken, selectedSheet, selectedTab, isUploading, resolveNewBottomSheet, pushNewBottomSheet]);

  const handleCancel = () => {
    vibrate({ duration: 5 });
    if (step === STEP.PROGRESS) {
      // 진행 중 취소 — 응답이 곧 도착할 수 있으나 사용자가 명시적으로 닫으면 무시
      setIsUploading(false);
      setStep(previousStepRef.current || STEP.SETTINGS);
      return;
    }
    resolveNewBottomSheet(null);
  };

  // 날짜 포맷
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  };

  if (step === STEP.PROGRESS) {
    return (
      <ImportProgressView
        title="구글 스프레드시트 불러오기"
        label={progress.label}
        value={progress.done}
        total={progress.total}
        helperText={'시트 크기에 따라 시간이 걸릴 수 있어요.'}
        onCancel={handleCancel}
        cancelDisabled={isUploading}
      />
    );
  }

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
                    border border-layout-gray-200 dark:border-border-dark
                    rounded-[8px]
                    bg-layout-white dark:bg-layout-gray-dark
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
                  border border-layout-gray-200 dark:border-border-dark
                  rounded-[8px]
                  bg-layout-white dark:bg-layout-gray-dark
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
        <div className="flex flex-col gap-[24px] max-h-[calc(90vh-150px)] p-[20px] pb-[20px] overflow-y-auto">
          {/* 선택된 시트 정보 */}
          <div className="flex items-center gap-[8px] px-[12px] py-[8px] bg-primary-main-100 dark:bg-layout-gray-dark rounded-[8px]">
            <Table size={16} weight="bold" className="text-primary-main-600 shrink-0" />
            <span className="text-[13px] text-layout-black dark:text-layout-white truncate">
              {selectedSheet?.name} {tabList.length > 1 ? `/ ${selectedTab?.title}` : ''}
            </span>
          </div>

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
              onFocus={(e) => e.target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })}
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
              className="flex-1 h-[45px] rounded-[8px] bg-primary-main-600 text-layout-white dark:text-layout-black text-[16px] font-bold"
              onClick={() => {
                vibrate({ duration: 5 });
                handleUpload();
              }}
              whileTap={{ scale: 0.95 }}
            >
              불러오기
            </motion.button>
          )}
        </div>
      )}
    </div>
  );
};
