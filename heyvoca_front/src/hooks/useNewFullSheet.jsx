import { useContext } from 'react';
import { NewFullSheetContext, NewFullSheetActionsContext } from '../context/NewFullSheetContext';

export const useNewFullSheet = () => {
  const state = useContext(NewFullSheetContext);
  const actions = useContext(NewFullSheetActionsContext);
  
  if (!state || !actions) {
    throw new Error('useNewFullSheet must be used within NewFullSheetProvider');
  }
  
  return {
    ...state,
    ...actions,
    // 편의 함수들
    isNewFullSheetOpen: state.stack.length > 0,
    currentNewFullSheet: state.stack[state.activeIndex],
    stackLength: state.stack.length
  };
}; 