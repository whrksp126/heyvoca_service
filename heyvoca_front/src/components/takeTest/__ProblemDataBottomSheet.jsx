// import React, { useState, useRef, useCallback } from 'react';
// import { Check, Minus, Plus } from '@phosphor-icons/react';
// import { motion } from 'framer-motion';
// import { useNewBottomSheet } from '../../hooks/useNewBottomSheet';
// import { MIN_TEST_VOCABULARY_COUNT } from '../../utils/common';
// import MemorizationStatus from "../common/MemorizationStatus";

// export const useProblemDataBottomSheet = () => {
//   const { pushNewBottomSheet, popNewBottomSheet, clearStack } = useNewBottomSheet();
//   const handleClose = useCallback(() => {
//     popNewBottomSheet();
//   }, [popNewBottomSheet]);

//   const showProblemDataBottomSheet = useCallback(({options}) => {
//     pushNewBottomSheet(
//       ProblemDataBottomSheet,
//       {
//         onCancel: handleClose,
//         options: options
//       },
//       {
//         isBackdropClickClosable: true,
//         isDragToCloseEnabled: false
//       }
//     );
//   }, [pushNewBottomSheet, handleClose]);

//   return {
//     showProblemDataBottomSheet
//   };
// };


// export const ProblemDataBottomSheet = ({onCancel, options}) => {
//   return (
//     <div className="">
//       <div>
//         <div className="left"></div>
//         <div className="
//           flex items-center justify-center
//           p-[20px] pb-[0px]
//           ">
//           <h1 className="text-[18px] font-[700]">단어 확인</h1>
//         </div>
//         <div className="right"></div>
//       </div>
//       <div className="
//         flex flex-col gap-[30px]
//         max-h-[calc(90vh-47px)] h-full
//         p-[20px] pb-[105px]
//         overflow-y-auto
//       ">
//         {options.map((option, index) => (
//         <div key={`option_${option.id}_${index}`}
//           className="
//             flex flex-col gap-[10px]
//           "
//         >
//           <div className="
//             flex flex-col gap-[10px]
//           ">
//             <MemorizationStatus repetition={option.repetition} interval={option.interval} ef={option.ef} />
//             <h2 className="text-[20px] font-[700]">{option.origin}</h2>
//             <p className="text-[14px] font-[400]">{option.meanings.join(", ")}</p>
//           </div>
//           {option.examples && (option.examples.map((example, index) => (
//           <div>
//             <p className="text-[14px] font-[400]">{example.origin}</p>
//             <p className="text-[14px] font-[400]">{example.meaning}</p>
//           </div>
//           )))}
//           <div>


//           </div>
//         </div>
//         ))}
//       </div>
//       <div className="
//         absolute bottom-0 left-0 right-0
//         flex items-center justify-between gap-[15px] p-[20px]
//         bg-[#fff]/80 backdrop-blur-[1px]
//       ">
//         <motion.button 
//           className="
//             flex-1
//             h-[45px]
//             rounded-[8px]
//             bg-[#ccc]
//             text-[#fff] text-[16px] font-[700]
//           "
//           onClick={onCancel}
//           whileTap={{ scale: 0.95 }}
//           transition={{ 
//             type: "spring", 
//             stiffness: 500, 
//             damping: 15
//           }}
//         >닫기</motion.button>
//       </div>
//     </div>
//   );
// }; 