# FullSheet 시스템 가이드 (NewFullSheet)

이 문서는 `heyvoca` 프로젝트에서 전체 화면을 덮는 시트(`newFullSheet`) 시스템의 구조와 사용법을 설명합니다.

## 1. 시스템 개요
`newFullSheet` 시스템은 바텀시트(`newBottomSheet`)와 동일한 철학(Context API + Promise 패턴)으로 설계되었으나, 화면 하단이 아닌 **오른쪽에서 왼쪽으로 슬라이드**되며 전체 화면을 차지합니다. 주로 설정, 상세 정보, 복잡한 폼 입력 등 독립적인 화면 흐름이 필요할 때 사용합니다.

- **위치**: `src/components/newFullSheet/`
- **핵심 기술**: React Context, `framer-motion` (x축 슬라이드 애니메이션), `react-dom/createPortal`

## 2. 핵심 파일 구조

### 📂 `src/context/NewFullSheetContext.jsx` (로직)
- `pushNewFullSheet(Component, props, options)`: 새 풀시트를 추가합니다.
- `pushAwaitNewFullSheet(Component, props, options)`: **Promise를 반환**하며, 풀시트 내부에서 `resolveNewFullSheet(value)` 호출 시 결과값을 반환하고 닫힙니다.

### 📂 `src/components/newFullSheet/NewFullSheetProvider.jsx` (UI)
- `AnimatePresence`를 통해 슬라이드 애니메이션(`x: 100%` -> `0`)을 처리합니다.
- `fixed inset-0` 및 `z-50` 설정을 통해 화면 전체를 덮습니다.

---

## 3. 풀시트 컴포넌트 표준 스택 (Example)

전체 화면을 사용하므로 상태 표시줄 고정 영역 처리가 중요합니다.

```jsx
import React from 'react';
import { CaretLeft } from '@phosphor-icons/react';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { motion } from 'framer-motion';

export const ExampleFullSheet = ({ title }) => {
  "use memo";
  const { popNewFullSheet, resolveNewFullSheet } = useNewFullSheetActions();

  return (
    <div className="flex flex-col h-full w-full bg-white">
      {/* 상태 표시줄 대응 영역 */}
      <div style={{ paddingTop: 'var(--status-bar-height)' }} className="bg-white" />
      
      {/* 표준 헤더 */}
      <header className="relative flex items-center h-[55px] px-[16px]">
        <motion.button
          onClick={() => popNewFullSheet()}
          whileTap={{ scale: 0.9 }}
          className="p-2"
        >
          <CaretLeft size={24} color="#111" />
        </motion.button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[18px] font-bold">
          {title}
        </h1>
      </header>

      {/* 스크롤 가능한 컨텐츠 구역 */}
      <main className="flex-1 overflow-y-auto p-[16px]">
        {/* 컨텐츠 내용 */}
      </main>
    </div>
  );
};
```

---

## 4. 바텀시트 호출 및 데이터 수신

```jsx
import { useNewFullSheetActions } from '../context/NewFullSheetContext';
import { ExampleFullSheet } from '../components/newFullSheet/ExampleFullSheet';

const MyPage = () => {
  const { pushAwaitNewFullSheet } = useNewFullSheetActions();

  const handleOpenInfo = async () => {
    // 풀시트 호출 및 결과 대기
    const result = await pushAwaitNewFullSheet(
      ExampleFullSheet,
      { title: "상세 설정" }
    );
    
    if (result?.success) {
      // 결과 처리 로직
    }
  };

  return <button onClick={handleOpenInfo}>상세 보기</button>;
};
```

---

## 5. 주의사항 및 팁

1.  **Z-Index**: 풀시트(`z-50`)는 바텀시트(`z-[1000]`)보다 낮은 우선순위를 가질 수 있으므로, 필요한 경우 `NewFullSheetProvider`의 z-index 설정을 확인하세요. (일반적으로 풀시트 위에 바텀시트가 뜰 수 있는 구조가 권장됩니다.)
2.  **상태 표시줄**: 앱 환경에서 헤더가 겹치지 않도록 `var(--status-bar-height)` 패딩을 반드시 포함해야 합니다.
3.  **애니메이션**: 기본 슬라이드 외에 컴포넌트 내부 요소에 `framer-motion`을 적용하여 생동감 있는 UI를 구성하세요.
4.  **Promise 반환**: 단순 닫기는 `popNewFullSheet()`, 결과 전달과 함께 닫기는 `resolveNewFullSheet(data)`를 사용합니다.
