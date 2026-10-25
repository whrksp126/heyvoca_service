// src/components/home/TodayTasksCard.jsx
//
// 홈 — "오늘 할 일" 카드 (2026-09-27 확정 목업, scratchpad/home10/IMPL_SPEC.md).
//
// CTA 바로 아래, 기존 "지금 볼 만한 단어"(care·rotten)를 대신한다 — 같은 사실(썩은 단어·
// 시듦·돌봄)을 개수 카드와 목록 카드 두 곳에서 반복하지 않는다(Main.jsx 정리 참고).
//
// 행 4개, 고정 순서. 0인 행은 숨긴다 — 썩은 단어 / 시듦 물주기 / 오늘 돌봄 물주기 / 새 씨앗 심기.
// 오늘 살린 단어가 있고 남은 부패가 0이면 썩은 단어 행은 다른 행처럼 체크 + 진행 x/y 로 남는다(rotten.done).
// 2026-10-25(이슈 #16 §4) — 줄(정보)만 남긴다. 우측 '살리기'·'심기' 버튼과 카드 아래 넓은
// '새 씨앗 심기' 버튼은 뺐다 — 학습 진입은 홈 '농사 시작' → 학습 고르기 시트
// (newBottomSheet/StudyPickNewBottomSheet)가 한 곳에서 맡는다(살리기·심기 동작도 그쪽으로 옮겼다).

import React, { useState } from 'react';
import { Check } from '@phosphor-icons/react';
import { useStats } from '../../context/StatsContext';
import { vibrate } from '../../utils/osFunction';

const VISIBLE_WORDS = 3;

/** 우측 진행 x/y — 완료 여부는 왼쪽 체크로 이미 드러나므로 배지 없이 숫자만,
 *  완료 시 회색으로 낮춘다(개수 자체는 계속 보여준다). */
const Progress = ({ done, total }) => {
  const isDone = total > 0 && done >= total;
  return (
    <span className="shrink-0 flex items-baseline gap-[1px]">
      <b className={`text-[17px] font-[800] ${isDone ? 'text-[#BBBBBB]' : 'text-layout-black dark:text-layout-white'}`}>
        {done}
      </b>
      <span className={`text-[14px] font-[700] ${isDone ? 'text-[#BBBBBB]' : 'text-[#AAAAAA]'}`}>/{total}</span>
    </span>
  );
};

/**
 * 단어 목록 — 앞 3개 + '외 N개' → 눌러서 전체 칩으로 펼침.
 *
 * 압축 줄(compact)과 펼친 칩(expandedBlock) 모두 Row의 텍스트 칸(체크박스 오른쪽, 제목과
 * 같은 칼럼) 안에 얹는다 — 그래서 별도 들여쓰기(pl) 계산 없이도 타이틀 텍스트 시작선에
 * 그대로 맞는다. 둘은 동시에 그리지 않는다: 펼치면 compact 는 null 이고, '접기'는 칩 목록
 * 맨 끝에 놓인다.
 */
const buildWordListParts = (words = [], expanded, onToggle) => {
  if (words.length === 0) return { compact: null, expandedBlock: null };
  // 백엔드가 이미 "남은 단어 먼저 + done 단어는 뒤에" 순서로 내려준다(계약 확인).
  // 응답이 어떤 순서로 오든 항상 같은 화면이 되도록 여기서도 같은 규칙으로 다시 나눈다.
  const rest = words.filter((w) => !w.done);
  const done = words.filter((w) => w.done);
  const ordered = [...rest, ...done];
  const visible = ordered.slice(0, VISIBLE_WORDS);
  const hiddenCount = ordered.length - visible.length;

  const isExpanded = expanded && hiddenCount > 0;

  // 펼친 상태에서는 미리보기 줄을 그리지 않는다(단어가 칩 목록에서 한 번만 보이게).
  const compact = isExpanded ? null : (
    <span className="flex flex-wrap items-center gap-x-[8px] gap-y-[2px] text-[13px] font-[600] text-[#5A5A5A]">
      {visible.map((w) => (
        <span key={w.id} className={w.done ? 'text-[#BBBBBB] line-through' : undefined}>
          {w.word}
        </span>
      ))}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); vibrate({ duration: 5 }); onToggle(); }}
          aria-expanded={false}
          className="text-[13px] font-[700] text-layout-gray-400 underline underline-offset-2"
        >
          {`외 ${hiddenCount}개`}
        </button>
      )}
    </span>
  );

  const expandedBlock = isExpanded ? (
    <span className="flex flex-wrap items-center gap-[6px]">
      {ordered.map((w) => (
        <span
          key={w.id}
          className={`inline-flex items-center h-[28px] px-[10px] rounded-[8px] bg-[#F6F5F2] dark:bg-layout-gray-dark text-[13px] font-[700] ${
            w.done ? 'text-[#BBBBBB] line-through' : 'text-layout-gray-500 dark:text-layout-gray-200'
          }`}
        >
          {w.word}
        </span>
      ))}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); vibrate({ duration: 5 }); onToggle(); }}
        aria-expanded={true}
        className="inline-flex items-center h-[28px] px-[6px] text-[13px] font-[700] text-layout-gray-400 underline underline-offset-2"
      >
        접기
      </button>
    </span>
  ) : null;

  return { compact, expandedBlock };
};

/** 완료 표시용 동그라미 체크박스 — 표시 전용(탭 동작 없음). 미완료=빈 원, 완료=채운 원+체크 */
const CheckCircle = ({ checked }) => (
  <span
    className={`shrink-0 mt-[1px] w-[22px] h-[22px] rounded-full flex items-center justify-center ${
      checked
        ? 'bg-status-success-600'
        : 'border-[1.5px] border-layout-gray-200 dark:border-layout-gray-500'
    }`}
  >
    {checked && <Check size={13} weight="bold" className="text-layout-white" />}
  </span>
);

