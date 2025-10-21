import { useContext } from 'react';
import { NewFullSheetContext } from '../context/NewFullSheetContext';

export const useNewFullSheet = () => {
  const context = useContext(NewFullSheetContext);
  if (!context) {
    throw new Error('useNewFullSheet must be used within NewFullSheetProvider');
  }
  
  return {
    ...context,
    // 편의 함수들
    isNewFullSheetOpen: context.stack.length > 0,
    currentNewFullSheet: context.stack[context.activeIndex],
    stackLength: context.stack.length
  };
}; 