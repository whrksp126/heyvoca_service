/**
 * 🚀 Flying Animation System (Precision Enhanced)
 * 
 * 범용 Flying 애니메이션 컨텍스트
 * 애니메이션 궤적의 정확도와 시각적 가시성을 극대화한 버전입니다.
 */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

const FlyingAnimationContext = createContext();

const ANIMATION_PRESETS = {
  'gem-burst': {
    container: { rotate: 360 },
    item: {
      opacity: [1, 1, 1, 0],
      scale: [1, 1.2, 1.2, 3] // 가시성을 위해 끝에서 더 크게 확장
    },
    times: [0, 0.7, 0.85, 1],
    ease: [0.25, 0.46, 0.45, 0.94]
  },
  'simple-fly': {
    container: { rotate: 0 },
    item: {
      opacity: [1, 1, 0],
      scale: [1, 0.8, 0.5]
    },
    times: [0, 0.8, 1],
    ease: "easeInOut"
  }
};

export const useFlyingAnimation = () => {
  const context = useContext(FlyingAnimationContext);
  if (!context) throw new Error('useFlyingAnimation must be used within FlyingAnimationProvider');
  return context;
};

const getPosition = (point) => {
  if (!point) return null;
  const w = window.innerWidth;
  const h = window.innerHeight;

  if (point.type === 'element') {
    const element = typeof point.value === 'string' ? document.querySelector(point.value) : point.value;
    if (element) {
      const rect = element.getBoundingClientRect();
      // 요소의 절대적인 중앙 좌표 반환
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
  }

  if (point.type === 'position' && typeof point.value === 'string') {
    const margin = 60;
    const positions = {
      'center-bottom': { x: w / 2, y: h - margin },
      'center-top': { x: w / 2, y: margin },
      'center-center': { x: w / 2, y: h / 2 },
      'left-bottom': { x: margin, y: h - margin },
      'right-bottom': { x: w - margin, y: h - margin },
      'left-top': { x: margin, y: margin },
      'right-top': { x: w - margin, y: margin },
    };
    return positions[point.value] || positions['center-bottom'];
  }

  if (point.type === 'position' && typeof point.value === 'object') {
    return { x: point.value.x, y: point.value.y };
  }
  return null;
};

export const FlyingAnimationProvider = ({ children }) => {
  const [animationData, setAnimationData] = useState(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const triggerFlyingAnimation = ({
    imageUrl,
    quantity = 1,
    startPoint = { type: 'position', value: 'center-bottom' },
    endPoint = { type: 'position', value: 'right-top' },
    animationPreset = 'gem-burst',
    customAnimation = null,
    duration = 0.8, // 연출 속도감을 위해 약간 단축
    delay = 0.08,
    onStart,
    onComplete
  }) => {
    if (onStart) onStart();

    // 즉시 계산
    const startPos = getPosition(startPoint);
    const endPos = getPosition(endPoint);

    console.log('� Animation Triggered:', { startPos, endPos, quantity });

    if (!startPos || !endPos) {
      console.warn('⚠️ Missing animation positions');
      if (onComplete) onComplete();
      return;
    }

    const animationConfig = customAnimation || ANIMATION_PRESETS[animationPreset] || ANIMATION_PRESETS['gem-burst'];
    setAnimationData({ imageUrl, quantity, startPos, endPos, animationConfig, duration, delay, onComplete });

    const arrivalTime = ((quantity - 1) * delay + duration) * 1000;
    setTimeout(() => {
      if (onComplete) onComplete();
      setAnimationData(null);
    }, arrivalTime + 300);
  };

  const animationLayer = (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 99999999 }}>
      <AnimatePresence>
        {animationData && (
          <>
            {[...Array(animationData.quantity)].map((_, index) => {
              const totalDelay = index * animationData.delay;
              const { animationConfig, duration, startPos, endPos } = animationData;

              return (
                <motion.div
                  key={`${index}-${animationData.imageUrl}`}
                  initial={{
                    top: 0,
                    left: 0,
                    x: startPos.x,
                    y: startPos.y,
                    opacity: 0,
                    scale: 0,
                    translateX: '-50%',
                    translateY: '-50%'
                  }}
                  animate={{
                    x: endPos.x,
                    y: endPos.y,
                    opacity: 1,
                    scale: 1,
                    ...animationConfig.container
                  }}
                  exit={{ opacity: 0, scale: 0 }}
                  transition={{
                    duration,
                    delay: totalDelay,
                    ease: [0.22, 1, 0.36, 1] // 부드러운 가속도
                  }}
                  style={{
                    position: 'fixed',
                    width: 70, // 크기 상향
                    height: 70,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    // 눈에 잘 띄도록 글로우 효과 강화
                    background: 'radial-gradient(circle, rgba(255,141,212,0.5) 0%, rgba(255,255,255,0) 80%)',
                    filter: 'drop-shadow(0 0 10px rgba(255,141,212,0.6))',
                  }}
                >
                  <motion.img
                    src={animationData.imageUrl}
                    alt=""
                    className="w-[50px] h-[50px] object-contain"
                    initial={{ opacity: 1, scale: 1 }}
                    animate={animationConfig.item}
                    transition={{ duration, delay: totalDelay, times: animationConfig.times, ease: "easeInOut" }}
                    onError={() => console.error('❌ Gem image load failed:', animationData.imageUrl)}
                  />
                  {/* 디버그 및 로딩 실패 대비 가시성 레이어 */}
                  <div className="absolute inset-0 border-[3px] border-[#FF8DD4] rounded-full opacity-30 animate-ping" style={{ animationDuration: '0.5s' }} />
                </motion.div>
              );
            })}
          </>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <FlyingAnimationContext.Provider value={{ triggerFlyingAnimation }}>
      {children}
      {mounted && createPortal(animationLayer, document.body)}
    </FlyingAnimationContext.Provider>
  );
};

export { ANIMATION_PRESETS };
export const useGemAnimation = useFlyingAnimation;
export const GemAnimationProvider = FlyingAnimationProvider;
