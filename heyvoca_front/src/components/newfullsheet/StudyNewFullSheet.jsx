import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { CaretLeft, CaretRight, RewindCircle, Brain, Lightbulb } from '@phosphor-icons/react';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useVocabulary } from '../../context/VocabularyContext';
import { LearningInfoNewBottomSheet } from '../newBottomSheet/LearningInfoNewBottomSheet';
import { ConfirmNewBottomSheet } from '../newBottomSheet/ConfirmNewBottomSheet';
import VocabularySheetNewFullSheet from './VocabularySheetNewFullSheet';
import { vibrate } from '../../utils/osFunction';

const StudyNewFullSheet = () => {
  "use memo";

  const navigate = useNavigate();
  const { popNewFullSheet, pushNewFullSheet, closeNewFullSheet } = useNewFullSheetActions();
  const { pushNewBottomSheet, popNewBottomSheet, pushAwaitNewBottomSheet, clearStack: clearNewBottomSheetStack } = useNewBottomSheetActions();
  const { recentStudy, vocabularySheets, updateRecentStudy } = useVocabulary();

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
          questionType: ['multipleChoice', 'multipleChoiceListening', 'fillInTheBlank', 'cardMatch', 'cardMatchListening'],
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
      title: '빠른 복습',
      desc: '최근 학습을 기반으로 복습 예정 단어만 모았어요',
      borderStyle: {
        border: '1.5px solid transparent',
        backgroundImage:
          'linear-gradient(135deg, #FFEFFA 0%, #F6EFFF 50%, #EAF6FF 100%), linear-gradient(135deg, #FF88DC 0%, #9B8AFB 50%, #53B1FD 100%)',
        backgroundOrigin: 'border-box',
        backgroundClip: 'padding-box, border-box',
      },
      darkBorderStyle: null,
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
                  questionType: ['multipleChoice', 'multipleChoiceListening', 'fillInTheBlank', 'cardMatch', 'cardMatchListening'],
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
      title: '학습',
      desc: '학습을 통해 단어들을 공부해요',
      borderStyle: null,
      chevronColor: 'var(--primary-main-600)',
      className: 'border-[1px] border-primary-main-600 bg-primary-main-100',
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
      title: '테스트',
      desc: '나의 단어 암기 상태를 테스트 해보세요',
      borderStyle: null,
      chevronColor: 'var(--secondary-purple-600)',
      className: 'border-[1px] border-secondary-purple-600 bg-secondary-purple-100',
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
      <div className="flex flex-col gap-[15px] flex-1 py-[10px] px-[16px] overflow-y-auto">
        {cards.map((card) => (
          <motion.button
            key={card.key}
            onClick={card.onClick}
            className={`
              flex items-center gap-[15px]
              w-full
              px-[15px] py-[40px]
              rounded-[12px]
              ${card.className || ''}
            `}
            style={card.borderStyle || {}}
            whileTap={{ scale: 0.97 }}
            whileHover={{ scale: 1.01 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
          >
            {card.icon}
            <div className="flex flex-col gap-[6px] flex-1 items-start">
              <span className="text-[18px] font-[700] text-layout-black">
                {card.title}
              </span>
              <span className="text-[11px] font-[400] text-layout-gray-500">
                {card.desc}
              </span>
            </div>
            <CaretRight
              size={24}
              weight="bold"
              style={{ color: card.chevronColor, flexShrink: 0 }}
            />
          </motion.button>
        ))}
      </div>
    </div>
  );
};

export default StudyNewFullSheet;
