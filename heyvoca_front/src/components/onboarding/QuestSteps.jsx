// src/components/onboarding/QuestSteps.jsx
//
// 입문 퀘스트 세로 타임라인(이슈 #25) — 7단계를 위에서 아래로 나열한다.
// 완료(초록 체크) / 지금 할 것(핑크 번호) / 남음(회색 번호). 각 줄 오른쪽에 보상 보석.
//
// 2026-11 QA #25 3차: 줄은 아코디언이다. 제목 줄을 누르면 '어떻게 달성하는지' 설명과
// 작은 「바로가기」가 펼쳐지고, 다시 누르면 접힌다(오른쪽 캐럿). 「바로가기」만 onSelect(key) 로 이동한다.
// 완료한 줄은 펼치지 않는다. 홈 퀘스트 카드와 퀘스트 바텀시트가 같이 쓴다.
//
// 이슈 #25 11차 — 완료 연출. celebrateKeys(방금 새로 완료된 key 배열, 순서대로)를 받으면
// 그 줄들을 '아직 안 한' 모양으로 그렸다가 하나씩: 체크가 그려지며 완료(스케일 + 왼→오 clip 드로잉)
// → 연결선이 다음 단계로 채워짐(scaleY) → 다 끝나면 다음 할 단계가 강조(링 펄스)되며 펼쳐진다.
// 끝나면 onCelebrated() 를 부른다. transform/opacity(clip-path) 만 움직인다.
// 12차: celebrateHold=true 면 연출을 시작하지 않고 그 줄들을 '아직 안 한' 모양으로 붙잡아 둔다
// (홈 위에 보상 시트·업적 연출이 남아 있는 동안). hold 가 풀리면 그때 시작한다.

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, CaretDown, CaretRight } from '@phosphor-icons/react';
import { questTitleOf } from '../../context/OnboardingUnlockContext';
import gemIcon from '../../assets/images/farm/icon-gem.png';

// 달성 방법 — 실제 동선 기준(완료 판정: routes/onboarding.py 머리 주석, 프론트 신호는 TakeTest·StudyMain·dictionary/Main).
export const QUEST_HOW = {
  buy_book: '상점 탭에서 단어장을 골라 담으면 완료돼요.',
  plant_seed: '홈 「농장 돌보기」 버튼에서 「새 씨앗 심기」를 골라 끝까지 학습하면 완료돼요.',
  care_farm: '홈 「농장 돌보기」 버튼에서 「농장 돌보기」를 골라 끝까지 학습하면 완료돼요.',
  search_word: '찾기 탭에서 단어를 검색하면 완료돼요.',
  make_book: '단어장 탭에서 「단어장 만들기」로 단어장을 만들고, 그 단어장에 단어를 추가하면 완료돼요.',
  free_test: '홈 「농장 돌보기」 → 「밭 골라 돌보기」에서 단어장을 고르고 「자유 설정 테스트」를 끝까지 풀면 완료돼요.',
  focus_study: '홈 「농장 돌보기」 → 「밭 골라 돌보기」에서 단어장을 고르고 「집중 반복 학습」을 끝까지 들으면 완료돼요.',
};

// 연출 타이밍(ms) — 진입 대기 · 체크 · 연결선
const CELEBRATE_DELAY = 450;
const CHECK_MS = 480;
const LINE_MS = 380;

