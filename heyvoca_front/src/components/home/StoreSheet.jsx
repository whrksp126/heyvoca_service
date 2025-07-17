import React from 'react';
import { useFullSheet } from '../../context/FullSheetContext';
import { CaretLeft } from '@phosphor-icons/react';
import { motion } from 'framer-motion';

import gem10 from '../../assets/images/보석 10개.png';
import gem35 from '../../assets/images/보석 35개.png';
import gem110 from '../../assets/images/보석 110개.png';
import 보석 from '../../assets/images/보석.png';

const gems = [
  {
    id: 1,
    name: '보석 10개',
    price: 1100,
    bonus: 0,
    image: gem10
  },
  {
    id: 2,
    name: '보석 35개',
    price: 3300,
    bonus: 5,
    image: gem35
  },
  {
    id: 3,
    name: '보석 110개',
    price: 9900,
    bonus: 10,
    image: gem110
  }
]

const StoreSheet = () => {
  const { handleBack } = useFullSheet();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="
        relative
        flex items-center justify-center
        h-[55px] 
        pt-[20px] px-[10px] pb-[14px]
      ">
        
        <motion.button
          onClick={handleBack}
          className="
            absolute top-[18px] left-[10px]
            flex items-center gap-[4px]
            text-[#CCC] dark:text-[#fff]
            p-[4px]
            rounded-[8px]
          "
          whileHover={{ 
            backgroundColor: 'rgba(0, 0, 0, 0.05)',
            scale: 1.05
          }}
          whileTap={{ 
            scale: 0.95,
            backgroundColor: 'rgba(0, 0, 0, 0.1)'
          }}
          transition={{ 
            type: "spring", 
            stiffness: 400, 
            damping: 17
          }}
        >
          <CaretLeft size={24} />
        </motion.button>
        <h1 className="
          text-[18px] font-[700]
          text-[#111] dark:text-[#fff]
        ">상점</h1>
        <div
          className="
            absolute top-[18px] right-[10px]
            flex items-center gap-[4px]
            text-[#CCC] dark:text-[#fff]
          "
        >
          <div className="flex gap-[5px] items-center">
            <img src={보석} alt="보석" className="w-[20px] h-[18px]" />
            <span className="text-[#111] text-[16px] font-bold">50</span>
          </div>
        </div>
      </div>

      <div className="flex items-start justify-center h-full gap-[10px] p-[16px]">
        {gems.map((gem) => (
        <div key={gem.id} className="relative flex flex-col items-center justify-center gap-[10px] flex-1">
          <img src={gem.image} alt="" className="w-[80px] h-[80px]" />
            {gem.bonus > 0 && (
          <div className="absolute top-[5px] right-[5px] flex items-center justify-center w-[25px] h-[25px] rounded-[500px] bg-[#FF8DD4]">
            <span className="text-[10px] font-[600] text-[#fff]">+{gem.bonus}</span>
          </div>
            )}
          <div className="flex flex-col gap-[3px]">
            <h1 className="text-[14px] font-[600] text-[#111]">{gem.name}</h1>
            <span className="text-center text-[14px] font-[700] text-[#FF8DD4]">₩ {gem.price}</span>
          </div>
        </div>
        ))}
      </div>

    </div>
  );
};

export default StoreSheet; 