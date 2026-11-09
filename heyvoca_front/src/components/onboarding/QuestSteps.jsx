// src/components/onboarding/QuestSteps.jsx
//
// 입문 퀘스트 세로 타임라인(이슈 #25 2차) — 7단계를 위에서 아래로 나열한다.
// 완료(초록 체크) / 지금 할 것(핑크 번호) / 남음(회색 번호). 각 줄 오른쪽에 보상 보석.
// 줄을 누르면 onSelect(key) — 완료한 줄은 누를 수 없다.
// 홈 퀘스트 카드와 퀘스트 바텀시트가 같이 쓴다.

import React from 'react';
import { Check } from '@phosphor-icons/react';
import { questTitleOf } from '../../context/OnboardingUnlockContext';
import gemIcon from '../../assets/images/farm/icon-gem.png';

const QuestSteps = ({ missions = [], currentKey = null, onSelect }) => (
  <ol className="flex flex-col" aria-label="입문 퀘스트">
    {missions.map((m, idx) => {
      const isCurrent = m.key === currentKey;
      const isLast = idx === missions.length - 1;
      const num = m.order ?? idx + 1;
      const clickable = !m.done && !!onSelect;
      return (
        <li key={m.key} className="relative">
          {/* 세로 연결선 — 다음 줄의 점까지 잇는다 */}
          {!isLast && (
            <span
              aria-hidden="true"
              className={`absolute left-[11px] top-[29px] bottom-[-7px] w-[2px] rounded-full ${
                m.done ? 'bg-status-success-600' : 'bg-layout-gray-100 dark:bg-[rgba(255,255,255,.12)]'
              }`}
            />
          )}
          <button
            type="button"
            disabled={!clickable}
            onClick={clickable ? () => onSelect(m.key) : undefined}
            aria-label={`${num}단계 ${questTitleOf(m)} ${m.done ? '완료' : ''}`}
            className="relative w-full flex items-center gap-[10px] min-h-[36px] py-[5px] text-left disabled:cursor-default"
          >
            <span
              className={`shrink-0 flex items-center justify-center w-[24px] h-[24px] rounded-full text-[12px] font-[800] ${
                m.done
                  ? 'bg-status-success-600 text-layout-white'
                  : isCurrent
                    ? 'bg-primary-main-600 text-layout-white dark:text-layout-black'
                    : 'bg-layout-white dark:bg-layout-gray-dark border-[1.5px] border-layout-gray-200 dark:border-[rgba(255,255,255,.2)] text-layout-gray-300'
              }`}
            >
              {m.done ? <Check size={13} weight="bold" /> : num}
            </span>
            <span
              className={`flex-1 min-w-0 truncate text-[14px] tracking-[-0.02em] ${
                m.done
                  ? 'font-[600] text-layout-gray-300 line-through decoration-layout-gray-200'
                  : isCurrent
                    ? 'font-[800] text-layout-black dark:text-layout-white'
                    : 'font-[600] text-layout-gray-400 dark:text-layout-gray-300'
              }`}
            >
              {questTitleOf(m)}
            </span>
            {Number(m.reward_gem) > 0 && (
              <span
                className={`shrink-0 inline-flex items-center gap-[3px] text-[13px] font-[800] ${
                  m.done ? 'text-layout-gray-200 dark:text-layout-gray-400' : 'text-layout-black dark:text-layout-white'
                }`}
              >
                <img
                  src={gemIcon}
                  alt=""
                  draggable={false}
                  className={`w-[16px] h-[16px] object-contain select-none ${m.done ? 'opacity-40' : ''}`}
                />
                {m.reward_gem}
              </span>
            )}
          </button>
        </li>
      );
    })}
  </ol>
);

export default QuestSteps;
