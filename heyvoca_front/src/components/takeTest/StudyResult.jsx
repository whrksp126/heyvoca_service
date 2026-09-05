import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Circle, X, Flame, Drop } from '@phosphor-icons/react';
import { useVocabulary } from '../../context/VocabularyContext';
import { useUser } from '../../context/UserContext';
import gemImg from '../../assets/images/gem.png';
import ResultItemBackground01 from '../../assets/images/ResultItemBackground01.svg';
import ResultItemBackground02 from '../../assets/images/ResultItemBackground02.svg';
import { vibrate } from '../../utils/osFunction';
import { warmTts } from '../../api/tts';
import MemorizationStatus from '../common/MemorizationStatus';
import SpeakerButton from '../common/SpeakerButton';
import { useTheme } from '../../context/ThemeContext';
import { useExampleSettings } from '../../context/ExampleSettingsContext';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import WordDetaileNewBottomSheet from '../newBottomSheet/WordDetaileNewBottomSheet';
import ExampleList from '../common/ExampleList';
import { useStatusBarStyle } from '../../hooks/useStatusBarStyle';
// 당근 농장 V2 — 세션 요약 슬라이드
import CropImage, { CROP_ASSETS, FARM_ITEM_ASSETS, getCropAsset } from '../farm/CropImage';
import { stageToCrop, cropLabel, FARM_ITEMS, FARM_ITEM_LABEL } from '../../utils/crop';

// 아이템 이름은 utils/crop.js 의 FARM_ITEM_LABEL 하나로 통일돼 있다(시안 §1⑤ "새심기 삽").
import { getSessionFarmSummaryApi } from '../../api/farm';
import { getAchievementCriteriaApi } from '../../api/study';

// 업적 이미지 import
import InviteKing from '../../assets/images/HeyCharacter/InviteKing.png';
import AttendanceKing from '../../assets/images/HeyCharacter/AttendanceKing.png';
import NoryeokKing from '../../assets/images/HeyCharacter/NoryeokKing.png';
import WordKing from '../../assets/images/HeyCharacter/WordKing.png';
import PerseveranceKing from '../../assets/images/HeyCharacter/PerseveranceKing.png';
import ReadingKing from '../../assets/images/HeyCharacter/ReadingKing.png';
import MemorizedKing from '../../assets/images/HeyCharacter/MemorizedKing.png';

// 업적 타입과 이미지 매핑
const ACHIEVEMENT_IMAGES = {
  '초대왕': InviteKing,
  '출석왕': AttendanceKing,
  '노력왕': NoryeokKing,
  '단어왕': WordKing,
  '끈기왕': PerseveranceKing,
  '독서왕': ReadingKing,
  '암기왕': MemorizedKing, // 암기왕 = 연속 정답 콤보 최고치 (콤보왕 폐지 후 통합)
};

// 레벨별 배경 색상 및 스타일
const getAchievementBackgroundStyle = (level) => {
  if (level >= 10) {
    // 레벨 10 이상: 그라데이션
    return {
      background: 'linear-gradient(135deg, var(--primary-main-600) 0%, #CD8DFF 50%, #74D5FF 100%)',
    };
  } else if (level >= 6) {
    // 레벨 6~9: 노란색
    return {
      backgroundColor: '#F2D252',
    };
  } else if (level >= 3) {
    // 레벨 3~5: 회색
    return {
      backgroundColor: '#C0C0C0',
    };
  } else {
    // 레벨 0~2: 갈색
    return {
      backgroundColor: '#D3A686',
    };
  }
};

// 레벨별 글자 색상 및 스타일 (배경색과 동일)
const getAchievementTextStyle = (level) => {
  if (level >= 10) {
    // 레벨 10 이상: 그라데이션 글자 (배경과 동일)
    return {
      background: 'linear-gradient(135deg, var(--primary-main-600) 0%, #CD8DFF 50%, #74D5FF 100%)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
      color: 'transparent',
    };
  } else if (level >= 6) {
    // 레벨 6~9: 노란색 글자
    return {
      color: '#F2D252',
    };
  } else if (level >= 3) {
    // 레벨 3~5: 회색 글자
    return {
      color: '#C0C0C0',
    };
  } else {
    // 레벨 0~2: 갈색 글자
    return {
      color: '#D3A686',
    };
  }
};

// ─────────────────────────────────────────────────────────────
// 당근 농장 V2 — 결과 슬라이드 조각
// 보상/성장 슬라이드는 기존 규격(100px 그림 + 16px/700 한 줄)을 그대로 쓴다.
// ─────────────────────────────────────────────────────────────

/*
  목록이 붙는 슬라이드 — 여기서는 그림이 **보상이 아니라 요약**이다.

  보상 슬라이드(보석·콤보·업적·황금 당근)는 그림 하나가 주인공이라 화면 한가운데에 세우고
  뒤에 오로라를 깔아 돋보이게 한다. 목록 슬라이드는 그림 아래로 단어가 줄줄이 이어지는
  **읽는 화면**이라, 그림만 가운데 띄우면 위아래가 텅 비고 오로라만 커 보인다.
  그래서 이 셋은 가운데 정렬도 배경 효과도 쓰지 않고 위 여백만 넉넉히 준다.
*/
const LIST_SLIDE_TYPES = new Set(['farmPlanted', 'farmGrown', 'farmRescued']);
const LIST_SLIDE_TOP_PAD = 40;   // 컨테이너 위 패딩(28) 위에 더 얹는 값

