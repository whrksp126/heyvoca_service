// import React, { useCallback, useState, useEffect } from 'react';
// import { motion } from 'framer-motion';
// import { useNewBottomSheet } from '../../hooks/useNewBottomSheet';
// import { useUser } from '../../context/UserContext';
// import { useFlyingAnimation } from '../../context/GemAnimationContext';
// import postMessageManager from '../../utils/postMessageManager';

// export const useStoreBuyItemBottomSheet = () => {
//   const [isLoading, setIsLoading] = useState(false);
//   const { pushNewBottomSheet, popNewBottomSheet } = useNewBottomSheet();
//   const handleClose = useCallback(() => {
//     popNewBottomSheet();
//   }, [popNewBottomSheet]);

//   const showStoreBuyItemBottomSheet = useCallback(({options}) => {
//     pushNewBottomSheet(
//       StoreBuyItemBottomSheet,
//       {
//         onCancel: handleClose,
//         options: options
//       },
//       {
//         isBackdropClickClosable: false,
//         isDragToCloseEnabled: false
//       }
//     );
//   }, [pushNewBottomSheet, handleClose]);

//   return {
//     showStoreBuyItemBottomSheet
//   };
// };


// export const StoreBuyItemBottomSheet = ({onCancel, options}) => {
//   const [isLoading, setIsLoading] = useState(true);
//   const [purchaseResult, setPurchaseResult] = useState(null);
//   const [error, setError] = useState(null);
//   const { setUserProfile } = useUser();
//   const { triggerFlyingAnimation } = useFlyingAnimation();
//   useEffect(() => {
//     // 결제 성공 콜백 등록
//     const handlePurchaseSuccess = (data) => {
//       console.log(`🎯 결제 성공 데이터 전체: ${JSON.stringify(data, null, 2)}`);
      
//       // 실제 젬 데이터는 serverResponse.data 안에 있음
//       const serverData = data.data.data;
      
//       if (serverData) {
//         console.log(`🎯 서버 데이터: ${JSON.stringify(serverData, null, 2)}`);
//         setPurchaseResult(serverData);
//         setIsLoading(false);
//       } else {
//         console.error('❌ serverResponse.data가 없습니다!');
//         setError('결제 데이터를 받지 못했습니다.');
//         setIsLoading(false);
//       }
//     };

//     // 결제 실패 콜백 등록 (필요시)
//     const handlePurchaseError = (data) => {
//       console.log('결제 실패 데이터:', data);
//       setError(data.data || '결제 중 오류가 발생했습니다.');
//       setIsLoading(false);
//     };

//     // 포스트메시지 리스너 등록
//     postMessageManager.setupIAPPurchaseSuccess(handlePurchaseSuccess);
    
//     // 컴포넌트 언마운트 시 리스너 정리
//     return () => {
//       postMessageManager.removeIAPPurchaseSuccess();
//     };
//   }, []);

//   const onConfirm = useCallback(() => {
//     // 모달 먼저 닫기
//     onCancel();
    
//     // 모달이 닫힌 후 전역 애니메이션 시작
//     setTimeout(() => {
//       triggerFlyingAnimation({
//         imageUrl: options.image_url,
//         quantity: purchaseResult?.quantity || 1,
//         startPoint: { type: 'position', value: 'center-bottom' },
//         endPoint: { type: 'element', value: '#gem-counter' }, // 보석 카운터로 날아감
//         animationPreset: 'gem-burst', // 원하는 프리셋 선택 가능
//         duration: 1.2,
//         delay: 0.1,
//         onStart: () => {
//           console.log('💎 보석 애니메이션 시작!');
//         },
//         onComplete: () => {
//           // 애니메이션 완료 후 카운트 업데이트
//           setUserProfile(prevProfile => ({...prevProfile, gem_cnt: purchaseResult?.total_gems}));
//           console.log('✅ 보석 애니메이션 완료!');
//         }
//       });
//     }, 300); // 모달 닫히는 애니메이션 후
//   }, [purchaseResult, options, setUserProfile, onCancel, triggerFlyingAnimation]);

//   return (
//     <div className="">
//       <div className="
//         flex flex-col gap-[30px]
//         max-h-[calc(90vh-47px)] h-full
//         p-[20px] pt-[40px] pb-[105px]
//         overflow-y-auto
//       ">
//         <div className="flex flex-col items-center justify-center gap-[10px]">
//           {isLoading && (
//             <>
//               <div className="flex items-center justify-center w-[80px] h-[80px]">
//                 <div className="animate-spin rounded-full h-[40px] w-[40px] border-b-2 border--primary-main-600"></div>
//               </div>
//               <div className="text-[18px] font-[700] text-[#111]">스토어 결제 진행 중...</div>
//             </>
//           )}

//           {error && (
//             <>
//               <div className="text-[48px]">❌</div>
//               <div className="text-[18px] font-[700] text-[#FF3B30]">결제 실패</div>
//             </>
//           )}

//           {purchaseResult?.verified && (
//             <>
//               <img src={options.image_url} alt="" className="w-[80px] h-[80px]" />
//               <div className="text-[18px] font-[700] text-[#111] text-center">
//                 <strong className="text--primary-main-600">보석 {purchaseResult?.gem_added}개</strong>를 구매 완료!
//               </div>
//             </>
//           )}
//         </div>
        
//         <div className="
//           absolute bottom-0 left-0 right-0
//           flex items-center justify-between gap-[15px] p-[20px]
//           bg-[#fff]/80 backdrop-blur-[1px]
//         ">
//           <motion.button 
//             className={`
//               flex-1
//               h-[45px]
//               rounded-[8px]
//               text-[#fff] text-[16px] font-[700]
//               bg--primary-main-600
//             `}
//             onClick={purchaseResult?.verified ?  onConfirm : onCancel}
//             whileTap={{ scale: 0.95 }}
//             transition={{ 
//               type: "spring", 
//               stiffness: 500, 
//               damping: 15
//             }}
//             disabled={isLoading}
//           >
//             {isLoading ? (
//               <span className="flex items-center justify-center gap-[6px] text-[24px]">
//                 <motion.span
//                   animate={{ y: [0, -4, 0] }}
//                   transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }}
//                 >•</motion.span>
//                 <motion.span
//                   animate={{ y: [0, -4, 0] }}
//                   transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut", delay: 0.25 }}
//                 >•</motion.span>
//                 <motion.span
//                   animate={{ y: [0, -4, 0] }}
//                   transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
//                 >•</motion.span>
//               </span>
//             ) : (
//               <span className="text-[16px] font-[700] text-[#fff]">확인</span>
//             )}
//           </motion.button>
//         </div>
//       </div>
//     </div>
//   );
// }; 