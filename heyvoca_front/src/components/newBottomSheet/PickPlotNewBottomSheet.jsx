import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Info } from '@phosphor-icons/react';
import { useVocabulary } from '../../context/VocabularyContext';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import VocabularyWordsNewFullSheet from '../newfullsheet/VocabularyWordsNewFullSheet';
import CropImage from '../farm/CropImage';
import { vibrate, showToast } from '../../utils/osFunction';
import { useTheme } from '../../context/ThemeContext';
import { resolveVocaBookBackground } from '../../utils/vocaBookColor';

/**
 * 찾기 §2 ⑦ 어느 밭에 담을까 · ⑧ 담은 결과.
 *
 * 이 화면에서 시트로 남은 건 두 개뿐이다 — 고르는 것과 결과.
 * 둘 다 되돌릴 수 있어야 하는 행동이라 그릇이 필요하다(시안 find §8).
 * 읽기만 하는 것은 화면, 결정하는 것은 시트가 이 화면의 규칙이다.
 *
 * 결과 규격은 상점 구매 결과와 같다 — 씨앗 그림 · 무엇을 어디에 · 60개 → 61개(시안 find §9).
 */
const PickPlotNewBottomSheet = ({ origin = '', meanings = [], examples = [] }) => {
  "use memo";

  const { vocabularySheets, addWord } = useVocabulary();
  const { popNewBottomSheet } = useNewBottomSheetActions();
  const { pushNewFullSheet } = useNewFullSheetActions();
  const { isDark } = useTheme();

  // 상점에서 산 단어장에는 단어를 넣을 수 없다 (백엔드가 403)
  const editableSheets = useMemo(
    () => vocabularySheets.filter(s => !s.vocaBookStoreId),
    [vocabularySheets],
  );

  const [selectedId, setSelectedId] = useState(() => editableSheets[0]?.id ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null); // { bookId, title, before, after }

  const handleConfirm = async () => {
    if (!selectedId || submitting) return;
    const sheet = editableSheets.find(s => String(s.id) === String(selectedId));
    if (!sheet) return;

    vibrate({ duration: 5 });
    setSubmitting(true);
    try {
      const before = sheet.total ?? (sheet.words?.length ?? 0);
      const result = await addWord(sheet.id, { origin, meanings, examples });
      if (!result) {
        // 이미 그 단어장에 있는 단어 — Context 가 안내 토스트를 이미 띄웠다
        setSubmitting(false);
        return;
      }
      setDone({ bookId: sheet.id, title: sheet.title || '단어장', before, after: before + 1 });
    } catch (err) {
      console.error('단어 담기 실패:', err);
      showToast('단어를 담지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── ⑧ 담은 결과 ────────────────────────────────────────────
  if (done) {
    return (
      <div className="flex flex-col p-[20px] pt-[6px]">
        <div className="relative text-center pt-[6px]">
          <span
            aria-hidden
            className="absolute left-1/2 top-[44px] -translate-x-1/2 -translate-y-1/2 w-[190px] h-[190px] rounded-full pointer-events-none"
            style={{
              background:
                'radial-gradient(circle, rgba(255,189,235,.55) 0%, rgba(255,238,250,0) 68%)',
            }}
          />
          <CropImage
            stage="seed"
            health="FRESH"
            size={96}
            className="relative z-[2] mx-auto mb-[14px]"
          />
          <h3 className="text-[19px] font-[800] leading-[1.35] tracking-[-0.04em] text-layout-black dark:text-layout-white">
            <em className="not-italic text-primary-main-600">{origin}</em>를<br />
            {done.title}에 담았어요
          </h3>
          <div className="inline-flex items-center gap-[7px] mt-[14px] px-[14px] py-[7px] rounded-full bg-layout-gray-50 dark:bg-layout-gray-dark text-[12.5px] font-[700] tracking-[-0.02em] text-layout-black dark:text-layout-white">
            씨앗 {done.before}개
            <span className="text-layout-gray-200">→</span>
            <span className="font-[800] text-primary-main-600">{done.after}개</span>
          </div>
        </div>

        <div className="flex gap-[10px] mt-[16px]">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => { vibrate({ duration: 5 }); popNewBottomSheet(); }}
            className="flex-1 h-[48px] rounded-[10px] bg-layout-gray-50 dark:bg-layout-gray-dark text-[15.5px] font-[700] tracking-[-0.03em] text-layout-gray-400 dark:text-layout-gray-200"
          >
            계속 찾기
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              vibrate({ duration: 5 });
              popNewBottomSheet();
              pushNewFullSheet(VocabularyWordsNewFullSheet, { id: done.bookId });
            }}
            className="flex-1 h-[48px] rounded-[10px] bg-primary-main-600 text-layout-white text-[15.5px] font-[700] tracking-[-0.03em]"
          >
            단어장 열기
          </motion.button>
        </div>
      </div>
    );
  }

  // ── ⑦ 어느 밭에 담을까 ──────────────────────────────────────
  return (
    <div className="flex flex-col p-[20px] pt-[6px]">
      <h3 className="text-center text-[19px] font-[800] tracking-[-0.04em] text-layout-black dark:text-layout-white">
        어느 밭에 담을까요?
      </h3>

      <div className="mt-[14px] mb-[8px] text-[11.5px] font-[800] tracking-[-0.02em] text-layout-gray-400">
        내 단어장
      </div>

      <div className="flex flex-col gap-[7px] max-h-[46vh] overflow-y-auto">
        {editableSheets.length === 0 ? (
          <p className="py-[14px] text-[12.5px] text-layout-gray-300">
            단어를 담을 수 있는 단어장이 없어요. 단어장을 먼저 만들어 주세요.
          </p>
        ) : (
          editableSheets.map((sheet) => {
            const selected = String(sheet.id) === String(selectedId);
            const bg = resolveVocaBookBackground(sheet.color?.background || '#F5F5F5', isDark);
            return (
              <button
                key={sheet.id}
                type="button"
                onClick={() => { vibrate({ duration: 5 }); setSelectedId(sheet.id); }}
                style={{ backgroundColor: bg }}
                className={`
                  flex items-center gap-[6px] w-full h-[46px] px-[11px] rounded-[12px]
                  text-[12px] font-[700] tracking-[-0.02em]
                  text-layout-black dark:text-layout-white
                  border-[1.5px] ${selected ? 'border-primary-main-600' : 'border-transparent'}
                `}
              >
                {/* 자리는 18px 이지만 씨앗은 단계 비율(0.64)만큼 작게 그려진다 —
                    15px 로 두면 실제로 10px 이 채 안 돼 무엇인지 안 보인다 */}
                <CropImage stage="seed" health="FRESH" size={34} alt="" className="shrink-0" />
                <span className="truncate">{sheet.title || '단어장'}</span>
                <span className="ml-auto shrink-0 font-[600] text-layout-gray-300">
                  씨앗 {sheet.total ?? (sheet.words?.length ?? 0)}
                </span>
              </button>
            );
          })
        )}
      </div>

      <div className="flex gap-[8px] mt-[12px] px-[11px] py-[10px] rounded-[10px] bg-[#F7F7F7] dark:bg-layout-gray-dark text-[11px] leading-[1.55] tracking-[-0.02em] text-layout-gray-400 dark:text-layout-gray-300">
        <Info size={13} weight="fill" className="shrink-0 mt-[1px] text-layout-gray-200" />
        <span>
          상점에서 산 단어장에는 <b className="font-[700] text-layout-gray-500 dark:text-layout-gray-200">단어를 넣을 수 없어요.</b>
        </span>
      </div>

      <div className="flex gap-[10px] mt-[16px]">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => { vibrate({ duration: 5 }); popNewBottomSheet(); }}
          className="flex-1 h-[48px] rounded-[10px] bg-layout-gray-50 dark:bg-layout-gray-dark text-[15.5px] font-[700] tracking-[-0.03em] text-layout-gray-400 dark:text-layout-gray-200"
        >
          취소
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          disabled={!selectedId || submitting}
          onClick={handleConfirm}
          className={`
            flex-1 h-[48px] rounded-[10px] text-[15.5px] font-[700] tracking-[-0.03em]
            ${!selectedId || submitting
              ? 'bg-layout-gray-100 dark:bg-layout-gray-dark text-layout-gray-200 dark:text-layout-gray-400'
              : 'bg-primary-main-600 text-layout-white'}
          `}
        >
          여기에 담기
        </motion.button>
      </div>
    </div>
  );
};

export default PickPlotNewBottomSheet;