/*
  단어 목록(sub·expand) 들여쓰기 — 2026-09-29 QA로 제목 왼쪽 인라인 아이콘(새싹·씨앗봉투 등)을
  뺐다. 아이콘이 있을 때는 그 폭(22)+간격(6)만큼 sub 를 들여써 "타이틀 텍스트 시작선"에
  맞췄지만, 이제 제목이 칼럼 맨 앞에서 시작하므로 들여쓰기 없이 그대로 맞춰야 제목과 같은
  시작선에 정렬된다.
*/
const TITLE_TEXT_INDENT = '';

/**
 * 행 한 줄 — [체크박스][제목+단어 목록][우측] · 행 탭(버튼 제외)은 onRowClick.
 * 단어 목록(sub·expand)은 체크박스 칸 밖, 제목과 같은 칼럼 안에서 제목과 같은 시작선에 맞춘다.
 */
const Row = ({ title, titleClassName, sub, expand, right, last, faded, checked, onRowClick }) => (
  <div
    role={onRowClick ? 'button' : undefined}
    tabIndex={onRowClick ? 0 : undefined}
    onClick={onRowClick}
    className={`flex gap-[10px] py-[12px] text-left ${last ? '' : 'border-b border-[#F0F0F0] dark:border-[rgba(255,255,255,.08)]'}`}
  >
    <CheckCircle checked={checked} />
    <div className="flex-1 min-w-0 flex flex-col gap-[4px]">
      <div className={faded ? 'opacity-45' : ''}>
        <b className={`text-[15px] font-[800] ${titleClassName || 'text-layout-black dark:text-layout-white'}`}>
          {title}
        </b>
      </div>
      {sub && <div className={`${TITLE_TEXT_INDENT} ${faded ? 'opacity-45' : ''}`}>{sub}</div>}
      {expand && <div className={TITLE_TEXT_INDENT}>{expand}</div>}
    </div>
    {right}
  </div>
);

const TodayTasksCard = () => {
  "use memo";

  const { todayTasks } = useStats();

  const [expanded, setExpanded] = useState({ rotten: false, wilted: false, care: false });

  if (!todayTasks) return null;

  const rotten = todayTasks.rotten ?? { count: 0, done: 0, words: [] };
  const rottenDone = rotten.done ?? 0;
  const wilted = todayTasks.wilted ?? { total: 0, done: 0, words: [] };
  const care = todayTasks.care ?? { total: 0, done: 0, words: [] };
  const newSeed = todayTasks.new_seed ?? { target: 0, done: 0 };

  const toggle = (key) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  // 행은 먼저 "그릴지 말지"만 담은 서술 객체로 모은다 — 마지막 행 경계선(last)은
  // 실제로 몇 행이 그려지는지(0인 행은 숨김) 다 정해진 뒤에만 알 수 있다.
  const rowDefs = [];

  // 다 살렸으면(남은 부패 0, 오늘 살린 것 ≥1) 다른 행처럼 체크 + 진행 x/y 로 남는다
  if (rotten.count > 0 || rottenDone > 0) {
    const done = rotten.count <= 0;
    const { compact, expandedBlock } = buildWordListParts(rotten.words, expanded.rotten, () => toggle('rotten'));
    rowDefs.push({
      key: 'rotten',
      title: '썩은 단어 살리기',
      sub: compact,
      expand: expandedBlock,
      faded: done,
      checked: done,
      right: done
        ? <Progress done={rottenDone} total={rottenDone + rotten.count} />
        : <b className="shrink-0 text-[17px] font-[800] text-layout-black dark:text-layout-white">{rotten.count}</b>,
    });
  }

  if (wilted.total > 0) {
    const done = wilted.done >= wilted.total;
    const { compact, expandedBlock } = buildWordListParts(wilted.words, expanded.wilted, () => toggle('wilted'));
    rowDefs.push({
      key: 'wilted',
      title: '시듦 물주기',
      sub: compact,
      expand: expandedBlock,
      faded: done,
      checked: done,
      right: <Progress done={wilted.done} total={wilted.total} />,
    });
  }

  if (care.total > 0) {
    const done = care.done >= care.total;
    const { compact, expandedBlock } = buildWordListParts(care.words, expanded.care, () => toggle('care'));
    rowDefs.push({
      key: 'care',
      title: '오늘 돌봄 물주기',
      sub: compact,
      expand: expandedBlock,
      faded: done,
      checked: done,
      right: <Progress done={care.done} total={care.total} />,
    });
  }

  const newSeedRow = newSeed.target > 0 ? (() => {
    const done = newSeed.done >= newSeed.target;
    return {
      key: 'new_seed',
      title: '농장에 새 씨앗 심기',
      faded: done,
      checked: done,
      right: <Progress done={newSeed.done} total={newSeed.target} />,
    };
  })() : null;

  if (newSeedRow) rowDefs.push(newSeedRow);

  if (rowDefs.length === 0) return null;

  return (
    <div className="rounded-[12px] pt-[18px] px-[18px] pb-[6px] bg-layout-white dark:bg-layout-gray-dark border border-farm-line dark:border-transparent">
      <b className="block text-[17px] font-[800] text-layout-black dark:text-layout-white">오늘 할 일</b>
      <div className="flex flex-col">
        {rowDefs.map((row, idx) => (
          <Row key={row.key} {...row} last={idx === rowDefs.length - 1} />
        ))}
      </div>
    </div>
  );
};

export default TodayTasksCard;
