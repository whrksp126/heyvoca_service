import { useContext } from 'react';
import { NewBottomSheetContext, NewBottomSheetActionsContext } from '../context/NewBottomSheetContext';

export const useNewBottomSheet = () => {
  const state = useContext(NewBottomSheetContext);
  const actions = useContext(NewBottomSheetActionsContext);
  
  if (!state || !actions) {
    throw new Error('useNewBottomSheet must be used within NewBottomSheetProvider');
  }
  
  return {
    ...state,
    ...actions,
    // 편의 함수들
    isNewBottomSheetOpen: state.stack.length > 0,
    currentNewBottomSheet: state.stack[state.activeIndex],
    stackLength: state.stack.length
  };
}; 