// 100px 히어로 그림 — 기존 newWords 슬라이드와 같은 등장 연출
const FarmArt = ({ src, alt }) => (
  <motion.img
    src={src}
    alt={alt}
    className='w-[100px] h-[100px] object-contain'
    initial={{ scale: 0, opacity: 0 }}
    animate={{ scale: [0, 1.2, 1, 1.1, 1], opacity: 1, y: [0, -8, 0] }}
    transition={{
      scale: { type: 'tween', ease: 'easeOut', duration: 0.6, times: [0, 0.5, 0.7, 0.85, 1] },
      opacity: { duration: 0.6 },
      y: { delay: 0.8, duration: 2.5, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' },
    }}
  />
);

// 성장 목록 한 줄 — 시안 `.grow2` [작물][단어·뜻][오른쪽 결과].
// 단어장·최종 결과와 같은 배치다(시안 학습결과 §1 ①).
const FarmGrowRow = ({ crop, word, meaning, right }) => (
  <div className='flex items-center gap-[11px] px-[14px] py-[12px] rounded-[10px] bg-layout-gray-50 dark:bg-layout-gray-dark'>
    <CropImage stage={crop} size={52} className='flex-shrink-0' />
    <div className='flex flex-col flex-1 min-w-0 text-left'>
      <span className='text-[15px] font-[700] text-layout-black dark:text-layout-white truncate'>{word}</span>
      {meaning ? (
        <span className='mt-[2px] text-[11.5px] font-[400] text-layout-gray-400 dark:text-layout-gray-50 truncate'>
          {meaning}
        </span>
      ) : null}
    </div>
    {/* 시안 `.grow2 .rt` — 11.5px/700 #12B76A(status-success-600) */}
    <span className='flex-shrink-0 whitespace-nowrap text-[11.5px] font-[700] text-status-success-600'>
      {right}
    </span>
  </div>
);

// 단계 상승 표기 — 시안 `<s>이전</s> → 이후`. 이전 단계는 #BBBBBB/600 으로 물러난다.
const CropStep = ({ from, to }) => (
  from && from !== to ? (
    <>
      <span className='font-[600] text-[#BBBBBB]'>{cropLabel(from)}</span>
      {' → '}
      {cropLabel(to)}
    </>
  ) : cropLabel(to)
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

// 보상 슬라이드 — 시안 `award()`. 그림 100px + 16px/700 한 줄 (+ 여러 개일 때만 아래 한 줄)
// 시안 `.rin` gap 15px, `.rwhy` 는 margin-top:-7px 로 8px 만 띄운다.
const FarmAwardSlide = ({ art, line, why }) => (
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
    {why ? (
      <motion.p
        className='-mt-[7px] text-[12px] font-[500] text-center text-layout-gray-300'
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.45, duration: 0.5 }}
      >
        {why}
      </motion.p>
    ) : null}
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
    gem: { before: 0, after: GUEST_SIGNUP_GEM + GUEST_ATTEND_GEM + GUEST_MISSION_GEM + goalGem },
    attend: true,
    today_study_complete: true,
    daily_mission_complete: true,
    // 업적 슬라이드는 type 과 level 만 읽는다(배지 그림은 ACHIEVEMENT_IMAGES 가 이름으로 찾는다)
    goals: GUEST_FIRST_DAY_GOALS.map((type) => ({ name: type, type, level: 1 })),
  };
};

/*
  하단 버튼 — **온보딩 하단 CTA와 같은 규격**(pages/Onboarding.jsx `Cta`).
    52px / radius 12 / 16px·700 / tracking -0.03em / whileTap 0.97
  결과 화면은 온보딩 첫 학습에서 그대로 이어지는 화면이라, 같은 자리의 버튼이 45px·radius 8 로
  달라 보이면 화면이 바뀐 게 아니라 앱이 바뀐 것처럼 읽힌다.

  `secondary` 는 온보딩 선택지(OptionRow)의 미선택 형 — 2px 테두리에 빈 면. 예전의
  회색 채운 버튼은 분홍 버튼과 무게가 비슷해 어느 쪽이 주된 행동인지 흐렸다.
*/
const ResultCta = ({ label, onClick, secondary = false, className = '' }) => (
  <motion.button
    type="button"
    onClick={onClick}
    whileTap={{ scale: 0.97 }}
    transition={{ type: 'spring', stiffness: 500, damping: 15 }}
    className={`
      h-[52px] rounded-[12px] text-[16px] font-[700] tracking-[-0.03em]
      ${secondary
        ? 'border-[2px] border-layout-gray-100 dark:border-layout-gray-dark bg-layout-white dark:bg-layout-black text-layout-gray-300 dark:text-layout-gray-100'
        : 'bg-primary-main-600 text-layout-white dark:text-layout-black'}
      ${className}
    `}
  >
    {label}
  </motion.button>
);

/*
  하단 버튼 자리 — 온보딩과 같은 여백(px 24 / pt 18 / pb 26).
  면은 토큰 배경 한 겹이다. 예전에는 흰색→흰색 그라데이션을 인라인 style 로 깔았는데,
  라이트 모드 문자열의 괄호가 닫히지 않아(`... 100%'`) 값 자체가 무효였다 —
  결국 아무것도 안 깔린 채 목록이 버튼 뒤로 비쳤다.
*/
const ResultCtaBar = ({ children, className = '' }) => (
  <div className={`flex items-center gap-[12px] px-[24px] pt-[18px] pb-[26px] bg-layout-white dark:bg-layout-black ${className}`}>
    {children}
  </div>
);

