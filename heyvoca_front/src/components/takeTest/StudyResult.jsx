import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Circle, X, Play, Pause } from '@phosphor-icons/react';
import { useVocabulary } from '../../context/VocabularyContext';
import { useUser } from '../../context/UserContext';
import { haptic, feel, useCountUp, ShineSweep, SPRING } from '../../lib/feel';
import { warmTts } from '../../api/tts';
import SpeakerButton from '../common/SpeakerButton';
import { wordLang, isJa } from '../../utils/lang';
import { getReading, shouldShowReading } from '../../utils/jaWord';
import { useTheme } from '../../context/ThemeContext';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import WordDetaileNewBottomSheet from '../newBottomSheet/WordDetaileNewBottomSheet';
import { useStatusBarStyle } from '../../hooks/useStatusBarStyle';
// 당근 농장 V2 — 세션 요약 슬라이드
import CropImage from '../farm/CropImage';
import { stageToCrop, FARM_ITEMS } from '../../utils/crop';
import WeekStreakStrip, { buildWeekCells } from '../farm/WeekStreakStrip';

import { getFarmTodayTasksApi } from '../../api/farm';
import { fetchSessionFarmSummary } from '../../utils/sessionSummaryPrefetch';
import { calendarDaysFromToday } from '../../utils/reviewTiming';
import StudyTimingTag from '../farm/StudyTimingTag';
import { getAchievementCriteriaApi, updateUserRecentStudyDataApi } from '../../api/study';
import { planNextStudy, loadStudyConfig, NEXT_STUDY_COUNTDOWN_MS } from '../../utils/nextStudy';
import { primeSfx } from '../../utils/audio';
// 보상 슬라이드(밭 성장 · 아이템 · 보석 · 업적 · 콤보)와 공용 껍데기 · 하단 버튼
import {
  RewardShell, LegacyAuroraStage, FarmGrowthSlide, ItemRewardSlide, GemRewardSlide, AchievementSlide, ComboRewardSlide,
  FarmGrowRow, ResultCta, ResultCtaBar, CTA_BASE, CTA_PRIMARY_FACE, ACHIEVEMENT_IMAGES,
  buildGrowthEntries,
} from './rewards';

// ─────────────────────────────────────────────────────────────
// 당근 농장 V2 — 결과 슬라이드 조각
// 밭 성장 · 아이템 · 보석 · 업적 슬라이드는 rewards/ 로 옮겼다. 여기 남은 것은
// 새 씨앗 심기 결과(PlantReveal)와 예전 규격 슬라이드가 쓰는 조각이다.
// ─────────────────────────────────────────────────────────────

// 새 연출 슬라이드 — 각자 빛과 시간표를 가지고, 연출이 끝나야 「확인」이 켜진다
const SCENE_SLIDE_TYPES = new Set(['farmGrowth', 'farmItem', 'gem', 'achievement', 'combo']);

// 목록이 붙는 예전 규격 슬라이드 — 가운데 정렬도 배경 오로라도 쓰지 않는다(LegacyAuroraStage)
const LIST_SLIDE_TYPES = new Set(['farmPlanted']);

/*
  100px 히어로 그림 — **작물 단계(stage) 전용**. 뒤 글로우(ResultItemBackground01/02)의
  중심(top-[50px]/50%)에 실제 그림 내용물이 맞도록 CropImage의 align="center" 보정을 함께 쓴다.

  씨앗·새싹·이파리 에셋은 512² 캔버스에 바닥선(y=440) 기준으로 그려져 있어(CropImage.jsx 주석),
  100px 정사각형에 object-contain으로만 넣으면 내용물이 칸 아래쪽에 깔린다 — 글로우 중심보다
  낮게 보이는 버그의 원인이었다.

  애니메이션(scale/opacity/y)과 정렬 보정(translateY+scale)을 같은 엘리먼트에 같이 걸면 프레이머
  모션이 style.transform을 통째로 관리해 정렬 보정이 지워진다(ProgressSplash.jsx 주석과 같은 버그
  유형). 그래서 애니메이션은 바깥 motion.div에, 정렬 보정은 안쪽 CropImage(align="center")에 나눠
  둔다 — 서로 다른 엘리먼트라 지우지 않는다.
*/
const FarmCropArt = ({ stage, health = 'FRESH', alt }) => (
  <motion.div
    className='w-[100px] h-[100px]'
    initial={{ scale: 0, opacity: 0 }}
    animate={{ scale: [0, 1.2, 1, 1.1, 1], opacity: 1, y: [0, -8, 0] }}
    transition={{
      scale: { type: 'tween', ease: 'easeOut', duration: 0.6, times: [0, 0.5, 0.7, 0.85, 1] },
      opacity: { duration: 0.6 },
      y: { delay: 0.8, duration: 2.5, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' },
    }}
  >
    <CropImage stage={stage} health={health} size={100} align="center" alt={alt} />
  </motion.div>
);

// 목록형 슬라이드 — 보상 슬라이드와 같은 형식(그림 + 한 줄 + 목록). 전부 가운데 정렬.
//
// **목록만 따로 스크롤하지 않는다.** 예전에는 목록에 `max-h-[34dvh] overflow-y-auto` 를 걸어
// 그림과 문구는 붙박이로 두고 목록만 안에서 굴렀다. 그러면 화면 절반이 빈 채로 목록만
// 좁은 창에서 움직여, 스크롤하는 것이 목록인지 화면인지 알 수 없었다.
// 지금은 바깥 영역이 통째로 스크롤되고 그림·문구·목록이 같이 움직인다(글로우도 따라온다).
const FarmListSlide = ({ art, line, rows }) => (
  <div className='relative flex flex-col items-center justify-center gap-[15px] w-full'>
    {art}
    <motion.p
      className='text-[16px] font-[700] text-center leading-[1.45]'
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.3, duration: 0.5 }}
    >
      {line}
    </motion.p>
    <motion.div
      className='flex flex-col gap-[8px] w-full'
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.5, duration: 0.4 }}
    >
      {rows}
    </motion.div>
  </div>
);

/*
  ─────────────────────────────────────────────────────────────
  게스트(온보딩 첫 학습) 결과 — 가입하면 계정에 그대로 들어올 것을 미리 계산한다.
  ─────────────────────────────────────────────────────────────

  로그인 사용자는 POST /mainpage/user_study_history 가 출석·미션·업적·보석을 한 번에
  처리해서 그 응답으로 슬라이드를 만든다. 게스트는 계정이 없어 그 호출을 못 하는데,
  예전에는 그 자리를 `{ gem: 0 → 5 }` 한 줄로 때웠다. 그래서 첫 학습을 마친 사람이
  **보석 한 장만 보고** 넘어갔다 — 정작 가장 많이 받는 회차인데도.

  가입 직후 실제로 벌어지는 일(pages/Index.jsx: migrate → updateUserHistory)은 이렇다.
    · 온보딩 가입 보상 보석          (onboarding.py SIGNUP_REWARD_GEM)
    · 오늘 첫 학습 → 출석 + 보석      (mainpage.py 출석 처리)
    · 출석왕 1레벨 (출석 1일)         → 보석
    · 노력왕 1레벨 (학습 1회)         → 보석
    · 데일리 미션 완료 + 보석         (온보딩 당일은 첫날 계획 완수로 판정 — mainpage.py)
    · 끈기왕 1레벨 (연속 학습 1일)    → 보석
  전부 조건이 '첫 학습'이라 예외 없이 달성된다. 그래서 예측이 아니라 사실상 확정이고,
  여기서 그대로 그린다. 업적 보상 개수만 서버 기준표(/mainpage/achievement_criteria,
  비인증)에서 읽어 온다 — 운영에서 보상을 바꿔도 화면 숫자가 따라가도록.

  암기왕은 콤보 기준이라 today 유형(온보딩)에서는 쌓이지 않고,
  독서왕은 '서점 단어장 구매'라 무료로 받는 온보딩 단어장은 해당하지 않는다.
*/
const GUEST_SIGNUP_GEM = 5;        // heyvoca_back/app/routes/onboarding.py SIGNUP_REWARD_GEM
const GUEST_ATTEND_GEM = 1;        // mainpage.py 출석 보석
const GUEST_MISSION_GEM = 1;       // mainpage.py 데일리 미션 완료 보석
const GUEST_FIRST_DAY_GOALS = ['출석왕', '노력왕', '끈기왕'];
const GUEST_GOAL_REWARD_FALLBACK = 2;   // 기준표 조회 실패 시 (goals 1레벨 reward_count)

const buildGuestSignupResult = async () => {
  const rewardByType = {};
  try {
    const res = await getAchievementCriteriaApi();
    if (res?.code === 200 && res.data) {
      GUEST_FIRST_DAY_GOALS.forEach((type) => {
        const lv1 = (res.data[type] || []).find((g) => g.level === 1);
        if (lv1?.reward != null) rewardByType[type] = lv1.reward;
      });
    }
  } catch (e) { /* 기준표 조회 실패 — 기본값으로 그린다 */ }

  const goalGem = GUEST_FIRST_DAY_GOALS
    .reduce((sum, type) => sum + (rewardByType[type] ?? GUEST_GOAL_REWARD_FALLBACK), 0);

  return {
    // 보석 합계는 그대로 둔다 — 서버가 실제로 데일리 미션(GUEST_MISSION_GEM)과
    // 업적 1레벨(goalGem)까지 지급하므로, 화면에 슬라이드로 안 그려도 지급분을 빼면 안 된다.
    gem: { before: 0, after: GUEST_SIGNUP_GEM + GUEST_ATTEND_GEM + GUEST_MISSION_GEM + goalGem },
    attend: true,
    today_study_complete: true,
    // ⑪⑫ 슬라이드는 여기서 비운다 — 데일리 미션 완료·업적 1레벨은 온보딩 "가입 직전 학습"에서
    // 매번 조건 없이 달성돼(첫 학습이라 예외가 없다) 게스트 결과 화면에 붙이면 매번 똑같은
    // 두 장이 반복 재생되는 형식적인 연출이 됐다. 업적 연출은 가입 후 실제 계정에 반영된
    // 시점(홈 첫 진입)으로 옮겼다 — pages/Index.jsx → components/home/Main.jsx,
    // AchievementRewardOverlay 재사용. 위 gem 계산에는 여전히 반영돼 있다.
    daily_mission_complete: false,
    goals: [],
  };
};

// 하단 버튼(ResultCta · ResultCtaBar)은 rewards/ResultCta.jsx 로 옮겼다 — 보상 슬라이드 껍데기와 같이 쓴다.

