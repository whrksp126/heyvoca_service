import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bell } from '@phosphor-icons/react';
import HeyCharacter from '../assets/images/HeyCharacter02.png';
import gemImg from '../assets/images/gem.png';
import { getLevelBookApi } from '../api/study';
import { setGuest, patchGuest, getGuest, clearGuest } from '../utils/guestStorage';
import { buildGuestQuestions } from '../utils/guestQuestions';
import { vibrate } from '../utils/osFunction';
import PlantIllustration from '../components/common/PlantIllustration';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';
import postMessageManager from '../utils/postMessageManager';

// 레벨별 단어장 (auth level_book_list와 동일: 1 초등 ~ 4 대학생)
const LEVELS = [
  { key: 1, label: '초등', desc: '기초 필수 단어부터' },
  { key: 2, label: '중등', desc: '교과 핵심 단어' },
  { key: 3, label: '고등', desc: '수능 대비 단어' },
  { key: 4, label: '대학생 이상', desc: '실전·시험 단어' },
];
const CHANNELS = [
  { key: 'friend', label: '지인 추천' },
  { key: 'appstore', label: '앱스토어' },
  { key: 'sns', label: 'SNS' },
  { key: 'search', label: '검색' },
  { key: 'etc', label: '기타' },
];
const GOALS = [
  { key: 'exam', label: '시험 대비' },
  { key: 'conversation', label: '회화' },
  { key: 'hobby', label: '취미' },
  { key: 'abroad', label: '유학·이민' },
];
const DAILY = [5, 10, 20, 30];

// 개인화 4스텝 프로그래스 (레벨/유입/목적/일일)
const PERSONALIZE_ORDER = ['level', 'channel', 'goal', 'daily'];

const Chip = ({ active, children, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`
      px-[14px] py-[10px] rounded-[20px] border-[1.5px] text-[13px] font-[600] m-[3px]
      ${active
        ? 'border-primary-main-600 text-primary-main-600 bg-primary-main-50 dark:bg-primary-main-dark'
        : 'border-layout-gray-100 dark:border-layout-gray-dark text-layout-gray-400 dark:text-layout-gray-200'}
    `}
  >
    {children}
  </button>
);

