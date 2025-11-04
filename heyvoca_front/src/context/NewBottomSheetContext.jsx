import React, { createContext, useContext, useReducer } from 'react';

export const NewBottomSheetContext = createContext(undefined);
export const NewBottomSheetActionsContext = createContext(undefined);

// 고유 ID 생성 함수
const generateId = () => {
  return Math.random().toString(36).substr(2, 9);
};

const newBottomSheetReducer = (state, action) => {
  switch (action.type) {
    case 'OPEN_NEW_BOTTOM_SHEET': {
      return {
        stack: [{
          id: generateId(),
          component: action.payload.component,
          props: action.payload.props || {},
          options: {
            preserveState: true,
            preserveScroll: true,
            keepInDOM: true,
            ...action.payload.options
          },
          isActive: true
        }],
        activeIndex: 0
      };
    }

    case 'PUSH_NEW_BOTTOM_SHEET': {
      const hideUnderlying = !!action.payload.options?.hideUnderlying;
      const newStack = state.stack.map(item => ({ 
        ...item, 
        isActive: false,
        options: hideUnderlying ? { ...item.options, hidden: true } : item.options
      }));
      newStack.push({
        id: generateId(),
        component: action.payload.component,
        props: action.payload.props || {},
        options: {
          preserveState: true,
          preserveScroll: true,
          keepInDOM: true,
          ...action.payload.options
        },
        isActive: true
      });
      return {
        stack: newStack,
        activeIndex: newStack.length - 1
      };
    }

    case 'POP_NEW_BOTTOM_SHEET': {
      if (state.stack.length <= 1) {
        return { stack: [], activeIndex: -1 };
      }
      const updatedStack = state.stack.slice(0, -1);
      updatedStack[updatedStack.length - 1].isActive = true;
      return {
        stack: updatedStack,
        activeIndex: updatedStack.length - 1
      };
    }

    case 'GO_TO_NEW_BOTTOM_SHEET': {
      if (action.payload.index < 0 || action.payload.index >= state.stack.length) {
        return state;
      }
      const stackWithActive = state.stack.map((item, index) => ({
        ...item,
        isActive: index === action.payload.index
      }));
      return {
        stack: stackWithActive,
        activeIndex: action.payload.index
      };
    }

    case 'CLEAR_STACK':
      return { stack: [], activeIndex: -1 };

    case 'CLOSE_NEW_BOTTOM_SHEET':
      return { stack: [], activeIndex: -1 };

    case 'AWAIT_NEW_BOTTOM_SHEET': {
      return {
        stack: [{
          id: generateId(),
          component: action.payload.component,
          props: action.payload.props || {},
          options: {
            preserveState: true,
            preserveScroll: true,
            keepInDOM: true,
            ...action.payload.options
          },
          isActive: true,
          resolve: action.payload.resolve
        }],
        activeIndex: 0
      };
    }

    case 'PUSH_AWAIT_NEW_BOTTOM_SHEET': {
      const hideUnderlying = !!action.payload.options?.hideUnderlying;
      const newStack = state.stack.map(item => ({ 
        ...item, 
        isActive: false,
        options: hideUnderlying ? { ...item.options, hidden: true } : item.options
      }));
      newStack.push({
        id: generateId(),
        component: action.payload.component,
        props: action.payload.props || {},
        options: {
          preserveState: true,
          preserveScroll: true,
          keepInDOM: true,
          ...action.payload.options
        },
        isActive: true,
        resolve: action.payload.resolve
      });
      return {
        stack: newStack,
        activeIndex: newStack.length - 1
      };
    }

    case 'RESOLVE_NEW_BOTTOM_SHEET': {
      const currentNewBottomSheet = state.stack[state.activeIndex];
      if (currentNewBottomSheet?.resolve) {
        currentNewBottomSheet.resolve(action.payload.value);
      }
      
      // 현재 newBottomSheet만 제거하고 이전 newBottomSheet로 돌아가기
      const newStack = state.stack.filter((_, index) => index !== state.activeIndex);
      const newActiveIndex = newStack.length > 0 ? Math.max(0, state.activeIndex - 1) : -1;

      if (newActiveIndex >= 0) {
        // 활성화되는 항목을 다시 보이도록 변경
        newStack[newActiveIndex] = {
          ...newStack[newActiveIndex],
          isActive: true,
          options: { ...newStack[newActiveIndex].options, hidden: false }
        };
      }
      
      return { 
        stack: newStack, 
        activeIndex: newActiveIndex 
      };
    }

    default:
      return state;
  }
};

export const NewBottomSheetProvider = ({ children }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const [state, dispatch] = useReducer(newBottomSheetReducer, { stack: [], activeIndex: -1 });

  // React Compiler가 자동으로 useCallback 처리
  const openNewBottomSheet = (component, props, options) => {
    dispatch({ type: 'OPEN_NEW_BOTTOM_SHEET', payload: { component, props, options } });
  };

  const closeNewBottomSheet = () => {
    dispatch({ type: 'CLOSE_NEW_BOTTOM_SHEET' });
  };

  const pushNewBottomSheet = (component, props, options) => {
    dispatch({ type: 'PUSH_NEW_BOTTOM_SHEET', payload: { component, props, options } });
  };

  const popNewBottomSheet = () => {
    dispatch({ type: 'POP_NEW_BOTTOM_SHEET' });
  };

  const goToNewBottomSheet = (index) => {
    dispatch({ type: 'GO_TO_NEW_BOTTOM_SHEET', payload: { index } });
  };

  const clearStack = () => {
    dispatch({ type: 'CLEAR_STACK' });
  };

  const openAwaitNewBottomSheet = (component, props, options) => {
    return new Promise((resolve) => {
      dispatch({ type: 'AWAIT_NEW_BOTTOM_SHEET', payload: { component, props, options, resolve } });
    });
  };

  const pushAwaitNewBottomSheet = (component, props, options) => {
    return new Promise((resolve) => {
      dispatch({ type: 'PUSH_AWAIT_NEW_BOTTOM_SHEET', payload: { component, props, options, resolve } });
    });
  };

  const resolveNewBottomSheet = (value) => {
    dispatch({ type: 'RESOLVE_NEW_BOTTOM_SHEET', payload: { value } });
  };

  // React Compiler가 자동으로 useMemo 처리
  const stateValue = {
    stack: state.stack,
    activeIndex: state.activeIndex
  };

  const actionsValue = {
    openNewBottomSheet,
    closeNewBottomSheet,
    pushNewBottomSheet,
    popNewBottomSheet,
    goToNewBottomSheet,
    clearStack,
    openAwaitNewBottomSheet,
    pushAwaitNewBottomSheet,
    resolveNewBottomSheet
  };

  return (
    <NewBottomSheetContext.Provider value={stateValue}>
      <NewBottomSheetActionsContext.Provider value={actionsValue}>
        {children}
      </NewBottomSheetActionsContext.Provider>
    </NewBottomSheetContext.Provider>
  );
}; 

export const useNewBottomSheetContext = () => {
  const context = useContext(NewBottomSheetContext);
  if (!context) {
    throw new Error('useNewBottomSheetContext must be used within NewBottomSheetProvider');
  }
  return context;
};

export const useNewBottomSheetActions = () => {
  const context = useContext(NewBottomSheetActionsContext);
  if (!context) {
    throw new Error('useNewBottomSheetActions must be used within NewBottomSheetProvider');
  }
  return context;
}; 