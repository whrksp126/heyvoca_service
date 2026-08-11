import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  CaretLeft, CheckCircle, AppleLogo, CaretRight,
  Users, AppStoreLogo, Megaphone, MagnifyingGlass, DotsThreeOutline,
  GraduationCap, Airplane, Sparkle, GlobeHemisphereWest,
} from '@phosphor-icons/react';
import googleLogo from '../assets/images/google_logo.png';
import { getOnboardingBooksApi, getLevelBookApi, migrateOnboardingApi } from '../api/study';
import { patchGuest, getGuest, setGuestTrial, clearGuest } from '../utils/guestStorage';
import { buildGuestQuestions, countGuestWords, ONBOARDING_FIRST_DAY_WORDS } from '../utils/guestQuestions';
import { vibrate, getDevicePlatform } from '../utils/osFunction';
import { primeSfx } from '../utils/audio';
import { BookCard } from '../components/bookStore/BookSection';
import { PreviewBookStoreNewFullSheet } from '../components/newfullsheet/PreviewBookStoreNewFullSheet';
import { SwitchAccountNewBottomSheet } from '../components/newBottomSheet/SwitchAccountNewBottomSheet';
import { useNewFullSheetActions } from '../context/NewFullSheetContext';
import { useNewBottomSheetActions } from '../context/NewBottomSheetContext';
import { useUser } from '../context/UserContext';
import postMessageManager from '../utils/postMessageManager';
import FarmField from '../components/farm/FarmField';
import { CROP_ASSETS, cropAssetByVariant } from '../components/farm/CropImage';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';

/*
  온보딩 — 인사에서 첫 학습까지.

  【흐름】 hello → intro → memory → level(+미리보기 시트) → ready → 학습 → 학습 결과
          → channel → goal → daily → nick → auth

  【학습을 질문보다 앞에 둔 이유】 유입 경로·학습 목적은 사용자가 얻는 게 없는 질문이라
  첫 학습에 닿기 전에 놓으면 순수한 이탈 구간이 된다. 뒤로 옮기면 하루 목표 안내도
  "오늘 14알을 심을 거예요"(예고)가 아니라 "방금 14알을 심었어요"(사실)가 되어 짧아진다.

  【학습·결과 화면을 여기서 그리지 않는 이유】 맛보기가 아니라 **진짜 첫 학습**이다.
  TakeTest / StudyResult 를 게스트 모드로 그대로 쓴다 — 온보딩에서 본 화면과 실제가
  다르면 그다음부터 신뢰를 잃는다.
*/

// 유입 경로 / 학습 목적 — 큰 버튼 선택지 (각 항목 앞 아이콘)
const CHANNELS = [
  { key: 'friend', label: '지인 추천', Icon: Users },
  { key: 'appstore', label: '앱스토어 검색', Icon: AppStoreLogo },
  { key: 'sns', label: 'SNS·광고', Icon: Megaphone },
  { key: 'search', label: '인터넷 검색', Icon: MagnifyingGlass },
  { key: 'etc', label: '기타', Icon: DotsThreeOutline },
];
const GOALS = [
  { key: 'exam', label: '시험 대비', Icon: GraduationCap },
  { key: 'conversation', label: '회화·여행', Icon: Airplane },
  { key: 'hobby', label: '취미·자기계발', Icon: Sparkle },
  { key: 'abroad', label: '유학·이민', Icon: GlobeHemisphereWest },
];
const DAILY = [
  { key: 5, label: '하루 5알', desc: '가볍게' },
  { key: 10, label: '하루 10알', desc: '적당하게 (추천)' },
  { key: 20, label: '하루 20알', desc: '집중해서' },
  { key: 30, label: '하루 30알', desc: '빠르게' },
];

// 학습을 마친 뒤 묻는 세 가지 — 진행바는 이 구간에만 있다.
// 앞 구간(인사·소개·단어장·예고)은 되돌아갈 일이 없어 진행률이 의미가 없다.
const QUESTION_ORDER = ['channel', 'goal', 'daily'];

// 소개 화면의 예시 밭 — 실제 데이터가 아니라 "이렇게 자란다"를 보여주는 장면이다.
const INTRO_FIELD = { seed: 6, sprout: 5, leaf: 4, carrot: 3 };

// 성장 순서. 밭과 같은 planted(V5) 그림을 쓴다 — 예전 V3 는 흙 원판이 딸려 있어
// 밭과 이 줄에 다른 판을 써야 했지만, V5 는 작물만 있어 한 벌로 충분하다.
//
// 【라벨에 단계 이름을 쓰지 않는다】 씨앗·새싹·이파리·당근은 그림이 이미 말한다.
// 글자는 그림이 못 말하는 것, 즉 **그 단계가 되면 다음 복습이 얼마나 멀어지는지**를 맡는다.
// 숫자 근거: 이파리·당근은 FSRS stability 임계값(10 / 60)으로 갈리고
// (heyvoca_back/app/routes/study.py 의 _STABILITY_SHORT / _STABILITY_MEDIUM),
// 목표 기억률 0.9 에서는 다음 복습 간격(일) = stability 다(fsrs/core.py `_next_interval`).
// 새싹은 간격이 아니라 "심은 다음 학습일 이후 다시 맞히기"라 하루 이상으로 적는다.
const GROWTH_STAGES = [
  { crop: 'seed', label: '처음 맞힘' },
  { crop: 'sprout', label: '1일 이상' },
  { crop: 'leaf', label: '10일 이상' },
  { crop: 'carrot', label: '60일 이상' },
];

