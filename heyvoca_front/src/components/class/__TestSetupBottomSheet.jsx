// import React, { useState, useRef, useCallback } from 'react';
// import { useNavigate } from 'react-router-dom';
// import { Check, Minus, Plus } from '@phosphor-icons/react';
// import { motion } from 'framer-motion';
// import { useNewBottomSheet } from '../../hooks/useNewBottomSheet';
// import { useNewFullSheet } from '../../hooks/useNewFullSheet';
// import { useVocabulary } from '../../context/VocabularyContext';
// import { MIN_TEST_VOCABULARY_COUNT } from '../../utils/common';

// export const useTestSetupBottomSheet = () => {
//   const { pushNewBottomSheet, popNewBottomSheet, clearStack: clearNewBottomSheetStack } = useNewBottomSheet();
//   const { clearStack: clearNewFullSheetStack } = useNewFullSheet();
//   const navigate = useNavigate();
//   const { vocabularySheets, recentStudy, updateRecentStudy } = useVocabulary();
//   const [questionType, setQuestionType] = useState('multipleChoice');
//   const [vocabularySheetId, setVocabularySheetId] = useState(null);
//   const handleClose = useCallback(() => {
//     popNewBottomSheet();
//   }, [popNewBottomSheet]);

//   const handleStartTest = useCallback(async (data) => {
//     const testType = data.testType;

//     console.log(testType, "testType")

//     if(recentStudy.status === "learning") {

//     }

//     // MEMO : testType : test, exam, today
//     await updateRecentStudy(testType, {
//       ...recentStudy[testType],
//       progress_index : null,
//       type: testType,
//       status: null,
//       study_data: null,
//       updated_at : null,
//       created_at : null,
//     });
    
//     // await updateRecentStudy({
//     //   ...recentStudy,
//     //   progress_index : null,
//     //   type: null,
//     //   status: null,
//     //   study_data: null,
//     //   updated_at : null,
//     //   created_at : null,
//     // });
//     clearNewBottomSheetStack();
//     clearNewFullSheetStack();
//     navigate('/take-test', { state: { data, testType } });
//   }, [recentStudy, questionType, vocabularySheetId, popNewBottomSheet, navigate, clearNewBottomSheetStack, clearNewFullSheetStack, updateRecentStudy]);

//   // const showTestSetupBottomSheet = useCallback(({questionType, vocabularySheetId, maxVocabularyCount}) => {
//   const showTestSetupBottomSheet = useCallback(({id:vocabularySheetId, maxVocabularyCount, testType}) => {
//     // setQuestionType(questionType);
//     console.log("testType", testType)
//     setVocabularySheetId(vocabularySheetId);
//     pushNewBottomSheet(
//       TestSetupBottomSheet,
//       {
//         maxVocabularyCount: maxVocabularyCount,
//         onCancel: handleClose,
//         onSet: (data) => handleStartTest({...data, vocabularySheetId: vocabularySheetId, testType: testType})
//       },
//       {
//         isBackdropClickClosable: false,
//         isDragToCloseEnabled: true
//       }
//     );
//   }, [pushNewBottomSheet, handleClose, handleStartTest]);

//   return {
//     showTestSetupBottomSheet
//   };
// };



// function getQuestionTypeLabel(type) {
//   switch (type) {
//     case 'multipleChoice':
//       return '사지 선다';
//     case 'fillInTheBlank':
//       return '빈칸 채우기';
//     case 'trueOrFalse':
//       return 'OX';
//     case 'matchingPairs':
//       return '매칭 페어';
//     case 'typing':
//       return '타이핑';
//     case 'audioChoice':
//       return '오디오 선다';
//     case 'ordering':
//       return '순서 맞추기';
//     case 'dragAndDrop':
//       return '드래그 앤 드랍';
//     default:
//       return '';
//   }
// }

// function getMemoryStateLabel(type) {
//   switch (type) {
//     case 'unlearned':
//       return '미학습';
//     case 'shortTerm':
//       return '단기 암기';
//     case 'mediumTerm':
//       return '중기 암기';
//     case 'longTerm':
//       return '장기 암기';
//     default:
//       return '';
//   }
// }

