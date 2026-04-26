import { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Check, FileArrowUp, UploadSimple, X, CaretDown, SpinnerGap } from '@phosphor-icons/react';
import { vibrate } from '../../utils/osFunction';
import { uploadAnkiPreviewApi, uploadAnkiApi } from '../../api/vocaBooks';
import { useNewBottomSheet } from '../../hooks/useNewBottomSheet';
import { useVocabulary } from '../../context/VocabularyContext';

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

/**
 * 전용 호출 훅
 */
export const useUploadAnkiNewBottomSheet = () => {
  const { pushAwaitNewBottomSheet } = useNewBottomSheet();
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
        alert('Anki 단어장이 성공적으로 추가되었습니다.');
        return true;
      } catch (error) {
        console.error('단어장 추가 실패:', error);
        alert('단어장 추가에 실패했습니다.');
        return false;
      }
    }
    return false;
  }, [pushAwaitNewBottomSheet, addVocabularySheetFromBackend]);

  return { showUploadAnkiNewBottomSheet };
};

export const UploadAnkiNewBottomSheet = () => {
  "use memo";
  const { resolveNewBottomSheet } = useNewBottomSheet();

  // Step 1 상태
  const [title, setTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [currentColor, setCurrentColor] = useState(VOCABULARY_COLORS[0].value);
  const [isParsing, setIsParsing] = useState(false);

  // Step 2 상태
  const [step, setStep] = useState(1);
  const [previewData, setPreviewData] = useState(null);
  const [selectedNoteType, setSelectedNoteType] = useState(null);
  const [mapping, setMapping] = useState({});
  const [isUploading, setIsUploading] = useState(false);
  const [showNoteTypeDropdown, setShowNoteTypeDropdown] = useState(false);

  const fileInputRef = useRef(null);

  // ── Step 1 핸들러 ──

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 300 * 1024 * 1024) {
        alert('파일 크기는 300MB 이하만 가능합니다.');
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
    // Step 1으로 초기화
    setStep(1);
    setPreviewData(null);
    setSelectedNoteType(null);
    setMapping({});
  };

  const handleParse = async () => {
    if (!selectedFile || isParsing) return;
    if (!title.trim()) return alert('단어장 이름을 입력해주세요.');

    try {
      setIsParsing(true);
      const result = await uploadAnkiPreviewApi(selectedFile);

      if (result && result.code === 200 && result.data) {
        const data = result.data;
        setPreviewData(data);

        // 노트 타입 자동 선택 (1개면 자동, 여러 개면 첫 번째)
        const firstNt = data.noteTypes[0];
        setSelectedNoteType(firstNt);

        // 자동 필드 매핑
        const autoMapping = autoMapFields(firstNt.fields);
        setMapping(autoMapping);

        setStep(2);
      } else {
        const errorMessage = result?.message || '파일 파싱에 실패했습니다.';
        alert(errorMessage);
      }
    } catch (error) {
      console.error('Anki 파싱 오류:', error);
      alert('파일 파싱 중 오류가 발생했습니다.');
    } finally {
      setIsParsing(false);
    }
  };

  // ── Step 2 핸들러 ──

  const handleNoteTypeSelect = (nt) => {
    setSelectedNoteType(nt);
    setMapping(autoMapFields(nt.fields));
    setShowNoteTypeDropdown(false);
  };

  const handleMappingChange = (heyField, ankiField) => {
    setMapping(prev => ({ ...prev, [heyField]: ankiField || null }));
  };

  const getMappedSamples = () => {
    if (!selectedNoteType) return [];
    return selectedNoteType.samples.map(sample => {
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
      return '영단어와 뜻 필드 매핑은 필수입니다.';
    }

    const samples = selectedNoteType?.samples || [];
    if (samples.length === 0) return null;

    // word 빈 값 체크
    const emptyWords = samples.filter(s => !(mapping.word && (s[mapping.word] || '').replace(/<[^>]+>/g, '').replace(/\[sound:[^\]]*\]/g, '').trim()));
    if (emptyWords.length === samples.length) {
      return '영단어(word) 필드에 유효한 값이 없습니다. 다른 필드를 선택해주세요.';
    }

    // meaning 빈 값 체크
    const emptyMeanings = samples.filter(s => !(mapping.meaning && (s[mapping.meaning] || '').replace(/<[^>]+>/g, '').replace(/\[sound:[^\]]*\]/g, '').trim()));
    if (emptyMeanings.length === samples.length) {
      return '뜻(meaning) 필드에 유효한 값이 없습니다. 다른 필드를 선택해주세요.';
    }

    // word 길이 체크: 50자 초과 즉시 거부 (영단어가 50자를 넘는 경우는 사실상 없음)
    // 백엔드가 내려준 전체 노트 기준 통계(fieldStats)를 우선 사용한다.
    // 통계가 없는 구버전 응답은 샘플 5개로 폴백.
    const fieldStats = selectedNoteType?.fieldStats || null;
    const stat = fieldStats ? fieldStats[mapping.word] : null;

    if (stat && stat.nonEmptyCount > 0) {
      if (stat.maxLen > 50) {
        return `영단어(word) 필드에 50자를 초과하는 값이 있습니다 (최대 ${stat.maxLen}자). 단어는 50자를 넘지 않도록 해주세요.`;
      }
    } else {
      const overLen = samples
        .map(s => (s[mapping.word] || '').replace(/<[^>]+>/g, '').replace(/\[sound:[^\]]*\]/g, '').trim().length)
        .find(l => l > 50);
      if (overLen) {
        return `영단어(word) 필드에 50자를 초과하는 값이 있습니다 (${overLen}자). 단어는 50자를 넘지 않도록 해주세요.`;
      }
    }

    // word와 meaning에 같은 필드를 선택한 경우
    if (mapping.word === mapping.meaning) {
      return '영단어와 뜻에 같은 필드를 선택할 수 없습니다.';
    }

    return null;
  };

  const handleUpload = async () => {
    if (isUploading) return;

    const validationError = validateMapping();
    if (validationError) {
      return alert(validationError);
    }

    try {
      setIsUploading(true);
      const color = getColorSet(currentColor);
      const result = await uploadAnkiApi(
        selectedFile,
        title,
        color,
        mapping,
        selectedNoteType.noteTypeId
      );

      if (result && (result.code === 200 || result.code === 201)) {
        resolveNewBottomSheet(result.data);
      } else {
        const errorMessage = result?.message || `업로드에 실패했습니다. (코드: ${result?.code || '알 수 없음'})`;
        alert(errorMessage);
      }
    } catch (error) {
      console.error('Anki 업로드 오류:', error);
      alert('업로드 중 오류가 발생했습니다.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancel = () => {
    vibrate({ duration: 5 });
    if (step === 2) {
      setStep(1);
      setPreviewData(null);
      setSelectedNoteType(null);
      setMapping({});
    } else {
      resolveNewBottomSheet(null);
    }
  };

  // ── Step 1: 파일 선택 ──
  if (step === 1) {
    return (
      <div className="flex flex-col">
        <div className="flex items-center justify-center p-[20px] pb-[0px]">
          <h1 className="text-[18px] font-bold text-layout-black dark:text-layout-white">Anki 단어장 불러오기</h1>
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
              Anki에서 내보내기한 .apkg 파일을 선택하세요
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".apkg"
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
            disabled={!selectedFile || isParsing}
            onClick={() => {
              vibrate({ duration: 5 });
              handleParse();
            }}
            whileTap={{ scale: 0.95 }}
          >
            {isParsing ? (
              <span className="flex items-center justify-center gap-[6px]">
                <SpinnerGap size={18} className="animate-spin" />
                파싱 중...
              </span>
            ) : '다음'}
          </motion.button>
        </div>
      </div>
    );
  }

  // ── Step 2: 필드 매핑 + 미리보기 ──
  const mappedSamples = getMappedSamples();

  return (
    <div className="flex flex-col max-h-[80vh]">
      <div className="flex items-center justify-center p-[20px] pb-[0px]">
        <h1 className="text-[18px] font-bold text-layout-black dark:text-layout-white">필드 매핑</h1>
      </div>

      <div className="flex flex-col gap-[20px] p-[20px] overflow-y-auto">
        {/* 노트 타입 선택 (2개 이상일 때만 표시) */}
        {previewData && previewData.noteTypes.length > 1 && (
          <div className="flex flex-col gap-[8px]">
            <h3 className="text-[14px] font-bold text-layout-black dark:text-layout-white">노트 타입 선택</h3>
            <div className="relative">
              <motion.button
                className="
                  flex items-center justify-between
                  w-full h-[40px] px-[12px]
                  border border-layout-gray-200 rounded-[8px]
                  bg-layout-white dark:bg-layout-black
                  text-[13px] text-layout-black dark:text-layout-white
                "
                onClick={() => setShowNoteTypeDropdown(!showNoteTypeDropdown)}
                whileTap={{ scale: 0.98 }}
              >
                <span>{selectedNoteType?.noteTypeName} ({selectedNoteType?.noteCount}개)</span>
                <CaretDown size={14} weight="bold" className={`transition-transform ${showNoteTypeDropdown ? 'rotate-180' : ''}`} />
              </motion.button>

              {showNoteTypeDropdown && (
                <div className="absolute top-[44px] left-0 right-0 z-10 border border-layout-gray-200 rounded-[8px] bg-layout-white dark:bg-layout-black shadow-lg overflow-hidden">
                  {previewData.noteTypes.map((nt) => (
                    <motion.button
                      key={nt.noteTypeId}
                      className={`
                        w-full px-[12px] py-[10px] text-left text-[13px]
                        ${selectedNoteType?.noteTypeId === nt.noteTypeId
                          ? 'bg-primary-main-600 bg-opacity-10 text-primary-main-600 font-bold'
                          : 'text-layout-black dark:text-layout-white'
                        }
                      `}
                      onClick={() => handleNoteTypeSelect(nt)}
                      whileTap={{ scale: 0.98 }}
                    >
                      {nt.noteTypeName} ({nt.noteCount}개)
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 필드 매핑 */}
        <div className="flex flex-col gap-[8px]">
          <h3 className="text-[14px] font-bold text-layout-black dark:text-layout-white">필드 매핑</h3>
          <p className="text-[12px] text-layout-gray-400">
            Anki 필드를 heyvoca 필드에 연결하세요
          </p>

          <div className="flex flex-col gap-[10px]">
            {HEYVOCA_FIELDS.map((hf) => (
              <div key={hf.key} className="flex items-center gap-[10px]">
                <span className={`w-[80px] shrink-0 text-[13px] ${hf.required ? 'font-bold text-layout-black dark:text-layout-white' : 'text-layout-gray-400'}`}>
                  {hf.label}{hf.required ? ' *' : ''}
                </span>
                <select
                  value={mapping[hf.key] || ''}
                  onChange={(e) => handleMappingChange(hf.key, e.target.value)}
                  className="
                    flex-1 h-[36px] px-[10px]
                    border border-layout-gray-200 rounded-[6px]
                    bg-layout-white dark:bg-layout-black
                    text-[13px] text-layout-black dark:text-layout-white
                    outline-none focus:border-primary-main-600
                  "
                >
                  <option value="">선택 안함</option>
                  {selectedNoteType?.fields.map((field) => (
                    <option key={field} value={field}>{field}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* 미리보기 */}
        {mappedSamples.length > 0 && mapping.word && mapping.meaning && (
          <div className="flex flex-col gap-[8px]">
            <h3 className="text-[14px] font-bold text-layout-black dark:text-layout-white">미리보기</h3>
            <div className="flex flex-col gap-[6px]">
              {mappedSamples.map((sample, idx) => (
                <div
                  key={idx}
                  className="
                    flex flex-col gap-[2px] p-[10px]
                    border border-layout-gray-200 rounded-[6px]
                    bg-layout-white dark:bg-layout-black
                  "
                >
                  <div className="flex items-baseline gap-[6px]">
                    <span className="text-[14px] font-bold text-layout-black dark:text-layout-white">{sample.word}</span>
                    {sample.pronunciation && (
                      <span className="text-[12px] text-layout-gray-400">{sample.pronunciation}</span>
                    )}
                  </div>
                  {sample.meaning && (
                    <span className="text-[13px] text-primary-main-600">{sample.meaning}</span>
                  )}
                  {sample.example && (
                    <span className="text-[12px] text-layout-gray-400 italic">{sample.example}</span>
                  )}
                  {sample.exampleMeaning && (
                    <span className="text-[12px] text-layout-gray-400">{sample.exampleMeaning}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-[15px] p-[20px] shrink-0">
        <motion.button
          className="flex-1 h-[45px] rounded-[8px] bg-layout-gray-200 text-layout-white dark:text-layout-black text-[16px] font-bold"
          onClick={handleCancel}
          whileTap={{ scale: 0.95 }}
        >
          이전
        </motion.button>
        <motion.button
          className="flex-1 h-[45px] rounded-[8px] bg-primary-main-600 text-layout-white dark:text-layout-black text-[16px] font-bold disabled:opacity-50"
          disabled={!mapping.word || !mapping.meaning || isUploading}
          onClick={() => {
            vibrate({ duration: 5 });
            handleUpload();
          }}
          whileTap={{ scale: 0.95 }}
        >
          {isUploading ? (
            <span className="flex items-center justify-center gap-[6px]">
              <SpinnerGap size={18} className="animate-spin" />
              업로드 중...
            </span>
          ) : '불러오기'}
        </motion.button>
      </div>
    </div>
  );
};