// 기억이 넘어가는 세 칸 — 백엔드 `_classify_memory_state`(study.py)가 쓰는 short/medium/long 과
// 같은 구분이다. 경계도 같은 stability 10 / 60 이라 화면과 서버가 어긋나지 않는다.
// 색이 회색 → 연분홍 → 분홍으로 진해지는 것이 곧 "넘어간다"는 표시다.
const MEMORY_STEPS = [
  { key: 'short', label: '단기', days: '1일 뒤',
    box: 'bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-gray-300' },
  { key: 'medium', label: '중기', days: '10일 뒤',
    box: 'bg-primary-main-50 dark:bg-primary-main-dark text-primary-main-600' },
  { key: 'long', label: '장기', days: '60일 뒤',
    box: 'bg-primary-main-600 text-layout-white dark:text-layout-black' },
];

// 온보딩 단어장 → 미리보기 풀시트가 읽는 형태로 변환
const toMeaningStrings = (m) => (Array.isArray(m) ? m : [])
  .map((x) => (typeof x === 'string' ? x : (x?.meaning || '')))
  .filter(Boolean);

// 큰 선택지 버튼 (유입/목적/일일 공용)
const OptionRow = ({ active, Icon, title, desc, onClick }) => (
  <motion.button
    type="button" whileTap={{ scale: 0.98 }} onClick={onClick}
    className={`
      flex items-center gap-[14px] w-full px-[18px] py-[16px] rounded-[14px] border-[2px] text-left mb-[10px]
      ${active
        ? 'border-primary-main-600 bg-primary-main-50 dark:bg-primary-main-dark'
        : 'border-layout-gray-100 dark:border-layout-gray-dark bg-layout-white dark:bg-layout-black'}
    `}
  >
    {Icon && (
      <span className={`flex items-center justify-center w-[36px] h-[36px] rounded-[10px] flex-shrink-0
        ${active ? 'bg-primary-main-100 dark:bg-primary-main-dark text-primary-main-600' : 'bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-gray-200'}`}>
        <Icon size={20} weight={active ? 'fill' : 'regular'} />
      </span>
    )}
    <span className="flex flex-col flex-1">
      <span className={`text-[16px] font-[700] ${active ? 'text-primary-main-600' : 'text-layout-black dark:text-layout-white'}`}>{title}</span>
      {desc && <span className="text-[12px] font-[500] text-layout-gray-300 mt-[2px]">{desc}</span>}
    </span>
    {active
      ? <CheckCircle size={24} weight="fill" className="text-primary-main-600 flex-shrink-0" />
      : <span className="w-[22px] h-[22px] rounded-full border-[2px] border-layout-gray-100 dark:border-layout-gray-dark flex-shrink-0" />}
  </motion.button>
);

/*
  망각곡선 — 복습 간격이 왜 점점 벌어지는지 한 장으로 말한다.

  가로는 시간, 세로는 기억. 외운 직후부터 기억은 빠르게 떨어지고(곡선), 바닥선에
  닿기 직전에 다시 맞히면 처음 높이로 돌아온다(세로 점선). **다시 맞힐수록 다음
  곡선이 완만해져** 같은 높이에서 바닥까지 가는 데 걸리는 시간이 길어진다.
  며칠인지는 그래프에 적지 않는다 — 바로 아래 단기·중기·장기 줄이 그 숫자를 맡는다.

  path 몇 개로 직접 그린다 — 그래프 한 장 때문에 차트 라이브러리를 번들에 넣지 않는다.
*/
const ForgettingCurve = () => (
  <svg viewBox="0 0 320 124" className="w-full h-auto"
    role="img" aria-label="복습할수록 기억이 떨어지는 속도가 느려지는 그래프">
    {/* 잊기 직전 — 이 선에 닿기 전에 다시 물어본다 */}
    <line x1="14" y1="112" x2="306" y2="112" strokeWidth="1.5" strokeDasharray="3 4"
      className="stroke-current text-layout-gray-100 dark:text-layout-gray-dark" />

    <g fill="none" strokeWidth="2.6" strokeLinecap="round"
      className="stroke-current text-primary-main-600">
      <path d="M18 28 C 34 74, 52 104, 88 112" />
      <path d="M88 28 C 112 74, 142 104, 178 112" />
      <path d="M178 28 C 216 72, 260 104, 302 112" />
    </g>

    {/* 복습 순간 — 기억이 처음 높이로 돌아온다 */}
    <g strokeWidth="1.5" strokeDasharray="3 3"
      className="stroke-current text-primary-main-600 opacity-40">
      <line x1="88" y1="112" x2="88" y2="28" />
      <line x1="178" y1="112" x2="178" y2="28" />
    </g>
    <g className="fill-current text-primary-main-600">
      <circle cx="18" cy="28" r="4" />
      <circle cx="88" cy="28" r="4" />
      <circle cx="178" cy="28" r="4" />
    </g>
  </svg>
);

