import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CaretLeft, CaretRight, AppleLogo } from '@phosphor-icons/react';
import googleLogo from '../assets/images/google_logo.png';
import { getPlacementPoolApi, migrateOnboardingApi } from '../api/study';
import { getGuest, clearGuest, clearGuestTrial, buildMigrateBody } from '../utils/guestStorage';
import { notifyOnboardingMigrated } from '../utils/studyDataEvents';
import {
  createSession, saveSession as savePlacementSession, clearSession as clearPlacementSession,
  fieldWords,
} from '../utils/onboardingPlacement';
import { vibrate, getDevicePlatform } from '../utils/osFunction';
import { primeSfx } from '../utils/audio';
import { SwitchAccountNewBottomSheet } from '../components/newBottomSheet/SwitchAccountNewBottomSheet';
import { useNewBottomSheetActions } from '../context/NewBottomSheetContext';
import { useUser } from '../context/UserContext';
import postMessageManager from '../utils/postMessageManager';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';
import FarmStoryStage from '../components/onboarding/FarmStoryStage';
import { cropAssetByVariant } from '../components/farm/CropImage';
import AuthSplash from '../components/onboarding/AuthSplash';
import { nodeEnv } from '../utils/common';
import { useAppOAuthError } from '../hooks/useAppOAuthError';

/*
  온보딩 — 인사에서 가입까지.

  【시작】 (이슈 #25 7차) 첫 화면(hello)에서 곧바로 구글·애플로 계속하기 — 회원가입('시작하기') 경로와
          게스트 학습 뒤 가입 화면('거의 다 왔어요')을 없앴다. 로그인하면 Index 가 onboarding_ver 로 갈라
          최초 사용자만 여기로 다시 보내고, 로그인된 채 들어오면 hello 를 건너뛰어 소개부터 시작한다.
          마지막 finish → auth 는 로그인 상태라 가입 화면 없이 migrate(v2: theta·answers) 후 홈으로 간다.
  【흐름】 hello → intro(농사 이야기: 성장 → 시듦 → 체험 밭) → 수준 맞춤 학습(/take-test, 8문제 + 틀린 단어
          복습, 매 답마다 체험 밭 가상 작물이 자라고 시든다) → 학습 결과(StudyResult — 실제 학습과 같은 슬라이드,
          밭 성장 · 보석 20 · 결과 목록) → guide('단어를 학습하면 새 농작물을 심고 키울 수 있어요', 8차 QA) → finish('나만의 밭을 만들러 가볼까요?' 문구 + 버튼) → auth
  (이슈 #25 4차 — 소개를 '하나의 밭이 이어지는 농사 이야기'로. 장면 사이 화면 전환 없이 밭 무대
   (components/onboarding/FarmStoryStage) 위에서 연출이 이어지고 제목만 크로스페이드한다. 연출이 끝나기 전엔
   버튼이 회색으로 잠긴다. 장면엔 큰 제목 한 줄과 버튼만 둔다 — 보조 설명 줄은 없앴다.)
  (이슈 #25 3차 — 닉네임 입력을 뺐다. 이름은 서버가 기본 닉네임으로 넣고 나중에 마이페이지에서 바꾼다.)
  (이슈 #25 2차 — 단어장 추천·선택, 유입 경로·학습 목적·하루 심기 수 질문을 뺐다.
   온보딩은 수준(θ) 측정과 학습 체험만 한다. 단어를 심지 않고, 가입 직후엔 단어장이 없다 —
   첫 단어장은 홈 퀘스트에서 받은 보석으로 서점에서 산다. 하루 심기 수는 서버 기본값.)

  【학습·결과 화면을 여기서 그리지 않는 이유】 맛보기가 아니라 **진짜 첫 학습**이다.
  TakeTest / StudyResult 를 게스트 모드로 그대로 쓴다 — 온보딩에서 본 화면과 실제가
  다르면 그다음부터 신뢰를 잃는다.
*/

// 예전 단계 이름으로 들어온 경우(구 버전 화면·저장된 state) — 지금 단계로 옮긴다.
// 'nick' 은 학습 결과 화면(StudyResult)이 학습을 마친 뒤 보내는 자리다 — 닉네임 단계가 없어져 가입으로 잇는다.
const LEGACY_STEP = {
  memory: 'intro', ready: 'intro',
  nick: 'auth', recommend: 'auth', channel: 'auth', goal: 'auth', daily: 'auth',
};