const QuestSteps = ({
  missions = [], currentKey = null, onSelect, celebrateKeys = null, celebrateHold = false, onCelebrated,
}) => {
  const [openKey, setOpenKey] = useState(null);
  // 연출 진행 단계 — key i 의 체크는 step 2i, 연결선은 2i+1, 다 끝나면 2n. -1 = 시작 전.
  // 어느 연출(sig)의 단계인지 같이 적어 둔다 — 새 연출이 시작되는 첫 렌더에 지난 연출의 단계가 새지 않게.
  const [stepState, setStepState] = useState({ sig: '', n: -1 });
  const [pulseKey, setPulseKey] = useState(null);
  const celebrateList = Array.isArray(celebrateKeys) ? celebrateKeys : [];
  const celebrateSig = celebrateList.join(',');
  const celebrating = celebrateList.length > 0;
  const step = (!celebrateHold && stepState.sig === celebrateSig) ? stepState.n : -1;

  useEffect(() => {
    if (!celebrateSig || celebrateHold) return undefined;
    const keys = celebrateSig.split(',');
    const timers = [];
    const setStep = (n) => setStepState({ sig: celebrateSig, n });
    let t = CELEBRATE_DELAY;
    setStep(-1);
    keys.forEach((_, i) => {
      timers.push(setTimeout(() => setStep(2 * i), t));
      t += CHECK_MS;
      timers.push(setTimeout(() => setStep(2 * i + 1), t));
      t += LINE_MS;
    });
    timers.push(setTimeout(() => {
      setStep(2 * keys.length);
      // 다음 할 단계 — 연출이 끝난 시점의 첫 미완료 줄을 강조하며 펼친다
      const next = missions.find((m) => !m.done);
      if (next) {
        setPulseKey(next.key);
        setOpenKey(next.key);
      }
      if (onCelebrated) onCelebrated();
    }, t));
    timers.push(setTimeout(() => setPulseKey(null), t + 1400));
    return () => timers.forEach(clearTimeout);
    // missions/onCelebrated 는 연출 시작 시점 값이면 충분하다 — 서명이 바뀔 때만 다시 시작
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebrateSig, celebrateHold]);

  // 화면에 보이는 완료 상태 — 연출 대상은 자기 차례(체크 단계)가 오기 전까지 '아직 안 함'으로 그린다
  const visualDone = (m) => {
    if (!m.done) return false;
    const ci = celebrating ? celebrateList.indexOf(m.key) : -1;
    return ci === -1 || step >= 2 * ci;
  };
  const lineFilled = (m) => {
    if (!m.done) return false;
    const ci = celebrating ? celebrateList.indexOf(m.key) : -1;
    return ci === -1 || step >= 2 * ci + 1;
  };
  // 지금 할 것(핑크) — 연출 중엔 '보이는' 첫 미완료 줄이 강조를 이어받는다
  const visualCurrentKey = celebrating
    ? (missions.find((m) => !visualDone(m))?.key ?? null)
    : currentKey;

  return (
    <ol className="flex flex-col" aria-label="입문 퀘스트">
      {missions.map((rawM, idx) => {
        const m = { ...rawM, done: visualDone(rawM) };
        const filled = lineFilled(rawM);
        const isCurrent = m.key === visualCurrentKey;
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
                className="absolute left-[11px] top-[29px] bottom-[-7px] w-[2px] rounded-full overflow-hidden bg-layout-gray-100 dark:bg-[rgba(255,255,255,.12)]"
              >
                <motion.span
                  className="absolute inset-0 origin-top bg-status-success-600"
                  initial={false}
                  animate={{ scaleY: filled ? 1 : 0 }}
                  transition={{ duration: LINE_MS / 1000, ease: 'easeInOut' }}
                />
              </span>
            )}
            <button
              type="button"
              disabled={!expandable}
              onClick={expandable ? () => setOpenKey(isOpen ? null : m.key) : undefined}
              aria-expanded={expandable ? isOpen : undefined}
              aria-label={`${num}단계 ${questTitleOf(m)} ${m.done ? '완료' : ''}`}
              className="relative w-full flex items-center gap-[10px] min-h-[36px] py-[5px] text-left disabled:cursor-default"
            >
              <motion.span
                initial={false}
                animate={m.done && celebrating && celebrateList.includes(m.key)
                  ? { scale: [0.7, 1.18, 1] }
                  : { scale: 1 }}
                transition={{ duration: CHECK_MS / 1000, ease: 'easeOut' }}
                className={`relative shrink-0 flex items-center justify-center w-[24px] h-[24px] rounded-full text-[12px] font-[800] transition-colors duration-200 ${
                  m.done
                    ? 'bg-status-success-600 text-layout-white'
                    : isCurrent
                      ? 'bg-status-success-50 dark:bg-status-success-dark border-[1.5px] border-status-success-600 text-status-success-600'
                      : 'bg-layout-white dark:bg-layout-gray-dark border-[1.5px] border-layout-gray-200 dark:border-[rgba(255,255,255,.2)] text-layout-gray-300'
                }`}
              >
                {m.done ? (
                  <motion.span
                    className="flex"
                    initial={celebrating && celebrateList.includes(m.key) ? { clipPath: 'inset(0 100% 0 0)' } : false}
                    animate={{ clipPath: 'inset(0 0% 0 0)' }}
                    transition={{ duration: CHECK_MS / 1000, ease: 'easeOut', delay: 0.08 }}
                  >
                    <Check size={13} weight="bold" />
                  </motion.span>
                ) : num}
                {/* 다음 단계가 열릴 때 한 번 퍼지는 링 */}
                <AnimatePresence>
                  {pulseKey === m.key && (
                    <motion.span
                      key="pulse"
                      aria-hidden="true"
                      className="absolute inset-0 rounded-full border-[2px] border-status-success-600 pointer-events-none"
                      initial={{ scale: 1, opacity: 0.8 }}
                      animate={{ scale: [1, 1.9, 1, 1.9], opacity: [0.8, 0, 0.8, 0] }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 1.3, ease: 'easeOut', times: [0, 0.45, 0.5, 1] }}
                    />
                  )}
                </AnimatePresence>
              </motion.span>
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
                {/* 필수 퀘스트(이슈 #25 9차) — 셋을 끝내야 홈에서 퀘스트를 숨길 수 있다 */}
                {m.required && !m.done && (
                  <span className="shrink-0 inline-flex items-center h-[18px] px-[6px] rounded-full bg-status-success-50 dark:bg-status-success-dark text-[11px] font-[700] text-status-success-600">
                    필수
                  </span>
                )}
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
                        className="mt-[6px] inline-flex items-center gap-[2px] h-[28px] px-[10px] rounded-full bg-status-success-50 dark:bg-status-success-dark text-[12px] font-[700] text-status-success-600"
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
