// src/lib/feel/Pressable.jsx
//
// 공용 탭 래퍼 — motion[as](기본 motion.button) 로 렌더링된다.
// whileTap 스케일 + snappy 스프링 + 탭 시작 시 haptic(hapticKind) 을 한 곳에서 보장한다.
// 기존 버튼의 색/레이아웃 클래스는 그대로 전달(className)하고 동작만 감싼다 — 스타일은
// 이 파일이 아니라 호출부가 계속 소유한다.
//
// 성능 — 리스트 항목 수백 개에 붙을 수 있으므로 haptic 은 onTapStart 에서 딱 1회만 부른다
// (추가 state/렌더 없음). whileTap 은 framer-motion 이 이미 제스처 전용 경로로 처리한다.
import React from 'react';
import { motion } from 'framer-motion';
import { SPRING, TAP } from './motion';
import { haptic } from './haptics';

const Pressable = React.forwardRef(function Pressable(
  {
    as = 'button',
    className = '',
    disabled = false,
    hapticKind = 'light',
    onTapStart,
    whileTap: whileTapOverride,
    transition: transitionOverride,
    children,
    ...props
  },
  ref
) {
  const MotionTag = motion[as] || motion.button;

  return (
    <MotionTag
      ref={ref}
      className={className}
      disabled={disabled}
      whileTap={disabled ? undefined : (whileTapOverride ?? { scale: TAP.scale })}
      transition={transitionOverride ?? SPRING.snappy}
      onTapStart={disabled ? undefined : (event, info) => {
        haptic(hapticKind);
        onTapStart?.(event, info);
      }}
      {...props}
    >
      {children}
    </MotionTag>
  );
});

export default Pressable;
