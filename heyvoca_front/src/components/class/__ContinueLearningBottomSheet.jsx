// import React, { useCallback } from 'react';
// import { motion } from 'framer-motion';
// import { useNewBottomSheet } from '../../hooks/useNewBottomSheet';

// export const useContinueLearningBottomSheet = () => {
//   const { pushNewBottomSheet, popNewBottomSheet } = useNewBottomSheet();
//   const handleClose = useCallback(() => {
//     popNewBottomSheet();
//   }, [popNewBottomSheet]);


//   const showContinueLearningBottomSheet = useCallback(() => {
//     pushNewBottomSheet(
//       ContinueLearningBottomSheet,
//       {
//         onCancel: handleClose,
//         onSet: () => {
//           console.log("이어학습 클릭함")
//         }
//       },
//       {
//         isBackdropClickClosable: false,
//         isDragToCloseEnabled: true
//       }
//     );
//   }, [pushNewBottomSheet, handleClose]);

//   return {
//     showContinueLearningBottomSheet
//   };
// };


// export const ContinueLearningBottomSheet = ({onCancel, onSet}) => {
//   return (
//     <div className="">
//       <div>
//         <div className="left"></div>
//         <div className="
//           flex items-center justify-center
//           p-[20px] pb-[0px]
//           ">
//           <h1 className="text-[18px] font-[700]">최근 학습</h1>
//         </div>
//         <div className="right"></div>
//       </div>
//       <div className="
//         flex flex-col gap-[30px]
//         p-[20px]
//       ">

//       </div>
//       <div className="flex items-center justify-between gap-[15px] p-[20px]">
//         <motion.button 
//           className="
//             flex-1
//             h-[45px]
//             rounded-[8px]
//             bg-layout-gray-200
//             text-layout-white text-[16px] font-[700]
//           "
//           onClick={onCancel}
//           whileTap={{ scale: 0.95 }}
//           transition={{ 
//             type: "spring", 
//             stiffness: 500, 
//             damping: 15
//           }}
//         >취소</motion.button>
//         <motion.button 
//           className="
//             flex-1
//             h-[45px]
//             rounded-[8px]
//             bg--primary-main-600
//             text-layout-white text-[16px] font-[700]
//           "
//           onClick={() => onSet()}
//           whileTap={{ scale: 0.95 }}
//           transition={{ 
//             type: "spring", 
//             stiffness: 500, 
//             damping: 15
//           }}
//         >이어하기</motion.button>
//       </div>
//     </div>
//   );
// }; 