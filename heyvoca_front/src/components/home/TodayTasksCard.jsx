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
//   2 시듦 물주기 — 제목만 강조색(#C24E0C)
//   3 오늘 돌봄 물주기
//   4 새 씨앗 심기 — memoryState=['unlearned']로 좁힌 AI 추천 학습.
//   5 새 씨앗 구매 — seeds_left < daily_new_limit 일 때만(show_buy).
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
import { useStats } from '../../context/StatsContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useQuickReview } from '../../hooks/useQuickReview';
import { vibrate, showToast } from '../../utils/osFunction';
import { getRottenPlantsApi, recoverPlantsApi } from '../../api/farm';
import { CROP_ASSETS, CROP_BASELINE, cropAssetByVariant } from '../farm/CropImage';
import { stageToCrop, healthToVariant } from '../../utils/crop';
import RottenListSheet from '../farm/RottenListSheet';
import StoreNewFullSheet from '../newfullsheet/StoreNewFullSheet';
import navStoreIcon from '../../assets/images/farm/store.png';
import fieldBaseImg from '../../assets/images/farm/field-base.png';

const VISIBLE_WORDS = 3;

/** 우측 진행 x/y — 목표 달성 시 '완료' 배지(단어장 카드와 같은 규격) */
const Progress = ({ done, total }) => {
  if (total > 0 && done >= total) {
    return (
      <span className="shrink-0 inline-flex items-center gap-[3px] h-[26px] px-[10px] rounded-full bg-status-success-100 dark:bg-status-success-dark text-status-success-600 text-[12.5px] font-[700]">
        <Check size={13} weight="bold" />
        완료
      </span>
    );
  }
  return (
    <span className="shrink-0 flex items-baseline gap-[1px]">
      <b className="text-[17px] font-[800] text-layout-black dark:text-layout-white">{done}</b>
      <span className="text-[14px] font-[700] text-[#AAAAAA]">/{total}</span>
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
 * 단어 목록 — 앞 3개 + '외 N개' → 눌러서 전체 칩으로 펼침(왼쪽 84px 들여쓰기).
 *
 * 압축 줄(compact)은 Row의 텍스트 칸(sub) 안에, 펼친 칩(expanded)은 Row 바깥 줄(expand)에
 * 각각 따로 얹는다 — 칩 블록의 ml-84px는 "아이콘 칸(72)+간격(12)" 만큼을 카드 **좌측 기준**으로
 * 밀어야 텍스트 칸 시작 위치와 맞는다. sub 안에 그대로 두면 이미 84px 들어간 칸 안에서
 * 다시 84px를 밀어 이중으로 들여써진다.
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
    <span className="pl-[84px] flex flex-wrap gap-[6px]">
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

/**
 * 미니 밭 — 고정 좌표 8자리(밭 % 기준)에 그 행의 실제 남은 단어를 성장 단계 그대로,
 * 행의 건강 상태(시듦=wilted, 돌봄=drying) variant로 심는다.
 *
 * FarmField(홈 히어로·단어장 카드)의 확률적 격자 배치는 칸이 촘촘한 작은 폭(72px)에서는
 * 단어 하나하나가 점 수준으로 작아진다(보고 — QA 스크린샷) — 여기서는 그 대신 좌표를
 * 고정해 두고 항목마다 또렷하게 그린다. 끝낸(done) 단어는 심지 않는다.
 *
 * 【박스 크기 — 모든 단계를 같은 px 로 그리면 안 된다】
 * planted 에셋은 512² 캔버스 안에 단계별로 다른 비율(콘텐츠 실측, 알파 바운딩박스)만
 * 차지한다 — 씨앗은 24~26px, 새싹은 92~161px, 이파리는 195~296px, 당근은 240~371px.
 * 예전처럼 전 단계를 20~22px 박스에 넣으면 씨앗은 1px, 새싹은 5px 짜리 점이 된다
 * (QA 스크린샷 — "씨앗은 점 하나, 새싹은 모서리에 걸침"). 그래서 단계마다 다른 박스를
 * 준다 — 씨앗은 봉투가 아니라 **낱알(bare) 그림**(콘텐츠가 planted 대비 3배 이상 크다,
 * CropImage.getCropAsset 의 씨앗 예외와 같은 이유)을 solo=true 로 가져와 34px 로,
 * 나머지는 지금 그대로(planted, solo=false) 26~34px 로 키운다.
 *
 * 바닥선(CROP_BASELINE=440/512)은 그대로 좌표에 맞춘다 — 박스가 커진 만큼 콘텐츠가
 * 흙 마름모 위 가장자리를 넘어가지 않도록 좌표 y 를 전체 +8(퍼센트 포인트) 내렸다.
 */
const MINI_FIELD_SPOTS = [
  [38, 58], [55, 52], [62, 66], [45, 72],
  [30, 68], [50, 84], [68, 78], [40, 48],
];

/** 단계별 박스 px — 위 주석의 알파 바운딩박스 실측을 근거로 잡은 값 */
const MINI_FIELD_BOX = { seed: 34, sprout: 26, leaf: 20, carrot: 22 };

const MiniField = ({ words = [], health }) => {
  const variant = healthToVariant(health);
  const remaining = words.filter((w) => !w.done).slice(0, MINI_FIELD_SPOTS.length);
  return (
    <div className="relative w-[72px] aspect-[1200/860] shrink-0">
      <img src={fieldBaseImg} alt="" draggable={false} className="absolute inset-0 w-full h-full select-none" />
      {remaining.map((w, i) => {
        const [x, y] = MINI_FIELD_SPOTS[i];
        const crop = stageToCrop(w.stage);
        const size = MINI_FIELD_BOX[crop] ?? MINI_FIELD_BOX.leaf;
        return (
          <img
            key={w.id}
            src={cropAssetByVariant(w.stage, variant, { solo: crop === 'seed' })}
            alt=""
            draggable={false}
            className="absolute select-none"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              width: size,
              height: size,
              transform: `translate(-50%, -${CROP_BASELINE * 100}%)`,
            }}
          />
        );
      })}
    </div>
  );
};

