// import React from 'react';
// import { motion, AnimatePresence } from 'framer-motion';

// const FullSheet = ({ 
//   isOpen,
//   onClose,
//   children 
// }) => {
//   return (
//     <AnimatePresence mode="wait" onExitComplete={onClose}>
//       {isOpen && (
//         <motion.div
//           initial={{ x: "100%" }}
//           animate={{ x: 0 }}
//           exit={{ x: "100%" }}
//           transition={{ 
//             type: "spring", 
//             damping: 25, 
//             stiffness: 200,
//             mass: 0.8
//           }}
//           className="
//             fixed top-0 right-0
//             w-full h-full
//             bg-white dark:bg-layout-black
//             z-50
//           "
//         >
//           <div className="flex flex-col h-full">
//             {children}
//           </div>
//         </motion.div>
//       )}
//     </AnimatePresence>
//   );
// };

// export default FullSheet; 