import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CaretLeft, CheckCircle, AppleLogo,
  Users, AppStoreLogo, Megaphone, MagnifyingGlass, DotsThreeOutline,
  GraduationCap, Airplane, Sparkle, GlobeHemisphereWest,
} from '@phosphor-icons/react';
import HeyCharacter from '../assets/images/HeyCharacter02.png';
import gemImg from '../assets/images/gem.png';
import googleLogo from '../assets/images/google_logo.png';
import { getOnboardingBooksApi, getLevelBookApi, migrateOnboardingApi } from '../api/study';
import { patchGuest, getGuest, setGuestTrial, clearGuest } from '../utils/guestStorage';
import { buildGuestQuestions } from '../utils/guestQuestions';
import { vibrate, getDevicePlatform } from '../utils/osFunction';
import { primeSfx } from '../utils/audio';
import { BookCard } from '../components/bookStore/BookSection';
import { PreviewBookStoreNewFullSheet } from '../components/newfullsheet/PreviewBookStoreNewFullSheet';
import { SwitchAccountNewBottomSheet } from '../components/newBottomSheet/SwitchAccountNewBottomSheet';
import { useNewFullSheetActions } from '../context/NewFullSheetContext';
import { useNewBottomSheetActions } from '../context/NewBottomSheetContext';
import { useUser } from '../context/UserContext';
import postMessageManager from '../utils/postMessageManager';
import PlantIllustration from '../components/common/PlantIllustration';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';

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
  { key: 5, label: '하루 5개', desc: '가볍게 시작' },
  { key: 10, label: '하루 10개', desc: '적당하게 (추천)' },
  { key: 20, label: '하루 20개', desc: '집중해서' },
  { key: 30, label: '하루 30개', desc: '빠르게' },
];

