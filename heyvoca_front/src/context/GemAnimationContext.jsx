/**
 * 🚀 Flying Animation System
 * 
 * 범용 Flying 애니메이션 컨텍스트
 * 화면에서 이미지가 특정 위치에서 다른 위치로 날아가는 애니메이션을 제공합니다.
 * 
 * @example 기본 사용
 * ```jsx
 * const { triggerFlyingAnimation } = useFlyingAnimation();
 * 
 * triggerFlyingAnimation({
 *   imageUrl: '/path/to/image.png',
 *   quantity: 5,
 *   startPoint: { type: 'position', value: 'center-bottom' },
 *   endPoint: { type: 'position', value: 'right-top' },
 *   animationPreset: 'gem-burst',
 *   onComplete: () => console.log('완료!')
 * });
 * ```
 * 
 * @example 엘리먼트 기반 사용
 * ```jsx
 * triggerFlyingAnimation({
 *   imageUrl: '/coin.png',
 *   quantity: 3,
 *   startPoint: { type: 'element', value: '#button-id' },
 *   endPoint: { type: 'element', value: document.querySelector('.target') },
 *   animationPreset: 'sparkle'
 * });
 * ```
 * 
 * @example 커스텀 애니메이션
 * ```jsx
 * triggerFlyingAnimation({
 *   imageUrl: '/star.png',
 *   quantity: 10,
 *   customAnimation: {
 *     container: { rotate: 720 },
 *     item: { 
 *       opacity: [1, 0],
 *       scale: [1, 2, 0]
 *     },
 *     times: [0, 0.5, 1],
 *     ease: 'easeInOut'
 *   }
 * });
 * ```
 */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const FlyingAnimationContext = createContext();

/**
 * 애니메이션 효과 프리셋
 * 
 * 새로운 프리셋 추가 방법:
 * 1. 여기에 직접 추가하거나
 * 2. addAnimationPreset('preset-name', config) 함수 사용
 * 
 * 프리셋 구조:
 * {
 *   container: { rotate, x, y 등 컨테이너 애니메이션 },
 *   item: { opacity, scale, filter 등 아이템 애니메이션 },
 *   times: [0, 0.5, 1] (keyframe 타이밍, item의 배열 길이와 일치),
 *   ease: 'easeInOut' | [0.4, 0, 0.2, 1] (easing 함수)
 * }
 */
const ANIMATION_PRESETS = {
  // 보석 폭발 효과 (기본)
  'gem-burst': {
    container: {
      rotate: 360
    },
    item: {
      opacity: [1, 1, 1, 0],
      scale: [1, 0.4, 0.4, 2.5],
      filter: ['brightness(1)', 'brightness(1)', 'brightness(1.5)', 'brightness(2)']
    },
    times: [0, 0.75, 0.9, 1],
    ease: [0.25, 0.46, 0.45, 0.94]
  },
  
  // 단순 날아가기
  'simple-fly': {
    container: {
      rotate: 0
    },
    item: {
      opacity: [1, 1, 0],
      scale: [1, 0.6, 0.3]
    },
    times: [0, 0.7, 1],
    ease: "easeInOut"
  },
  
  // 통통 튀면서 가기
  'bounce': {
    container: {
      rotate: 180
    },
    item: {
      opacity: [1, 1, 1, 0],
      scale: [1, 1.2, 0.8, 1.5, 0],
      y: [0, -20, -10, -30, 0]
    },
    times: [0, 0.3, 0.5, 0.8, 1],
    ease: "easeOut"
  },
  
  // 부드럽게 사라지기
  'fade': {
    container: {
      rotate: 720
    },
    item: {
      opacity: [1, 0.8, 0.5, 0],
      scale: [1, 0.8, 0.5, 0.2]
    },
    times: [0, 0.4, 0.7, 1],
    ease: "easeIn"
  },
  
  // 빛나며 사라지기
  'sparkle': {
    container: {
      rotate: [0, 180, 360]
    },
    item: {
      opacity: [1, 1, 1, 0],
      scale: [0.5, 1.2, 0.8, 3],
      filter: ['brightness(1) blur(0px)', 'brightness(2) blur(0px)', 'brightness(3) blur(2px)', 'brightness(4) blur(4px)']
    },
    times: [0, 0.3, 0.7, 1],
    ease: [0.4, 0, 0.2, 1]
  },
  
  // 흔들리며 날아가기
  'shake': {
    container: {
      rotate: [0, 10, -10, 15, -15, 0, 360]
    },
    item: {
      opacity: [1, 1, 1, 0],
      scale: [1, 1.1, 0.9, 1.2, 0.7, 0.4, 0]
    },
    times: [0, 0.2, 0.4, 0.6, 0.75, 0.9, 1],
    ease: "easeInOut"
  }
};

export const useFlyingAnimation = () => {
  const context = useContext(FlyingAnimationContext);
  if (!context) {
    throw new Error('useFlyingAnimation must be used within FlyingAnimationProvider');
  }
  return context;
};