const Onboarding = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  useStatusBarStyle('dark-content');
  const navigate = useNavigate();
  const location = useLocation();

  const saved = getGuest() || {};
  // 맛보기 학습(takeTest)에서 돌아온 경우 location.state.step === 'reward'
  const returned = location.state?.step === 'reward';

  const [step, setStep] = useState(returned ? 'reward' : 'start');
  const [level, setLevel] = useState(saved.level ?? null);
  const [channel, setChannel] = useState(saved.source_channel ?? null);
  const [goal, setGoal] = useState(saved.learning_goal ?? null);
  const [daily, setDaily] = useState(saved.daily_new_limit ?? 10);
  const [username, setUsername] = useState('');
  const [loadingTrial, setLoadingTrial] = useState(false);

  // 맛보기 결과 (takeTest에서 넘어온 답안)
  const answers = returned ? (location.state?.answers ?? []) : (saved.answers ?? []);
  const correctCount = answers.filter((a) => a.correct).length;

  // reward 재진입 시 답안을 guest에 병합 저장
  useEffect(() => {
    if (returned && answers.length > 0) {
      patchGuest({ answers });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returned]);

  const persist = (patch) => patchGuest({
    level, source_channel: channel, learning_goal: goal, daily_new_limit: daily, ...patch,
  });

  // 개인화 진행률(%)
  const progress = (() => {
    const i = PERSONALIZE_ORDER.indexOf(step);
    if (i < 0) return null;
    return ((i + 1) / PERSONALIZE_ORDER.length) * 100;
  })();

  const closeOnboarding = () => {
    vibrate({ duration: 5 });
    navigate('/login');
  };

  // 맛보기 시작 — 선택 레벨 단어장으로 실제 takeTest 구동
  const startTrial = async () => {
    if (loadingTrial) return;
    vibrate({ duration: 5 });
    setLoadingTrial(true);
    persist({}); // 개인화 값 저장
    try {
      const res = await getLevelBookApi(level);
      const words = res?.data?.vocaList || [];
      const questions = buildGuestQuestions(words, 5);
      if (questions.length === 0) {
        // 단어가 부족하면 개인화만 저장하고 바로 가입 유도
        setStep('reward');
        return;
      }
      navigate('/take-test', {
        state: { testType: 'today', guestMode: true, guestQuestions: questions },
      });
    } finally {
      setLoadingTrial(false);
    }
  };

  const handleSignup = () => {
    vibrate({ duration: 5 });
    persist({ username: username.trim() || null });
    setStep('notif');
  };

  const handleNotif = (allow) => {
    vibrate({ duration: 5 });
    if (allow) {
      try { postMessageManager.sendMessageToReactNative('requestNotificationPermission', {}); } catch (e) { /* 웹은 무시 */ }
    }
    // 게스트 데이터는 저장돼 있음 → 로그인 후 Index가 migrate
    navigate('/login');
  };

  const nextFrom = (cur) => {
    const order = ['level', 'channel', 'goal', 'daily'];
    const i = order.indexOf(cur);
    if (i < order.length - 1) { persist({}); setStep(order[i + 1]); }
    else startTrial();
  };
  const backFrom = (cur) => {
    const order = ['start', 'level', 'channel', 'goal', 'daily'];
    const i = order.indexOf(cur);
    if (i > 0) setStep(order[i - 1]);
  };

  const NextBtn = ({ disabled, label = '다음', onClick }) => (
    <div className="mt-auto pt-[24px]">
      <motion.button
        type="button" whileTap={!disabled ? { scale: 0.97 } : undefined} disabled={disabled}
        onClick={onClick}
        className="w-full py-[15px] rounded-[10px] bg-primary-main-600 text-layout-white text-[16px] font-[700] disabled:opacity-40"
      >
        {label}
      </motion.button>
    </div>
  );

  return (
    <div className="flex flex-col h-screen w-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>

      {/* 상단바 — 개인화 스텝: 닫기X + 프로그래스 */}
      {progress !== null && (
        <div className="flex items-center gap-[10px] px-[16px] h-[48px]">
          <button onClick={closeOnboarding} className="text-layout-gray-300 dark:text-layout-white">
            <X size={22} />
          </button>
          <div className="relative flex-1 h-[5px] rounded-[3px] bg-layout-gray-50 dark:bg-layout-gray-dark overflow-hidden">
            <motion.div
              className="absolute left-0 top-0 h-full rounded-[3px] bg-primary-main-600"
              animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col flex-1 px-[24px] pb-[24px] overflow-y-auto">
        <AnimatePresence mode="wait">
          {/* 진입 */}
          {step === 'start' && (
            <motion.div key="start" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col flex-1 items-center justify-center text-center">
              <img src={HeyCharacter} alt="" className="w-[140px] h-[140px] object-contain mb-[24px]" />
              <h1 className="text-[24px] font-[800] leading-[1.35] text-layout-black dark:text-layout-white">
                3분이면<br /><span className="text-primary-main-600">내 단어 실력</span>을 알 수 있어요
              </h1>
              <p className="text-[14px] text-layout-gray-300 mt-[12px] leading-[1.5]">
                가입 없이 먼저 체험해보세요.<br />맛본 단어는 가입하면 그대로 이어져요.
              </p>
              <div className="w-full mt-auto pt-[24px]">
                <motion.button type="button" whileTap={{ scale: 0.97 }}
                  onClick={() => { vibrate({ duration: 5 }); setStep('level'); }}
                  className="w-full py-[15px] rounded-[10px] bg-primary-main-600 text-layout-white text-[16px] font-[700]">
                  시작하기
                </motion.button>
                <button type="button" onClick={() => { vibrate({ duration: 5 }); navigate('/login'); }}
                  className="w-full mt-[12px] text-[13px] font-[500] text-layout-gray-300 underline">
                  이미 계정이 있어요 · 로그인
                </button>
              </div>
            </motion.div>
          )}

          {/* 1-a 레벨(단어장) 선택 */}
          {step === 'level' && (
            <motion.div key="level" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="flex flex-col flex-1">
              <h1 className="text-[22px] font-[800] leading-[1.35] text-layout-black dark:text-layout-white mb-[6px]">
                어떤 단어장으로<br />배워볼까요?
              </h1>
              <p className="text-[13px] text-layout-gray-300 mb-[16px]">고른 단어장으로 바로 맛봐요</p>
              <div className="flex flex-col gap-[8px]">
                {LEVELS.map((lv) => (
                  <button key={lv.key} type="button"
                    onClick={() => { vibrate({ duration: 5 }); setLevel(lv.key); }}
                    className={`flex items-center gap-[12px] p-[14px] rounded-[10px] border-[1.5px] text-left
                      ${level === lv.key ? 'border-primary-main-600 bg-primary-main-50 dark:bg-primary-main-dark' : 'border-layout-gray-100 dark:border-layout-gray-dark'}`}>
                    <span className="flex items-center justify-center w-[40px] h-[40px] rounded-[8px] bg-primary-main-100 dark:bg-layout-gray-dark text-[15px] font-[800] text-primary-main-600">
                      {lv.label[0]}
                    </span>
                    <span className="flex flex-col">
                      <span className="text-[15px] font-[700] text-layout-black dark:text-layout-white">{lv.label}</span>
                      <span className="text-[12px] text-layout-gray-300">{lv.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
              <NextBtn disabled={!level} onClick={() => nextFrom('level')} />
            </motion.div>
          )}

          {/* 1-b 유입 경로 */}
          {step === 'channel' && (
            <motion.div key="channel" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="flex flex-col flex-1">
              <h1 className="text-[22px] font-[800] leading-[1.35] text-layout-black dark:text-layout-white mb-[20px]">
                어떻게<br />알게 되셨어요?
              </h1>
              <div className="flex flex-wrap">
                {CHANNELS.map((c) => (
                  <Chip key={c.key} active={channel === c.key} onClick={() => { vibrate({ duration: 5 }); setChannel(c.key); }}>{c.label}</Chip>
                ))}
              </div>
              <NextBtn disabled={!channel} onClick={() => nextFrom('channel')} />
            </motion.div>
          )}

          {/* 1-c 학습 목적 */}
          {step === 'goal' && (
            <motion.div key="goal" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="flex flex-col flex-1">
              <h1 className="text-[22px] font-[800] leading-[1.35] text-layout-black dark:text-layout-white mb-[20px]">
                어떤 목표로<br />공부하세요?
              </h1>
              <div className="flex flex-wrap">
                {GOALS.map((g) => (
                  <Chip key={g.key} active={goal === g.key} onClick={() => { vibrate({ duration: 5 }); setGoal(g.key); }}>{g.label}</Chip>
                ))}
              </div>
              <NextBtn disabled={!goal} onClick={() => nextFrom('goal')} />
            </motion.div>
          )}

          {/* 1-d 일일 목표 */}
          {step === 'daily' && (
            <motion.div key="daily" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="flex flex-col flex-1">
              <h1 className="text-[22px] font-[800] leading-[1.35] text-layout-black dark:text-layout-white mb-[6px]">
                하루에 몇 개<br />배워볼까요?
              </h1>
              <p className="text-[13px] text-layout-gray-300 mb-[16px]">나중에 마이페이지에서 바꿀 수 있어요</p>
              <div className="flex flex-wrap">
                {DAILY.map((n) => (
                  <Chip key={n} active={daily === n} onClick={() => { vibrate({ duration: 5 }); setDaily(n); }}>{n}개</Chip>
                ))}
              </div>
              <NextBtn disabled={!daily} label={loadingTrial ? '불러오는 중...' : '맛보기 시작하기'} onClick={() => nextFrom('daily')} />
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
              {/* 획득 연출 — 첫 학습 업적 / 보석 (실제 지급은 가입 직후) */}
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
                  className="w-full py-[15px] rounded-[10px] bg-primary-main-600 text-layout-white text-[16px] font-[700]">
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
              <h1 className="text-[22px] font-[800] text-layout-black dark:text-layout-white mb-[6px]">거의 다 왔어요!</h1>
              <p className="text-[13px] text-layout-gray-300 mb-[20px]">로그인하면 맛본 기록이 그대로 이어져요</p>
              <p className="text-[14px] font-[700] text-layout-black dark:text-layout-white mb-[6px]">닉네임</p>
              <input
                value={username} onChange={(e) => setUsername(e.target.value.slice(0, 8))}
                placeholder="닉네임을 입력해주세요 (8자 이내)"
                className="w-full px-[14px] py-[13px] rounded-[10px] bg-layout-gray-50 dark:bg-layout-gray-dark text-[14px] text-layout-black dark:text-layout-white outline-none"
              />
              <NextBtn disabled={!username.trim()} label="다음" onClick={handleSignup} />
            </motion.div>
          )}

          {/* 로그인 후 · 알림 권한 */}
          {step === 'notif' && (
            <motion.div key="notif" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col flex-1 items-center justify-center text-center">
              <div className="flex items-center justify-center w-[96px] h-[96px] rounded-full bg-secondary-purple-100 dark:bg-layout-gray-dark mb-[20px]">
                <Bell size={44} weight="fill" className="text-primary-main-600" />
              </div>
              <h1 className="text-[22px] font-[800] leading-[1.35] text-layout-black dark:text-layout-white">
                복습 시간을<br />알려드릴까요?
              </h1>
              <p className="text-[14px] text-layout-gray-300 mt-[12px] leading-[1.5]">
                잊을 때쯤 살짝 알림을 보내<br />기억이 오래 가게 도와드려요
              </p>
              <div className="w-full mt-auto pt-[24px]">
                <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={() => handleNotif(true)}
                  className="w-full py-[15px] rounded-[10px] bg-primary-main-600 text-layout-white text-[16px] font-[700]">
                  알림 받기
                </motion.button>
                <button type="button" onClick={() => handleNotif(false)}
                  className="w-full mt-[12px] text-[13px] font-[500] text-layout-gray-300 underline">
                  나중에 할게요
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Onboarding;
