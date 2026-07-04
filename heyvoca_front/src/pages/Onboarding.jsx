import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CaretLeft } from '@phosphor-icons/react';
import HeyCharacter from '../assets/images/HeyCharacter02.png';
import gemImg from '../assets/images/gem.png';
import { getTrialWordsApi } from '../api/study';
import { setGuest, patchGuest, getGuest } from '../utils/guestStorage';
import { vibrate } from '../utils/osFunction';
import TrialLesson from '../components/onboarding/TrialLesson';
import PlantIllustration from '../components/common/PlantIllustration';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';

const GOALS = [
  { key: 'exam', label: '시험 대비' },
  { key: 'conversation', label: '회화' },
  { key: 'hobby', label: '취미' },
  { key: 'abroad', label: '유학·이민' },
];
const CHANNELS = [
  { key: 'friend', label: '지인 추천' },
  { key: 'appstore', label: '앱스토어' },
  { key: 'sns', label: 'SNS' },
  { key: 'search', label: '검색' },
];

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

  const [step, setStep] = useState('start'); // start | personalize | trial | reward
  const [goal, setGoal] = useState(null);
  const [channel, setChannel] = useState(null);
  const [words, setWords] = useState([]);
  const [answers, setAnswers] = useState([]);

  // 맛보기 문제 미리 로드
  useEffect(() => {
    let alive = true;
    getTrialWordsApi().then((res) => {
      if (alive && res?.code === 200) setWords(res.data.words || []);
    });
    return () => { alive = false; };
  }, []);

  const correctCount = answers.filter((a) => a.correct).length;

  const goStart = () => { vibrate({ duration: 5 }); setStep('start'); };

  const handleTrialComplete = (result) => {
    setAnswers(result);
    // 게스트 저장 — 가입 시 서버로 이전
    patchGuest({
      source_channel: channel,
      learning_goal: goal,
      answers: result,
    });
    setStep('reward');
  };

  const handleSignup = () => {
    vibrate({ duration: 5 });
    // 게스트 데이터는 이미 저장됨 → 로그인 후 Index가 migrate 처리
    navigate('/login');
  };

  return (
    <div className="flex flex-col h-screen w-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>

      {/* 헤더 (start 제외 뒤로가기) */}
      <div className="flex items-center h-[48px] px-[12px]">
        {step !== 'start' && step !== 'reward' && (
          <motion.button
            onClick={() => {
              vibrate({ duration: 5 });
              setStep(step === 'trial' ? 'personalize' : 'start');
            }}
            whileTap={{ scale: 0.95 }}
            className="text-layout-gray-300 dark:text-layout-white"
          >
            <CaretLeft size={24} />
          </motion.button>
        )}
      </div>

      <div className="flex flex-col flex-1 px-[24px] pb-[24px] overflow-y-auto">
        <AnimatePresence mode="wait">
          {/* STEP 1 — 시작 */}
          {step === 'start' && (
            <motion.div
              key="start"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col flex-1 items-center justify-center text-center"
            >
              <img src={HeyCharacter} alt="" className="w-[140px] h-[140px] object-contain mb-[24px]" />
              <h1 className="text-[24px] font-[800] leading-[1.35] text-layout-black dark:text-layout-white">
                3분이면<br /><span className="text-primary-main-600">내 단어 실력</span>을 알 수 있어요
              </h1>
              <p className="text-[14px] text-layout-gray-300 mt-[12px] leading-[1.5]">
                가입 없이 먼저 체험해보세요.<br />맛본 단어는 가입하면 그대로 이어져요.
              </p>
              <div className="w-full mt-auto pt-[24px]">
                <motion.button
                  type="button" whileTap={{ scale: 0.97 }}
                  onClick={() => { vibrate({ duration: 5 }); setStep('personalize'); }}
                  className="w-full py-[15px] rounded-[10px] bg-primary-main-600 text-layout-white text-[16px] font-[700]"
                >
                  맛보기 시작하기
                </motion.button>
                <button
                  type="button"
                  onClick={() => { vibrate({ duration: 5 }); navigate('/login'); }}
                  className="w-full py-[13px] mt-[10px] rounded-[10px] bg-layout-gray-50 dark:bg-layout-gray-dark text-[14px] font-[600] text-layout-gray-400 dark:text-layout-gray-200"
                >
                  이미 계정이 있어요
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 2 — 맞춤 설정 */}
          {step === 'personalize' && (
            <motion.div
              key="personalize"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="flex flex-col flex-1"
            >
              <h1 className="text-[22px] font-[800] leading-[1.35] text-layout-black dark:text-layout-white mb-[24px]">
                어떤 목표로<br />공부하세요?
              </h1>
              <p className="text-[15px] font-[700] text-layout-black dark:text-layout-white mb-[4px]">학습 목표</p>
              <div className="flex flex-wrap mb-[20px]">
                {GOALS.map((g) => (
                  <Chip key={g.key} active={goal === g.key} onClick={() => { vibrate({ duration: 5 }); setGoal(g.key); }}>{g.label}</Chip>
                ))}
              </div>
              <p className="text-[15px] font-[700] text-layout-black dark:text-layout-white mb-[4px]">어떻게 알게 되셨어요?</p>
              <div className="flex flex-wrap">
                {CHANNELS.map((c) => (
                  <Chip key={c.key} active={channel === c.key} onClick={() => { vibrate({ duration: 5 }); setChannel(c.key); }}>{c.label}</Chip>
                ))}
              </div>
              <div className="mt-auto pt-[24px]">
                <motion.button
                  type="button" whileTap={goal && channel ? { scale: 0.97 } : undefined}
                  disabled={!goal || !channel}
                  onClick={() => { vibrate({ duration: 5 }); setStep('trial'); }}
                  className="w-full py-[15px] rounded-[10px] bg-primary-main-600 text-layout-white text-[16px] font-[700] disabled:opacity-40"
                >
                  다음
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* STEP 3 — 맛보기 학습 */}
          {step === 'trial' && (
            <motion.div
              key="trial"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="flex flex-col flex-1"
            >
              {words.length > 0 ? (
                <TrialLesson words={words} onComplete={handleTrialComplete} />
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-[14px] text-layout-gray-300">단어를 불러오는 중...</p>
                </div>
              )}
            </motion.div>
          )}

          {/* STEP 4 — 결과·보상 */}
          {step === 'reward' && (
            <motion.div
              key="reward"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col flex-1 items-center justify-center text-center"
            >
              <motion.div
                initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 14 }}
                className="mb-[20px]"
              >
                <PlantIllustration stage="carrot" wilt="fresh" size={120} />
              </motion.div>
              <h1 className="text-[22px] font-[800] leading-[1.35] text-layout-black dark:text-layout-white">
                <span className="text-primary-main-600">{correctCount} / {answers.length} 정답!</span><br />
                단어 감각이 좋으시네요
              </h1>
              <p className="text-[14px] text-layout-gray-300 mt-[12px] leading-[1.5]">
                가입하면 첫 보석과 함께<br />방금 맛본 단어를 내 농장에 심어드려요.
              </p>
              <div className="flex items-center gap-[6px] mt-[18px] px-[16px] py-[9px] rounded-[20px] bg-[#FFF8E8] dark:bg-layout-gray-dark">
                <img src={gemImg} alt="보석" className="w-[18px] h-[16px]" />
                <span className="text-[15px] font-[800] text-[#F68300]">첫 가입 보석 +5</span>
              </div>
              <div className="w-full mt-auto pt-[24px]">
                <motion.button
                  type="button" whileTap={{ scale: 0.97 }}
                  onClick={handleSignup}
                  className="w-full py-[15px] rounded-[10px] bg-primary-main-600 text-layout-white text-[16px] font-[700]"
                >
                  가입하고 이어가기
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Onboarding;
