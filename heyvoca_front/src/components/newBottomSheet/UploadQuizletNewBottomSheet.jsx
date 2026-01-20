import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { vibrate } from '../../utils/osFunction';

export const UploadQuizletNewBottomSheet = ({ onCancel, onUpload }) => {
  const textAreaRef = useRef(null);
  const [text, setText] = useState('');

  const handleUpload = () => {
    const quizletText = textAreaRef.current?.value || '';
    if (quizletText.trim()) {
      onUpload(quizletText);
    }
  };

  return (
    <div className="">
      <div className="flex items-center justify-center p-[20px] pb-[0px]">
        <h1 className="text-[18px] font-[700]">퀴즐렛 텍스트 업로드</h1>
      </div>
      
      <div className="flex flex-col gap-[15px] p-[20px]">
        <div className="flex flex-col gap-[8px]">
          <h3 className="text-[14px] font-[700] text-[#111] dark:text-[#fff]">
            퀴즐렛 텍스트
          </h3>
          <p className="text-[12px] text-[#666]">
            퀴즐렛에서 복사한 텍스트를 붙여넣으세요
          </p>
          <textarea
            ref={textAreaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="예시:&#10;apple : 사과&#10;banana : 바나나&#10;orange : 오렌지"
            className="
              w-full h-[200px]
              p-[15px]
              border-[1px] border-[#ccc] rounded-[8px]
              font-[400] text-[14px] text-[#111]
              outline-none resize-none
              focus:border-[#FF8DD4]
              transition-colors
            "
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-[15px] p-[20px]">
        <motion.button 
          className="
            flex-1 h-[45px] rounded-[8px]
            bg-[#ccc]
            text-[#fff] text-[16px] font-[700]
          "
          onClick={() => {
            vibrate({ duration: 5 });
            onCancel();
          }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 500, damping: 15 }}
        >
          취소
        </motion.button>
        <motion.button 
          className="
            flex-1 h-[45px] rounded-[8px]
            bg-[#FF8DD4]
            text-[#fff] text-[16px] font-[700]
            disabled:bg-[#ccc] disabled:cursor-not-allowed
          "
          disabled={!text.trim()}
          onClick={() => {
            vibrate({ duration: 5 });
            handleUpload();
          }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 500, damping: 15 }}
        >
          업로드
        </motion.button>
      </div>
    </div>
  );
};