/*
  "다음 학습" — 넷플릭스 '다음화' 자동 재생. 다 세면 호출부가 다음 세션을 연다
  (카운트 자체는 호출부 타이머가 정본이고, 링은 연출이다).

  【2026-09-27 실기기 피드백】 예전에는 옅은 핑크 면 위로 진한 핑크가 왼쪽→오른쪽으로 차올라
  버튼이 두 톤으로 뚝 갈라져 보였고, 남은 초는 회색 원 안에 있었다. 지금은 면은 평소 주 버튼
  (ResultCta) 그대로 한 장이고, 남은 초를 **흰 원형 진행 링**이 감싸 조용히 줄어든다.
  면 색이 바뀌지 않으므로 카운트가 끝나거나 취소돼도 버튼이 '다른 물건'으로 바뀌지 않는다
  — 링과 숫자만 사라진다.
  reduced-motion: 링은 줄지 않고 숫자만 줄어든다.
*/
const RING_R = 9;
/*
  from: 이 구간이 시작할 때 남은 비율(1 = 가득). 백그라운드에서 돌아와 이어 셀 때는 1 이 아니다.
  runSec: from → 0 까지 걸리는 시간(= 남은 시간). running 이 false 면 from 에 멈춰 있는다.
  구간이 바뀔 때마다 호출부가 key 를 바꿔 새로 마운트한다(framer 가 중간값에서 이어 가지 않게).
*/
const CountdownRing = ({ remainingSec, from, runSec, running, animate }) => (
  <span className='relative inline-flex items-center justify-center w-[24px] h-[24px]'>
    <svg aria-hidden className='absolute inset-0 w-full h-full -rotate-90' viewBox='0 0 24 24'>
      <circle cx='12' cy='12' r={RING_R} fill='none' stroke='rgba(255,255,255,.32)' strokeWidth='2' />
      <motion.circle
        cx='12'
        cy='12'
        r={RING_R}
        fill='none'
        stroke='#FFFFFF'
        strokeWidth='2'
        strokeLinecap='round'
        initial={{ pathLength: animate ? from : 1 }}
        animate={{ pathLength: animate ? (running ? 0 : from) : 1 }}
        transition={animate && running ? { duration: runSec, ease: 'linear' } : { duration: 0 }}
      />
    </svg>
    <span className='relative text-[11.5px] font-[700] leading-none tabular-nums'>
      {remainingSec}
    </span>
  </span>
);

/*
  【2026-09-27 실기기 피드백 3】 예전엔 링을 탭하면 멈췄는데(버튼 나머지는 바로 시작) 발견하기
  어려웠고, 같은 버튼 안에서 누른 자리에 따라 반대 동작이 되어 헷갈렸다. 지금 멈추기는 버튼
  바로 위 안내 줄(NextStudyNotice)의 `멈추기` 한 곳뿐이고, 버튼은 어디를 눌러도 바로 시작한다.
  링은 남은 시간을 보여 주는 표시로만 남긴다.
*/
const NextStudyCta = ({ showRing, ring, reducedMotion, onStart, className = '' }) => (
  <motion.button
    type="button"
    onClick={onStart}
    whileTap={{ scale: 0.97 }}
    transition={{ type: 'spring', stiffness: 500, damping: 15 }}
    aria-label={showRing ? `다음 학습, ${ring.remainingSec}초 뒤 자동으로 시작` : '다음 학습'}
    data-testid="next-study-cta"
    className={`flex items-center justify-center ${CTA_BASE} ${CTA_PRIMARY_FACE} ${className}`}
  >
    <span className='flex items-center gap-[6px]'>
      <Play size={14} weight="fill" />
      다음 학습
      {showRing ? (
        <span aria-hidden data-testid="next-study-ring" className='flex'>
          <CountdownRing
            key={ring.key}
            remainingSec={ring.remainingSec}
            from={ring.from}
            runSec={ring.runSec}
            running={ring.running}
            animate={!reducedMotion}
          />
        </span>
      ) : null}
    </span>
  </motion.button>
);

/*
  카운트다운 안내 줄 — 하단 버튼 줄 바로 위 은은한 pill(토스트 형).
  `N초 뒤 다음 학습이 시작돼요` + 오른쪽 `멈추기`. N 은 링과 같은 remainingSec 이다.
  버튼 영역(data-result-cta, 불투명 z-20) 안에 있어 목록 스크롤과 겹치지 않고,
  결과 화면의 "명시적 탭 = 멈춤" 판정에서도 빠진다(멈추기 버튼이 직접 멈춘다).
  사라질 때는 높이·투명도를 함께 줄여 버튼 줄이 부드럽게 내려앉는다.
*/
const NextStudyNotice = ({ show, remainingSec, onStop, reducedMotion }) => (
  <AnimatePresence initial={false}>
    {show ? (
      <motion.div
        key="next-study-notice"
        initial={reducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
        animate={reducedMotion ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
        exit={reducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        className='overflow-hidden'
      >
        <div className='px-[24px] pt-[14px] -mb-[4px]'>
          <div
            role='status'
            data-testid='next-study-notice'
            className='flex items-center justify-between gap-[8px] rounded-full pl-[16px] pr-[4px] h-[40px] bg-layout-gray-50 dark:bg-layout-gray-dark'
          >
            <p className='min-w-0 truncate text-[13px] font-[600] tracking-[-0.02em] text-layout-gray-400 dark:text-layout-gray-200'>
              <span className='tabular-nums font-[700] text-primary-main-600'>{remainingSec}초</span> 뒤 다음 학습이 시작돼요
            </p>
            <button
              type='button'
              data-testid='next-study-stop'
              onClick={onStop}
              className='flex-shrink-0 flex items-center gap-[4px] h-[32px] px-[12px] rounded-full text-[13px] font-[700] text-layout-black dark:text-layout-white active:bg-layout-gray-100 dark:active:bg-layout-black'
            >
              <Pause size={14} weight="fill" />
              멈추기
            </button>
          </div>
        </div>
      </motion.div>
    ) : null}
  </AnimatePresence>
);

/*
  연속 학습 주간 달력 — 홈(home/StreakCard.jsx)의 "1주 불꽃 달력"과 완전히 같은 그림.

  【2026-09-28 실기기 피드백 4차】 예전엔 이 화면 전용으로 분홍 물방울 7칸(월~일 고정,
  session-summary.streak.week 의 studied/protected/missed/future 4상태)을 따로 그렸는데,
  홈 카드는 이미 today-tasks.week 의 all/part/shield/none/today_empty 5상태(최근 6일+오늘)로
  바뀌어 있어 같은 "연속 학습"인데 두 화면이 서로 다른 디자인이었다. 지금은 홈과 정확히 같은
  WeekStreakStrip(farm/WeekStreakStrip.jsx)을 그대로 쓰고, 데이터도 홈과 같은 근원
  (/farm/today-tasks) 을 결과 화면 진입 시점에 새로 받아 온다 — 방금 끝난 세션이 이미
  반영된 "오늘" 상태여야 하기 때문이다(아래 updateUserHistoryAndNavigate 의 fetch 주석 참고).
*/

// 암기 상태(FSRS 버킷) 순위 · → 작물 단계.
// (코드 leaf = 기획 새싹, 코드 plant = 기획 이파리)
// farm 세션 요약(planted/grown/rescued)은 '이번 세션에 단계가 바뀐 단어'만 담는 delta 라,
// 그대로 복습만 하고 단계가 안 바뀐 단어는 거기 없다 — cropOfWord 가 그 단어들의 작물을
// 정할 때 쓰는 두 번째 근거가 이 표다(모듈 스코프로 둬 결과 목록 집계와 값을 공유한다).
const STATE_RANK = { unlearned: 0, leaf: 1, plant: 2, carrot: 3 };
const STATE_TO_CROP = { unlearned: 'seed', leaf: 'sprout', plant: 'leaf', carrot: 'carrot' };


/*
  ── 결과 통계 카드 연출 ──────────────────────────────────────────────
  카드가 약 350ms 간격으로 하나씩 스프링으로 튀어나오고 숫자가 0에서 카운트업, 카드마다
  빛줄기 + feel('select'). 전부 나오면 onDone() — 하단 버튼이 그때 활성화된다.
  화면 아무 곳이나 탭하면(skipRef) 남은 카드를 한꺼번에 보여 주고 바로 onDone().
  새 지표는 만들지 않는다 — 이 화면에 원래 있던 값(정답률·정답 수·오답 수)만 쓴다.
*/
const REVEAL_GAP_MS = 350;
const REVEAL_FIRST_MS = 250;
const REVEAL_SETTLE_MS = 600;   // 마지막 카드의 카운트업이 끝나길 기다리는 시간

const useStaggerReveal = ({ count, gapMs, firstMs = REVEAL_FIRST_MS, onDone, skipRef }) => {
  const [shown, setShown] = useState(0);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; });
  useEffect(() => {
    let timer = null;
    let i = 0;
    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDoneRef.current?.();
    };
    const tick = () => {
      i += 1;
      setShown(i);
      timer = setTimeout(i < count ? tick : finish, i < count ? gapMs : REVEAL_SETTLE_MS);
    };
    if (count <= 0) finish();
    else timer = setTimeout(tick, firstMs);
    if (skipRef) {
      skipRef.current = () => {
        clearTimeout(timer);
        setShown(count);
        finish();
      };
    }
    return () => {
      clearTimeout(timer);
      if (skipRef) skipRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return shown;
};

const TONE = {
  primary: { box: 'bg-primary-main-50 dark:bg-primary-main-dark', text: 'text-primary-main-600' },
  success: { box: 'bg-status-success-100 dark:bg-status-success-dark', text: 'text-status-success-600' },
  error: { box: 'bg-status-error-50 dark:bg-status-error-dark', text: 'text-status-error-600' },
};

// 카드 한 장 — 마운트되는 순간이 "튀어나오는" 순간이다(소리·진동·빛줄기·카운트업이 같은 틱에 시작).
const RevealStatCard = ({ label, value, suffix = '', total = null, tone = 'primary', reducedMotion }) => {
  const t = TONE[tone] ?? TONE.primary;
  const display = useCountUp(value, { from: 0, duration: 0.6 });
  useEffect(() => { feel('select'); }, []);
  return (
    <motion.div
      className={`relative overflow-hidden flex flex-col items-center justify-center gap-[4px] py-[18px] rounded-[14px] ${t.box}`}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.6, y: 24, rotateX: -50 }}
      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0, rotateX: 0, transition: SPRING.bouncy }}
    >
      <ShineSweep play={!reducedMotion} delay={0.1} />
      <span className='text-[12px] font-[700] text-layout-gray-400 dark:text-layout-gray-100'>{label}</span>
      <span className={`flex items-baseline ${t.text}`}>
        <span className='text-[28px] font-[800] leading-[1.1] tabular-nums'>{display}</span>
        <span className='text-[14px] font-[700]'>{suffix}</span>
        {total != null && <span className='text-[13px] font-[500] text-layout-gray-300'>/{total}</span>}
      </span>
    </motion.div>
  );
};

