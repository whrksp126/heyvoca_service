// import React, { useCallback } from 'react';
// import { motion } from 'framer-motion';
// import { useNavigate } from 'react-router-dom';
// import { useNewBottomSheet } from '../../hooks/useNewBottomSheet';
// import { backendUrl, fetchDataAsync, setCookie } from '../../utils/common';
// import { useNewFullSheet } from '../../hooks/useNewFullSheet';
// import { useUser } from '../../context/UserContext';

// export const useLogoutBottomSheet = () => {
//   const { pushNewBottomSheet, popNewBottomSheet, clearStack: clearNewBottomSheetStack } = useNewBottomSheet();
//   const { clearStack: clearNewFullSheetStack } = useNewFullSheet();
//   const navigate = useNavigate();
//   const { setAuth } = useUser();

//   const handleClose = useCallback(() => {
//     popNewBottomSheet();
//   }, [popNewBottomSheet]);

//     const handleLogout = useCallback(async () => {
//       try {
//         // 로그아웃 API 호출
//         const url = `${backendUrl}/auth/logout`;
//         const method = 'POST';
//         const fetchData = {};
        
//         const result = await fetchDataAsync(url, method, fetchData);
//         if (result.code !== 200) {
//           alert('로그아웃 중 오류가 발생하였습니다.');
//           return;
//         }
        
//         // 쿠키에서 accessToken 제거
//         setCookie('userAccessToken', '', -1); // 쿠키 즉시 만료
        
//         // auth 상태 초기화
//         setAuth({
//           user: null,
//         });
        
//         // 컨텍스트 초기화
//         clearNewBottomSheetStack();
//         clearNewFullSheetStack();
        
//         // 로그인 페이지로 이동
//         navigate('/login');
        
//       } catch (error) {
//         console.error('로그아웃 실패:', error);
//         alert('로그아웃 중 오류가 발생하였습니다.');
//       }
//     }, [navigate, setAuth, clearNewBottomSheetStack, clearNewFullSheetStack]);

//   const showLogOutBottomSheet = useCallback(() => {
//     pushNewBottomSheet(
//       LogoutBottomSheet,
//       {
//         onCancel: handleClose,
//         onLogout: handleLogout
//       }
//     );
//   }, [pushNewBottomSheet, handleClose, handleLogout]);

//   return {
//     showLogOutBottomSheet,
//   }
// };

// export const LogoutBottomSheet = ({ onCancel, onLogout }) => {
//   return (
//     <div className="">
//       <div className="
//         flex flex-col gap-[15px] items-center justify-center 
//         pt-[40px] px-[20px] pb-[10px]
//       ">
//         <h3 className="text-[18px] font-[700]">정말 로그아웃 하시겠어요?</h3>
//         <p className="text-[14px] font-[400] text-[#111]">단어 공부를 포기하지 마세요..😢</p>
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
//             bg-[#FF8DD4]
//             text-[#fff] text-[16px] font-[700]
//           "
//           onClick={onLogout}
//           whileTap={{ scale: 0.95 }}
//           transition={{ 
//             type: "spring", 
//             stiffness: 500, 
//             damping: 15
//           }}
//         >로그아웃</motion.button>
//       </div>
//     </div>
//   );
// };