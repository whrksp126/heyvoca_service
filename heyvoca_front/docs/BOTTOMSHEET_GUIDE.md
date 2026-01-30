# BottomSheet 시스템 가이드 (NewBottomSheet)

이 문서는 `heyvoca` 프로젝트에서 공통적으로 사용되는 바텀시트(`newBottomSheet`) 시스템의 구조와 사용법을 설명합니다. 새로운 바텀시트를 추가하거나 기존 바텀시트를 수정할 때 이 가이드를 참고하세요.

## 1. 시스템 개요
`newBottomSheet` 시스템은 Context API와 Promise 패턴을 결합하여, 명령형(Imperative) 방식으로 바텀시트를 호출하고 결과를 받아올 수 있도록 설계되었습니다.

- **위치**: `src/components/newBottomSheet/`
- **핵심 기술**: React Context, `framer-motion` (애니메이션), `react-dom/createPortal`

## 2. 핵심 파일 구조

### 📂 `src/context/NewBottomSheetContext.jsx` (로직)
바텀시트의 상태(`stack`)와 관리 액션을 정의합니다.
- `stack`: 현재 열려 있는 바텀시트들의 배열 (중첩 가능).
- `activeIndex`: 현재 활성화된(보이는) 바텀시트의 인덱스.
- **주요 액션**:
  - `pushNewBottomSheet(Component, props, options)`: 새 바텀시트를 스택에 추가.
  - `popNewBottomSheet()`: 최상단 바텀시트를 닫음.
  - `pushAwaitNewBottomSheet(Component, props, options)`: **Promise를 반환**하며, 바텀시트에서 `resolveNewBottomSheet(value)`가 호출될 때까지 대기합니다. (가장 많이 사용됨)

### 📂 `src/components/newBottomSheet/NewBottomSheetProvider.jsx` (UI)
스택에 담긴 바텀시트들을 실제로 화면에 렌더링하는 컴포넌트입니다.
- `AnimatePresence`를 사용하여 등장/퇴장 애니메이션을 처리합니다.
- `createPortal`을 통해 `document.body` 하단에 렌더링되어 z-index 문제를 방지합니다.

---

## 3. 새로운 바텀시트 만들기 (Step-by-Step)

### Step 1: 컴포넌트 파일 생성
`src/components/newBottomSheet/` 폴더에 `[이름]NewBottomSheet.jsx` 형식으로 파일을 생성합니다.

```jsx
import React from 'react';
import { motion } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';

export const ExampleNewBottomSheet = ({ title, content }) => {
  "use memo";
  const { resolveNewBottomSheet } = useNewBottomSheetActions();

  // 결과를 반환하고 닫기
  const handleConfirm = () => {
    resolveNewBottomSheet(true);
  };

  const handleCancel = () => {
    resolveNewBottomSheet(false);
  };

  return (
    <div className="relative">
      {/* 컨텐츠 구역 */}
      <div className="flex flex-col gap-[10px] p-[20px] pb-[100px] overflow-y-auto max-h-[70vh]">
        <h3 className="text-[18px] font-bold text-center">{title}</h3>
        <p className="text-center">{content}</p>
      </div>

      {/* 하단 버튼 구역 (고정) */}
      <div className="absolute bottom-0 left-0 right-0 p-[20px] flex gap-[10px] bg-white">
        <button className="flex-1 h-[45px] bg-gray-200 rounded-lg" onClick={handleCancel}>취소</button>
        <button className="flex-1 h-[45px] bg-[#FF8DD4] text-white rounded-lg font-bold" onClick={handleConfirm}>확인</button>
      </div>
    </div>
  );
};
```

### Step 2: 바텀시트 호출하기
호출하는 쪽(페이지 또는 컴포넌트)에서 `useNewBottomSheetActions` 훅을 사용합니다.

```jsx
import { useNewBottomSheetActions } from '../context/NewBottomSheetContext';
import { ExampleNewBottomSheet } from '../components/newBottomSheet/ExampleNewBottomSheet';

const MyComponent = () => {
  const { pushAwaitNewBottomSheet } = useNewBottomSheetActions();

  const handleOpen = async () => {
    // 바텀시트를 열고 사용자의 입력을 기다림
    const result = await pushAwaitNewBottomSheet(
      ExampleNewBottomSheet,
      { 
        title: "알림", 
        content: "정말로 삭제하시겠습니까?" 
      },
      { 
        isBackdropClickClosable: true,
        isDragToCloseEnabled: true 
      }
    );

    if (result) {
      console.log("사용자가 확인을 눌렀습니다.");
    } else {
      console.log("사용자가 취소했거나 배경을 눌러 닫았습니다.");
    }
  };

  return <button onClick={handleOpen}>바텀시트 열기</button>;
};
```

---

## 4. 디자인 컨벤션 및 팁

1.  **레이아웃**: 기본적으로 `NewBottomSheetProvider`가 하얀색 배경, 상단 라운드(`rounded-t-2xl`), 그리고 **하단 세이프 에어리아 공간(`var(--safe-area-bottom)`)**을 제공합니다. 개별 컴포넌트 내부에서는 컨텐츠를 구성할 때 하단 버튼 공간을 고려하여 `pb-[100px]` 정도의 패딩을 주는 것이 좋습니다.
2.  **애니메이션**: `framer-motion`의 `motion.button` 등을 활용하여 `whileTap={{ scale: 0.95 }}` 같은 마이크로 인터랙션을 추가하면 더 고품질의 UX를 제공할 수 있습니다.
3.  **데이터 전달**: 
    - 호출 시 전달하는 `props`는 컴포넌트의 인자로 들어옵니다.
    - 닫을 때 전달하는 `resolveNewBottomSheet(value)`의 `value`는 호출한 곳의 `await` 결과값으로 반환됩니다.
4.  **옵션 (`options`)**:
    - `isBackdropClickClosable`: 배경 클릭 시 닫기 여부 (기본 true)
    - `isDragToCloseEnabled`: 아래로 드래그해서 닫기 활성화 여부 (기본 false이나 추천)
    - `hideUnderlying`: 새 바텀시트가 뜰 때 아래 깔린 이전 바텀시트를 숨길지 여부.

## 5. 기존 코드 수정 시 주의사항
- `src/context/NewBottomSheetContext.jsx`의 리듀서 로직을 수정할 때는 `stack` 배열의 불변성을 유지해야 합니다.
- `resolveNewBottomSheet`는 내부적으로 `POP` 액션을 수행하므로, 별도로 `popNewBottomSheet`를 호출할 필요가 없습니다.
