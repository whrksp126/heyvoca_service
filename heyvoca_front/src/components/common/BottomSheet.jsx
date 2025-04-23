import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const BottomSheet = ({ 
  isOpen, 
  onClose, 
  children, 
  isBackdropClickClosable = true,
  isDragToCloseEnabled = true 
}) => {
  const handleBackdropClick = () => {
    if (isBackdropClickClosable) {
      onClose();
    }
  };

  const handleDragEnd = (event, info) => {
    if (isDragToCloseEnabled && (info.offset.y > 100 || info.velocity.y > 300)) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            className="fixed inset-0 bg-black/50 z-[1000]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleBackdropClick}
          />
          <motion.div 
            className="fixed left-0 right-0 bottom-0 bg-white rounded-t-2xl z-[1001] after:content-[''] after:absolute after:left-0 after:right-0 after:bottom-[-100vh] after:h-[101vh] after:bg-white"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.4}
            onDragEnd={handleDragEnd}
          >
            <div className="">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default BottomSheet; 