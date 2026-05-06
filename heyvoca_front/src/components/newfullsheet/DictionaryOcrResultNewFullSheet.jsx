import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CaretLeft } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { backendUrl, fetchDataAsync } from '../../utils/common';
import postMessageManager from '../../utils/postMessageManager';
import { vibrate } from '../../utils/osFunction';
import CameraSourceNewBottomSheet from '../newBottomSheet/CameraSourceNewBottomSheet';

const INITIAL_SCALE = 1.6;
const SELECT_ZOOM_SCALE = 2.5;

const formatMeaningsSummary = (meanings, limit = 2) => {
  if (!meanings || !Array.isArray(meanings) || meanings.length === 0) return '';
  return meanings
    .slice(0, limit)
    .map((m) => (typeof m === 'string' ? m : m?.meaning ?? ''))
    .filter(Boolean)
    .join(', ');
};

const DictionaryOcrResultNewFullSheet = () => {
  "use memo";

  const { popNewFullSheet } = useNewFullSheetActions();
  const { pushAwaitNewBottomSheet, clearStack: clearBottomSheetStack } = useNewBottomSheetActions();

  // 네이티브에서 수신한 원본 payload
  const [payload, setPayload] = useState(null);
  // 백엔드 필터링 결과
  const [matchedWords, setMatchedWords] = useState([]);
  // 사용자가 리스트에서 선택한 단어
  const [selectedWord, setSelectedWord] = useState(null);
  // 네트워크 상태
  const [isFiltering, setIsFiltering] = useState(false);
  // 촬영/갤러리 대기 중 — true면 시트 내용 숨김
  const [isCapturing, setIsCapturing] = useState(true);
  // 프리뷰 외부 컨테이너 실제 크기 (contain 크기 계산용)
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });

  const previewContainerRef = useRef(null);
  const transformRef = useRef(null);
  const hasDataRef = useRef(false);

  useEffect(() => {
    hasDataRef.current = !!payload;
  }, [payload]);

  // 프리뷰 영역 크기 추적
  useLayoutEffect(() => {
    const el = previewContainerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setPreviewSize({ width: rect.width, height: rect.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [payload]);

  // 백엔드 /ocr/words 호출
  const filterWords = useCallback(async (words) => {
    if (!words || words.length === 0) {
      setMatchedWords([]);
      return;
    }
    setIsFiltering(true);
    try {
      const response = await fetchDataAsync(
        `${backendUrl}/ocr/words`,
        'POST',
        { words },
      );
      if (response?.code === 200) {
        setMatchedWords(response.data?.matched_words || []);
      } else {
        setMatchedWords([]);
      }
    } catch (err) {
      console.error('OCR 필터링 오류:', err);
      setMatchedWords([]);
    } finally {
      setIsFiltering(false);
    }
  }, []);

  // 카메라/앨범 선택 바텀시트 오픈 → 네이티브로 source 전달
  const requestImagePicker = useCallback(async () => {
    const source = await pushAwaitNewBottomSheet(CameraSourceNewBottomSheet);
    if (source === 'camera' || source === 'library') {
      // 바텀시트 exit 애니메이션이 끝나기 전 웹뷰가 백그라운드로 가면
      // Framer Motion rAF 가 멈춰 바텀시트가 DOM 에 남는 문제가 있어 잠깐 대기
      await new Promise((r) => setTimeout(r, 280));
      postMessageManager.sendMessageToReactNative('openImagePicker', { source });
    } else {
      // 취소: 기존 데이터 없으면 풀시트 종료, 있으면 이전 결과로 복귀
      if (!hasDataRef.current) {
        popNewFullSheet();
      } else {
        setIsCapturing(false);
      }
    }
  }, [pushAwaitNewBottomSheet, popNewFullSheet]);

  // 네이티브 메시지 리스너 + 초기 바텀시트 오픈
  useEffect(() => {
    const handleOcrResult = (msg) => {
      // 네이티브 picker 기간 동안 애니메이션이 멈춰 바텀시트가 남는 경우가 있어 명시적으로 정리
      clearBottomSheetStack();
      const data = msg?.data || {};
      setPayload({
        words: data.words || [],
        imageBase64: data.imageBase64 || null,
        photoSize: data.photoSize || { width: 0, height: 0 },
      });
      setSelectedWord(null);
      setMatchedWords([]);
      setIsCapturing(false);
      filterWords(data.words || []);
    };

    const handleOcrCancel = () => {
      clearBottomSheetStack();
      if (!hasDataRef.current) {
        popNewFullSheet();
      } else {
        setIsCapturing(false);
      }
    };

    const handleOcrError = (msg) => {
      clearBottomSheetStack();
      const message = msg?.data?.message || 'OCR 처리 중 오류가 발생했습니다.';
      if (!hasDataRef.current) {
        window.alert?.(message);
        popNewFullSheet();
      } else {
        window.alert?.(message);
        setIsCapturing(false);
      }
    };

    postMessageManager.setupOCRResult(handleOcrResult);
    postMessageManager.addListener('ocrCancel', handleOcrCancel);
    postMessageManager.addListener('ocrError', handleOcrError);

    // 시트 마운트 직후 카메라/앨범 선택 바텀시트 오픈
    requestImagePicker();

    return () => {
      postMessageManager.removeOCRResult();
      postMessageManager.removeListener('ocrCancel');
      postMessageManager.removeListener('ocrError');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 재촬영
  const handleRetake = useCallback(() => {
    vibrate({ duration: 5 });
    setIsCapturing(true);
    setPayload(null);
    setMatchedWords([]);
    setSelectedWord(null);
    requestImagePicker();
  }, [requestImagePicker]);

  const handleReselect = useCallback(() => {
    vibrate({ duration: 5 });
    setSelectedWord(null);
    // 원래 뷰로 리셋
    transformRef.current?.resetTransform(300);
  }, []);

  const handleConfirmSelection = useCallback(() => {
    vibrate({ duration: 5 });
    if (!selectedWord) return;
    // Main 컴포넌트(검색 드롭다운 항목)가 기대하는 shape 으로 정규화
    //  - meanings: string[] (OCR 응답은 [{id, meaning}] 형태)
    //  - examples: [{ origin, meaning }] (OCR 응답은 [{id, exam_en, exam_ko}] 형태)
    const normalized = {
      ...selectedWord,
      meanings: (selectedWord.meanings || []).map((m) =>
        typeof m === 'string' ? m : (m?.meaning ?? ''),
      ),
      examples: (selectedWord.examples || []).map((e) => ({
        origin: e?.origin ?? e?.exam_en ?? '',
        meaning: e?.meaning ?? e?.exam_ko ?? '',
      })),
    };
    window.dispatchEvent(
      new CustomEvent('dictionary:selectWord', { detail: normalized }),
    );
    // 이 플로우에서 열린 바텀시트/풀시트 모두 정리
    clearBottomSheetStack();
    popNewFullSheet();
  }, [selectedWord, clearBottomSheetStack, popNewFullSheet]);

  // 이미지 원본 크기
  const photoW = payload?.photoSize?.width || 0;
  const photoH = payload?.photoSize?.height || 0;

  // contain 방식으로 실제 표시될 이미지 크기 계산
  const containSize = useMemo(() => {
    if (!photoW || !photoH || !previewSize.width || !previewSize.height) return null;
    const scale = Math.min(previewSize.width / photoW, previewSize.height / photoH);
    return { width: photoW * scale, height: photoH * scale };
  }, [photoW, photoH, previewSize]);

  // 매칭된 단어들의 모든 발생 위치 박스 수집
  // - 선택된 단어가 있으면 해당 단어만
  // - 없으면 매칭된 모든 단어
  const highlightBoxes = useMemo(() => {
    if (!payload?.words || !matchedWords.length) return [];
    const targets = selectedWord ? [selectedWord] : matchedWords;
    const byLower = new Map();
    targets.forEach((mw) => {
      const key = mw.word?.toLowerCase?.();
      if (key) byLower.set(key, mw);
    });
    const boxes = [];
    const counters = new Map();
    payload.words.forEach((w) => {
      const key = (w.text || '').toLowerCase();
      const mw = byLower.get(key);
      if (!mw || !w.boundingBox) return;
      const idx = counters.get(mw.id) || 0;
      counters.set(mw.id, idx + 1);
      boxes.push({
        wordId: mw.id,
        idx,
        box: w.boundingBox,
        matchedWord: mw,
      });
    });
    return boxes;
  }, [payload, matchedWords, selectedWord]);

  const handleHighlightClick = useCallback((matchedWord) => {
    vibrate({ duration: 5 });
    setSelectedWord(matchedWord);
  }, []);

  // 선택된 단어의 첫 번째 박스로 자동 줌
  useEffect(() => {
    if (!selectedWord || !transformRef.current) return;
    const id = `ocr-box-${selectedWord.id}-0`;
    // DOM 반영 대기
    const t = setTimeout(() => {
      const el = document.getElementById(id);
      if (el && transformRef.current) {
        transformRef.current.zoomToElement(el, SELECT_ZOOM_SCALE, 350);
      }
    }, 30);
    return () => clearTimeout(t);
  }, [selectedWord, highlightBoxes]);

  return (
    <div
      className={`
        flex flex-col h-full w-full bg-layout-white dark:bg-layout-black
        ${isCapturing ? 'invisible pointer-events-none' : ''}
      `}
    >
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>

      {/* Header */}
      <div
        data-page-header
        className="
          relative
          flex items-center justify-center
          h-[55px]
          pt-[20px] px-[10px] pb-[14px]
        "
      >
        <motion.button
          onClick={() => {
            vibrate({ duration: 5 });
            popNewFullSheet();
          }}
          className="
            absolute top-[18px] left-[10px]
            flex items-center gap-[4px]
            text-layout-gray-200 dark:text-layout-white
            p-[4px]
            rounded-[8px]
          "
          whileHover={{ backgroundColor: 'rgba(0, 0, 0, 0.05)', scale: 1.05 }}
          whileTap={{ scale: 0.95, backgroundColor: 'rgba(0, 0, 0, 0.1)' }}
          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        >
          <CaretLeft size={22} weight="bold" />
        </motion.button>
        <h2 className="text-[16px] font-[700]">단어 선택</h2>
      </div>

      {/* 이미지 프리뷰 영역 */}
      <div
        ref={previewContainerRef}
        className="relative flex-1 min-h-0 bg-layout-gray-50 dark:bg-[#111] overflow-hidden"
      >
        {payload?.imageBase64 ? (
          containSize ? (
            <TransformWrapper
              ref={transformRef}
              initialScale={INITIAL_SCALE}
              minScale={1}
              maxScale={5}
              centerOnInit
              limitToBounds
              doubleClick={{ mode: 'toggle', step: 0.8 }}
              wheel={{ step: 0.15 }}
              pinch={{ step: 5 }}
            >
              <TransformComponent
                wrapperStyle={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    position: 'relative',
                    width: `${containSize.width}px`,
                    height: `${containSize.height}px`,
                  }}
                >
                  <img
                    src={payload.imageBase64}
                    alt="촬영 이미지"
                    style={{
                      display: 'block',
                      width: '100%',
                      height: '100%',
                    }}
                    draggable={false}
                  />
                  {highlightBoxes.map(({ wordId, idx, box, matchedWord }) => (
                    <div
                      key={`${wordId}-${idx}`}
                      id={`ocr-box-${wordId}-${idx}`}
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleHighlightClick(matchedWord);
                      }}
                      className="absolute rounded-[2px] bg-primary-main-600 cursor-pointer"
                      style={{
                        left: `${(box.left / photoW) * 100}%`,
                        top: `${(box.top / photoH) * 100}%`,
                        width: `${(box.width / photoW) * 100}%`,
                        height: `${(box.height / photoH) * 100}%`,
                        opacity: 0.45,
                        mixBlendMode: 'multiply',
                      }}
                    />
                  ))}
                </div>
              </TransformComponent>
            </TransformWrapper>
          ) : (
            <img
              src={payload.imageBase64}
              alt="촬영 이미지"
              className="absolute inset-0 w-full h-full object-contain"
            />
          )
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-[14px] text-[#999]">
              이미지를 기다리는 중...
            </p>
          </div>
        )}
      </div>

      {/* 하단 pink 영역 */}
      <div
        className="flex-shrink-0 px-[20px] pb-[20px] pt-[12px] flex flex-col gap-[12px]"
        style={{ paddingBottom: 'max(20px, var(--safe-area-bottom, 0px))' }}
      >
        {isFiltering ? (
          <div className="rounded-[10px] bg-[#FFEFFA] px-[20px] py-[14px] text-center">
            <p className="text-[13px] font-[500] text-[#FF87B0]">
              단어 정제 중입니다...
            </p>
          </div>
        ) : selectedWord ? (
          <div className="rounded-[10px] bg-[#FFEFFA] px-[20px] py-[10px]">
            <div className="flex items-start gap-[12px]">
              <span className="text-[16px] font-[700] text-layout-black">
                {selectedWord.word || '-'}
              </span>
              <span className="text-[13px] text-layout-black leading-[1.5] break-keep">
                {formatMeaningsSummary(selectedWord.meanings, 4) || '-'}
              </span>
            </div>
          </div>
        ) : (
          <div className="rounded-[10px] bg-[#FFEFFA] px-[16px] py-[4px] max-h-[140px] overflow-y-auto">
            {matchedWords.length === 0 ? (
              <div className="py-[16px] text-center">
                <p className="text-[13px] text-[#888]">
                  일치하는 단어를 찾지 못했습니다.
                </p>
              </div>
            ) : (
              matchedWords.map((item, idx) => (
                <button
                  key={item.id ?? idx}
                  type="button"
                  onClick={() => {
                    vibrate({ duration: 5 });
                    setSelectedWord(item);
                  }}
                  className="w-full flex items-start gap-[12px] py-[8px] text-left border-b border-[#F2D7E5] last:border-b-0"
                >
                  <span className="text-[15px] font-[700] text-layout-black min-w-[80px]">
                    {item.word || '(단어 없음)'}
                  </span>
                  <span className="flex-1 text-[13px] text-layout-black leading-[1.5] break-keep line-clamp-2">
                    {formatMeaningsSummary(item.meanings, 2) || '-'}
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {selectedWord ? (
          <div className="flex items-center gap-[12px]">
            <button
              type="button"
              onClick={handleReselect}
              className="flex-1 h-[54px] rounded-[10px] bg-[#CCCCCC] text-white text-[15px] font-[600]"
            >
              다시 선택
            </button>
            <button
              type="button"
              onClick={handleConfirmSelection}
              className="flex-1 h-[54px] rounded-[10px] bg-[#FF8DD4] text-white text-[15px] font-[600]"
            >
              선택
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleRetake}
            className="w-full h-[54px] rounded-[10px] bg-[#CCCCCC] text-white text-[15px] font-[600]"
          >
            재촬영
          </button>
        )}
      </div>
    </div>
  );
};

export default DictionaryOcrResultNewFullSheet;
