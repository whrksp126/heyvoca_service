import React, { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNewBottomSheet } from '../../hooks/useNewBottomSheet';
import { showToast } from '../../utils/osFunction';
const SetWordExampleNewBottomSheet = ({examples, setType="add", exampleIndex=1, resolve}) => {
  const [examplesState, setExamplesState] = useState(examples || []);
  const exampleOriginInputRef = useRef(examples[exampleIndex - 1]?.origin || '');
  const exampleMeaningInputRef = useRef(examples[exampleIndex - 1]?.meaning || '');

  const { resolveNewBottomSheet } = useNewBottomSheet();
  // 저장 클릭 시
  const handleSave = useCallback(() => {
    const origin = exampleOriginInputRef.current?.value.trim() || '';
    const meaning = exampleMeaningInputRef.current?.value.trim() || '';
    if(origin === '' || meaning === '') {
      showToast('예문을 입력하세요');
      return;
    }
    resolveNewBottomSheet({
      cancelled: false,
      setType,
      exampleIndex,
      example: { origin, meaning }
    });
  }, []);

  // 취소 클릭 시
  const handleCancel = useCallback(() => {
    resolveNewBottomSheet({ cancelled: true });
  }, []);
  return (
    <div className="relative h-full">
      <div>
        <div className="left"></div>
        <div className="
          flex items-center justify-center
          p-[20px] pb-[0px]
          ">
          <h1 className="text-[18px] font-[700]">예문 {setType === "add" ? "추가" : "수정"}</h1>
        </div>
        <div className="right"></div>
      </div>
      <div className="
        flex flex-col gap-[15px]
        max-h-[calc(90vh-47px)] h-full
        p-[20px] pb-[105px]
        overflow-y-auto
      ">
        <div 
          className="
            flex justify-between flex-col gap-[8px]
          "
        >
          <h3 
            className="
              text-[14px] font-[700] text-[#111] 
            dark:text-[#fff]
            "
          >
            {exampleIndex}.
          </h3>
          <div>
            <textarea 
              ref={exampleOriginInputRef}
              defaultValue={setType === "add" ? '' : examplesState[exampleIndex - 1]?.origin}
              onChange={e => {
                e.target.style.height = '45px';
                e.target.style.height = `${Math.max(45, e.target.scrollHeight)}px`;
                exampleOriginInputRef.current.value = e.target.value;
              }}
              placeholder="예문을 입력하세요"
              className="
                w-full h-[45px] min-h-[45px] max-h-[135px]
                px-[15px] py-[10px]
                border-[1px] border-[#ccc] rounded-[8px]
                font-[400] text-[16px] text-[#111]
                outline-none
                focus:border-[#FF8DD4]
                transition-colors
                resize-none overflow-hidden
              "
            />
            <textarea 
              ref={exampleMeaningInputRef}
              defaultValue={setType === "add" ? '' : examplesState[exampleIndex - 1]?.meaning}
              onChange={e => {
                e.target.style.height = '45px';
                e.target.style.height = `${Math.max(45, e.target.scrollHeight)}px`;
                exampleMeaningInputRef.current.value = e.target.value;
              }}
              placeholder="의미를 입력하세요"
              className="
                w-full h-[45px] min-h-[45px] max-h-[135px]
                px-[15px] py-[10px]
                border-[1px] border-[#ccc] rounded-[8px]
                font-[400] text-[16px] text-[#111]
                outline-none
                focus:border-[#FF8DD4]
                transition-colors
                resize-none overflow-hidden
              "
            />

          </div>
        </div>
      </div>
      <div className="
        absolute bottom-0 left-0 right-0
        flex items-center justify-between gap-[15px] 
        p-[20px]
      ">
        <motion.button 
          className="
            flex-1
            h-[45px]
            rounded-[8px]
            bg-[#ccc]
            text-[#fff] text-[16px] font-[700]
          "
          onClick={handleCancel}
          whileTap={{ scale: 0.95 }}
          transition={{ 
            type: "spring", 
            stiffness: 500, 
            damping: 15
          }}
        >취소</motion.button>
        <motion.button 
          className="
            flex-1
            h-[45px]
            rounded-[8px]
            bg-[#FF8DD4]
            text-[#fff] text-[16px] font-[700]
          "
          onClick={() => {
            if(setType === "add") {
              setExamplesState([...examplesState, { 
                origin: exampleOriginInputRef.current.value,
                meaning: exampleMeaningInputRef.current.value
              }]);
            } else {
              setExamplesState(examplesState.map((example, index) => 
                index === exampleIndex - 1 ? {
                  ...example,
                  origin: exampleOriginInputRef.current.value,
                  meaning: exampleMeaningInputRef.current.value
                } : example
              ));
            }
            handleSave();
          }}
          whileTap={{ scale: 0.95 }}
          transition={{ 
            type: "spring", 
            stiffness: 500, 
            damping: 15
          }}
        >{setType === "add" ? "추가" : "수정"}</motion.button>
      </div>
    </div>
  );
};

export default SetWordExampleNewBottomSheet;


