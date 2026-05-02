import { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Check, FileArrowUp, UploadSimple, X, SpinnerGap } from '@phosphor-icons/react';
import { vibrate, showToast } from '../../utils/osFunction';
import { uploadAnkiApi, uploadAnkiPreviewApi, createVocaBookApi, appendVocasToBookApi } from '../../api/vocaBooks';
import { useNewBottomSheet } from '../../hooks/useNewBottomSheet';
import { useVocabulary } from '../../context/VocabularyContext';
import { parseApkg, buildVocaListFromMapping } from '../../utils/ankiParser';
import CustomSelect from '../common/CustomSelect';
import ProgressBar from '../common/ProgressBar';
import ImportResultNewBottomSheet from './ImportResultNewBottomSheet';

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

const HEYVOCA_FIELDS = [
  { key: 'word', label: '영단어', required: true },
  { key: 'meaning', label: '뜻', required: true },
  { key: 'pronunciation', label: '발음', required: false },
  { key: 'example', label: '예문', required: false },
  { key: 'exampleMeaning', label: '예문 뜻', required: false },
];

const AUTO_MAPPING_HINTS = {
  word: ['front', 'word', 'english', 'expression', 'term', 'vocabulary', '단어', '영어', 'vocab'],
  meaning: ['back', 'meaning', 'korean', 'definition', 'translation', '뜻', '의미', '한국어', 'answer'],
  pronunciation: ['pronunciation', 'ipa', 'phonetic', 'reading', '발음', 'pron'],
  example: ['example', 'sentence', 'usage', '예문', 'context'],
  exampleMeaning: ['example meaning', 'sentence meaning', 'example_ko', '예문 뜻', '예문뜻', 'sentence_ko'],
};

const autoMapFields = (ankiFields) => {
  const mapping = {};
  const used = new Set();

  for (const hf of HEYVOCA_FIELDS) {
    const hints = AUTO_MAPPING_HINTS[hf.key] || [];
    let matched = null;
    for (const hint of hints) {
      for (const af of ankiFields) {
        if (used.has(af)) continue;
        if (af.toLowerCase().includes(hint)) {
          matched = af;
          break;
        }
      }
      if (matched) break;
    }
    if (matched) {
      mapping[hf.key] = matched;
      used.add(matched);
    } else {
      mapping[hf.key] = null;
    }
  }

  return mapping;
};

const HARD_LIMIT = 300 * 1024 * 1024;
const CHUNK_SIZE = 200;

/**
 * 전용 호출 훅
 */