const ResultStatCards = ({ cards, reducedMotion, onDone, skipRef }) => {
  const shown = useStaggerReveal({ count: cards.length, gapMs: REVEAL_GAP_MS, onDone, skipRef });
  return (
    <div className='grid grid-cols-3 gap-[10px] px-[20px] pt-[34px] pb-[26px] min-h-[130px] [perspective:600px]'>
      {cards.map((c, i) => (
        <div key={c.label} className='min-h-[88px]'>
          {i < shown && <RevealStatCard {...c} reducedMotion={reducedMotion} />}
        </div>
      ))}
    </div>
  );
};

// plant 결과 — '새로 심은 씨앗 N개' 카운트업 + 목록 항목이 차례로 등장
const PlantReveal = ({ rows, metaOfRow, reducedMotion, onDone, skipRef }) => {
  const n = rows.length;
  // 항목이 많아도 전체 등장은 약 1.5초 안에 끝나게 간격을 줄인다
  const rowGap = n > 0 ? Math.max(40, Math.min(140, Math.floor(1500 / n))) : 0;
  const [cardShown, setCardShown] = useState(false);
  const rowSkipRef = useRef(null);
  const shownRows = useStaggerReveal({
    count: n,
    gapMs: rowGap,
    firstMs: REVEAL_FIRST_MS + 500,
    onDone,
    skipRef: rowSkipRef,
  });
  useEffect(() => {
    const t = setTimeout(() => setCardShown(true), REVEAL_FIRST_MS);
    if (skipRef) {
      skipRef.current = () => { clearTimeout(t); setCardShown(true); rowSkipRef.current?.(); };
    }
    return () => { clearTimeout(t); if (skipRef) skipRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className='flex flex-col items-center gap-[15px] px-[20px] pt-[34px] pb-[30px]'>
      <FarmCropArt stage="PLANTED_SEED" alt="새로 심은 씨앗" />
      {n > 0 ? (
        <div className='w-full min-h-[88px]'>
          {cardShown && <PlantCountCard value={n} reducedMotion={reducedMotion} />}
        </div>
      ) : (
        <p className='text-[16px] font-[700] text-center leading-[1.45]'>이번에는 심은 씨앗이 없어요</p>
      )}
      <div className='flex flex-col gap-[8px] w-full'>
        {rows.map((row, i) => (
          i < shownRows ? (
            <motion.div
              key={row.user_voca_id}
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.96 }}
              animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1, transition: SPRING.soft }}
            >
              <FarmGrowRow
                crop="PLANTED_SEED"
                word={row.word}
                meaning={row.meaning}
                meta={metaOfRow(row)}
                right="새로 심었어요"
              />
            </motion.div>
          ) : null
        ))}
      </div>
    </div>
  );
};

const PlantCountCard = ({ value, reducedMotion }) => {
  const display = useCountUp(value, { from: 0, duration: 0.6 });
  useEffect(() => { feel('select'); }, []);
  return (
    <motion.div
      className={`relative overflow-hidden flex items-center justify-center gap-[8px] py-[20px] rounded-[14px] ${TONE.primary.box}`}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.7, y: 20 }}
      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0, transition: SPRING.bouncy }}
    >
      <ShineSweep play={!reducedMotion} delay={0.1} />
      <span className='text-[15px] font-[700] text-layout-gray-400 dark:text-layout-gray-100'>새로 심은 씨앗</span>
      <span className='text-primary-main-600'>
        <span className='text-[30px] font-[800] tabular-nums'>{display}</span>
        <span className='text-[16px] font-[700]'>개</span>
      </span>
    </motion.div>
  );
};

