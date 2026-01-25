# Overlay 시스템 가이드

Overlay 시스템은 화면 전체를 덮는 알림, 보상 애니메이션, 업적 달성 등 **비정형 레이어**를 처리하기 위해 설계되었습니다. BottomSheet나 FullSheet와 달리 독립적인 레이어 순서(z-index)를 가지며, 디자인의 제약 없이 표현이 가능합니다.

## 핵심 개념

1. **OverlayStateContext**: 현재 표시 중인 오버레이의 상태(컴포넌트, Props, 옵션 등)를 관리합니다.
2. **OverlayActionsContext**: 오버레이를 열고 닫는 액션을 제공합니다.
3. **OverlayProvider**: 오버레이가 실제로 렌더링되는 UI 컨테이너입니다. `AnimatePresence`를 통해 부드러운 전환을 지원합니다.

## 사용 방법

### 1. Hook 가져오기
```javascript
import { useOverlayActions } from '../../context/OverlayContext';
```

### 2. 오버레이 호출

#### 단순 호출 (`showOverlay`)
반환값이 필요 없는 경우에 사용합니다.
```javascript
const { showOverlay } = useOverlayActions();

showOverlay(MyRewardOverlay, { amount: 100 });
```

#### Promise 기반 호출 (`showAwaitOverlay`)
사용자의 동작(확인/취소)을 기다려야 하는 경우 사용합니다.
```javascript
const { showAwaitOverlay } = useOverlayActions();

const handleAction = async () => {
    const result = await showAwaitOverlay(MyConfirmOverlay, { message: '보상을 받으시겠습니까?' });
    if (result.confirmed) {
        // 처리 로직
    }
};
```

### 3. 오버레이 컴포넌트 내부에서 닫기
오버레이 컴포넌트는 `resolveOverlay`를 통해 자신을 닫고 결과를 전달할 수 있습니다.
```javascript
const MyRewardOverlay = ({ amount }) => {
    const { resolveOverlay } = useOverlayActions();

    return (
        <button onClick={() => resolveOverlay({ confirmed: true })}>
            확인
        </button>
    );
};
```

## 주의 사항
- 오버레이는 한 번에 **하나만** 표시하는 것을 기본으로 합니다. 새로운 오버레이가 호출되면 기존 오버레이는 교체됩니다.
- 복잡한 입력 폼보다는 **시각적 알림이나 연출** 목적으로 사용하는 것을 권장합니다.
