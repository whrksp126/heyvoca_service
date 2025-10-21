// import React from 'react';
// import { useVocabulary } from '../../context/VocabularyContext';
// import { useFullSheet } from '../../context/FullSheetContext';
// import TestSetup from './TestSetup';
// import { PencilSimple, Trash, CaretLeft } from '@phosphor-icons/react';
// import { motion } from 'framer-motion';
// import { MIN_TEST_VOCABULARY_COUNT, MAX_TEST_VOCABULARY_COUNT } from '../../utils/common';
// import { useTestSetupBottomSheet } from './TestSetupBottomSheet';

// const VocabularySheet = ({testType}) => {
//   const { handleBack } = useFullSheet();
//   const { vocabularySheets, isVocabularySheetsLoading } = useVocabulary();
//   // const { pushFullSheet } = useFullSheet();
//   const { showTestSetupBottomSheet } = useTestSetupBottomSheet();
//   if (isVocabularySheetsLoading) {
//     return (
//       <div className="flex items-center justify-center h-full">
//         <p>로딩 중...</p>
//       </div>
//     );
//   }

//   // updatedAt 기준으로 정렬된 단어장 목록
//   const sortedVocabularySheets = [...vocabularySheets].sort((a, b) => 
//     new Date(b.updatedAt) - new Date(a.updatedAt)
//   );

//   const handleCardClick = (id, index) => {
//     console.log("testType", testType);
//     if(id === "all") {
//       const maxVocabularyCount = vocabularySheets.slice(0, MAX_TEST_VOCABULARY_COUNT).reduce((sum, sheet) => sum + sheet.words.length, 0);
//       if(maxVocabularyCount < MIN_TEST_VOCABULARY_COUNT) return alert(`전체 단어 개수가 부족해요. 최소 ${MIN_TEST_VOCABULARY_COUNT}개 이상 필요합니다.`); 
//       showTestSetupBottomSheet({id, maxVocabularyCount, testType});
//       return;
//     }else{
//       const words = sortedVocabularySheets.find(vocabularySheet => vocabularySheet.id === id).words;
//       const vocabularySheetLength = words.slice(0, MAX_TEST_VOCABULARY_COUNT).length;
//       if(vocabularySheetLength < MIN_TEST_VOCABULARY_COUNT) return alert(`단어장에 단어가 부족해요. 최소 ${MIN_TEST_VOCABULARY_COUNT}개 이상 필요합니다.`);
//       const maxVocabularyCount = Math.min(vocabularySheetLength, MAX_TEST_VOCABULARY_COUNT);
//       showTestSetupBottomSheet({id, maxVocabularyCount, testType});
      
//     }



//     // pushFullSheet({
//     //   component: <TestSetup vocabularySheetId={id} maxVocabularyCount={maxVocabularyCount} />
//     // });
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
//             text-[#CCC] dark:text-[#fff]
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
//           text-[#111] dark:text-[#fff]
//         ">단어장 선택</h1>
//         <div
//           className="
//             absolute top-[18px] right-[10px]
//             flex items-center gap-[4px]
//             text-[#CCC] dark:text-[#fff]
//           "
//         >
//         </div>
//       </div>

//       <ul 
//         className="flex flex-col gap-[15px] flex-1 py-[10px] px-[16px] overflow-y-auto"
//       >
//             <motion.li
//               style={{
//                 background: 'linear-gradient(160deg,rgba(255, 239, 250, 1) 10%, rgba(246, 239, 255, 1) 50%, rgba(246, 239, 255, 1) 90%)',
//               }}
//               className="
//                 flex flex-col gap-[15px]
//                 p-[20px]
//                 rounded-[12px]
//                 cursor-pointer

//               "
//               onClick={() => handleCardClick("all")}
//               whileTap={{ scale: 0.96}}
//               whileHover={{ scale: 1.04}}
//               transition={{ type: "spring", stiffness: 400, damping: 17 }}
//             >
//               <div 
//               className="
//                 top
//                 flex items-center justify-between
//                 w-full
//               "
//             >
//               <h2 className="
//               flex items-center gap-[10px]
//               text-[16px] font-[700] text-[#111]
//             ">
//               <div 
//                 className="
//                   flex items-center justify-center
//                   w-[22px] h-[22px]
//                   rounded-[5px]
//                   text-[#fff] text-[10px] font-[700]
//                 "
//                 style={{ background: 'linear-gradient(160deg,rgba(255, 141, 212, 1) 10%, rgba(205, 141, 255, 1) 50%, rgba(116, 213, 255, 1) 90%)' }}
//               >
//                 All
//               </div>
//               전체 단어장
//             </h2>
//             </div>
//           </motion.li>
//         {sortedVocabularySheets.map((item) => {
//           const progress = item.total === 0 ? 0 : Math.round((item.memorized/item.total) * 100);
//           return (
//           <motion.li
//               key={item.id}
//               style={{ backgroundColor: item.color.background }}
//               className="
//                 flex flex-col gap-[15px]
//                 p-[20px]
//                 rounded-[12px]
//                 cursor-pointer
//               "
//               onClick={() => handleCardClick(item.id)}
//               whileTap={{ scale: 0.96}}
//               whileHover={{ scale: 1.04}}
//               transition={{ type: "spring", stiffness: 400, damping: 17 }}
//             >
//               <div 
//               className="
//                 top
//                 flex items-center justify-between
//                 w-full
//               "
//             >
//               <h3 className="text-[16px] font-[700]">{item.title}</h3>
//               <span className="text-[10px] font-[400] text-[#999]">{item.memorized||0}/{item.total}</span>
//             </div>

//             <div 
//               className="
//                 middle
//                 hidden
//               "
//             >
//               <div className="btns">
//                 <button>
//                   <PencilSimple  />
//                 </button>
//                 <button>
//                   <Trash/>
//                 </button>
//               </div>
//             </div>

//             <div className="bottom">
//               <div 
//                 style={{ backgroundColor: item.color.sub }}
//                 className="
//                   w-[100%] h-[16px]
//                   rounded-[16px]
//                   overflow-hidden
//                 "
//               >
//                 <div 
//                   style={{ 
//                     width: `${progress}%`,
//                     backgroundColor: item.color.main
//                   }}
//                   className="
//                     relative
//                     h-[100%]
//                     rounded-[16px]
//                   "
//                 >
//                   <span 
//                     style={{
//                       transform : `translateY(-50%) translateX(${progress > 10 ? '0' : '30px'})`
//                     }}
//                     className="
//                       absolute top-[50%] right-[8px]
//                       text-[10px] font-[600] text-[#fff]
//                     ">
//                     {progress}%
//                   </span>
//                 </div>
//               </div>
//             </div>
//           </motion.li>
//         )})}
//       </ul>
//     </div>
//   );
// };

// export default VocabularySheet; 