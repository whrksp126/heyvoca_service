import { motion, AnimatePresence } from "framer-motion";
import { useVocabulary } from '../../context/VocabularyContext';
import { BoxArrowDown, Plus } from "@phosphor-icons/react";

const Main = () => {
  
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
      <div className="middle"></div>
      <div className="bottom"></div>
    </motion.div>
  );
};

export default Main; 