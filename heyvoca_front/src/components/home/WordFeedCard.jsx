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
 * @param {string}   title      카드 제목
 * @param {array}    items      /farm/home-feed 의 행들 (user_voca_id · word · meaning · crop · health · days_to_review)
 * @param {function} [tone]     행 → { text, tone } — 우측에 찍을 상태 글자. **없으면 대신 뜻을 옅게 우측 정렬로 찍는다**
 *                              ("아직 심지 않은 씨앗" · "최근에 심은 단어" — 안 배움/씨앗 같은 상태어를 없애고 뜻으로 바꿨다)
 * @param {boolean}  [showCrop=true] false면 좌측 작물 아이콘을 생략한다("최근에 심은 단어" 전용 — 단어가 왼쪽 끝에서 시작)
 * @param {string}   [moreLabel] 헤더 우측 링크 글자. onMore와 함께 있을 때만 쓴다(예: "물주기"·"보관소") —
 *                              이건 더보기가 아니라 학습·보관소로 가는 별도 동작이라 화살표를 유지한다
 * @param {function} [onMore]    헤더 우측 링크를 눌렀을 때(예: 물주기 → 바로 학습 시작, 보관소 → 돌볼 작물 시트).
 *                              없으면 헤더는 안 눌리는 숫자로 남는다 — "+n개 더"와 같은 곳으로 가는 중복
 *                              진입점이었기 때문(사용자 목업 승인)
 * @param {number}   [totalCount] 헤더 숫자·"+n개 더" 계산에 쓸 실제 총량. 없으면 items.length
 * @param {function} [onViewAll] "+n개 더"를 눌렀을 때 전체 목록 시트를 여는 핸들러
 */
const WordFeedCard = ({ title, items = [], tone, showCrop = true, moreLabel, onMore, totalCount, onViewAll }) => {
  "use memo";

  if (!items.length) return null;

  const rows = items.slice(0, VISIBLE_ROWS);
  const total = totalCount ?? items.length;
  const rest = Math.max(0, total - rows.length);

  // 헤더 우측 — onMore(물주기·보관소 같은 전용 동작)가 있을 때만 누를 수 있다.
  // onMore가 없는 카드(씨앗·최근에 심은 단어)는 헤더가 "+n개 더"와 같은 곳으로 가는 중복
  // 진입점이었다 — "+n개 더"만 남기고 헤더는 안 눌리는 숫자로 되돌린다(사용자 목업 승인).
  const headerHandler = onMore;
  const headerLabel = moreLabel || total;

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
        {headerHandler ? (
          <button
            type="button"
            onClick={headerHandler}
            className="flex items-center gap-[3px] flex-shrink-0 text-layout-gray-300 text-[12px] font-[700]"
          >
            {headerLabel}
            <CaretRight size={10} weight="fill" className="text-layout-gray-200" />
          </button>
        ) : (
          <span className="flex-shrink-0 text-layout-gray-300 text-[12px] font-[700]">
            {headerLabel}
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
              {showCrop && (
                <CropImage
                  stage={item.stage || item.crop}
                  health={item.health || HEALTH_STATES.FRESH}
                  size={46}
                  className="flex-shrink-0"
                />
              )}
              <span className="flex-1 min-w-0 truncate text-layout-black dark:text-layout-white text-[15px] font-[700] tracking-[-0.02em]">
                {item.word}
              </span>
              {right ? (
                <span className={`flex-shrink-0 text-[11px] font-[700] ${TONE_CLASS[right.tone] || TONE_CLASS.muted}`}>
                  {right.text}
                </span>
              ) : (
                // 상태 글자 대신 대표 뜻 — 옅은 색으로 우측 정렬(사용자 승인 목업).
                item.meaning ? (
                  <span className="flex-shrink-0 max-w-[45%] truncate text-[11px] font-[400] text-layout-gray-300 text-right">
                    {item.meaning}
                  </span>
                ) : null
              )}
            </div>
          );
        })}
        {rest > 0 && (
          onViewAll ? (
            <button
              type="button"
              onClick={onViewAll}
              className="
                flex items-center justify-center w-full h-[30px]
                border-t border-[#F4F4F4] dark:border-[rgba(255,255,255,.08)]
                text-[12px] font-[700] text-[#9A9A9A]
              "
            >
              +{rest}개 더
            </button>
          ) : (
            <div className="
              flex items-center justify-center h-[30px]
              border-t border-[#F4F4F4] dark:border-[rgba(255,255,255,.08)]
              text-[12px] font-[700] text-[#9A9A9A]
            ">
              +{rest}개 더
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default WordFeedCard;
