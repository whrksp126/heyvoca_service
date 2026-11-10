// src/components/home/Main.jsx
//
// 홈 = 농장 (당근 농장 V2 시안 정본 — docs/ui-concepts/carrot-farm-v2-home/home.html).
//
// §10 화면 구조
//   히어로      420px  2줄 헤드라인 + 밭 하나 + 작물 + 나무 팻말 (+ 위험 시 주황 핀)
//                      화면의 50%. **상단 헤더를 없애 일러스트가 최상단까지 이어진다**
//   보석 칩     36px   히어로 우측 상단에 떠 있는 반투명 칩 (본문 흐름에서 뺀다)
//   주 CTA      56px   히어로 하단에 겹쳐 뜬다(bottom -16px). 홈에서 유일하게 핑크를 쓰는 곳
//   연속 학습   112px  연속 일수(누르면 농장 방문 기록) · 1주 불꽃 줄
//   성과 카드   가변   오늘 자란 단어 (황금 당근 카드는 내렸다 — 마이페이지 온실에 있다)
//   바텀 네비   60px   농장 · 단어장 · 찾기 · 상점 · 마이 (BottomNav)
//
// §9 상단과 본문을 잇는 방식 — 히어로와 본문 사이에 선도, 색 경계도, 모서리도 없다.
//   ① 일러스트 하단이 알파로 페이드되어 있고(이미지에 구워져 있다)
//   ② 화면 배경(farm-canvas)을 한 번만 깔고 히어로 그라디언트의 끝 색을 같은 값으로 맞추며
//   ③ 본문은 배경 없이 z-index 2 로 올려 페이드된 지면이 카드 사이로 비친다.
//
// §10 은 홈에 놓이는 것을 전부 열거한다 — 히어로 · 보석 칩 · 주 CTA · 연속 학습 · 성과 카드.
// 그 아래에 "지금 볼 만한 단어"(WordFeedCard)를 더했다 — 시안 구조대로만 두면 급한 일이
// 없는 날 스크롤 영역이 통째로 비어서다. 지표가 아니라 단어를 채우므로 §7 과 부딪히지 않는다.
// 이전 라운드에서 "지우지 않고 아래로 밀어 둔" 네 블록은 통합 단계에서 제거했다.
//   나의 업적    → 마이페이지로 이관(mypage 시안 1절 "홈에 있던 업적을 여기로 옮기고")
//   데일리 미션  → §7 "홈에는 진행 지표가 없다". 신규 n/m · 복습 n/m 이 정확히 그 지표였다
//   출석체크     → §10 구조에 없다. 달력은 연속 학습 카드의 "N일 연속" 영역을 눌러 들어간다
//   온보딩 배너  → §10 구조에 없다. 입문 퀘스트는 OnboardingQuestCard 가 맡는다(잠금 없음)

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../../context/UserContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';

import { vibrate, checkNotificationPermissionGranted, isAppVersionAtLeast } from '../../utils/osFunction';
import { useStats } from '../../context/StatsContext';
import { prefetchLabSettings } from '../../api/lab';
import useLabFeatures from '../../hooks/useLabFeatures';
import { LANG_LABEL, DEFAULT_LEARNING_LANG } from '../../utils/lang';
import { LearningLangNewBottomSheet } from '../newBottomSheet/LearningLangNewBottomSheet';
import LangFlagIcon from '../common/LangFlagIcon';
import { usePlantSession } from '../../hooks/usePlantSession';
import PullToRefresh from '../common/PullToRefresh';

import StoreNewFullSheet from '../newfullsheet/StoreNewFullSheet';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { NotifPermissionNewBottomSheet } from '../newBottomSheet/NotifPermissionNewBottomSheet';
import { StudyPickNewBottomSheet } from '../newBottomSheet/StudyPickNewBottomSheet';
import AchievementRewardOverlay from '../overlay/AchievementRewardOverlay';

import HomeFieldGrid from './HomeFieldGrid';
import { buildBookRow, isScriptBook } from '../vocabularySheets/VocaBookCard';
import VocabularyWordsNewFullSheet from '../newfullsheet/VocabularyWordsNewFullSheet';
import { useVocabulary } from '../../context/VocabularyContext';
import gemIcon from '../../assets/images/farm/icon-gem.png';
import WordListSheet from '../farm/WordListSheet';
import FarmCta, {
  HOME_STATES,
  resolveHomeState,
} from './FarmCta';
import TodayTasksCard from './TodayTasksCard';
import OnboardingQuestCard from './OnboardingQuestCard';
import { useOnboardingUnlock } from '../../context/OnboardingUnlockContext';
import StreakCard from './StreakCard';
import GrewTodayCard from './GrewTodayCard';
import WordFeedCard from './WordFeedCard';

