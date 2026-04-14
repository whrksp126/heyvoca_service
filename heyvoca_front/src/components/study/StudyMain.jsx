import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SpeakerHigh } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import StudyHeader from './StudyHeader';
import { StudySettingsNewBottomSheet } from '../newBottomSheet/StudySettingsNewBottomSheet';
import MemorizationStatus from '../common/MemorizationStatus';
import { getTextSound, stopCurrentSound } from '../../utils/common';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { vibrate } from '../../utils/osFunction';

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
  const { pushNewBottomSheet } = useNewBottomSheetActions();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState('next');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingItemId, setPlayingItemId] = useState(null);
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
  }, []);

  // 카드 이동
  const goToNext = useCallback(() => {
    stopPlayback();
    vibrate({ duration: 5 });
    setDirection('next');
    setCurrentIndex(prev => prev + 1);
  }, [stopPlayback]);

  const goToPrev = useCallback(() => {
    stopPlayback();
    vibrate({ duration: 5 });
    setDirection('prev');
    setCurrentIndex(prev => prev - 1);
  }, [stopPlayback]);

  // 자동 재생 — 현재 카드의 playbackOrder 순서대로 TTS 재생
  const startPlayback = useCallback(async (startCardIndex) => {
    playbackCancelRef.current = false;

    const runPlay = async () => {
      const cardIdx = currentIndexRef.current;
      const currentWord = wordsRef.current[cardIdx];
      if (!currentWord) return;

      const { playbackOrder } = settingsRef.current;

      for (const item of playbackOrder) {
        if (playbackCancelRef.current) return;
        if (item.count === 0) continue;

        let text = '';
        let lang = 'en';

        if (item.id === 'word') {
          text = currentWord.origin || '';
          lang = 'en';
        } else if (item.id === 'meanings') {
          const meaningsList = currentWord.meanings || [];
          text = meaningsList.join(', ');
          lang = 'ko';
        } else if (item.id === 'exampleSentences') {
          const exList = currentWord.examples || [];
          text = exList.map(e => e.origin || e.sentence || '').filter(Boolean).join('. ');
          lang = 'en';
        } else if (item.id === 'exampleMeanings') {
          const exList = currentWord.examples || [];
          text = exList.map(e => e.meaning || e.translation || '').filter(Boolean).join('. ');
          lang = 'ko';
        }

        if (!text) continue;

        for (let i = 0; i < item.count; i++) {
          if (playbackCancelRef.current) return;

          setPlayingItemId(item.id);

          // 오디오가 실제로 끝날 때까지 대기 (취소 시 즉시 해제)
          await new Promise(resolve => {
            playbackResolveRef.current = resolve;
            getTextSound(text, lang).then(() => {
              if (playbackResolveRef.current === resolve) {
                playbackResolveRef.current = null;
              }
              resolve();
            });
          });
        }
      }

      if (playbackCancelRef.current) return;

      setPlayingItemId(null);

      // 다음 카드로 자동 이동
      const nextIdx = currentIndexRef.current + 1;
      if (nextIdx < wordsRef.current.length) {
        setDirection('next');
        setCurrentIndex(nextIdx);
        // 카드 전환 애니메이션 후 다음 카드 재생
        playTimeoutRef.current = setTimeout(() => {
          if (!playbackCancelRef.current) runPlay();
        }, 350);
      } else {
        // 마지막 카드 재생 완료 → 정지
        setIsPlaying(false);
      }
    };

    runPlay();
  }, []);

  const handleSpeakerClick = useCallback((itemId, text, lang) => {
    vibrate({ duration: 5 });
    if (playingItemId === itemId) {
      // 재생 중 클릭 → 정지
      setIsPlaying(false);
      stopPlayback();
      stopCurrentSound();
    } else {
      // 정지 중 클릭 → 자동재생 중단 + 해당 콘텐츠만 재생
      setIsPlaying(false);
      stopPlayback();
      stopCurrentSound();
      setPlayingItemId(itemId);
      getTextSound(text, lang).then(() => {
        setPlayingItemId(prev => prev === itemId ? null : prev);
      });
    }
  }, [playingItemId, stopPlayback]);

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

  // 마운트 시 자동 재생 시작
  useEffect(() => {
    setIsPlaying(true);
    startPlayback(0);
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

  return (
    <div className="flex flex-col h-screen bg-layout-white dark:bg-layout-black overflow-hidden">
      <StudyHeader onSettingsClick={handleSettingsClick} />

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
            className="absolute inset-x-[20px] top-[15px] bottom-0 bg-layout-gray-50 dark:bg-layout-gray-900 rounded-[12px] overflow-y-auto"
          >
            <div className="p-[20px] flex flex-col gap-[25px]">
              {/* 암기 상태 아이콘 */}
              <div className="flex flex-col gap-[12px]">
                <div>
                  <div className="mb-[5px]">
                    <MemorizationStatus
                      repetition={word.repetition ?? word.sm2?.repetition ?? 0}
                      interval={word.interval ?? word.sm2?.interval ?? 0}
                      ef={word.ef ?? word.sm2?.ef ?? 2.5}
                      nextReview={word.nextReview ?? word.sm2?.nextReview}
                      wordId={word.id}
                      useRandomMessages={false}
                    />
                  </div>
                  {/* 단어 */}
                  {isVisible('word') ? (
                    <div className={`flex items-start justify-between gap-[5px] ${playingItemId === 'word' ? 'text-primary-main-600' : ''}`}>
                      <span className={`text-[24px] font-[700] line-height-[29px] flex-1 ${playingItemId === 'word' ? 'text-primary-main-600' : 'text-layout-black dark:text-layout-white'}`}>
                        {word.origin}
                      </span>
                      <motion.button
                        onClick={() => handleSpeakerClick('word', word.origin, 'en')}
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
                    {meanings.map((meaning, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-[8px]">
                        <span className={`text-[13px] font-[400] line-height-[16px] flex-1 ${playingItemId === 'meanings' ? 'text-primary-main-600' : 'text-layout-gray-600 dark:text-layout-gray-300'}`}>
                          {meaning}
                        </span>
                        <motion.button
                          onClick={() => handleSpeakerClick('meanings', meaning, 'ko')}
                          whileTap={{ scale: 0.85 }}
                        >
                          <SpeakerHigh weight="fill" color={playingItemId === 'meanings' ? 'var(--primary-main-600)' : 'var(--layout-gray-200)'} size={16} />
                        </motion.button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <HiddenPlaceholder onReveal={() => handleReveal('meanings')} label="의미" />
                )}
              </div>
              {/* 예문 */}
              {examples.length > 0 && (
                <div className="flex flex-col gap-[8px]">
                  <p className="text-[14px] font-[700] text-layout-black dark:text-layout-white">
                    예문
                  </p>
                  {examples.map((example, idx) => {
                    const exOrigin = example.origin || example.sentence || '';
                    const exMeaning = example.meaning || example.translation || '';
                    return (
                      <div key={idx} className="flex flex-col gap-[10px]">
                        {/* 예문 원문 */}
                        {isVisible('exampleSentences') ? (
                          <div className="flex items-start justify-between gap-[5px]">
                            <span className={`text-[14px] font-[400] flex-1 ${playingItemId === 'exampleSentences' ? 'text-primary-main-600' : 'text-layout-black dark:text-layout-white'}`}>
                              {exOrigin}
                            </span>
                            <motion.button
                              onClick={() => handleSpeakerClick('exampleSentences', exOrigin, 'en')}
                              className="flex-shrink-0 mt-[2px] text-layout-gray-300"
                              whileTap={{ scale: 0.85 }}
                            >
                              <SpeakerHigh weight="fill" color={playingItemId === 'exampleSentences' ? 'var(--primary-main-600)' : 'var(--layout-gray-200)'} size={16} />
                            </motion.button>
                          </div>
                        ) : (
                          <HiddenPlaceholder onReveal={() => handleReveal('exampleSentences')} label="예문 문장" small />
                        )}

                        {/* 예문 의미 */}
                        {isVisible('exampleMeanings') ? (
                          <div className="flex items-start justify-between gap-[8px]">
                            <span className={`text-[13px] font-[400] flex-1 ${playingItemId === 'exampleMeanings' ? 'text-primary-main-600' : 'text-layout-gray-500'}`}>
                              {exMeaning}
                            </span>
                            <motion.button
                              onClick={() => handleSpeakerClick('exampleMeanings', exMeaning, 'ko')}
                              className="flex-shrink-0 mt-[2px] text-layout-gray-300"
                              whileTap={{ scale: 0.85 }}
                            >
                              <SpeakerHigh weight="fill" color={playingItemId === 'exampleMeanings' ? 'var(--primary-main-600)' : 'var(--layout-gray-200)'} size={16} />
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
              : 'bg-layout-gray-200 text-layout-white dark:text-layout-white'
            }
          `}
          whileTap={currentIndex > 0 ? { scale: 0.95 } : {}}
        >
          이전
        </motion.button>

        {/* 재생/정지 */}
        <motion.button
          onClick={handlePlayToggle}
          className="flex-1 h-[45px] rounded-[8px] text-[16px] font-[700] bg-layout-gray-200 text-layout-white dark:text-layout-white"
          whileTap={{ scale: 0.95 }}
        >
          {isPlaying ? '정지' : '재생'}
        </motion.button>

        {/* 다음 / 종료 */}
        {currentIndex < totalCards - 1 ? (
          <motion.button
            onClick={goToNext}
            className="flex-1 h-[45px] rounded-[8px] text-[16px] font-[700] bg-layout-gray-200 text-layout-white dark:text-layout-white"
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
