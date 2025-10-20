# 🚀 Flying Animation System

범용 Flying 애니메이션 시스템 - 화면에서 이미지가 날아가는 애니메이션을 쉽게 구현할 수 있습니다.

## 📦 설치

이미 `Layout.jsx`에 적용되어 있어 바로 사용 가능합니다.

```jsx
import { useFlyingAnimation } from '../context/GemAnimationContext';
```

## 🎯 기본 사용법

```jsx
const { triggerFlyingAnimation } = useFlyingAnimation();

const handleClick = () => {
  triggerFlyingAnimation({
    imageUrl: '/path/to/image.png',
    quantity: 5,
    startPoint: { type: 'position', value: 'center-bottom' },
    endPoint: { type: 'position', value: 'right-top' },
    animationPreset: 'gem-burst',
    onComplete: () => console.log('완료!')
  });
};
```

## 📍 시작점/종료점 설정

### 1. 고정 위치 (position)

```jsx
startPoint: { type: 'position', value: 'center-bottom' }
```

**사용 가능한 위치:**
- `'center-bottom'` - 하단 중앙
- `'center-top'` - 상단 중앙
- `'center-center'` - 정중앙
- `'left-bottom'` - 좌측 하단
- `'right-bottom'` - 우측 하단
- `'left-top'` - 좌측 상단
- `'right-top'` - 우측 상단

### 2. 엘리먼트 위치 (element)

```jsx
// CSS 셀렉터 사용
startPoint: { type: 'element', value: '#button-id' }

// DOM 요소 직접 전달
const element = document.querySelector('.my-button');
startPoint: { type: 'element', value: element }
```

### 3. 커스텀 좌표 (position - 객체)

```jsx
startPoint: { 
  type: 'position', 
  value: { x: '100px', y: '200px' } 
}
```

## 🎨 애니메이션 프리셋

### 사용 가능한 프리셋

1. **`gem-burst`** (기본) - 보석 폭발 효과
   - 회전하며 날아가서 마지막에 크게 터지며 사라짐
   - 밝기 효과 포함

2. **`simple-fly`** - 단순 날아가기
   - 회전 없이 서서히 작아지며 사라짐

3. **`bounce`** - 통통 튀면서 가기
   - 위아래로 튀면서 날아감
   - 크기 변화 포함

4. **`fade`** - 부드럽게 사라지기
   - 빠르게 회전하며 서서히 페이드아웃

5. **`sparkle`** - 빛나며 사라지기
   - 크기가 커지며 블러와 함께 사라짐
   - 가장 화려한 효과

6. **`shake`** - 흔들리며 날아가기
   - 좌우로 흔들리며 날아감

### 프리셋 선택

```jsx
triggerFlyingAnimation({
  // ... 기타 설정
  animationPreset: 'sparkle', // 프리셋 이름
});
```

## ⚙️ 전체 옵션

```jsx
triggerFlyingAnimation({
  // 필수
  imageUrl: string,                    // 날아갈 이미지 URL
  
  // 선택 (기본값 있음)
  quantity: number,                    // 날아갈 개수 (기본: 1)
  startPoint: {                        // 시작 위치
    type: 'position' | 'element',
    value: string | object | HTMLElement
  },
  endPoint: {                          // 종료 위치
    type: 'position' | 'element',
    value: string | object | HTMLElement
  },
  animationPreset: string,             // 프리셋 이름 (기본: 'gem-burst')
  customAnimation: object,             // 커스텀 애니메이션 (프리셋 대신 사용)
  duration: number,                    // 애니메이션 시간 초 (기본: 1.2)
  delay: number,                       // 각 아이템 간격 초 (기본: 0.1)
  
  // 콜백
  onStart: () => void,                 // 시작 시 호출
  onComplete: () => void               // 완료 시 호출 (90% 지점)
});
```

## 🎭 커스텀 애니메이션

프리셋을 사용하지 않고 완전히 커스텀 애니메이션을 만들 수 있습니다.

```jsx
triggerFlyingAnimation({
  imageUrl: '/star.png',
  quantity: 10,
  customAnimation: {
    container: { 
      rotate: 720,           // 컨테이너 회전
      scale: [1, 1.5, 1]     // 컨테이너 크기 변화
    },
    item: { 
      opacity: [1, 0.5, 0],  // 투명도 변화
      scale: [1, 2, 0],      // 크기 변화
      filter: ['blur(0px)', 'blur(2px)', 'blur(5px)'] // 필터 효과
    },
    times: [0, 0.5, 1],      // keyframe 타이밍 (배열 길이 일치 필요)
    ease: 'easeInOut'        // easing 함수
  }
});
```

## ➕ 새로운 프리셋 추가하기