// 개인화 4스텝 프로그래스 (단어장/유입/목적/일일)
const PERSONALIZE_ORDER = ['level', 'channel', 'goal', 'daily'];

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
        ${active ? 'bg-primary-main-100 dark:bg-primary-main-dark text-primary-main-600' : 'bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-gray-300'}`}>
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
  // takeTest에서 돌아온 경우 location.state.step으로 스텝 지정
  //  - 'reward': 맛보기 완료 → 보상  /  'daily': 맛보기 중 뒤로가기 → 일일 목표로 복귀
  const incomingStep = location.state?.step;
  const returned = incomingStep === 'reward';

  const [step, setStep] = useState(incomingStep || 'start');
  const [books, setBooks] = useState([]);
  const [level, setLevel] = useState(saved.level ?? null);
  const [channel, setChannel] = useState(saved.source_channel ?? null);
  const [goal, setGoal] = useState(saved.learning_goal ?? null);
  const [daily, setDaily] = useState(saved.daily_new_limit ?? null);
  const [username, setUsername] = useState('');
  const [loadingTrial, setLoadingTrial] = useState(false);
  const [openingPreview, setOpeningPreview] = useState(false);
  // 이미 로그인된 사용자가 온보딩을 진행할 때 auth 스텝을 건너뛰고 서버 migrate 처리 중임을 표시
  const [finishingOnboarding, setFinishingOnboarding] = useState(false);

  // 맛보기 결과 (takeTest에서 넘어온 답안)
  const answers = returned ? (location.state?.answers ?? []) : (saved.answers ?? []);
  const correctCount = answers.filter((a) => a.correct).length;

  // 선택 가능한 단어장 목록 로드
  useEffect(() => {
    let alive = true;
    getOnboardingBooksApi().then((res) => {
      if (alive && res?.code === 200) setBooks(res.data || []);
    });
    return () => { alive = false; };
  }, []);

  // reward 재진입 시 답안을 guest에 병합 저장
  useEffect(() => {
    if (returned && answers.length > 0) patchGuest({ answers });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returned]);

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

  const persistAll = (patch) => patchGuest({
    level, source_channel: channel, learning_goal: goal, daily_new_limit: daily, ...patch,
  });

  const isPersonalize = PERSONALIZE_ORDER.includes(step);
  const stepIndex = PERSONALIZE_ORDER.indexOf(step);

  const goLogin = () => { vibrate({ duration: 5 }); navigate('/login'); };

  // 이미 로그인된 상태에서 온보딩에 갇힌 경우 — 확인 바텀시트 후 로그아웃하고 로그인 화면으로 이동.
  // fromOnboarding state를 넘기지 않으므로 Login.jsx에서 회원가입 버튼도 그대로 노출된다.
  const goSwitchAccount = async () => {
    vibrate({ duration: 5 });
    const confirmed = await pushAwaitNewBottomSheet(
      SwitchAccountNewBottomSheet,
      {},
      {
        isBackdropClickClosable: true,
        isDragToCloseEnabled: true
      }
    );
    if (!confirmed) return;
    await performLogout();
    navigate('/login');
  };

  const goBack = () => {
    vibrate({ duration: 5 });
    const order = ['start', ...PERSONALIZE_ORDER];
    const i = order.indexOf(step);
    if (i > 0) setStep(order[i - 1]);
  };

  // 단어장 카드 클릭 → 실제 미리보기 풀시트 열고, 거기서 선택
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
        primaryActionLabel: '이 단어장 선택하기',
        onPrimaryAction: () => {
          vibrate({ duration: 5 });
          setLevel(book.level);
          patchGuest({ level: book.level });
          popNewFullSheet();
          setStep('channel');
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

  // 맛보기 시작 — 선택 단어장으로 실제 takeTest 구동
  const startTrial = async () => {
    if (loadingTrial || !level || !daily) return;
    vibrate({ duration: 5 });
    // 체험 테스트 채점 효과음 저지연 재생 준비 — 반드시 이 클릭(user gesture)의 동기 시점에
    // 호출해야 Web Audio AudioContext가 unlock되고 mp3가 미리 디코드된다(await 이후엔 unlock 실패).
    // 미호출 시 /take-test에서 느린 HTMLAudio 폴백으로 재생돼 효과음이 늦게 난다.
    primeSfx();
    setLoadingTrial(true);
    persistAll({});
    try {
      const res = await getLevelBookApi(level);
      const questions = buildGuestQuestions(res?.data?.vocaList || []);
      if (questions.length === 0) { setStep('reward'); return; }
      // router state가 기기에서 유실돼도 게스트 맛보기로 뜨도록 localStorage에도 저장
      setGuestTrial(questions);
      navigate('/take-test', { state: { testType: 'today', guestMode: true, guestQuestions: questions } });
    } finally {
      setLoadingTrial(false);
    }
  };

  const handleSignup = () => {
    vibrate({ duration: 5 });
    const trimmedUsername = username.trim() || null;
    persistAll({ username: trimmedUsername });
    // 알림 권한은 온보딩이 아니라 로그인 후 홈 첫 진입에서 요청 → 플래그만 남긴다
    try { localStorage.setItem('heyvoca_notif_prompt', '1'); } catch (e) { /* 무시 */ }

    if (isLogin) {
      // 이미 로그인된 사용자(게스트 온보딩 없이 로그인 후 다시 온보딩에 진입한 경우) —
      // 재로그인이 필요 없으므로 마지막 auth 스텝은 건너뛰고 서버로 바로 이전(migrate)한 뒤 홈으로 이동.
      finishLoggedInOnboarding(trimmedUsername);
      return;
    }

    // 비로그인(게스트) — 온보딩 내부 인증 스텝으로 이어간다 (온보딩 형식 유지)
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

  // 하단 상시 로그인 링크 — 로그인된 상태로 온보딩에 들어온 경우 계정 전환(로그아웃) 출구로 전환
  const LoginFooter = () => {
    // 로그인/비로그인 무관하게 첫 슬라이드(start)에서만 노출 (level/channel/goal/daily 등에서는 숨김)
    if (step !== 'start') return null;
    return (
      <button type="button" onClick={isLogin ? goSwitchAccount : goLogin}
        className="w-full mt-[14px] text-[13px] font-[500] text-layout-gray-300 dark:text-layout-gray-100 underline">
        {isLogin ? '다른 계정으로 로그인' : '이미 계정이 있어요 · 로그인'}
      </button>
    );
  };

  return (
    <div className="flex flex-col h-screen w-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>

      {/* 진행 헤더 — 실제 테스트 화면과 동일 (뒤로 CaretLeft + pill 진행바) */}
      {isPersonalize && (
        <>
          <div data-page-header className="relative flex items-end justify-center w-full h-[55px] px-[16px] py-[14px] bg-layout-white dark:bg-layout-black">
            <div className="absolute left-[10px] bottom-[13px] flex items-center justify-center">
              <motion.button onClick={goBack}
                className="text-layout-gray-200 dark:text-layout-white rounded-[8px]"
                whileHover={{ backgroundColor: 'rgba(0,0,0,0.05)', scale: 1.05 }}
                whileTap={{ scale: 0.95, backgroundColor: 'rgba(0,0,0,0.1)' }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}>
                <CaretLeft size={24} />
              </motion.button>
            </div>
          </div>
          <div className="px-[16px]">
            <div className="relative w-full h-[16px] rounded-[50px] bg-primary-main-100 dark:bg-layout-gray-dark overflow-hidden">
              <motion.div className="h-[100%] rounded-[50px] bg-primary-main-600"
                initial={{ width: '0%' }} animate={{ width: `${(stepIndex + 1) / PERSONALIZE_ORDER.length * 100}%` }}
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }} />
              <span className="absolute right-[10px] top-[50%] translate-y-[-50%] text-[#7b7b7b] text-[10px] font-semibold tracking-[-0.2px]">
                {stepIndex + 1}/{PERSONALIZE_ORDER.length}
              </span>
            </div>
          </div>
        </>
      )}

      <div className="flex flex-col flex-1 px-[24px] pb-[24px] pt-[16px] overflow-y-auto">
        <AnimatePresence mode="wait">
          {/* 진입 */}
          {step === 'start' && (
            <motion.div key="start" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col flex-1">
              <div className="flex flex-col flex-1 items-center justify-center text-center">
                <img src={HeyCharacter} alt="" className="w-[150px] h-[150px] object-contain mb-[28px]" />
                <h1 className="text-[25px] font-[800] leading-[1.4] text-layout-black dark:text-layout-white">
                  <span className="text-primary-main-600">내가 원하는 단어장</span>으로<br />
                  효과적인 무료 단어 암기!
                </h1>
              </div>
              <div className="w-full">
                <motion.button type="button" whileTap={{ scale: 0.97 }}
                  onClick={() => { vibrate({ duration: 5 }); setStep('level'); }}
                  className="w-full py-[16px] rounded-[12px] bg-primary-main-600 text-layout-white dark:text-layout-black text-[17px] font-[700]">
                  시작하기
                </motion.button>
                <LoginFooter />
              </div>
            </motion.div>
          )}

          {/* 1-a 단어장 선택 (서점 카드 그대로 · 클릭 시 미리보기 풀시트에서 선택) */}
          {step === 'level' && (
            <motion.div key="level" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="flex flex-col flex-1">
              <h1 className="text-[22px] font-[800] leading-[1.35] text-layout-black dark:text-layout-white mb-[18px]">
                어떤 단어장으로<br />배워볼까요?
              </h1>
              <ul className="grid grid-cols-2 gap-[15px]">
                {books.map((b) => (
                  <BookCard key={b.id} item={b} priceLabel="무료" onClick={() => openBookPreview(b)} />
                ))}
              </ul>
              <div className="mt-auto pt-[8px]">
                <LoginFooter />
              </div>
            </motion.div>
          )}

          {/* 1-b 유입 경로 */}
          {step === 'channel' && (
            <motion.div key="channel" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="flex flex-col flex-1">
              <h1 className="text-[22px] font-[800] leading-[1.35] text-layout-black dark:text-layout-white mb-[20px]">
                어떻게<br />알게 되셨어요?
              </h1>
              <div className="flex flex-col">
                {CHANNELS.map((c) => (
                  <OptionRow key={c.key} active={channel === c.key} Icon={c.Icon} title={c.label} onClick={() => pickChannel(c.key)} />
                ))}
              </div>
              <div className="mt-auto pt-[20px]">
                <motion.button type="button" whileTap={channel ? { scale: 0.97 } : undefined} disabled={!channel}
                  onClick={() => { vibrate({ duration: 5 }); setStep('goal'); }}
                  className="w-full py-[16px] rounded-[12px] bg-primary-main-600 text-layout-white dark:text-layout-black text-[16px] font-[700] disabled:opacity-40">
                  다음
                </motion.button>
                <LoginFooter />
              </div>
            </motion.div>
          )}

          {/* 1-c 학습 목적 */}
          {step === 'goal' && (
            <motion.div key="goal" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="flex flex-col flex-1">
              <h1 className="text-[22px] font-[800] leading-[1.35] text-layout-black dark:text-layout-white mb-[20px]">
                어떤 목표로<br />공부하세요?
              </h1>
              <div className="flex flex-col">
                {GOALS.map((g) => (
                  <OptionRow key={g.key} active={goal === g.key} Icon={g.Icon} title={g.label} onClick={() => pickGoal(g.key)} />
                ))}
              </div>
              <div className="mt-auto pt-[20px]">
                <motion.button type="button" whileTap={goal ? { scale: 0.97 } : undefined} disabled={!goal}
                  onClick={() => { vibrate({ duration: 5 }); setStep('daily'); }}
                  className="w-full py-[16px] rounded-[12px] bg-primary-main-600 text-layout-white dark:text-layout-black text-[16px] font-[700] disabled:opacity-40">
                  다음
                </motion.button>
                <LoginFooter />
              </div>
            </motion.div>
          )}

          {/* 1-d 일일 목표 */}
          {step === 'daily' && (
            <motion.div key="daily" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="flex flex-col flex-1">
              <h1 className="text-[22px] font-[800] leading-[1.35] text-layout-black dark:text-layout-white mb-[18px]">
                하루에 몇 개<br />배워볼까요?
              </h1>
              <div className="flex flex-col">
                {DAILY.map((d) => (
                  <OptionRow key={d.key} active={daily === d.key} title={d.label} desc={d.desc} onClick={() => pickDaily(d.key)} />
                ))}
              </div>
              <div className="mt-auto pt-[20px]">
                <motion.button type="button" whileTap={daily && !loadingTrial ? { scale: 0.97 } : undefined} disabled={loadingTrial || !daily}
                  onClick={startTrial}
                  className="w-full py-[16px] rounded-[12px] bg-primary-main-600 text-layout-white dark:text-layout-black text-[16px] font-[700] disabled:opacity-40">
                  {loadingTrial ? '불러오는 중...' : '시작하기'}
                </motion.button>
                <LoginFooter />
              </div>
            </motion.div>
          )}

          {/* 3 보상 (맛보기 결과) */}
          {step === 'reward' && (
            <motion.div key="reward" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col flex-1 items-center justify-center text-center">
              <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 14 }} className="mb-[20px]">
                <PlantIllustration stage="carrot" wilt="fresh" size={120} />
              </motion.div>
              <h1 className="text-[22px] font-[800] leading-[1.35] text-layout-black dark:text-layout-white">
                <span className="text-primary-main-600">{correctCount} / {answers.length} 정답!</span><br />
                단어 감각이 좋으시네요
              </h1>
              <p className="text-[14px] text-layout-gray-300 mt-[12px] leading-[1.5]">
                가입하면 아래 보상과 함께<br />맛본 단어를 이어서 학습해요.
              </p>
              <div className="flex items-center gap-[12px] mt-[18px]">
                <div className="flex flex-col items-center gap-[4px]">
                  <div className="flex items-center justify-center w-[46px] h-[46px] rounded-full bg-primary-main-100 dark:bg-layout-gray-dark">
                    <PlantIllustration stage="sprout" wilt="fresh" size={30} />
                  </div>
                  <span className="text-[10px] font-[600] text-layout-gray-300">첫 학습</span>
                </div>
                <div className="flex flex-col items-center gap-[4px]">
                  <div className="flex items-center justify-center w-[46px] h-[46px] rounded-full bg-[#FFF8E8] dark:bg-layout-gray-dark">
                    <img src={gemImg} alt="보석" className="w-[22px] h-[19px]" />
                  </div>
                  <span className="text-[10px] font-[600] text-[#F68300]">보석 +5</span>
                </div>
              </div>
              <div className="w-full mt-auto pt-[24px]">
                <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={() => { vibrate({ duration: 5 }); setStep('signup'); }}
                  className="w-full py-[16px] rounded-[12px] bg-primary-main-600 text-layout-white dark:text-layout-black text-[16px] font-[700]">
                  가입하고 받기
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* 4 회원가입 — 닉네임 */}
          {step === 'signup' && (
            <motion.div key="signup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col flex-1">
              <div className="pt-[16px]" />
              <h1 className="text-[22px] font-[800] text-layout-black dark:text-layout-white mb-[20px]">거의 다 왔어요!</h1>
              <input
                value={username} onChange={(e) => setUsername(e.target.value.slice(0, 8))}
                placeholder="닉네임을 입력해주세요 (8자 이내)"
                className="w-full px-[14px] py-[13px] rounded-[10px] bg-layout-gray-50 dark:bg-layout-gray-dark text-[14px] text-layout-black dark:text-layout-white outline-none"
              />
              <div className="mt-auto pt-[24px]">
                <motion.button type="button" whileTap={username.trim() && !finishingOnboarding ? { scale: 0.97 } : undefined}
                  disabled={!username.trim() || finishingOnboarding}
                  onClick={handleSignup}
                  className="w-full py-[16px] rounded-[12px] bg-primary-main-600 text-layout-white dark:text-layout-black text-[16px] font-[700] disabled:opacity-40">
                  {finishingOnboarding ? '처리 중...' : '다음'}
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* 5 로그인/회원가입 — 온보딩 마지막 챕터 (온보딩 형식 유지, 내부 버튼) — 비로그인(게스트) 전용.
              이미 로그인된 사용자는 handleSignup에서 이 스텝을 건너뛰고 곧장 홈으로 이동한다. */}
          {step === 'auth' && (
            <motion.div key="auth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col flex-1">
              <div className="flex flex-col flex-1 items-center justify-center text-center">
                <img src={HeyCharacter} alt="" className="w-[130px] h-[130px] object-contain mb-[24px]" />
                <h1 className="text-[22px] font-[800] leading-[1.4] text-layout-black dark:text-layout-white">
                  {username.trim() ? <><span className="text-primary-main-600">{username.trim()}</span>님, 시작해요!</> : '마지막 단계예요!'}
                </h1>
                <p className="text-[14px] text-layout-gray-300 mt-[12px] leading-[1.5]">
                  간편하게 가입하고<br />맛본 단어를 이어서 학습해요.
                </p>
              </div>
              <div className="w-full flex flex-col gap-[12px]">
                <motion.button type="button" whileTap={{ scale: 0.97 }}
                  onClick={() => { vibrate({ duration: 5 }); clickGoogleOauth(); }}
                  className="flex items-center justify-center w-full h-[56px] bg-layout-white border border-layout-gray-200 rounded-[12px] px-5 text-black text-[17px] font-[600] gap-[10px] shadow-sm">
                  <img src={googleLogo} alt="Google" className="h-[24px]" />
                  <span>Google로 시작하기</span>
                </motion.button>
                {!isAndroid && (
                  <motion.button type="button" whileTap={{ scale: 0.97 }}
                    onClick={() => { vibrate({ duration: 5 }); clickAppleOauth(); }}
                    className="flex items-center justify-center w-full h-[56px] bg-black border border-black rounded-[12px] px-5 text-layout-white text-[17px] font-[600] gap-[10px] shadow-sm">
                    <AppleLogo size={24} weight="fill" color="#FFFFFF" />
                    <span>Apple로 시작하기</span>
                  </motion.button>
                )}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
};

export default Onboarding;
