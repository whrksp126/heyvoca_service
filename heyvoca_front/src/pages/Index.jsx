// src/pages/Index.jsx
// 앱 초기 진입 스플래시 — 전체 초기 데이터 로딩 완료 후 홈으로 진입
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { migrateOnboardingApi } from '../api/study';
import { pendingGuestMigration, clearGuest } from '../utils/guestStorage';
import { useVocabulary } from '../context/VocabularyContext';
import lottie from 'lottie-web';
import animationData from '../assets/lottie/heyvoca logo-01.json';
import postMessageManager from '../utils/postMessageManager';
import '../index.css';

const GRACE_DELAY = 420; // 바가 100% 찬 뒤 네비게이트 전 대기(ms)
const BROKEN_SESSION_DELAY = 1500; // 깨진 세션 감지 후 로그인 강제 이동(ms)
const MIN_SPLASH_DURATION = 800; // 로그인 사용자 최소 스플래시 노출시간(ms)

const Index = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const navigate = useNavigate();

  const {
    isLogin,
    isLoginChecked,
    userProfile,
    isUserProfileLoading,
    isAchievementCriteriaLoading,
    performLogout,
    fetchUserProfile,
  } = useUser();

  const {
    isVocaBooksLoading,
    isUserDictionaryLoading,
    isRecentStudyLoading,
    isBookStoreLoading,
    isRecommendedBooksLoading,
    fetchVocabularySheets,
  } = useVocabulary();

  // 바가 100% 차 보이고 나서 실제 네비게이트
  const [graceDone, setGraceDone] = useState(false);
  // 깨진 세션 타이머 발동 여부
  const [brokenSessionTriggered, setBrokenSessionTriggered] = useState(false);
  // 최소 스플래시 노출시간 경과 여부 (로그인 사용자 전용)
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);

  // --- 마운트 시 네이티브로 "웹 준비됨" 신호 전송 (1회, double rAF) ---
  // double rAF: 핑크 스플래시가 실제로 브라우저에 페인트된 뒤 신호를 보내
  // 네이티브 부트스플래시 해제 타이밍의 흰 화면 깜빡임을 방지한다.
  useEffect(() => {
    let raf1, raf2;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (postMessageManager && typeof postMessageManager.sendMessageToReactNative === 'function') {
          postMessageManager.sendMessageToReactNative('webSplashReady', {});
        }
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  // --- 최소 스플래시 노출시간 타이머 (로그인 사용자 네비게이트 게이트용) ---
  useEffect(() => {
    const timer = setTimeout(() => setMinTimeElapsed(true), MIN_SPLASH_DURATION);
    return () => clearTimeout(timer);
  }, []);

  // --- Lottie 로고 애니메이션 ---
  useEffect(() => {
    const container = document.getElementById("lottie-container");
    if (container) {
      const anim = lottie.loadAnimation({
        container,
        renderer: "svg",
        loop: true,
        autoplay: true,
        animationData,
      });
      return () => anim.destroy();
    }
  }, []);


  // --- 로딩 steps 정의 (로그인 상태일 때만 의미 있음) ---
  const steps = [
    {
      done: !isUserProfileLoading && !!userProfile && !!userProfile.id,
      label: '사용자 정보를 불러오는 중',
    },
    {
      done: !isVocaBooksLoading,
      label: '단어장을 불러오는 중',
    },
    {
      done: !isUserDictionaryLoading,
      label: '내 사전을 불러오는 중',
    },
    {
      done: !isRecentStudyLoading,
      label: '최근 학습 기록을 불러오는 중',
    },
    {
      done: !isBookStoreLoading,
      label: '서점을 불러오는 중',
    },
    {
      done: !isRecommendedBooksLoading,
      label: '추천 단어장을 불러오는 중',
    },
    {
      done: !isAchievementCriteriaLoading,
      label: '마무리하는 중',
    },
  ];

  const doneCount = steps.filter(s => s.done).length;
  const totalSteps = steps.length;

  // 비로그인이면 온보딩으로 (온보딩 안에 '이미 계정 있어요' → /login 경로 있음)
  // 단, 게스트 온보딩을 마치고 로그인하러 온 경우(pending)만 곧장 /login으로 보낼 필요 없음 —
  // 온보딩이 navigate('/login')로 직접 보내므로 여기선 항상 /onboarding.
  useEffect(() => {
    if (isLoginChecked && !isLogin) {
      navigate('/onboarding');
    }
  }, [isLoginChecked, isLogin, navigate]);

  // 데이터 전체 완료 여부
  const dataReady = isLogin && isLoginChecked && doneCount === totalSteps;

  // 데이터 준비 완료 → grace 타이머 시작
  useEffect(() => {
    if (!dataReady) return;
    const timer = setTimeout(() => setGraceDone(true), GRACE_DELAY);
    return () => clearTimeout(timer);
  }, [dataReady]);

  // 게스트 온보딩 이전 — 로그인 후 프로필 로드 시 1회, pending 게스트 데이터를 서버로 이전.
  // 멱등(서버 409) + fire-and-forget이라 네비게이트를 막지 않음.
  const migratedRef = useRef(false);
  useEffect(() => {
    if (migratedRef.current) return;
    if (!userProfile || !userProfile.id) return;
    const pending = pendingGuestMigration();
    if (!pending) return;
    migratedRef.current = true;
    migrateOnboardingApi({
      level: pending.level,
      source_channel: pending.source_channel,
      learning_goal: pending.learning_goal,
      daily_new_limit: pending.daily_new_limit,
      username: pending.username,
      answers: pending.answers,
    }).then((res) => {
      if (res?.code === 200 || res?.code === 409) {
        clearGuest();
        // migrate가 서버에서 username·레벨·단어장·onboarding_ver('1')를 세팅하지만,
        // 로컬 userProfile은 아직 이 응답을 반영 전(onboarding_ver!=='1', username=null)이라
        //  ① 아래 기본 네비게이트 이펙트가 /onboarding으로 되돌릴 수 있고
        //  ② 홈/마이페이지가 stale 프로필을 읽어 닉네임이 '미설정'으로 보인다.
        // 따라서 서버가 방금 세팅한 최신 프로필(닉네임·온보딩 상태)을 즉시 재조회한 뒤 홈으로 보낸다.
        fetchUserProfile().catch(() => { /* 실패해도 흐름은 계속 — 다음 조회 시 갱신됨 */ });
        // migrate가 방금 만든 온보딩 단어장(+단어)을 프론트 vocabularySheets에 즉시 반영한다.
        // 이걸 안 하면 로그인 시점에 로드된 빈 목록이 그대로 남아, 홈에서 AI 추천 테스트 진입 시
        // "단어가 부족해요"가 뜬다(앱 재시작 전까지). fetchVocabularySheets가 vocaBooks+userDictionary를 재조회.
        if (typeof fetchVocabularySheets === 'function') {
          fetchVocabularySheets().catch(() => { /* 실패해도 흐름은 계속 */ });
        }
        if (res?.code === 200) navigate('/home', { replace: true });
      }
    }).catch(() => { /* 실패해도 로그인 흐름은 계속 */ });
  }, [userProfile]);

  // graceDone + 최소 노출시간 경과 후 실제 네비게이트
  // minTimeElapsed: 로그인 사용자의 스플래시가 최소 800ms는 보이도록 보장
  //
  // 온보딩 완료 여부는 서버의 onboarding_ver로 판단한다(레거시 username==null 체크 아님):
  //  - onboarding_ver === '1' : 새 온보딩(/onboarding)을 마친 사용자 → 홈으로.
  //  - onboarding_ver !== '1' (null/undefined 포함) : 새 온보딩 진행 기록이 없는 사용자
  //      (온보딩을 안 거치고 바로 로그인한 최초 로그인 유저 포함) → /onboarding으로 보내
  //      새 온보딩을 진행시킨다. 이미 로그인 상태이므로 Onboarding.jsx가 마지막 auth 스텝을
  //      건너뛰고 서버 migrate 후 홈으로 이어간다.
  useEffect(() => {
    if (!dataReady || !graceDone || !minTimeElapsed) return;
    if (userProfile && userProfile.id) {
      if (userProfile.onboarding_ver === '1') {
        // 엣지 케이스: onboarding_ver는 '1'인데 username이 비어있는 경우(예: migrate 직후 로컬
        // 캐시가 아직 최신화되지 않은 상태) — 온보딩을 다시 태우면 중복 경험이 되므로
        // 온보딩 완료로 간주하고 홈으로 보낸다. 닉네임은 마이페이지(계정)에서 나중에 설정 가능.
        navigate('/home');
      } else {
        navigate('/onboarding');
      }
    } else {
      navigate('/login');
    }
  }, [dataReady, graceDone, minTimeElapsed, userProfile, navigate]);

  // 깨진 세션 가드: 로그인으로 표시됐으나 프로필 로드 완료 후 userProfile이 없는 경우
  useEffect(() => {
    if (
      isLogin &&
      isLoginChecked &&
      !isUserProfileLoading &&
      (!userProfile || !userProfile.id) &&
      !brokenSessionTriggered
    ) {
      setBrokenSessionTriggered(true);
      const timer = setTimeout(async () => {
        if (typeof performLogout === 'function') {
          await performLogout();
        }
        navigate('/login');
      }, BROKEN_SESSION_DELAY);
      return () => clearTimeout(timer);
    }
  }, [isLogin, isLoginChecked, isUserProfileLoading, userProfile, brokenSessionTriggered, performLogout, navigate]);

  // --- 프로그래스 계산 ---
  let progress;
  let message;

  if (!isLoginChecked) {
    // 로그인 상태 확인 중
    progress = 0.06;
    message = '로그인 상태를 확인하고 있어요';
  } else if (!isLogin) {
    // 비로그인 → /login 이동 중이므로 바를 약간만 채워 둠
    progress = 0.06;
    message = '로그인 상태를 확인하고 있어요';
  } else if (dataReady) {
    progress = 1;
    message = '거의 다 됐어요';
  } else {
    progress = doneCount / totalSteps;
    const firstPending = steps.find(s => !s.done);
    message = firstPending ? firstPending.label : '거의 다 됐어요';
  }

  // 최소 4% 보장 (빈 바 방지)
  const barWidth = Math.max(4, progress * 100);

  return (
    <div className="bg-primary-main-100 dark:bg-layout-gray-dark w-full h-screen absolute top-0 left-0 flex flex-col items-center">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>

      {/* Lottie 로고 — 화면 정중앙 배치 (네이티브 부트스플래시와 위치·크기 일치) */}
      <div
        id="lottie-container"
        className="w-[240px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      ></div>

      {/* 프로그래스 영역 — 하단 영역(화면 하단에서 약 20% 지점), 로고와 겹침 없음 */}
      <div className="absolute bottom-[20%] left-1/2 -translate-x-1/2 flex flex-col items-center gap-[12px]">
        {/* 프로그래스바 트랙 — 짧은 pill, 중앙 고정폭 */}
        <div className="w-[140px] h-[3px] rounded-full bg-primary-main-200 dark:bg-layout-gray-600 overflow-hidden">
          {/* 채움 */}
          <div
            className="h-full rounded-full bg-primary-main-600 transition-[width] duration-500 ease-out"
            style={{ width: `${barWidth}%` }}
          />
        </div>

        {/* 단계 텍스트 — 바 아래, 고정 높이로 바 위치 안 밀리게 */}
        <div className="h-[16px] flex items-center justify-center">
          <span
            key={message}
            className="text-[11px] text-layout-gray-400 dark:text-layout-gray-300 text-center leading-none"
          >
            {message}
          </span>
        </div>
      </div>
    </div>
  );
};

export default Index;