// 장면 제목 — copyKey 가 바뀌면 새 제목이 아래에서 살짝 떠오르며 나타난다(들어오는 쪽만 — 나가는 쪽을
// 기다리게 하면 exit 신호가 늦을 때 화면이 멈춘다. 아래 스텝 전환 주석과 같은 이유).
const SCENE_COPY = {
  grow: <>복습할수록 오래 기억하고,<br /><span className="text-primary-main-600">작물이 자라요</span></>,
  wilt: <>복습을 게을리하면<br />작물이 <span className="text-primary-main-600">시들어 죽을 수</span> 있어요</>,
  field: <>농장 체험을 <span className="text-primary-main-600">해볼까요?</span></>,
  guide: <>단어를 학습하면 새 농작물을<br /><span className="text-primary-main-600">심고 키울 수 있어요</span></>,
  finish: <>나만의 밭을<br /><span className="text-primary-main-600">만들러 가볼까요?</span></>,
};
// 안내 장(guide)의 작물 단계 — 씨앗부터 당근까지
const GUIDE_CROPS = ['seed', 'sprout', 'leaf', 'carrot'];

const SceneCopy = ({ copyKey, className = 'mt-[20px] min-h-[56px]' }) => (
  <div className={`text-center ${className}`}>
    <motion.p
      key={`t-${copyKey}`}
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
      className="text-[19px] font-[700] leading-[1.45] tracking-[-0.03em] text-layout-black dark:text-layout-white"
    >
      {SCENE_COPY[copyKey] ?? SCENE_COPY.grow}
    </motion.p>
  </div>
);

