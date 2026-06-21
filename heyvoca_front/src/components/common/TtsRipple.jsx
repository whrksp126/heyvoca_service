import { motion } from 'framer-motion';

/**
 * TTS 재생 중 표시되는 파동(ripple) 효과. 모든 TTS 효과가 공유하는 공통 컴포넌트.
 *
 * 핵심: 파동을 임의 주기로 반복하지 않고 **실제 TTS 재생 길이(duration, 초)에 정확히 1회** 맞춘다.
 * - 재생 시작 = 파동 시작, 재생 완료 = 파동 완료(opacity 0)로 1:1 동기화.
 * - duration을 아직 모르면(메타 로드 전) 아예 렌더하지 않는다. fallback 주기로 먼저 그렸다가
 *   실제 duration이 들어오면 framer-motion이 애니메이션을 재시작해 "파동이 두 번 도는" 것처럼
 *   보이던 문제를 막는다.
 * - repeat를 쓰지 않아(1회) 재생 종료 후 watchdog 여유시간에 2번째 파동이 시작되지 않는다.
 * - 두 겹의 원을 같은 주기로 동시에 퍼뜨리되 시작 scale만 다르게 해 깊이감을 준다.
 * - opacity [0 → peak → 0] keyframe으로 시작/끝이 모두 투명 → 등장·소멸이 매끄럽다.
 * - 크기는 width/height가 아니라 scale(transform, GPU 가속)로 키운다.
 *
 * 부모는 position: relative 여야 하며, 부모 중앙(top/left 50%)을 기준으로 확산한다.
 *
 * @param {number} size       최대 지름(px)
 * @param {number} duration   실제 TTS 재생 길이(초). 유효하지 않으면 렌더하지 않음.
 * @param {string} className  추가 클래스(z-index 등)
 */
const RINGS = [0.3, 0.55]; // 두 동심원의 시작 scale (안쪽/바깥쪽)

const TtsRipple = ({ size = 96, duration, className = '' }) => {
  if (!(Number.isFinite(duration) && duration > 0)) return null;

  return (
    <>
      {RINGS.map((startScale, i) => (
        <motion.span
          key={i}
          aria-hidden
          className={`absolute top-1/2 left-1/2 rounded-full border-2 border-primary-main-600 pointer-events-none ${className}`}
          style={{ width: size, height: size }}
          initial={{ scale: startScale, opacity: 0, x: '-50%', y: '-50%' }}
          animate={{ scale: [startScale, 1], opacity: [0, 0.55, 0], x: '-50%', y: '-50%' }}
          transition={{ duration, ease: 'easeOut' }}
        />
      ))}
    </>
  );
};

export default TtsRipple;
