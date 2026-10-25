import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Info, Plus } from '@phosphor-icons/react';
import { useVocabulary } from '../../context/VocabularyContext';
import { useUser } from '../../context/UserContext';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import VocabularyWordsNewFullSheet from '../newfullsheet/VocabularyWordsNewFullSheet';
import { VocabularyLimitNewBottomSheet } from './VocabularyLimitNewBottomSheet';
import { useVocabularySetNewBottomSheet } from './VocabularySetNewBottomSheet';
import CropImage from '../farm/CropImage';
import { vibrate, showToast } from '../../utils/osFunction';
import { useTheme } from '../../context/ThemeContext';
import { resolveVocaBookBackground } from '../../utils/vocaBookColor';
import { wordLang } from '../../utils/lang';
import { userBookCntCheckApi } from '../../api/voca';
import { getDictWordDetailApi } from '../../api/search';
import { holdStudyAdvance } from '../../hooks/useStudyAdvanceGate';

// 마지막으로 담은 단어장 — 다음에 열 때 기본 선택. 기기별 편의값이라 localStorage(실패해도 무시).
const LAST_BOOK_KEY = 'heyvoca:pickPlot:lastBookId';
const readLastBookId = () => {
  try { return window.localStorage.getItem(LAST_BOOK_KEY); } catch { return null; }
};
const writeLastBookId = (id) => {
  try { window.localStorage.setItem(LAST_BOOK_KEY, String(id)); } catch { /* 무시 */ }
};

/**
 * 찾기 §2 ⑦ 어느 밭에 담을까 · ⑧ 담은 결과.
 *
 * 학습 중 단어 말풍선(WordInfoBubble)의 '단어장에 추가'도 이 시트를 쓴다(QA #17) —
 *   resultMode='toast' : 결과 시트 대신 토스트만 띄우고 닫는다(학습 흐름으로 바로 복귀).
 *   enrich            : 말풍선 조회(word-info)엔 예문이 없어서, 열리자마자 사전 검색으로
 *                       예문·읽기를 채운다. 담기 버튼은 그 조회를 기다렸다가 담는다.
 *   열려 있는 동안 학습 자동 넘김을 붙잡는다(holdStudyAdvance) — 학습 밖에선 영향 없음.
 * 이미 그 단어장에 있는 단어는 줄에 '이미 있어요'를 달고 담기 버튼을 막는다.
 *
 * 이 화면에서 시트로 남은 건 두 개뿐이다 — 고르는 것과 결과.
 * 둘 다 되돌릴 수 있어야 하는 행동이라 그릇이 필요하다(시안 find §8).
 * 읽기만 하는 것은 화면, 결정하는 것은 시트가 이 화면의 규칙이다.
 *
 * 결과 규격은 상점 구매 결과와 같다 — 씨앗 그림 · 무엇을 어디에 · 60개 → 61개(시안 find §9).
 */
