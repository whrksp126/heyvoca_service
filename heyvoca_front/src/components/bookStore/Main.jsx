import React from 'react';
import { motion } from 'framer-motion';
import BookSection from './BookSection';

const Main = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  return (
    <motion.div
      className="
        flex flex-col
        h-[calc(100vh-var(--current-header-height)-var(--current-bottom-nav-height)-var(--status-bar-height))]
        overflow-y-auto
      "
      initial={{ opacity: 0, y: 20, transition: { duration: 0.2 } }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.2 } }}
      exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
    >
      <BookSection />
    </motion.div>
  );
};

export default Main;
