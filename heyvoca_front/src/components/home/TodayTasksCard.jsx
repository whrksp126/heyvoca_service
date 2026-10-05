// src/components/home/TodayTasksCard.jsx
//
// 홈 — "오늘 할 일" 카드 (2026-09-27 확정 목업, scratchpad/home10/IMPL_SPEC.md).
//
// CTA 바로 아래, 기존 "지금 볼 만한 단어"(care·rotten)를 대신한다 — 같은 사실(썩은 단어·
// 시듦·돌봄)을 개수 카드와 목록 카드 두 곳에서 반복하지 않는다(Main.jsx 정리 참고).
//
// 행 5개, 고정 순서. 0인 행은 숨긴다.
//   1 썩은 단어 살리기 — 영양 회복제 충분하면 즉시 전부 회복, 부족하면 RottenListSheet(기존
//     보관소 진입점)를 그대로 연다 — 회복제/삽 선택은 거기 이미 있다(중복 구현하지 않는다).
//   2 시듦 물주기
//   3 오늘 돌봄 물주기
//   4 새 씨앗 심기 — memoryState=['unlearned']로 좁힌 AI 추천 학습.
//   (새 씨앗 구매 줄은 제거 — 심을 씨앗이 없으면 '새 씨앗 심기' 버튼이 비활성 스타일이 되고
//    누르면 서점 이동 안내 시트가 뜬다.)
//
// 행 탭(버튼 영역 제외)은 그 행 단어만 학습 시작한다.
//   시듦 → GET /study/recommend?task_bucket=wilted, 돌봄 → task_bucket=care.
//   /farm/today-tasks 와 같은 공유 판정 헬퍼(get_task_bucket_ids)를 쓰므로 이 카드가
//   세는 개수와 실제로 출제되는 단어 집합이 일치한다.
//   새 씨앗 심기 → memoryState=['unlearned'].
// 세 경우 모두 useQuickReview 를 그대로 써서 "하던 물주기가 남아 있어요, 이어서
// 하시겠어요?" 재개 확인을 건너뛰지 않는다(QA 지적 — 직접 navigate로 덮어쓰던 문제).

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { haptic, SPRING, TAP } from '../../lib/feel';
import { useStats } from '../../context/StatsContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { ConfirmNewBottomSheet } from '../newBottomSheet/ConfirmNewBottomSheet';
import { usePlantSession } from '../../hooks/usePlantSession';
import { vibrate, showToast } from '../../utils/osFunction';
import { getRottenPlantsApi, recoverPlantsApi } from '../../api/farm';
import RottenListSheet from '../farm/RottenListSheet';
import StoreNewFullSheet from '../newfullsheet/StoreNewFullSheet';

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

/** 소형 버튼 — RottenListSheet 규격(h30 px11 rounded-full 12.5/700) */
const Pill = ({ tone = 'primary', children, onClick, disabled }) => (
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); if (!disabled) onClick?.(); }}
    disabled={disabled}
    className={`
      shrink-0 h-[30px] px-[11px] rounded-full text-[12.5px] font-[700] whitespace-nowrap
      disabled:opacity-40
      ${tone === 'primary'
        ? 'bg-primary-main-100 dark:bg-primary-main-dark text-primary-main-600'
        : 'bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-gray-400 dark:text-layout-gray-200'}
    `}
  >
    {children}
  </button>
);