const PickPlotNewBottomSheet = ({
  origin = '', meanings = [], examples = [],
  // 일본어 연동 — 사전 단어 id·읽기·언어를 그대로 담는다(INTEGRATION_SPEC 5절)
  dictionaryId = null, reading = null, language = undefined,
  resultMode = 'sheet', // 'sheet'(담은 결과 시트) | 'toast'(토스트 후 닫기 — 학습 중)
  enrich = false,
}) => {
  "use memo";

  const { vocabularySheets, addWord, userDictionary } = useVocabulary();
  const { userProfile, learningLang } = useUser();
  const { popNewBottomSheet, pushNewBottomSheet } = useNewBottomSheetActions();
  const { pushNewFullSheet } = useNewFullSheetActions();
  const { showVocabularySetNewBottomSheet } = useVocabularySetNewBottomSheet();
  const { isDark } = useTheme();

  // 상점에서 산 단어장에는 단어를 넣을 수 없다 (백엔드가 403)
  const editableSheets = useMemo(
    () => vocabularySheets.filter(s => !s.vocaBookStoreId),
    [vocabularySheets],
  );

  // 이 단어가 이미 들어 있는 단어장 id — Context 의 중복 판단(addUserDictionaryWord)과 같은 기준:
  // 사전 id 가 있으면 그것으로, 없으면 표기+언어로 내 사전에서 찾는다.
  const ownedBookIds = useMemo(() => {
    const lang = wordLang({ language }, learningLang);
    const all = Object.values(userDictionary ?? {});
    const owned = (dictionaryId != null
      ? all.find(w => {
        const wId = w?.vocaId ?? w?.dictionaryId ?? null;
        return wId != null && String(wId) === String(dictionaryId);
      })
      : undefined)
      ?? all.find(w => w.origin === origin && wordLang(w, learningLang) === lang);
    return new Set((owned?.vocaBooks ?? []).map(vb => String(vb.vocaBookId)));
  }, [userDictionary, dictionaryId, origin, language, learningLang]);

  const [selectedId, setSelectedId] = useState(() => {
    const last = readLastBookId();
    if (last && editableSheets.some(s => String(s.id) === last)) return last;
    return editableSheets[0]?.id ?? null;
  });
  const [submitting, setSubmitting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [done, setDone] = useState(null); // { bookId, title, before, after }

  // 학습 자동 넘김 붙잡기 — 시트가 닫히면(언마운트) 놓는다
  useEffect(() => holdStudyAdvance(), []);

  // 예문·읽기 보강 — 담기 직전에 기다릴 수 있게 promise 를 들고 있는다(실패하면 받은 값으로 담는다)
  const detailRef = useRef(null);
  useEffect(() => {
    if (!enrich || !origin) return;
    detailRef.current = getDictWordDetailApi(origin, dictionaryId).catch(() => null);
  }, [enrich, origin, dictionaryId]);

  const selectedOwned = selectedId != null && ownedBookIds.has(String(selectedId));

  // 새 단어장 만들기 — 단어장 관리 메뉴(VocabularyManageNewBottomSheet)와 같은 한도 판단
  const handleCreateBook = async () => {
    if (creating) return;
    vibrate({ duration: 5 });
    setCreating(true);
    try {
      const check = await userBookCntCheckApi();
      if (!(userProfile?.book_cnt > 0 || check?.data?.can_add_book)) {
        pushNewBottomSheet(VocabularyLimitNewBottomSheet, {}, { isBackdropClickClosable: true, isDragToCloseEnabled: true });
        return;
      }
      const created = await showVocabularySetNewBottomSheet();
      const newId = created?.vocaBookId ?? created?.id;
      if (newId != null) setSelectedId(newId);
    } finally {
      setCreating(false);
    }
  };

  const handleConfirm = async () => {
    if (!selectedId || submitting || selectedOwned) return;
    const sheet = editableSheets.find(s => String(s.id) === String(selectedId));
    if (!sheet) return;

    vibrate({ duration: 5 });
    setSubmitting(true);
    try {
      const detail = detailRef.current ? await detailRef.current : null;
      const wordMeanings = meanings?.length ? meanings : (detail?.meanings ?? []);
      const wordExamples = examples?.length ? examples : (detail?.examples ?? []);
      const wordReading = reading ?? detail?.reading ?? null;
      const before = sheet.total ?? (sheet.words?.length ?? 0);
      const result = await addWord(sheet.id, {
        origin, meanings: wordMeanings, examples: wordExamples,
        ...(dictionaryId != null ? { vocaId: dictionaryId, dictionaryId } : {}),
        ...(wordReading ? { reading: wordReading } : {}),
        ...(language ? { language } : {}),
      });
      if (!result) {
        // 이미 그 단어장에 있는 단어 — Context 가 안내 토스트를 이미 띄웠다
        setSubmitting(false);
        return;
      }
      writeLastBookId(sheet.id);
      const title = sheet.title || '단어장';
      if (resultMode === 'toast') {
        // 새 씨앗(미학습)으로 들어가 그 밭 학습·새 씨앗 심기에서 바로 나온다
        showToast(`${origin}을(를) ${title}에 심었어요`);
        popNewBottomSheet();
        return;
      }
      setDone({ bookId: sheet.id, title, before, after: before + 1 });
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
            align="center"
            className="relative z-[2] mx-auto mb-[14px]"
          />
          <h3 className="text-[19px] font-[800] leading-[1.35] tracking-[-0.04em] text-layout-black dark:text-layout-white">
            <em lang={language === 'ja' ? 'ja' : undefined} className="not-italic text-primary-main-600">{origin}</em>를<br />
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
            단어를 담을 수 있는 단어장이 없어요. 아래에서 새로 만들어 주세요.
          </p>
        ) : (
          editableSheets.map((sheet) => {
            const selected = String(sheet.id) === String(selectedId);
            const owned = ownedBookIds.has(String(sheet.id));
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
                <CropImage stage="seed" health="FRESH" size={34} align="center" alt="" className="shrink-0" />
                <span className="truncate">{sheet.title || '단어장'}</span>
                <span className={`ml-auto shrink-0 font-[600] ${owned ? 'text-primary-main-600' : 'text-layout-gray-300'}`}>
                  {owned ? '이미 있어요' : `씨앗 ${sheet.total ?? (sheet.words?.length ?? 0)}`}
                </span>
              </button>
            );
          })
        )}
        <button
          type="button"
          disabled={creating}
          onClick={handleCreateBook}
          className="
            flex items-center gap-[6px] w-full h-[46px] px-[11px] rounded-[12px] shrink-0
            text-[12px] font-[700] tracking-[-0.02em]
            text-layout-gray-400 dark:text-layout-gray-200
            border-[1.5px] border-dashed border-layout-gray-100 dark:border-layout-gray-dark
          "
        >
          <Plus size={16} weight="bold" className="shrink-0 mx-[9px] text-layout-gray-300" />
          <span>새 단어장 만들기</span>
        </button>
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
          disabled={!selectedId || submitting || selectedOwned}
          onClick={handleConfirm}
          className={`
            flex-1 h-[48px] rounded-[10px] text-[15.5px] font-[700] tracking-[-0.03em]
            ${!selectedId || submitting || selectedOwned
              ? 'bg-layout-gray-100 dark:bg-layout-gray-dark text-layout-gray-200 dark:text-layout-gray-400'
              : 'bg-primary-main-600 text-layout-white'}
          `}
        >
          {selectedOwned ? '이미 있어요' : '여기에 담기'}
        </motion.button>
      </div>
    </div>
  );
};

export default PickPlotNewBottomSheet;
