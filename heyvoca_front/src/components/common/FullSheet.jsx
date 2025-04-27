import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CaretLeft } from '@phosphor-icons/react';

const FullSheet = ({ 
  isOpen,
  onClose,
  title,
  showBackButton = true,
  backButtonText = "뒤로",
  customBackButton,
  children 
}) => {
  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ 
            type: "spring", 
            damping: 25, 
            stiffness: 200,
            mass: 0.8
          }}
          className="
            fixed top-0 right-0
            w-full h-full
            bg-white dark:bg-[#111]
            z-50
          "
        >
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="
              flex items-center justify-between
              h-[55px] px-[16px]
              border-b border-[#eee] dark:border-[#222]
            ">
              {showBackButton && (
                customBackButton || (
                  <button
                    onClick={onClose}
                    className="
                      flex items-center gap-[4px]
                      text-[#111] dark:text-[#fff]
                    "
                  >
                    <CaretLeft size={20} weight="bold" />
                    <span className="text-[16px] font-[400]">{backButtonText}</span>
                  </button>
                )
              )}
              <h1 className="
                text-[18px] font-[700]
                text-[#111] dark:text-[#fff]
              ">{title}</h1>
              <div className="w-[52px]" />
            </div>

            {/* Content */}
            <motion.div 
              className="flex-1 overflow-y-auto"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ delay: 0.1 }}
            >
              {children}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default FullSheet; 