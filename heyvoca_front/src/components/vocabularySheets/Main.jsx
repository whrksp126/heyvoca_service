import React, { useEffect } from 'react';
import { PencilSimple, Trash, Leaf, Plant, Carrot, EggCrack } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useVocabulary } from '../../context/VocabularyContext';
// import { useFullSheet } from '../../context/FullSheetContext';
import { useNewFullSheet } from '../../hooks/useNewFullSheet';
// import VocabularyWords from './VocabularyWords';
import VocabularyWordsNewFullSheet from '../newFullSheet/VocabularyWordsNewFullSheet';
import note_ring from '../../assets/images/note_ring.png';
import { vibrate } from '../../utils/osFunction';

const Main = () => {

  const navigate = useNavigate();
  // const { pushFullSheet } = useFullSheet();
  const { pushNewFullSheet } = useNewFullSheet();
  const { vocabularySheets, isVocabularySheetsLoading } = useVocabulary();

  // Hook은 항상 조건부 return 전에 호출되어야 합니다
  useEffect(() => {
    console.log(vocabularySheets);
  }, [isVocabularySheetsLoading, vocabularySheets]);

  const today_sentence = {
    title: "오늘의 문장 💬",
    sentence: "Could you recommend a dish that's not too spicy but still flavorful?",
    translation: "너무 맵지 않으면서도 맛있는 음식을 추천해 주실 수 있나요?",
  };

  if (isVocabularySheetsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p>로딩 중...</p>
      </div>
    );
  }

  // updatedAt 기준으로 정렬된 단어장 목록
  const sortedVocabularySheets = [...vocabularySheets].sort((a, b) =>
    new Date(b.updatedAt) - new Date(a.updatedAt)
  );

  const handleCardClick = (id) => {
    pushNewFullSheet(VocabularyWordsNewFullSheet, { id }, {
      smFull: true,
      closeOnBackdropClick: true
    });
  };

  // 암기 상태별 단어 개수 계산 함수
  const calculateMemorizationStats = (words) => {
    if (!words || words.length === 0) {
      return { unlearned: 0, leaf: 0, plant: 0, carrot: 0 };
    }

    const stats = {
      unlearned: 0,  // 미학습 (EggCrack)
      leaf: 0,       // 0-29% (Leaf)
      plant: 0,      // 30-69% (Plant)
      carrot: 0      // 70-100% (Carrot)
    };

    words.forEach(word => {
      // 미학습 상태 체크
      if (word.repetition === 0 && word.interval === 0) {
        stats.unlearned++;
        return;
      }

      // 암기율 계산 (MemorizationStatus와 동일한 로직)
      let score = 0;
      score += word.repetition * 15;
      score += word.interval * 2;
      score += (word.ef - 1.3) * 20;
      const percent = Math.max(0, Math.min(100, Math.round(score)));

      // 퍼센트에 따라 분류
      if (percent < 30) {
        stats.leaf++;
      } else if (percent < 70) {
        stats.plant++;
      } else {
        stats.carrot++;
      }
    });

    return stats;
  };

  return (
    <motion.div
      className="
        flex flex-col 
        h-[calc(100vh-theme(height.header)-theme(height.bottom-nav)-var(--status-bar-height))]
        px-[16px] py-[10px]
        overflow-y-auto
      "
      initial={{ opacity: 0, y: 20, transition: { duration: 0.2 } }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.2 } }}
      exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
    >
      <div className="
        top 
        relative
        flex flex-col gap-[15px]
        pt-[30px] px-[20px] pb-[20px]
        mb-[15px]
        rounded-[12px]
        bg-[#FFEFFA]
      ">
        <div
          className="
            absolute top-[0] left-[0]
            flex items-center justify-between
            w-full
            px-[14px]
            translate-y-[-20%]
          ">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((item) => (
            <img
              key={item}
              src={note_ring}
              alt="노트 위 고리 이미지"
              className="
                note_ring
                w-[12px] h-[24px]
              "
            />
          ))}
        </div>
        <h2 className="text-[16px] font-[700]">{today_sentence.title}</h2>
        <div className="flex flex-col gap-[10px]">
          <span className="text-[14px] font-[600]">
            {today_sentence.sentence}
          </span>
          <p className="text-[12px] font-[400]">
            {today_sentence.translation}
          </p>
        </div>
      </div>

      <div className="middle">
        <ul
          className="flex flex-col gap-[15px]"
        >
          {sortedVocabularySheets.map((item) => {
            const memorizationStats = calculateMemorizationStats(item.words);

            return (
              <motion.li
                key={item.id}
                style={{ backgroundColor: item.color.background }}
                className="
                  flex flex-col gap-[15px]
                  p-[20px]
                  rounded-[12px]
                  cursor-pointer
                "
                onClick={() => {
                  vibrate({ duration: 5 });
                  handleCardClick(item.id);
                }}
                whileTap={{ scale: 0.96 }}
                whileHover={{ scale: 1.04 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
              >
                <div
                  className="
                  top
                  flex items-center justify-between
                  w-full
                "
                >
                  <h3 className="text-[16px] font-[700]">{item.title}</h3>
                  <span className="text-[10px] font-[400] text-[#999]">{item.total || 0}</span>
                </div>

                <div
                  className="
                  middle
                  hidden
                "
                >
                  <div className="btns">
                    <button>
                      <PencilSimple />
                    </button>
                    <button>
                      <Trash />
                    </button>
                  </div>
                </div>

                {/* 암기 상태별 단어 개수 표시 */}
                <div className="flex items-center gap-[12px] flex-wrap">
                  <div className="flex items-center gap-[4px]">
                    <EggCrack size={16} weight="fill" className="text-[#9D835A]" />
                    <span className="text-[13px] font-[600] text-[#9D835A]">
                      {memorizationStats.unlearned || 0}
                    </span>
                  </div>
                  <div className="flex items-center gap-[4px]">
                    <Leaf size={16} weight="fill" className="text-[#77CE4F]" />
                    <span className="text-[13px] font-[600] text-[#77CE4F]">
                      {memorizationStats.leaf || 0}
                    </span>
                  </div>
                  <div className="flex items-center gap-[4px]">
                    <Plant size={16} weight="fill" className="text-[#38CE38]" />
                    <span className="text-[13px] font-[600] text-[#38CE38]">
                      {memorizationStats.plant || 0}
                    </span>
                  </div>
                  <div className="flex items-center gap-[4px]">
                    <Carrot size={16} weight="fill" className="text-[#F68300]" />
                    <span className="text-[13px] font-[600] text-[#F68300]">
                      {memorizationStats.carrot || 0}
                    </span>
                  </div>
                </div>
              </motion.li>
            )
          })}
        </ul>
      </div>
    </motion.div>
  );
};

export default Main; 