// import React from 'react';
// import { CaretLeft, Cards } from '@phosphor-icons/react';
// import { useFullSheet } from '../../context/FullSheetContext';
// import { useVocabulary } from '../../context/VocabularyContext';
// import { motion } from 'framer-motion';
// import { useTestSetupBottomSheet } from './TestSetupBottomSheet';

// const QUESTION_TYPE_MAP = {
//   MULTIPLE_CHOICE: 'multipleChoice', // 사지 선다
//   FILL_IN_THE_BLANK: 'fillInTheBlank', // 빈칸 채우기
//   TRUE_OR_FALSE: 'trueOrFalse', // 참 거짓
//   MATCHING_PAIRS: 'matchingPairs', // 매칭 페어
//   TYPING: 'typing', // 타이핑
//   AUDIO_CHOICE: 'audioChoice', // 오디오 선다
//   ORDERING: 'ordering', // 순서 맞추기
//   DRAG_AND_DROP: 'dragAndDrop', // 드래그 앤 드랍
// };

// const TestSetup = ({ vocabularySheetId, maxVocabularyCount }) => {
//   // console.log("vocabularySheetId", vocabularySheetId);
//   const { handleBack } = useFullSheet();
//   const { vocabularySheets, isVocabularySheetsLoading } = useVocabulary();
//   const { showTestSetupBottomSheet } = useTestSetupBottomSheet();
//   if (isVocabularySheetsLoading) {
//     return (
//       <div className="flex items-center justify-center h-full">
//         <p>로딩 중...</p>
//       </div>
//     );
//   }
// å
//   const handleCardClick = (questionType) => {
//     // showTestSetupBottomSheet({questionType, vocabularySheetId, maxVocabularyCount});

//   };

//   return (
//     <div className="flex flex-col h-full">
//       {/* Header */}
//       <div className="
//         relative
//         flex items-center justify-center
//         h-[55px] 
//         pt-[20px] px-[10px] pb-[14px]
//       ">
        
//         <motion.button
//           onClick={handleBack}
//           className="
//             absolute top-[18px] left-[10px]
//             flex items-center gap-[4px]
//             text-[#CCC] dark:text-layout-white
//             p-[4px]
//             rounded-[8px]
//           "
//           whileHover={{ 
//             backgroundColor: 'rgba(0, 0, 0, 0.05)',
//             scale: 1.05
//           }}
//           whileTap={{ 
//             scale: 0.95,
//             backgroundColor: 'rgba(0, 0, 0, 0.1)'
//           }}
//           transition={{ 
//             type: "spring", 
//             stiffness: 400, 
//             damping: 17
//           }}
//         >
//           <CaretLeft size={24} />
//         </motion.button>
//         <h1 className="
//           text-[18px] font-[700]
//           text-layout-black dark:text-layout-white
//         ">테스트 설정</h1>
//         <div
//           className="
//             absolute top-[18px] right-[10px]
//             flex items-center gap-[4px]
//             text-[#CCC] dark:text-layout-white
//           "
//         >
//         </div>
//       </div>

//       <ul 
//         className="flex items-center justify-center gap-[15px] flex-1 py-[10px] px-[16px] overflow-y-auto"
//       >
//         <motion.li 
//           className="
//             flex flex-col items-center justify-center gap-[10px]
//             w-[280px] h-[297px]
//             p-[30px]
//             border border--primary-main-600 rounded-[12px]
//             bg-primary-main-100
//           "
//           whileHover={{
//             scale: 1.05
//           }}
//           whileTap={{
//             scale: 0.95,
//           }}
//           onClick={() => handleCardClick(QUESTION_TYPE_MAP.MULTIPLE_CHOICE)}
//         >
//           <Cards size={32} weight="fill" className="text--primary-main-600" />
//           <h2 className="
//             text-[22px] font-[700]
//             text-layout-black dark:text-layout-white
//           ">사지 선다</h2>
//         </motion.li>
//       </ul>
//     </div>
//   );
// };

// export default TestSetup; 