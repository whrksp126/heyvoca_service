import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { CaretLeft } from '@phosphor-icons/react';
import HeyCharacter from '../../assets/images/HeyCharacter.png';
import { backendUrl, fetchDataAsync } from '../../utils/common';
import { useVocabulary } from '../../context/VocabularyContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import InitialProfileStep4NewFullSheet from './InitialProfileStep4NewFullSheet';
import { vibrate } from '../../utils/osFunction';

const InitialProfileStep3NewFullSheet = ({ userInitialProfile, setUserInitialProfile, endInitialProfile }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const [isLoading, setIsLoading] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState(userInitialProfile.level || null);
  const { getBookStoreVocabularySheet } = useVocabulary();
  const { popNewFullSheet, pushNewFullSheet } = useNewFullSheetActions();

  // 레벨 선택 핸들러
  const handleLevelSelect = (target) => {
    setSelectedLevel(target);
  };

  // React Compiler가 자동으로 useCallback 처리
  const handleNextBtn = async () => {
    if (!selectedLevel) return;

    const target = selectedLevel;
    setIsLoading(true);

    // 레벨 저장
    const updatedProfile = {
      ...userInitialProfile,
      level: target,
    };
    setUserInitialProfile(updatedProfile);

    // 단어장 리스트 가져오기
    try {
      const url = `${backendUrl}/auth/level_book_list`;
      const method = 'GET';
      const fetchData = { level: target };
      const result = await fetchDataAsync(url, method, fetchData, false, null);

      if (result.code == 200) {
        const levelBookList = result.data.map((item) => {
          const bookId = item.id
          const vocabularySheet = getBookStoreVocabularySheet(bookId)
          return {
            ...item,
            ...vocabularySheet
          }
        })

        // 첫 번째 항목을 자동으로 선택하고 step4를 FullSheet로 열기
        if (levelBookList.length > 0) {
          const finalProfile = {
            ...updatedProfile,
            vocabook: levelBookList[0],
          };
          setUserInitialProfile(finalProfile);

          // 로딩 상태 해제
          setIsLoading(false);

          // step4를 FullSheet로 열기
          pushNewFullSheet(
            InitialProfileStep4NewFullSheet,
            { userInitialProfile: finalProfile, endInitialProfile },
            {
              smFull: true,
              closeOnBackdropClick: false,
              isDragToCloseEnabled: false
            }
          );
        } else {
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
      }
    } catch (error) {
      console.error('단어장 리스트 가져오기 실패:', error);
      setIsLoading(false);
    }
  }

  const buttonVariants = {
    hover: {
      scale: 1.02,
      boxShadow: "0 4px 8px rgba(0,0,0,0.1)"
    },
    tap: {
      scale: 0.98
    }
  };

  // 로딩 상태는 백그라운드에서 처리하므로 사용자에게 보여주지 않음

  return (
    <div className="
      flex flex-col h-full w-full
      bg-[#FFEFFA]
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
      </div>
      <div className="
        relative
        flex flex-col items-center gap-[45px] justify-end 
        w-full h-[calc(100vh-var(--status-bar-height)-55px)]
        p-[20px]
        bg-[#FFEFFA]
      ">
        <div className="
            absolute top-[35px] left-[50%] translate-x-[-50%] z-0
            flex flex-col items-center
            gap-[10px]
          ">
          <div
            className="
                w-[max-content]
                px-[15px] py-[12px]
                rounded-[10px]
                font-[16px] font-[600]
                bg-[#fff]
                text-center
              "
            style={{ boxShadow: '0px 0px 4px 0px rgba(0,0,0,0.15)' }}
          >
            좋아요! {userInitialProfile.name}님 <br />
            시작하기 전에 맞춤 테스트를 제공할 수 있도록 <br />
            원하는 레벨을 선택해주세요!
          </div>
          <img src={HeyCharacter} alt="logo"
            className="
                w-[160px]
              "
          />
        </div>
        <div className="
          relative z-10
          flex flex-col items-center gap-[15px]
          w-full
        ">
          <ul className="
            flex flex-col items-center gap-[10px]
            w-full
          ">
            <motion.button
              variants={buttonVariants}
              whileHover="hover"
              whileTap="tap"
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 17
              }}
              className={`
              w-full h-[45px]
              border-[2px] rounded-[8px]
              font-[16px] font-[700]
              ${selectedLevel === 1
                  ? 'border-[#FF8DD4] text-[#FF8DD4] bg-[#FFFFFF] shadow-[0_2px_8px_rgba(255,141,212,0.3)]'
                  : 'border-[#CCCCCC] text-[#111111] bg-[#FFFFFF] hover:border-[#FF8DD4] hover:text-[#FF8DD4] focus:border-[#FF8DD4] focus:text-[#FF8DD4]'
                }
            `}
              onClick={() => handleLevelSelect(1)}
            >
              Lv 1. 초등학생
            </motion.button>
            <motion.button
              variants={buttonVariants}
              whileHover="hover"
              whileTap="tap"
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 17
              }}
              className={`
              w-full h-[45px]
              border-[2px] rounded-[8px]
              font-[16px] font-[700]
              ${selectedLevel === 2
                  ? 'border-[#FF8DD4] text-[#FF8DD4] bg-[#FFFFFF] shadow-[0_2px_8px_rgba(255,141,212,0.3)]'
                  : 'border-[#CCCCCC] text-[#111111] bg-[#FFFFFF] hover:border-[#FF8DD4] hover:text-[#FF8DD4] focus:border-[#FF8DD4] focus:text-[#FF8DD4]'
                }
            `}
              onClick={() => handleLevelSelect(2)}
            >
              Lv 2. 중학생
            </motion.button>
            <motion.button
              variants={buttonVariants}
              whileHover="hover"
              whileTap="tap"
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 17
              }}
              className={`
              w-full h-[45px]
              border-[2px] rounded-[8px]
              font-[16px] font-[700]
              ${selectedLevel === 3
                  ? 'border-[#FF8DD4] text-[#FF8DD4] bg-[#FFFFFF] shadow-[0_2px_8px_rgba(255,141,212,0.3)]'
                  : 'border-[#CCCCCC] text-[#111111] bg-[#FFFFFF] hover:border-[#FF8DD4] hover:text-[#FF8DD4] focus:border-[#FF8DD4] focus:text-[#FF8DD4]'
                }
            `}
              onClick={() => handleLevelSelect(3)}
            >
              Lv 3. 고등학생
            </motion.button>
            <motion.button
              variants={buttonVariants}
              whileHover="hover"
              whileTap="tap"
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 17
              }}
              className={`
              w-full h-[45px]
              border-[2px] rounded-[8px]
              font-[16px] font-[700]
              ${selectedLevel === 4
                  ? 'border-[#FF8DD4] text-[#FF8DD4] bg-[#FFFFFF] shadow-[0_2px_8px_rgba(255,141,212,0.3)]'
                  : 'border-[#CCCCCC] text-[#111111] bg-[#FFFFFF] hover:border-[#FF8DD4] hover:text-[#FF8DD4] focus:border-[#FF8DD4] focus:text-[#FF8DD4]'
                }
            `}
              onClick={() => handleLevelSelect(4)}
            >
              Lv 4. 대학생 이상
            </motion.button>
          </ul>
          <motion.button
            whileHover={{
              scale: 1.02,
              backgroundColor: "#FF7AC4",
              boxShadow: "0 4px 8px rgba(0,0,0,0.1)"
            }}
            whileTap={{
              scale: 0.98,
              backgroundColor: "#FF6AB4"
            }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 17
            }}
            className={`
            w-full h-[50px]
            rounded-[8px]
            bg-[#FF8DD4]
            text-[#fff] font-[16px] font-[700]
            ${!selectedLevel ? 'opacity-50 cursor-not-allowed' : ''}
          `}
            onClick={handleNextBtn}
            disabled={!selectedLevel || isLoading}
          >
            {isLoading ? '처리 중...' : '확인'}
          </motion.button>
        </div>
      </div>
    </div>
  )
};

export default InitialProfileStep3NewFullSheet;