// 위치 헬퍼 함수
const getPosition = (point) => {
  if (!point) return null;

  // 엘리먼트인 경우
  if (point.type === 'element') {
    const element = typeof point.value === 'string' 
      ? document.querySelector(point.value) 
      : point.value;
    
    if (element) {
      const rect = element.getBoundingClientRect();
      // 엘리먼트 중앙 위치 계산 (이미 중앙이므로 transform 불필요)
      return {
        left: `${rect.left + rect.width / 2}px`,
        top: `${rect.top + rect.height / 2}px`,
        x: 0,
        y: 0
      };
    }
  }

  // 고정 위치인 경우 (문자열)
  if (point.type === 'position' && typeof point.value === 'string') {
    const positions = {
      'center-bottom': { left: '50%', bottom: '20px', x: '-50%', y: 0, top: 'auto' },
      'center-top': { left: '50%', top: '20px', x: '-50%', y: 0, bottom: 'auto' },
      'center-center': { left: '50%', top: '50%', x: '-50%', y: '-50%', bottom: 'auto' },
      'left-bottom': { left: '20px', bottom: '20px', x: 0, y: 0, top: 'auto' },
      'right-bottom': { right: '20px', bottom: '20px', x: 0, y: 0, left: 'auto', top: 'auto' },
      'left-top': { left: '20px', top: '20px', x: 0, y: 0, bottom: 'auto' },
      'right-top': { right: '20px', top: '20px', x: 0, y: 0, left: 'auto', bottom: 'auto' },
    };
    return positions[point.value] || positions['center-bottom'];
  }

  // 커스텀 좌표인 경우
  if (point.type === 'position' && typeof point.value === 'object') {
    return {
      left: point.value.x,
      top: point.value.y,
      x: 0,
      y: 0
    };
  }

  return null;
};

export const FlyingAnimationProvider = ({ children }) => {
  const [animationData, setAnimationData] = useState(null);

  const triggerFlyingAnimation = ({ 
    imageUrl, 
    quantity = 1, 
    startPoint = { type: 'position', value: 'center-bottom' },
    endPoint = { type: 'position', value: 'right-top' },
    animationPreset = 'gem-burst', // 프리셋 선택
    customAnimation = null, // 커스텀 애니메이션
    duration = 1.2, // 애니메이션 지속 시간
    delay = 0.1, // 각 아이템 간 지연 시간
    onStart,
    onComplete 
  }) => {
    // 시작 콜백 즉시 호출
    if (onStart) {
      onStart();
    }

    const startPos = getPosition(startPoint);
    const endPos = getPosition(endPoint);
    
    // 애니메이션 설정 선택 (커스텀 > 프리셋 > 기본)
    const animationConfig = customAnimation || ANIMATION_PRESETS[animationPreset] || ANIMATION_PRESETS['gem-burst'];

    setAnimationData({ 
      imageUrl, 
      quantity, 
      startPos,
      endPos,
      animationConfig,
      duration,
      delay,
      onComplete 
    });
    
    // 마지막 요소가 목표 지점에 도착하는 시점에 완료 콜백 호출
    const lastItemDelay = (quantity - 1) * delay * 1000;
    const arrivalTime = lastItemDelay + (duration * 1100); // 90% 지점
    
    setTimeout(() => {
      if (onComplete) {
        onComplete();
      }
    }, arrivalTime);
  };

  const handleAnimationComplete = () => {
    setAnimationData(null);
  };

  return (
    <FlyingAnimationContext.Provider value={{ triggerFlyingAnimation }}>
      {children}
      
      {/* 전역 Flying 애니메이션 */}
      <AnimatePresence>
        {animationData && animationData.startPos && animationData.endPos && (
          <>
            {[...Array(animationData.quantity)].map((_, index) => {
              const isLast = index === animationData.quantity - 1;
              const totalDelay = index * animationData.delay;
              const { animationConfig, duration } = animationData;
              
              return (
                <motion.div
                  key={index}
                  initial={{ 
                    position: 'fixed',
                    ...animationData.startPos,
                    zIndex: 99999
                  }}
                  animate={{ 
                    ...animationData.endPos,
                    ...animationConfig.container
                  }}
                  exit={{ opacity: 0 }}
                  transition={{ 
                    duration,
                    delay: totalDelay,
                    ease: animationConfig.ease
                  }}
                  onAnimationComplete={isLast ? () => {
                    setTimeout(handleAnimationComplete, 300);
                  } : undefined}
                  className="pointer-events-none"
                  style={{
                    width: '60px',
                    height: '60px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginLeft: '-30px',  // 이미지 크기의 절반만큼 왼쪽으로
                    marginTop: '-30px'    // 이미지 크기의 절반만큼 위로
                  }}
                >
                  <motion.img 
                    src={animationData.imageUrl} 
                    alt="" 
                    className="w-[60px] h-[60px]"
                    initial={{ opacity: 1, scale: 1 }}
                    animate={animationConfig.item}
                    transition={{ 
                      duration,
                      delay: totalDelay,
                      times: animationConfig.times,
                      ease: animationConfig.ease
                    }}
                  />
                </motion.div>
              );
            })}
          </>
        )}
      </AnimatePresence>
    </FlyingAnimationContext.Provider>
  );
};

// 프리셋 목록 export (새로운 프리셋 추가 시 여기에 추가하면 됨)
export { ANIMATION_PRESETS };

// 새로운 프리셋 추가 헬퍼 함수
export const addAnimationPreset = (name, config) => {
  ANIMATION_PRESETS[name] = config;
};

// 이전 버전과의 호환성을 위한 별칭
export const useGemAnimation = useFlyingAnimation;
export const GemAnimationProvider = FlyingAnimationProvider;
