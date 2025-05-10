import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useVocabulary } from '../../context/VocabularyContext';
import { useFullSheet } from '../../context/FullSheetContext';
import { BoxArrowDown, Plus } from "@phosphor-icons/react";
import { useBookStoreBottomSheet } from "./BookStoreBottomSheet";
const Main = () => {
  const { pushFullSheet } = useFullSheet();
  const { isBookStoreLoading, bookStore } = useVocabulary();
  const { showBookStorePreviewBottomSheet } = useBookStoreBottomSheet();
  
  if (isBookStoreLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p>로딩 중...</p>
      </div>
    );
  }

  const handleBookStoreClick = (id) => {
    showBookStorePreviewBottomSheet(id);
  };

  return (
    <motion.div 
      className="
        flex flex-col 
        h-[calc(100vh-theme(height.header)-theme(height.bottom-nav))]
        px-[16px] py-[10px]
        overflow-y-auto
      "
      initial={{ opacity: 0, y: 20, transition: { duration: 0.2 } }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.2 } }}
      exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
    >
      <div className="top"></div>
      <div className="middle">
        <ul className="grid grid-cols-2 gap-[15px]">
          {bookStore.map((item, index) => {
            return (
              <motion.li
                key={item.id}
                style={{ backgroundColor: item.color.background }}
                className={`
                  flex flex-col gap-[15px] justify-between
                  p-[20px]
                  rounded-[12px]
                  cursor-pointer
                  shadow-sm
                `}
                whileTap={{ scale: 0.96}}
                whileHover={{ scale: 1.04}}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
                onClick={() => {
                  handleBookStoreClick(item.id)
                }}
              >
                <div className="flex flex-col gap-[5px]">
                  {item.category && (
                    <div 
                      style={{ backgroundColor: item.color.main }}
                      className={`
                        flex items-center justify-center
                        w-[max-content]
                        px-[6px] py-[3px]
                        rounded-[20px]
                        text-[8px] font-[700] text-[#fff]
                      `}
                    >{item.category}</div>
                  )}
                  <h2 className="font-[700] text-[16px] text-[#111]">{item.name}</h2>
                </div>
                <div className="flex items-end justify-between">
                  <span className="flex items-center gap-[2px] text-[10px] text-[#999]">
                    <BoxArrowDown size={12} /> {item.downloads}
                  </span>
                  <div 
                    style={{ 
                      color: item.color.main,
                      backgroundColor: item.color.sub
                    }} 
                    className={`
                      flex items-center justify-center 
                      w-[30px] h-[30px] 
                      rounded-[50px] 
                      text-[16px]
                    `}
                  >
                    <Plus />
                  </div>
                </div>
              </motion.li>
            );
          })}
        </ul>
      </div>
      <div className="bottom"></div>
    </motion.div>
  );
};

export default Main; 