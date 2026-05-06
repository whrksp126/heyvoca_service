import React, { useEffect } from 'react';
import { PencilSimple, Trash, Leaf, Plant, Carrot, EggCrack, Timer } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useVocabulary } from '../../context/VocabularyContext';
// import { useFullSheet } from '../../context/FullSheetContext';
import { useNewFullSheet } from '../../hooks/useNewFullSheet';
// import VocabularyWords from './VocabularyWords';
import VocabularyWordsNewFullSheet from '../newfullsheet/VocabularyWordsNewFullSheet';
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

  // const today_sentence = {
  //   title: "오늘의 문장 💬",
  //   sentence: "Could you recommend a dish that's not too spicy but still flavorful?",
  //   translation: "너무 맵지 않으면서도 맛있는 음식을 추천해 주실 수 있나요?",
  // };

  // if (isVocabularySheetsLoading) {
  //   return (
  //     <div className="flex items-center justify-center h-full">
  //       <p>로딩 중...</p>
  //     </div>
  //   );
  // }

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

  // 암기 상태별 단어 개수 계산 함수 (MemorizationStatus와 동일한 로직)
  const calculateMemorizationStats = (words) => {
    if (!words || words.length === 0) {
      return { unlearned: 0, leaf: 0, plant: 0, carrot: 0 };
    }

    const stats = {
      unlearned: 0,  // 미학습 (EggCrack)
      leaf: 0,       // 단기 (Leaf, interval < 10)
      plant: 0,      // 중기 (Plant, interval < 60)
      carrot: 0      // 장기 (Carrot, interval >= 60)
    };

    words.forEach(word => {
      // sm2 필드 또는 기본 필드에서 데이터 추출
      const repetition = word.sm2?.repetition ?? word.repetition ?? 0;
      const interval = word.sm2?.interval ?? word.interval ?? 0;

      // 미학습 상태 체크 (한 번도 학습하지 않은 단어)
      if (repetition === 0 && interval === 0) {
        stats.unlearned++;
        return;
      }

      // 암기 상태 판단 (MemorizationStatus.jsx 기준)
      if (interval < 10) {
        stats.leaf++;
      } else if (interval < 60) {
        stats.plant++;
      } else {
        stats.carrot++;
      }
    });

    return stats;
  };

  const hasOverdueWords = (words) => {
    if (!words || words.length === 0) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return words.some(word => {
      const nextReview = word.sm2?.nextReview ?? word.nextReview;
      if (!nextReview) return false;
      let reviewDate;
      if (typeof nextReview === 'string' && nextReview.includes('-') && !nextReview.includes('T')) {
        const parts = nextReview.split('-');
        reviewDate = new Date(parts[0], parts[1] - 1, parts[2]);
      } else {
        reviewDate = new Date(nextReview);
      }
      reviewDate.setHours(0, 0, 0, 0);
      return reviewDate < today;
    });
  };

  return (
    <motion.div
      className="
        flex flex-col 
        h-[calc(100vh-var(--current-header-height)-var(--current-bottom-nav-height)-var(--status-bar-height))]
        px-[16px] py-[10px]
        overflow-y-auto
      "
      initial={{ opacity: 0, y: 20, transition: { duration: 0.2 } }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.2 } }}
      exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
    >
      {/* 
      <div className="
        top 
        relative
        flex flex-col gap-[15px]
        pt-[30px] px-[20px] pb-[20px]
        mb-[15px]
        rounded-[12px]
        bg-primary-main-100
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
      */}

      <div className="middle">
        <ul
          className="flex flex-col gap-[15px]"
        >
          {sortedVocabularySheets.map((item) => {
            const memorizationStats = calculateMemorizationStats(item.words);
            const overdue = hasOverdueWords(item.words);

            return (
              <motion.li
                key={item.id}
                style={overdue ? undefined : { backgroundColor: item.color.background }}
                className={`
                  flex flex-col gap-[15px]
                  p-[20px]
                  rounded-[12px]
                  cursor-pointer
                  ${overdue ? 'bg-status-error-100' : ''}
                `}
                onClick={() => {
                  vibrate({ duration: 5 });
                  handleCardClick(item.id);
                }}
                whileTap={{ scale: 0.96 }}
                whileHover={{ scale: 1.04 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
              >
                <div className="flex items-center justify-between w-full">
                  <h3 className="text-[16px] font-[700] text-layout-black">{item.title}</h3>
                  {overdue && (
                    <div className="flex items-center gap-[3px] h-[16px] bg-status-error-500 px-[5px] rounded-full">
                      <Timer size={10} weight="fill" className="text-white" />
                      <span className="text-[10px] font-[600] text-white">복습 지연</span>
                    </div>
                  )}
                </div>

                <div className="hidden">
                  <div className="btns">
                    <button><PencilSimple /></button>
                    <button><Trash /></button>
                  </div>
                </div>

                {/* 암기 상태별 단어 개수 + 총 단어 수 */}
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-[12px] flex-wrap">
                    <div className="flex items-center gap-[4px]">
                      <div className="w-[14px] h-[14px] flex items-center justify-center border-[1px] border-[#9D835A] rounded-[14px] bg-[#FFFCF3]">
                        <EggCrack size={8} weight="fill" className="text-[#9D835A]" />
                      </div>
                      <span className="text-[11px] font-[500] text-[#9D835A]">
                        {memorizationStats.unlearned || 0}
                      </span>
                    </div>
                    <div className="flex items-center gap-[4px]">
                      <div className="w-[14px] h-[14px] flex items-center justify-center border-[1px] border-[#77CE4F] rounded-[14px] bg-[#F2FFEB]">
                        <Leaf size={8} weight="fill" className="text-[#77CE4F]" />
                      </div>
                      <span className="text-[11px] font-[500] text-[#77CE4F]">
                        {memorizationStats.leaf || 0}
                      </span>
                    </div>
                    <div className="flex items-center gap-[4px]">
                      <div className="w-[14px] h-[14px] flex items-center justify-center border-[1px] border-[#38CE38] rounded-[14px] bg-[#EBFFEE]">
                        <Plant size={8} weight="fill" className="text-[#38CE38]" />
                      </div>
                      <span className="text-[11px] font-[500] text-[#38CE38]">
                        {memorizationStats.plant || 0}
                      </span>
                    </div>
                    <div className="flex items-center gap-[4px]">
                      <div className="w-[14px] h-[14px] flex items-center justify-center border-[1px] border-[#F68300] rounded-[14px] bg-[#FFF8E8]">
                        <Carrot size={8} weight="fill" className="text-[#F68300]" />
                      </div>
                      <span className="text-[11px] font-[500] text-[#F68300]">
                        {memorizationStats.carrot || 0}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-[400] text-[#999]">{item.total || 0}</span>
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