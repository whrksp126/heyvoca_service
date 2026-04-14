import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, Reorder, useDragControls } from 'framer-motion';
import { Eye, EyeSlash, Minus, Plus, CaretUpDown } from '@phosphor-icons/react';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { vibrate } from '../../utils/osFunction';

const PlaybackOrderItem = ({ item, onLongPressStart, onLongPressEnd }) => {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      className="
        flex items-center gap-[10px]
        h-[60px]
        px-[15px] py-[15px]
        bg-layout-gray-50
        rounded-[10px]
        list-none touch-none
      "
      whileDrag={{ scale: 1.02, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
    >
      <div
        data-drag-handle
        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); controls.start(e); }}
        className="touch-none cursor-grab active:cursor-grabbing"
      >
        <CaretUpDown size={14} weight="fill" className="text-layout-gray-200" />
      </div>

      <span className="flex-1 text-[16px] font-[700] text-layout-black dark:text-layout-white">
        {item.label}
      </span>

      <div className="flex items-center gap-[8px]">
        <motion.button
          className={`
            flex items-center justify-center w-[32px] h-[32px]
            border-[1px] rounded-[8px] select-none touch-none
            ${item.count <= 0
              ? 'border-layout-gray-200 text-layout-gray-200'
              : 'border-primary-main-600 text-primary-main-600'
            }
          `}
          onPointerDown={(e) => { e.stopPropagation(); onLongPressStart(item.id, -1); }}
          onPointerUp={onLongPressEnd}
          onPointerCancel={onLongPressEnd}
          onPointerLeave={onLongPressEnd}
          drag={false}
        >
          <Minus size={14} />
        </motion.button>

        <span className="w-[24px] text-center text-[16px] font-[700] text-primary-main-600">
          {item.count}
        </span>

        <motion.button
          className={`
            flex items-center justify-center w-[32px] h-[32px]
            border-[1px] rounded-[8px] select-none touch-none
            ${item.count >= 9
              ? 'border-layout-gray-200 text-layout-gray-200'
              : 'border-primary-main-600 text-primary-main-600'
            }
          `}
          onPointerDown={(e) => { e.stopPropagation(); onLongPressStart(item.id, 1); }}
          onPointerUp={onLongPressEnd}
          onPointerCancel={onLongPressEnd}
          onPointerLeave={onLongPressEnd}
          drag={false}
        >
          <Plus size={14} />
        </motion.button>
      </div>
    </Reorder.Item>
  );
};

export const StudySettingsNewBottomSheet = ({ onCancel, onSet, initialSettings }) => {
  "use memo";

  const { popNewBottomSheet } = useNewBottomSheetActions();

  const [visibility, setVisibility] = useState({ ...initialSettings.visibility });
  const [playbackOrder, setPlaybackOrder] = useState([...initialSettings.playbackOrder]);

  const longPressIntervalRef = useRef(null);
  const longPressTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (longPressIntervalRef.current) clearInterval(longPressIntervalRef.current);
      if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);
    };
  }, []);

  const handleLongPressStart = useCallback((itemId, incrementValue) => {
    if (longPressIntervalRef.current) clearInterval(longPressIntervalRef.current);
    if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);

    setPlaybackOrder(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const newCount = Math.min(9, Math.max(0, item.count + incrementValue));
      if (newCount !== item.count) vibrate({ duration: 5 });
      return { ...item, count: newCount };
    }));

    longPressTimeoutRef.current = setTimeout(() => {
      longPressIntervalRef.current = setInterval(() => {
        setPlaybackOrder(prev => prev.map(item => {
          if (item.id !== itemId) return item;
          const newCount = Math.min(9, Math.max(0, item.count + incrementValue));
          if (newCount !== item.count) vibrate({ duration: 5 });
          return { ...item, count: newCount };
        }));
      }, 100);
    }, 500);
  }, []);

  const handleLongPressEnd = useCallback(() => {
    if (longPressIntervalRef.current) {
      clearInterval(longPressIntervalRef.current);
      longPressIntervalRef.current = null;
    }
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  }, []);

  const handleToggleVisibility = (key) => {
    vibrate({ duration: 5 });
    setVisibility(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = () => {
    vibrate({ duration: 5 });
    onSet?.({ visibility, playbackOrder });
    popNewBottomSheet();
  };

  const handleCancel = () => {
    vibrate({ duration: 5 });
    onCancel?.();
    popNewBottomSheet();
  };

  const visibilityItems = [
    { key: 'word', label: '단어 보이기' },
    { key: 'meanings', label: '의미 보이기' },
    { key: 'exampleSentences', label: '예문 문장 보이기' },
    { key: 'exampleMeanings', label: '예문 뜻 보이기' },
  ];

  return (
    <div className="relative bg-layout-white dark:bg-layout-black">
      <div className="overflow-y-auto scrollbar-hide max-h-[calc(90vh-47px)] pt-[20px] pb-[115px] px-[20px]">
        <h2 className="text-[18px] font-[700] line-height-[21px] text-center text-layout-black dark:text-layout-white mb-[30px]">
          학습 설정
        </h2>

        <p className="text-[14px] font-[600] line-height-[17px] text-layout-black dark:text-layout-white text-center mb-[15px]">
          표시 설정
        </p>
        <div className="flex flex-col gap-[10px] mb-[30px]">
          {visibilityItems.map(({ key, label }) => {
            const isVisible = visibility[key];
            return (
              <motion.button
                key={key}
                onClick={() => handleToggleVisibility(key)}
                className={`
                  flex items-center justify-between
                  w-full h-[45px] px-[15px]
                  rounded-[8px] border-[1px]
                  ${isVisible
                    ? 'border-primary-main-600 text-primary-main-600'
                    : 'border-layout-gray-200 text-layout-gray-200'
                  }
                `}
                whileTap={{ scale: 0.97 }}
              >
                <span className="text-[16px] font-[700] line-height-[19px]">{label}</span>
                {isVisible
                  ? <Eye size={18} weight="fill" />
                  : <EyeSlash size={18} />
                }
              </motion.button>
            );
          })}
        </div>

        <p className="text-[14px] font-[600] text-layout-black dark:text-layout-white text-center mb-[14px]">
          음성 재생 순서
        </p>
        <Reorder.Group
          axis="y"
          values={playbackOrder}
          onReorder={setPlaybackOrder}
          className="flex flex-col gap-[10px] p-0 m-0 list-none"
        >
          {playbackOrder.map((item) => (
            <PlaybackOrderItem
              key={item.id}
              item={item}
              onLongPressStart={handleLongPressStart}
              onLongPressEnd={handleLongPressEnd}
            />
          ))}
        </Reorder.Group>
      </div>

      <div className="absolute bottom-0 left-0 right-0 flex gap-[10px] px-[20px] pt-[30px] pb-[20px] bg-gradient-to-b from-transparent to-layout-white dark:to-layout-black pointer-events-none">
        <div className="flex gap-[10px] w-full pointer-events-auto">
          <motion.button
            onClick={handleCancel}
            className="flex-1 h-[45px] rounded-[8px] bg-layout-gray-200 text-layout-white text-[16px] font-[700]"
            whileTap={{ scale: 0.95 }}
          >
            취소
          </motion.button>
          <motion.button
            onClick={handleSave}
            className="flex-1 h-[45px] rounded-[8px] bg-primary-main-600 text-layout-white text-[16px] font-[700]"
            whileTap={{ scale: 0.95 }}
          >
            저장
          </motion.button>
        </div>
      </div>
    </div>
  );
};
