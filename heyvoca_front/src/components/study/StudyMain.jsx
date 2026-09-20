import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { SpeakerHigh, Play, Pause, CaretLeft, CaretRight, Repeat } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import StudyHeader from './StudyHeader';
import StudyFarmStatusBar from './StudyFarmStatusBar';
import { StudySettingsNewBottomSheet } from '../newBottomSheet/StudySettingsNewBottomSheet';
import { ConfirmNewBottomSheet } from '../newBottomSheet/ConfirmNewBottomSheet';
import TtsRipple from '../common/TtsRipple';
import { getTextSound, stopCurrentSound, prefetchTtsList } from '../../utils/common';
import { collectStudyTexts, prepareTtsWithProgress } from '../../api/tts';
import ProgressSplash from '../common/ProgressSplash';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useOnboardingUnlock } from '../../context/OnboardingUnlockContext';
import { useUser } from '../../context/UserContext';
import { haptic, Pressable } from '../../lib/feel';
import { AppHistory } from '../../utils/appHistory';

// 학습 진입 전 TTS 준비(prefetch) 튜닝값.
// - PREPARE_PRIORITY_COUNT: 전체 준비가 늦어질 때 최소한으로 보장할 앞쪽 카드 수.
// - PREPARE_MAX_WAIT_MS: 전체 prefetch를 기다려주는 최대 시간(넘으면 앞쪽만 보장 후 진입).
const PREPARE_PRIORITY_COUNT = 3;
// 한 라인(단어/뜻/예문) 최소 노출시간(ms). 캐시 미스로 오디오가 즉시 끝나도(재생 실패)
// 라인이 0ms에 스킵돼 "렉 걸린 듯 순식간에 넘어가는" 것을 막는 최소 지속시간.
const MIN_LINE_DWELL_MS = 650;
const PREPARE_MAX_WAIT_MS = 6000;

const DEFAULT_SETTINGS = {
  visibility: {
    word: true,
    meanings: true,
    exampleSentences: true,
    exampleMeanings: true,
  },
  playbackOrder: [
    { id: 'word', label: '단어', count: 1 },
    { id: 'meanings', label: '의미', count: 1 },
    { id: 'exampleSentences', label: '예문 문장', count: 1 },
    { id: 'exampleMeanings', label: '예문 뜻', count: 1 },
  ],
};

// 백엔드 voca_meaning.pos(UD 품사 태그) → 한국어 접두 라벨. 지금 /study 로 넘어오는
// 단어 객체의 meanings 는 문자열 배열뿐이라(품사 미포함) 대부분 안 쓰이지만, meanings
// 항목이 `{ meaning, pos }` 형태로 오는 자리(향후 확장)를 그대로 지원해 둔다.
const POS_LABEL_KO = {
  NOUN: '명사', VERB: '동사', ADJ: '형용사', ADV: '부사', PRON: '대명사',
  DET: '한정사', ADP: '전치사', CCONJ: '접속사', SCONJ: '접속사', NUM: '수사',
  INTJ: '감탄사', PART: '불변화사', AUX: '조동사', PROPN: '고유명사', X: '기타',
};

// meanings 항목이 문자열이든 `{ meaning, pos }` 객체든 같은 모양으로 뽑아낸다.
const meaningParts = (item) => {
  if (item && typeof item === 'object') {
    const pos = item.pos ? (POS_LABEL_KO[item.pos] || item.pos) : null;
    return { text: item.meaning ?? item.text ?? '', pos };
  }
  return { text: item ?? '', pos: null };
};


