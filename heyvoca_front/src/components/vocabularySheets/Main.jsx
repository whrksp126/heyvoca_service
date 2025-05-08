import { PencilSimple, Trash } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useVocabulary } from '../../context/VocabularyContext';
import { useFullSheet } from '../../context/FullSheetContext';
import VocabularyWords from './VocabularyWords';

const Main = () => {

  const navigate = useNavigate();
  const { pushFullSheet } = useFullSheet();
  const { vocabularySheets, isLoading } = useVocabulary();
  
  const today_sentence = {
    title: "오늘의 문장 💬",
    sentence: "Could you recommend a dish that's not too spicy but still flavorful?",
    translation: "너무 맵지 않으면서도 맛있는 음식을 추천해 주실 수 있나요?",
  };

  if (isLoading) {
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
    pushFullSheet({
      component: <VocabularyWords id={id} />
    });
  };

  return (
    <div 
      className="
        flex flex-col 
        h-[calc(100vh-theme(height.header)-theme(height.bottom-nav))]
        px-[16px] py-[10px]
        overflow-y-auto
      "
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
          {[0,1,2,3,4,5,6,7,8,9].map((item) => (
            <img 
              key={item} 
              src="/src/assets/images/note_ring.png" 
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
        <ul className="flex flex-col gap-[15px]">
          {sortedVocabularySheets.map((item) => {
            const progress = item.total === 0 ? 0 : Math.round((item.memorized/item.total) * 100);
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
                onClick={() => handleCardClick(item.id)}
                whileTap={{ scale: 0.98 }}
                whileHover={{ scale: 1.02 }}
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
                <span className="text-[10px] font-[400] text-[#999]">{item.memorized||0}/{item.total}</span>
              </div>
  
              <div 
                className="
                  middle
                  hidden
                "
              >
                <div className="btns">
                  <button>
                    <PencilSimple  />
                  </button>
                  <button>
                    <Trash/>
                  </button>
                </div>
              </div>
  
              <div className="bottom">
                <div 
                  style={{ backgroundColor: item.color.sub }}
                  className="
                    w-[100%] h-[16px]
                    rounded-[16px]
                    overflow-hidden
                  "
                >
                  <div 
                    style={{ 
                      width: `${progress}%`,
                      backgroundColor: item.color.main
                    }}
                    className="
                      relative
                      h-[100%]
                      rounded-[16px]
                    "
                  >
                    <span 
                      style={{
                        transform : `translateY(-50%) translateX(${progress > 10 ? '0' : '30px'})`
                      }}
                      className="
                        absolute top-[50%] right-[8px]
                        text-[10px] font-[600] text-[#fff]
                      ">
                      {progress}%
                    </span>
                  </div>
                </div>
              </div>
            </motion.li>
          )})}
        </ul>
      </div>
    </div>
  );
};

export default Main; 