/** 히어로 높이(지도 배경 히어로 h-[420px] 와 같은 값) — 밭 지도의 '보이는 창' 아래 끝 = CTA 위 */
const HERO_HEIGHT = 420;
import {
  buildGreetingContext,
  resolveGreetingSituation,
  pickGreetingVariant,
} from '../../data/homeGreetings';

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

/* ── 홈 아래 "지금 볼 만한 단어" 우측 상태 문구 ─────────────────────
   단어장·찾기 목록과 **같은 말**을 쓴다. 같은 단어가 화면마다 다른 문구로 불리면
   사용자는 그게 같은 상태인지 매번 확인해야 한다.
   (2026-09-27 홈 개편 — "지금 물이 필요한 단어"·"되살릴 수 있는 단어" 두 묶음은
   새 TodayTasksCard(오늘 할 일)가 같은 사실을 더 자세히 말해 뺐다. careTone·rottenTone도
   그 둘에서만 쓰던 헬퍼라 같이 지운다 — 아래 Main.jsx 정리 주석 참고.)
// "아직 심지 않은 씨앗"·"최근에 심은 단어"는 더 이상 상태어(안 배움/씨앗)를 안 쓴다 —
// WordFeedCard 가 tone 을 안 받으면 그 자리에 대표 뜻을 대신 그린다(사용자 목업 승인). */

