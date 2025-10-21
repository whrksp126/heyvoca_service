// import React, { useState } from 'react';
// import { CaretLeft } from '@phosphor-icons/react';

// import { motion } from 'framer-motion';

// const PushNotifications = () => {

//   const { handleBack } = useFullSheet();


//   return (
//     <div className="flex flex-col h-full">
//       {/* Header */}
//       <div className="
//         relative
//         flex items-center justify-between
//         h-[55px] 
//         pt-[20px] px-[16px] pb-[14px]
//       ">
//         <div className="flex items-center gap-[4px]">
//           <motion.button
//             onClick={handleBack}
//             className="
//               text-[#CCC] dark:text-[#fff]
//               rounded-[8px]
//             "
//             whileHover={{ 
//               backgroundColor: 'rgba(0, 0, 0, 0.05)',
//               scale: 1.05
//             }}
//             whileTap={{ 
//               scale: 0.95,
//               backgroundColor: 'rgba(0, 0, 0, 0.1)'
//             }}
//             transition={{ 
//               type: "spring", 
//               stiffness: 400, 
//               damping: 17
//             }}
//           >
//             <CaretLeft size={24} />
//           </motion.button>
//           <h1 className="
//             text-[18px] font-[700]
//             text-[#111] dark:text-[#fff]
//           ">
//           </h1>
//         </div>
//         <h1 className="
//             absolute
//             left-1/2 -translate-x-1/2
//             text-[18px] font-[700]
//             text-[#111] dark:text-[#fff]
//           ">
//             푸시 알림
//           </h1>
//         <div
//           className="
//             flex items-center gap-[8px]
//             text-[#CCC] dark:text-[#fff]
//           "
//         >
//         </div>
//       </div>


//       {/* Content */}
//       <div className="flex flex-col gap-[15px] flex-1 py-[10px] px-[16px] overflow-y-auto">

//       </div>
//     </div>
//   );
// };

// export default PushNotifications;   