const Onboarding = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  useStatusBarStyle('dark-content');
  const navigate = useNavigate();
  const location = useLocation();
  const { pushAwaitNewBottomSheet } = useNewBottomSheetActions();
  const { Login, AppleLogin, clickGoogleOauth, clickAppleOauth, isLogin, fetchUserProfile, performLogout, updateUserHistory, DevLogin } = useUser();

  // 온보딩 내부 로그인/회원가입 스텝(auth)에서만 앱 OAuth 노출 (안드로이드는 애플 숨김)
  const isAndroid = getDevicePlatform() === 'android' || navigator.userAgent.toLowerCase().includes('android');

  // 학습에서 돌아온 경우 location.state.step 으로 스텝 지정
  //  - 'finish': 학습 결과(StudyResult)를 마침 → 마무리 문구  /  'intro'(+scene 'field'): 학습 중 그만둠 → 체험 밭으로 복귀
  //  - 'nick'(→auth): 예전 결과 화면(StudyResult)을 거쳐 온 경우
  const incomingStep = location.state?.step;
  const [step, setStep] = useState(() => {
    // 로그인된 채 처음 들어오면(로그인 직후 Index 가 보냄) 인사를 건너뛰고 소개부터
    const s = incomingStep || (isLogin ? 'intro' : 'hello');
    // 학습 결과(StudyResult)를 마치고 오면 마무리 앞에 '새 농작물' 안내 한 장을 먼저(이슈 #25 8차 QA)
    if (s === 'finish') return 'guide';
    return LEGACY_STEP[s] || s;
  });
  /*
    소개(intro)의 장면 — grow(성장) → wilt(시듦) → field(체험 밭). 밭 무대는 그대로이고 scene 만 바뀐다.
    sceneRun: { key, instant } — key 가 바뀌면 무대가 그 장면을 처음부터(instant 면 끝 모습으로) 다시 그린다.
    sceneDone: 지금 장면 연출이 끝났는지(버튼 활성).
  */
  const [scene, setScene] = useState(() => (location.state?.scene === 'field' ? 'field' : 'grow'));
  const [sceneRun, setSceneRun] = useState(() => ({ key: 0, instant: location.state?.scene === 'field' }));
  const [sceneDone, setSceneDone] = useState(false);
  const goScene = (next, instant = false) => {
    setSceneDone(false);
    setScene(next);
    setSceneRun((r) => ({ key: r.key + 1, instant }));
  };
  const [loadingTrial, setLoadingTrial] = useState(false);
  // 이미 로그인된 사용자가 온보딩을 진행할 때 auth 스텝을 건너뛰고 서버 migrate 처리 중임을 표시
  const [finishingOnboarding, setFinishingOnboarding] = useState(false);
  // 앱 OAuth 결과를 받아 로그인 처리 중 — 가입 화면(버튼) 대신 스플래시를 그린다. 이 뒤 navigate('/') 의
  // Index 스플래시와 같은 그림이라 홈까지 로그인 화면이 비치지 않는다(이슈 #25 6차 QA).
  const [authProcessing, setAuthProcessing] = useState(false);
  // 앱 OAuth 취소·실패(앱 → 웹 'oauthError') — 스플래시를 풀고 바텀시트로 알린다(이슈 #25 7차)
  const showOAuthError = useAppOAuthError(() => setAuthProcessing(false));

  // 온보딩 내부 인증(auth) 스텝용 앱 OAuth 콜백 리스너 (Login 페이지와 동일 로직)
  // 로그인 성공 시 홈으로 이동 → 홈에서 게스트 데이터 이전 + 알림 프롬프트가 이어짐
  useEffect(() => {
    const onGoogle = async (data) => {
      const { googleId, email, name, status } = data || {};
      if (!googleId || !email || !name || !status) return;
      setAuthProcessing(true);
      try {
        const result = await Login({ googleId, email, name, status });
        if (result?.success) { navigate('/'); return; }
      } catch (e) { /* 아래에서 실패로 알린다 */ }
      setAuthProcessing(false);
      showOAuthError('failed');
    };
    const onApple = async (data) => {
      const { identityToken, email, fullName, status, authorizationCode } = data || {};
      if (!identityToken || !status) return;
      setAuthProcessing(true);
      try {
        const result = await AppleLogin({ identityToken, fullName, email, status, authorizationCode });
        if (result?.success) { navigate('/'); return; }
      } catch (e) { /* 아래에서 실패로 알린다 */ }
      setAuthProcessing(false);
      showOAuthError('failed');
    };
    postMessageManager.setupAppGoogleAuth(onGoogle);
    postMessageManager.setupAppAppleAuth(onApple);
    return () => {
      postMessageManager.removeAppGoogleAuth();
      postMessageManager.removeAppAppleAuth();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 뒤로가기가 있는 스텝과, 각 스텝의 이전 자리.
  // 학습은 별도 라우트라 그 뒤(auth)에서 앞으로 이어 붙이지 않는다 — 다시 학습하게 된다.
  const BACK_TO = { intro: 'hello' };
  // 소개 안의 장면 뒤로 가기 — 이전 장면을 끝 모습으로 다시 세운다(연출을 또 기다리게 하지 않는다)
  const SCENE_BACK = { wilt: 'grow', field: 'wilt' };

  /*
    로컬 전용 이메일 가입 — 실기기에서 구글·애플 없이 온보딩 가입까지 확인하려고 둔다.
    서버 `/auth/dev-login`(auth.py)은 없는 이메일이면 계정을 새로 만들어 주므로
    로그인과 가입을 겸한다. 라우트 자체가 `FLASK_CONFIG=local` 이 아니면 403 이라
    화면을 감추는 것과 서버가 거부하는 것, 두 겹으로 막혀 있다.

    기본값을 매번 **새 주소**로 잡는다. 이미 있는 이메일을 넣으면 가입이 아니라 로그인이 되고,
    그 계정은 이미 온보딩을 마쳤으므로 `/onboarding/migrate` 가 409 로 끝난다 —
    정작 확인하려던 가입 경로(심은 씨앗 이전·출석·업적)가 한 줄도 안 돈다.
  */
  const isLocal = nodeEnv === 'local';
  const [devEmail, setDevEmail] = useState(() => `dev+${Date.now().toString(36)}@heyvoca.test`);
  const [devBusy, setDevBusy] = useState(false);
  const [devError, setDevError] = useState(null);

  const clickDevSignup = async () => {
    const email = devEmail.trim();
    if (devBusy || !email) return;
    vibrate({ duration: 5 });
    setDevBusy(true);
    setDevError(null);
    try {
      const result = await DevLogin({ email });
      // 성공하면 홈으로 — 게스트 데이터 이전(migrate)은 구글·애플과 똑같이 Index.jsx 가 맡는다
      if (result?.success) { setAuthProcessing(true); navigate('/'); return; }
      setDevError(result?.message || '로그인 실패');
    } catch (e) {
      setDevError('서버 오류');
    }
    setDevBusy(false);
  };

  // 이미 로그인된 상태에서 온보딩에 갇힌 경우 — 확인 바텀시트 후 로그아웃하고 로그인 화면으로 이동.
  // 로그인 화면은 구글·애플 버튼 하나로 가입·로그인을 겸한다(회원가입 연결 버튼 없음, 이슈 #25 8차).
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
    if (step === 'intro' && SCENE_BACK[scene]) { goScene(SCENE_BACK[scene], true); return; }
    const prev = BACK_TO[step];
    if (prev) setStep(prev);
  };

  /*
    수준 맞춤 학습 세션 — 소개에 들어오면 문제 재료(placement-pool)를 미리 받아 세션을 만들어 둔다.
    세션이 체험 밭 8단어(=1부에서 실제로 낼 단어)와 그 가상 작물 상태를 정한다(utils/onboardingPlacement
    drawFieldWords·initVirtualFarm) — 체험 밭 장면이 그 단어들을 심어 보여 주고, '체험하기'를 누르면 같은 세션으로
    학습 화면(TakeTest)을 띄운다. 문제는 미리 만들지 않는다 — 답할 때마다 다음 문제를 만든다.
    세션은 localStorage 에도 두어 기기에서 router state 가 유실돼도 이어진다.
  */
  const [trialError, setTrialError] = useState(false);
  const [trialSession, setTrialSession] = useState(null);
  const sessionPromiseRef = useRef(null);
  const loadTrialSession = () => {
    if (trialSession) return Promise.resolve(trialSession);
    if (sessionPromiseRef.current) return sessionPromiseRef.current;
    setTrialError(false);
    const p = getPlacementPoolApi()
      .then((res) => {
        const session = res?.code === 200 ? createSession(res.data?.bands) : null;
        if (!session || session.pool.length < 8 || (session.fieldIds || []).length < 8) throw new Error('pool');
        setTrialSession(session);
        return session;
      })
      .catch(() => { setTrialError(true); return null; })
      .finally(() => { sessionPromiseRef.current = null; });
    sessionPromiseRef.current = p;
    return p;
  };
  // 소개에 들어오면 바로 받기 시작한다(성장·시듦 연출 동안 받아 둔다)
  useEffect(() => {
    if (step === 'intro') loadTrialSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
  // 체험 밭으로 곧장 돌아온 경우(학습 중 그만둠) — 세션이 준비되면 그 단어로 밭을 다시 세운다
  useEffect(() => {
    if (step === 'intro' && scene === 'field' && trialSession) setSceneRun((r) => ({ key: r.key + 1, instant: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trialSession]);

  // 시듦 → 체험 밭. 세션이 아직이면 받을 때까지 기다린다(버튼은 '불러오는 중...').
  const goField = async () => {
    vibrate({ duration: 5 });
    primeSfx();
    if (!trialSession) {
      setLoadingTrial(true);
      const ses = await loadTrialSession();
      setLoadingTrial(false);
      if (!ses) return;
    }
    goScene('field');
  };

  // 체험하기 — 실제 학습 화면(TakeTest)을 게스트 수준 맞춤 학습으로 띄운다.
  // 첫 문제의 음성은 학습 화면에 들어간 뒤에야 나온다(학습 안 안내 슬라이드를 없앴다 — onboardingPlacement advance).
  const startTrial = () => {
    if (loadingTrial || !trialSession) return;
    vibrate({ duration: 5 });
    // 채점 효과음 저지연 재생 준비 — 반드시 이 클릭(user gesture)의 동기 시점에
    // 호출해야 Web Audio AudioContext가 unlock되고 mp3가 미리 디코드된다(await 이후엔 unlock 실패).
    primeSfx();
    clearGuestTrial(); // 구 맛보기 데이터가 남아 있으면 TakeTest 가 그쪽으로 뜨지 않게
    savePlacementSession(trialSession);
    navigate('/take-test', { state: { testType: 'today', guestMode: true, placement: true } });
  };

  // 로그인 안 된 채 auth 에 닿으면(예전 화면·저장된 state) 가입 화면 대신 첫 화면으로 — 거기서 로그인한다
  useEffect(() => {
    if (step === 'auth' && !isLogin && !finishingOnboarding && !authProcessing) setStep('hello');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, isLogin]);

  // 학습·결과를 마치고 가입 단계에 들어온 순간.
  //  - 알림 권한은 온보딩이 아니라 로그인 후 홈 첫 진입에서 요청 → 플래그만 남긴다.
  //  - 이미 로그인된 사용자(게스트 온보딩 없이 로그인 후 다시 온보딩에 진입한 경우)는 재로그인이
  //    필요 없으므로 가입 화면을 건너뛰고 서버로 바로 이전(migrate)한 뒤 홈으로 간다.
  const authEnteredRef = useRef(false);
  useEffect(() => {
    if (step !== 'auth' || authEnteredRef.current) return;
    authEnteredRef.current = true;
    try { localStorage.setItem('heyvoca_notif_prompt', '1'); } catch (e) { /* 무시 */ }
    if (isLogin) finishLoggedInOnboarding();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, isLogin]);

  // 이미 로그인된 사용자의 온보딩 완료 처리 — guestStorage 대신 현재 온보딩 진행 상태(state)를
  // 곧바로 서버 /onboarding/migrate로 전송한다. 성공(200) 또는 이미 처리됨(409) 모두 정상 종료로 본다.
  // 네트워크 실패 등으로 migrate가 실패해도 로그인 상태 자체는 유효하므로 홈으로는 보낸다 —
  // 이 경우 onboarding_ver가 갱신되지 않아 다음 앱 실행 시 Index.jsx가 다시 /onboarding으로 보내는
  // 자연스러운 재시도가 이루어진다.
  const finishLoggedInOnboarding = async () => {
    if (finishingOnboarding) return;
    setFinishingOnboarding(true);
    try {
      // v2 { flow, theta, answers } / 구 v1(레벨만 있는 예전 게스트 데이터) — utils/guestStorage buildMigrateBody
      const res = await migrateOnboardingApi(buildMigrateBody(getGuest()));
      if (res?.code === 200) {
        // 온보딩 학습을 오늘의 기록으로 집계한다(XP · 출석 · 데일리 미션 · 연속 학습 1일).
        // 게스트 구간에서는 로그인이 없어 못 불렀다. migrate 가 학습 로그를 막 심어 놨으므로
        // 지금 부르면 온보딩에서 한 학습이 그대로 오늘의 기록으로 잡힌다.
        // is_onboarding — 업적(출석왕·노력왕·끈기왕)에는 반영하지 않는다(이슈 #25 3차, 서버가 건너뛴다).
        // 409(이미 온보딩 완료)는 앞선 시도에서 이미 처리된 것이라 건너뛴다.
        const studied = res?.data?.studied ?? 0;
        const correct = res?.data?.correct ?? 0;
        if (studied > 0 && typeof updateUserHistory === 'function') {
          await updateUserHistory({
            correct_cnt: correct,
            incorrect_cnt: Math.max(0, studied - correct),
            is_onboarding: true,
          }).catch(() => { /* 실패해도 온보딩 흐름은 계속 */ });
        }
      }
      if (res?.code === 200 || res?.code === 409) {
        clearGuest();
        clearPlacementSession();
        // 홈 등 다른 화면에서 최신 닉네임/온보딩 상태가 바로 보이도록 프로필 재조회(best-effort)
        fetchUserProfile().catch(() => { /* 무시 — 다음 조회 시 갱신됨 */ });
        notifyOnboardingMigrated(); // 이슈 #25: 단어장·홈 통계 캐시 재조회(로그인 시점 빈 목록 갱신)
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
      className={`w-full h-[52px] rounded-[12px] text-[16px] font-[700] tracking-[-0.03em] transition-colors duration-200 ${disabled
        ? 'bg-layout-gray-200 dark:bg-[#2A2A2A] text-layout-gray-400 dark:text-layout-gray-300'
        : 'bg-primary-main-600 text-layout-white dark:text-layout-black'}`}
    >
      {label}
    </motion.button>
  );

  // 하단 계정 전환 링크 — 로그인된 채 첫 화면으로 돌아온 경우에만.
  const LoginFooter = () => (
    <button type="button" onClick={goSwitchAccount}
      className="w-full mt-[14px] text-[13px] font-[500] text-layout-gray-300 dark:text-layout-gray-100 underline">
      다른 계정으로 로그인
    </button>
  );

  // 첫 화면 로그인 버튼 — 구글(+iOS 애플) · 약관 안내 · 로컬 전용 이메일 가입.
  // 예전 가입 화면(auth)에 있던 것을 그대로 옮겼다(이슈 #25 7차).
  const AUTH_BUTTONS = (
    <>
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

      {/* 로컬 전용 이메일 가입 — 실기기에서 소셜 없이 가입 경로를 확인하기 위한 것.
          다른 환경에서는 렌더되지도, 서버가 받아 주지도 않는다(clickDevSignup 주석). */}
      {isLocal && (
        <div className="flex flex-col gap-[8px] mt-[10px] pt-[14px] border-t border-border dark:border-border-dark">
          <p className="text-center text-[10.5px] font-[800] tracking-[0.06em] text-layout-gray-200">
            LOCAL ONLY · 이메일로 가입
          </p>
          <input
            type="email" inputMode="email" autoCapitalize="none" autoCorrect="off"
            value={devEmail}
            onChange={(e) => { setDevEmail(e.target.value); setDevError(null); }}
            enterKeyHint="go"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); clickDevSignup(); } }}
            className="
              w-full h-[46px] px-[14px] rounded-[12px] border border-border dark:border-border-dark
              bg-layout-white dark:bg-layout-black text-center text-[13.5px] font-[600]
              text-layout-black dark:text-layout-white outline-none focus:border-primary-main-600
            "
          />
          <motion.button type="button" whileTap={{ scale: 0.97 }}
            disabled={devBusy || !devEmail.trim()} onClick={clickDevSignup}
            className="w-full h-[46px] rounded-[12px] bg-layout-gray-400 dark:bg-layout-gray-dark text-layout-white text-[14px] font-[700] disabled:opacity-40">
            {devBusy ? '처리 중...' : '이 이메일로 가입하고 시작하기'}
          </motion.button>
          {devError && (
            <p className="text-center text-[11.5px] font-[600] text-status-error-600">{devError}</p>
          )}
        </div>
      )}
    </>
  );

  const stepBody = useMemo(() => `on-${step}`, [step]);

  // 로그인 처리 중·이미 로그인된 사용자의 이전(migrate) 중에는 가입 화면 대신 스플래시
  if (authProcessing || (step === 'auth' && (isLogin || finishingOnboarding))) return <AuthSplash />;

  return (
    <div className="flex flex-col h-screen w-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>

      {/*
        헤더 — 뒤로가기는 되돌아갈 자리가 있는 스텝에만.

        **`data-page-header` 를 달지 않는다.** 그 표식이 붙으면 전역 규칙
        (index.css `html[data-keyboard-visible] [data-page-header]{display:none}`)에 걸려
        키보드가 올라오는 순간 헤더가 통째로 사라진다. 그 규칙은 목록이 긴 화면에서
        자리를 벌려 주려고 만든 것인데, 여기는 입력칸 하나뿐이라 벌 자리가 필요 없고
        뒤로가기만 없어져 화면이 덜컥 위로 튄다.
      */}
      {BACK_TO[step] && (
        <div className="relative flex items-end w-full h-[55px] px-[10px] pb-[13px] shrink-0">
          <motion.button onClick={goBack}
            className="flex text-layout-gray-200 dark:text-layout-white rounded-[8px]"
            whileHover={{ backgroundColor: 'rgba(0,0,0,0.05)', scale: 1.05 }}
            whileTap={{ scale: 0.95, backgroundColor: 'rgba(0,0,0,0.1)' }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}>
            <CaretLeft size={24} />
          </motion.button>
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
          {/* ① 인사 — 누가 말을 거는지만 */}
          {step === 'hello' && (
            <>
              <div className="flex flex-col flex-1 items-center justify-center text-center px-[28px]">
                <h1 className="text-[25px] font-[800] leading-[1.42] tracking-[-0.04em] text-layout-black dark:text-layout-white">
                  안녕하세요!<br />여기는 <span className="text-primary-main-600">헤이보카</span>예요
                </h1>
              </div>
              {isLogin ? (
                <div className="px-[24px] pt-[18px] pb-[26px] shrink-0">
                  <Cta label="시작하기" onClick={() => { vibrate({ duration: 5 }); primeSfx(); goScene('grow'); setStep('intro'); }} />
                  <LoginFooter />
                </div>
              ) : (
                <div className="flex flex-col gap-[10px] px-[24px] pt-[18px] pb-[26px] shrink-0">
                  {AUTH_BUTTONS}
                </div>
              )}
            </>
          )}

          {/* ② 소개 — 농사 이야기. 밭 무대(FarmStoryStage)는 장면이 바뀌어도 그대로, 문구만 크로스페이드한다. */}
          {step === 'intro' && (
            <>
              <div className="flex flex-col flex-1 min-h-0 justify-center px-[20px]">
                <FarmStoryStage
                  scene={scene}
                  runKey={sceneRun.key}
                  instant={sceneRun.instant}
                  words={scene === 'field' && trialSession ? fieldWords(trialSession) : []}
                  onSceneDone={(sc) => { if (sc === scene) setSceneDone(true); }}
                />
                <SceneCopy copyKey={scene} />
              </div>
              <div className="px-[24px] pt-[18px] pb-[26px] shrink-0">
                {trialError && scene !== 'grow' && (
                  <p className="mb-[10px] text-center text-[12px] font-[600] text-status-error-600">
                    문제를 불러오지 못했어요. 다시 눌러주세요.
                  </p>
                )}
                {scene === 'grow' && (
                  <Cta label="확인" disabled={!sceneDone} onClick={() => { vibrate({ duration: 5 }); primeSfx(); goScene('wilt'); }} />
                )}
                {scene === 'wilt' && (
                  <Cta label={loadingTrial ? '불러오는 중...' : '확인'} disabled={!sceneDone || loadingTrial} onClick={goField} />
                )}
                {scene === 'field' && (
                  trialSession
                    ? <Cta label="체험하기" disabled={!sceneDone} onClick={startTrial} />
                    : <Cta label={trialError ? '다시 불러오기' : '불러오는 중...'} disabled={!trialError}
                        onClick={() => { vibrate({ duration: 5 }); loadTrialSession(); }} />
                )}
              </div>
            </>
          )}

          {/* ③ 안내 — 학습 결과 슬라이드를 다 본 뒤, 마무리 직전 한 장. 씨앗 → 새싹 → 이파리 → 당근이
              차례로 '뽕' 돋으며(결과 슬라이드 작물 등장과 같은 스프링) 학습할수록 밭이 자란다는 걸 보여 준다. */}
          {step === 'guide' && (
            <>
              <div className="flex flex-col flex-1 min-h-0 justify-center px-[20px]">
                <div className="flex items-end justify-center gap-[2px]" aria-hidden>
                  {GUIDE_CROPS.map((crop, i) => (
                    <React.Fragment key={crop}>
                      {i > 0 && (
                        <motion.span
                          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                          transition={{ delay: 0.15 + i * 0.28, duration: 0.25 }}
                          className="mb-[26px] text-layout-gray-200"
                        >
                          <CaretRight size={14} weight="bold" />
                        </motion.span>
                      )}
                      <motion.img
                        src={cropAssetByVariant(crop, 'healthy')}
                        alt="" draggable={false}
                        initial={{ opacity: 0, y: -14, scale: 0.3 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ delay: 0.2 + i * 0.28, type: 'spring', stiffness: 420, damping: 16 }}
                        className="h-[72px] w-[72px] select-none object-contain max-[360px]:h-[60px] max-[360px]:w-[60px]"
                      />
                    </React.Fragment>
                  ))}
                </div>
                <SceneCopy copyKey="guide" className="mt-[28px] min-h-[56px]" />
              </div>
              <div className="px-[24px] pt-[18px] pb-[26px] shrink-0">
                <Cta label="다음" onClick={() => { vibrate({ duration: 5 }); setStep('finish'); }} />
              </div>
            </>
          )}

          {/* ④ 마무리 — 학습 결과(StudyResult, 보석 20 포함)를 본 뒤. 문구와 가입 버튼만. */}
          {step === 'finish' && (
            <>
              <div className="flex flex-col flex-1 min-h-0 justify-center px-[28px]">
                <SceneCopy copyKey="finish" className="" />
              </div>
              <div className="px-[24px] pt-[18px] pb-[26px] shrink-0">
                <Cta label="밭 만들러 가기" onClick={() => { vibrate({ duration: 5 }); setStep('auth'); }} />
              </div>
            </>
          )}

      </motion.div>
    </div>
  );
};

export default Onboarding;
