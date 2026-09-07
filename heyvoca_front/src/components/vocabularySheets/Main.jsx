import React, { useMemo, useState } from 'react';
import {
  Plus, WarningCircle, Check, SealCheck,
} from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useVocabulary } from '../../context/VocabularyContext';
import { useNewFullSheet } from '../../hooks/useNewFullSheet';
import { useVocabularyManageNewBottomSheet } from '../newBottomSheet/VocabularyManageNewBottomSheet';
import VocabularyWordsNewFullSheet from '../newfullsheet/VocabularyWordsNewFullSheet';
import CropImage from '../farm/CropImage';
// 밭 썸네일 — 시안 §2. 홈 히어로와 같은 밭을 작게 그린다.
// 예전에는 미리 구워 둔 네 장(book-seed/early/mid/done) 중 하나를 골라 썼는데,
// 그러면 어느 단어장이든 넷 중 하나로만 보였다. 지금은 그 단어장에 실제로 심긴
// 작물을 그대로 심는다 — 목록에서 밭 그림을 먼저 본다는 시안 §2 가 그제야 성립한다.
import FarmField from '../farm/FarmField';
import { vibrate } from '../../utils/osFunction';
import { HEALTH_STATES, CROP_LABEL } from '../../utils/crop';
import {
  CROP_ORDER,
  bookStageCounts,
  bookCareCount,
  bookFieldData,
  bookBadge,
} from '../../utils/vocaCrop';

/** 카드 배지 — 시안 §1① (돌봄 N · 완료 · 씨앗) */
const BADGE_CLASS = {
  care: 'bg-secondary-yellow-100 dark:bg-secondary-yellow-dark text-secondary-yellow-600',
  done: 'bg-status-success-100 dark:bg-status-success-dark text-status-success-600',
};

const BADGE_ICON = {
  care: WarningCircle,
  done: Check,
};

/** 최근 학습 정렬용 — 이 단어장에서 가장 최근에 갱신된 단어 시각 */
const lastTouchedAt = (book) => {
  let latest = 0;
  (book.words || []).forEach((word) => {
    const t = new Date(word.updatedAt || word.createdAt || 0).getTime();
    if (!Number.isNaN(t) && t > latest) latest = t;
  });
  return latest;
};

/**
 * 단어장 목록 — 시안 vocabooks §1① · §2.
 *
 * 밭 썸네일로 상태를 그림으로 먼저 읽고, 바로 아래 단계 분포를 본다.
 * 진행률 바가 없다 — 142/200 은 "이 밭이 지금 어떤 상태인가"에 답하지 못한다.
 */