// function getInitialViewTypeLabel(type) {
//   switch (type) {
//     case 'origin':
//       return '단어';
//     case 'meanings':
//       return '의미';
//     case 'cross':
//       return '교차';
//     case 'random':
//       return '랜덤';
//     default:
//       return '';
//   }
// }

// function getOriginFilterTypeLabel(type) {
//   switch (type) {
//     case 'all':
//       return '전체';
//     case 'forget':
//       return '헷갈리는 단어';
//     default:
//       return '';
//   }
// }

// export const TestSetupBottomSheet = ({onCancel, onSet, maxVocabularyCount}) => {
//   const [questionType, setQuestionType] = useState('multipleChoice');
//   const [memoryState, setMemoryState] = useState('unlearned');
//   // const [initialViewType, setInitialViewType] = useState('origin');
//   // const [originFilterType, setOriginFilterType] = useState('all');
//   const [count, setCount] = useState(maxVocabularyCount > 12 ? 12 : maxVocabularyCount);
//   const inputRefs = useRef({
//     questionType: [],
//     memoryState: [],
//     // initialViewType: [],
//     // originFilterType: [],
//     count: []
//   });

//   const setCountFun = useCallback((value) => {
//     if(value < MIN_TEST_VOCABULARY_COUNT){
//       inputRefs.current['count'].value = MIN_TEST_VOCABULARY_COUNT;
//       setCount(MIN_TEST_VOCABULARY_COUNT);
//     }else if(value > maxVocabularyCount){
//       inputRefs.current['count'].value = maxVocabularyCount;
//       setCount(maxVocabularyCount);
//     }else{
//       inputRefs.current['count'].value = value;
//       setCount(value);
//     }
//   }, [maxVocabularyCount]);

//   const getTestSetupData = useCallback(() => {
//     return {
//       questionType: questionType,
//       memoryState: memoryState,
//       // initialViewType: initialViewType,
//       // originFilterType: originFilterType,
//       count: count
//     }
//   // }, [initialViewType, originFilterType, count]);
//   }, [questionType, memoryState, count]);
  
//   return (
//     <div className="">
//       <div>
//         <div className="left"></div>
//         <div className="
//           flex items-center justify-center
//           p-[20px] pb-[0px]
//           ">
//           <h1 className="text-[18px] font-[700]">테스트 설정</h1>
//         </div>
//         <div className="right"></div>
//       </div>
//       <div className="
//         flex flex-col gap-[30px]
//         p-[20px]
//       ">
//         <div 
//           className="
//             flex justify-between flex-col gap-[8px]
//           "
//         >
//           <h3 
//             className="
//               text-[14px] font-[700] text-[#111] text-center
//             dark:text-[#fff]
//             "
//           >
//             문제 유형
//           </h3>
//           <div className="grid grid-cols-2 gap-[10px]">
//             {/* {['origin', 'meanings', 'cross', 'random'].map((type, index) => ( */}
//             {['multipleChoice'].map((type, index) => (
//               <label 
//                 key={type}
//                 htmlFor={type}
//                 className={`
//                   flex items-center justify-center gap-[5px] 
//                   h-[45px]
//                   px-[15px]
//                   border-[1px] rounded-[8px]
//                   ${questionType === type ? 'border--primary-main-600' : 'border-[#ccc]'}
//                 `}
//                 onClick={() => {
//                   inputRefs.current[`questionType`][index]?.focus();
//                 }}
//               >
//                 <input 
//                   id={type} 
//                   type="radio" 
//                   name="questionType" 
//                   checked={questionType === type}
//                   onChange={() => setQuestionType(type)}
//                   ref={el => inputRefs.current[`questionType`][index] = el}
//                   hidden 
//                 />
//                 {questionType === type && <Check size={18} weight="bold" className="text-primary-main-600" />}
//                 <span className={`text-[16px] font-[700] ${questionType === type ? 'text-primary-main-600' : 'text-[#ccc]'}`}>
//                   {getQuestionTypeLabel(type)}
//                 </span>
//               </label>
//             ))}
//           </div> 
//         </div>
//         <div 
//           className="
//             flex justify-between flex-col gap-[8px]
//           "
//         >
//           <h3 
//             className="
//               text-[14px] font-[700] text-[#111] text-center
//             dark:text-[#fff]
//             "
//           >
//             암기 상태(복습 지연 우선)
//           </h3>
//           <div className="grid grid-cols-2 gap-[10px]">
//             {['unlearned', 'shortTerm', 'mediumTerm', 'longTerm'].map((type, index) => (
//               <label 
//                 key={type}
//                 htmlFor={type}
//                 className={`
//                   flex items-center justify-center gap-[5px] 
//                   h-[45px]
//                   px-[15px]
//                   border-[1px] rounded-[8px]
//                   ${memoryState === type ? 'border--primary-main-600' : 'border-[#ccc]'}
//                 `}
//                 onClick={() => inputRefs.current[`memoryState`][index]?.focus()}
//               >
//                 <input 
//                   id={type} 
//                   type="radio" 
//                   name="memoryState" 
//                   checked={memoryState === type}
//                   onChange={() => setMemoryState(type)}
//                   ref={el => inputRefs.current[`memoryState`][index] = el}
//                   hidden 
//                 />
//                 {memoryState === type && <Check size={18} weight="bold" className="text-primary-main-600" />}
//                 <span className={`text-[16px] font-[700] ${memoryState === type ? 'text-primary-main-600' : 'text-[#ccc]'}`}>
//                   {getMemoryStateLabel(type)}
//                 </span>
//               </label>
//             ))}
//           </div>
//         </div> 