export const useUploadAnkiNewBottomSheet = () => {
  const { pushAwaitNewBottomSheet, pushNewBottomSheet } = useNewBottomSheet();
  const { addVocabularySheetFromBackend } = useVocabulary();

  const showUploadAnkiNewBottomSheet = useCallback(async () => {
    const resultData = await pushAwaitNewBottomSheet(
      UploadAnkiNewBottomSheet,
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

  return { showUploadAnkiNewBottomSheet };
};

export const UploadAnkiNewBottomSheet = () => {
  "use memo";
  const { resolveNewBottomSheet, pushNewBottomSheet } = useNewBottomSheet();

  const [title, setTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [currentColor, setCurrentColor] = useState(VOCABULARY_COLORS[0].value);
  const [isParsing, setIsParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState({ done: 0, total: 0, label: '' });

  const [step, setStep] = useState(1);
  const [previewData, setPreviewData] = useState(null);
  const [selectedNoteType, setSelectedNoteType] = useState(null);
  const [mapping, setMapping] = useState({});
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0, label: '' });

  const [nameError, setNameError] = useState('');
  const [fileError, setFileError] = useState('');
  const [mappingError, setMappingError] = useState('');

  const fileInputRef = useRef(null);
  const parseCancelRef = useRef({ cancelled: false });

  const focusScroll = (e) => {
    e.target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  };

  // ── Step 1 핸들러 ──

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.apkg')) {
      setFileError('.apkg 파일만 선택할 수 있어요.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.size > HARD_LIMIT) {
      setFileError('파일 크기는 300MB 이하만 가능해요.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setFileError('');
    setSelectedFile(file);
    // 새 파일 → 기존 분석 결과 무효화
    setPreviewData(null);
    setSelectedNoteType(null);
    setMapping({});
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setFileError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    setStep(1);
    setPreviewData(null);
    setSelectedNoteType(null);
    setMapping({});
  };

  const tryFrontendParse = async (file) => {
    setParseProgress({ done: 0, total: 0, label: '파일 압축 해제 중' });
    const result = await parseApkg(file, {
      onProgress: ({ phase, done, total }) => {
        if (phase === 'unzip') {
          setParseProgress({ done: 0, total: 0, label: '파일 압축 해제 중' });
        } else if (phase === 'open-db') {
          setParseProgress({ done: 0, total: 0, label: '데이터베이스 여는 중' });
        } else {
          setParseProgress({ done, total, label: '단어 분석 중' });
        }
      },
    });
    return result;
  };

  // 프론트 파싱이 실패하거나 메모리 한계로 처리 불가할 때 서버에 preview를 요청해 동일한 형태를 받아온다.
  // 결과에 _allNotes는 없으므로 handleUpload에서 백엔드 upload API를 사용한다.
  const tryBackendPreview = async (file) => {
    setParseProgress({ done: 0, total: 0, label: '서버에서 분석 중' });
    const result = await uploadAnkiPreviewApi(file);
    if (result && result.code === 200 && result.data) {
      return result.data;
    }
    throw new Error(result?.message || '서버 분석에 실패했어요.');
  };

  const handleParse = async () => {
    if (isParsing) return;

    let valid = true;
    if (!title.trim()) {
      setNameError('단어장 이름을 입력해주세요.');
      valid = false;
    }
    if (!selectedFile) {
      setFileError('Anki 파일을 선택해주세요.');
      valid = false;
    }
    if (!valid) return;

    // 이미 같은 파일에 대해 분석 결과가 살아있으면 곧바로 매핑 화면으로
    if (previewData && selectedNoteType) {
      setStep(2);
      return;
    }

    parseCancelRef.current = { cancelled: false };
    const token = parseCancelRef.current;

    setIsParsing(true);
    setStep('parsing');
    setParseProgress({ done: 0, total: 0, label: '파일 압축 해제 중' });
    try {
      let result = null;
      try {
        // 모든 파일에 대해 프론트 파싱을 우선 시도
        result = await tryFrontendParse(selectedFile);
      } catch (frontError) {
        if (token.cancelled) return;
        console.warn('프론트 파싱 실패, 서버 분석으로 폴백:', frontError);
        result = await tryBackendPreview(selectedFile);
      }

      if (token.cancelled) return;

      if (!result || !result.noteTypes || result.noteTypes.length === 0) {
        setStep(1);
        pushNewBottomSheet(ImportResultNewBottomSheet, {
          success: false,
          message: '파일에 단어 데이터가 없어요.',
        });
        return;
      }

      setPreviewData(result);
      const firstNt = result.noteTypes[0];
      setSelectedNoteType(firstNt);
      setMapping(autoMapFields(firstNt.fields));
      setStep(2);
    } catch (error) {
      if (token.cancelled) return;
      console.error('Anki 파싱 오류:', error);
      setStep(1);
      pushNewBottomSheet(ImportResultNewBottomSheet, {
        success: false,
        message: error?.message || '파일 분석 중 오류가 발생했어요.\n파일이 손상되었을 수 있어요.',
      });
    } finally {
      if (!token.cancelled) {
        setIsParsing(false);
      }
    }
  };

  // ── Step 2 핸들러 ──

  const handleNoteTypeSelect = (noteTypeId) => {
    const nt = previewData.noteTypes.find((n) => String(n.noteTypeId) === String(noteTypeId));
    if (nt) {
      setSelectedNoteType(nt);
      setMapping(autoMapFields(nt.fields));
      setMappingError('');
    }
  };

  const handleMappingChange = (heyField, ankiField) => {
    setMapping((prev) => ({ ...prev, [heyField]: ankiField || null }));
    if (mappingError) setMappingError('');
  };

  const getMappedSamples = () => {
    if (!selectedNoteType) return [];
    return selectedNoteType.samples.map((sample) => {
      const row = {};
      for (const hf of HEYVOCA_FIELDS) {
        const ankiField = mapping[hf.key];
        row[hf.key] = ankiField ? (sample[ankiField] || '') : '';
      }
      return row;
    });
  };

  const validateMapping = () => {
    if (!mapping.word || !mapping.meaning) {
      return '영단어와 뜻 필드 매핑은 필수예요.';
    }
    if (mapping.word === mapping.meaning) {
      return '영단어와 뜻에 같은 필드를 선택할 수 없어요.';
    }
    const stat = selectedNoteType?.fieldStats?.[mapping.word];
    if (stat && stat.maxLen > 50) {
      return `영단어 필드에 50자를 초과하는 값이 있어요 (최대 ${stat.maxLen}자). 다른 필드를 선택해주세요.`;
    }
    return null;
  };

  const handleUpload = async () => {
    if (isUploading) return;

    const validationError = validateMapping();
    if (validationError) {
      setMappingError(validationError);
      return;
    }

    setIsUploading(true);
    setUploadProgress({ done: 0, total: selectedNoteType?.noteCount || 0, label: '단어 정리 중' });
    setStep('uploading');
    try {
      // 백엔드 preview로 폴백된 경우(_allNotes 없음): 백엔드 upload API로 처리
      if (!selectedNoteType?._allNotes) {
        const color = getColorSet(currentColor);
        setUploadProgress({ done: 0, total: selectedNoteType?.noteCount || 0, label: '서버에 저장 중' });
        const result = await uploadAnkiApi(
          selectedFile,
          title.trim(),
          color,
          mapping,
          selectedNoteType.noteTypeId
        );
        if (result && (result.code === 200 || result.code === 201)) {
          resolveNewBottomSheet(result.data);
        } else {
          const message = result?.message || `업로드에 실패했어요. (코드: ${result?.code || '알 수 없음'})`;
          setStep(2);
          pushNewBottomSheet(ImportResultNewBottomSheet, {
            success: false,
            message,
          });
        }
        return;
      }

      // 매핑 적용해 vocaList 생성 (프론트에서 normalize 적용됨)
      const vocaList = await buildVocaListFromMapping(selectedNoteType, mapping, {
        onProgress: ({ done, total }) => {
          setUploadProgress({ done, total, label: '단어 정리 중' });
        },
      });

      if (vocaList.length === 0) {
        setStep(2);
        pushNewBottomSheet(ImportResultNewBottomSheet, {
          success: false,
          message: '매핑 결과 유효한 단어가 없어요.\n필드 매핑을 확인해주세요.',
        });
        return;
      }

      const color = getColorSet(currentColor);
      const total = vocaList.length;
      let createdBookData = null;
      let saved = 0;

      if (total <= CHUNK_SIZE * 2.5) {
        // 작은 양: 한 번에 생성
        setUploadProgress({ done: 0, total, label: '단어 저장 중' });
        const result = await createVocaBookApi({
          title: title.trim(),
          color,
          vocaList,
        });
        if (!(result && (result.code === 200 || result.code === 201))) {
          const message = result?.message || `업로드에 실패했어요. (코드: ${result?.code || '알 수 없음'})`;
          setStep(2);
          pushNewBottomSheet(ImportResultNewBottomSheet, {
            success: false,
            message,
          });
          return;
        }
        createdBookData = result.data;
        setUploadProgress({ done: total, total, label: '단어 저장 중' });
      } else {
        // 청크 분할 저장
        const firstChunk = vocaList.slice(0, CHUNK_SIZE);
        setUploadProgress({ done: 0, total, label: '단어 저장 중' });
        const firstResult = await createVocaBookApi({
          title: title.trim(),
          color,
          vocaList: firstChunk,
        });
        if (!(firstResult && (firstResult.code === 200 || firstResult.code === 201))) {
          const message = firstResult?.message || '업로드에 실패했어요.';
          setStep(2);
          pushNewBottomSheet(ImportResultNewBottomSheet, {
            success: false,
            message,
          });
          return;
        }
        createdBookData = firstResult.data;
        saved = firstChunk.length;
        setUploadProgress({ done: saved, total, label: '단어 저장 중' });

        const vocaBookId = createdBookData?.vocaBookId;
        if (!vocaBookId) {
          setStep(2);
          pushNewBottomSheet(ImportResultNewBottomSheet, {
            success: false,
            message: '단어장 ID를 받지 못했어요.',
          });
          return;
        }

        for (let i = CHUNK_SIZE; i < total; i += CHUNK_SIZE) {
          const chunk = vocaList.slice(i, i + CHUNK_SIZE);
          // eslint-disable-next-line no-await-in-loop
          const chunkResult = await appendVocasToBookApi(vocaBookId, chunk);
          if (!(chunkResult && (chunkResult.code === 200 || chunkResult.code === 201))) {
            const message = chunkResult?.message || `${i + chunk.length}/${total} 단어 저장 중 오류가 발생했어요.`;
            setStep(2);
            pushNewBottomSheet(ImportResultNewBottomSheet, {
              success: false,
              message,
            });
            return;
          }
          saved += chunk.length;
          setUploadProgress({ done: saved, total, label: '단어 저장 중' });
        }
      }

      // 응답 데이터에 최신 단어 카운트가 들어있을 수 있음
      resolveNewBottomSheet({
        ...createdBookData,
        vocaCount: total,
      });
    } catch (error) {
      console.error('Anki 업로드 오류:', error);
      setStep(2);
      pushNewBottomSheet(ImportResultNewBottomSheet, {
        success: false,
        message: '업로드 중 오류가 발생했어요.',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancel = () => {
    vibrate({ duration: 5 });
    if (step === 2) {
      // 매핑 → 이전: 파일 선택으로 복귀(입력값/분석 결과 모두 유지)
      setMappingError('');
      setStep(1);
    } else if (step === 'parsing') {
      // 분석 중 → 취소: 파일 선택으로 복귀(입력값 유지)
      parseCancelRef.current.cancelled = true;
      setIsParsing(false);
      setStep(1);
    } else {
      resolveNewBottomSheet(null);
    }
  };

  // ── Step 'parsing' / 'uploading': 진행률 시트 (분석/저장 공용) ──
  if (step === 'parsing' || step === 'uploading') {
    const isUploadingPhase = step === 'uploading';
    const progressData = isUploadingPhase ? uploadProgress : parseProgress;
    const headerTitle = isUploadingPhase ? '단어장 저장 중' : '파일 분석 중';
    const fallbackLabel = isUploadingPhase ? '단어장 저장 중' : '파일 분석 중';
    const helperText = isUploadingPhase
      ? '저장이 끝날 때까지 잠시만 기다려주세요.'
      : '파일 크기에 따라 시간이 걸릴 수 있어요.\n취소를 누르면 이전 화면으로 돌아갈 수 있어요.';

    return (
      <div className="relative">
        <div className="flex items-center justify-center p-[20px] pb-[0px]">
          <h1 className="text-[18px] font-[700] text-layout-black dark:text-layout-white">{headerTitle}</h1>
        </div>

        <div className="flex flex-col items-center justify-center gap-[18px] min-h-[260px] px-[24px] pt-[24px] pb-[105px]">
          <SpinnerGap size={36} className="animate-spin text-primary-main-600" />
          <p className="text-[14px] font-[600] text-layout-black dark:text-layout-white">
            {progressData.label || fallbackLabel}
          </p>
          <div className="w-full">
            <ProgressBar
              value={progressData.done}
              total={progressData.total}
              label=""
            />
          </div>
          <p className="text-[12px] text-layout-gray-400 text-center whitespace-pre-line">
            {helperText}
          </p>
        </div>

        <div className="
          absolute bottom-0 left-0 right-0
          flex items-center justify-center gap-[15px]
          p-[20px]
          bg-gradient-to-b from-transparent to-layout-white dark:to-layout-black
        ">
          <motion.button
            className="w-full h-[45px] rounded-[8px] bg-layout-gray-200 text-layout-white dark:text-layout-black text-[16px] font-[700] disabled:opacity-50"
            onClick={handleCancel}
            disabled={isUploadingPhase}
            whileTap={{ scale: 0.95 }}
          >
            취소
          </motion.button>
        </div>
      </div>
    );
  }

  // ── Step 1: 파일 선택 ──
  if (step === 1) {
    return (
      <div className="relative">
        <div className="flex items-center justify-center p-[20px] pb-[0px]">
          <h1 className="text-[18px] font-[700] text-layout-black dark:text-layout-white">Anki 단어장 불러오기</h1>
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
              Anki에서 내보내기한 .apkg 파일을 선택하세요
            </p>

            <input
              ref={fileInputRef}
              type="file"
              // Android WebView/Drive는 .apkg를 application/zip으로 보고하는 경우가 많아
              // MIME 필터를 좁게 두면 파일이 회색 처리되어 선택 불가능해진다.
              // 모든 파일을 허용하고, 확장자 검증은 handleFileSelect에서 수행.
              accept="*/*"
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
                <span className="text-[13px]">.apkg 파일을 선택하세요</span>
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
                  <FileArrowUp size={20} weight="bold" className="text-primary-main-600 shrink-0" />
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
              handleParse();
            }}
            whileTap={{ scale: 0.95 }}
          >
            다음
          </motion.button>
        </div>
      </div>
    );
  }

  // ── Step 2: 필드 매핑 + 미리보기 ──
  const mappedSamples = getMappedSamples();
  const noteTypeOptions = (previewData?.noteTypes || []).map((nt) => ({
    value: String(nt.noteTypeId),
    label: `${nt.noteTypeName} (${nt.noteCount}개)`,
  }));

  return (
    <div className="relative">
      <div className="flex items-center justify-center p-[20px] pb-[0px]">
        <h1 className="text-[18px] font-[700] text-layout-black dark:text-layout-white">필드 매핑</h1>
      </div>

      <div className="flex flex-col gap-[15px] max-h-[calc(90vh-47px)] p-[20px] pb-[105px] overflow-y-auto">
        {/* 노트 타입 선택 (2개 이상일 때만 표시) */}
        {previewData && previewData.noteTypes.length > 1 && (
          <div className="flex justify-between flex-col gap-[8px]">
            <h3 className="text-[14px] font-[700] text-layout-black dark:text-layout-white">노트 타입</h3>
            <CustomSelect
              value={selectedNoteType ? String(selectedNoteType.noteTypeId) : ''}
              onChange={handleNoteTypeSelect}
              options={noteTypeOptions}
              placeholder="노트 타입을 선택하세요"
            />
          </div>
        )}

        {/* 필드 매핑 — 단어 추가 바텀시트와 동일한 폼 구조 */}
        {HEYVOCA_FIELDS.map((hf) => {
          const firstSample = selectedNoteType?.samples?.[0] || {};
          const fieldOptions = (selectedNoteType?.fields || []).map((f) => {
            const raw = (firstSample[f] || '').toString().replace(/\s+/g, ' ').trim();
            const preview = raw.length > 28 ? `${raw.slice(0, 28)}…` : raw;
            return {
              value: f,
              label: f,
              preview,
            };
          });
          return (
            <div key={hf.key} className="flex justify-between flex-col gap-[8px]">
              <h3 className="text-[14px] font-[700] text-layout-black dark:text-layout-white">
                {hf.label}{hf.required && <strong className="text-primary-main-600">*</strong>}
              </h3>
              <CustomSelect
                value={mapping[hf.key] || ''}
                onChange={(v) => handleMappingChange(hf.key, v)}
                options={fieldOptions}
                placeholder="선택 안함"
              />
            </div>
          );
        })}

        {mappingError && (
          <p className="text-[12px] text-red-500">{mappingError}</p>
        )}

        {/* 미리보기 — 단어 추가 바텀시트의 예문 카드 스타일 */}
        {mappedSamples.length > 0 && mapping.word && mapping.meaning && (
          <div className="flex justify-between flex-col gap-[8px]">
            <h3 className="text-[14px] font-[700] text-layout-black dark:text-layout-white">미리보기</h3>
            {(() => {
              const sample = mappedSamples[0];
              return (
                <div className="flex flex-col gap-[5px] p-[15px] rounded-[8px] bg-primary-main-100">
                  <div className="flex items-baseline gap-[8px] flex-wrap">
                    <span className="text-[16px] font-[700] text-layout-black">{sample.word || '-'}</span>
                    {sample.pronunciation && (
                      <span className="text-[12px] text-layout-gray-400">{sample.pronunciation}</span>
                    )}
                  </div>
                  {sample.meaning && (
                    <span className="text-[13px] font-[600] text-primary-main-600">{sample.meaning}</span>
                  )}
                  {(sample.example || sample.exampleMeaning) && (
                    <div className="mt-[5px] pt-[8px] border-t border-layout-gray-200">
                      {sample.example && (
                        <p className="text-[13px] text-layout-black">{sample.example}</p>
                      )}
                      {sample.exampleMeaning && (
                        <p className="text-[12px] text-layout-gray-400 mt-[2px]">{sample.exampleMeaning}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

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
          이전
        </motion.button>
        <motion.button
          className="flex-1 h-[45px] rounded-[8px] bg-primary-main-600 text-layout-white dark:text-layout-black text-[16px] font-[700]"
          onClick={() => {
            vibrate({ duration: 5 });
            handleUpload();
          }}
          whileTap={{ scale: 0.95 }}
        >
          불러오기
        </motion.button>
      </div>
    </div>
  );
};