/**
 * 단어 목록 — 앞 3개 + '외 N개' → 눌러서 전체 칩으로 펼침.
 *
 * 압축 줄(compact)과 펼친 칩(expandedBlock) 모두 Row의 텍스트 칸(체크박스 오른쪽, 제목과
 * 같은 칼럼) 안에 얹는다 — 그래서 별도 들여쓰기(pl) 계산 없이도 타이틀 텍스트 시작선에
 * 그대로 맞는다.
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

  const compact = (
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
          className="text-[13px] font-[700] text-layout-gray-400 underline underline-offset-2"
        >
          {expanded ? '접기' : `외 ${hiddenCount}개`}
        </button>
      )}
    </span>
  );

  const expandedBlock = expanded && hiddenCount > 0 ? (
    <span className="flex flex-wrap gap-[6px]">
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

  const navigate = useNavigate();
  const { todayTasks, refreshStats } = useStats();
  const { pushNewFullSheet } = useNewFullSheetActions();
  const { startPlantSession } = usePlantSession();
  const { pushAwaitNewBottomSheet } = useNewBottomSheetActions();

  const [expanded, setExpanded] = useState({ rotten: false, wilted: false, care: false });
  const [recovering, setRecovering] = useState(false);

  if (!todayTasks) return null;

  const rotten = todayTasks.rotten ?? { count: 0, words: [] };
  const wilted = todayTasks.wilted ?? { total: 0, done: 0, words: [] };
  const care = todayTasks.care ?? { total: 0, done: 0, words: [] };
  const newSeed = todayTasks.new_seed ?? { target: 0, done: 0 };
  const seedsLeft = todayTasks.seeds_left ?? 0;
  const showBuy = !!todayTasks.show_buy;
  // 오늘 이미 서점에서 단어장을 받았는가(백엔드 안내 — show_buy = 씨앗 부족 OR buy_done).
  // buy_done 이면 씨앗이 이미 늘었어도(더 살 필요가 없어도) 행은 "완료"로 남겨 오늘 한
  // 일이 사라지지 않고 보인다 — 새 씨앗 구매 자체가 오늘 할 일 중 하나였기 때문이다.
  const buyDone = !!todayTasks.buy_done;
  const nutrientCnt = todayTasks.items?.nutrient ?? 0;
  // 심을 씨앗이 없는 상태 — 오늘 목표를 못 채웠는데 보유 씨앗이 0이거나 모자란다(show_buy,
  // 오늘 이미 서점에서 받았다면 제외). 버튼은 시각만 비활성이고 눌러서 안내 시트를 연다.
  const cannotPlant = newSeed.done < (newSeed.target ?? 0) && (seedsLeft <= 0 || (showBuy && !buyDone));

  const toggle = (key) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  // 상점 도구 탭 — 회복제가 모자랄 때 RottenListSheet 안에서 바로 이어간다(그 시트의 기존 흐름)
  const openToolShop = () => {
    pushNewFullSheet(StoreNewFullSheet, {
      initialTab: 'tools',
      onGoRotten: openRottenSheet,
      onInventoryChanged: refreshStats,
    }, { smFull: true, closeOnBackdropClick: true });
  };

  const openRottenSheet = () => {
    vibrate({ duration: 5 });
    pushNewFullSheet(RottenListSheet, {
      onChanged: refreshStats,
      onOpenShop: openToolShop,
    }, { smFull: true, closeOnBackdropClick: true });
  };

  // '살리기' — 영양 회복제가 충분하면 그 자리에서 전부 회복, 부족하면 기존 보관소 시트를 연다
  // (회복제 추가 구매 · 삽으로 다시 심기 선택은 그 시트가 이미 갖고 있다).
  const handleRecover = async () => {
    if (recovering || rotten.count <= 0) return;
    vibrate({ duration: 5 });

    if (nutrientCnt < rotten.count) {
      openRottenSheet();
      return;
    }

    setRecovering(true);
    // today-tasks의 words는 미리보기(앞 몇 개)뿐이라 전체 id 목록은 다시 받아야 한다
    const list = await getRottenPlantsApi({ limit: rotten.count });
    const ids = (list?.data?.items ?? []).map((it) => it.user_voca_id);
    if (ids.length === 0) {
      setRecovering(false);
      openRottenSheet();
      return;
    }
    const res = await recoverPlantsApi(ids);
    setRecovering(false);
    if (res?.code === 200) {
      const done = res?.data?.recovered ?? ids;
      showToast(`작물 ${done.length}개가 다시 자라기 시작했어요.`);
      refreshStats();
    } else {
      showToast(res?.message || '잠시 뒤 다시 시도해 주세요.');
    }
  };

  // 새 씨앗 심기 — 2026-09-29부로 복습(useQuickReview)과 분리된 전용 세션이다.
  // usePlantSession이 "만나기(카드) → 테스트" 두 화면을 이 5단어·세션으로 그대로 이어준다.
  const studyPlant = () => {
    const remaining = Math.max(0, (newSeed.target ?? 0) - (newSeed.done ?? 0));
    // 심을 씨앗 재고가 없으면 학습을 열지 않는다 — goStore()가 그 자체로 서점 이동이다.
    if (cannotPlant) { openNoSeedSheet(); return; }
    // 오늘 목표를 채운 뒤에도 '심기'로 더 심을 수 있다(서버 한도 무시 force).
    if (remaining <= 0) { startPlantSession({ count: 5, force: true }); return; }
    startPlantSession({ count: Math.min(5, remaining) });
  };

  const openNoSeedSheet = async () => {
    vibrate({ duration: 5 });
    const goToStore = await pushAwaitNewBottomSheet(
      ConfirmNewBottomSheet,
      {
        title: '심을 씨앗이 없어요',
        subTitle: '서점에서 새 단어장을 담아오세요',
        btns: { cancel: '닫기', confirm: '서점 가기' },
      },
      { isBackdropClickClosable: true, isDragToCloseEnabled: true }
    );
    if (goToStore) goStore();
  };

  const goStore = () => {
    vibrate({ duration: 5 });
    navigate('/book-store');
  };

  // 행은 먼저 "그릴지 말지"만 담은 서술 객체로 모은다 — 마지막 행 경계선(last)은
  // 실제로 몇 행이 그려지는지(0인 행은 숨김) 다 정해진 뒤에만 알 수 있다.
  const rowDefs = [];

  if (rotten.count > 0) {
    const { compact, expandedBlock } = buildWordListParts(rotten.words, expanded.rotten, () => toggle('rotten'));
    rowDefs.push({
      key: 'rotten',
      title: '썩은 단어 살리기',
      sub: compact,
      expand: expandedBlock,
      checked: false,
      right: <Pill tone="primary" onClick={handleRecover} disabled={recovering}>살리기</Pill>,
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

  // 새 씨앗 행 — 목표(target)는 남았는데 심을 씨앗 재고(seedsLeft)가 0이면 학습을 열 수
  // 없다(unlearned 필터에 걸릴 단어가 없어 "출제 가능한 문제가 없어요"만 뜬다 — 실기기
  // 보고). 그런 상태에서는 이 행도, CTA(Main.jsx ctaInfo)도 서점으로 보낸다 — 아래에서
  // '새 씨앗 구매' 행을 '새 씨앗 심기' 위로 올리는 것도 같은 이유다.
  const newSeedRow = newSeed.target > 0 ? (() => {
    const done = newSeed.done >= newSeed.target;
    return {
      key: 'new_seed',
      title: '새 씨앗 심기',
      faded: done,
      checked: done,
      // 목표 미달이면 진행 숫자 대신 Pill('심기') — 다른 행과 달리 이 행은 탭할 수 있다는
      // 걸 우측에서도 바로 보여준다(살리기 Pill과 같은 규격). 달성 시엔 기존처럼 x/y.
      // 우측은 진행 x/y 만 — 심기 버튼은 목록 아래 큰 버튼(아래 plantButton)이 맡는다(2026-09-29 QA).
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
      {/* 새 씨앗 심기 — 목록 아래 넓은 버튼. 홈 주 CTA(FarmCta)와 같은 면·글자 규격이되,
          카드 안이라 바깥 그림자는 쓰지 않는다. 목표를 채운 뒤에도 더 심을 수 있다. */}
      {newSeedRow && (
        <motion.button
          type="button"
          onClick={studyPlant}
          whileTap={{ scale: TAP.scale }}
          transition={SPRING.snappy}
          onTapStart={() => haptic('light')}
          aria-disabled={cannotPlant}
          className={`
            flex items-center justify-center
            w-full h-[52px] mt-[6px] mb-[12px] rounded-[12px]
            ${cannotPlant
              ? 'bg-layout-gray-100 dark:bg-layout-gray-dark'
              : 'bg-[linear-gradient(180deg,#FF88DC_0%,#FF70D4_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,.34)]'}
          `}
        >
          <span className={`${cannotPlant ? 'text-layout-gray-200 dark:text-layout-gray-400' : 'text-layout-white'} text-[16px] font-[700] leading-[1.2] tracking-[-0.02em]`}>
            새 씨앗 심기
          </span>
        </motion.button>
      )}
    </div>
  );
};

export default TodayTasksCard;
