import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStats } from '../../context/StatsContext';
import { useVocabulary } from '../../context/VocabularyContext';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useOnboardingUnlock } from '../../context/OnboardingUnlockContext';
import { useQuickReview } from '../../hooks/useQuickReview';
import { usePlantSession } from '../../hooks/usePlantSession';
import { getStudyRecommend } from '../../api/study';
import { getRottenPlantsApi, recoverPlantsApi } from '../../api/farm';
import { mapRecommendItemToWord } from '../../utils/studyRecommendMapping';
import { isUnplanted, isWordStudiable } from '../../utils/vocaCrop';
import { vibrate, showToast } from '../../utils/osFunction';
import { primeSfx } from '../../utils/audio';
import { ConfirmNewBottomSheet } from './ConfirmNewBottomSheet';
import RescueConfirmNewBottomSheet from './RescueConfirmNewBottomSheet';
import { UnlockGuideNewBottomSheet } from './UnlockGuideNewBottomSheet';
import RottenListSheet from '../farm/RottenListSheet';
import StoreNewFullSheet from '../newfullsheet/StoreNewFullSheet';
import VocabularySheetNewFullSheet from '../newfullsheet/VocabularySheetNewFullSheet';
import SheetOptionRow from './SheetOptionRow';

/*
  홈 '농사 시작' → 학습 고르기 (LEVEL_AND_MEANING_CONTRACT §4, 2026-10-25 승인).

  예전엔 홈 CTA 가 종류를 묻지 않고 곧장 복습을 열고, '오늘 할 일' 카드 안의 '살리기'·'심기'
  버튼이 나머지 진입을 맡았다. 진입을 이 시트 하나로 모으고 카드는 줄(정보)만 남겼다.

  항목(위→아래): 썩은 단어 살리기(있을 때만) / 농장 돌보기 / 밭 산책하기 / 새 씨앗 심기 / 단어장 골라 학습.
  농장 돌보기·밭 산책하기·새 씨앗 심기는 0개여도 항상 누를 수 있다(QA 3차, 2026-10-25) — 돌볼 단어가 0이면
  서버(/study/recommend mode=review)가 심은 단어 중 다음 차례를 골라 준다. 심은 단어 자체가 없을 때만 심기로 안내하고,
  새 단어가 없으면 서점으로 간다. 단어장 0개만 흐리게 둔다.
*/

const WALK_COUNT = 14; // useQuickReview MAX_QUESTIONS 와 같은 상한