/** 행 한 줄 — [아이콘 72×52][제목+단어 목록][우측] · 행 탭(버튼 제외)은 onRowClick */
const Row = ({ icon, title, titleClassName, sub, expand, right, last, faded, onRowClick }) => (
  <div
    role={onRowClick ? 'button' : undefined}
    tabIndex={onRowClick ? 0 : undefined}
    onClick={onRowClick}
    className={`flex flex-col gap-[10px] py-[12px] text-left ${last ? '' : 'border-b border-[#F0F0F0] dark:border-[rgba(255,255,255,.08)]'}`}
  >
    <div className="flex items-center gap-[12px]">
      <div className={`w-[72px] h-[52px] flex items-center justify-center shrink-0 ${faded ? 'opacity-45' : ''}`}>
        {icon}
      </div>
      <div className={`flex-1 min-w-0 flex flex-col gap-[4px] ${faded ? 'opacity-45' : ''}`}>
        <b className={`text-[15px] font-[800] ${titleClassName || 'text-layout-black dark:text-layout-white'}`}>
          {title}
        </b>
        {sub}
      </div>
      {right}
    </div>
    {expand}
  </div>
);

const TodayTasksCard = () => {
  "use memo";

  const navigate = useNavigate();
  const { todayTasks, refreshStats } = useStats();
  const { pushNewFullSheet } = useNewFullSheetActions();
  const { startQuickReview } = useQuickReview();

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
  // 오늘 목표(target)는 안 채웠는데 심을 씨앗 재고가 0인 상태 — "새 씨앗 심기"를 열어도
  // unlearned 단어가 없어 학습이 비어서 뜬다(실기기 QA — window.alert '출제 가능한
  // 문제가 없어요'). 이 상태에서는 그 행·CTA 모두 학습이 아니라 서점으로 보낸다.
  // buy_done 이면(이미 오늘 샀다) 이 막힘 상태가 아니라 "완료" 취급이라 재정렬하지 않는다.
  const noSeedsToPlant = !buyDone && seedsLeft <= 0 && newSeed.done < (newSeed.target ?? 0);

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

  // 새 씨앗 심기 — memoryState를 unlearned로 좁힌 유일하게 정확한 필터 진입.
  // useQuickReview 를 그대로 쓴다 — "하던 물주기가 남아 있어요, 이어서 하시겠어요?" 재개
  // 확인을 이 행에서만 건너뛰면(직접 navigate) 진행 중이던 회차를 되묻지도 않고 덮어써
  // 버린다(QA 지적) — 기존 진입(홈 주 CTA)과 같은 확인을 그대로 탄다.
  const studyUnlearned = () => {
    const remaining = Math.max(0, (newSeed.target ?? 0) - (newSeed.done ?? 0));
    if (remaining <= 0) return;
    // 심을 씨앗 재고가 없으면 학습을 열지 않는다 — goStore()가 그 자체로 서점 이동이다.
    if (noSeedsToPlant) { goStore(); return; }
    startQuickReview({ memoryState: ['unlearned'], count: remaining });
  };

  // 시듦·돌봄 — 백엔드 /study/recommend?task_bucket=wilted|care 로 그 행 단어만 좁힌다
  // (/farm/today-tasks 와 같은 공유 판정 헬퍼(get_task_bucket_ids)를 쓰므로 이 카드가 세는
  // 개수와 실제로 나오는 문제 대상이 일치한다). '이어서 하기' 재개 확인은 useQuickReview가
  // 그대로 맡는다.
  const studyWilted = () => {
    const remaining = Math.max(0, (wilted.total ?? 0) - (wilted.done ?? 0));
    if (remaining <= 0) return;
    startQuickReview({ taskBucket: 'wilted', count: remaining });
  };

  const studyCare = () => {
    const remaining = Math.max(0, (care.total ?? 0) - (care.done ?? 0));
    if (remaining <= 0) return;
    startQuickReview({ taskBucket: 'care', count: remaining });
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
      icon: <img src={CROP_ASSETS.nutrient} alt="" draggable={false} className="w-[38px] h-[38px] object-contain select-none" />,
      title: '썩은 단어 살리기',
      sub: compact,
      expand: expandedBlock,
      right: <Pill tone="primary" onClick={handleRecover} disabled={recovering}>살리기</Pill>,
      onRowClick: openRottenSheet,
    });
  }

  if (wilted.total > 0) {
    const done = wilted.done >= wilted.total;
    const { compact, expandedBlock } = buildWordListParts(wilted.words, expanded.wilted, () => toggle('wilted'));
    rowDefs.push({
      key: 'wilted',
      icon: <MiniField words={wilted.words} health="WILTED" />,
      title: '시듦 물주기',
      titleClassName: done ? undefined : 'text-[#C24E0C]',
      sub: compact,
      expand: expandedBlock,
      faded: done,
      right: <Progress done={wilted.done} total={wilted.total} />,
      onRowClick: done ? undefined : studyWilted,
    });
  }

  if (care.total > 0) {
    const done = care.done >= care.total;
    const { compact, expandedBlock } = buildWordListParts(care.words, expanded.care, () => toggle('care'));
    rowDefs.push({
      key: 'care',
      icon: <MiniField words={care.words} health="THIRSTY" />,
      title: '오늘 돌봄 물주기',
      sub: compact,
      expand: expandedBlock,
      faded: done,
      right: <Progress done={care.done} total={care.total} />,
      onRowClick: done ? undefined : studyCare,
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
      icon: <img src={CROP_ASSETS.seedPacket} alt="" draggable={false} className="w-[74px] h-[74px] object-contain select-none" />,
      title: '새 씨앗 심기',
      faded: done,
      right: <Progress done={newSeed.done} total={newSeed.target} />,
      onRowClick: done ? undefined : studyUnlearned,
    };
  })() : null;

  const buyRow = showBuy ? {
    key: 'buy',
    icon: <img src={navStoreIcon} alt="" draggable={false} className="w-[40px] h-[40px] object-contain select-none" />,
    title: '새 씨앗 구매',
    faded: buyDone,
    // 완료 배지는 다른 행과 같은 규격(Progress 가 done>=total 일 때 그리는 배지)을 그대로 쓴다.
    right: buyDone ? <Progress done={1} total={1} /> : <Pill tone="secondary" onClick={goStore}>서점</Pill>,
    onRowClick: buyDone ? undefined : goStore,
  } : null;

  // 심을 씨앗이 없는 상태(noSeedsToPlant)에서는 '새 씨앗 구매'가 실제로 할 수 있는 일이라
  // 위로 올린다 — 못 여는 '새 씨앗 심기'가 먼저 보이면 눌러도 안 되는 행이 눈에 먼저 띈다.
  if (noSeedsToPlant) {
    if (buyRow) rowDefs.push(buyRow);
    if (newSeedRow) rowDefs.push(newSeedRow);
  } else {
    if (newSeedRow) rowDefs.push(newSeedRow);
    if (buyRow) rowDefs.push(buyRow);
  }

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
