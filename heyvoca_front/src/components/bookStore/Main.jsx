import { motion, AnimatePresence } from "framer-motion";
import { useVocabulary } from '../../context/VocabularyContext';
import { Plus } from "@phosphor-icons/react";
import { useNewBottomSheetActions } from "../../context/NewBottomSheetContext";
import { PreviewBookStoreNewBottomSheet } from "../newBottomSheet/PreviewBookStoreNewBottomSheet";
import { vibrate } from '../../utils/osFunction';
// import { PreviewBookStoreNewFullSheet } from "../newFullSheet/PreviewBookStoreNewFullSheet";
// import { useNewFullSheetActions } from "../../context/NewFullSheetContext";
import gem from "../../assets/images/gem.png";
const Main = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { isBookStoreLoading, bookStore, getBookStoreVocabularySheet } = useVocabulary();
  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { pushNewBottomSheet } = useNewBottomSheetActions();
  // const { pushNewFullSheet } = useNewFullSheetActions();

  if (isBookStoreLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p>로딩 중...</p>
      </div>
    );
  }

  // React Compiler가 자동으로 useCallback 처리
  const handleBookStoreClick = (id) => {
    const bookStoreVocabularySheet = getBookStoreVocabularySheet(id);
    pushNewBottomSheet(
      PreviewBookStoreNewBottomSheet,
      {
        bookStoreVocabularySheet: bookStoreVocabularySheet
      },
      {
        isBackdropClickClosable: true,
        isDragToCloseEnabled: false
      }
    );
    // pushNewFullSheet(
    //   PreviewBookStoreNewFullSheet,
    //   {
    //     bookStoreVocabularySheet: bookStoreVocabularySheet
    //   },
    //   {
    //     smFull: true,
    //     closeOnBackdropClick: true
    //   }
    // );
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
                  aspect-square
                `}
                whileTap={{ scale: 0.96 }}
                whileHover={{ scale: 1.04 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
                onClick={() => {
                  vibrate({ duration: 5 });
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
                        text-[8px] font-[700] text-layout-white
                      `}
                    >{item.category}</div>
                  )}
                  <h2 className="font-[700] text-[16px] text-layout-black">{item.name}</h2>
                </div>
                <div className="flex items-end justify-between">
                  <span className="flex items-center gap-[2px] text-[14px] font-[600] text-layout-black dark:text-layout-white">
                    <img src={gem} alt="보석" className="w-[17px] h-[15px]" /> {item.gem}
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