const StudyResult = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { isDark } = useTheme();
  /*
    결과 화면 statusbar 글자색.
    예전에는 무조건 'light-content'(흰 글자)를 강제했는데, 이 화면 배경은 라이트에서
    **흰색 + 연분홍 오로라**다 — 흰 글자가 흰 배경에 얹혀 시계도 배터리도 안 보였다.
    (다크에서는 배경이 #111111 이라 흰 글자가 맞다.) 배경을 따라가게 한다.
  */
  useStatusBarStyle(isDark ? 'light-content' : 'dark-content');
  const { recentStudy, updateRecentStudyState, isRecentStudyLoading, fetchVocabularySheets, setLastSessionResult, getWord, vocabularySheets } = useVocabulary();
  const reducedMotion = useReducedMotion();
  const { updateUserHistory } = useUser();
  const { pushNewBottomSheet } = useNewBottomSheetActions();

  // 결과 단어 클릭 시 단어 상세 바텀시트 — 단어장에 존재할 때만(추천/삭제 등으로 없으면 무시)
  const handleOpenWordDetail = (item) => {
    if (item?.vocabularySheetId == null || item?.id == null) return;
    // getWord는 sheet 미존재 시 throw할 수 있어 방어적으로 조회
    let word = null;
    try {
      word = typeof getWord === 'function' ? getWord(item.vocabularySheetId, item.id) : null;
    } catch {
      word = null;
    }
    if (!word) return;
    haptic('light');
    pushNewBottomSheet(WordDetaileNewBottomSheet, {
      vocabularyId: item.vocabularySheetId,
      id: item.id,
    });
  };
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state;
  // cardMatch/cardMatchListening 세트는 words 배열을 개별 단어로 flatten
  // state.testQuestions가 없거나 빈 배열이어도 렌더 오류 없이 빈 결과로 처리
  const testQuestions = (state?.testQuestions ?? []).flatMap(q => {
    if (q.questionType === 'cardMatch' || q.questionType === 'cardMatchListening') {
      return (q.words ?? []).map(word => ({
        ...word,
        isCorrect: word.isCorrect ?? q.isCorrect,
        questionType: q.questionType,
        // cardMatch 세트의 reason/priorityBucket을 개별 단어에 전파
        reason: word.reason ?? q.reason ?? null,
        priorityBucket: word.priorityBucket ?? q.priorityBucket ?? null,
        prevMemoryStateKey: word.prevMemoryStateKey ?? q.prevMemoryStateKey ?? null,
        nextMemoryStateKey: word.nextMemoryStateKey ?? q.nextMemoryStateKey ?? null,
      }));
    }
    return q;
  });
  // 농장 요약 행(user_voca_id·word) → 문제 원본 단어(읽기·JLPT·language 보유).
  // id 가 맞지 않으면 표기(origin)로 한 번 더 찾는다.
  const questionByVocaId = new Map();
  const questionByOrigin = new Map();
  testQuestions.forEach((q) => {
    const vid = q?.vocaIndexId ?? q?.id;
    if (vid != null) questionByVocaId.set(String(vid), q);
    if (q?.origin) questionByOrigin.set(q.origin, q);
  });
  const metaOfRow = (row) =>
    (row?.user_voca_id != null ? questionByVocaId.get(String(row.user_voca_id)) : undefined)
    ?? (row?.word ? questionByOrigin.get(row.word) : undefined)
    ?? null;
  const testType = state.testType;
  // 게스트 맛보기 결과 — 로그인 전용 서버로직(기록 저장·업적·추천 갱신)은 건너뛰고
  // 동일한 결과/보상 화면만 재사용한다. 완료 시 온보딩 가입으로 연결.
  const isGuest = !!state?.guestMode;

  const [currentScreenIndex, setCurrentScreenIndex] = useState(0);
  // 결과 화면 통계 카드가 모두 나왔는지 — 하단 버튼(활성화)과 자동 '다음 학습' 카운트다운이 이때 시작한다.
  const [statsDone, setStatsDone] = useState(false);
  const statsSkipRef = useRef(null);
  // 보상 슬라이드 연출이 끝난 화면 번호(그 화면의 「확인」이 켜진다)와, 탭으로 연출을 건너뛰는 함수
  const [sceneReadyIndex, setSceneReadyIndex] = useState(-1);
  const sceneSkipRef = useRef(null);
  const [resultData, setResultData] = useState(null);
  const [screenList, setScreenList] = useState([]); // 표시할 화면 리스트
  // 당근 농장 V2 세션 요약 (심은 씨앗 / 자란 작물 / 되살린 작물 / 아이템 / 연속 학습일)
  const [farmSummary, setFarmSummary] = useState(null);

  /*
    학습 결과 전용 단계 정규화 — 씨앗 구간이면 무조건 'PLANTED_SEED'로 맞춘다.

    stageToCrop()은 UNPLANTED_SEED 와 PLANTED_SEED 를 **둘 다 'seed'로 뭉갠다**(농장 4구역
    표기에는 맞는 설계다). 하지만 "심었는지 여부" 구분은 그 뒤에도 사라지지 않고 딱 한 곳에만
    남아 있다 — CropImage/getCropAsset 에 넘기는 stage 문자열이 정확히 'PLANTED_SEED' **리터럴**
    이냐 아니냐. 그 리터럴일 때만 낱알(심은 씨앗) 그림을 고르고, stageToCrop 을 거쳐 나온
    'seed'를 포함해 그 외의 모든 'seed'류 입력은 UNPLANTED 봉지(보유 씨앗, 아직 안 심음)로
    그린다(getCropAsset '씨앗 예외' 주석 참고).
    이 화면은 "학습을 끝낸 단어"만 모아 두는 목록이라 여기 뜨는 단어는 절대 미심음(보유 씨앗)일
    수 없다 — planted/rescued/grown 중 무엇으로 알아냈든 씨앗 구간이면 심었다는 사실은 이미
    확정이다. 그래서 아래 세 경로(farmCropMap 채우기)와 암기 상태 버킷 폴백이 전부 이 함수
    하나만 거치게 해서, 같은 규칙을 두 군데에 따로 적어 두다 하나를 빠뜨리는 일을 막는다.
  */
  const toResultStage = (rawStage) => {
    const crop = stageToCrop(rawStage);
    return crop === 'seed' ? 'PLANTED_SEED' : crop;
  };

  // 최종 결과 카드의 왼쪽 작물 그림 — 세션 요약(delta)에 있는 단어만 여기서 단계를 알 수 있다.
  const farmCropMap = new Map();
  if (farmSummary) {
    (farmSummary.planted ?? []).forEach(p => farmCropMap.set(p.user_voca_id, toResultStage('PLANTED_SEED')));
    (farmSummary.rescued ?? []).forEach(r => farmCropMap.set(r.user_voca_id, toResultStage(r.crop)));
    (farmSummary.grown ?? []).forEach(g => farmCropMap.set(g.user_voca_id, toResultStage(g.crop ?? g.to_stage)));
  }
  /*
    조회 우선순위 (정확도 순):

    1) farmSummary.word_stages — /farm/session-summary 응답에 새로 추가된 필드.
       이번 세션에 문제가 한 번이라도 나온 **모든** 단어의 현재 visual_stage 를 담는다
       (단계 변화가 없어 delta 에는 안 잡히는 단어까지 포함 — 아래 2)가 못 채우던 자리).
       키가 JSON 객체 키라 문자열이므로 반드시 String(userVocaId) 로 조회해야 한다 —
       숫자로 그대로 찾으면 항상 못 찾는다.
    2) farmCropMap — planted/rescued/grown delta. word_stages 가 없을 때만 쓴다.
    3) STATE_TO_CROP[item.nextMemoryStateKey] — FSRS 암기 상태 버킷 근사치.
       farm 축(visual_stage)과는 다른 축이라 완전히 같은 그림이라는 보장은 없다.
    4) 위 셋 다 없으면 호출부에서 'PLANTED_SEED' 로 떨어진다.

    2)~3)을 남겨 두는 이유: 프론트가 이 백엔드 확장보다 먼저 배포되거나, 어떤 환경에
    아직 이 변경이 안 올라갔으면 word_stages 자체가 응답에 없다. 그때도 델타/암기 상태
    버킷으로 계속 작물 그림을 그려서(텍스트 배지·봉지 버그 없이) 자연스럽게 낮은
    정확도로 내려가야지, 화면이 깨지거나 예전 버그로 되돌아가면 안 된다.
  */
  const cropOfWord = (item) => {
    // /study/log 가 보내는 user_voca_id 와 같은 키로 찾는다 (vocaIndexId 우선 — id 와 다를 수 있다)
    const userVocaId = item?.vocaIndexId ?? item?.id;
    if (userVocaId != null) {
      const exactStage = farmSummary?.word_stages?.[String(userVocaId)];
      if (exactStage) return toResultStage(exactStage);
      if (farmCropMap.has(userVocaId)) return farmCropMap.get(userVocaId);
    }
    const stateCrop = STATE_TO_CROP[item?.nextMemoryStateKey];
    if (stateCrop) return toResultStage(stateCrop);
    return null;
  };

  // 학습 결과 저장
  useEffect(() => {
    if (isGuest || (recentStudy && recentStudy[testType] && recentStudy[testType].status === "end")) {
      updateUserHistoryAndNavigate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 결과 페이지 TTS 사전 캐싱 — 단어 클릭/뜻 클릭이 보내는 텍스트를 그대로 워밍.
  // (뜻은 meanings.join(", ") 형태라 학습 중 개별 뜻 워밍과 다름 → 여기서 별도 워밍)
  // 캐시 미스면 클릭 후 생성에 시간이 걸려 autoplay 제스처가 만료되어 소리가 안 나므로 미리 캐싱.
  useEffect(() => {
    const items = [];
    (testQuestions || []).forEach((item) => {
      if (item?.origin) items.push({ text: item.origin, language: wordLang(item) });
      const m = Array.isArray(item?.meanings) ? item.meanings : [];
      if (m.length) items.push({ text: m.join(', '), language: 'ko' });
    });
    warmTts(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateUserHistoryAndNavigate = async () => {
    const correctCnt = testQuestions.filter(question => question.isCorrect).length;
    const incorrectCnt = testQuestions.filter(question => !question.isCorrect).length;
    try {
      let result;
      if (isGuest) {
        // 게스트: 서버 저장 없이 합성 결과 — 가입하면 계정에 들어올 것을 그대로 그린다
        result = await buildGuestSignupResult();
      } else {
        result = await updateUserHistory({
          'correct_cnt': correctCnt,
          'incorrect_cnt': incorrectCnt
        })

        if (!result) return;

        // 학습으로 SM2 nextReview가 갱신됐으니 단어장 다시 불러와 memoryStats(메인 멘트의 dueToday) 갱신
        fetchVocabularySheets();
      }

      setResultData(result);

      // 콤보 요약은 세션 ID 도 함께 들고 있어 농장 요약 조회 전에 먼저 읽는다.
      let comboSummary = null;
      try {
        const rawCombo = sessionStorage.getItem('heyvoca_combo_summary');
        if (rawCombo) {
          sessionStorage.removeItem('heyvoca_combo_summary');
          comboSummary = JSON.parse(rawCombo);
        }
      } catch (e) { /* 콤보 요약 파싱 실패는 무시 */ }

      // 연속 학습(streak) 요약 — /study/log 응답에서 세션 도중 캡처해 온 것.
      // qualifiedNow 가 '오늘 5개 정답 문턱을 이 세션에서 처음 넘었는가'의 유일한 근거다
      // (자세한 이유는 Main.jsx streakSessionRef 주석 참고).
      let streakSummary = null;
      try {
        const rawStreak = sessionStorage.getItem('heyvoca_streak_summary');
        if (rawStreak) {
          sessionStorage.removeItem('heyvoca_streak_summary');
          streakSummary = JSON.parse(rawStreak);
        }
      } catch (e) { /* 연속 학습 요약 파싱 실패는 무시 */ }

      // 당근 농장 V2 — 세션 요약 조회. 실패하면 농장 슬라이드 없이 기존 슬라이드만 보여준다.
      const sessionId = state?.sessionId ?? state?.session_id ?? comboSummary?.sessionId ?? null;
      let farm = null;
      if (!isGuest && sessionId) {
        const farmRes = await fetchSessionFarmSummary(sessionId);
        if (farmRes?.code === 200) {
          farm = farmRes.data ?? null;
          setFarmSummary(farm);
        }
      }

      const plantedList = farm?.planted ?? [];
      const grownAll = farm?.grown ?? [];
      const rescuedList = farm?.rescued ?? [];
      const farmRewards = farm?.rewards ?? {};
      const farmStreak = farm?.streak ?? null;

      // 시안 §1 ① — "신규 씨앗은 여기 없다(②가 맡는다). 같은 단어를 두 번 보이지 않는다."
      // 이번에 심은 씨앗이 같은 세션에서 발아까지 했더라도 ②에만 남긴다.
      const plantedIds = new Set(plantedList.map(p => p.user_voca_id));
      const grownOnly = grownAll.filter(g => !plantedIds.has(g.user_voca_id));
      const cropOfRow = (row) => stageToCrop(row.to_stage ?? row.crop);
      // ③ 새싹 발아 · ⑨ 황금 당근은 각각 한 장이라 ① 목록에서 뺀다.
      const sproutedList = grownOnly.filter(g => cropOfRow(g) === 'sprout');
      const goldenList = grownOnly.filter(g => cropOfRow(g) === 'golden');
      const grownList = grownOnly.filter(g => !['sprout', 'golden'].includes(cropOfRow(g)));

      // 표시할 화면 리스트 생성 — 순서는 시안 §4 순서표가 정본이다.
      const screens = [];

      // 새 단어(처음 학습) 목록 — 농장 요약을 못 받았을 때 ② 슬라이드를 채운다
      const newWordMap = new Map();
      testQuestions
        .filter(q => q.priorityBucket === 'new')
        .forEach(q => newWordMap.set(q.vocaIndexId ?? q.id, q));
      const newWordRows = [...newWordMap.values()].map(q => ({
        user_voca_id: q.vocaIndexId ?? q.id,
        word: q.origin,
        meaning: Array.isArray(q.meanings) ? q.meanings.join(', ') : '',
      }));
      const newWordCount = newWordRows.length;

      // 암기 상태가 좋아진 단어 집계 (STATE_RANK/STATE_TO_CROP 은 모듈 스코프 — cropOfWord 와 공유)
      const improvedWords = testQuestions.filter(q => {
        const before = STATE_RANK[q.prevMemoryStateKey];
        const after = STATE_RANK[q.nextMemoryStateKey];
        return before != null && after != null && after > before;
      });
      const decreasedWords = testQuestions.filter(q => {
        const before = STATE_RANK[q.prevMemoryStateKey];
        const after = STATE_RANK[q.nextMemoryStateKey];
        return before != null && after != null && after < before;
      });
      // 단어별 변화 리스트 — 재출제로 같은 단어가 중복되면 마지막 결과만 유지.
      // 신규는 ②가 맡으므로 여기서 뺀다(시안 §4 1행 "신규 제외").
      const improvedMap = new Map();
      improvedWords
        .filter(q => q.priorityBucket !== 'new')
        .forEach(q => improvedMap.set(q.vocaIndexId ?? q.id, q));
      const improvedRows = [...improvedMap.values()].map(q => ({
        user_voca_id: q.vocaIndexId ?? q.id,
        word: q.origin,
        meaning: Array.isArray(q.meanings) ? q.meanings.join(', ') : '',
        from_stage: STATE_TO_CROP[q.prevMemoryStateKey] ?? null,
        to_stage: STATE_TO_CROP[q.nextMemoryStateKey] ?? 'sprout',
      }));

      /*
        ①③⑧⑨ 밭 성장 — 예전의 네 장(작물이 자랐어요 · 새싹이 돋았어요 · 되살렸어요 · 황금 당근)을
        한 장으로 합친다. 넷 중 하나라도 해당되면 뜨고, 자리는 맨 앞(예전 ①)이다.
        '자란 작물'은 농장 요약이 없을 때만 기존 암기 상태 상승 집계로 채운다(둘은 같은 사실을
        말하므로 함께 쓰지 않는다). 같은 단어는 한 번만 센다 — buildGrowthEntries 가 거른다.
      */
      const growthEntries = buildGrowthEntries({
        grownRows: [...goldenList, ...sproutedList, ...(grownList.length > 0 ? grownList : improvedRows)],
        rescuedRows: rescuedList,
        metaOfRow,
      });
      if (growthEntries.length > 0) {
        screens.push({ type: 'farmGrowth', data: { entries: growthEntries } });
      }

      // ② 씨앗 심기 — 새 씨앗 심기(plant)는 마지막 결과 화면이 "새로 심은 씨앗" 목록을 직접 보여준다.
      //    농장 돌보기·일반 학습 등 그 외 세션에서는 새 단어가 섞여 있어도 심기 슬라이드를 띄우지 않는다.

      // ④ 보석
      if (result.gem && result.gem.after > result.gem.before) {
        screens.push({
          type: 'gem',
          // before/after — 헤더 잔액 칩이 이 값에서 출발해 하나씩 오른다
          data: { gemCount: result.gem.after - result.gem.before, before: result.gem.before, after: result.gem.after }
        });
      }

      // ⑤⑥⑦ 농장 아이템 — 종류마다 한 장. 한 화면에 모아 두면 영수증이 된다(시안 §3).
      //     삽은 여러 개일 때만 어느 단어에서 왔는지, 보호권은 항상 주간 지급분이라고 적는다.
      [FARM_ITEMS.SHOVEL, FARM_ITEMS.NUTRIENT, FARM_ITEMS.SHIELD].forEach((itemKey) => {
        const qty = farmRewards?.[itemKey] ?? 0;
        if (qty <= 0) return;
        const why = itemKey === FARM_ITEMS.SHIELD ? '이번 주 지급분이에요' : null;
        screens.push({ type: 'farmItem', data: { itemKey, qty, why } });
      });

      /*
        ⑩ 연속 학습 — 오늘 5개 정답 문턱을 '이 세션에서 처음' 넘겼을 때만(기획 11.1, 하루 1회).

        예전에는 `farmStreak?.today_done` (항상 undefined — /farm/session-summary 의 streak 는
        {current, milestone}뿐이라 이 필드를 준 적이 없다) 이 폴백으로 넘어가 매 세션의
        정답 수(farm.correct ?? correctCnt) >= 5 를 그대로 썼다. 보통 세션 하나가 5문항을
        넘기므로 사실상 매번 참이 되어, 연속 기록이 있는 사용자에게는 학습을 끝낼 때마다
        이 슬라이드가 떴다. `streakSummary.qualifiedNow` 는 오늘 문턱을 처음 넘긴 그 순간의
        /study/log 응답(streak_v2.record_correct_word)에서만 true 라 세션당 정확히 하루 1회다.
      */
      if ((farmStreak?.current ?? streakSummary?.current ?? 0) > 0 && streakSummary?.qualifiedNow) {
        /*
          홈과 같은 "1주 불꽃 달력"(WeekStreakStrip)을 그리려면 홈과 같은 근원인
          /farm/today-tasks.week(all/part/shield/none/today_empty)가 필요하다 —
          /farm/session-summary.streak.week는 다른 어휘(studied/protected/missed/future)라
          그대로는 못 쓴다. 방금 끝난 세션이 반영된 "오늘" 상태여야 하므로 여기서 새로 받는다
          (StatsContext 캐시를 쓰지 않는 이유 — 홈 탭은 이 세션 도중 재조회되지 않았을 수 있다).

          순서 — 위에서 이미 await한 updateUserHistory(POST /mainpage/user_study_history)가
          오늘 CheckIn(daily_mission_complete/streak_qualified)을 세션 안에서 동기로 확정하므로,
          그 뒤인 지금 호출하면 오늘 칸이 이미 이번 세션 결과를 반영한 값으로 온다.
          실패해도 화면은 깨지지 않는다 — week가 null이면 아래 렌더가 스켈레톤을 보여준다.
        */
        let week = null;
        try {
          const todayTasksRes = await getFarmTodayTasksApi();
          if (todayTasksRes?.code === 200) week = todayTasksRes.data?.week ?? null;
        } catch (e) { /* 실패 — week 없이 진행(아래 렌더가 스켈레톤으로 대체) */ }

        screens.push({
          type: 'farmStreak',
          data: {
            current: farmStreak?.current ?? streakSummary?.current,
            week,
          },
        });
      }

      // 메인 화면 동기부여 멘트용 — 방금 학습 결과 캐시 (게스트는 홈 진입 전이라 생략)
      if (!isGuest && typeof setLastSessionResult === 'function') {
        setLastSessionResult({
          totalCnt:        testQuestions.length,
          correctCnt,
          incorrectCnt,
          improvedCount:   improvedWords.length,
          decreasedCount:  decreasedWords.length,
          newLearnedCount: newWordCount,
          completedAt:     Date.now(),
        });
      }

      /*
        시안 순서표에 없는 기존 슬라이드 — 콤보(AI 추천 전용).
        출석(토끼 + "오늘도 출석 완료!") 슬라이드는 2026-09-28 제거 — ⑩ 연속 학습(farmStreak)
        슬라이드와 같은 사실("오늘 학습해서 출석/연속 기록이 이어졌다")을 중복으로 알렸다.
        result.attend 자체(서버 출석 처리·보석 지급)는 그대로 두고, 화면에만 안 그린다
        (출석왕 업적은 result.goals 로 따로 온다 — 여기 안 지워도 영향 없음).

        콤보 슬라이드는 '이 세션에서 최고 기록을 실제로 갱신했을 때만' 보여준다(동률 제외).
        comboSummary.bestUpdated 는 Main.jsx 의 isComboRecordEvent(핵심 판정: 백엔드
        combo.py apply_answer 의 events.best_updated — 엄격 초과만 true, 동률/최고 기록
        미달은 false)를 세션 동안 누적한 값으로, 콤보 위기 팝업 노출 여부와 같은 판정을 공유한다.
      */
      if (testType === 'quick' && comboSummary?.bestUpdated) {
        screens.push({
          type: 'combo',
          data: comboSummary,
        });
      }

      // ⑪ 데일리 목표 슬라이드(토끼 + "오늘 농장을 다 돌봤어요!")는 2026-09-29 QA로 제거 —
      // ⑩ 연속 학습(farmStreak) 슬라이드와 같은 "오늘 학습을 끝냈다"는 사실을 중복으로 알렸다.
      // result.daily_mission_complete 자체(서버 데일리 미션 처리·보석 지급)는 그대로 두고 화면에만 안 그린다.

      // ⑫ 업적 — 달성마다 한 장
      if (result.goals && result.goals.length > 0) {
        result.goals.forEach((goal) => {
          screens.push({
            type: 'achievement',
            data: { goal }
          });
        });
      }

      // ⑬ 최종 결과 (항상 마지막)
      // plant(새 씨앗 심기)는 채점 결과(점수·정답 수·O/X)를 보여주지 않는다 — 새로 심은
      // 씨앗 목록만 담는다. 서버 세션 요약(farm.planted)을 받았다면 그것이 정본(오답만 있던
      // 단어는 심기지 않는다), 못 받았으면(요약 조회 실패) 이번 세션 단어 전체로 대신한다.
      let plantRows = null;
      if (testType === 'plant') {
        const seen = new Set();
        const sessionWordRows = [];
        testQuestions.forEach((q) => {
          const id = q.vocaIndexId ?? q.id;
          if (id == null || seen.has(id)) return;
          seen.add(id);
          sessionWordRows.push({
            user_voca_id: id,
            word: q.origin,
            meaning: Array.isArray(q.meanings) ? q.meanings.join(', ') : '',
          });
        });
        plantRows = farm ? plantedList : sessionWordRows;
      }
      screens.push({
        type: 'result',
        data: { plantRows }
      });

      setScreenList(screens);
      setCurrentScreenIndex(0); // 첫 번째 화면부터 시작

    } catch (err) {
      console.error('학습 결과 화면 구성 오류:', err);
    }
  }

  const handleNextScreen = () => {
    if (currentScreenIndex < screenList.length - 1) {
      setCurrentScreenIndex(currentScreenIndex + 1);
    }
  }

  // 예전 규격 슬라이드(연속 기록 · 새로 심은 씨앗)가 화면에 뜨는 순간의 손맛 큐.
  // 새 연출 슬라이드(밭 성장 · 보석 · 아이템 · 업적 · 콤보)는 여기서 울리지 않는다 — 각 슬라이드가
  // 화면의 임팩트 프레임에 맞춰 직접 울린다(rewards/ 각 파일 머리의 시간표).
  useEffect(() => {
    const type = screenList[currentScreenIndex]?.type;
    if (type === 'farmStreak') {
      haptic('success');
    } else if (type === 'farmPlanted') {
      feel('progress');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScreenIndex, screenList]);

  useEffect(() => {
    if (recentStudy && recentStudy[testType] && recentStudy[testType].status === "learning") {
      navigate('/home');
    }
  }, [isRecentStudyLoading]);

  /*
    ── 다음 학습 (넷플릭스 '다음화 자동 재생') ──────────────────────────────
    방금 끝난 학습과 같은 종류의 새 세션을 연다(무엇을 여는지는 utils/nextStudy.js 주석).
    예전 "테스트 다시 하기"는 **같은 문제를 섞어서 다시** 푸는 것이었다 — 방금 푼 단어를
    곧바로 또 보는 건 복습 간격(FSRS)으로도 의미가 적어, 새 추천 세트로 바꿨다.

    카운트다운(8초)은 결과 **마지막 슬라이드**(result)에서만 돈다.

    【2026-09-27 실기기 피드백 — "타이머가 지나갔는데 안 넘어간다"】 규칙을 바꿨다.
      · 스크롤·휠·손가락 올림(pointerdown)만으로는 멈추지 않는다. 예전에는 결과 목록의
        pointerdown / scroll / wheel 을 전부 취소로 봤는데, 안드로이드 WebView 는 사용자가
        의도하지 않아도 스크롤 이벤트를 내는 경우(뷰포트·상태 바 높이 보정, 목록 그림 로드로
        인한 높이 변화, 화면을 잡고만 있어도 나는 pointerdown)가 있어 조용히 취소됐다.
      · **명시적인 탭**(누른 자리에서 10px 안에서 떼고, 700ms 안) 만 멈춤으로 본다 —
        결과 카드의 발음 버튼·단어 탭도 탭이므로 멈춘다. 스크롤 제스처는 브라우저가
        pointercancel 을 보내거나 이동거리가 커서 탭이 아니다.
      · 버튼 줄 위 안내 줄(NextStudyNotice)의 `멈추기` 를 누르면 멈춘다. 버튼은 어디를 눌러도 즉시 시작.
      · 앱이 백그라운드로 가면(visibilitychange hidden / pagehide) **일시정지**, 돌아오면 남은
        시간부터 이어 센다. WebView 가 visible 을 놓치는 경우를 대비해 멈춘 동안 1초마다 실제
        visibilityState 를 다시 본다.
      · "학습 종료" — 즉시 멈춘 뒤 홈.
    다 세면 반드시 다음 학습을 연다 — 실패 원인별 처리는 startNextStudy 주석.
    한 번 멈추면 이 화면에서는 다시 돌지 않는다 — 그다음은 사람이 버튼으로 정한다.
  */
  const livePlan = planNextStudy({
    testType,
    isGuest,
    config: state?.studyConfig ?? loadStudyConfig(testType),
    vocabularySheets,
  });
  // 카운트를 시작한 순간의 계획을 고정한다 — 세는 중에 단어장 재조회(결과 저장 뒤 fetch)로
  // vocabularySheets 가 잠깐 비거나 바뀌어도, 약속한 "다음 학습"이 사라지거나 바뀌지 않게.
  const [frozenPlan, setFrozenPlan] = useState(null);
  const nextPlan = frozenPlan ?? livePlan;
  const isResultScreen = screenList[currentScreenIndex]?.type === 'result';
  /*
    자유 설정 테스트(학습 탭 'test' · 단어장 상세 'exam')는 "자동 다음 학습 진행"(카운트다운 →
    자동 시작)을 켜지 않는다 — 2026-09-29 QA. 사용자가 직접 고른 설정(단어장·단계·유형·개수)을
    매번 확인 없이 자동으로 또 돌리면 의도와 다른 세트가 계속 이어질 수 있다. 일반 추천 학습
    ('quick' — 홈 주 CTA)만 넷플릭스 '다음화'처럼 자동으로 이어간다.
    "다음 학습" 버튼 자체도 두지 않는다(같은 날 QA) — 하단은 "학습 종료" 하나뿐이다.
  */
  // plant(새 씨앗 심기)·script(글자 학습)도 자유 설정 테스트와 같은 취급 — 자동 다음 학습·
  // 다음 학습 버튼 없음(다음에 심을 단어/배울 줄은 각각 홈 "오늘 할 일" 카드·학습장 "글자"
  // 탭에서 다시 고른다. planNextStudy도 이 값들을 인식하지 못해 이미 available:false를
  // 반환하지만, 여기 명시해 두 판정이 갈리지 않게 한다).
  const isFreeTest = testType === 'test' || testType === 'exam' || testType === 'plant' || testType === 'script';
  // idle(아직 안 셈) → counting ⇄ paused(백그라운드) → stopped(사용자가 멈춤) / starting / failed
  const [countdownPhase, setCountdownPhase] = useState('idle');
  const [remainingSec, setRemainingSec] = useState(Math.ceil(NEXT_STUDY_COUNTDOWN_MS / 1000));
  // 링 구간 — 이어 셀 때마다 key 를 바꿔 새로 그린다(from: 시작 비율, runSec: 남은 초)
  const [ringSeg, setRingSeg] = useState({ key: 0, from: 1, runSec: NEXT_STUDY_COUNTDOWN_MS / 1000 });
  const [nextNotice, setNextNotice] = useState(null);
  const deadlineRef = useRef(0);
  const remainingMsRef = useRef(NEXT_STUDY_COUNTDOWN_MS);
  // 타이머·이벤트 콜백이 읽는 현재 단계 — 단계를 바꾸는 곳에서 state 와 함께 적는다
  const phaseRef = useRef('idle');
  const startingRef = useRef(false);
  const recentStudyRef = useRef(recentStudy);
  const planRef = useRef(nextPlan);
  const showRing = (countdownPhase === 'counting' || countdownPhase === 'paused') && nextPlan.available;
  const counting = countdownPhase === 'counting' && nextPlan.available;

  const debugLog = (...args) => {
    // 실기기 원인 추적용 — 콘솔(WebView 원격 디버깅)에서 흐름을 볼 수 있게 남긴다
    console.info('[StudyResult/next]', ...args);
  };

  // 사용자가 명시적으로 멈춤 — 한 번 멈추면 다시 돌지 않는다
  const stopCountdown = (why) => {
    const phase = phaseRef.current;
    if (phase !== 'counting' && phase !== 'paused' && phase !== 'idle') return;
    debugLog('stop', why);
    phaseRef.current = 'stopped';
    setCountdownPhase('stopped');
  };

  const beginSegment = (remainingMs) => {
    deadlineRef.current = Date.now() + remainingMs;
    remainingMsRef.current = remainingMs;
    setRemainingSec(Math.max(1, Math.ceil(remainingMs / 1000)));
    setRingSeg((prev) => ({ key: prev.key + 1, from: remainingMs / NEXT_STUDY_COUNTDOWN_MS, runSec: remainingMs / 1000 }));
    phaseRef.current = 'counting';
    setCountdownPhase('counting');
  };

  const pauseCountdown = (why) => {
    if (phaseRef.current !== 'counting') return;
    const left = Math.max(0, deadlineRef.current - Date.now());
    remainingMsRef.current = left;
    debugLog('pause', why, left);
    setRingSeg((prev) => ({ key: prev.key + 1, from: left / NEXT_STUDY_COUNTDOWN_MS, runSec: left / 1000 }));
    phaseRef.current = 'paused';
    setCountdownPhase('paused');
  };

  /*
    다음 학습 시작. 자동(카운트 끝)이든 손으로 눌렀든 여기서 조용히 멈추지 않는다.
      · 계획이 없음(단어 부족 등) → 이유를 버튼 위에 보여 주고 멈춘다(failed).
        같은 설정을 복원하지 못한 경우는 nextStudy.js 가 이미 AI 추천(quick)으로 바꿔 준다.
      · 끝난 회차(status end) 비우기가 실패·지연(5초) → 로컬 상태만 비우고 그대로 들어간다.
        TakeTest 는 status 가 end 가 아니면 새 세션을 만들며 그때 서버에 learning 으로 덮어쓴다.
        예전에는 여기서 실패하면 cancelled 로 조용히 멈췄다(링만 사라지고 아무 일도 없음).
      · AI 추천으로 대신 가는데 추천 쪽에 하던 회차(learning)가 있으면 지우지 않고 이어서 연다.
  */
  const startNextStudy = async (source = 'manual') => {
    if (startingRef.current) return;
    const plan = planRef.current;
    if (!plan?.available || !plan.state) {
      debugLog('start: no plan', source, plan?.reason);
      setNextNotice(plan?.reason || '지금은 다음 학습을 준비하지 못했어요');
      phaseRef.current = 'failed';
      setCountdownPhase('failed');
      return;
    }
    startingRef.current = true;
    phaseRef.current = 'starting';
    setCountdownPhase('starting');
    debugLog('start', source, plan.state.testType, plan.fallback ?? '');
    // 효과음 unlock — 손으로 누른 경우에만 실제로 걸린다(자동 시작은 제스처가 없어 무해한 호출)
    primeSfx();
    const target = plan.state.testType;
    const slot = recentStudyRef.current?.[target];
    const resumeOther = target !== testType && slot?.status === 'learning' && slot?.study_data?.length > 0;
    if (!resumeOther) {
      // 끝난 회차(status end)를 비워야 TakeTest 가 새 세션을 만든다(end 면 결과로 되돌려 보낸다)
      const reset = {
        ...(slot ?? {}),
        progress_index: null,
        type: target,
        status: null,
        study_data: null,
        updated_at: null,
        created_at: null,
      };
      let saved = null;
      try {
        saved = await Promise.race([
          updateUserRecentStudyDataApi({ curRecentStudy: reset }),
          new Promise((resolve) => setTimeout(() => resolve('timeout'), 5000)),
        ]);
      } catch (e) {
        saved = null;
      }
      if (saved && saved !== 'timeout' && saved.code == 200 && saved.data) {
        updateRecentStudyState({ [target]: saved.data });
      } else {
        console.warn('[StudyResult] 끝난 회차 비우기 실패 — 로컬만 비우고 진행:', saved === 'timeout' ? 'timeout' : saved?.code);
        updateRecentStudyState({ [target]: reset });
      }
    }
    navigate('/take-test', { state: plan.state, replace: true });
  };
  // 타이머 콜백이 늘 최신 함수·값을 쓰게(렌더 중 ref 쓰기는 React Compiler 가 막으므로 커밋 뒤에 맞춘다)
  const startRef = useRef(startNextStudy);
  useEffect(() => {
    startRef.current = startNextStudy;
    planRef.current = nextPlan;
    recentStudyRef.current = recentStudy;
  });

  // 마지막 슬라이드에 도착하면 센다 — 앞 슬라이드를 보는 중에는 시작하지 않는다
  useEffect(() => {
    if (!isResultScreen || !statsDone || !livePlan.available || countdownPhase !== 'idle' || isFreeTest) return;
    setFrozenPlan(livePlan);
    if (livePlan.fallback === 'quick') setNextNotice('이전 설정을 찾지 못해 AI 추천으로 이어가요');
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      // 백그라운드에서 도착 — 처음부터(8초) 멈춰 두었다가 돌아오면 센다
      remainingMsRef.current = NEXT_STUDY_COUNTDOWN_MS;
      phaseRef.current = 'paused';
      setCountdownPhase('paused');
      debugLog('arrive hidden → paused');
      return;
    }
    debugLog('begin');
    beginSegment(NEXT_STUDY_COUNTDOWN_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isResultScreen, statsDone, livePlan.available, countdownPhase]);

  // 세기 — interval(숫자 갱신) + 마감 시각 setTimeout(백업) 둘 다 마감을 확인한다
  useEffect(() => {
    if (!counting) return undefined;
    let fired = false;
    const check = () => {
      if (fired || phaseRef.current !== 'counting') return;
      const left = deadlineRef.current - Date.now();
      if (left <= 0) {
        fired = true;
        setRemainingSec(0);
        debugLog('deadline reached');
        startRef.current('auto');
        return;
      }
      setRemainingSec(Math.ceil(left / 1000));
    };
    const id = setInterval(check, 200);
    const to = setTimeout(check, Math.max(0, deadlineRef.current - Date.now()) + 30);
    return () => { clearInterval(id); clearTimeout(to); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counting, ringSeg.key]);

  // 백그라운드 — 일시정지 후 돌아오면 이어서(취소 아님)
  useEffect(() => {
    if (!showRing) return undefined;
    const resumeIfVisible = (why) => {
      if (phaseRef.current !== 'paused' || document.visibilityState !== 'visible') return;
      debugLog('resume', why, remainingMsRef.current);
      if (remainingMsRef.current <= 0) {
        startRef.current('auto-resume');
        return;
      }
      beginSegment(remainingMsRef.current);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') pauseCountdown('visibilitychange');
      else resumeIfVisible('visibilitychange');
    };
    const onPageHide = () => pauseCountdown('pagehide');
    const onPageShow = () => resumeIfVisible('pageshow');
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', onPageShow);
    // WebView 가 visible 이벤트를 놓쳐도 멈춘 채로 남지 않게
    const poll = setInterval(() => resumeIfVisible('poll'), 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('focus', onPageShow);
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRing]);

  /*
    명시적 탭 판정 — 결과 화면 전체(하단 버튼 영역 제외)에서.
    pointerdown 이 이 화면 안에서 시작돼야 한다(앞 슬라이드 "확인" 탭의 나머지 이벤트는 무시).
    pointerup(10px 안·700ms 안) 또는 click 중 먼저 오는 쪽으로 멈춘다(둘 다 와도 한 번).
    스크롤로 이어진 제스처는 pointercancel 이 오거나 이동거리가 커서 탭이 아니다.
  */
  const tapRef = useRef(null);
  const TAP_SLOP = 10;
  const inCtaArea = (e) => !!e.target?.closest?.('[data-result-cta]');
  const tapHandlers = {
    onPointerDownCapture: (e) => {
      if (inCtaArea(e) || (e.pointerType === 'mouse' && e.button !== 0)) { tapRef.current = null; return; }
      tapRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: Date.now(), moved: false };
    },
    onPointerMoveCapture: (e) => {
      const t = tapRef.current;
      if (!t || t.id !== e.pointerId) return;
      if (Math.hypot(e.clientX - t.x, e.clientY - t.y) > TAP_SLOP) t.moved = true;
    },
    onPointerCancelCapture: () => { tapRef.current = null; },
    onScrollCapture: () => { if (tapRef.current) tapRef.current.moved = true; },
    onPointerUpCapture: (e) => {
      const t = tapRef.current;
      if (!t || t.id !== e.pointerId) return;
      const isTap = !t.moved
        && Math.hypot(e.clientX - t.x, e.clientY - t.y) <= TAP_SLOP
        && Date.now() - t.t <= 700;
      t.done = true;
      if (isTap) stopCountdown('tap');
    },
    onClickCapture: (e) => {
      // 통계 카드 연출 중 화면을 탭하면 남은 카드를 바로 보여 준다(하단 버튼 영역은 제외)
      if (!inCtaArea(e)) statsSkipRef.current?.();
      const t = tapRef.current;
      if (!t || inCtaArea(e) || t.moved) return;
      stopCountdown('click');
    },
  };

  const onClickEndStudy = async () => {
    stopCountdown('end');
    // 게스트 첫 학습: 결과 확인 후 온보딩 질문 구간으로 (심은 답안은 guestStorage에 저장됨).
    // 예고 화면(ready)이 아니라 그다음으로 보낸다 — 학습을 마친 사람을 예고로 되돌리면
    // 같은 학습을 다시 하게 된다.
    if (isGuest) {
      navigate('/onboarding', { state: { step: 'channel' }, replace: true });
      return;
    }
    // 글자 학습은 학습장 '글자' 탭에서만 들어온다 — 홈이 아니라 그 탭으로 돌려보낸다
    // (결과 화면은 /take-test를 replace로 대체해 history가 짧을 수 있어 -1 대신 명시 경로).
    if (testType === 'script') {
      navigate('/vocabulary-sheets', { state: { tab: 'script' }, replace: true });
      return;
    }
    navigate('/home');
  }

  // 화면별 렌더링
  const renderScreenContent = () => {
    if (screenList.length === 0 || currentScreenIndex >= screenList.length) return null;

    const currentScreen = screenList[currentScreenIndex];
    if (!currentScreen) return null;

    // 학습 결과 화면 (마지막 화면)
    if (currentScreen.type === 'result') {
      const totalQuestions = testQuestions.length;
      const correctQuestions = testQuestions.filter(q => q.isCorrect).length;
      const score = Math.round((correctQuestions / totalQuestions) * 100);

      return (
        <motion.div
          key={currentScreenIndex}
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '-100%', opacity: 0 }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 30,
            duration: 0.5
          }}
          className='relative flex flex-col h-[100dvh] bg-layout-white dark:bg-layout-black'
          // 결과 화면을 명시적으로 탭하면 자동 시작을 멈춘다(스크롤은 멈추지 않는다) — tapHandlers 주석
          {...tapHandlers}
        >
          <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
          <div className='
            relative
            flex items-end justify-center
            w-full h-[55px]
            px-[16px] py-[14px]
          '>
            <div className="center">
              <h2 className='text-[18px] font-[700] leading-[21px]'>
                학습 결과
              </h2>
            </div>
          </div>

          {/* 아래 여백은 떠 있는 버튼 자리(52+18+26=96)보다 조금 넉넉하게 — 마지막 줄이 가리지 않도록 */}
          <div
            data-testid="result-scroll"
            className={`relative isolate z-0 flex flex-col flex-1 overflow-y-auto scrollbar-hide ${showRing ? 'pb-[160px]' : (nextNotice || nextPlan.reason) ? 'pb-[140px]' : 'pb-[110px]'}`}
          >
            {currentScreen.data?.plantRows ? (
              /* 새 씨앗 심기 결과 — 채점(점수·정답 수·O/X) 없이 새로 심은 씨앗만 보여준다 */
              <PlantReveal
                rows={currentScreen.data.plantRows}
                metaOfRow={metaOfRow}
                reducedMotion={reducedMotion}
                onDone={() => setStatsDone(true)}
                skipRef={statsSkipRef}
              />
            ) : (
            <>
            {/* 통계 카드 — 정답률 / 맞힌 단어 / 틀린 단어(이 화면에 원래 있던 값만) */}
            <ResultStatCards
              reducedMotion={reducedMotion}
              onDone={() => setStatsDone(true)}
              skipRef={statsSkipRef}
              cards={[
                { label: '정답률', value: Number.isFinite(score) ? score : 0, suffix: '%', tone: 'primary' },
                { label: '맞힌 단어', value: correctQuestions, suffix: '개', total: totalQuestions, tone: 'success' },
                { label: '틀린 단어', value: Math.max(0, totalQuestions - correctQuestions), suffix: '개', tone: 'error' },
              ]}
            />

            {/* 단어 목록 영역 */}
            <div className='flex flex-col gap-[10px] px-[20px]'>
              {(() => {
                // cardMatch/cardMatchListening은 여러 단어를 한 세트로 묶어 출제하므로
                // 결과 화면에서는 세트 안의 단어들을 각 카드로 펼쳐서 렌더한다.
                const flat = [];
                testQuestions.forEach((question) => {
                  if (Array.isArray(question.words) && question.words.length > 0) {
                    question.words.forEach((w) => {
                      flat.push({ ...w, isCorrect: question.isCorrect });
                    });
                  } else {
                    flat.push(question);
                  }
                });
                return flat.map((item, index) => {
                  const meaningsArr = Array.isArray(item.meanings) ? item.meanings : [];
                  // [상태(작물)][단어·뜻][정답/오답] 순서 — 단어장 단어 목록(WordRow)과 같은 배치다
                  // (2026-09-27, 예전에는 채점 표시가 왼쪽·작물이 오른쪽이었다).
                  //
                  // 예전에는 cropOfWord가 null이면 암기 상태 텍스트 배지("단기암기" 등)로
                  // 돌아갔다. 그런데 그 null은 "농장 요약을 못 받아서"가 아니라 "이 단어는
                  // 이번 세션에 farm 단계가 안 바뀌어서"였다 — cropOfWord가 세션 요약(delta)에
                  // 없으면 FSRS 암기 상태 버킷으로 한 번 더 찾아보고, 그래도 없으면 이 화면의
                  // 전제(전부 학습을 끝낸 단어)를 살려 최소값인 '심은 씨앗'으로 그린다.
                  // 그 결과 같은 목록에서 어떤 행은 텍스트 배지, 어떤 행은 작물 그림으로
                  // 갈리던 것을 전부 작물 그림으로 통일한다.
                  const crop = cropOfWord(item) ?? 'PLANTED_SEED';
                  // 다음 복습까지 일수 — 세션 중 받은 /study/log 응답의 fsrs.next_review(Main 이 문제
                  // 객체에 덮어 둔 정본), 응답을 못 받은 자리(게스트 등)는 채점 시 고정한 displayNextReview.
                  const nextReviewDays = calendarDaysFromToday(item.fsrs?.next_review ?? item.displayNextReview ?? null);
                  return (
                    <motion.div
                      key={`${item.id ?? 'q'}-${index}`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 1.5 + Math.min(index, 12) * 0.06 }}
                      onClick={() => handleOpenWordDetail(item)}
                      className={`
                        relative
                        flex flex-col gap-[10px]
                        px-[16px] py-[14px]
                        rounded-[12px] cursor-pointer
                        ${item.isCorrect ? 'bg-status-success-100 dark:bg-status-success-dark' : 'bg-status-error-50 dark:bg-status-error-dark'}
                      `}
                    >
                      {/* 우측 상단 — 다음 복습 예정일("9일 뒤 복습"). 학습 화면 문제 카드의
                          StudyTimingTag 와 같은 컴포넌트·같은 위치 규칙(top 12 / right 14)이다.
                          세션이 끝난 뒤라 재출제가 없으므로 오답 단어도 예정일을 보여 준다.
                          글자(testType='script')는 복습 예정일 개념이 없다(사용자 결정
                          2026-09-30 — 작물 성장(XP·단계)만 있음) — 이 태그를 아예 숨긴다. */}
                      {testType !== 'script' && (
                        <StudyTimingTag answered wasCorrect={null} daysToReview={nextReviewDays} pending={false} />
                      )}
                      <div className='flex items-center gap-[11px]'>
                        {/* ① 상태 — 작물 그림. 단어장 단어 목록(vocabularySheets/WordRow)과 같은 자리(왼쪽)다.
                            텍스트 배지 분기는 없앴다(위 crop 계산 주석 참고). */}
                        <CropImage stage={crop} size={52} align="center" className='flex-shrink-0' />

                        {/* ② 단어·뜻 */}
                        <div className='flex flex-col flex-1 gap-[2px] min-w-0'>
                          <div className="flex items-center gap-[6px] min-w-0">
                            <h3 lang={isJa(wordLang(item)) ? 'ja' : undefined} className="text-[15px] font-[700] text-layout-black dark:text-layout-white truncate">
                              {item.origin}
                            </h3>
                            {shouldShowReading(item) && (
                              <span lang="ja" className="shrink-0 truncate text-[11px] font-[500] text-layout-gray-300">
                                {getReading(item)}
                              </span>
                            )}
                            <SpeakerButton text={item.origin} lang={wordLang(item)} size={15} label="단어 발음 듣기" />
                          </div>
                          <p className="text-[11.5px] font-[400] text-layout-gray-400 dark:text-layout-gray-50 truncate">
                            {meaningsArr.join(', ')}
                          </p>
                        </div>

                        {/* ③ 채점 결과 — 오른쪽. 우측 상단 복습 예정일 태그(top 12)와 겹치지 않게
                            태그가 실제로 떠 있을 때만(글자 세션은 태그 자체를 숨긴다 — 위 testType
                            분기) 그 높이만큼 내린다. 태그가 없는데도 내리면 O/X만 카드 세로 중앙에서
                            아래로 쏠려 보인다(2026-09-30 실기기 QA). */}
                        <span className={`flex items-center justify-center flex-shrink-0 w-[22px] h-[22px] ${testType !== 'script' ? 'mt-[14px]' : ''}`}>
                          {item.isCorrect ? (
                            <Circle size={20} weight="bold" className='text-status-success-500' />
                          ) : (
                            <X size={20} weight="bold" className='text-status-error-500' />
                          )}
                        </span>
                      </div>
                    </motion.div>
                  );
                });
              })()}
            </div>
            </>
            )}
          </div>
          {/* 하단 — 왼쪽 "학습 종료", 오른쪽 "다음 학습"(8초 뒤 자동 시작).
              다음 학습을 열 수 없으면(단어 부족) 이유 한 줄 + "학습 종료"만 주 버튼으로 둔다.
              게스트는 가입 흐름으로 이어지는 "계속하기" 하나뿐이다. */}
          {/* 【z-index】 목록 카드의 복습 예정일 태그(StudyTimingTag)는 `absolute z-[2]` 인데,
              카드(motion.div)는 애니메이션이 끝나면 transform 이 풀려 쌓임 맥락을 만들지 않는다.
              그래서 태그의 z-2 가 화면 전체 기준으로 올라가 z 가 없던(auto) 이 버튼 영역 위에 그려졌다.
              목록 스크롤 영역은 `isolate` 로 가두고, 버튼 영역은 z-20 으로 확실히 위에 둔다.
              위쪽 20px 페이드는 목록이 버튼 뒤로 '잘려' 보이지 않고 스며들게 한다. */}
          <div
            data-result-cta
            aria-disabled={!statsDone}
            className={`absolute bottom-0 left-0 right-0 z-20 bg-layout-white dark:bg-layout-black transition-opacity duration-300 ${statsDone ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}
          >
            <div aria-hidden className='pointer-events-none absolute left-0 right-0 bottom-full h-[20px] bg-gradient-to-t from-layout-white dark:from-layout-black to-transparent' />
            {!isFreeTest && (nextNotice || nextPlan.reason) ? (
              <p className='px-[24px] pt-[14px] -mb-[6px] text-center text-[12px] font-[500] text-layout-gray-300'>
                {nextNotice || nextPlan.reason}
              </p>
            ) : null}
            <NextStudyNotice
              show={showRing}
              remainingSec={remainingSec}
              reducedMotion={reducedMotion}
              onStop={() => { haptic('light'); stopCountdown('notice'); }}
            />
            <ResultCtaBar>
              {nextPlan.available && !isFreeTest ? (
                <>
                  <ResultCta
                    secondary
                    className="flex-1"
                    label="학습 종료"
                    onClick={() => { haptic('light'); onClickEndStudy(); }}
                  />
                  <NextStudyCta
                    className="flex-1"
                    showRing={showRing}
                    ring={{ ...ringSeg, remainingSec, running: counting }}
                    reducedMotion={reducedMotion}
                    onStart={() => { haptic('light'); startNextStudy('manual'); }}
                  />
                </>
              ) : (
                <ResultCta
                  className="flex-1"
                  label={isGuest ? '계속하기' : '학습 종료'}
                  onClick={() => { haptic('light'); onClickEndStudy(); }}
                />
              )}
            </ResultCtaBar>
          </div>
        </motion.div>
      );
    }


    // 나머지 화면들 — 시안 §1 규격(그림 100px + 한 줄 + 확인 버튼)을 공유한다
    // 목록 슬라이드는 가운데 정렬도 배경 오로라도 쓰지 않는다(LIST_SLIDE_TYPES 주석 참고)
    const isListSlide = LIST_SLIDE_TYPES.has(currentScreen.type);
    // farmStreak(연속 학습)는 목록 슬라이드는 아니지만 이제 마스코트 그림이 없어
    // 뒤 글로우도 함께 뺀다(2026-09-28 피드백 4차) — 아래 배경 분기에서 같이 검사한다.
    const noGlow = isListSlide || currentScreen.type === 'farmStreak';
    // 새 연출 슬라이드(rewards/) — 각자 빛과 시간표를 가진다. 슬라이드가 바뀌면 껍데기의 본문이 통째로 새로 마운트된다.
    const isScene = SCENE_SLIDE_TYPES.has(currentScreen.type);
    const sceneProps = {
      reducedMotion,
      skipRef: sceneSkipRef,
      onReady: () => setSceneReadyIndex(currentScreenIndex),
    };
    let content = null;

    if (currentScreen.type === 'farmPlanted') {
      // 새로 심은 씨앗 — 어떤 단어를 심었는지까지 보여준다
      const items = currentScreen.data.items ?? [];
      content = (
        <FarmListSlide
          /* 봉투(unplanted)가 아니라 낱알(PLANTED_SEED)이다 — 방금 심은 씨앗이므로.
             crop 키 'seed' 를 넘기면 두 상태가 합쳐진 값이라 봉투가 나온다(CropImage 주석). */
          art={<FarmCropArt stage="PLANTED_SEED" alt="새로 심은 씨앗" />}
          line={<>처음 배운 <strong className='text-primary-main-600'>{items.length}개</strong>를 씨앗으로 심었어요!</>}
          rows={items.map((row) => (
            <FarmGrowRow
              key={row.user_voca_id}
              /* 왼쪽 그림은 **지금 상태**다. 심었으니 낱알. */
              crop="PLANTED_SEED"
              word={row.word}
              meaning={row.meaning}
              meta={metaOfRow(row)}
              right="새로 심었어요"
            />
          ))}
        />
      );
    } else if (currentScreen.type === 'farmGrowth') {
      // ①③⑧⑨ 밭 성장 — 자람 · 새싹 · 되살림 · 황금 당근을 밭 한 판에서 차례로 키운다
      content = <FarmGrowthSlide entries={currentScreen.data.entries ?? []} {...sceneProps} />;
    } else if (currentScreen.type === 'farmItem') {
      // ⑤⑥⑦ 농장 아이템 — 종류마다 한 장. 빛기둥에서 떨어져 착지한다
      content = <ItemRewardSlide {...currentScreen.data} {...sceneProps} />;
    } else if (currentScreen.type === 'farmStreak') {
      /*
        ⑩ 연속 학습 — 한 줄 + 홈과 같은 1주 불꽃 달력. 시안에는 아래 한 줄이 없다.
        【2026-09-28 실기기 피드백 4차】 마스코트(토끼) 히어로 그림 + 뒤 핑크 글로우를 뺐다 —
        이 슬라이드는 "며칠째"를 홈과 같은 달력 그림으로 보여주는 화면이지, 보상을 받는
        화면(글로우가 어울리는 자리)이 아니다. 글로우 억제는 아래 렌더(§isListSlide 옆)에서
        currentScreen.type === 'farmStreak' 도 같이 검사한다.
      */
      const { current, week } = currentScreen.data;
      const weekCells = buildWeekCells(week);
      content = (
        <div className='relative flex flex-col items-center justify-center gap-[15px] w-full'>
          <motion.p
            className='text-[16px] font-[700] text-center leading-[1.45]'
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.5 }}
          >
            <strong className='text-primary-main-600'>{current}일</strong> 연속으로 농장을 돌봤어요!
          </motion.p>
          <motion.div
            className='w-full'
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.4 }}
          >
            {weekCells.length === 7 ? (
              <WeekStreakStrip cells={weekCells} />
            ) : (
              // week 조회 실패 시(드묾) — 달력 자리 스켈레톤만 남긴다(레이아웃 튐 방지)
              <div className='grid grid-cols-7 gap-[6px]'>
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className='h-[46px] rounded-[12px] bg-layout-gray-50 dark:bg-layout-gray-dark animate-pulse' />
                ))}
              </div>
            )}
          </motion.div>
        </div>
      );
    } else if (currentScreen.type === 'attend') {
      // 출석 (오늘 첫 학습) — 출석 업적 배지처럼 캐릭터를 컬러 원형 배경 위에 올려 표시.
      content = (
        <div className='relative flex flex-col items-center justify-center gap-[15px]'>
          <motion.div
            className='relative w-[100px] h-[100px]'
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.2, 1, 1.1, 1], opacity: 1, y: [0, -8, 0] }}
            transition={{
              scale: { type: "tween", ease: "easeOut", duration: 0.6, times: [0, 0.5, 0.7, 0.85, 1] },
              opacity: { duration: 0.6 },
              y: { delay: 0.8, duration: 2.5, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" },
            }}
          >
            {/* 컬러 원형 배경 (업적 배지와 동일 스타일) */}
            <div
              className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80px] h-[80px] rounded-full'
              style={{ background: 'linear-gradient(135deg, var(--primary-main-600) 0%, #CD8DFF 50%, #74D5FF 100%)' }}
            ></div>
            {/* 캐릭터 — 원 위에 살짝 올라선 형태 */}
            <img
              src={ACHIEVEMENT_IMAGES['출석왕']}
              alt="출석"
              className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[58%] w-[84px] h-[84px] object-contain z-10'
            />
          </motion.div>
          <motion.p
            className='text-[16px] font-[700]'
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            오늘도 <strong className='text-primary-main-600'>출석 완료</strong>!
          </motion.p>
        </div>
      );
    } else if (currentScreen.type === 'combo') {
      // 콤보 신기록 (AI 추천 테스트) — 최고 기록을 갱신했을 때만 만들어진다(위 push 조건 참고).
      // 번개이 솟아올라 자리 잡고 콤보 수가 굴러 올라간다
      content = <ComboRewardSlide maxCombo={currentScreen.data.maxCombo ?? 0} {...sceneProps} />;
    } else if (currentScreen.type === 'achievement') {
      // ⑫ 업적 — 메달 승급
      if (!currentScreen.data.goal) return null;
      content = <AchievementSlide goal={currentScreen.data.goal} {...sceneProps} />;
    } else if (currentScreen.type === 'gem') {
      // ④ 보석 — 쏟아져서 헤더 잔액으로 날아가 쌓인다
      content = <GemRewardSlide {...currentScreen.data} isGuest={isGuest} {...sceneProps} />;
    }

    // 공용 슬라이드 껍데기(rewards/RewardShell) — 고정 헤더 + 진행 점 + 본문 + 확인 버튼.
    // 새 연출 슬라이드는 연출이 끝나야 「확인」이 켜지고, 그 전에 화면을 탭하면 연출을 건너뛴다.
    if (!content) return null;

    return (
      <RewardShell
        slideKey={currentScreenIndex}
        index={currentScreenIndex}
        total={screenList.length - 1}
        ready={!isScene || sceneReadyIndex === currentScreenIndex}
        onSkip={() => sceneSkipRef.current?.()}
        onConfirm={() => { haptic('selection'); handleNextScreen(); }}
      >
        {isScene ? content : (
          <LegacyAuroraStage isListSlide={isListSlide} noGlow={noGlow}>
            {content}
          </LegacyAuroraStage>
        )}
      </RewardShell>
    );
  }

  if (screenList.length === 0) {
    // 학습 결과 API 응답 대기 중 — 깜빡임 방지를 위해 빈 화면 (배경은 다음 화면과 동일하게 프라이머리 톤 유지)
    return <div className='h-[100dvh] bg-primary-main-100 dark:bg-layout-gray-dark' />;
  }

  return (
    <AnimatePresence mode="wait">
      {renderScreenContent()}
    </AnimatePresence>
  );
};

export default StudyResult;
