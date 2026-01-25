import React, { createContext, useContext, useReducer } from 'react';

export const OverlayStateContext = createContext(undefined);
export const OverlayActionsContext = createContext(undefined);

const generateId = () => {
    return Math.random().toString(36).substr(2, 9);
};

const overlayReducer = (state, action) => {
    switch (action.type) {
        case 'PUSH_OVERLAY':
            return {
                ...state,
                queue: [...state.queue, action.payload]
            };
        case 'POP_OVERLAY':
            return {
                ...state,
                queue: state.queue.slice(1)
            };
        case 'RESOLVE_CURRENT':
            const current = state.queue[0];
            if (current?.resolve) {
                current.resolve(action.payload.value);
            }
            return state;
        default:
            return state;
    }
};

export const OverlayContextProvider = ({ children }) => {
    const [state, dispatch] = useReducer(overlayReducer, { queue: [] });

    // 큐의 첫 번째 항목이 현재 표시할 오버레이
    const currentOverlay = state.queue[0];

    const showOverlay = (component, props, options) => {
        dispatch({
            type: 'PUSH_OVERLAY',
            payload: {
                id: generateId(),
                component,
                props: props || {},
                options: options || {}
            }
        });
    };

    const hideOverlay = () => {
        dispatch({ type: 'POP_OVERLAY' });
    };

    const showAwaitOverlay = (component, props, options) => {
        return new Promise((resolve) => {
            dispatch({
                type: 'PUSH_OVERLAY',
                payload: {
                    id: generateId(),
                    component,
                    props: props || {},
                    options: options || {},
                    resolve
                }
            });
        });
    };

    const resolveOverlay = (value) => {
        dispatch({ type: 'RESOLVE_CURRENT', payload: { value } });
        dispatch({ type: 'POP_OVERLAY' });
    };

    const stateValue = {
        current: currentOverlay
    };

    const actionsValue = {
        showOverlay,
        hideOverlay,
        showAwaitOverlay,
        resolveOverlay
    };

    return (
        <OverlayStateContext.Provider value={stateValue}>
            <OverlayActionsContext.Provider value={actionsValue}>
                {children}
            </OverlayActionsContext.Provider>
        </OverlayStateContext.Provider>
    );
};

export const useOverlayState = () => {
    const context = useContext(OverlayStateContext);
    if (!context) {
        throw new Error('useOverlayState must be used within OverlayContextProvider');
    }
    return context;
};

export const useOverlayActions = () => {
    const context = useContext(OverlayActionsContext);
    if (!context) {
        throw new Error('useOverlayActions must be used within OverlayContextProvider');
    }
    return context;
};