// 연속 학습 주간 막대 — 이번 주 월~일. 연속 일수(current)로 이번 주에 채워진 날을 되짚는다.
const buildStreakWeek = (current) => {
  const DOW = ['월', '화', '수', '목', '금', '토', '일'];
  const now = new Date();
  const sinceMonday = (now.getDay() + 6) % 7; // 월요일부터 며칠 지났는지
  return DOW.map((label, index) => {
    const daysAgo = sinceMonday - index;
    if (daysAgo < 0) return { label, state: 'future' };
    if (daysAgo === 0) return { label, state: 'today' };
    return { label, state: daysAgo < (current ?? 0) ? 'on' : 'off' };
  });
};

const StreakWeek = ({ current }) => (
  <div className='flex justify-center gap-[6px] w-full px-[10px]'>
    {buildStreakWeek(current).map((cell) => (
      <div key={cell.label} className='flex flex-col items-center gap-[5px] flex-1 max-w-[40px]'>
        <div
          className={`
            flex items-center justify-center w-full aspect-square rounded-[10px]
            ${cell.state === 'on' ? 'bg-primary-main-600' : ''}
            ${cell.state === 'today' ? 'bg-primary-main-100 dark:bg-[#3D1D34] border-[2px] border-primary-main-600' : ''}
            ${cell.state === 'off' || cell.state === 'future' ? 'bg-layout-gray-50 dark:bg-layout-gray-dark' : ''}
          `}
        >
          {cell.state === 'on' && <Drop size={15} weight='fill' className='text-layout-white' />}
          {cell.state === 'today' && <Drop size={15} weight='fill' className='text-primary-main-600' />}
        </div>
        {/* 시안 `.wk .l` — 10px/600 #BBBBBB */}
        <span className='text-[10px] font-[600] text-[#BBBBBB]'>{cell.label}</span>
      </div>
    ))}
  </div>
);

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
  const { showExamples } = useExampleSettings();
  const { recentStudy, updateRecentStudy, isRecentStudyLoading, fetchVocabularySheets, setLastSessionResult, getWord } = useVocabulary();
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
    vibrate({ duration: 5 });
    pushNewBottomSheet(WordDetaileNewBottomSheet, {
      vocabularyId: item.vocabularySheetId,
      id: item.id,
    });
  };
  const navigate = useNavigate();
  const { state } = useLocation();
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
  const testType = state.testType;
  // 게스트 맛보기 결과 — 로그인 전용 서버로직(기록 저장·업적·추천 갱신)은 건너뛰고
  // 동일한 결과/보상 화면만 재사용한다. 완료 시 온보딩 가입으로 연결.
  const isGuest = !!state?.guestMode;

  const [currentScreenIndex, setCurrentScreenIndex] = useState(0);
  const [resultData, setResultData] = useState(null);
  const [screenList, setScreenList] = useState([]); // 표시할 화면 리스트
  // 당근 농장 V2 세션 요약 (심은 씨앗 / 자란 작물 / 되살린 작물 / 아이템 / 연속 학습일)
  const [farmSummary, setFarmSummary] = useState(null);

  // 최종 결과 카드의 왼쪽 작물 그림 — 세션 요약에 있는 단어만 단계를 알 수 있다.
  const farmCropMap = new Map();
  if (farmSummary) {
    (farmSummary.planted ?? []).forEach(p => farmCropMap.set(p.user_voca_id, 'seed'));
    (farmSummary.rescued ?? []).forEach(r => farmCropMap.set(r.user_voca_id, stageToCrop(r.crop)));
    (farmSummary.grown ?? []).forEach(g => farmCropMap.set(g.user_voca_id, stageToCrop(g.crop ?? g.to_stage)));
  }
  const cropOfWord = (item) => {
    // /study/log 가 보내는 user_voca_id 와 같은 키로 찾는다 (vocaIndexId 우선 — id 와 다를 수 있다)
    const userVocaId = item?.vocaIndexId ?? item?.id;
    if (userVocaId != null && farmCropMap.has(userVocaId)) return farmCropMap.get(userVocaId);
    // 학습 중 /study/log 응답의 farm payload 를 문항에 남겨두는 경우의 보조 경로
    const payload = item?.farm;
    if (payload?.crop || payload?.stage) return stageToCrop(payload.crop ?? payload.stage);
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
      if (item?.origin) items.push({ text: item.origin, language: 'en' });
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

      // 당근 농장 V2 — 세션 요약 조회. 실패하면 농장 슬라이드 없이 기존 슬라이드만 보여준다.
      const sessionId = state?.sessionId ?? state?.session_id ?? comboSummary?.sessionId ?? null;
      let farm = null;
      if (!isGuest && sessionId) {
        const farmRes = await getSessionFarmSummaryApi(sessionId);
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

      // 암기 상태가 좋아진 단어 집계
      const STATE_RANK = { unlearned: 0, leaf: 1, plant: 2, carrot: 3 };
      // 기존 암기 상태 키 → 작물 단계 (코드 leaf = 기획 새싹, 코드 plant = 기획 이파리)
      const STATE_TO_CROP = { unlearned: 'seed', leaf: 'sprout', plant: 'leaf', carrot: 'carrot' };
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

      // ① 자란 작물 — 농장 요약이 없을 때만 기존 암기 상태 상승 집계로 같은 형식을 채운다
      //    (둘은 같은 사실을 말하므로 함께 띄우지 않는다).
      if (grownList.length > 0) {
        screens.push({ type: 'farmGrown', data: { items: grownList } });
      } else if (improvedRows.length > 0) {
        screens.push({ type: 'farmGrown', data: { items: improvedRows } });
      }

      // ② 씨앗 심기 — 어떤 단어를 심었는지까지 보여준다
      if (plantedList.length > 0) {
        screens.push({ type: 'farmPlanted', data: { items: plantedList } });
      } else if (newWordCount > 0) {
        screens.push({ type: 'farmPlanted', data: { items: newWordRows } });
      }

      // ③ 새싹 발아 — 시간이 지난 뒤 스스로 기억해낸 단어
      if (sproutedList.length > 0) {
        screens.push({ type: 'farmSprouted', data: { items: sproutedList } });
      }

      // ④ 보석
      if (result.gem && result.gem.after > result.gem.before) {
        screens.push({
          type: 'gem',
          data: { gemCount: result.gem.after - result.gem.before }
        });
      }

      // ⑤⑥⑦ 농장 아이템 — 종류마다 한 장. 한 화면에 모아 두면 영수증이 된다(시안 §3).
      //     삽은 여러 개일 때만 어느 단어에서 왔는지, 보호권은 항상 주간 지급분이라고 적는다.
      const leafWords = grownAll
        .filter(g => stageToCrop(g.to_stage ?? g.crop) === 'leaf')
        .map(g => g.word)
        .filter(Boolean);
      [FARM_ITEMS.SHOVEL, FARM_ITEMS.NUTRIENT, FARM_ITEMS.SHIELD].forEach((itemKey) => {
        const qty = farmRewards?.[itemKey] ?? 0;
        if (qty <= 0) return;
        let why = null;
        if (itemKey === FARM_ITEMS.SHOVEL && qty > 1 && leafWords.length > 0) {
          why = `${leafWords.join(' · ')} 이 이파리가 됐어요`;
        } else if (itemKey === FARM_ITEMS.SHIELD) {
          why = '이번 주 지급분이에요';
        }
        screens.push({ type: 'farmItem', data: { itemKey, qty, why } });
      });

      // ⑧ 시든 작물 회복 — 이미 안전해진 사실만 적는다(시안 §4 콜아웃)
      if (rescuedList.length > 0) {
        screens.push({ type: 'farmRescued', data: { items: rescuedList } });
      }

      // ⑨ 황금 당근 — 이 슬라이드만 글로우가 금색이다
      if (goldenList.length > 0) {
        screens.push({ type: 'farmGolden', gold: true, data: { items: goldenList } });
      }

      // ⑩ 연속 학습 — 오늘 5개 이상 정답일 때만(기획 11.1)
      const todayDone = farmStreak?.today_done
        ?? ((farm?.correct ?? correctCnt) >= 5);
      if ((farmStreak?.current ?? 0) > 0 && todayDone) {
        screens.push({ type: 'farmStreak', data: farmStreak });
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

      // 시안 순서표에 없는 기존 슬라이드 — 콤보(AI 추천 전용)와 출석.
      // 출석은 연속 학습과 겹치지만 출석왕 업적이 attend 를 쓰고 있어 지우지 않았다(시안 §4 콜아웃).
      if (testType === 'quick' && (comboSummary?.maxCombo ?? 0) >= 5) {
        screens.push({
          type: 'combo',
          data: comboSummary,
        });
      }
      if (result.attend) {
        screens.push({
          type: 'attend',
          data: {}
        });
      }

      // ⑪ 데일리 목표 — 복습과 신규를 모두 끝낸 날
      if (result.daily_mission_complete) {
        screens.push({
          type: 'dailyMission',
          data: {}
        });
      }

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
      screens.push({
        type: 'result',
        data: {}
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

  useEffect(() => {
    if (recentStudy && recentStudy[testType] && recentStudy[testType].status === "learning") {
      navigate('/home');
    }
  }, [isRecentStudyLoading]);

  const onClickTestAgain = async () => {
    // 요소의 순서를 랜덤으로 섞어서 반환
    // options을 랜덤으로 섞고, 정답의 index(resultIndex)도 새로 계산
    const tempTestQuestions = recentStudy[testType].study_data
      .map((question) => {
        // 기존 정답(원래 options에서 resultIndex로 찾음)
        const correctAnswer = question.options[question.resultIndex];
        // options을 랜덤으로 섞음
        const shuffledOptions = [...question.options].sort(() => Math.random() - 0.5);
        // 섞인 options에서 정답의 index를 다시 찾음
        const newResultIndex = shuffledOptions.findIndex(opt => opt.id === correctAnswer.id);
        return {
          ...question,
          isCorrect: null,
          userResultIndex: null,
          options: shuffledOptions,
          resultIndex: newResultIndex,
        };
      })
      .sort(() => Math.random() - 0.5);
    await updateRecentStudy(testType, {
      ...recentStudy[testType],
      status: "learning",
      progress_index: 0,
      study_data: tempTestQuestions,
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    })
    navigate('/take-test', {
      state: {
        testType: testType
      }
    });
  }

  const onClickEndStudy = async () => {
    // 게스트 첫 학습: 결과 확인 후 온보딩 질문 구간으로 (심은 답안은 guestStorage에 저장됨).
    // 예고 화면(ready)이 아니라 그다음으로 보낸다 — 학습을 마친 사람을 예고로 되돌리면
    // 같은 학습을 다시 하게 된다.
    if (isGuest) {
      navigate('/onboarding', { state: { step: 'channel' }, replace: true });
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
          <div className='flex flex-col flex-1 overflow-y-auto scrollbar-hide pb-[110px]'>
            {/* 프로그레스 서클 영역 — 시안 `.circwrap` padding 34px 0 30px */}
            <div className='flex flex-col items-center justify-center pt-[34px] pb-[30px]'>
              <div className='relative w-[238px] h-[238px] flex items-center justify-center'>
                {/* SVG 영역: 반시계 방향을 위해 scaleY(-1)과 rotate(-90) 적용 */}
                <svg
                  className='absolute w-full h-full transform -rotate-90 -scale-y-100'
                  viewBox="0 0 238 238"
                >
                  {/* 안쪽 배경 회색 원 (프로그레스 바가 지나갈 길) */}
                  <circle
                    cx="119"
                    cy="119"
                    r="104.8"
                    fill="none"
                    stroke={isDark ? 'var(--layout-gray-dark)' : 'var(--layout-gray-50)'}
                    strokeWidth="28.4"
                  />
                  {/* 실제 핑크색 프로그레스 바 (반시계 방향으로 채워짐) */}
                  {correctQuestions > 0 && (
                    <motion.circle
                      cx="119"
                      cy="119"
                      r="104.8"
                      fill="none"
                      stroke="var(--primary-main-600)"
                      strokeWidth="28.4"
                      strokeLinecap="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: correctQuestions / totalQuestions }}
                      transition={{ duration: 1.5, ease: "easeOut" }}
                    />
                  )}
                </svg>
                {/* 중앙 텍스트 */}
                <div className='flex flex-col items-center justify-center z-10'>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5, duration: 0.5 }}
                    className='text-[36px] font-[700] text-primary-main-600'
                  >
                    {score}점
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1, duration: 0.5 }}
                  >
                    <span className='text-[14px] font-[700] text-primary-main-600'>{correctQuestions}</span>
                    <span className='text-[14px] font-[400] text-layout-gray-200'>/{totalQuestions}</span>
                  </motion.div>
                </div>
              </div>
            </div>

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
                  // FSRS 기반 현재 암기 상태
                  const fsrsReps = item.fsrs?.reps ?? 0;
                  const fsrsStability = Math.round(item.fsrs?.stability ?? 0);
                  const fsrsNextReview = item.fsrs?.next_review ?? null;
                  // [정답/오답][단어·뜻][상태] 순서.
                  // 이 목록에서 먼저 찾는 것은 "무엇을 틀렸나"라 채점 표시가 맨 앞에 온다.
                  // 상태(작물 그림, 없으면 암기 상태 배지)는 부가 정보라 끝에 붙는다.
                  const crop = cropOfWord(item);
                  return (
                    <motion.div
                      key={`${item.id ?? 'q'}-${index}`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 1.2 + (index * 0.1) }}
                      onClick={() => handleOpenWordDetail(item)}
                      className={`
                        flex flex-col gap-[10px]
                        px-[16px] py-[14px]
                        rounded-[12px] cursor-pointer
                        ${item.isCorrect ? 'bg-status-success-100 dark:bg-status-success-dark' : 'bg-status-error-50 dark:bg-status-error-dark'}
                      `}
                    >
                      <div className='flex items-center gap-[11px]'>
                        {/* ① 채점 결과 */}
                        <span className='flex items-center justify-center flex-shrink-0 w-[22px] h-[22px]'>
                          {item.isCorrect ? (
                            <Circle size={20} weight="bold" className='text-status-success-500' />
                          ) : (
                            <X size={20} weight="bold" className='text-status-error-500' />
                          )}
                        </span>

                        {/* ② 단어·뜻 */}
                        <div className='flex flex-col flex-1 gap-[2px] min-w-0'>
                          <div className="flex items-center gap-[6px] min-w-0">
                            <h3 className="text-[15px] font-[700] text-layout-black dark:text-layout-white truncate">
                              {item.origin}
                            </h3>
                            <SpeakerButton text={item.origin} lang="en" size={15} label="단어 발음 듣기" />
                          </div>
                          <p className="text-[11.5px] font-[400] text-layout-gray-400 dark:text-layout-gray-50 truncate">
                            {meaningsArr.join(', ')}
                          </p>
                          {showExamples && <ExampleList examples={item.examples} className="mt-[2px]" />}
                        </div>

                        {/* ③ 상태 — 작물 그림. 농장 요약을 못 받았을 때만 암기 상태 배지로 되돌린다 */}
                        {crop ? (
                          <CropImage stage={crop} size={52} className='flex-shrink-0' />
                        ) : (
                          <span className='flex-shrink-0'>
                            <MemorizationStatus
                              repetition={fsrsReps}
                              interval={fsrsStability}
                              ef={2.5}
                              nextReview={fsrsNextReview}
                              wordId={item.id}
                              useRandomMessages={false}
                              forceText={item.priorityBucket === 'new' ? 'NEW' : null}
                            />
                          </span>
                        )}
                      </div>
                    </motion.div>
                  );
                });
              })()}
            </div>
          </div>
          <ResultCtaBar className="absolute bottom-0 left-0 right-0">
            {testType !== 'quick' && !isGuest && (
              <ResultCta
                secondary
                className="flex-1"
                label="테스트 다시 하기"
                onClick={() => { vibrate({ duration: 5 }); onClickTestAgain(); }}
              />
            )}
            <ResultCta
              className="flex-1"
              label={isGuest ? '계속하기' : '학습 종료'}
              onClick={() => { vibrate({ duration: 5 }); onClickEndStudy(); }}
            />
          </ResultCtaBar>
        </motion.div>
      );
    }


    // 나머지 화면들 — 시안 §1 규격(그림 100px + 한 줄 + 확인 버튼)을 공유한다
    // 목록 슬라이드는 가운데 정렬도 배경 오로라도 쓰지 않는다(LIST_SLIDE_TYPES 주석 참고)
    const isListSlide = LIST_SLIDE_TYPES.has(currentScreen.type);
    let content = null;

    if (currentScreen.type === 'farmPlanted') {
      // 새로 심은 씨앗 — 어떤 단어를 심었는지까지 보여준다
      const items = currentScreen.data.items ?? [];
      content = (
        <FarmListSlide
          /* 봉투(unplanted)가 아니라 낱알(PLANTED_SEED)이다 — 방금 심은 씨앗이므로.
             crop 키 'seed' 를 넘기면 두 상태가 합쳐진 값이라 봉투가 나온다(CropImage 주석). */
          art={<FarmArt src={getCropAsset('PLANTED_SEED', 'FRESH')} alt="새로 심은 씨앗" />}
          line={<>처음 배운 <strong className='text-primary-main-600'>{items.length}개</strong>를 씨앗으로 심었어요!</>}
          rows={items.map((row) => (
            <FarmGrowRow
              key={row.user_voca_id}
              /* 왼쪽 그림은 **지금 상태**다. 심었으니 낱알. */
              crop="PLANTED_SEED"
              word={row.word}
              meaning={row.meaning}
              right="새로 심었어요"
            />
          ))}
        />
      );
    } else if (currentScreen.type === 'farmGrown') {
      // ① 자란 작물 — 이미 심은 것만. 시안은 목록 내용과 무관하게 이파리 그림을 대표로 쓴다.
      const items = currentScreen.data.items ?? [];
      content = (
        <FarmListSlide
          art={<FarmArt src={getCropAsset('leaf', 'FRESH')} alt="자란 작물" />}
          line={<><strong className='text-primary-main-600'>{items.length}개</strong>의 작물이 자랐어요!</>}
          rows={items.map((row) => {
            const to = stageToCrop(row.to_stage ?? row.crop);
            const from = row.from_stage ? stageToCrop(row.from_stage) : null;
            return (
              <FarmGrowRow
                key={row.user_voca_id}
                crop={to}
                word={row.word}
                meaning={row.meaning}
                right={<CropStep from={from} to={to} />}
              />
            );
          })}
        />
      );
    } else if (currentScreen.type === 'farmSprouted') {
      // ③ 새싹 발아 — 시간이 지난 뒤 스스로 기억해낸 단어. 목록 없이 한 줄만 적는다.
      const items = currentScreen.data.items ?? [];
      content = (
        <FarmAwardSlide
          art={<FarmArt src={getCropAsset('sprout', 'FRESH')} alt="새싹 발아" />}
          line={
            items.length === 1
              ? <><strong className='text-primary-main-600'>{items[0]?.word}</strong>에 새싹이 돋았어요!</>
              : <><strong className='text-primary-main-600'>{items.length}개</strong>에 새싹이 돋았어요!</>
          }
        />
      );
    } else if (currentScreen.type === 'farmGolden') {
      // ⑨ 황금 당근 도달 — 이 슬라이드만 글로우가 금색이다(배경 교체는 아래 래퍼가 한다)
      const items = currentScreen.data.items ?? [];
      content = (
        <FarmAwardSlide
          art={<FarmArt src={CROP_ASSETS.goldenCarrot} alt="황금 당근" />}
          line={
            items.length === 1
              ? <><strong className='text-primary-main-600'>{items[0]?.word}</strong>이 황금 당근이 됐어요!</>
              : <><strong className='text-primary-main-600'>{items.length}개</strong>가 황금 당근이 됐어요!</>
          }
          why={items.length === 1 ? '이제 이 단어는 썩지 않아요' : '이제 이 단어들은 썩지 않아요'}
        />
      );
    } else if (currentScreen.type === 'farmRescued') {
      // ⑧ 시든 작물 회복 — 이미 안전해진 사실만 적는다 (기획 13.4)
      const items = currentScreen.data.items ?? [];
      content = (
        <FarmListSlide
          art={<FarmArt src={getCropAsset('leaf', 'FRESH')} alt="되살린 작물" />}
          line={<>시들었던 <strong className='text-primary-main-600'>{items.length}개</strong>를 되살렸어요!</>}
          rows={items.map((row) => (
            <FarmGrowRow
              key={row.user_voca_id}
              crop={stageToCrop(row.crop)}
              word={row.word}
              meaning={row.meaning}
              right="다시 촉촉해요"
            />
          ))}
        />
      );
    } else if (currentScreen.type === 'farmItem') {
      // ⑤⑥⑦ 농장 아이템 — 종류마다 한 장
      const { itemKey, qty, why } = currentScreen.data;
      const label = FARM_ITEM_LABEL[itemKey];
      content = (
        <FarmAwardSlide
          art={<FarmArt src={FARM_ITEM_ASSETS[itemKey]} alt={label} />}
          line={<><strong className='text-primary-main-600'>{label} {qty}개</strong>를 받았어요!</>}
          why={why}
        />
      );
    } else if (currentScreen.type === 'farmStreak') {
      // ⑩ 연속 학습 — 마스코트 + 한 줄 + 이번 주 물뿌리개 기록. 시안에는 아래 한 줄이 없다.
      const { current } = currentScreen.data;
      content = (
        <div className='relative flex flex-col items-center justify-center gap-[15px] w-full'>
          <FarmArt src={CROP_ASSETS.mascotWalk} alt="연속 학습" />
          <motion.p
            className='text-[16px] font-[700] text-center leading-[1.45]'
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            <strong className='text-primary-main-600'>{current}일</strong> 연속으로 농장을 돌봤어요!
          </motion.p>
          <motion.div
            className='w-full'
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.4 }}
          >
            <StreakWeek current={current} />
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
              src={AttendanceKing}
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
    } else if (currentScreen.type === 'dailyMission') {
      // ⑪ 데일리 목표 — 복습과 신규를 모두 끝낸 날
      content = (
        <FarmAwardSlide
          art={<FarmArt src={CROP_ASSETS.mascotWatering} alt="데일리 목표 완료" />}
          line={<>오늘 농장을 <strong className='text-primary-main-600'>다 돌봤어요!</strong></>}
        />
      );
    } else if (currentScreen.type === 'combo') {
      // 콤보 달성 (AI 추천 테스트)
      const { maxCombo, bestUpdated } = currentScreen.data;
      // 불꽃 계열(주황)로 — 아이콘 + 한 줄만 두어 오로라 중앙 아이콘 정렬 유지
      content = (
        <div className='relative flex flex-col items-center justify-center gap-[15px]'>
          <motion.div
            className='flex items-center justify-center w-[100px] h-[100px] rounded-full bg-[#FFF1DE] dark:bg-layout-gray-dark'
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.2, 1, 1.1, 1], opacity: 1 }}
            transition={{
              scale: { type: "tween", ease: "easeOut", duration: 0.6, times: [0, 0.5, 0.7, 0.85, 1] },
              opacity: { duration: 0.6 },
            }}
          >
            <Flame weight="fill" className='text-[56px] text-[#FF7A00]' />
          </motion.div>
          <motion.p
            className='text-[16px] font-[700] text-center'
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            {bestUpdated ? (
              <><strong className='text-[#FF7A00]'>최고 기록 갱신!</strong> {maxCombo}콤보</>
            ) : (
              <><strong className='text-[#FF7A00]'>연속 정답 {maxCombo}콤보</strong> 달성!</>
            )}
          </motion.p>
        </div>
      );
    } else if (currentScreen.type === 'achievement') {
      // 업적 달성
      const goal = currentScreen.data.goal;
      if (!goal) return null;

      const goalType = goal?.type || '단어왕';
      const goalLevel = goal?.level || 0;
      content = (
        <div className='relative flex flex-col items-center justify-center gap-[20px]'>
          {/* 업적 이미지와 레벨 표시 */}
          <motion.div
            className="relative h-[70px]"
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: 1,
              opacity: 1,
              y: [0, -8, 0]
            }}
            transition={{
              scale: {
                type: "spring",
                stiffness: 200,
                damping: 15,
                duration: 0.6
              },
              opacity: {
                duration: 0.6
              },
              y: {
                delay: 0.7,
                duration: 2.5,
                repeat: Infinity,
                repeatType: "reverse",
                ease: "easeInOut"
              }
            }}
          >
            <img
              src={ACHIEVEMENT_IMAGES[goalType]}
              alt={goalType}
              className="absolute bottom-[10px] left-[50%] translate-x-[-50%] w-[60px] h-[60px] object-contain"
            />
            <div
              className="w-[60px] h-[60px] rounded-[50%]"
              style={getAchievementBackgroundStyle(goalLevel)}
            ></div>
            <span
              className="
                absolute bottom-[0] left-[50%] 
                translate-x-[-50%]
                text-[16px] font-[700]
                font-family: 'Cafe24Ssurround', sans-serif;
                [text-shadow:_-1.2px_-1.2px_0_var(--layout-white),_1.2px_-1.2px_0_var(--layout-white),_-1.2px_1.2px_0_var(--layout-white),_1.2px_1.2px_0_var(--layout-white)]
              "
              style={getAchievementTextStyle(goalLevel)}
            >
              <span className="text-[10px]">LV.</span>{goalLevel}
            </span>
          </motion.div>
          <motion.p
            className='text-[16px] font-[700]'
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{
              delay: 0.5,
              duration: 0.5
            }}
          >
            <strong className='text-primary-main-600'>{goalType} {goalLevel}레벨</strong>을 달성했어요!
          </motion.p>
        </div>
      );
    } else if (currentScreen.type === 'gem') {
      // 보석 획득
      content = (
        <div className='relative flex flex-col items-center justify-center gap-[15px]'>
          <motion.img
            src={gemImg}
            alt="보석"
            className='w-[100px] h-[100px] object-contain'
            initial={{ scale: 0, opacity: 0, rotate: -180 }}
            animate={{
              scale: [0, 1.3, 1, 1.15, 1],
              opacity: 1,
              rotate: [0, 10, -10, 0]
            }}
            transition={{
              scale: {
                type: "tween",
                ease: "easeOut",
                duration: 0.7,
                times: [0, 0.5, 0.7, 0.85, 1]
              },
              opacity: {
                duration: 0.7
              },
              rotate: {
                delay: 1,
                duration: 2.5,
                repeat: Infinity,
                repeatType: "reverse",
                ease: "easeInOut"
              }
            }}
          />
          <motion.p
            className='text-[16px] font-[700]'
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{
              delay: 0.3,
              duration: 0.5
            }}
          >
            <strong className='text-primary-main-600'>보석 {currentScreen.data.gemCount}개</strong>를 획득했어요!
          </motion.p>
          {/* 게스트는 아직 계정이 없어 보석이 들어갈 곳이 없다 — 어디로 들어오는지 한 줄 덧붙인다.
              이 줄이 없으면 가입 화면에서 보석이 사라진 것처럼 보인다. */}
          {isGuest ? (
            <motion.p
              className='-mt-[7px] text-[12px] font-[500] text-center text-layout-gray-300'
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.45, duration: 0.5 }}
            >
              가입하면 계정으로 바로 들어와요
            </motion.p>
          ) : null}
        </div>
      );
    }

    // 공용 슬라이드 껍데기 — 고정 헤더 + 배경 + 확인 버튼
    if (!content) return null;

    return (
      <div className='relative flex flex-col h-[100dvh]'>
        <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
        {/* 고정 헤더 */}
        <div
          className='
            absolute left-0
            flex items-end justify-center
            w-full h-[55px]
            px-[16px] py-[14px]
            z-20
          '
          style={{ top: 'var(--status-bar-height)' }}
        >
          <div className="center">
            <h2 className='text-[18px] font-[700] leading-[21px]'>
              학습 결과
            </h2>
          </div>
        </div>
        {/* 슬라이드되는 영역 (컨텐츠 + 확인 버튼) */}
        <AnimatePresence mode="wait">
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
            className='relative flex flex-col flex-1 pt-[55px] overflow-hidden'
          >
            {/*
              컨텐츠 영역 — **여기가 스크롤한다.**
              그림·문구·목록이 한 덩어리로 움직이고, 아이콘 뒤 글로우도 같은 블록 안에 있어
              따라 움직인다. 짧은 슬라이드는 min-h-full + justify-center 로 가운데에 선다.
              (예전에는 -translate-y-[55px] 로 헤더 높이만큼 끌어올려 가운데를 맞췄는데,
               스크롤이 생기면 그만큼 아래가 잘리므로 패딩으로 자리를 잡는다.)
            */}
            <div className='relative flex-1 overflow-y-auto scrollbar-hide px-[20px] py-[28px]'>
              <div className={`relative w-full ${isListSlide ? '' : 'min-h-full flex flex-col justify-center'}`}>
              {/*
                글로우 기준 블록 — **콘텐츠 높이에 딱 맞는다.**
                보상 슬라이드는 바깥이 min-h-full 이라 글로우를 거기에 붙이면
                `top-50px` 이 화면 위쪽 50px 이 되어, 세로 중앙에 선 아이콘과 어긋난다.
                콘텐츠와 같은 높이의 블록을 한 겹 두고 그 안에서 재면 항상 아이콘 중심이다.
              */}
              <div className='relative w-full' style={isListSlide ? { paddingTop: LIST_SLIDE_TOP_PAD } : undefined}>
              {/* 배경 — 시안 ⑨ 황금 당근만 금색 글로우로 통째로 바꾼다("배경부터 다르게 둔다").
                  나머지 슬라이드는 지금 형식(핑크 오로라) 그대로다. */}
              {isListSlide ? null : currentScreen.gold ? (
                <div
                  className='pointer-events-none absolute top-[50px] left-[50%] z-0 translate-x-[-50%] translate-y-[-50%] w-[300px] h-[300px] rounded-full'
                  style={{
                    background: 'radial-gradient(circle, rgba(242,183,19,.34) 0%, rgba(242,183,19,.12) 45%, rgba(242,183,19,0) 70%)',
                  }}
                ></div>
              ) : (
              <>
              {/* ResultItemBackground01: 크기 변화 + 회전 + 섬광 효과 */}
              <div className='pointer-events-none absolute top-[50px] left-[50%] z-0 translate-x-[-50%] translate-y-[-50%] w-[230px] h-[230px]'>
                <motion.img
                  src={ResultItemBackground01}
                  alt="결과 아이템 배경"
                  className='w-full h-full object-contain'
                  animate={{
                    rotate: [0, 360, 720],
                    scale: [1, 2, 1, 2, 1],
                    opacity: [0.8, 1, 0.8, 1, 0.8],
                  }}
                  transition={{
                    duration: 4,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              </div>
              {/* ResultItemBackground02: 투명도 + 확대/축소 */}
              <div className='pointer-events-none absolute top-[50px] left-[50%] z-0 translate-x-[-50%] translate-y-[-50%] w-[757px] h-[600px]'>
                <motion.img
                  src={ResultItemBackground02}
                  alt="결과 아이템 배경"
                  className='w-full h-full object-contain'
                  animate={{
                    scale: [1, 1.05, 1],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              </div>
              </>
              )}

              {/* 콘텐츠 */}

              <div className='relative z-10 w-full flex flex-col items-center'>
                {content}
              </div>
              </div>
              </div>
            </div>
            {/* 확인 버튼 */}
            <ResultCtaBar className="relative z-10">
              <ResultCta
                className="w-full"
                label="확인"
                onClick={() => { vibrate({ duration: 5 }); handleNextScreen(); }}
              />
            </ResultCtaBar>
          </motion.div>
        </AnimatePresence>
      </div>
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
