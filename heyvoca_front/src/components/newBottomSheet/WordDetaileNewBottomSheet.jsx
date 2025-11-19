import React from 'react';
import { motion } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useVocabulary } from '../../context/VocabularyContext';
import { getTextSound } from '../../utils/common';
import MemorizationStatus from "../common/MemorizationStatus";
import { PencilSimple, Trash} from '@phosphor-icons/react';
import DeleteWordNewBottomSheet from './DeleteWordNewBottomSheet';
import AddWordNewBottomSheet from './AddWordNewBottomSheet';


const WordDetaileNewBottomSheet = ({ vocabularyId, id }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화
  
  const { getWord } = useVocabulary();
  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { pushAwaitNewBottomSheet, popNewBottomSheet } = useNewBottomSheetActions();

  // React Compiler가 자동으로 메모이제이션 처리 (useMemo 불필요)
  const word = getWord(vocabularyId, id);
  console.log(word);

  const handleClose = () => {
    popNewBottomSheet();
  };

  // 단어 수정 함수
  const handleEdit = async () => {
    const editResult = await pushAwaitNewBottomSheet(AddWordNewBottomSheet, { vocabularyId, dictionaryId: word.dictionaryId, id }, {
      hideUnderlying: true,
    });
    if (editResult.cancelled) {
      return;
    }
    popNewBottomSheet();
  };

  // 단어 삭제 함수
  const handleDelete = async () => {
    const deleteResult = await pushAwaitNewBottomSheet(DeleteWordNewBottomSheet, { vocabularyId, id },{
      hideUnderlying: true,
    });
    if (deleteResult.cancelled) {
      return;
    }
    popNewBottomSheet();
  };
  return (
    <div className="">
      <div className="p-[20px] pb-[10px]">
        {word && (
          <div className="flex flex-col gap-[10px]">
            <div className="flex items-center justify-between">
              <div>
                {MemorizationStatus({repetition: word.repetition, interval: word.interval, ef: word.ef})}
              </div>
              <div className="flex items-center gap-[8px]">
                <motion.button
                  onClick={handleEdit}
                >
                  <PencilSimple size={18} color="#FF8DD4" />
                </motion.button>
                <motion.button
                  onClick={handleDelete}
                >
                  <Trash size={18} color="red" />
                </motion.button>
              </div>
            </div>
            <div className="flex flex-wrap">
              <motion.h3
                onClick={() => {
                  getTextSound(word.origin, "en");
                  const spans = document.querySelectorAll(`#word-${id} span`);
                  spans.forEach(span => span.getAnimations().forEach(anim => anim.cancel()));
                  spans.forEach((span, index) => {
                    span.animate(
                      [
                        { color: "#111", offset: 0 },
                        { color: "#FFFFFF", offset: 0.5 },
                        { color: "#111", offset: 1 }
                      ],
                      { 
                        duration: 1000, 
                        delay: index * 50,
                        easing: "cubic-bezier(0.4, 0, 0.2, 1)"
                      }
                    );
                  });
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 20
                }}
                className="
                  text-[20px] font-[700] text-[#111]
                  cursor-pointer relative
                  overflow-hidden
                  break-words 
                "
                id={`word-${id}`}
              >
                {word.origin.split('').map((char, index) => (
                  <motion.span
                    key={index}
                    initial={{ color: "#111" }}
                    className="inline-block"
                  >
                    {char}
                  </motion.span>
                ))}
              </motion.h3>
            </div>
            <div className="flex flex-wrap">
              <motion.span
                onClick={() => {
                  getTextSound(word.meanings.join(", "), "ko");
                  const spans = document.querySelectorAll(`#meaning-${id} span`);
                  spans.forEach(span => span.getAnimations().forEach(anim => anim.cancel()));
                  spans.forEach((span, index) => {
                    span.animate(
                      [
                        { color: "#111", offset: 0 },
                        { color: "#FFFFFF", offset: 0.5 },
                        { color: "#111", offset: 1 }
                      ],
                      { 
                        duration: 1000, 
                        delay: index * 50,
                        easing: "cubic-bezier(0.4, 0, 0.2, 1)"
                      }
                    );
                  });
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{
                  type: "spring", 
                  stiffness: 400,
                  damping: 20
                }}
                className="
                  text-[14px] font-[400] text-[#111]
                  cursor-pointer relative
                  overflow-hidden
                  break-words
                "
                id={`meaning-${id}`}
              >
                {word.meanings.join(", ").split('').map((char, index) => (
                  <motion.span
                    key={index}
                    initial={{ color: "#111" }}
                    className="inline-block"
                  >
                    {char}
                  </motion.span>
                ))}
              </motion.span>
            </div>
            {
              word.examples?.map((example, index) => (
              <div key={`${id}-${index}`} className="flex flex-col">
                <motion.span
                  onClick={() => {
                    getTextSound(example.origin.join(", "), "ko");
                    const spans = document.querySelectorAll(`#example-${id}-${index} span`);
                    spans.forEach(span => span.getAnimations().forEach(anim => anim.cancel()));
                    spans.forEach((span, index) => {
                      span.animate(
                        [
                          { color: "#111", offset: 0 },
                          { color: "#FFFFFF", offset: 0.5 },
                          { color: "#111", offset: 1 }
                        ],
                        { 
                          duration: 1000, 
                          delay: index * 50,
                          easing: "cubic-bezier(0.4, 0, 0.2, 1)"
                        }
                      );
                    });
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{
                    type: "spring", 
                    stiffness: 400,
                    damping: 20
                  }}
                  className="
                    text-[14px] font-[400] text-[#111]
                    cursor-pointer relative
                    overflow-hidden
                    break-words
                  "
                  id={`example-${id}-${index}`}
                >
                  {example.origin.split('').map((char, index) => (
                    <motion.span
                      key={index}
                      initial={{ color: "#111" }}
                      className="inline-block"
                    >
                      {char}
                    </motion.span>
                  ))}
                </motion.span>
                <motion.span
                  onClick={() => {
                    getTextSound(example.meaning, "ko");
                    const spans = document.querySelectorAll(`#example-${id}-${index}-meaning span`);
                    spans.forEach(span => span.getAnimations().forEach(anim => anim.cancel()));
                    spans.forEach((span, index) => {
                      span.animate(
                        [
                          { color: "#111", offset: 0 },
                          { color: "#FFFFFF", offset: 0.5 },
                          { color: "#111", offset: 1 }
                        ],
                        { 
                          duration: 1000, 
                          delay: index * 50,
                          easing: "cubic-bezier(0.4, 0, 0.2, 1)"
                        }
                      );
                    });
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{
                    type: "spring", 
                    stiffness: 400,
                    damping: 20
                  }}
                  className="
                    text-[14px] font-[400] text-[#111]
                    cursor-pointer relative
                    overflow-hidden
                    break-words
                  "
                  id={`example-${id}-${index}-meaning`}
                >
                  {example.meaning.split('').map((char, index) => (
                    <motion.span
                      key={index}
                      initial={{ color: "#111" }}
                      className="inline-block"
                    >
                      {char}
                    </motion.span>
                  ))}
                </motion.span>
              </div>
              ))
            }
 
          </div>

        )}
      </div>
      <div className="flex items-center justify-between gap-[15px] p-[20px]">
        <motion.button 
          className="
            flex-1
            h-[45px]
            rounded-[8px]
            bg-[#ccc]
            text-[#fff] text-[16px] font-[700]
          "
          onClick={handleClose}
          whileTap={{ scale: 0.95 }}
          transition={{ 
            type: "spring", 
            stiffness: 500, 
            damping: 15
          }}
        >닫기</motion.button>
      </div>
    </div>
  );
};

export default WordDetaileNewBottomSheet;