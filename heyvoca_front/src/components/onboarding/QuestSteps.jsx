// src/components/onboarding/QuestSteps.jsx
//
// 입문 퀘스트 세로 타임라인(이슈 #25) — 7단계를 위에서 아래로 나열한다.
// 완료(초록 체크) / 지금 할 것(핑크 번호) / 남음(회색 번호). 각 줄 오른쪽에 보상 보석.
//
// 2026-11 QA #25 3차: 줄은 아코디언이다. 제목 줄을 누르면 '어떻게 달성하는지' 설명과
// 작은 「바로가기」가 펼쳐지고, 다시 누르면 접힌다(오른쪽 캐럿). 「바로가기」만 onSelect(key) 로 이동한다.
// 완료한 줄은 펼치지 않는다. 홈 퀘스트 카드와 퀘스트 바텀시트가 같이 쓴다.

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, CaretDown, CaretRight } from '@phosphor-icons/react';
import { questTitleOf } from '../../context/OnboardingUnlockContext';
import gemIcon from '../../assets/images/farm/icon-gem.png';

// 달성 방법 — 실제 동선 기준(완료 판정: routes/onboarding.py 머리 주석, 프론트 신호는 TakeTest·StudyMain·dictionary/Main).
export const QUEST_HOW = {
  buy_book: '상점 탭에서 단어장을 골라 담으면 완료돼요.',
  plant_seed: '홈 「농사 시작」에서 「농장에 새 씨앗 심기」를 골라 끝까지 학습하면 완료돼요.',
  care_farm: '홈 「농사 시작」에서 「농장 돌보기」를 골라 끝까지 학습하면 완료돼요.',
  search_word: '찾기 탭에서 단어를 검색하면 완료돼요.',
  make_book: '단어장 탭에서 「단어장 만들기」로 단어장을 만들고, 그 단어장에 단어를 추가하면 완료돼요.',
  free_test: '홈 「농사 시작」 → 「밭 골라 학습」에서 단어장을 고르고 「자유 설정 테스트」를 끝까지 풀면 완료돼요.',
  focus_study: '홈 「농사 시작」 → 「밭 골라 학습」에서 단어장을 고르고 「집중 반복 학습」을 끝까지 들으면 완료돼요.',
};

const QuestSteps = ({ missions = [], currentKey = null, onSelect }) => {
  const [openKey, setOpenKey] = useState(null);

  return (
    <ol className="flex flex-col" aria-label="입문 퀘스트">
      {missions.map((m, idx) => {
        const isCurrent = m.key === currentKey;
        const isLast = idx === missions.length - 1;
        const num = m.order ?? idx + 1;
        const expandable = !m.done;
        const isOpen = expandable && openKey === m.key;
        const how = QUEST_HOW[m.key];
        return (
          <li key={m.key} className="relative">
            {/* 세로 연결선 — 다음 줄의 점까지 잇는다(펼친 설명 높이만큼 같이 늘어난다) */}
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
              disabled={!expandable}
              onClick={expandable ? () => setOpenKey(isOpen ? null : m.key) : undefined}
              aria-expanded={expandable ? isOpen : undefined}
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
              <span className="flex-1 min-w-0 flex items-center gap-[4px]">
                <span
                  className={`min-w-0 truncate text-[14px] tracking-[-0.02em] ${
                    m.done
                      ? 'font-[600] text-layout-gray-300 line-through decoration-layout-gray-200'
                      : isCurrent
                        ? 'font-[800] text-layout-black dark:text-layout-white'
                        : 'font-[600] text-layout-gray-400 dark:text-layout-gray-300'
                  }`}
                >
                  {questTitleOf(m)}
                </span>
                {expandable && (
                  <CaretDown
                    size={12}
                    weight="bold"
                    aria-hidden="true"
                    className={`shrink-0 text-layout-gray-300 transition-transform duration-200 motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`}
                  />
                )}
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

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  key="how"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="overflow-hidden"
                >
                  <div className="pl-[34px] pb-[8px]">
                    {how && (
                      <p className="text-[13px] font-[500] leading-[1.45] tracking-[-0.02em] text-layout-gray-400 dark:text-layout-gray-300 break-keep">
                        {how}
                      </p>
                    )}
                    {onSelect && (
                      <button
                        type="button"
                        onClick={() => onSelect(m.key)}
                        className="mt-[6px] inline-flex items-center gap-[2px] h-[28px] px-[10px] rounded-full bg-primary-main-100 dark:bg-primary-main-dark text-[12px] font-[700] text-primary-main-600"
                      >
                        바로가기
                        <CaretRight size={11} weight="bold" />
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </li>
        );
      })}
    </ol>
  );
};

export default QuestSteps;
