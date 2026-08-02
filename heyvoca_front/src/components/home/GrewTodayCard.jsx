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
//   단어 15px/700 · 단계 변화 11px/700 (이전 #9A9A9A → 이후 #12B76A · 구분자 CaretRight 8px)
//
// §10 — 이 카드는 조건부다. 오늘 자란 단어가 없으면 카드를 아예 띄우지 않는다.
// "아직 없어요" 같은 빈 상태 문구는 홈에서 자리를 낭비한다.
//
// §10 — CTA 에는 아이콘을 두지 않는데 여기에는 둔다. 기준은 정보가 겹치는가가 아니라
// 역할이 다른가다. CTA 의 물방울은 "물주기"와 완전히 같은 말이지만,
// 이 아이콘은 목록을 읽지 않고 훑을 수 있게 만든다.

import React from 'react';
import { CaretRight } from '@phosphor-icons/react';
import CropImage from '../farm/CropImage';
import { CROP_LABEL, HEALTH_STATES } from '../../utils/crop';

const VISIBLE_ROWS = 3;

const GrewTodayCard = ({ items = [] }) => {
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
        <span className="flex items-center gap-[3px] flex-shrink-0 text-layout-gray-300 text-[12px] font-[700]">
          {items.length}
          <CaretRight size={10} weight="fill" className="text-layout-gray-200" />
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
            <span className="flex items-center gap-[3px] flex-shrink-0 text-[11px] font-[700] text-[#9A9A9A]">
              {CROP_LABEL[item.from]}
              <CaretRight size={8} weight="fill" className="text-layout-gray-200" />
              <b className="font-[700] text-[#12B76A]">{CROP_LABEL[item.to]}</b>
            </span>
          </div>
        ))}
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

export default GrewTodayCard;