// 설명 카드 — 소개·예고 화면에서 규칙 한 가지씩 짚는다
const NoteCard = ({ icon, title, children }) => (
  <div className="rounded-[14px] border border-border dark:border-border-dark p-[15px_16px]">
    <div className="flex items-center gap-[6px] text-[14px] font-[800] tracking-[-0.03em] text-layout-black dark:text-layout-white">
      {icon}{title}
    </div>
    <p className="mt-[6px] text-[12px] font-[500] leading-[1.6] text-layout-gray-400 dark:text-layout-gray-100">
      {children}
    </p>
  </div>
);

const Onboarding = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  useStatusBarStyle('dark-content');
  const navigate = useNavigate();
  const location = useLocation();
  const { pushNewFullSheet, popNewFullSheet } = useNewFullSheetActions();
  const { pushAwaitNewBottomSheet } = useNewBottomSheetActions();
  const { Login, AppleLogin, clickGoogleOauth, clickAppleOauth, isLogin, fetchUserProfile, performLogout } = useUser();

  // 온보딩 내부 로그인/회원가입 스텝(auth)에서만 앱 OAuth 노출 (안드로이드는 애플 숨김)
  const isAndroid = getDevicePlatform() === 'android' || navigator.userAgent.toLowerCase().includes('android');

  const saved = getGuest() || {};
  // 학습에서 돌아온 경우 location.state.step 으로 스텝 지정
  //  - 'channel': 학습·결과 완료 → 질문 구간으로  /  'ready': 학습 중 뒤로가기 → 예고로 복귀
  const incomingStep = location.state?.step;

  const [step, setStep] = useState(incomingStep || 'hello');
  const [books, setBooks] = useState([]);
  const [level, setLevel] = useState(saved.level ?? null);
  const [seedCount, setSeedCount] = useState(saved.seed_count ?? 0);
  const [plantedCount, setPlantedCount] = useState(saved.planted_count ?? 0);
  const [channel, setChannel] = useState(saved.source_channel ?? null);
  const [goal, setGoal] = useState(saved.learning_goal ?? null);
  const [daily, setDaily] = useState(saved.daily_new_limit ?? null);
  const [username, setUsername] = useState(saved.username ?? '');
  const [loadingTrial, setLoadingTrial] = useState(false);
  const [openingPreview, setOpeningPreview] = useState(false);
  // 이미 로그인된 사용자가 온보딩을 진행할 때 auth 스텝을 건너뛰고 서버 migrate 처리 중임을 표시
  const [finishingOnboarding, setFinishingOnboarding] = useState(false);

  const answers = saved.answers ?? [];
  // 오늘 심을 수 — 첫날은 하루 목표와 무관하게 고정이고, 단어장이 그보다 작으면 그 수만큼만.
  // 예고 화면(ready)은 아직 학습 전이라 이 값으로 말한다.
  const todayPlan = seedCount > 0
    ? Math.min(ONBOARDING_FIRST_DAY_WORDS, seedCount)
    : ONBOARDING_FIRST_DAY_WORDS;
  // 실제로 심은 수 — 학습을 마쳤으면 그 수. 아직이면 예정 수로 말한다.
  const planted = plantedCount || answers.length || todayPlan;
  const restSeeds = Math.max(0, seedCount - todayPlan);

  // 선택 가능한 단어장 목록 로드
  useEffect(() => {
    let alive = true;
    getOnboardingBooksApi().then((res) => {
      if (alive && res?.code === 200) setBooks(res.data || []);
    });
    return () => { alive = false; };
  }, []);

  // 온보딩 내부 인증(auth) 스텝용 앱 OAuth 콜백 리스너 (Login 페이지와 동일 로직)
  // 로그인 성공 시 홈으로 이동 → 홈에서 게스트 데이터 이전 + 알림 프롬프트가 이어짐
  useEffect(() => {
    const onGoogle = async (data) => {
      const { googleId, email, name, status } = data || {};
      if (!googleId || !email || !name || !status) return;
      try {
        const result = await Login({ googleId, email, name, status });
        if (result?.success) navigate('/');
      } catch (e) { /* 로그인 처리 오류 무시 */ }
    };
    const onApple = async (data) => {
      const { identityToken, email, fullName, status, authorizationCode } = data || {};
      if (!identityToken || !status) return;
      try {
        const result = await AppleLogin({ identityToken, fullName, email, status, authorizationCode });
        if (result?.success) navigate('/');
      } catch (e) { /* 로그인 처리 오류 무시 */ }
    };
    postMessageManager.setupAppGoogleAuth(onGoogle);
    postMessageManager.setupAppAppleAuth(onApple);
    return () => {
      postMessageManager.removeAppGoogleAuth();
      postMessageManager.removeAppAppleAuth();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isQuestion = QUESTION_ORDER.includes(step);
  const questionIndex = QUESTION_ORDER.indexOf(step);

  // 뒤로가기가 있는 스텝과, 각 스텝의 이전 자리.
  // 학습은 별도 라우트라 그 앞뒤(ready ↔ channel)는 이어 붙이지 않는다 —
  // 학습을 마친 사람을 예고 화면으로 되돌리면 다시 학습하게 된다.
  const BACK_TO = {
    intro: 'hello',
    memory: 'intro',
    level: 'memory',
    ready: 'level',
    goal: 'channel',
    daily: 'goal',
    nick: 'daily',
  };

  const goLogin = () => { vibrate({ duration: 5 }); navigate('/login'); };

  // 이미 로그인된 상태에서 온보딩에 갇힌 경우 — 확인 바텀시트 후 로그아웃하고 로그인 화면으로 이동.
  // fromOnboarding state를 넘기지 않으므로 Login.jsx에서 회원가입 버튼도 그대로 노출된다.
  const goSwitchAccount = async () => {
    vibrate({ duration: 5 });
    const confirmed = await pushAwaitNewBottomSheet(
      SwitchAccountNewBottomSheet,
      {},
      { isBackdropClickClosable: true, isDragToCloseEnabled: true }
    );
    if (!confirmed) return;
    await performLogout();
    navigate('/login');
  };

  const goBack = () => {
    vibrate({ duration: 5 });
    const prev = BACK_TO[step];
    if (prev) setStep(prev);
  };

  // 단어장 카드 클릭 → 실제 미리보기 풀시트를 열고, 거기서 담는다.
  // 서점에서 단어장을 고르는 동선(PreviewBookStoreNewFullSheet)과 같다.
  const openBookPreview = async (book) => {
    if (openingPreview) return;
    vibrate({ duration: 5 });
    setOpeningPreview(true);
    try {
      const res = await getLevelBookApi(book.level);
      const vocaList = res?.data?.vocaList || [];
      const sheet = {
        id: book.id,
        name: book.name,
        category: book.category,
        color: book.color,
        gem: 0,
        words: vocaList.map((w) => ({
          id: w.voca_id,
          origin: w.origin,
          meanings: toMeaningStrings(w.meanings),
          examples: w.examples || [],
        })),
      };
      pushNewFullSheet(PreviewBookStoreNewFullSheet, {
        bookStoreVocabularySheet: sheet,
        // 밭 그림과 씨앗 수는 앞뒤 화면이 이미 말한다 — 여기서는 단어만 보여 준다
        hideFieldHero: true,
        primaryActionLabel: '이 단어장으로 시작하기',
        onPrimaryAction: () => {
          vibrate({ duration: 5 });
          const seeds = vocaList.length || book.word_count || 0;
          setLevel(book.level);
          setSeedCount(seeds);
          patchGuest({ level: book.level, seed_count: seeds });
          popNewFullSheet();
          setStep('ready');
        },
      });
    } finally {
      setOpeningPreview(false);
    }
  };

  // 유입/목적/일일 — 선택만(다음 버튼으로 진행)
  const pickChannel = (key) => { vibrate({ duration: 5 }); setChannel(key); patchGuest({ source_channel: key }); };
  const pickGoal = (key) => { vibrate({ duration: 5 }); setGoal(key); patchGuest({ learning_goal: key }); };
  const pickDaily = (key) => { vibrate({ duration: 5 }); setDaily(key); patchGuest({ daily_new_limit: key }); };

  // 첫 학습 시작 — 고른 단어장으로 실제 학습 화면(TakeTest)을 그대로 띄운다.
  // 여기서 만든 문제는 첫날 분량(14단어)이고, 하루 목표는 내일부터 적용된다.
  const startTrial = async () => {
    if (loadingTrial || !level) return;
    vibrate({ duration: 5 });
    // 채점 효과음 저지연 재생 준비 — 반드시 이 클릭(user gesture)의 동기 시점에
    // 호출해야 Web Audio AudioContext가 unlock되고 mp3가 미리 디코드된다(await 이후엔 unlock 실패).
    // 미호출 시 /take-test에서 느린 HTMLAudio 폴백으로 재생돼 효과음이 늦게 난다.
    primeSfx();
    setLoadingTrial(true);
    try {
      const res = await getLevelBookApi(level);
      const questions = buildGuestQuestions(res?.data?.vocaList || []);
      if (questions.length === 0) { setStep('channel'); return; }
      const words = countGuestWords(questions);
      setPlantedCount(words);
      // router state가 기기에서 유실돼도 게스트 학습으로 뜨도록 localStorage에도 저장
      patchGuest({ planted_count: words });
      setGuestTrial(questions);
      navigate('/take-test', { state: { testType: 'today', guestMode: true, guestQuestions: questions } });
    } finally {
      setLoadingTrial(false);
    }
  };

  const handleNickNext = () => {
    vibrate({ duration: 5 });
    const trimmedUsername = username.trim() || null;
    patchGuest({
      level, source_channel: channel, learning_goal: goal,
      daily_new_limit: daily, username: trimmedUsername,
    });
    // 알림 권한은 온보딩이 아니라 로그인 후 홈 첫 진입에서 요청 → 플래그만 남긴다
    try { localStorage.setItem('heyvoca_notif_prompt', '1'); } catch (e) { /* 무시 */ }

    if (isLogin) {
      // 이미 로그인된 사용자(게스트 온보딩 없이 로그인 후 다시 온보딩에 진입한 경우) —
      // 재로그인이 필요 없으므로 마지막 auth 스텝은 건너뛰고 서버로 바로 이전(migrate)한 뒤 홈으로 이동.
      finishLoggedInOnboarding(trimmedUsername);
      return;
    }
    setStep('auth');
  };

  // 이미 로그인된 사용자의 온보딩 완료 처리 — guestStorage 대신 현재 온보딩 진행 상태(state)를
  // 곧바로 서버 /onboarding/migrate로 전송한다. 성공(200) 또는 이미 처리됨(409) 모두 정상 종료로 본다.
  // 네트워크 실패 등으로 migrate가 실패해도 로그인 상태 자체는 유효하므로 홈으로는 보낸다 —
  // 이 경우 onboarding_ver가 갱신되지 않아 다음 앱 실행 시 Index.jsx가 다시 /onboarding으로 보내는
  // 자연스러운 재시도가 이루어진다.
  const finishLoggedInOnboarding = async (trimmedUsername) => {
    if (finishingOnboarding) return;
    setFinishingOnboarding(true);
    try {
      const res = await migrateOnboardingApi({
        level,
        source_channel: channel,
        learning_goal: goal,
        daily_new_limit: daily,
        username: trimmedUsername,
        answers,
      });
      if (res?.code === 200 || res?.code === 409) {
        clearGuest();
        // 홈 등 다른 화면에서 최신 닉네임/온보딩 상태가 바로 보이도록 프로필 재조회(best-effort)
        fetchUserProfile().catch(() => { /* 무시 — 다음 조회 시 갱신됨 */ });
      }
    } catch (e) {
      /* 실패해도 로그인 흐름은 계속 — 아래 finally에서 홈으로 이동 */
    } finally {
      setFinishingOnboarding(false);
      navigate('/home', { replace: true });
    }
  };

  // ── 공용 조각 ─────────────────────────────────────────────────────
  const Cta = ({ label, onClick, disabled }) => (
    <motion.button
      type="button" whileTap={disabled ? undefined : { scale: 0.97 }} disabled={disabled}
      onClick={onClick}
      className="w-full h-[52px] rounded-[12px] bg-primary-main-600 text-layout-white dark:text-layout-black text-[16px] font-[700] tracking-[-0.03em] disabled:opacity-40"
    >
      {label}
    </motion.button>
  );

  // 하단 로그인 링크 — 첫 화면에서만. 로그인된 상태면 계정 전환 출구가 된다.
  const LoginFooter = () => (
    <button type="button" onClick={isLogin ? goSwitchAccount : goLogin}
      className="w-full mt-[14px] text-[13px] font-[500] text-layout-gray-300 dark:text-layout-gray-100 underline">
      {isLogin ? '다른 계정으로 로그인' : '이미 계정이 있어요 · 로그인'}
    </button>
  );

  const Headline = ({ children, sub }) => (
    <div className="text-[21px] font-[700] leading-[1.42] tracking-[-0.03em] text-center text-layout-black dark:text-layout-white">
      {children}
      {sub && (
        <span className="block mt-[9px] text-[12.5px] font-[500] leading-[1.6] text-layout-gray-300">
          {sub}
        </span>
      )}
    </div>
  );

  const stepBody = useMemo(() => `on-${step}`, [step]);

  return (
    <div className="flex flex-col h-screen w-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>

      {/* 진행 헤더 — 뒤로가기는 되돌아갈 자리가 있는 스텝에만, 진행바는 질문 3개에만 */}
      {(BACK_TO[step] || isQuestion) && (
        <div data-page-header className="relative flex items-end w-full h-[55px] px-[10px] pb-[13px] shrink-0">
          {BACK_TO[step] && (
            <motion.button onClick={goBack}
              className="flex text-layout-gray-200 dark:text-layout-white rounded-[8px]"
              whileHover={{ backgroundColor: 'rgba(0,0,0,0.05)', scale: 1.05 }}
              whileTap={{ scale: 0.95, backgroundColor: 'rgba(0,0,0,0.1)' }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}>
              <CaretLeft size={24} />
            </motion.button>
          )}
        </div>
      )}
      {isQuestion && (
        <div className="px-[16px] shrink-0">
          <div className="relative w-full h-[16px] rounded-[50px] bg-primary-main-100 dark:bg-layout-gray-dark overflow-hidden">
            <motion.div className="h-[100%] rounded-[50px] bg-primary-main-600"
              initial={{ width: '0%' }} animate={{ width: `${(questionIndex + 1) / QUESTION_ORDER.length * 100}%` }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }} />
            <span className="absolute right-[10px] top-[50%] translate-y-[-50%] text-[#7b7b7b] text-[10px] font-semibold tracking-[-0.2px]">
              {questionIndex + 1}/{QUESTION_ORDER.length}
            </span>
          </div>
        </div>
      )}

      {/*
        스텝 전환은 **들어오는 쪽만** 애니메이션한다.
        AnimatePresence(mode="wait")로 나가는 쪽까지 기다리게 하면, exit 완료 신호가
        한 번이라도 늦으면 화면이 통째로 멈춰 다음 스텝이 영영 안 나온다(실제로 그랬다).
        key가 바뀌면 React가 새로 마운트하므로 initial→animate가 매번 다시 돈다.
      */}
      <motion.div
        key={stepBody}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
        className="flex flex-col flex-1 min-h-0"
      >
          {/* ① 인사 — 기능 설명 없이 누가 말을 거는지만 */}
          {step === 'hello' && (
            <>
              <div className="flex flex-col flex-1 items-center justify-center text-center px-[28px]">
                <img src={CROP_ASSETS.mascotSolo} alt="" draggable={false}
                  className="w-[196px] h-[196px] object-contain select-none mb-[30px]" />
                <h1 className="text-[25px] font-[800] leading-[1.42] tracking-[-0.04em] text-layout-black dark:text-layout-white">
                  안녕하세요!<br />저는 <span className="text-primary-main-600">헤이보카</span>예요
                </h1>
                <p className="mt-[14px] text-[14px] font-[500] leading-[1.7] text-layout-gray-300">
                  단어 외우는 걸 도와줄 농부예요.<br />같이 밭 하나 가꿔볼까요?
                </p>
              </div>
              <div className="px-[24px] pt-[18px] pb-[26px] shrink-0">
                <Cta label="시작하기" onClick={() => { vibrate({ duration: 5 }); setStep('intro'); }} />
                <LoginFooter />
              </div>
            </>
          )}

          {/* ② 서비스 소개 — 밭이 나오는 유일한 화면.
              밭과 진화 줄 모두 planted(V5)를 쓴다. V5 에는 흙 원판이 없어 밭 위에 얹어도
              얼룩이 지지 않는다 — 예전에 켜 두던 soloCrops(=V3 unplanted)는 필요 없어졌다. */}
          {step === 'intro' && (
            <>
              <div className="relative h-[340px] shrink-0 overflow-hidden">
                <div className="absolute inset-x-0 top-[10px] z-[16] px-[26px]">
                  <Headline>
                    단어를 외우면<br />
                    <span className="text-primary-main-600">당근이 자라요</span>
                  </Headline>
                </div>
                <div className="absolute left-[-6%] w-[112%] bottom-[-4px]">
                  <FarmField
                    counts={INTRO_FIELD}
                    maxSprites={24}
                    mascot
                    reserveSigns={false}
                  />
                </div>
              </div>

              {/* 진화 줄 — 그림 아래 글자는 단계 이름이 아니라 **다음 복습일**이다.
                  단계 이름은 그림이 이미 말하고 있어 한 번 더 적으면 자리만 먹는다. */}
              <div className="flex flex-col flex-1 min-h-0 justify-center px-[20px] pt-[10px] pb-[10px]">
                <p className="text-center text-[12.5px] font-[600] leading-[1.6] tracking-[-0.03em] text-layout-gray-300">
                  다음 <b className="text-layout-black dark:text-layout-white">복습일이 멀어질수록</b> 자라요
                </p>
                <div className="flex items-end justify-between gap-[2px] pt-[16px]">
                  {GROWTH_STAGES.map((s, i) => (
                    <React.Fragment key={s.crop}>
                      <span className="flex flex-1 flex-col items-center gap-[9px]">
                        {/* 씨앗만 낱알(bare)로 그린다 — V5 의 심은 씨앗은 512 캔버스에서 32px 이라
                            60px 상자에서는 4px 점이 되어 진화 줄의 첫 칸이 비어 보인다. */}
                        <img src={cropAssetByVariant(s.crop, 'healthy', { solo: s.crop === 'seed' })}
                          alt="" draggable={false}
                          className="block w-[60px] h-[60px] object-contain object-bottom select-none" />
                        <span className="text-[11.5px] font-[800] tracking-[-0.03em] text-layout-gray-400 dark:text-layout-gray-100">
                          {s.label}
                        </span>
                      </span>
                      {i < GROWTH_STAGES.length - 1 && (
                        <CaretRight size={13} weight="fill" className="shrink-0 mb-[30px] text-layout-gray-100" />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              <div className="px-[24px] pt-[18px] pb-[26px] shrink-0">
                <Cta label="좋아요" onClick={() => { vibrate({ duration: 5 }); setStep('memory'); }} />
              </div>
            </>
          )}

          {/* ③ 복습일 자동 계산 — 앞 화면이 "얼마나 멀어지는지"를 보여줬으니
              여기서는 "그 날짜를 누가 정하는지"에 답한다. 밭 그림은 쓰지 않는다. */}
          {step === 'memory' && (
            <>
              <div className="flex flex-col flex-1 min-h-0 px-[24px] pt-[6px]">
                <Headline>
                  다음 물 줄 날은<br />
                  <span className="text-primary-main-600">제가 계산해요</span>
                </Headline>

                <div className="mt-[34px]">
                  <ForgettingCurve />

                  {/* 앞 화면의 진화 줄과 같은 짜임 — 그림 자리에 기억의 칸이 들어간다 */}
                  <div className="flex items-end justify-between gap-[4px] mt-[34px] px-[6px]">
                    {MEMORY_STEPS.map((m, i) => (
                      <React.Fragment key={m.key}>
                        <span className="flex flex-1 flex-col items-center gap-[9px]">
                          <span className={`flex items-center justify-center w-full h-[40px] rounded-[11px] text-[14.5px] font-[800] tracking-[-0.03em] ${m.box}`}>
                            {m.label}
                          </span>
                          <span className="text-[11.5px] font-[800] tracking-[-0.03em] text-layout-gray-400 dark:text-layout-gray-100">
                            {m.days}
                          </span>
                        </span>
                        {i < MEMORY_STEPS.length - 1 && (
                          <CaretRight size={13} weight="fill" className="shrink-0 mb-[30px] text-layout-gray-100" />
                        )}
                      </React.Fragment>
                    ))}
                  </div>

                  <p className="mt-[22px] text-center text-[12.5px] font-[600] leading-[1.6] tracking-[-0.03em] text-layout-gray-300">
                    잊기 직전에 다시 물어봐서<br />
                    <b className="text-layout-black dark:text-layout-white">기억을 한 칸씩 밀어 올려요</b>
                  </p>
                </div>
              </div>

              <div className="px-[24px] pt-[18px] pb-[26px] shrink-0">
                <Cta label="좋아요" onClick={() => { vibrate({ duration: 5 }); setStep('level'); }} />
              </div>
            </>
          )}

          {/* ④ 단어장 고르기 — 서점 카드 규격 그대로. 값을 받지 않으므로 가격 자리는 비운다. */}
          {step === 'level' && (
            <div className="flex flex-col flex-1 min-h-0 px-[24px] pt-[16px] overflow-y-auto">
              <h1 className="text-[22px] font-[800] leading-[1.35] tracking-[-0.04em] text-layout-black dark:text-layout-white">
                어떤 단어장으로<br />시작할까요?
              </h1>
              <p className="mt-[9px] mb-[18px] text-[12.5px] font-[500] leading-[1.6] text-layout-gray-300">
                카드를 누르면 어떤 단어가 들었는지 볼 수 있어요.
              </p>
              <ul className="grid grid-cols-2 gap-[15px] pb-[24px]">
                {books.map((b) => (
                  <BookCard key={b.id} item={b} priceLabel="" onClick={() => openBookPreview(b)} />
                ))}
              </ul>
            </div>
          )}

          {/* ⑤ 심기 예고 — 씨앗을 늘어놓지 않는다. 제목 두 줄과 그림 하나. */}
          {step === 'ready' && (
            <>
              <div className="flex flex-col flex-1 min-h-0 items-center justify-center px-[26px]">
                <Headline sub={restSeeds > 0 ? `나머지 ${restSeeds.toLocaleString()}알은 내일부터 심어요` : null}>
                  씨앗 <span className="text-primary-main-600">{seedCount.toLocaleString()}알</span>을 담았어요<br />
                  오늘은 <span className="text-primary-main-600">{todayPlan}알</span>만 심어볼게요
                </Headline>
                <img src={CROP_ASSETS.mascotWatering} alt="" draggable={false}
                  className="w-[210px] h-[210px] object-contain select-none mt-[26px]" />
              </div>
              <div className="px-[24px] shrink-0">
                <NoteCard icon={<CheckCircle size={16} weight="fill" className="text-status-success-600" />}
                  title="틀려도 괜찮아요">
                  맞힐 때까지 <b className="text-layout-black dark:text-layout-white">뒤에서 다시</b> 물어봐요.
                  뜻 고르기 · 듣고 고르기 · 카드 맞추기가 돌아가며 나와요.
                </NoteCard>
              </div>
              <div className="px-[24px] pt-[18px] pb-[26px] shrink-0">
                <Cta label={loadingTrial ? '불러오는 중...' : '첫 학습 시작'}
                  disabled={loadingTrial} onClick={startTrial} />
              </div>
            </>
          )}

          {/* ⑩ 유입 경로 */}
          {step === 'channel' && (
            <>
              <div className="flex flex-col flex-1 min-h-0 px-[24px] pt-[20px] overflow-y-auto">
                <h1 className="text-[22px] font-[800] leading-[1.35] tracking-[-0.04em] text-layout-black dark:text-layout-white mb-[20px]">
                  헤이보카를<br />어떻게 알게 되셨어요?
                </h1>
                {CHANNELS.map((c) => (
                  <OptionRow key={c.key} active={channel === c.key} Icon={c.Icon} title={c.label} onClick={() => pickChannel(c.key)} />
                ))}
              </div>
              <div className="px-[24px] pt-[18px] pb-[26px] shrink-0">
                <Cta label="다음" disabled={!channel} onClick={() => { vibrate({ duration: 5 }); setStep('goal'); }} />
              </div>
            </>
          )}

          {/* ⑪ 학습 목적 */}
          {step === 'goal' && (
            <>
              <div className="flex flex-col flex-1 min-h-0 px-[24px] pt-[20px] overflow-y-auto">
                <h1 className="text-[22px] font-[800] leading-[1.35] tracking-[-0.04em] text-layout-black dark:text-layout-white mb-[20px]">
                  어떤 목표로<br />공부하세요?
                </h1>
                {GOALS.map((g) => (
                  <OptionRow key={g.key} active={goal === g.key} Icon={g.Icon} title={g.label} onClick={() => pickGoal(g.key)} />
                ))}
              </div>
              <div className="px-[24px] pt-[18px] pb-[26px] shrink-0">
                <Cta label="다음" disabled={!goal} onClick={() => { vibrate({ duration: 5 }); setStep('daily'); }} />
              </div>
            </>
          )}

          {/* ⑫ 하루 목표 — 학습 뒤라 "오늘 n알"이 예고가 아니라 이미 일어난 일이다 */}
          {step === 'daily' && (
            <>
              <div className="flex flex-col flex-1 min-h-0 px-[24px] pt-[20px] overflow-y-auto">
                <h1 className="text-[22px] font-[800] leading-[1.35] tracking-[-0.04em] text-layout-black dark:text-layout-white mb-[20px]">
                  <span className="text-primary-main-600">내일부터</span> 하루에<br />몇 알씩 심을까요?
                </h1>
                {DAILY.map((d) => (
                  <OptionRow key={d.key} active={daily === d.key} title={d.label} desc={d.desc} onClick={() => pickDaily(d.key)} />
                ))}
                <div className="flex gap-[8px] rounded-[10px] bg-primary-main-50 dark:bg-primary-main-dark p-[11px_12px] mt-[2px]">
                  <p className="text-[11.5px] font-[500] leading-[1.6] text-primary-main-600">
                    오늘 심은 <b className="font-[800]">{planted}알</b>은 첫날 분량이에요.
                    여기서 고른 개수는 <b className="font-[800]">내일부터</b> 적용됩니다.
                  </p>
                </div>
              </div>
              <div className="px-[24px] pt-[18px] pb-[26px] shrink-0">
                <Cta label="정했어요" disabled={!daily} onClick={() => { vibrate({ duration: 5 }); setStep('nick'); }} />
              </div>
            </>
          )}

          {/* ⑬ 닉네임 */}
          {step === 'nick' && (
            <>
              <div className="flex flex-col flex-1 min-h-0 px-[24px] pt-[20px]">
                <h1 className="text-[22px] font-[800] leading-[1.35] tracking-[-0.04em] text-layout-black dark:text-layout-white mb-[20px]">
                  어떻게 부르면<br />될까요?
                </h1>
                <input
                  value={username} onChange={(e) => setUsername(e.target.value.slice(0, 8))}
                  placeholder="닉네임을 입력해주세요"
                  className="w-full h-[52px] px-[16px] rounded-[12px] bg-layout-gray-50 dark:bg-layout-gray-dark text-[15px] font-[600] text-layout-black dark:text-layout-white outline-none"
                />
                <div className="mt-[8px] mr-[2px] text-right text-[11.5px] font-[600] text-layout-gray-200">
                  {username.trim().length} / 8
                </div>
                <p className="mt-[6px] text-[11.5px] font-[500] leading-[1.6] text-layout-gray-300">
                  나중에 언제든 바꿀 수 있어요.
                </p>
              </div>
              <div className="px-[24px] pt-[18px] pb-[26px] shrink-0">
                <Cta label={finishingOnboarding ? '처리 중...' : '다음'}
                  disabled={!username.trim() || finishingOnboarding} onClick={handleNickNext} />
              </div>
            </>
          )}

          {/* ⑭ 로그인 · 회원가입 — 심은 걸 저장한다는 이유만 위에 적는다 */}
          {step === 'auth' && (
            <>
              <div className="flex flex-col flex-1 min-h-0 items-center justify-center text-center px-[28px]">
                <img src={CROP_ASSETS.mascotSolo} alt="" draggable={false}
                  className="w-[132px] h-[132px] object-contain select-none mb-[26px]" />
                <h1 className="text-[23px] font-[800] leading-[1.4] tracking-[-0.04em] text-layout-black dark:text-layout-white">
                  {username.trim()
                    ? <><span className="text-primary-main-600">{username.trim()}</span>님, 거의 다 왔어요</>
                    : '거의 다 왔어요'}
                </h1>
                <p className="mt-[14px] text-[14px] font-[500] leading-[1.7] text-layout-gray-300">
                  방금 심은 씨앗 {planted}알을 저장할게요.
                </p>
              </div>
              <div className="flex flex-col gap-[10px] px-[24px] pb-[26px] shrink-0">
                <motion.button type="button" whileTap={{ scale: 0.97 }}
                  onClick={() => { vibrate({ duration: 5 }); clickGoogleOauth(); }}
                  className="flex items-center justify-center w-full h-[52px] bg-layout-white border border-layout-gray-200 rounded-[12px] text-black text-[16px] font-[700] gap-[10px]">
                  <img src={googleLogo} alt="" className="h-[22px]" />
                  <span>Google로 계속하기</span>
                </motion.button>
                {!isAndroid && (
                  <motion.button type="button" whileTap={{ scale: 0.97 }}
                    onClick={() => { vibrate({ duration: 5 }); clickAppleOauth(); }}
                    className="flex items-center justify-center w-full h-[52px] bg-black border border-black rounded-[12px] text-layout-white text-[16px] font-[700] gap-[8px]">
                    <AppleLogo size={22} weight="fill" color="#FFFFFF" />
                    <span>Apple로 계속하기</span>
                  </motion.button>
                )}
                <p className="mt-[6px] text-center text-[11px] font-[500] leading-[1.65] text-layout-gray-200">
                  계속하면 <span className="underline text-layout-gray-300">이용약관</span>과{' '}
                  <span className="underline text-layout-gray-300">개인정보처리방침</span>에 동의하게 됩니다.
                </p>
              </div>
            </>
          )}
      </motion.div>
    </div>
  );
};

export default Onboarding;
