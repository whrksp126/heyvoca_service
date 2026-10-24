import React from 'react';
import { Check, SealCheck } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import CropImage from '../farm/CropImage';
import { IconCare } from '../../assets/svg/icon';
// 밭 썸네일 — 시안 §2. 홈 히어로와 같은 밭을 작게 그린다.
// 예전에는 미리 구워 둔 네 장(book-seed/early/mid/done) 중 하나를 골라 썼는데,
// 그러면 어느 단어장이든 넷 중 하나로만 보였다. 지금은 그 단어장에 실제로 심긴
// 작물을 그대로 심는다 — 목록에서 밭 그림을 먼저 본다는 시안 §2 가 그제야 성립한다.
import FarmField from '../farm/FarmField';
import { HEALTH_STATES, CROP_LABEL } from '../../utils/crop';
import {
  CROP_ORDER,
  bookStageCounts,
  bookCareCount,
  bookFieldData,
  bookFieldWords,
  bookBadge,
} from '../../utils/vocaCrop';

/*
  단어장 카드 — 학습장 "단어장" 탭(VocaBooksTab)과 단어장 선택 풀시트(VocabularySheetNewFullSheet)가
  같이 쓴다(이슈 #16 후속). 선택 풀시트는 selected 만 넘겨 테두리·체크로 고른 상태를 보인다.
*/

/** 카드 배지 — 시안 §1① (돌봄 N · 완료 · 씨앗) */
const BADGE_CLASS = {
  care: 'bg-secondary-blue-100 dark:bg-secondary-blue-dark text-[#175CD3] dark:text-[#84CAFF]',
  done: 'bg-status-success-100 dark:bg-status-success-dark text-status-success-600',
};

const BADGE_ICON = {
  care: IconCare,
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

/** 카드마다 필요한 파생값 — 목록·칩·배지가 같은 수를 봐야 한다 */
export const buildBookRow = (book) => {
  const counts = bookStageCounts(book.words);
  return {
    book,
    counts,
    field: bookFieldData(book.words),
    fieldWords: bookFieldWords(book.words),
    care: bookCareCount(book.words),
    badge: bookBadge(book.words, counts),
    touchedAt: lastTouchedAt(book),
    // 서점에서 받았거나 온보딩으로 제공받은 단어장 — 단어 추가·수정·삭제가
    // 막혀 있는 헤이보카 검증 단어장이다. WordDetaileNewBottomSheet·
    // VocabularyWordsNewFullSheet 의 isPurchasedBook 과 같은 판별이다.
    isVerified: book.vocaBookStoreId != null,
  };
};

/** 글자(문자 학습) 단어장은 단어장 목록에 보이지 않는다(2026-09-30, VocaBooksTab 주석) */
export const isScriptBook = (book) => book?.book_kind === 'script' || book?.bookKind === 'script';

const VocaBookCard = ({ row, onClick, selected = null, dimmed = false }) => {
  const {
    book, counts, field, fieldWords, badge, isVerified,
  } = row;
  const BadgeIcon = badge ? BADGE_ICON[badge.kind] : null;
  const selectable = selected !== null;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      aria-pressed={selectable ? selected : undefined}
      className={`
        flex items-center gap-[12px] w-full p-[12px] text-left
        rounded-[12px]
        border
        bg-farm-canvas dark:bg-layout-gray-dark
        transition-opacity
        ${selected ? 'border-primary-main-600 ring-1 ring-inset ring-primary-main-600' : 'border-farm-line'}
        ${dimmed ? 'opacity-50' : ''}
      `}
    >
      {/* 이 단어장의 밭. 64px 에서는 작물 하나하나가 점만 하지만,
          밭의 **어느 구역이 찼는가**는 그 크기에서도 읽힌다.
          크기는 이 상자가 정한다 — FarmField 는 상자를 100% 채운다. */}
      <span className="block w-[64px] shrink-0">
        <FarmField
          counts={field.counts}
          healthMix={field.healthMix}
          words={fieldWords}
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
              {BadgeIcon && <BadgeIcon size={badge.kind === 'care' ? 15 : 10} weight="bold" />}
              {badge.text}
            </span>
          )}
          {selectable && (
            <span
              aria-hidden
              className={`
                flex items-center justify-center shrink-0 w-[20px] h-[20px] rounded-full
                ${selected
                  ? 'bg-primary-main-600 text-layout-white dark:text-layout-black'
                  : 'border-[1.5px] border-layout-gray-200 dark:border-layout-gray-400'}
              `}
            >
              {selected && <Check size={12} weight="bold" />}
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
              align="center"
              alt="미학습"
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
                  align="center"
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
};

export default VocaBookCard;
