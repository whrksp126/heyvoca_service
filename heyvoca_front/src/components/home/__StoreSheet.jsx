// import React from 'react';
// import { useFullSheet } from '../../context/FullSheetContext';
// import { CaretLeft } from '@phosphor-icons/react';
// import { motion } from 'framer-motion';
// import gem from '../../assets/images/gem.png';
// import { useUser } from '../../context/UserContext';
// import { useStoreBuyItemBottomSheet } from './StoreBuyItemBottomSheet';

// const StoreSheet = () => {
//   const { handleBack } = useFullSheet();
//   const { gemItems } = useUser();
//   const { userProfile } = useUser();
//   const { showStoreBuyItemBottomSheet } = useStoreBuyItemBottomSheet();

//   const handleGemClick = (id) => {
//     window.ReactNativeWebView.postMessage(JSON.stringify({'type': 'iapPurchase', 'props': {itemId: id}}));
//     showStoreBuyItemBottomSheet({options: {productId: id, image_url: gemItems.find(gem => gem.product_id === id).image_url}})
//   }

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
//         ">상점</h1>
//         <div
//           className="
//             absolute top-[18px] right-[10px]
//             flex items-center gap-[4px]
//             text-[#CCC] dark:text-layout-white
//           "
//         >
//           <div 
//             id="gem-counter" 
//             className="flex gap-[5px] items-center"
//           >
//             <img src={gem} alt="보석" className="w-[20px] h-[18px]" />
//             <span className="text-layout-black text-[16px] font-bold">{userProfile.gem_cnt}</span>
//           </div>
//         </div>
//       </div>

//       <div className="flex items-start justify-center h-full gap-[10px] p-[16px]">
//         {gemItems.map((gem) => (
//         <div key={gem.id} className="relative flex flex-col items-center justify-center gap-[10px] flex-1"
//         onClick={() => handleGemClick(gem.product_id)}
//         >
//           <img src={gem.image_url} alt="" className="w-[80px] h-[80px]" />
//           {gem.bonus > 0 && (
//           <div className="absolute top-[5px] right-[5px] flex items-center justify-center w-[25px] h-[25px] rounded-[500px] bg-primary-main-600">
//             <span className="text-[10px] font-[600] text-layout-white">+{gem.bonus}</span>
//           </div>
//           )}
//           <div className="flex flex-col gap-[3px]">
//             <h1 className="text-[14px] font-[600] text-layout-black">{gem.name}</h1>
//             <span className="text-center text-[14px] font-[700] text-primary-main-600">₩ {gem.price}</span>
//           </div>
//         </div>
//         ))}
//       </div>

//     </div>
//   );
// };

// export default StoreSheet; 