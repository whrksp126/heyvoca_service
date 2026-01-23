import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { vibrate } from '../../utils/osFunction';
import { uploadQuizletApi } from '../../api/voca';

export const UploadQuizletNewBottomSheet = ({ onCancel, onUpload }) => {
  const textAreaRef = useRef(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async () => {
    const quizletText = textAreaRef.current?.value || text;
    if (!quizletText.trim() || isUploading) {
      return;
    }

    try {
      setIsUploading(true);
      const result = await uploadQuizletApi(quizletText, title);

      // console.log("result: ", result);
      if (result && result.code === 200) {
        // 백엔드에서 생성된 단어장 데이터를 콜백으로 전달
        if (onUpload && result.data) {
          onUpload(result.data);
        }
      } else {
        // 에러 처리
        console.error('퀴즐렛 업로드 실패:', result);
        const errorMessage = result?.message || result?.error || `업로드에 실패했습니다. (코드: ${result?.code || '알 수 없음'})`;
        alert(errorMessage);
      }
    } catch (error) {
      console.error('퀴즐렛 업로드 오류:', error);
      alert('업로드 중 오류가 발생했습니다.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="">
      <div className="flex items-center justify-center p-[20px] pb-[0px]">
        <h1 className="text-[18px] font-[700]">퀴즐렛 텍스트 업로드</h1>
      </div>

      <div className="flex flex-col gap-[15px] p-[20px]">
        <div className="flex flex-col gap-[8px]">
          <h3 className="text-[14px] font-[700] text-[#111] dark:text-[#fff]">단어장 이름</h3>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="단어장 이름을 입력하세요"
            className="
              w-full h-[45px]
              px-[15px]
              border-[1px] border-[#ccc] rounded-[8px]
              font-[400] text-[14px] text-[#111]
              outline-none
              focus:border-[#FF8DD4]
              transition-colors
            "
          />
        </div>
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
            placeholder="예시:&#10;apple, 사과&#10;banana, 바나나&#10;orange, 오렌지"
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
          disabled={!text.trim() || isUploading}
          onClick={() => {
            vibrate({ duration: 5 });
            handleUpload();
          }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 500, damping: 15 }}
        >
          {isUploading ? '업로드 중...' : '업로드'}
        </motion.button>
      </div>
    </div>
  );
};