export const StudyPickNewBottomSheet = () => {
  "use memo";

  const navigate = useNavigate();
  const { todayTasks, refreshStats } = useStats();
  const { vocabularySheets } = useVocabulary();
  const { pushNewBottomSheet, pushAwaitNewBottomSheet, clearStack: clearNewBottomSheetStack } = useNewBottomSheetActions();
  const { pushNewFullSheet } = useNewFullSheetActions();
  const { isFeatureLocked } = useOnboardingUnlock();
  const { startQuickReview } = useQuickReview();
  const { startPlantSession } = usePlantSession();
  const [busy, setBusy] = useState(false);

  const tasks = todayTasks ?? {};
  const rotten = tasks.rotten ?? { count: 0 };
  const wilted = tasks.wilted ?? { total: 0, done: 0 };
  const care = tasks.care ?? { total: 0, done: 0 };
  const newSeed = tasks.new_seed ?? { target: 0, done: 0 };
  const seedsLeft = tasks.seeds_left ?? 0;
  const nutrientCnt = tasks.items?.nutrient ?? 0;

  const careLeft = Math.max(0, wilted.total - wilted.done) + Math.max(0, care.total - care.done);
  const seedRemaining = Math.max(0, (newSeed.target ?? 0) - (newSeed.done ?? 0));
  // 심을 씨앗이 없다 — 오늘 할 일 카드와 같은 기준(재고 seeds_left 가 0일 때만 막는다).
  // 예전엔 show_buy(재고 < 하루 목표)까지 막아, 씨앗이 3개 남아도 '0개'로 흐려졌다.
  const cannotPlant = seedsLeft <= 0;
  const seedCount = cannotPlant ? 0 : (seedRemaining > 0 ? Math.min(seedRemaining, seedsLeft) : seedsLeft);
  const bookCount = vocabularySheets?.length ?? 0;
  // 심은(복습 가능한) 단어 — 0이면 돌보기·산책은 받을 단어가 없으니 심기로 안내한다
  const plantedCount = (vocabularySheets ?? []).flatMap((sh) => sh.words || [])
    .filter((w) => !isUnplanted(w) && isWordStudiable(w)).length;

  // ─── 동작 ──────────────────────────────────────────────────────────────

  const openToolShop = () => {
    pushNewFullSheet(StoreNewFullSheet, {
      initialTab: 'tools',
      onGoRotten: openRottenSheet,
      onInventoryChanged: refreshStats,
    }, { smFull: true, closeOnBackdropClick: true });
  };

  const openRottenSheet = () => {
    pushNewFullSheet(RottenListSheet, {
      onChanged: refreshStats,
      onOpenShop: openToolShop,
    }, { smFull: true, closeOnBackdropClick: true });
  };

  // 살리기 — 확인 시트(필요·보유 회복제)를 먼저 띄운다(이슈 #15 eb72497 흐름). 시트의 '살리기'면 전부 회복,
  // 'pick'(모자람·골라 살리기)이면 보관소 시트(회복제 구매·삽은 거기 있다).
  const recoverRotten = async () => {
    const answer = await pushAwaitNewBottomSheet(
      RescueConfirmNewBottomSheet,
      { count: rotten.count, nutrientCnt },
      { isBackdropClickClosable: true, isDragToCloseEnabled: true }
    );
    if (answer === 'pick') { openRottenSheet(); return; }
    if (answer !== true) return;
    // today-tasks 의 words 는 미리보기뿐이라 전체 id 목록은 다시 받는다
    const list = await getRottenPlantsApi({ limit: rotten.count });
    const ids = (list?.data?.items ?? []).map((it) => it.user_voca_id);
    if (ids.length === 0) { openRottenSheet(); return; }
    const res = await recoverPlantsApi(ids);
    if (res?.code === 200) {
      const done = res?.data?.recovered ?? ids;
      showToast(`작물 ${done.length}개가 다시 자라기 시작했어요.`);
      refreshStats();
    } else {
      showToast(res?.message || '잠시 뒤 다시 시도해 주세요.');
    }
  };

  const openNoSeedSheet = async () => {
    const goToStore = await pushAwaitNewBottomSheet(
      ConfirmNewBottomSheet,
      {
        title: '심을 씨앗이 없어요',
        subTitle: '서점에서 새 단어장을 담아오세요',
        btns: { cancel: '닫기', confirm: '서점 가기' },
      },
      { isBackdropClickClosable: true, isDragToCloseEnabled: true }
    );
    if (goToStore) navigate('/book-store');
  };

  const plant = () => {
    if (cannotPlant) { openNoSeedSheet(); return; }
    // 오늘 목표를 채운 뒤에도 더 심을 수 있다(서버 한도 무시 force)
    if (seedRemaining <= 0) { startPlantSession({ count: 5, force: true }); return; }
    startPlantSession({ count: Math.min(5, seedRemaining) });
  };

  // 밭 산책하기 — 농장 돌보기와 같은 복습 추천(mode=review)으로 받은 단어를 집중 반복 듣기(StudyMain)로.
  // 추천은 한 번만 부른다 — 비었을 때 startQuickReview 로 넘기면 TakeTest 가 /study/recommend 를
  // 다시 불러 쓰이지 않는 session_id 가 하나 더 생겼다.
  const guidePlant = () => {
    showToast('먼저 새 씨앗을 심어 보세요.');
    plant();
  };

  const startCare = () => (plantedCount <= 0 ? guidePlant() : startQuickReview());

  const walk = async () => {
    if (plantedCount <= 0) { guidePlant(); return; }
    const res = await getStudyRecommend({ type: 'quick', mode: 'review', count: WALK_COUNT });
    const items = res?.code === 200 && Array.isArray(res.data?.items) ? res.data.items : [];
    if (items.length === 0) { guidePlant(); return; }
    navigate('/study', { state: { vocabularySheetId: 'all', words: items.map((it) => mapRecommendItemToWord(it)) } });
  };

  const pickBook = () => {
    pushNewFullSheet(VocabularySheetNewFullSheet, { testType: 'pick' }, { smFull: true, closeOnBackdropClick: true });
  };

  const OPTIONS = [
    rotten.count > 0 && {
      key: 'rotten', title: '썩은 단어 살리기',
      desc: `썩은 단어 ${rotten.count}개`, count: rotten.count, run: recoverRotten,
    },
    {
      key: 'care', title: '농장 돌보기',
      desc: careLeft > 0 ? `돌볼 단어 ${careLeft}개` : '다음 차례 단어 미리 돌보기', run: startCare,
    },
    {
      key: 'walk', title: '밭 산책하기', lock: 'listen',
      desc: careLeft > 0 ? `듣기로 ${Math.min(careLeft, WALK_COUNT)}개` : '심은 단어 듣기로 훑어보기', run: walk,
    },
    {
      key: 'seed', title: '새 씨앗 심기',
      desc: seedCount > 0 ? `새 단어 ${seedCount}개` : '서점에서 씨앗 담아 오기', run: plant,
    },
    {
      key: 'book', title: '단어장 골라 학습',
      desc: `단어장 ${bookCount}개`, count: bookCount, fadeWhenEmpty: true, run: pickBook,
    },
  ].filter(Boolean);

  const handleClick = async (option) => {
    if (busy) return;
    primeSfx(); // 효과음 unlock 은 user gesture 동기 시점에만 걸린다(iOS WKWebView)
    vibrate({ duration: 5 });
    if (option.lock && isFeatureLocked(option.lock)) {
      pushNewBottomSheet(UnlockGuideNewBottomSheet, { highlightKey: option.lock }, { isBackdropClickClosable: true, isDragToCloseEnabled: true });
      return;
    }
    setBusy(true);
    clearNewBottomSheetStack();
    try { await option.run(); } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col px-[20px] pt-[18px] pb-[calc(20px+var(--safe-area-bottom))]">
      <h1 className="text-[16px] font-[700] tracking-[-0.03em] text-layout-black dark:text-layout-white">
        학습 고르기
      </h1>

      <div className="mt-[6px]">
        {OPTIONS.map((option, idx) => (
          <SheetOptionRow
            key={option.key}
            first={idx === 0}
            title={option.title}
            desc={option.desc}
            danger={option.key === 'rotten'}
            locked={!!option.lock && isFeatureLocked(option.lock)}
            faded={!!option.fadeWhenEmpty && option.count <= 0}
            onClick={() => handleClick(option)}
          />
        ))}
      </div>
    </div>
  );
};

export default StudyPickNewBottomSheet;
