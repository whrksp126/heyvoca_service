// src/components/home/WordFeedCard.jsx
//
// 홈 — "지금 볼 만한 단어" 카드.
//
// 성과 카드(오늘 자란 단어 · 황금 당근)와 **같은 골격**을 쓴다. 홈에서 목록을 그리는
// 방식이 두 가지가 되면 같은 화면 안에서 두 번 배워야 한다.
//   카드     rounded-12 · p-16 · border-farm-line · bg-layout-white
//   머리     제목 14/700 좌측 + 우측에 개수 또는 이동 링크 12/700 #9A9A9A
//   행       36px · 구분선 #F4F4F4 · 작물 28px + 단어 15/700 + 우측 상태 11/700
//
// 홈에 진행 지표를 두지 않는다는 시안 §7 은 그대로 지킨다 — 여기 적히는 건 퍼센트나
// n/m 이 아니라 **단어 그 자체**다. "오늘 6/20"은 얼마나 했는지를 말하지만
// "abandon 3일 지남"은 무엇을 해야 하는지를 말한다.

import React from 'react';
import { CaretRight } from '@phosphor-icons/react';
import CropImage from '../farm/CropImage';
import { HEALTH_STATES } from '../../utils/crop';

const VISIBLE_ROWS = 3;

/** 우측 상태 글자색 — 단어장·찾기 목록과 같은 규칙(시안 vocabooks §5) */
const TONE_CLASS = {
  muted: 'text-[#9A9A9A]',
  today: 'text-primary-main-600',
  late: 'text-health-critical',
  rot: 'text-layout-gray-400 dark:text-layout-gray-300',
  grown: 'text-status-success-600',
};

/**
 * @param {string}   title    카드 제목
 * @param {array}    items    /farm/home-feed 의 행들 (user_voca_id · word · crop · health · days_to_review)
 * @param {function} tone     행 → { text, tone } — 우측에 찍을 글자
 * @param {string}   moreLabel 우측 링크 글자 (없으면 개수만)
 * @param {function} onMore   우측 링크·카드를 눌렀을 때
 */
const WordFeedCard = ({ title, items = [], tone, moreLabel, onMore }) => {
  "use memo";

  if (!items.length) return null;

  const rows = items.slice(0, VISIBLE_ROWS);
  const rest = items.length - rows.length;

  return (
    <div className="
      rounded-[12px] p-[16px]
      bg-layout-white dark:bg-layout-gray-dark
      border border-farm-line dark:border-transparent
    ">
      <div className="flex items-center justify-between gap-[8px]">
        <h4 className="flex-1 text-layout-black dark:text-layout-white text-[14px] font-[700] tracking-[-0.02em]">
          {title}
        </h4>
        {onMore ? (
          <button
            type="button"
            onClick={onMore}
            className="flex items-center gap-[3px] flex-shrink-0 text-layout-gray-300 text-[12px] font-[700]"
          >
            {moreLabel || items.length}
            <CaretRight size={10} weight="fill" className="text-layout-gray-200" />
          </button>
        ) : (
          <span className="flex-shrink-0 text-layout-gray-300 text-[12px] font-[700]">
            {items.length}
          </span>
        )}
      </div>

      <div className="mt-[8px]">
        {rows.map((item, idx) => {
          const right = tone ? tone(item) : null;
          return (
            <div
              key={item.user_voca_id ?? `${item.word}-${idx}`}
              className={`flex items-center gap-[10px] h-[36px] ${
                idx > 0 ? 'border-t border-[#F4F4F4] dark:border-[rgba(255,255,255,.08)]' : ''
              }`}
            >
              <CropImage
                stage={item.stage || item.crop}
                health={item.health || HEALTH_STATES.FRESH}
                size={46}
                className="flex-shrink-0"
              />
              <span className="flex-1 min-w-0 truncate text-layout-black dark:text-layout-white text-[15px] font-[700] tracking-[-0.02em]">
                {item.word}
              </span>
              {/* 뜻은 넣지 않는다 — 36px 한 줄에 단어·뜻·상태를 다 넣으면 셋 다 잘린다.
                  홈에서 필요한 판단은 "무엇을 봐야 하나"까지고, 뜻은 학습에서 바로 나온다.
                  (오늘 자란 단어 카드도 같은 이유로 단어와 단계만 적는다) */}
              {right && (
                <span className={`flex-shrink-0 text-[11px] font-[700] ${TONE_CLASS[right.tone] || TONE_CLASS.muted}`}>
                  {right.text}
                </span>
              )}
            </div>
          );
        })}
        {rest > 0 && (
          <div className="
            flex items-center justify-center h-[30px]
            border-t border-[#F4F4F4] dark:border-[rgba(255,255,255,.08)]
            text-[12px] font-[700] text-[#9A9A9A]
          ">
            +{rest}개 더
          </div>
        )}
      </div>
    </div>
  );
};

export default WordFeedCard;
