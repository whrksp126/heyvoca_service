import React, { useEffect } from 'react';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useNavigate } from 'react-router-dom';
import { CaretLeft, WarningCircle } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVocabulary } from '../../context/VocabularyContext';
import HeyQuestionImg from '../../assets/images/HeyQuestionImg.png';
import SpeechBubbleTailImg from '../../assets/images/SpeechBubbleTailImg.png';
import { LearningInfoNewBottomSheet } from '../newBottomSheet/LearningInfoNewBottomSheet';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { MIN_TEST_VOCABULARY_COUNT, MAX_TEST_VOCABULARY_COUNT } from '../../utils/common';
import { InsufficientWordsNewBottomSheet } from '../newBottomSheet/InsufficientWordsNewBottomSheet';
import { NoTodayStudyWordsNewBottomSheet } from '../newBottomSheet/NoTodayStudyWordsNewBottomSheet';
import { vibrate } from '../../utils/osFunction';

const TodayStudyNewFullSheet = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const navigate = useNavigate();
  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { popNewFullSheet, closeNewFullSheet } = useNewFullSheetActions();
  const { clearStack: clearNewBottomSheetStack, popNewBottomSheet, pushNewBottomSheet } = useNewBottomSheetActions();

  const { recentStudy, updateRecentStudy, vocabularySheets } = useVocabulary();

  // 오늘의 학습에 사용 가능한 단어 개수 계산 (TakeTest.jsx의 setupTestQuestions 로직과 동일)
  // React Compiler가 자동으로 memoization 처리
  const allWords = vocabularySheets.flatMap(sheet =>
    (sheet.words || []).map(word => ({
      ...word,
      vocabularySheetId: sheet.id
    }))
  );

  // 현재 날짜 (시간 제거, 날짜만 비교)
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // 1. 미학습 단어들 (nextReview가 null이거나 없음, 또는 repetition === 0 && interval === 0)
  const unlearnedWords = allWords.filter(word => {
    const repetition = word.sm2?.repetition ?? word.repetition ?? 0;
    const interval = word.sm2?.interval ?? word.interval ?? 0;
    const nextReview = word.sm2?.nextReview ?? word.nextReview;
    return (!nextReview || nextReview === null) && repetition === 0 && interval === 0;
  });

  // 2. 복습 지연 단어들 (nextReview가 오늘 이전인 것들)
  const overdueWords = allWords.filter(word => {
    const nextReview = word.sm2?.nextReview ?? word.nextReview;
    if (!nextReview) return false;
    const nextReviewDate = new Date(nextReview);
    nextReviewDate.setHours(0, 0, 0, 0);
    return nextReviewDate < now;
  });

  // 3. 오늘 학습 예정 단어들 (nextReview가 오늘인 것들)
  const todayScheduledWords = allWords.filter(word => {
    const nextReview = word.sm2?.nextReview ?? word.nextReview;
    if (!nextReview) return false;
    const nextReviewDate = new Date(nextReview);
    nextReviewDate.setHours(0, 0, 0, 0);
    return nextReviewDate.getTime() === now.getTime();
  });

  // 중복 제거를 위해 Set 사용
  const uniqueWordIds = new Set();
  const uniqueWords = [];

  // 우선순위 1: 복습 지연 단어들
  overdueWords.forEach(word => {
    if (!uniqueWordIds.has(word.id)) {
      uniqueWordIds.add(word.id);
      uniqueWords.push(word);
    }
  });

  // 우선순위 2: 오늘 학습 예정 단어들
  todayScheduledWords.forEach(word => {
    if (!uniqueWordIds.has(word.id)) {
      uniqueWordIds.add(word.id);
      uniqueWords.push(word);
    }
  });

  // 우선순위 3: 미학습 단어들
  unlearnedWords.forEach(word => {
    if (!uniqueWordIds.has(word.id)) {
      uniqueWordIds.add(word.id);
      uniqueWords.push(word);
    }
  });

  const availableWordCount = uniqueWords.length;
  const totalWordCount = allWords.length;

  const [wordCount, setWordCount] = React.useState(MIN_TEST_VOCABULARY_COUNT);
  const [showWarning, setShowWarning] = React.useState(false);

  // availableWordCount가 변경되면 wordCount도 업데이트
  useEffect(() => {
    const maxCount = Math.min(availableWordCount, MAX_TEST_VOCABULARY_COUNT);

    if (availableWordCount < MIN_TEST_VOCABULARY_COUNT) {
      setShowWarning(true);
      setWordCount(MIN_TEST_VOCABULARY_COUNT);
    } else {
      // availableWordCount가 충분하면 기본값 10으로 설정 (최대값을 넘지 않도록)
      const defaultCount = Math.min(10, maxCount);
      if (wordCount > maxCount) {
        setWordCount(maxCount);
        setShowWarning(false);
      } else if (wordCount < MIN_TEST_VOCABULARY_COUNT) {
        setWordCount(defaultCount);
        setShowWarning(false);
      } else {
        setShowWarning(false);
      }
    }
  }, [availableWordCount]);


  useEffect(() => {
    console.log(recentStudy);
    // if(recentStudy && recentStudy['today'] && recentStudy['today'].status === "learning") {
    //   setTimeout(() => {
    //     pushNewBottomSheet(
    //       LearningInfoNewBottomSheet,
    //       {
    //         testType: 'today',
    //         onCancel: (props) => {
    //           popNewBottomSheet();
    //         },
    //         onSet: (props) => {
    //           console.log(props);
    //           closeNewFullSheet();
    //           clearNewBottomSheetStack();
    //           navigate('/take-test', {
    //             state: {
    //               testType: props.testType
    //             }
    //           });
    //         }
    //       },
    //       {
    //         isBackdropClickClosable: false,
    //         isDragToCloseEnabled: true
    //       }
    //     );
    //   }, 300);
    //   return;
    // }
    // 전체 단어가 4개 이하인 경우: 학습 자체가 불가능
    if (totalWordCount < MIN_TEST_VOCABULARY_COUNT) {
      setTimeout(() => {
        pushNewBottomSheet(
          InsufficientWordsNewBottomSheet,
          {
            title: `학습 가능한 단어가 부족해요!\n최소 ${MIN_TEST_VOCABULARY_COUNT}개 이상의 단어가 필요합니다.`,
          },
          {
            isBackdropClickClosable: false,
            isDragToCloseEnabled: true
          }
        );
      }, 300);
      return;
    }

    // 전체 단어는 충분하지만 오늘 학습할 단어가 없는 경우
    if (totalWordCount >= MIN_TEST_VOCABULARY_COUNT && availableWordCount < MIN_TEST_VOCABULARY_COUNT) {
      setTimeout(() => {
        pushNewBottomSheet(
          NoTodayStudyWordsNewBottomSheet,
          {
            onConfirm: () => {
              clearNewBottomSheetStack();
              setTimeout(() => {
                closeNewFullSheet();
                setTimeout(() => {
                  navigate('/class');
                }, 300);
              }, 300);
            },
            onCancel: () => {
              clearNewBottomSheetStack();
              setTimeout(() => {
                closeNewFullSheet();
                setTimeout(() => {
                  navigate('/home');
                }, 300);
              }, 300);
            }
          },
          {
            isBackdropClickClosable: false,
            isDragToCloseEnabled: true
          }
        );
      }, 300);
    }
  }, [availableWordCount]);

  const handleStart = async () => {
    // wordCount가 availableWordCount를 초과하지 않도록 제한
    const finalWordCount = Math.min(wordCount, availableWordCount);

    await updateRecentStudy('today', {
      ...recentStudy['today'],
      progress_index: null,
      type: 'today',
      status: null,
      study_data: null,
      updated_at: null,
      created_at: null,
    });
    closeNewFullSheet();
    navigate('/take-test', {
      state: {
        data: {
          count: finalWordCount,
          vocabularySheetId: "all",
          memoryState: "unlearned",
          questionType: "multipleChoice",
        },
        testType: 'today'
      }
    });
  }

  return (
    <div className="
      flex flex-col h-full w-full
      bg-white
    ">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      {/* Header */}
      <div className="
        relative
        flex items-center justify-center
        h-[55px] 
        pt-[20px] px-[10px] pb-[14px]
      ">

        <motion.button
          onClick={() => {
            vibrate({ duration: 5 });
            popNewFullSheet();
          }}
          className="
            absolute top-[18px] left-[10px]
            flex items-center gap-[4px]
            text-[#CCC] dark:text-[#fff]
            p-[4px]
            rounded-[8px]
          "
          whileHover={{
            backgroundColor: 'rgba(0, 0, 0, 0.05)',
            scale: 1.05
          }}
          whileTap={{
            scale: 0.95,
            backgroundColor: 'rgba(0, 0, 0, 0.1)'
          }}
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 17
          }}
        >
          <CaretLeft size={24} />
        </motion.button>
        <h1 className="
          text-[18px] font-[700]
          text-[#111] dark:text-[#fff]
        ">오늘의 학습</h1>
        <div
          className="
            absolute top-[18px] right-[10px]
            flex items-center gap-[4px]
            text-[#CCC] dark:text-[#fff]
          "
        >
        </div>
      </div>

      <div className="flex flex-col items-center justify-center h-full gap-[20px] p-[20px]">
        <div className="flex items-center justify-center w-full h-[300px] rounded-[20px]"
          style={{
            background: 'linear-gradient(135deg, rgba(255, 185, 233, 1) 0%, rgba(255, 185, 233, 1) 40%, rgba(255, 221, 242, 1) 100%)',
          }}
        >
          <img src={HeyQuestionImg} alt="heyQuestionImg" className="h-[160px]" />
          <div className="flex flex-col gap-[25px]">
            <div className="
               relative 
               px-[15px] py-[12px] mb-[11px] 
               rounded-[10px] 
               bg-[#fff] 
               text-[14px] font-[600] text-[#111]
               shadow-[0px_0px_4px_0px_rgba(0,0,0,0.15)]
             ">
              <span>오늘은 몇 개 단어를<br />공부해볼까요?</span>
              <img src={SpeechBubbleTailImg} alt="speechBubbleTailImg" className="absolute top-[100%] h-[11px]" />
            </div>
            <div className="relative flex justify-end">
              <motion.input
                type="text"
                inputMode="numeric"
                value={wordCount}
                onChange={(e) => {
                  vibrate({ duration: 5 });
                  const inputValue = e.target.value.replace(/[^0-9]/g, '');
                  const maxCount = Math.min(availableWordCount, MAX_TEST_VOCABULARY_COUNT);

                  if (inputValue === '') {
                    setWordCount(0);
                    setShowWarning(true); // 0 < MIN_TEST_VOCABULARY_COUNT이므로 경고 표시
                  } else {
                    const value = parseInt(inputValue);
                    const maxCount = Math.min(availableWordCount, MAX_TEST_VOCABULARY_COUNT);

                    if (value > maxCount) {
                      // 최대값 초과 시 최대값으로 고정하되 경고 표시
                      setWordCount(maxCount);
                      setShowWarning(true);
                    } else if (value < MIN_TEST_VOCABULARY_COUNT) {
                      setWordCount(value);
                      setShowWarning(true);
                    } else {
                      setWordCount(value);
                      setShowWarning(false);
                    }
                  }
                }}
                className={`
                  w-[120px] h-[45px]
                  pr-[36px]
                  border-[1px] border-[#ccc]
                  rounded-[8px]
                  text-end 
                  text-[24px] font-[700] text-primary-main-600
                  outline-none
                  ${showWarning ? 'border-red-500' : 'border-[#ccc]'}
                `}
                whileFocus={{
                  scale: 1.02,
                  boxShadow: "0px 0px 8px rgba(255, 141, 212, 0.3)"
                }}
                animate={{
                  scale: showWarning ? [1, 1.02, 1] : 1,
                  borderColor: showWarning ? "#ef4444" : "#ccc"
                }}
                transition={{
                  scale: { duration: 0.2 },
                  borderColor: { duration: 0.3 }
                }}
              />
              <AnimatePresence>
                {showWarning && (
                  <motion.div
                    className="absolute top-[100%] right-0 text-start flex justify-start items-start gap-[4px] w-[120px] mt-[10px]"
                    initial={{ opacity: 0, y: -10, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.9 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  >
                    <WarningCircle size={14} weight="fill" className="text-red-500" />
                    <span className="text-red-500 text-[12px] font-medium">
                      {wordCount < MIN_TEST_VOCABULARY_COUNT
                        ? `최소 ${MIN_TEST_VOCABULARY_COUNT}개 이상 부터 입력해주세요`
                        : `최대 ${availableWordCount}개 까지만 입력 가능합니다`}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
              <motion.span
                className="absolute top-[50%] right-[15px] translate-y-[-50%] text-[16px] font-[700] text-[#111]"
                animate={{
                  color: showWarning ? "#ef4444" : "#111"
                }}
                transition={{ duration: 0.3 }}
              >
                개
              </motion.span>
            </div>
          </div>
        </div>
        <motion.button
          disabled={showWarning || availableWordCount < MIN_TEST_VOCABULARY_COUNT}
          className={`
            w-full h-[50px] rounded-[8px] text-[16px] font-[700]
            ${showWarning || availableWordCount < MIN_TEST_VOCABULARY_COUNT ? 'border-[1px] border-[#ccc] text-[#ccc] bg-[transparent] cursor-not-allowed' : 'text-[#fff] bg-primary-main-600'}
          `}
          whileHover={showWarning || availableWordCount < MIN_TEST_VOCABULARY_COUNT ? {} : { scale: 1.02 }}
          whileTap={showWarning || availableWordCount < MIN_TEST_VOCABULARY_COUNT ? {} : { scale: 0.98 }}
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 17
          }}
          onClick={() => {
            vibrate({ duration: 5 });
            handleStart();
          }}
        >
          시작하기
        </motion.button>
      </div>

    </div>
  );
};

export default TodayStudyNewFullSheet;

