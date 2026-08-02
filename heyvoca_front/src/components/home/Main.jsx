// src/components/home/Main.jsx
//
// 홈 = 농장 (당근 농장 V2 시안 정본 — docs/ui-concepts/carrot-farm-v2-home/home.html).
//
// §10 화면 구조
//   히어로      420px  2줄 헤드라인 + 밭 하나 + 작물 + 나무 팻말 (+ 위험 시 주황 핀)
//                      화면의 50%. **상단 헤더를 없애 일러스트가 최상단까지 이어진다**
//   보석 칩     36px   히어로 우측 상단에 떠 있는 반투명 칩 (본문 흐름에서 뺀다)
//   주 CTA      56px   히어로 하단에 겹쳐 뜬다(bottom -16px). 홈에서 유일하게 핑크를 쓰는 곳
//   연속 학습   112px  연속 일수 · 최장 기록 · 일별 학습량 막대 7개
//   성과 카드   가변   오늘 자란 단어 · 황금 당근 — 여기부터 스크롤 영역
//   바텀 네비   60px   농장 · 단어장 · 찾기 · 상점 · 마이 (BottomNav)
//
// §9 상단과 본문을 잇는 방식 — 히어로와 본문 사이에 선도, 색 경계도, 모서리도 없다.
//   ① 일러스트 하단이 알파로 페이드되어 있고(이미지에 구워져 있다)
//   ② 화면 배경(farm-canvas)을 한 번만 깔고 히어로 그라디언트의 끝 색을 같은 값으로 맞추며
//   ③ 본문은 배경 없이 z-index 2 로 올려 페이드된 지면이 카드 사이로 비친다.
//
// §10 은 홈에 놓이는 것을 전부 열거한다 — 히어로 · 보석 칩 · 주 CTA · 연속 학습 · 성과 카드.
// 이전 라운드에서 "지우지 않고 아래로 밀어 둔" 네 블록은 통합 단계에서 제거했다.
//   나의 업적    → 마이페이지로 이관(mypage 시안 1절 "홈에 있던 업적을 여기로 옮기고")
//   데일리 미션  → §7 "홈에는 진행 지표가 없다". 신규 n/m · 복습 n/m 이 정확히 그 지표였다
//   출석체크     → §10 구조에 없다. 달력은 연속 학습 카드의 "최장 N일"로 들어간다
//   온보딩 배너  → §10 구조에 없다. 해금 안내는 잠긴 탭을 눌렀을 때 뜬다
//                 (해금 스위치 자체가 지금 꺼져 있어 실제 노출도 없던 블록)

import React, { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Warning } from '@phosphor-icons/react';
import { useUser } from '../../context/UserContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';

import { vibrate, checkNotificationPermissionGranted, isAppVersionAtLeast } from '../../utils/osFunction';
import { useStats } from '../../context/StatsContext';
import { prefetchLabSettings } from '../../api/lab';

import StoreNewFullSheet from '../newfullsheet/StoreNewFullSheet';
import StudyNewFullSheet from '../newfullsheet/StudyNewFullSheet';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { NotifPermissionNewBottomSheet } from '../newBottomSheet/NotifPermissionNewBottomSheet';

import FarmHero from '../farm/FarmHero';
import CropImage, { CROP_ASSETS } from '../farm/CropImage';
import RottenListSheet from '../farm/RottenListSheet';
import FarmCta, {
  CRITICAL_CTA_THRESHOLD,
  HOME_STATES,
  HOME_STATE_VIEW,
  resolveHomeState,
} from './FarmCta';
import StreakCard from './StreakCard';
import GrewTodayCard from './GrewTodayCard';
import GoldenCarrotCard from './GoldenCarrotCard';
import InfoStrip from './InfoStrip';
import { HEALTH_STATES } from '../../utils/crop';

/**
 * `/insights/today-changes` 의 암기 상태 키 → 농장 단계 키.
 * 이 엔드포인트는 FSRS 안정성 구간(unlearned/short/medium/long)으로 답하고
 * 농장은 visual_stage(seed/sprout/leaf/carrot)로 센다. 두 체계는 1:1로 겹치지만
 * 같은 값은 아니다 — 보고 참조.
 */
const MEMORY_TO_CROP = {
  unlearned: 'seed',
  short: 'sprout',
  medium: 'leaf',
  long: 'carrot',
};