### 방법 1: 직접 추가

`GemAnimationContext.jsx` 파일의 `ANIMATION_PRESETS` 객체에 추가:

```jsx
const ANIMATION_PRESETS = {
  // ... 기존 프리셋들
  
  // 새로운 프리셋
  'my-custom': {
    container: {
      rotate: 180
    },
    item: {
      opacity: [1, 1, 0],
      scale: [1, 1.5, 0]
    },
    times: [0, 0.7, 1],
    ease: 'easeOut'
  }
};
```

### 방법 2: 런타임에 추가

```jsx
import { addAnimationPreset } from '../context/GemAnimationContext';

addAnimationPreset('my-runtime-preset', {
  container: { rotate: 360 },
  item: {
    opacity: [1, 0],
    scale: [1, 2]
  },
  times: [0, 1],
  ease: 'linear'
});
```

## 💡 실제 사용 예시

### 보석 구매 완료

```jsx
const handlePurchaseComplete = () => {
  triggerFlyingAnimation({
    imageUrl: gemImage,
    quantity: 5,
    startPoint: { type: 'position', value: 'center-bottom' },
    endPoint: { type: 'element', value: '#gem-counter' },
    animationPreset: 'gem-burst',
    onComplete: () => {
      updateGemCount(newCount);
    }
  });
};
```

### 버튼에서 상단으로 하트 날리기

```jsx
const handleLike = (e) => {
  triggerFlyingAnimation({
    imageUrl: '/heart.png',
    quantity: 3,
    startPoint: { type: 'element', value: e.currentTarget },
    endPoint: { type: 'position', value: 'center-top' },
    animationPreset: 'sparkle',
    delay: 0.15,
    onComplete: () => {
      console.log('좋아요 완료!');
    }
  });
};
```

### 코인 수집 효과

```jsx
const collectCoin = (coinElement) => {
  triggerFlyingAnimation({
    imageUrl: '/coin.png',
    quantity: 1,
    startPoint: { type: 'element', value: coinElement },
    endPoint: { type: 'element', value: '#coin-counter' },
    animationPreset: 'bounce',
    duration: 0.8,
    onStart: () => {
      coinElement.style.visibility = 'hidden';
    },
    onComplete: () => {
      updateCoinCount();
    }
  });
};
```

## 🎬 프리셋 미리보기

각 프리셋의 특징:

| 프리셋 | 회전 | 크기 변화 | 특수 효과 | 추천 용도 |
|--------|------|-----------|-----------|-----------|
| `gem-burst` | ✅ 360° | 작아졌다 커짐 | 밝기 증가 | 보석, 아이템 |
| `simple-fly` | ❌ | 서서히 축소 | - | 심플한 효과 |
| `bounce` | ✅ 180° | 통통 튐 | Y축 이동 | 코인, 재미있는 효과 |
| `fade` | ✅ 720° | 서서히 축소 | - | 부드러운 효과 |
| `sparkle` | ✅ 360° | 크게 확대 | 블러 + 밝기 | 하트, 별, 스파클 |
| `shake` | ✅ 흔들림 | 다양한 변화 | - | 강조 효과 |

## 🔧 고급 팁

### 1. 여러 애니메이션 동시 실행

```jsx
// 서로 다른 이미지로 동시에
triggerFlyingAnimation({ imageUrl: '/gem1.png', ... });
triggerFlyingAnimation({ imageUrl: '/gem2.png', ... });
```

### 2. 순차 실행

```jsx
triggerFlyingAnimation({
  imageUrl: '/star.png',
  onComplete: () => {
    // 첫 번째 완료 후 두 번째 시작
    triggerFlyingAnimation({
      imageUrl: '/heart.png',
      ...
    });
  }
});
```

### 3. 엘리먼트 위치는 실시간 계산됨

```jsx
// 버튼이 이동해도 현재 위치에서 시작
startPoint: { type: 'element', value: '#moving-button' }
```

## 📝 주의사항

1. **이미지 크기**: 기본적으로 60x60px로 표시됩니다. CSS에서 수정 가능합니다.
2. **z-index**: 애니메이션은 z-index: 99999로 표시되어 모든 요소 위에 나타납니다.
3. **성능**: 한 번에 너무 많은 아이템(100개 이상)을 날리면 성능 이슈가 있을 수 있습니다.
4. **times 배열**: customAnimation 사용 시 times 배열의 길이는 item 속성 배열의 길이와 일치해야 합니다.

## 🎓 더 알아보기

- Framer Motion 공식 문서: https://www.framer.com/motion/
- 이징 함수 참고: https://easings.net/

---

문의사항이나 버그는 팀에 알려주세요! 🚀