const Main = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const navigate = useNavigate();
  const { userProfile, fetchUserCheckin, markGoalOverlayShown, learningLang } = useUser();
  // 실험실 "다른 언어 학습하기(베타)" — 켜져 있을 때만 왼쪽 위 언어 칩을 띄운다.
  // 이미 영어가 아닌 언어로 학습 중이면(플래그 조회 실패 등) 되돌아갈 길이 없어지지 않도록 항상 띄운다.
  const labFeatures = useLabFeatures();
  const showLangChip = !!labFeatures.multi_lang || learningLang !== DEFAULT_LEARNING_LANG;

  // 통계는 StatsContext(라우터 바깥 캐시)에서 구독 — 탭 전환마다 재조회/스피너 없이 캐시값을 즉시 사용,
  // 학습 세션 완료 시에만 조용히 갱신된다.
  const { todaySummary, farmOverview, todayChanges, farmFeed, todayKey, refreshStats } = useStats();
  const todayNewWords = todaySummary?.new_words ?? 0;
  const dailyNewLimit = userProfile?.daily_new_limit ?? 0;

  // ── §12 상태 판정 ────────────────────────────────────────────────
  const seedDetail = farmOverview?.seed_detail ?? {};

  const unplanted = seedDetail.unplanted ?? 0;
  const newRemaining = Math.max(0, dailyNewLimit - todayNewWords);

  /*
    단어장별 밭(이슈 #25 6차) — 홈 히어로에 단어장마다 밭 하나씩 격자로 놓는다.
    학습장 단어장 목록(VocaBooksTab)과 같은 행 계산(buildBookRow)·같은 제외(글자 단어장)를 쓴다.
    단어장이 0개면 밭을 아예 그리지 않는다 — 그 자리는 입문 퀘스트 카드다(아래 questInHero, 이슈 #25 10차).
  */
  const { vocabularySheets, isVocaBooksLoading } = useVocabulary();
  // 단어장 목록을 한 번이라도 받았는지 — 받기 전의 빈 배열을 '단어장 0개'로 읽지 않는다.
  // (재조회 때 isVocaBooksLoading 이 다시 true 가 돼도 이미 아는 사실은 유지한다)
  const [booksKnown, setBooksKnown] = useState(false);
  useEffect(() => {
    if (!isVocaBooksLoading) setBooksKnown(true);
  }, [isVocaBooksLoading]);
  const bookRows = useMemo(() => (vocabularySheets || [])
    .filter((book) => !isScriptBook(book))
    .map(buildBookRow), [vocabularySheets]);

  // 농장 조회 전에는 §12 5번(빈 밭)으로 떨어지지 않게 2번(가장 흔한 상태)을 깔아 둔다.
  // 단어를 가진 사용자에게 "아직 밭이 비어 있어요"가 한 프레임 스치는 편이 훨씬 나쁘다.
  const homeState = farmOverview
    ? resolveHomeState(farmOverview, { newRemaining })
    : HOME_STATES.DUE;

  // §7 주 CTA — 2026-10-25(이슈 #16 §4) '농사 시작' 하나. 누르면 학습 고르기 시트
  // (StudyPickNewBottomSheet)가 돌보기·산책·심기·단어장 학습을 고르게 한다. 심을 밭이 아예
  // 없는 EMPTY 상태만 서점으로 보낸다.
  //
  // 이슈 #25 9차 — 문구는 퀘스트와 무관하게 항상 '농장 돌보기'.
  //   단어장이 없거나 학습할 단어가 없으면(EMPTY) 예전처럼 서점으로 보낸다.
  //   그 밖은 학습 고르기 시트. 아직 씨앗을 한 번도 안 심었으면(plant_seed 미완료) 시트에서
  //   새 씨앗 심기 외 항목을 잠금으로 보인다.
  const { unlock: questUnlock, legacy: questLegacy, missions: questMissions, questCardVisible } = useOnboardingUnlock();
  const plantQuestPending = !questLegacy
    && questMissions.some((m) => m.key === 'plant_seed' && !m.done);
  // 이슈 #25 11차 — 퀘스트 v2 사용자는 첫 퀘스트(buy_book 서점에서 단어장 구매)를 끝내기 전까지
  // 홈 주 버튼을 숨긴다. 첫 할 일은 퀘스트 카드의 「바로가기」 하나로 모은다. legacy 는 그대로.
  const buyQuestPending = !!questUnlock && !questLegacy
    && questMissions.some((m) => m.key === 'buy_book' && !m.done);
  const ctaInfo = useMemo(() => (
    homeState === HOME_STATES.EMPTY
      ? { label: '농장 돌보기', kind: 'store' }
      : { label: '농장 돌보기', kind: 'study' }
  ), [homeState]);
  /*
    단어장이 0개면 빈 밭 대신 히어로 그 자리에 입문 퀘스트를 놓는다(이슈 #25 9차 의도, 10차 수정).
    9차 구현은 questInHero 일 때 본문에서 카드를 **빼기만** 하고 히어로에는 넣지 않았다 — 히어로는
    여전히 FarmHero(한 장짜리 빈 밭)였다. 그래서 가입 직후(단어장 0개 · unlock-status legacy=false ·
    buy_book 미완료 → questCardVisible=true) 퀘스트는 어디에도 없고 빈 밭만 보였다.
    지금은 단어장 0개면 밭 그림을 아예 그리지 않고(QuestHero) 그 자리에 카드를 둔다.
  */
  const noBooks = bookRows.length === 0;
  const questInHero = noBooks && questCardVisible;
  // 퀘스트 상태를 아직 모름(unlock-status 전) — 카드 자리만 스켈레톤으로 잡아 둔다
  const questPending = noBooks && booksKnown && !questUnlock;

  const gemCnt = farmOverview?.gem_cnt ?? userProfile?.gem_cnt ?? 0;

  /*
    오늘 자란 단어 — 승급 + 오늘 첫 진입을 한 목록으로 합친다(§10 "오늘 승급한 단어 목록").

    QA §A.4 — `/insights/today-changes` 가 각 항목에 `stage`(visual_stage 리터럴)를 실어
    보내기 시작한다. 있으면 그걸 그대로 쓴다 — CropImage 가 봉투/낱알을 가르려면 crop 키
    ('seed')가 아니라 visual_stage 가 필요해서다. 아직 안 내려오는 과도기(구서버) 폴백은
    기존 FSRS 구간 매핑(MEMORY_TO_CROP)을 쓰되, 'seed'는 항상 PLANTED_SEED 로 바꾼다 —
    여기 나열되는 단어는 오늘 자란(=이미 심긴) 단어라 미학습(봉투) 그림이 나올 수 없다.
  */
  const toPlantedCrop = (memoryState) => {
    const crop = MEMORY_TO_CROP[memoryState] ?? 'sprout';
    return crop === 'seed' ? 'PLANTED_SEED' : crop;
  };

  const grewItems = useMemo(() => {
    const raw = [...(todayChanges?.promoted ?? []), ...(todayChanges?.new ?? [])];
    return raw.map((e) => ({
      user_voca_id: e.user_voca_id,
      word: e.word,
      from: e.stage ?? toPlantedCrop(e.from),
      to: e.stage ?? toPlantedCrop(e.to),
      // /insights/today-changes 응답에 방금 추가된 필드 — 아직 안 내려오는 과도기에는
      // undefined 로 와도 카드·시트 양쪽이 빈칸으로 안전하게 처리한다(단계 문구로 되돌리지 않음).
      meaning: e.meaning,
    }));
  }, [todayChanges]);

  /*
    히어로 인사말 — farmOverview(이미 캐시된 값)로 상황을 판정해 src/data/homeGreetings.js의
    상황 중 하나를 고르고, 그 안에서 문구 변형 하나를 무작위로 뽑는다.

    무작위는 리렌더마다 바뀌면 안 되므로(세션 내 고정), 뽑기 자체는
    useMemo(key = 상황 id + 오늘 날짜)로 감싼다 — greetingCtx(숫자가 담긴 원본)를
    deps에서 일부러 뺐다. 같은 상황이 유지되는 동안은 같은 문구가 보이고, 학습을 마치고
    돌아와 farmOverview가 새로 조회돼 상황이 바뀌거나(예: careMany → doneAll) 날짜가
    바뀌면(자정 지나 재진입) 새로 하나를 뽑는다.

    농장 조회 전(farmOverview===null)에는 situation 'empty'(빈 밭)와 구분이 안 돼
    "밭이 비어 있어요"가 한 프레임 스치게 된다 — 위 homeState 기본값(HOME_STATES.DUE)과
    같은 이유로, 조회 전에는 상황 판정을 하지 않고 중립 문구를 깔아 둔다.
  */
  // todayKey(KST 날짜)를 deps 에 둔다 — buildGreetingContext 의 now(요일 등)가 렌더 시점 값이라,
  // 상태가 안 바뀌면 자정 뒤에도 어제 요일로 굳는다(2026-10-02).
  const greetingCtx = useMemo(
    // signupDate — 가입 당일엔 작별 인사 대신 환영 문구(homeGreetings 'firstDay', 이슈 #25)
    () => buildGreetingContext(farmOverview, { grewTodayCount: grewItems.length, signupDate: userProfile?.created_date }),
    [farmOverview, grewItems, todayKey, userProfile?.created_date]
  );
  const greetingSituation = farmOverview ? resolveGreetingSituation(greetingCtx) : null;
  const greetingDateKey = todayKey;
  const greeting = useMemo(() => {
    if (!greetingSituation) return { line1: '오늘도', line2: '농장을 둘러봐요' };
    return pickGreetingVariant(greetingSituation, greetingCtx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [greetingSituation?.id, greetingDateKey]);

  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { pushNewFullSheet } = useNewFullSheetActions();
  const { startPlantSession } = usePlantSession();
  const { pushNewBottomSheet } = useNewBottomSheetActions();

  // 당겨서 새로고침 — StreakCard는 /farm/streak를 자체 상태로 들고 있어(streak 값이 이 컴포넌트에
  // 없음) 직접 재조회할 수 없다. 대신 StreakCard가 마운트 시 자신의 재조회 함수를
  // registerRefresh로 여기 넘겨주면, 그 함수를 ref에 담아뒀다가 당겨서 새로고침 때 같이 부른다.
  const streakRefreshRef = useRef(null);
  const registerStreakRefresh = useCallback((fn) => { streakRefreshRef.current = fn; }, []);
  // 밭 지도 기본 시점 리셋 신호 — 당겨서 새로고침 때 1 올린다(HomeFieldGrid resetSignal)
  const [mapReset, setMapReset] = useState(0);
  const handlePullToRefresh = useCallback(async () => {
    setMapReset((n) => n + 1);
    await Promise.all([
      refreshStats(),
      streakRefreshRef.current ? streakRefreshRef.current() : Promise.resolve(),
    ]);
  }, [refreshStats]);

  // 홈 화면 진입 시 출석 체크 호출 + (실험실 지원 앱 버전에서만) 실험실 설정 프리로드
  useEffect(() => {
    fetchUserCheckin();
    if (isAppVersionAtLeast('1.1.0')) prefetchLabSettings();
  }, []);

  /*
    ④ 온보딩→가입→로그인 후 홈 첫 진입 시 벌어지는 두 연출을 **순서대로만** 띄운다.
      1) 업적 1레벨 오버레이(대기열) — pages/Index.jsx 가 migrate 직후 updateUserHistory 응답의
         goals 를 localStorage 대기열에 담아 둔다. 여기서 읽는 즉시 지워 중복 소비를 막고,
         AchievementRewardOverlay(학습 결과 업적 슬라이드와 같은 연출, 「확인」으로 닫힘)를 하나씩 await 하며 순차로 띄운다.
      2) 알림 권한 바텀시트 — 온보딩 signup에서 세운 플래그. 원래 있던 700ms 지연 로직 그대로.
    업적 오버레이가 다 끝난 뒤에 알림 시트를 열어야 한다 — 동시에 뜨면 오버레이가 시트를 덮는다.
  */
  useEffect(() => {
    if (!userProfile || !userProfile.id) return;

    let cancelled = false;
    let t = null;

    const showPendingGoalOverlays = async () => {
      let goals = null;
      try {
        const raw = localStorage.getItem('heyvoca_pending_goal_overlay');
        if (raw) goals = JSON.parse(raw);
      } catch (e) { goals = null; }
      // 읽는 즉시 지운다 — 다시 마운트돼도 같은 업적을 또 띄우지 않게.
      try { localStorage.removeItem('heyvoca_pending_goal_overlay'); } catch (e) { /* noop */ }

      if (!Array.isArray(goals) || goals.length === 0) return;
      if (!window.overlayContext?.showAwaitOverlay) return;

      for (const goal of goals) {
        if (cancelled) return;
        // fetchUserCheckin이 같은 업적을 이미 띄웠으면 건너뛴다(UserContext markGoalOverlayShown 주석 참고)
        if (typeof markGoalOverlayShown === 'function' && !markGoalOverlayShown(goal)) continue;
        await window.overlayContext.showAwaitOverlay(AchievementRewardOverlay, { goal });
      }
    };

    const promptNotifPermission = () => {
      let pending = null;
      try { pending = localStorage.getItem('heyvoca_notif_prompt'); } catch (e) { pending = null; }
      if (pending !== '1') return;
      try { localStorage.removeItem('heyvoca_notif_prompt'); } catch (e) { /* noop */ }

      checkNotificationPermissionGranted().then((granted) => {
        if (cancelled) return;
        if (granted === true) return; // 이미 허용됨 → 바텀시트 노출 없이 플래그만 소비
        t = setTimeout(() => {
          if (cancelled) return;
          pushNewBottomSheet(NotifPermissionNewBottomSheet, {}, { isBackdropClickClosable: true, isDragToCloseEnabled: true });
        }, 700);
      });
    };

    showPendingGoalOverlays().then(() => {
      if (!cancelled) promptNotifPermission();
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

  const handleCtaClick = () => {
    if (homeState === HOME_STATES.EMPTY || ctaInfo.kind === 'store') {
      vibrate({ duration: 5 });
      navigate('/book-store');
      return;
    }
    vibrate({ duration: 5 });
    pushNewBottomSheet(StudyPickNewBottomSheet, { seedOnly: plantQuestPending }, { isBackdropClickClosable: true, isDragToCloseEnabled: true });
  };

  /*
    §8 water·amber 스트립("오늘 안에 물이 필요한 작물 N개"·"썩은 작물 N개를 되살릴 수 있어요")은
    2026-09-27 홈 개편에서 뺐다 — 새 TodayTasksCard(오늘 할 일)의 "시듦 물주기"·"썩은 단어
    살리기" 행이 정확히 같은 사실을 개수·단어 목록까지 더 자세히 말한다. seed 스트립("새 씨앗
    N개가 밭에 도착했어요")도 같은 이유로 "새 씨앗 심기" 행과 겹쳐 뺐다.
  */

  /*
    ⑤ "지금 볼 만한 단어" 카드들의 "+n개 더"·헤더 숫자가 여는 전체 목록 시트.
  */
  // 오늘 자란 단어 — todayChanges(promoted+new)를 이미 클라이언트가 다 갖고 있어 API 호출이 없다.
  const openGrownSheet = () => {
    vibrate({ duration: 5 });
    pushNewFullSheet(WordListSheet, {
      title: '오늘 자란 단어',
      items: grewItems,
    }, { smFull: true, closeOnBackdropClick: true });
  };

  // 아직 심지 않은 씨앗 — 총량이 커서(최대 수백) 커서 페이지네이션(GET /farm/plants?group=unplanted).
  // 학습 진입은 헤더가 아니라 시트 하단 고정 CTA로 옮겼다(⑤-3 "심으러 가기"가 목록을 가리던 문제).
  const openSeedsSheet = () => {
    vibrate({ duration: 5 });
    pushNewFullSheet(WordListSheet, {
      title: '아직 심지 않은 씨앗',
      paged: true,
      emptyText: '아직 심지 않은 씨앗이 없어요',
      ctaLabel: '씨앗 심으러 가기',
      // "심으러 가기"는 문자 그대로 새 단어를 심는 동작이라 복습(startQuickReview)이 아니라
      // 심기 세션(usePlantSession)을 연다 — 새 단어는 여기서만 시작한다(2026-09-29).
      onCta: () => startPlantSession({ count: Math.min(5, unplanted || 5) }),
    }, { smFull: true, closeOnBackdropClick: true });
  };

  /*
    성과 카드 아래에 붙는 "지금 볼 만한 단어".

    2026-09-27 홈 개편 — "지금 물이 필요한 단어"·"되살릴 수 있는 단어" 두 묶음은 뺐다.
    새 TodayTasksCard(오늘 할 일)의 "오늘 돌봄 물주기"·"시듦 물주기"·"썩은 단어 살리기" 행이
    같은 사실(개수 + 단어 목록 + 학습/회복 진입)을 이미 더 자세히 말한다 — 카드 두 곳에서
    같은 단어를 두 번 나열하지 않는다. "아직 심지 않은 씨앗"은 오늘 할 일 카드가 다루지 않는
    정보(하루 목표가 아니라 보유 전체)라 그대로 남긴다.

    "최근에 심은 단어"는 2026-09-29 QA로 제거 — "오늘 자란 단어" 카드(그 씨앗도 심은 순간
    'seed' 단계로 포함된다)와 사실이 겹쳐 같은 단어를 두 번 보여주는 카드였다.
  */
  const feed = farmFeed ?? {};
  const feedCandidates = [
    {
      key: 'seeds',
      title: '아직 심지 않은 씨앗',
      items: feed.seeds ?? [],
      // 상태어(안 배움) 제거 → 뜻으로(tone 없음). 헤더는 "심으러 가기"(바로 학습)를 뗐고
      // 학습 진입은 시트 하단 CTA로 옮겼다(⑤-3). onMore가 없어 헤더는 숫자만 있고 안 눌린다 —
      // "+n개 더"와 같은 곳으로 가는 중복 진입점이었기 때문(사용자 목업 승인). "+n개 더"만 시트를 연다.
      moreLabel: null,
      onMore: null,
      totalCount: unplanted,
      onViewAll: openSeedsSheet,
    },
  ];

  // 'care'·'rotten'·'recent'는 뺐으니(위 주석) 지금은 'seeds' 하나뿐이다. slice(0, 2)는 그대로 둬
  // 앞으로 후보가 다시 늘어도 §7 "최대 두 묶음"을 지키게 한다.
  const feedOrder = ['seeds'];

  const feedSections = feedOrder
    .map((key) => feedCandidates.find((c) => c.key === key))
    .filter((section) => section && section.items.length > 0)
    .slice(0, 2);

  // 히어로 위에 뜨는 것들(보석 칩 · 학습 언어 칩 · 헤드라인 · 주 CTA) — 지도 배경 히어로와
  // 단어장 0개 퀘스트 히어로가 같은 내용을 쓴다
  const heroOverlay = (
    <>
      {/* 보석 — 히어로 우측 상단에 떠 있는 칩(§6 · §10).
          히어로 위에 뜬 요소에만 그림자를 쓴다. 본문 카드는 시스템대로 보더 우선(§7) */}
      <button
        id="home-gem-chip"
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
          src={gemIcon}
          alt=""
          draggable={false}
          className="block w-[22px] h-[22px] object-contain select-none"
        />
        {gemCnt.toLocaleString()}
      </button>

      {/* 학습 언어 칩 — 보석 칩과 대칭으로 히어로 좌측 상단에 뜬다(같은 칩 규격).
          탭하면 학습 언어 바텀시트. 실험실 multi_lang 이 켜졌을 때만 노출 */}
      {showLangChip && (
        <button
          type="button"
          onClick={() => {
            vibrate({ duration: 5 });
            pushNewBottomSheet(LearningLangNewBottomSheet, {}, { isBackdropClickClosable: true, isDragToCloseEnabled: true });
          }}
          aria-label={`학습 언어: ${LANG_LABEL[learningLang]}`}
          className="
            absolute top-[max(48px,calc(var(--status-bar-height)+4px))] left-[16px] z-[20]
            inline-flex items-center
            h-[36px] px-[12px] rounded-full
            bg-layout-white/90 dark:bg-layout-gray-dark/90 backdrop-blur-[8px]
            shadow-[0_2px_8px_rgba(96,80,52,.16)] dark:shadow-[0_2px_8px_rgba(0,0,0,.4)]
            text-[14px] font-[700] tracking-[-0.02em]
            text-layout-black dark:text-layout-white
            gap-[6px]
          "
        >
          <span className="flex items-center justify-center w-[18px] h-[14px] rounded-[4px] overflow-hidden ring-1 ring-inset ring-black/5 dark:ring-white/10 flex-shrink-0">
            <LangFlagIcon lang={learningLang} size={18} />
          </span>
          {LANG_LABEL[learningLang]}
        </button>
      )}

      {/* §4 2줄 헤드라인 — 닉네임 첫머리는 뺐다(이슈 #25 4차).
          밭 지도(HomeFieldGrid)가 히어로 전체에 배경으로 깔리므로 글자는 포인터를 지도로 통과시킨다.
          문구 자체는 src/data/homeGreetings.js가 상황별로 고른다(CTA 5상태와 분리) */}
      <div className="
        absolute top-[max(92px,calc(var(--status-bar-height)+48px))] left-0 right-0 z-[6]
        pointer-events-none
        px-[26px] text-center
        text-[22px] font-[700] tracking-[-0.02em] leading-[1.4]
        text-farm-ink dark:text-layout-white
      ">
        {greeting.line1}
        <br />
        {greeting.line2}
      </div>

      {/* §12 의 주황 핀("썩기 직전 N")은 내렸다 — QA 2차.
          밭 그림 위에 경고 핀을 띄우면 헤드라인·CTA·팻말과 네 번째로 같은 말을 하면서
          가장 눈에 띄는 자리를 겁주는 데 쓴다. 부패 직전 안내는 CTA 바로 아래 "오늘 할 일"
          카드(TodayTasksCard)가 맡고 있고, 거기에는 누르면 갈 곳이 있다. */}

      {/* §7 주 CTA — 히어로 하단에 겹쳐 뜬다. 홈에서 유일한 핑크 */}
      {!buyQuestPending && <FarmCta label={ctaInfo.label} onClick={handleCtaClick} />}
    </>
  );

  // 단어장이 하나라도 있으면 밭 지도를 화면 전체 배경으로 깐다(없으면 밭 없는 퀘스트 히어로)
  const hasFieldMap = !noBooks;

  return (
    /* §9 단일 배경 — 화면 배경을 한 번만 깔고 히어로 그라디언트의 끝 색을 같은 값으로 맞춘다 */
    /* isolate — 히어로(z-1)와 본문(z-2)의 겹침 순서는 홈 **안에서만** 유효해야 한다.
       stacking context 를 끊지 않으면 본문 카드(z-2)가 화면 전체 기준으로 떠올라
       바텀 네비(fixed · z-auto)를 덮어 버린다(스크롤 영역이 길어지는 순간 네비가 사라진다). */
    /*
      화면 전체가 하나의 스크롤이다.
      예전에는 히어로를 고정하고 아래 카드 영역만 스크롤했다. 그러면 손가락을 올린 곳에
      따라 움직이는 곳과 안 움직이는 곳이 갈려서, 밭을 잡고 끌면 아무 일도 안 일어났다.
      화면의 절반을 차지하는 그림이 스크롤에 반응하지 않는 건 "고정된 헤더"가 아니라
      **고장 난 화면**으로 읽힌다.
    */
    <PullToRefresh
      onRefresh={handlePullToRefresh}
      className="isolate flex flex-col h-screen overflow-y-auto bg-farm-canvas dark:bg-layout-black"
    >

      {/* 밭 지도 — 홈 화면 전체(하단 탭 위까지)의 배경 층(이슈 #25 9차).
          예전엔 히어로(420px) 안에만 깔려 밭을 아래로 끌면 CTA 절반쯤에서 페이드로 사라졌다.
          스크롤 영역 맨 앞에 깔려 **페이지와 함께 스크롤된다**(10차 — sticky 로 화면에 고정하니 홈을
          내려도 지도가 그대로 서 있어 어색했다). 히어로 글자·칩·CTA 와 아래 카드(글래스)들이 그 위에
          겹친다. 음수 margin 으로 흐름 높이를 0 으로 만들어
          히어로·본문 배치는 그대로다. 카드 영역(본문 블록)은 포인터를 받아 세로 스크롤이 되고,
          카드가 없는 곳(히어로 빈 곳·본문 아래)은 지도가 받는다 — 기존 제스처 규칙 그대로. */}
      {hasFieldMap && (
        <div
          className="
            relative z-0 shrink-0 w-full
            h-[calc(100vh-60px-var(--safe-area-bottom))]
            -mb-[calc(100vh-60px-var(--safe-area-bottom))]
            bg-[linear-gradient(180deg,var(--farm-sky-100)_0%,var(--farm-sky-200)_32%,var(--farm-canvas)_100%)]
          "
        >
          <HomeFieldGrid
            rows={bookRows}
            resetSignal={mapReset}
            focusBottom={HERO_HEIGHT - 46}
            onSelect={(id) => {
              vibrate({ duration: 5 });
              pushNewFullSheet(VocabularyWordsNewFullSheet, { id }, { smFull: true, closeOnBackdropClick: true });
            }}
          />
        </div>
      )}

      {hasFieldMap ? (
        /* 지도가 배경일 때의 히어로 — 하늘·밭은 위 배경 층이 그리므로 투명한 자리만 잡는다.
           빈 곳은 포인터를 아래 지도로 통과시키고(pointer-events-none), 칩·CTA 만 다시 받는다 */
        <div className="relative w-full h-[420px] flex-shrink-0 z-[1] pointer-events-none">
          <div className="pointer-events-auto">
            {heroOverlay}
          </div>
        </div>
      ) : (
        /* 단어장 0개 — 밭 그림 없이 하늘만 깔고, 헤드라인 아래 ~ CTA 위 자리에 입문 퀘스트 카드.
           카드 높이만큼 히어로가 늘어난다(최소 420px). 단어장 목록을 받기 전·퀘스트 대상이 아니면 빈 자리 */
        <div className="
          relative w-full min-h-[420px] flex-shrink-0 z-[1]
          bg-[linear-gradient(180deg,var(--farm-sky-100)_0%,var(--farm-sky-200)_32%,var(--farm-canvas)_100%)]
          px-[20px] pt-[max(170px,calc(var(--status-bar-height)+126px))] pb-[64px]
        ">
          {questInHero && <OnboardingQuestCard />}
          {questPending && (
            <div
              aria-hidden
              className="h-[300px] rounded-[12px] bg-[rgba(255,255,255,.55)] dark:bg-[rgba(36,36,36,.5)] border border-white/70 dark:border-white/[.06] animate-pulse"
            />
          )}
          {heroOverlay}
        </div>
      )}

      {/* §9 본문 — 배경을 깔지 않는다. 페이드된 지면이 카드 사이로 비친다.
          §7 — CTA 가 흘러나온 만큼 상단 패딩 30px 으로 비켜 준다 */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="
          relative z-[2] shrink-0
          flex flex-col gap-[12px]
          px-[20px] pt-[30px]
          pb-[calc(84px+var(--safe-area-bottom))]
        "
      >
        {/* CTA 바로 아래 "오늘 할 일" 카드 — 썩은 단어·시듦·돌봄·새 씨앗을 한 곳에서 말한다.
            §8 water·amber·seed 스트립은 이 카드로 흡수돼 뺐다(위 변수 선언부 주석 참고). */}
        {/* 가입 직후 '첫 퀘스트'(이슈 #25) — 신규 가입자에게 남은 퀘스트가 있을 때만 그려진다.
            새 사용자에게 지금 할 일은 퀘스트를 하나씩 해 보는 것이라 오늘 할 일보다 위에 둔다. */}
        {!questInHero && <OnboardingQuestCard />}

        <TodayTasksCard />

        {/* 연속 학습 — 1주 불꽃 달력. 홈에서 성과를 말하는 유일한 블록. 항상 노출된다 */}
        <StreakCard registerRefresh={registerStreakRefresh} />

        {/* 오늘 자란 단어 — 조건부다(§10). 오늘 자란 것이 없으면 카드를 아예 띄우지 않는다.
            "황금 당근" 카드는 내렸다 — 개수 하나만 적혀 있어 대부분의 날에 "0개"만 말했고,
            황금 당근은 마이페이지 온실에 그대로 있다. */}
        <GrewTodayCard items={grewItems} onViewAll={openGrownSheet} />

        {/* 지금 볼 만한 단어 — "아직 심지 않은 씨앗" ("최근에 심은 단어"는 2026-09-29 제거) */}
        {feedSections.map((section) => (
          <WordFeedCard
            key={section.key}
            title={section.title}
            items={section.items}
            tone={section.tone}
            showCrop={section.showCrop}
            moreLabel={section.moreLabel}
            onMore={section.onMore}
            totalCount={section.totalCount}
            onViewAll={section.onViewAll}
          />
        ))}

      </motion.div>
    </PullToRefresh>
  );
};

export default Main;