const Main = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const navigate = useNavigate();
  const { userProfile, fetchUserCheckin } = useUser();

  // 통계는 StatsContext(라우터 바깥 캐시)에서 구독 — 탭 전환마다 재조회/스피너 없이 캐시값을 즉시 사용,
  // 학습 세션 완료 시에만 조용히 갱신된다.
  const { todaySummary, farmOverview, todayChanges, refreshStats } = useStats();
  const todayNewWords = todaySummary?.new_words ?? 0;
  const dailyNewLimit = userProfile?.daily_new_limit ?? 0;

  // ── §12 상태 판정 ────────────────────────────────────────────────
  const counts = farmOverview?.counts ?? {};
  const health = farmOverview?.health ?? {};
  const today = farmOverview?.today ?? {};
  const seedDetail = farmOverview?.seed_detail ?? {};

  const criticalCnt = today.critical_first ?? 0;
  const unplanted = seedDetail.unplanted ?? 0;
  const golden = counts.golden ?? 0;
  const rottenCnt = health.rotten ?? 0;
  const inventory = farmOverview?.items ?? {};
  const restoreItemCnt = (inventory.SHOVEL ?? 0) + (inventory.NUTRIENT ?? 0);
  const newRemaining = Math.max(0, dailyNewLimit - todayNewWords);

  // 농장 조회 전에는 §12 5번(빈 밭)으로 떨어지지 않게 2번(가장 흔한 상태)을 깔아 둔다.
  // 단어를 가진 사용자에게 "아직 밭이 비어 있어요"가 한 프레임 스치는 편이 훨씬 나쁘다.
  const homeState = farmOverview
    ? resolveHomeState(farmOverview, { newRemaining })
    : HOME_STATES.DUE;
  const view = HOME_STATE_VIEW[homeState];

  const gemCnt = farmOverview?.gem_cnt ?? userProfile?.gem_cnt ?? 0;

  // 오늘 자란 단어 — 승급 + 오늘 첫 진입을 한 목록으로 합친다(§10 "오늘 승급한 단어 목록")
  const grewItems = useMemo(() => {
    const raw = [...(todayChanges?.promoted ?? []), ...(todayChanges?.new ?? [])];
    return raw.map((e) => ({
      user_voca_id: e.user_voca_id,
      word: e.word,
      from: MEMORY_TO_CROP[e.from] ?? 'seed',
      to: MEMORY_TO_CROP[e.to] ?? 'sprout',
    }));
  }, [todayChanges]);

  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { pushNewFullSheet } = useNewFullSheetActions();
  const { pushNewBottomSheet } = useNewBottomSheetActions();

  // 홈 화면 진입 시 출석 체크 호출 + (실험실 지원 앱 버전에서만) 실험실 설정 프리로드
  useEffect(() => {
    fetchUserCheckin();
    if (isAppVersionAtLeast('1.1.0')) prefetchLabSettings();
  }, []);

  // 온보딩→가입→로그인 후 홈 첫 진입 시 1회 알림 권한 프롬프트 (온보딩 signup에서 플래그 설정)
  useEffect(() => {
    let pending = null;
    try { pending = localStorage.getItem('heyvoca_notif_prompt'); } catch (e) { pending = null; }
    if (pending !== '1') return;
    if (!userProfile || !userProfile.id) return;
    try { localStorage.removeItem('heyvoca_notif_prompt'); } catch (e) { /* noop */ }

    let cancelled = false;
    let t = null;
    checkNotificationPermissionGranted().then((granted) => {
      if (cancelled) return;
      if (granted === true) return; // 이미 허용됨 → 바텀시트 노출 없이 플래그만 소비
      t = setTimeout(() => {
        pushNewBottomSheet(NotifPermissionNewBottomSheet, {}, { isBackdropClickClosable: true, isDragToCloseEnabled: true });
      }, 700);
    });
    return () => { cancelled = true; if (t) clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.id]);

  // §6 — 보석 칩은 상점·아이템 화면으로 가는 진입점 역할도 겸한다
  const handleStoreButtonClick = () => {
    vibrate({ duration: 5 });
    pushNewFullSheet(StoreNewFullSheet, {}, {
      smFull: true,
      closeOnBackdropClick: true
    });
  };

  const handleTodayStudyButtonClick = () => {
    pushNewFullSheet(StudyNewFullSheet, {}, {
      smFull: true,
      closeOnBackdropClick: true
    });
  };

  // §12 — 버튼 모습은 다섯 상태 모두 같고 글자만 바뀐다. 가는 곳만 상태를 따른다.
  const handleCtaClick = () => {
    vibrate({ duration: 5 });
    if (homeState === HOME_STATES.EMPTY) {
      navigate('/book-store');
      return;
    }
    handleTodayStudyButtonClick();
  };

  // §8 — 부패 직전 1~3개일 때만 water 스트립. 4개 이상이면 CTA 가 이미 그 말을 한다
  const showWaterStrip = criticalCnt > 0 && criticalCnt < CRITICAL_CTA_THRESHOLD;
  // §1 완료 프레임 — 급한 일이 없어 seed 변형으로 다음 학습거리를 제안한다
  const showSeedStrip = homeState === HOME_STATES.DONE && unplanted > 0;
  // §8 amber 변형 — "썩은 작물 N개를 되살릴 수 있어요 · 회복 아이템 보유 시 안내".
  // 시안 표에 (예약)으로 적힌 변형이지만 배경·문구·조건이 모두 규정돼 있고,
  // 돌볼 작물(부패) 목록으로 가는 유일한 진입점이라 여기에 둔다(보고 참조).
  const showAmberStrip = rottenCnt > 0 && restoreItemCnt > 0;

  // 돌볼 작물 목록 — 도구가 모자라면 상점 도구 탭을 그 위에 얹는다.
  // 상점을 닫으면 고르던 목록이 그대로 남아 선택이 날아가지 않는다.
  const openToolShop = () => {
    pushNewFullSheet(StoreNewFullSheet, {
      initialTab: 'tools',
      onGoRotten: () => openRottenSheet(),
      onInventoryChanged: refreshStats,
    }, { smFull: true, closeOnBackdropClick: true });
  };

  const openRottenSheet = () => {
    pushNewFullSheet(RottenListSheet, {
      onChanged: refreshStats,
      onOpenShop: openToolShop,
    }, { smFull: true, closeOnBackdropClick: true });
  };

  return (
    /* §9 단일 배경 — 화면 배경을 한 번만 깔고 히어로 그라디언트의 끝 색을 같은 값으로 맞춘다 */
    /* isolate — 히어로(z-1)와 본문(z-2)의 겹침 순서는 홈 **안에서만** 유효해야 한다.
       stacking context 를 끊지 않으면 본문 카드(z-2)가 화면 전체 기준으로 떠올라
       바텀 네비(fixed · z-auto)를 덮어 버린다(스크롤 영역이 길어지는 순간 네비가 사라진다). */
    <div className="isolate flex flex-col h-screen bg-farm-canvas dark:bg-layout-black">

      <FarmHero counts={counts} health={health} state={view.mood}>
        {/* 보석 — 히어로 우측 상단에 떠 있는 칩(§6 · §10).
            히어로 위에 뜬 요소에만 그림자를 쓴다. 본문 카드는 시스템대로 보더 우선(§7) */}
        <button
          type="button"
          onClick={handleStoreButtonClick}
          className="
            absolute top-[max(48px,calc(var(--status-bar-height)+4px))] right-[16px] z-[20]
            inline-flex items-center gap-[6px]
            h-[36px] pl-[6px] pr-[12px] rounded-full
            bg-layout-white/90 dark:bg-layout-gray-dark/90 backdrop-blur-[8px]
            shadow-[0_2px_8px_rgba(96,80,52,.16)] dark:shadow-[0_2px_8px_rgba(0,0,0,.4)]
            text-[16px] font-[700] tracking-[-0.02em]
            text-layout-black dark:text-layout-white
          "
        >
          <img
            src={CROP_ASSETS.gem}
            alt=""
            draggable={false}
            className="block w-[24px] h-[24px] object-contain select-none"
          />
          {gemCnt.toLocaleString()}
        </button>

        {/* §4 2줄 헤드라인 — "헤이,"만 브랜드 핑크로 칠해 brand 를 끼워 넣는다.
            농장 전체를 핑크로 칠하지 않는다는 기획 20.1 을 지키는 지점이다 */}
        <div className="
          absolute top-[max(92px,calc(var(--status-bar-height)+48px))] left-0 right-0 z-[6]
          px-[26px] text-center
          text-[22px] font-[700] tracking-[-0.02em] leading-[1.4]
          text-farm-ink dark:text-layout-white
        ">
          <em className="not-italic text-primary-main-600">헤이,</em>{view.line1}
          <br />
          {view.line2}
        </div>

        {/* §12 — 주황 핀은 1번(부패 직전 다수) 상태에서만 뜬다.
            기획 12번(공포·손실 회피 금지)에 따라 빨강을 쓰지 않고, 개수를 해결 가능한 양으로 제시한다.
            §17 — 주황 핀은 다크에서도 같은 #FB6514 다. 경고는 배경 모드와 무관해야 한다 */}
        {homeState === HOME_STATES.CRITICAL && (
          <div className="absolute z-[14] left-[50.77%] top-[212px] flex flex-col items-center">
            <div className="
              flex items-center gap-[4px] whitespace-nowrap
              px-[10px] py-[5px] rounded-full
              bg-[#FB6514] text-layout-white text-[11px] font-[800]
              shadow-[0_3px_10px_rgba(251,101,20,.4)]
            ">
              <Warning size={12} weight="fill" />
              썩기 직전 {criticalCnt}
            </div>
            <div className="w-[2px] h-[10px] bg-[rgba(251,101,20,.5)]" />
            <div className="w-[9px] h-[9px] rounded-full bg-[#FB6514] border-2 border-layout-white shadow-[0_1px_3px_rgba(0,0,0,.25)]" />
          </div>
        )}

        {/* §7 주 CTA — 히어로 하단에 겹쳐 뜬다. 홈에서 유일한 핑크 */}
        <FarmCta label={view.cta} onClick={handleCtaClick} />
      </FarmHero>

      {/* §9 본문 — 배경을 깔지 않는다. 페이드된 지면이 카드 사이로 비친다.
          §7 — CTA 가 흘러나온 만큼 상단 패딩 30px 으로 비켜 준다 */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="
          relative z-[2] flex-1 min-h-0 overflow-y-auto
          flex flex-col gap-[12px]
          px-[20px] pt-[30px]
          pb-[calc(84px+var(--safe-area-bottom))]
        "
      >
        {/* 연속 학습 — 홈에서 성과를 말하는 유일한 블록. 항상 노출된다(§6 · §10) */}
        <StreakCard />

        {/* §8 water 스트립 — 부패 직전이 1~3개일 때만 */}
        {showWaterStrip && (
          <InfoStrip
            variant="water"
            icon={<CropImage stage="leaf" health={HEALTH_STATES.WILTED} size={24} />}
            label={`오늘 안에 물이 필요한 작물 ${criticalCnt}개`}
            onClick={handleTodayStudyButtonClick}
          />
        )}

        {/* §8 amber 스트립 — 되살릴 수 있는 썩은 작물이 있고 도구를 가진 사용자에게만 */}
        {showAmberStrip && (
          <InfoStrip
            variant="amber"
            icon={<CropImage stage="leaf" health={HEALTH_STATES.ROTTEN} size={24} />}
            label={`썩은 작물 ${rottenCnt}개를 되살릴 수 있어요`}
            onClick={openRottenSheet}
          />
        )}

        {/* 성과 카드 — 여기부터 스크롤 영역(§10). 첫 화면에 반쯤 걸쳐 더 있음을 알린다.
            §10 "오늘 자란 단어"는 조건부다(없으면 카드를 아예 띄우지 않는다).
            "황금 당근"은 조건이 없다 — 시안 기본·위험 프레임 모두 이 카드가 서 있고,
            위험 프레임에서는 오늘 자란 단어가 없는 자리를 이 카드가 대신한다.
            그래서 개수가 0이어도 골격을 남긴다(그러지 않으면 스크롤 영역이 통째로 비어
            "반쯤 걸쳐 더 있음을 알린다"가 성립하지 않는다). */}
        <GrewTodayCard items={grewItems} />
        <GoldenCarrotCard
          count={golden}
          onMore={() => { vibrate({ duration: 5 }); navigate('/mypage'); }}
        />

        {/* §8 seed 스트립 — 급한 일이 없을 때 다음 학습거리를 제안한다 */}
        {showSeedStrip && (
          <InfoStrip
            variant="seed"
            icon={<CropImage stage="seed" health={HEALTH_STATES.FRESH} size={24} />}
            label={`새 씨앗 ${unplanted}개가 밭에 도착했어요`}
            onClick={handleTodayStudyButtonClick}
          />
        )}

      </motion.div>
    </div>
  );
};

export default Main;
