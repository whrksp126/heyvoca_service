import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SpeakerHigh } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import StudyHeader from './StudyHeader';
import { StudySettingsNewBottomSheet } from '../newBottomSheet/StudySettingsNewBottomSheet';
import { ConfirmNewBottomSheet } from '../newBottomSheet/ConfirmNewBottomSheet';
import MemorizationStatus from '../common/MemorizationStatus';
import { getTextSound, stopCurrentSound } from '../../utils/common';
import { prewarmTts, collectStudyTexts } from '../../api/tts';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { vibrate } from '../../utils/osFunction';
import { AppHistory } from '../../utils/appHistory';

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


const StudyMain = ({ words }) => {
  "use memo";

  const navigate = useNavigate();
  const { pushNewBottomSheet, pushAwaitNewBottomSheet } = useNewBottomSheetActions();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState('next');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingItemId, setPlayingItemId] = useState(null);
  // 의미·예문처럼 한 항목에 여러 라인이 있을 때 현재 재생 중인 라인의 인덱스.
  // word처럼 단일 라인 항목은 null.
  const [playingItemIndex, setPlayingItemIndex] = useState(null);
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
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { wordsRef.current = words; }, [words]);

  const word = words[currentIndex];
  const meanings = word?.meanings || [];
  const examples = word?.examples || [];
  const totalCards = words.length;

  const revealedSet = revealedMap[currentIndex] || new Set();

  const isVisible = (key) =>
    settings.visibility[key] || revealedSet.has(key);

  const handleReveal = (key) => {
    vibrate({ duration: 5 });
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
  }, []);

  // 카드 이동 — 자동 재생 중이었다면 중지하고 버튼 표기도 동기화
  const goToNext = useCallback(() => {
    stopPlayback();
    setIsPlaying(false);
    vibrate({ duration: 5 });
    setDirection('next');
    setCurrentIndex(prev => prev + 1);
  }, [stopPlayback]);

  const goToPrev = useCallback(() => {
    stopPlayback();
    setIsPlaying(false);
    vibrate({ duration: 5 });
    setDirection('prev');
    setCurrentIndex(prev => prev - 1);
  }, [stopPlayback]);

  // 자동 재생 — 현재 카드의 playbackOrder 순서대로 TTS 재생
  const startPlayback = useCallback(async (startCardIndex) => {
    playbackCancelRef.current = false;

    // 한 라인 재생. 인덱스가 null이면 단일 라인 항목.
    // getTextSound가 reject/throw해도 settle은 한 번만 resolve되어 await 정지 방지.
    const playOne = async (itemId, index, text, lang) => {
      if (!text) return;
      setPlayingItemId(itemId);
      setPlayingItemIndex(index);
      await new Promise(resolve => {
        let settled = false;
        const settle = () => {
          if (settled) return;
          settled = true;
          if (playbackResolveRef.current === settle) {
            playbackResolveRef.current = null;
          }
          resolve();
        };
        playbackResolveRef.current = settle;
        Promise.resolve(getTextSound(text, lang)).then(settle, settle);
      });
    };

    // cardIdx를 인자로 명시 전달 — currentIndexRef 동기화 타이밍에 의존하지 않음.
    const runPlay = async (cardIdx) => {
      const currentWord = wordsRef.current[cardIdx];
      if (!currentWord) return;

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
              await playOne('meanings', i, meaningsList[i] || '', 'ko');
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

  const handleSpeakerClick = useCallback((itemId, index, text, lang) => {
    vibrate({ duration: 5 });
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
      getTextSound(text, lang).then(() => {
        setPlayingItemId(prev => prev === itemId ? null : prev);
        setPlayingItemIndex(prev => prev === index ? null : prev);
      });
    }
  }, [playingItemId, playingItemIndex, stopPlayback]);

  const handlePlayToggle = () => {
    vibrate({ duration: 5 });
    if (isPlaying) {
      setIsPlaying(false);
      stopPlayback();
    } else {
      setIsPlaying(true);
      startPlayback(currentIndex);
    }
  };

  // isPlaying이 false로 바뀌면 재생 중단
  useEffect(() => {
    if (!isPlaying) stopPlayback();
  }, [isPlaying, stopPlayback]);

  // 마운트 시 자동 재생 시작. 언마운트 시 모든 비동기 체인(setTimeout/audio) 정리.
  useEffect(() => {
    // 캐시에 없는 음성만 미리 생성(워밍) — 학습 중 첫 재생 지연 제거. fire-and-forget.
    prewarmTts(collectStudyTexts(words));
    setIsPlaying(true);
    startPlayback(0);
    return () => {
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

  const handleEnd = () => {
    stopPlayback();
    vibrate({ duration: 5 });
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
            학습을 종료하시겠습니까?😢
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
          bg-primary-main-100
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
            className="absolute inset-x-[20px] top-[15px] bottom-0 bg-layout-gray-50 dark:bg-layout-gray-900 rounded-[12px] overflow-y-auto touch-pan-y"
          >
            <div className="p-[20px] flex flex-col gap-[25px]">
              {/* 암기 상태 아이콘 */}
              <div className="flex flex-col gap-[12px]">
                <div>
                  <div className="mb-[5px]">
                    <MemorizationStatus
                      repetition={word.fsrs?.reps ?? 0}
                      interval={Math.round(word.fsrs?.stability ?? 0)}
                      ef={2.5}
                      nextReview={word.fsrs?.next_review ?? null}
                      wordId={word.id}
                      useRandomMessages={false}
                    />
                  </div>
                  {/* 단어 */}
                  {isVisible('word') ? (
                    <div className={`flex items-start justify-between gap-[5px] ${playingItemId === 'word' ? 'text-primary-main-600' : ''}`}>
                      <span className={`text-[24px] font-[700] line-height-[29px] flex-1 ${playingItemId === 'word' ? 'text-primary-main-600' : 'text-layout-black'}`}>
                        {word.origin}
                      </span>
                      <motion.button
                        onClick={() => handleSpeakerClick('word', null, word.origin, 'en')}
                        className="py-[3px]"
                        whileTap={{ scale: 0.85 }}
                      >
                        <SpeakerHigh weight="fill" color={playingItemId === 'word' ? 'var(--primary-main-600)' : 'var(--layout-gray-200)'} size={16} />
                      </motion.button>
                    </div>
                  ) : (
                    <HiddenPlaceholder onReveal={() => handleReveal('word')} label="단어" />
                  )}
                </div>
                {/* 의미 */}
                {isVisible('meanings') ? (
                  <div className="flex flex-col gap-[4px]">
                    {meanings.map((meaning, idx) => {
                      const isActive = playingItemId === 'meanings' && playingItemIndex === idx;
                      return (
                        <div key={idx} className="flex items-center justify-between gap-[8px]">
                          <span className={`text-[13px] font-[400] line-height-[16px] flex-1 ${isActive ? 'text-primary-main-600' : 'text-layout-gray-600 dark:text-layout-black'}`}>
                            {meaning}
                          </span>
                          <motion.button
                            onClick={() => handleSpeakerClick('meanings', idx, meaning, 'ko')}
                            whileTap={{ scale: 0.85 }}
                          >
                            <SpeakerHigh weight="fill" color={isActive ? 'var(--primary-main-600)' : 'var(--layout-gray-200)'} size={16} />
                          </motion.button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <HiddenPlaceholder onReveal={() => handleReveal('meanings')} label="의미" />
                )}
              </div>
              {/* 예문 */}
              {examples.length > 0 && (
                <div className="flex flex-col gap-[8px]">
                  <p className="text-[14px] font-[700] text-layout-black">
                    예문
                  </p>
                  {examples.map((example, idx) => {
                    const exOrigin = example.origin || example.sentence || '';
                    const exMeaning = example.meaning || example.translation || '';
                    const isOriginActive = playingItemId === 'exampleSentences' && playingItemIndex === idx;
                    const isMeaningActive = playingItemId === 'exampleMeanings' && playingItemIndex === idx;
                    return (
                      <div key={idx} className="flex flex-col gap-[10px]">
                        {/* 예문 원문 */}
                        {isVisible('exampleSentences') ? (
                          <div className="flex items-start justify-between gap-[5px]">
                            <span className={`text-[14px] font-[400] flex-1 ${isOriginActive ? 'text-primary-main-600' : 'text-layout-black'}`}>
                              {exOrigin}
                            </span>
                            <motion.button
                              onClick={() => handleSpeakerClick('exampleSentences', idx, exOrigin, 'en')}
                              className="flex-shrink-0 mt-[2px] text-layout-gray-300"
                              whileTap={{ scale: 0.85 }}
                            >
                              <SpeakerHigh weight="fill" color={isOriginActive ? 'var(--primary-main-600)' : 'var(--layout-gray-200)'} size={16} />
                            </motion.button>
                          </div>
                        ) : (
                          <HiddenPlaceholder onReveal={() => handleReveal('exampleSentences')} label="예문 문장" small />
                        )}

                        {/* 예문 의미 */}
                        {isVisible('exampleMeanings') ? (
                          <div className="flex items-start justify-between gap-[8px]">
                            <span className={`text-[13px] font-[400] flex-1 ${isMeaningActive ? 'text-primary-main-600' : 'text-layout-gray-500'}`}>
                              {exMeaning}
                            </span>
                            <motion.button
                              onClick={() => handleSpeakerClick('exampleMeanings', idx, exMeaning, 'ko')}
                              className="flex-shrink-0 mt-[2px] text-layout-gray-300"
                              whileTap={{ scale: 0.85 }}
                            >
                              <SpeakerHigh weight="fill" color={isMeaningActive ? 'var(--primary-main-600)' : 'var(--layout-gray-200)'} size={16} />
                            </motion.button>
                          </div>
                        ) : (
                          <HiddenPlaceholder onReveal={() => handleReveal('exampleMeanings')} label="예문 뜻" small />
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

      {/* 하단 3버튼 */}
      <div className="flex gap-[10px] px-[20px] pt-[20px] pb-[20px]">
        {/* 이전 */}
        <motion.button
          onClick={currentIndex > 0 ? goToPrev : undefined}
          disabled={currentIndex === 0}
          className={`
            flex-1 h-[45px] rounded-[8px] text-[16px] font-[700]
            ${currentIndex === 0
              ? 'bg-layout-gray-100 text-layout-gray-300'
              : 'bg-layout-gray-200 text-layout-white dark:text-layout-black'
            }
          `}
          whileTap={currentIndex > 0 ? { scale: 0.95 } : {}}
        >
          이전
        </motion.button>

        {/* 재생/정지 */}
        <motion.button
          onClick={handlePlayToggle}
          className="flex-1 h-[45px] rounded-[8px] text-[16px] font-[700] bg-layout-gray-200 text-layout-white dark:text-layout-black"
          whileTap={{ scale: 0.95 }}
        >
          {isPlaying ? '정지' : '재생'}
        </motion.button>

        {/* 다음 / 종료 */}
        {currentIndex < totalCards - 1 ? (
          <motion.button
            onClick={goToNext}
            className="flex-1 h-[45px] rounded-[8px] text-[16px] font-[700] bg-layout-gray-200 text-layout-white dark:text-layout-black"
            whileTap={{ scale: 0.95 }}
          >
            다음
          </motion.button>
        ) : (
          <motion.button
            onClick={handleEnd}
            className="flex-1 h-[45px] rounded-[8px] text-[16px] font-[700] bg-primary-main-600 text-layout-white"
            whileTap={{ scale: 0.95 }}
          >
            종료
          </motion.button>
        )}
      </div>
    </div>
  );
};

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
