import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { CaretLeft, CaretRight, RewindCircle, Brain, Lightbulb, Lock } from '@phosphor-icons/react';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useVocabulary } from '../../context/VocabularyContext';
import { LearningInfoNewBottomSheet } from '../newBottomSheet/LearningInfoNewBottomSheet';
import { ConfirmNewBottomSheet } from '../newBottomSheet/ConfirmNewBottomSheet';
import VocabularySheetNewFullSheet from './VocabularySheetNewFullSheet';
import { vibrate } from '../../utils/osFunction';
import { useTheme } from '../../context/ThemeContext';
import { getUnlockStatusApi } from '../../api/study';

const StudyNewFullSheet = () => {
  "use memo";

  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { popNewFullSheet, pushNewFullSheet, closeNewFullSheet } = useNewFullSheetActions();
  const { pushNewBottomSheet, popNewBottomSheet, pushAwaitNewBottomSheet, clearStack: clearNewBottomSheetStack } = useNewBottomSheetActions();
  const { recentStudy, vocabularySheets, updateRecentStudy } = useVocabulary();

  // 온보딩 점진 해금 — study(반복듣기, 4회)·test(커스텀, 5회) 카드 게이팅
  const [unlock, setUnlock] = useState(null);
  const [lockToast, setLockToast] = useState(null);
  useEffect(() => {
    let alive = true;
    getUnlockStatusApi().then((res) => { if (alive && res?.code === 200) setUnlock(res.data); });
    return () => { alive = false; };
  }, []);
  const CARD_LOCK_KEY = { study: 'listen', test: 'custom' };
  const isCardLocked = (key) => {
    const lk = CARD_LOCK_KEY[key];
    if (!lk || !unlock || unlock.legacy) return false;
    return unlock.unlocked?.[lk] === false;
  };
  const cardRemaining = (key) => {
    const lk = CARD_LOCK_KEY[key];
    if (!lk || !unlock) return 0;
    return Math.max(0, (unlock.thresholds?.[lk] ?? 0) - (unlock.completed_sessions ?? 0));
  };

  const startFreshQuickReview = async () => {
    const allWords = vocabularySheets.flatMap(sheet => sheet.words);
    const count = Math.min(14, allWords.length);

    if (count < 4) {
      const toBookStore = await pushAwaitNewBottomSheet(
        ConfirmNewBottomSheet,
        {
          title: (
            <>
              단어가 부족해요.<br />
              상점에서 단어장을 추가해보세요!
            </>
          ),
          btns: { confirm: "상점 가기", cancel: "취소" }
        },
        { isBackdropClickClosable: true, isDragToCloseEnabled: true }
      );
      if (toBookStore) {
        closeNewFullSheet();
        navigate('/book-store');
      }
      return;
    }

    await updateRecentStudy('quick', {
      progress_index: null,
      type: 'quick',
      status: null,
      study_data: null,
      updated_at: null,
      created_at: null,
    });

    closeNewFullSheet();
    navigate('/take-test', {
      state: {
        testType: 'quick',
        data: {
          questionType: ['multipleChoice', 'multipleChoiceListening', 'cardMatch', 'cardMatchListening'],
          vocabularySheetId: "all",
          memoryState: null,
          count,
        }
      }
    });
  };

  const handleTestClick = () => {
    vibrate({ duration: 5 });
    const isLearning = recentStudy['test']?.status === "learning";
    if (isLearning) {
      pushNewBottomSheet(
        LearningInfoNewBottomSheet,
        {
          testType: 'test',
          onCancel: () => {
            popNewBottomSheet();
            setTimeout(() => {
              pushNewFullSheet(VocabularySheetNewFullSheet, { testType: 'test' }, {
                smFull: true,
                closeOnBackdropClick: true
              });
            }, 300);
          },
          onSet: (props) => {
            clearNewBottomSheetStack();
            closeNewFullSheet();
            navigate('/take-test', { state: { testType: props.testType } });
          }
        },
        {
          isBackdropClickClosable: false,
          isDragToCloseEnabled: true
        }
      );
    } else {
      pushNewFullSheet(VocabularySheetNewFullSheet, { testType: 'test' }, {
        smFull: true,
        closeOnBackdropClick: true
      });
    }
  };

  const cards = [
    {
      key: 'quick',
      icon: (
        <div className="flex items-center justify-center w-[35px] h-[35px] rounded-[8px] bg-gradient-to-br from-[#FF88DC] via-[#9B8AFB] to-[#53B1FD]">
          <RewindCircle size={21} weight="fill" color="white" />
        </div>
      ),
      title: 'AI 추천 테스트',
      desc: '시스템이 알아서 척척!\n지금 내게 꼭 필요한 단어들로 바로 시작해요.',
      borderStyle: {
        border: '1.5px solid transparent',
        backgroundImage:
          'linear-gradient(135deg, #FFEFFA 0%, #F6EFFF 50%, #EAF6FF 100%), linear-gradient(135deg, #FF88DC 0%, #9B8AFB 50%, #53B1FD 100%)',
        backgroundOrigin: 'border-box',
        backgroundClip: 'padding-box, border-box',
      },
      darkBorderStyle: {
        border: '1.5px solid transparent',
        // 채움 그라데이션(파스텔 20%) → 불투명 다크 베이스 → 선명한 보더 그라데이션 순으로 겹쳐
        // 투명 파스텔이 다크 배경 위에 합성되게 한다(보더만 선명, 안쪽은 어둡게).
        backgroundImage:
          'linear-gradient(135deg, rgba(255,239,250,0.2) 0%, rgba(246,239,255,0.2) 50%, rgba(234,246,255,0.2) 100%), linear-gradient(#111111, #111111), linear-gradient(135deg, #FF88DC 0%, #9B8AFB 50%, #53B1FD 100%)',
        backgroundOrigin: 'border-box',
        backgroundClip: 'padding-box, padding-box, border-box',
      },
      chevronColor: 'var(--secondary-blue-600)',
      onClick: async () => {
        vibrate({ duration: 5 });

        const isLearning = recentStudy['quick']?.status === "learning";
        if (isLearning) {
          const resume = await pushAwaitNewBottomSheet(
            ConfirmNewBottomSheet,
            {
              title: (
                <>
                  진행 중인 빠른 복습이 있어요.<br />
                  이어서 하시겠어요?
                </>
              ),
              btns: { confirm: "이어서 하기", cancel: "새로 시작" }
            },
            { isBackdropClickClosable: true, isDragToCloseEnabled: true }
          );
          if (resume) {
            const allWords = vocabularySheets.flatMap(sheet => sheet.words);
            closeNewFullSheet();
            navigate('/take-test', {
              state: {
                testType: 'quick',
                data: {
                  questionType: ['multipleChoice', 'multipleChoiceListening', 'cardMatch', 'cardMatchListening'],
                  vocabularySheetId: "all",
                  memoryState: null,
                  count: Math.min(14, allWords.length),
                }
              }
            });
            return;
          }
        }

        startFreshQuickReview();
      },
    },
    {
      key: 'study',
      icon: (
        <div className="flex items-center justify-center w-[35px] h-[35px] rounded-[8px] bg-primary-main-600">
          <Brain size={21} weight="fill" color="white" />
        </div>
      ),
      title: '집중 반복 학습',
      desc: '보고 듣고 따라 읽으며!\n단어의 뜻과 예문까지 깊이 있게 외워요.',
      borderStyle: null,
      chevronColor: 'var(--primary-main-600)',
      className: 'border-[1px] border-primary-main-600 bg-primary-main-100 dark:bg-layout-gray-dark',
      onClick: () => {
        vibrate({ duration: 5 });
        pushNewFullSheet(VocabularySheetNewFullSheet, { testType: 'study' }, {
          smFull: true,
          closeOnBackdropClick: true
        });
      },
    },
    {
      key: 'test',
      icon: (
        <div className="flex items-center justify-center w-[35px] h-[35px] rounded-[8px] bg-secondary-purple-600">
          <Lightbulb size={21} weight="fill" color="white" />
        </div>
      ),
      title: '자유 설정 테스트',
      desc: '옵션을 내 마음대로!\n원하는 조건만 쏙쏙 골라 집중해서 점검해요.',
      borderStyle: null,
      chevronColor: 'var(--secondary-purple-600)',
      className: 'border-[1px] border-secondary-purple-600 bg-secondary-purple-100 dark:bg-secondary-purple-dark',
      onClick: handleTestClick,
    },
  ];

  return (
    <div className="flex flex-col h-full w-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }} />

      {/* Header */}
      <div data-page-header className="relative flex items-center justify-center h-[55px] pt-[20px] px-[10px] pb-[14px]">
        <motion.button
          onClick={() => {
            vibrate({ duration: 5 });
            popNewFullSheet();
          }}
          className="
            absolute top-[18px] left-[10px]
            flex items-center gap-[4px]
            text-layout-gray-200 dark:text-layout-white
            p-[4px] rounded-[8px]
          "
          whileHover={{ backgroundColor: 'rgba(0,0,0,0.05)', scale: 1.05 }}
          whileTap={{ scale: 0.95, backgroundColor: 'rgba(0,0,0,0.1)' }}
          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        >
          <CaretLeft size={24} />
        </motion.button>
        <h1 className="text-[18px] font-[700] text-layout-black dark:text-layout-white">
          학습하기
        </h1>
      </div>

      {/* Cards */}
      <div className="relative flex flex-col gap-[15px] flex-1 py-[10px] px-[16px] overflow-y-auto">
        {/* 잠금 안내 토스트 */}
        <AnimatePresence>
          {lockToast && (
            <motion.div
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="absolute top-[4px] left-1/2 -translate-x-1/2 z-[10] px-[14px] py-[8px] rounded-[20px] bg-layout-black/85 dark:bg-layout-white/90 whitespace-nowrap"
            >
              <span className="text-[12px] font-[600] text-layout-white dark:text-layout-black">{lockToast}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {cards.map((card) => {
          const locked = isCardLocked(card.key);
          return (
            <motion.button
              key={card.key}
              onClick={() => {
                if (locked) {
                  vibrate({ duration: 5 });
                  setLockToast(`${card.title}은 학습 ${cardRemaining(card.key)}회 더 하면 열려요`);
                  setTimeout(() => setLockToast(null), 2000);
                  return;
                }
                card.onClick();
              }}
              className={`
                relative flex items-center gap-[15px]
                w-full
                px-[15px] py-[40px]
                rounded-[12px]
                ${card.className || ''}
                ${locked ? 'opacity-50' : ''}
              `}
              style={(isDark ? (card.darkBorderStyle || card.borderStyle) : card.borderStyle) || {}}
              whileTap={{ scale: 0.97 }}
              whileHover={{ scale: 1.01 }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            >
              {card.icon}
              <div className="flex flex-col gap-[6px] flex-1 items-start">
                <span className="text-[18px] font-[700] text-layout-black dark:text-layout-white">
                  {card.title}
                </span>
                <span className="text-[11px] font-[400] text-layout-gray-500 dark:text-layout-gray-50 whitespace-pre-line text-left">
                  {locked ? `학습 ${cardRemaining(card.key)}회 더 하면 열려요` : card.desc}
                </span>
              </div>
              {locked ? (
                <Lock size={22} weight="fill" style={{ color: 'var(--layout-gray-300)', flexShrink: 0 }} />
              ) : (
                <CaretRight size={24} weight="bold" style={{ color: card.chevronColor, flexShrink: 0 }} />
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default StudyNewFullSheet;
