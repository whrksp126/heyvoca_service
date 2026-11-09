// src/components/onboarding/QuestSteps.jsx
//
// 입문 퀘스트 6단계 진행 줄 — 완료(체크) / 현재(번호, 핑크) / 잠김(자물쇠).
// 홈 퀘스트 카드와 잠금 안내 시트가 같이 쓴다.

import React from 'react';
import { Check, Lock } from '@phosphor-icons/react';

const QuestSteps = ({ missions = [], currentKey = null, highlightKey = null }) => (
  <ol className="flex items-center w-full" aria-label="입문 퀘스트 진행">
    {missions.map((m, idx) => {
      const isCurrent = m.key === currentKey;
      const isHighlighted = highlightKey && m.unlocks === highlightKey && !m.done;
      const prevDone = idx > 0 && missions[idx - 1].done;
      return (
        <li key={m.key} className={`flex items-center ${idx === 0 ? '' : 'flex-1'}`}>
          {idx > 0 && (
            <span
              aria-hidden="true"
              className={`flex-1 h-[2px] mx-[4px] rounded-full ${
                prevDone ? 'bg-status-success-600' : 'bg-layout-gray-100 dark:bg-[rgba(255,255,255,.12)]'
              }`}
            />
          )}
          <span
            aria-label={`${m.order ?? idx + 1}단계 ${m.done ? '완료' : isCurrent ? '진행 중' : '잠김'}`}
            className={`shrink-0 flex items-center justify-center w-[26px] h-[26px] rounded-full text-[12px] font-[800] ${
              m.done
                ? 'bg-status-success-600 text-layout-white'
                : isCurrent
                  ? 'bg-primary-main-600 text-layout-white dark:text-layout-black'
                  : isHighlighted
                    ? 'bg-layout-white dark:bg-layout-gray-dark border-[2px] border-primary-main-600 text-primary-main-600'
                    : 'bg-layout-gray-100 dark:bg-[rgba(255,255,255,.12)] text-layout-gray-300'
            }`}
          >
            {m.done ? (
              <Check size={14} weight="bold" />
            ) : isCurrent ? (
              m.order ?? idx + 1
            ) : (
              <Lock size={12} weight="bold" />
            )}
          </span>
        </li>
      );
    })}
  </ol>
);

export default QuestSteps;