const Main = () => {
  "use memo";

  const { pushNewFullSheet } = useNewFullSheet();
  const { vocabularySheets } = useVocabulary();
  const { showVocabularyManageNewBottomSheet } = useVocabularyManageNewBottomSheet();

  const [filter, setFilter] = useState('all'); // all | care | recent

  // 카드마다 필요한 파생값을 한 번만 계산한다 — 목록·칩·배지가 같은 수를 봐야 한다
  const books = useMemo(() => vocabularySheets.map((book) => {
    const counts = bookStageCounts(book.words);
    return {
      book,
      counts,
      field: bookFieldData(book.words),
      care: bookCareCount(book.words),
      badge: bookBadge(book.words, counts),
      touchedAt: lastTouchedAt(book),
      // 서점에서 받았거나 온보딩으로 제공받은 단어장 — 단어 추가·수정·삭제가
      // 막혀 있는 헤이보카 검증 단어장이다. WordDetaileNewBottomSheet·
      // VocabularyWordsNewFullSheet 의 isPurchasedBook 과 같은 판별이다.
      isVerified: book.vocaBookStoreId != null,
    };
  }), [vocabularySheets]);

  const careCount = books.filter((row) => row.care > 0).length;

  const visible = useMemo(() => {
    if (filter === 'care') return books.filter((row) => row.care > 0);
    if (filter === 'recent') return [...books].sort((a, b) => b.touchedAt - a.touchedAt);
    return books;
  }, [books, filter]);

  const handleCardClick = (id) => {
    vibrate({ duration: 5 });
    pushNewFullSheet(VocabularyWordsNewFullSheet, { id }, {
      smFull: true,
      closeOnBackdropClick: true,
    });
  };

  const handleAddBook = () => {
    vibrate({ duration: 5 });
    showVocabularyManageNewBottomSheet();
  };

  const chips = [
    { key: 'all', label: '전체', count: books.length },
    { key: 'care', label: '돌봄 필요', count: careCount },
    { key: 'recent', label: '최근 학습', count: null },
  ];

  return (
    <motion.div
      className="
        flex flex-col
        h-[calc(100vh-var(--current-header-height)-var(--current-bottom-nav-height)-var(--status-bar-height))]
        overflow-y-auto
      "
      initial={{ opacity: 0, y: 20, transition: { duration: 0.2 } }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.2 } }}
      exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
    >
      {/* 필터 칩 — 읽기만 하는 숫자 대신 눌러서 걸러지는 숫자를 둔다 (시안 §4) */}
      <div className="flex gap-[6px] shrink-0 px-[16px] pb-[10px] overflow-x-auto">
        {chips.map((chip) => {
          const on = filter === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => {
                vibrate({ duration: 5 });
                setFilter(chip.key);
              }}
              className={`
                flex items-center gap-[4px] shrink-0
                h-[30px] px-[11px] rounded-full
                text-[12.5px] font-[700] tracking-[-0.02em] whitespace-nowrap
                ${on
                  ? 'bg-primary-main-100 dark:bg-primary-main-dark text-primary-main-600'
                  : 'bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-gray-400 dark:text-layout-gray-200'}
              `}
            >
              {chip.label}
              {chip.count !== null && <b className="font-[800]">{chip.count}</b>}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-[10px] px-[16px] pb-[20px]">
        {visible.map(({
          book, counts, field, badge, isVerified,
        }) => {
          const BadgeIcon = badge ? BADGE_ICON[badge.kind] : null;

          return (
            <motion.button
              key={book.id}
              type="button"
              onClick={() => handleCardClick(book.id)}
              whileTap={{ scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              className="
                flex items-center gap-[12px] w-full p-[12px] text-left
                rounded-[12px]
                border border-farm-line
                bg-farm-canvas dark:bg-layout-gray-dark
              "
            >
              {/* 이 단어장의 밭. 64px 에서는 작물 하나하나가 점만 하지만,
                  밭의 **어느 구역이 찼는가**는 그 크기에서도 읽힌다.
                  크기는 이 상자가 정한다 — FarmField 는 상자를 100% 채운다. */}
              <span className="block w-[64px] shrink-0">
                <FarmField
                  counts={field.counts}
                  healthMix={field.healthMix}
                  maxSprites={18}
                  shadows={false}
                  reserveSigns={false}
                />
              </span>

              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-[6px]">
                  {/* 헤이보카 검증 단어장 마크 — 서점/온보딩으로 받아 단어 추가·수정·
                      삭제가 막힌 단어장. VerifyMark(단어 단위)와 같은 아이콘·색이다. */}
                  {isVerified && (
                    <SealCheck
                      size={14}
                      weight="fill"
                      className="shrink-0 text-secondary-blue-600"
                      aria-label="헤이보카가 검증한 단어장"
                    />
                  )}
                  <span className="flex-1 min-w-0 truncate text-[15px] font-[700] tracking-[-0.03em] text-layout-black dark:text-layout-white">
                    {book.title}
                  </span>
                  {badge && (
                    <span
                      className={`
                        flex items-center gap-[3px] shrink-0
                        px-[7px] py-[2px] rounded-full
                        text-[11px] font-[800] tracking-[-0.02em]
                        ${BADGE_CLASS[badge.kind]}
                      `}
                    >
                      {BadgeIcon && <BadgeIcon size={10} weight="bold" />}
                      {badge.text}
                    </span>
                  )}
                </span>

                {/*
                  단계별 개수 — 시안 승인본. 첫 칸은 "보유"(아직 안 심음), 세로선 뒤가
                  "심은 것" 4단계다. 그림이 이미 구분한다 — 보유 씨앗은 봉투(CropImage
                  stage="seed"), 심은 씨앗은 흙에 묻힌 낱알(stage="PLANTED_SEED").
                  BookFieldHero 의 SIGN_STAGE 와 같은 구분이라, 카드 안에서도 밭
                  썸네일과 같은 말을 한다. 라벨 줄은 두지 않는다 — 아이콘 그림과
                  세로 구분선만으로 두 그룹이 이미 나뉜다.
                */}
                <span className="grid grid-cols-[auto_1px_1fr] items-center gap-x-[6px] mt-[6px] w-full min-w-0">
                  <span
                    className={`
                      flex items-center gap-[2px] shrink-0 text-[11.5px] font-[800] tracking-[-0.02em]
                      text-layout-gray-400 dark:text-layout-gray-200
                      ${counts.unplanted === 0 ? 'opacity-[0.32]' : ''}
                    `}
                  >
                    <CropImage
                      stage="seed"
                      health={HEALTH_STATES.FRESH}
                      size={22}
                      alt="보유 씨앗"
                    />
                    {counts.unplanted}
                  </span>

                  <span className="w-px h-[16px] bg-layout-gray-100 dark:bg-layout-gray-dark" aria-hidden />

                  <span className="flex items-center justify-between min-w-0">
                    {CROP_ORDER.map((stage) => (
                      <span
                        key={stage}
                        className={`
                          flex items-center gap-[1px] shrink-0 whitespace-nowrap
                          text-[11.5px] font-[800] tracking-[-0.02em]
                          ${counts[stage] === 0 ? 'opacity-[0.32]' : ''}
                        `}
                        style={{ color: `var(--crop-${stage})` }}
                      >
                        <CropImage
                          stage={stage === 'seed' ? 'PLANTED_SEED' : stage}
                          health={HEALTH_STATES.FRESH}
                          size={22}
                          alt={CROP_LABEL[stage]}
                        />
                        {counts[stage]}
                      </span>
                    ))}
                  </span>
                </span>
              </span>
            </motion.button>
          );
        })}

        <button
          type="button"
          onClick={handleAddBook}
          className="
            flex items-center justify-center gap-[6px]
            h-[48px] rounded-[12px]
            border-[1.5px] border-dashed border-layout-gray-100 dark:border-layout-gray-dark
            text-[14px] font-[700] tracking-[-0.02em] text-layout-gray-300
          "
        >
          <Plus size={15} weight="bold" className="text-layout-gray-200" />
          단어장 만들기
        </button>
      </div>
    </motion.div>
  );
};

export default Main;