//         <div 
//           className="
//             flex justify-between flex-col gap-[8px] 
//           "
//         >
//           <h3 
//             className="
//               text-[14px] font-[700] text-[#111] text-center
//             dark:text-[#fff]
//             "
//           >
//             문제 개수
//           </h3>
//           <div className="flex items-center justify-center gap-[10px]">
//             <button 
//               className={`
//                 flex items-center justify-center
//                 w-[40px] h-[40px]
//                 border-[1px] rounded-[8px]
//                 ${count <= MIN_TEST_VOCABULARY_COUNT ? 'border-[#ccc] text-[#ccc]' : 'border--primary-main-600 text-primary-main-600'}
//               `}
//               onClick={() => setCountFun(count - 1)}
//               disabled={count <= MIN_TEST_VOCABULARY_COUNT}
//             >
//               <Minus size={18} />
//             </button>
//             <input 
//               type="number" 
//               ref={el => inputRefs.current['count'] = el}
//               min={MIN_TEST_VOCABULARY_COUNT}
//               max={maxVocabularyCount}
//               className="w-[100px] h-[40px] px-[15px] border-[1px] border-[transparent] rounded-[8px] font-[700] text-[24px] text-primary-main-600 text-center outline-none focus:border--primary-main-600 transition-colors"
//               onChange={e => setCountFun(Number(e.target.value))}
//               value={count}
//             />
//             <button 
//               className={`
//                 flex items-center justify-center
//                 w-[40px] h-[40px]
//                 border-[1px] rounded-[8px]
//                 ${count >= maxVocabularyCount ? 'border-[#ccc] text-[#ccc]' : 'border--primary-main-600 text-primary-main-600'}
//               `}
//               onClick={() => setCountFun(count + 1)}
//               disabled={count >= maxVocabularyCount}
//             >
//               <Plus size={18} />
//             </button>
//           </div>
//         </div>
//       </div>
//       <div className="flex items-center justify-between gap-[15px] p-[20px]">
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
//         >취소</motion.button>
//         <motion.button 
//           className="
//             flex-1
//             h-[45px]
//             rounded-[8px]
//             bg-primary-main-600
//             text-[#fff] text-[16px] font-[700]
//           "
//           onClick={() => onSet(getTestSetupData())}
//           whileTap={{ scale: 0.95 }}
//           transition={{ 
//             type: "spring", 
//             stiffness: 500, 
//             damping: 15
//           }}
//         >시작</motion.button>
//       </div>
//     </div>
//   );
// }; 