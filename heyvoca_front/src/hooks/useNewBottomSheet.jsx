import { useContext } from 'react';
import { NewBottomSheetContext } from '../context/NewBottomSheetContext';

export const useNewBottomSheet = () => {
  const context = useContext(NewBottomSheetContext);
  if (!context) {
    throw new Error('useNewBottomSheet must be used within NewBottomSheetProvider');
  }
  
  return {
    ...context,
    // 편의 함수들
    isNewBottomSheetOpen: context.stack.length > 0,
    currentNewBottomSheet: context.stack[context.activeIndex],
    stackLength: context.stack.length
  };
}; 