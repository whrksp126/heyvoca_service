// src/components/home/GrewTodayCard.jsx
//
// 홈 — 성과 카드 ① "오늘 자란 단어" (시안 §10).
//
// 오늘 승급한 단어 목록이다. 주 단위가 아니라 오늘 단위.
// 이전 카드의 썸네일(이파리 아이콘 3개 + "+6")은 아무것도 말하지 않았다 —
// 숫자가 이미 한 말이었고 어떤 단어가 자랐는지는 알 수 없었다.
// "새싹 3개가 자랐어요"보다 "abandon이 이파리가 됐어요"가 훨씬 오래 남는다.
//
//   행 높이 36px · 구분선 #F4F4F4 — 3행까지 노출하고 넘치면 "+N개 더"
//   아이콘 28px — 올라간 뒤의 단계. 글자를 읽지 않고도 목록이 스캔된다
//   단어 15px/700 · 우측은 "몇 단계에서 왔나"가 아니라 대표 뜻(11~12px, 옅은 색)
//
// §10 — 이 카드는 조건부다. 오늘 자란 단어가 없으면 카드를 아예 띄우지 않는다.
// "아직 없어요" 같은 빈 상태 문구는 홈에서 자리를 낭비한다.
//
// §10 — CTA 에는 아이콘을 두지 않는데 여기에는 둔다. 기준은 정보가 겹치는가가 아니라
// 역할이 다른가다. CTA 의 물방울은 "물주기"와 완전히 같은 말이지만,
// 이 아이콘은 목록을 읽지 않고 훑을 수 있게 만든다.
//
// 우측 "씨앗 → 새싹" 단계 변화 문구는 뺐다(사용자 목업 승인) — 이 카드는 이미 "오늘 자란"이라고
// 제목에서 말하고 있어 단계 변화까지 다시 읽는 건 같은 사실의 반복이었다. 대신 그 자리에
// 대표 뜻을 넣어 목록만 보고도 무슨 단어인지 알 수 있게 한다.

import React from 'react';
import CropImage from '../farm/CropImage';
import { HEALTH_STATES } from '../../utils/crop';

const VISIBLE_ROWS = 3;

/**
 * @param {array}    items      { user_voca_id, word, from, to, meaning } — meaning은 없을 수 있다
 *                              (todayChanges 응답에 방금 추가되는 필드라 과도기에는 비어 있을 수 있음).
 * @param {function} [onViewAll] "+n개 더" 를 눌렀을 때 — 전체 목록 시트를 연다.
 *                              헤더 숫자는 진입점이 아니다(사용자 목업 승인) — "+n개 더"와 같은 곳으로 가는
 *                              중복 진입점이라 화살표를 떼고 글자만 남겼다.
 */
const GrewTodayCard = ({ items = [], onViewAll }) => {
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
          오늘 자란 단어
        </h4>
        <span className="flex-shrink-0 text-layout-gray-300 text-[12px] font-[700]">
          {items.length}
        </span>
      </div>

      <div className="mt-[8px]">
        {rows.map((item, idx) => (
          <div
            key={`${item.user_voca_id ?? item.word}-${idx}`}
            className={`flex items-center gap-[10px] h-[36px] ${
              idx > 0 ? 'border-t border-[#F4F4F4] dark:border-[rgba(255,255,255,.08)]' : ''
            }`}
          >
            <CropImage
              stage={item.to}
              health={HEALTH_STATES.FRESH}
              size={28}
              className="flex-shrink-0"
            />
            <span className="flex-1 min-w-0 truncate text-layout-black dark:text-layout-white text-[15px] font-[700] tracking-[-0.02em]">
              {item.word}
            </span>
            {item.meaning ? (
              <span className="flex-shrink-0 max-w-[45%] truncate text-[11px] font-[400] text-layout-gray-300 text-right">
                {item.meaning}
              </span>
            ) : null}
          </div>
        ))}
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

export default GrewTodayCard;