const StudyMain = ({ words }) => {
  "use memo";

  const navigate = useNavigate();
  const { pushNewBottomSheet, pushAwaitNewBottomSheet } = useNewBottomSheetActions();
  const { completeMission } = useOnboardingUnlock();
  const { isLogin } = useUser();
  // 온보딩 M5(집중 반복 학습) 완료 신호는 세션당 1회만 — 중복 클릭 등으로 인한 불필요 호출 방지.
  const missionSignaledRef = useRef(false);

  const reducedMotion = useReducedMotion();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState('next');
  // 카드 노출 전 TTS 준비(prefetch) 단계 — 준비가 끝나기 전까지 준비 스플래시를 보여준다.
  const [isPreparing, setIsPreparing] = useState(true);
  // 준비 진행률(0~1) — 로그인 스플래시와 동일한 프로그래스바 표시에 사용.
  const [prepareProgress, setPrepareProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  // 반복 재생 — 켜져 있으면 카드 하나의 재생 순서가 끝나도 다음 카드로 넘어가지 않고
  // 같은 카드를 이어서 다시 읽는다(플레이어의 "한 곡 반복"과 같은 개념).
  const [repeatMode, setRepeatMode] = useState(false);
  const [playingItemId, setPlayingItemId] = useState(null);
  // 의미·예문처럼 한 항목에 여러 라인이 있을 때 현재 재생 중인 라인의 인덱스.
  // word처럼 단일 라인 항목은 null.
  const [playingItemIndex, setPlayingItemIndex] = useState(null);
  // 지금 재생 중인 라인의 실제 오디오 길이(초) — 스피커 리플(TtsRipple)을 재생 길이에 1:1로 맞춘다.
  const [playDuration, setPlayDuration] = useState(null);
  const [revealedMap, setRevealedMap] = useState({}); // { [cardIdx]: Set<itemId> }
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  // 재생 취소용 ref
  const playbackCancelRef = useRef(false);
  const playTimeoutRef = useRef(null);
  const playbackResolveRef = useRef(null); // 현재 대기 중인 재생 Promise resolve

  // 최신 값을 클로저에서 안전하게 읽기 위한 ref
  const currentIndexRef = useRef(currentIndex);
  const settingsRef = useRef(settings);
  const wordsRef = useRef(words);
  const isPlayingRef = useRef(isPlaying);
  const repeatModeRef = useRef(repeatMode);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { wordsRef.current = words; }, [words]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);

  const word = words[currentIndex];
  const meanings = word?.meanings || [];
  const examples = word?.examples || [];
  const totalCards = words.length;

  const revealedSet = revealedMap[currentIndex] || new Set();

  const isVisible = (key) =>
    settings.visibility[key] || revealedSet.has(key);

  const isPlayingLine = (itemId, index = null) =>
    playingItemId === itemId && playingItemIndex === index;

  const handleReveal = (key) => {
    haptic('light');
    setRevealedMap(prev => {
      const existing = prev[currentIndex] ? new Set(prev[currentIndex]) : new Set();
      existing.add(key);
      return { ...prev, [currentIndex]: existing };
    });
  };

  // 재생 중단
  const stopPlayback = useCallback(() => {
    playbackCancelRef.current = true;
    if (playTimeoutRef.current) {
      clearTimeout(playTimeoutRef.current);
      playTimeoutRef.current = null;
    }
    // 대기 중인 오디오 Promise 즉시 해제 (await getTextSound 언블록)
    if (playbackResolveRef.current) {
      playbackResolveRef.current();
      playbackResolveRef.current = null;
    }
    setPlayingItemId(null);
    setPlayingItemIndex(null);
    setPlayDuration(null);
  }, []);

  // 자동 재생 — 현재 카드의 playbackOrder 순서대로 TTS 재생
  const startPlayback = useCallback(async (startCardIndex) => {
    playbackCancelRef.current = false;

    // 한 라인 재생. 인덱스가 null이면 단일 라인 항목.
    // getTextSound가 reject/throw해도 settle은 한 번만 resolve되어 await 정지 방지.
    const playOne = async (itemId, index, text, lang) => {
      if (!text) return;
      setPlayingItemId(itemId);
      setPlayingItemIndex(index);
      setPlayDuration(null);
      await new Promise(resolve => {
        let settled = false, audioDone = false, minDone = false, minTimer = null;
        const finish = () => {
          if (settled) return;
          settled = true;
          if (minTimer) { clearTimeout(minTimer); minTimer = null; }
          if (playbackResolveRef.current === forceSettle) {
            playbackResolveRef.current = null;
          }
          resolve();
        };
        // 정지(stopPlayback)로 즉시 해제되는 경로.
        const forceSettle = () => finish();
        // 오디오 종료 + 최소 노출시간을 "모두" 만족해야 다음 라인으로 진행.
        // 캐시 미스로 오디오가 즉시 끝나도(재생 실패) 최소 노출시간은 보장 → 0ms 스킵 방지.
        const maybeFinish = () => { if (audioDone && minDone) finish(); };
        playbackResolveRef.current = forceSettle;
        minTimer = setTimeout(() => { minDone = true; maybeFinish(); }, MIN_LINE_DWELL_MS);
        Promise.resolve(getTextSound(text, lang, (d) => {
          if (!playbackCancelRef.current) setPlayDuration(d);
        })).then(
          () => { audioDone = true; maybeFinish(); },
          () => { audioDone = true; maybeFinish(); },
        );
      });
    };

    // cardIdx를 인자로 명시 전달 — currentIndexRef 동기화 타이밍에 의존하지 않음.
    const runPlay = async (cardIdx) => {
      const currentWord = wordsRef.current[cardIdx];
      if (!currentWord) return;

      // 현재 카드 재생 동안 다음 카드 음성을 미리 받아 둔다 → 카드 전환 시 즉시 재생.
      const nextWord = wordsRef.current[cardIdx + 1];
      if (nextWord) prefetchTtsList(collectStudyTexts([nextWord]));

      const { playbackOrder } = settingsRef.current;
      const meaningsList = currentWord.meanings || [];
      const examplesList = currentWord.examples || [];

      for (const item of playbackOrder) {
        if (playbackCancelRef.current) return;
        if (item.count === 0) continue;

        // count = 한 항목을 몇 사이클 반복할지. 한 사이클은 해당 항목의 모든 라인 1회 순회.
        for (let cycle = 0; cycle < item.count; cycle++) {
          if (playbackCancelRef.current) return;

          if (item.id === 'word') {
            await playOne('word', null, currentWord.origin || '', 'en');
          } else if (item.id === 'meanings') {
            for (let i = 0; i < meaningsList.length; i++) {
              if (playbackCancelRef.current) return;
              await playOne('meanings', i, meaningParts(meaningsList[i]).text, 'ko');
            }
          } else if (item.id === 'exampleSentences') {
            for (let i = 0; i < examplesList.length; i++) {
              if (playbackCancelRef.current) return;
              const ex = examplesList[i] || {};
              const text = ex.origin || ex.sentence || '';
              await playOne('exampleSentences', i, text, 'en');
            }
          } else if (item.id === 'exampleMeanings') {
            for (let i = 0; i < examplesList.length; i++) {
              if (playbackCancelRef.current) return;
              const ex = examplesList[i] || {};
              const text = ex.meaning || ex.translation || '';
              await playOne('exampleMeanings', i, text, 'ko');
            }
          }
        }
      }

      if (playbackCancelRef.current) return;

      setPlayingItemId(null);
      setPlayingItemIndex(null);
      setPlayDuration(null);

      if (repeatModeRef.current) {
        // 반복 재생 — 카드 이동 없이 같은 카드를 이어서 다시 읽는다.
        playTimeoutRef.current = setTimeout(() => {
          if (!playbackCancelRef.current) runPlay(cardIdx);
        }, 350);
        return;
      }

      // 다음 카드로 자동 이동
      const nextIdx = cardIdx + 1;
      if (nextIdx < wordsRef.current.length) {
        setDirection('next');
        currentIndexRef.current = nextIdx; // ref 즉시 동기화
        setCurrentIndex(nextIdx);
        // 카드 전환 애니메이션 후 다음 카드 재생
        playTimeoutRef.current = setTimeout(() => {
          if (!playbackCancelRef.current) runPlay(nextIdx);
        }, 350);
      } else {
        // 마지막 카드 재생 완료 → 정지
        setIsPlaying(false);
      }
    };

    runPlay(typeof startCardIndex === 'number' ? startCardIndex : currentIndexRef.current);
  }, []);

  // 카드 이동 — 재생 중이었다면 새 카드에서 이어서 자동 재생(끊기지 않는다), 아니었다면
  // 정지 상태를 유지한다. 손끝 스와이프(handleDragEnd)도 이 함수를 그대로 쓴다.
  const goToNext = useCallback(() => {
    if (currentIndexRef.current >= wordsRef.current.length - 1) return;
    const wasPlaying = isPlayingRef.current;
    stopPlayback();
    haptic('selection');
    setDirection('next');
    const nextIdx = currentIndexRef.current + 1;
    currentIndexRef.current = nextIdx;
    setCurrentIndex(nextIdx);
    if (wasPlaying) {
      playTimeoutRef.current = setTimeout(() => {
        if (!playbackCancelRef.current) startPlayback(nextIdx);
      }, 350);
    } else {
      setIsPlaying(false);
    }
  }, [stopPlayback, startPlayback]);

  const goToPrev = useCallback(() => {
    if (currentIndexRef.current <= 0) return;
    const wasPlaying = isPlayingRef.current;
    stopPlayback();
    haptic('selection');
    setDirection('prev');
    const prevIdx = currentIndexRef.current - 1;
    currentIndexRef.current = prevIdx;
    setCurrentIndex(prevIdx);
    if (wasPlaying) {
      playTimeoutRef.current = setTimeout(() => {
        if (!playbackCancelRef.current) startPlayback(prevIdx);
      }, 350);
    } else {
      setIsPlaying(false);
    }
  }, [stopPlayback, startPlayback]);

  const handleSpeakerClick = useCallback((itemId, index, text, lang) => {
    haptic('light');
    const isSameLine = playingItemId === itemId && playingItemIndex === index;
    if (isSameLine) {
      // 재생 중 클릭 → 정지
      setIsPlaying(false);
      stopPlayback();
      stopCurrentSound();
    } else {
      // 정지 중 클릭 → 자동재생 중단 + 해당 라인만 재생
      setIsPlaying(false);
      stopPlayback();
      stopCurrentSound();
      setPlayingItemId(itemId);
      setPlayingItemIndex(index);
      setPlayDuration(null);
      getTextSound(text, lang, (d) => setPlayDuration(d)).then(() => {
        setPlayingItemId(prev => prev === itemId ? null : prev);
        setPlayingItemIndex(prev => prev === index ? null : prev);
        setPlayDuration(null);
      });
    }
  }, [playingItemId, playingItemIndex, stopPlayback]);

  const handlePlayToggle = () => {
    if (isPlaying) {
      setIsPlaying(false);
      stopPlayback();
    } else {
      setIsPlaying(true);
      startPlayback(currentIndex);
    }
  };

  const handleToggleRepeat = () => {
    setRepeatMode(prev => !prev);
  };

  // isPlaying이 false로 바뀌면 재생 중단
  useEffect(() => {
    if (!isPlaying) stopPlayback();
  }, [isPlaying, stopPlayback]);

  // 마운트 시: 카드를 보여주기 전에 TTS를 최대한 미리 준비(서버 캐싱 + 클라이언트 blob prefetch)한다.
  // 전체 prefetch를 우선 시도하되, 너무 오래 걸리면(PREPARE_MAX_WAIT_MS) 앞쪽 카드만 최소 보장하고
  // 진입 — 첫 재생 지연만 확실히 없애고 나머지는 백그라운드에서 계속 준비한다.
  // 언마운트 시 모든 비동기 체인(setTimeout/audio) 정리.
  useEffect(() => {
    let cancelled = false;

    const prepareAndStart = async () => {
      const allTexts = collectStudyTexts(words);
      // 게이트(대기) 대상: 앞쪽 카드만 — 전체를 기다리면 너무 오래 걸린다. 앞 카드가 확실히
      // 준비되면 진입하고, 나머지는 백그라운드로 이어서 준비(다음 카드 prefetch가 앞서 채움).
      const priorityTexts = collectStudyTexts(words.slice(0, PREPARE_PRIORITY_COUNT));

      // 앞쪽 카드 준비 — 생성 청크 단위로 진행률을 세밀하게 올린다.
      const gatePromise = prepareTtsWithProgress(priorityTexts, (p) => {
        if (!cancelled) setPrepareProgress(p);
      }).catch(() => {});
      // 최대 대기 초과 시 진입(무한 대기 방지) — 나머지는 아래 백그라운드가 계속 준비.
      await Promise.race([
        gatePromise,
        new Promise(resolve => setTimeout(resolve, PREPARE_MAX_WAIT_MS)),
      ]);

      if (cancelled) return;
      setPrepareProgress(1);
      setIsPreparing(false);
      setIsPlaying(true);
      startPlayback(0);

      // 진입 후: 전체(단어·의미·예문) 음성을 백그라운드로 계속 준비(진행률 없이).
      prepareTtsWithProgress(allTexts, null).catch(() => {});
    };

    prepareAndStart();

    return () => {
      cancelled = true;
      stopPlayback();
      stopCurrentSound();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 카드 변경 시 isPlaying 상태이면 새 카드 재생 (startPlayback에서 자동 처리되므로 별도 처리 불필요)
  // 단, 수동 이동 시에는 정지
  const handleSettingsClick = () => {
    stopPlayback();
    setIsPlaying(false);
    pushNewBottomSheet(
      StudySettingsNewBottomSheet,
      {
        initialSettings: settings,
        onSet: (newSettings) => {
          setSettings(newSettings);
        },
      },
      {
        isBackdropClickClosable: true,
        isDragToCloseEnabled: true,
      }
    );
  };

  // 마지막 카드까지 도달해 "종료" 버튼으로 정상 완료한 지점.
  // (중간 이탈은 handleStopLearning의 확인 바텀시트를 거치므로 여기 도달하지 않음)
  const handleEnd = () => {
    stopPlayback();
    haptic('success');
    // 온보딩 M5(집중 반복 학습) 완료 신호 — 로그인 사용자에서만, 세션당 1회.
    // /study 경로는 로그인 사용자만 도달(게스트 온보딩 체험은 /take-test guestMode 흐름 별도).
    if (isLogin && !missionSignaledRef.current) {
      missionSignaledRef.current = true;
      completeMission('focus_study');
    }
    navigate(-1);
  };

  // 학습 종료 확인 (네이티브 물리 뒤로가기 / 헤더 뒤로가기 공통)
  const handleStopLearning = async () => {
    if (window.newBottomSheetContext && window.newBottomSheetContext.stack.length > 0) {
      window.newBottomSheetContext.popNewBottomSheet();
      return;
    }

    const ConfirmResult = await pushAwaitNewBottomSheet(
      ConfirmNewBottomSheet,
      {
        title: (
          <>
            학습할 단어가 남아있어요.<br />
            학습을 종료할까요?
          </>
        ),
        btns: {
          confirm: "종료",
          cancel: "취소",
        }
      },
      {
        isBackdropClickClosable: true,
        isDragToCloseEnabled: true
      }
    );

    if (ConfirmResult) {
      stopPlayback();
      stopCurrentSound();
      if (AppHistory.canGoBack()) {
        navigate(-1);
      } else {
        navigate('/home');
      }
    }
  };

  // 네이티브 물리 뒤로가기 핸들러 재정의 (학습 중에만)
  useEffect(() => {
    const originalOnBackPressed = window.onBackPressed;
    window.onBackPressed = handleStopLearning;

    return () => {
      window.onBackPressed = originalOnBackPressed;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isPreparing) {
    // 로그인 스플래시와 동일한 프로그래스 화면으로 준비 상태를 보여준다(범용 문구).
    return <ProgressSplash progress={prepareProgress} message="학습을 준비하는 중" />;
  }

  if (!word) {
    return (
      <div className="flex flex-col h-screen bg-layout-white dark:bg-layout-black">
        <StudyHeader onSettingsClick={handleSettingsClick} />
        <div className="flex flex-1 items-center justify-center text-layout-gray-400">
          단어가 없습니다.
        </div>
      </div>
    );
  }

  // 카드 슬라이드 애니메이션 variants
  const cardVariants = {
    enter: (dir) => ({ x: dir === 'next' ? '100%' : '-100%', opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir) => ({ x: dir === 'next' ? '-100%' : '100%', opacity: 0 }),
  };

  // 좌우 스와이프 → 다음/이전 카드
  const SWIPE_OFFSET_THRESHOLD = 80;
  const SWIPE_VELOCITY_THRESHOLD = 500;
  const handleDragEnd = (_, info) => {
    const { offset, velocity } = info;
    const swipedFar = Math.abs(offset.x) > SWIPE_OFFSET_THRESHOLD;
    const swipedFast = Math.abs(velocity.x) > SWIPE_VELOCITY_THRESHOLD;
    if (!swipedFar && !swipedFast) return;
    if (offset.x < 0 && currentIndex < totalCards - 1) {
      goToNext();
    } else if (offset.x > 0 && currentIndex > 0) {
      goToPrev();
    }
  };

  // 하단 플레이어의 진행 점 — "음성 재생 순서" 중 count>0(재생 켜짐)인 항목만, 그 순서
  // 그대로. 순서를 바꾸면 점 라벨도 그대로 따라간다(같은 배열을 그린다).
  const activeOrder = settings.playbackOrder.filter(item => item.count > 0);
  const activeDotIndex = activeOrder.findIndex(item => item.id === playingItemId);
  const isFirstCard = currentIndex === 0;
  const isLastCard = currentIndex === totalCards - 1;

  return (
    <div className="flex flex-col h-[calc(100vh-var(--status-bar-height))] bg-layout-white dark:bg-layout-black overflow-hidden">
      <StudyHeader onBackClick={handleStopLearning} onSettingsClick={handleSettingsClick} />

      {/* 프로그레스 바 */}
      <div className="px-[20px] pt-[5px]">
        <motion.div className="
          relative
          w-full h-[16px]
          mb-[8px]
          rounded-[50px]
          bg-primary-main-100 dark:bg-layout-gray-dark
          overflow-hidden
        ">
          <motion.div
            className="h-[100%] rounded-[50px] bg-primary-main-600"
            initial={{ width: '0%' }}
            animate={{ width: `${((currentIndex + 1) / totalCards) * 100}%` }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          />
          <span className="
            absolute right-[10px] top-[50%] translate-y-[-50%]
            text-[#7b7b7b] text-[10px] font-semibold tracking-[-0.2px]
          ">
            {currentIndex + 1}/{totalCards}
          </span>
        </motion.div>
      </div>

      {/* 카드 영역 */}
      <div className="flex-1 pt-[15px] px-[20px] overflow-hidden relative">
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={currentIndex}
            custom={direction}
            variants={cardVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            className="absolute inset-x-[20px] top-[15px] bottom-0 bg-layout-gray-50 dark:bg-layout-gray-dark rounded-[12px] overflow-y-auto touch-pan-y"
          >
            <div className="p-[20px] flex flex-col gap-[22px]">
              {/* 작물 상태 바 — 옛 미학습 배지를 대체한다 */}
              <StudyFarmStatusBar farm={word.farm} />

              <div className="flex flex-col gap-[12px]">
                <div>
                  {/* 단어 */}
                  {isVisible('word') ? (
                    <div className={`flex items-start justify-between gap-[5px] ${playingItemId === 'word' ? 'text-primary-main-600' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <span className={`block text-[24px] font-[700] leading-[29px] ${playingItemId === 'word' ? 'text-primary-main-600' : 'text-layout-black dark:text-layout-white'}`}>
                          {word.origin}
                        </span>
                        {word.pronunciation && (
                          <span className="block mt-[2px] text-[12px] font-[500] text-layout-gray-300 dark:text-layout-gray-200">
                            /{word.pronunciation}/
                          </span>
                        )}
                      </div>
                      <SpeakerButton
                        active={isPlayingLine('word')}
                        duration={playDuration}
                        reducedMotion={reducedMotion}
                        onClick={() => handleSpeakerClick('word', null, word.origin, 'en')}
                        className="mt-[3px]"
                      />
                    </div>
                  ) : (
                    <HiddenPlaceholder onReveal={() => handleReveal('word')} label="단어" />
                  )}
                </div>
                {/* 의미 */}
                {isVisible('meanings') ? (
                  <div className="flex flex-col gap-[4px]">
                    {meanings.map((meaningItem, idx) => {
                      const { text: meaningText, pos: meaningPos } = meaningParts(meaningItem);
                      const isActive = isPlayingLine('meanings', idx);
                      return (
                        <div key={idx} className="flex items-center justify-between gap-[8px]">
                          <span className={`text-[13px] font-[400] leading-[16px] flex-1 ${isActive ? 'text-primary-main-600' : 'text-layout-gray-500 dark:text-layout-gray-50'}`}>
                            {meaningPos && (
                              <span className="text-layout-gray-300 dark:text-layout-gray-400 font-[500] mr-[4px]">
                                {meaningPos}
                              </span>
                            )}
                            {meaningText}
                          </span>
                          <SpeakerButton
                            active={isActive}
                            duration={playDuration}
                            reducedMotion={reducedMotion}
                            onClick={() => handleSpeakerClick('meanings', idx, meaningText, 'ko')}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <HiddenPlaceholder onReveal={() => handleReveal('meanings')} label="의미" />
                )}
              </div>
              {/* 예문 — 원문/뜻 텍스트가 하나도 없는 단어는 섹션 자체를 숨긴다 */}
              {examples.length > 0 && examples.some(ex => (ex.origin || ex.sentence) || (ex.meaning || ex.translation)) && (
                <div className="flex flex-col gap-[8px]">
                  <p className="text-[14px] font-[700] text-layout-black dark:text-layout-white">
                    예문
                  </p>
                  {examples.map((example, idx) => {
                    const exOrigin = example.origin || example.sentence || '';
                    const exMeaning = example.meaning || example.translation || '';
                    if (!exOrigin && !exMeaning) return null;
                    const isOriginActive = isPlayingLine('exampleSentences', idx);
                    const isMeaningActive = isPlayingLine('exampleMeanings', idx);
                    return (
                      <div key={idx} className="flex flex-col gap-[10px]">
                        {/* 예문 원문 — 텍스트가 있을 때만 스피커 포함 렌더 */}
                        {exOrigin && (
                          isVisible('exampleSentences') ? (
                            <div className="flex items-start justify-between gap-[5px]">
                              <span className={`text-[14px] font-[400] flex-1 ${isOriginActive ? 'text-primary-main-600' : 'text-layout-black dark:text-layout-white'}`}>
                                {exOrigin}
                              </span>
                              <SpeakerButton
                                active={isOriginActive}
                                duration={playDuration}
                                reducedMotion={reducedMotion}
                                onClick={() => handleSpeakerClick('exampleSentences', idx, exOrigin, 'en')}
                                className="mt-[2px]"
                              />
                            </div>
                          ) : (
                            <HiddenPlaceholder onReveal={() => handleReveal('exampleSentences')} label="예문 문장" small />
                          )
                        )}

                        {/* 예문 의미 — 텍스트가 있을 때만 스피커 포함 렌더 */}
                        {exMeaning && (
                          isVisible('exampleMeanings') ? (
                            <div className="flex items-start justify-between gap-[8px]">
                              <span className={`text-[13px] font-[400] flex-1 ${isMeaningActive ? 'text-primary-main-600' : 'text-layout-gray-500 dark:text-layout-gray-50'}`}>
                                {exMeaning}
                              </span>
                              <SpeakerButton
                                active={isMeaningActive}
                                duration={playDuration}
                                reducedMotion={reducedMotion}
                                onClick={() => handleSpeakerClick('exampleMeanings', idx, exMeaning, 'ko')}
                                className="mt-[2px]"
                              />
                            </div>
                          ) : (
                            <HiddenPlaceholder onReveal={() => handleReveal('exampleMeanings')} label="예문 뜻" small />
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 하단 플레이어 */}
      <div className="flex flex-col gap-[14px] px-[20px] pt-[16px] pb-[20px]">
        {/* 진행 점 — 단어 → 의미 → 예문 문장 → 예문 뜻(재생 순서·설정을 그대로 따른다) */}
        {activeOrder.length > 0 && (
          <div className="flex items-center justify-center gap-[8px]">
            {activeOrder.map((item, idx) => (
              <span
                key={item.id}
                aria-label={item.label}
                className={`
                  h-[6px] rounded-full
                  ${reducedMotion ? '' : 'transition-all duration-300'}
                  ${idx === activeDotIndex
                    ? 'w-[18px] bg-primary-main-600'
                    : 'w-[6px] bg-layout-gray-200 dark:bg-layout-gray-dark'
                  }
                `}
              />
            ))}
          </div>
        )}

        {/* 컨트롤 — 반복(좌하단) · 이전 · 재생/일시정지(가운데, 큰 원) · 다음 */}
        <div className="relative flex items-center justify-center h-[60px]">
          <Pressable
            hapticKind="light"
            onClick={handleToggleRepeat}
            aria-pressed={repeatMode}
            aria-label="반복 재생"
            className={`
              absolute left-0
              flex items-center justify-center w-[40px] h-[40px] rounded-full
              ${repeatMode
                ? 'text-primary-main-600 bg-primary-main-100 dark:bg-layout-gray-dark'
                : 'text-layout-gray-300 dark:text-layout-gray-200'
              }
            `}
          >
            <Repeat size={20} weight={repeatMode ? 'fill' : 'regular'} />
          </Pressable>

          <div className="flex items-center gap-[22px]">
            <Pressable
              hapticKind={null}
              disabled={isFirstCard}
              onClick={goToPrev}
              aria-label="이전 카드"
              className={`
                flex items-center justify-center w-[44px] h-[44px] rounded-full
                ${isFirstCard ? 'text-layout-gray-200 dark:text-layout-gray-dark' : 'text-layout-black dark:text-layout-white'}
              `}
            >
              <CaretLeft size={22} weight="bold" />
            </Pressable>

            <Pressable
              hapticKind="light"
              onClick={handlePlayToggle}
              aria-label={isPlaying ? '일시정지' : '재생'}
              className="flex items-center justify-center w-[60px] h-[60px] rounded-full bg-primary-main-600 text-layout-white shadow-[0_4px_14px_rgba(255,112,212,0.35)]"
            >
              {isPlaying
                ? <Pause size={26} weight="fill" />
                : <Play size={26} weight="fill" className="ml-[2px]" />
              }
            </Pressable>

            <Pressable
              hapticKind={null}
              disabled={isLastCard}
              onClick={goToNext}
              aria-label="다음 카드"
              className={`
                flex items-center justify-center w-[44px] h-[44px] rounded-full
                ${isLastCard ? 'text-layout-gray-200 dark:text-layout-gray-dark' : 'text-layout-black dark:text-layout-white'}
              `}
            >
              <CaretRight size={22} weight="bold" />
            </Pressable>
          </div>
        </div>

        {/* 마지막 카드 — 학습 종료 */}
        {isLastCard && (
          <motion.button
            onClick={handleEnd}
            className="h-[52px] rounded-[12px] text-[16px] font-[700] tracking-[-0.03em] bg-primary-main-600 text-layout-white"
            whileTap={{ scale: 0.97 }}
          >
            학습 종료
          </motion.button>
        )}
      </div>
    </div>
  );
};

// 스피커 버튼 — 재생 중일 때만 TtsRipple(실제 재생 길이에 맞춘 파동) + 아이콘 펄스.
// prefers-reduced-motion 이면 반복 애니메이션(펄스)을 끄고 색 변화만 남긴다.
const SpeakerButton = ({ active, duration, reducedMotion, onClick, size = 16, className = '' }) => (
  <span className={`relative z-[1] flex-shrink-0 flex items-center justify-center ${className}`}>
    {active && !reducedMotion && (
      <TtsRipple size={size * 2.6} duration={duration} className="z-[0]" />
    )}
    <motion.button
      onClick={onClick}
      className="relative z-[1] py-[3px]"
      whileTap={{ scale: 0.85 }}
      animate={active && !reducedMotion ? { scale: [1, 1.15, 1] } : { scale: 1 }}
      transition={active && !reducedMotion ? { duration: 0.6, repeat: Infinity, ease: 'easeInOut' } : {}}
    >
      <SpeakerHigh weight="fill" color={active ? 'var(--primary-main-600)' : 'var(--layout-gray-200)'} size={size} />
    </motion.button>
  </span>
);

// 숨겨진 콘텐츠 placeholder 컴포넌트
const HiddenPlaceholder = ({ onReveal, label, small = false }) => (
  <motion.button
    onClick={onReveal}
    className={`
      w-full flex items-center justify-center
      ${small ? 'py-[8px]' : 'py-[12px]'}
      rounded-[8px] border border-dashed border-layout-gray-300
      text-layout-gray-400 ${small ? 'text-[12px]' : 'text-[13px]'} font-[400]
    `}
    whileTap={{ scale: 0.97 }}
  >
    클릭해서 {label} 확인하기
  </motion.button>
);

export default StudyMain;
