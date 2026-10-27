import { motion, useReducedMotion } from 'framer-motion';
import SpeakerArt from './SpeakerArt';
import { feel } from '../../lib/feel';

/**
 * 문제 카드 오른쪽 아래 고정 스피커 버튼 — 사지선다·카드 맞추기(채점 전후)와 듣기 문제(채점 후) 공통.
 * 카드 전체 탭 재생 대신 이 버튼을 눌러야 발음을 다시 듣는다(2026-10-28 실기기 피드백).
 * 위치는 부모(카드 하단 한 줄 flex)가 정하고, 여기서는 44px 터치 영역과 그림만 맡는다.
 *
 * @param {boolean} playing  재생 중이면 SpeakerArt 음파가 출렁인다
 * @param {Function} onPress 누르면 부르는 재생 함수
 * @param {number} size      그림 크기(px)
 * @param {boolean} compact  카드 맞추기 좁은 칸용 — 보이는 크기는 32px, 터치 영역은 ::before 로 44px 유지
 */
const CardSpeakerButton = ({ playing = false, onPress, size, compact = false, className = '' }) => {
  const reduced = useReducedMotion();
  return (
    <motion.button
      type="button"
      aria-label="발음 듣기"
      onClick={(e) => {
        e.stopPropagation();
        feel('tap');
        onPress?.();
      }}
      whileTap={reduced ? undefined : { scale: 0.9 }}
      className={`
        pointer-events-auto flex-shrink-0
        relative flex items-center justify-center rounded-full
        ${compact
          ? "w-[32px] h-[32px] before:absolute before:inset-[-6px] before:content-['']"
          : 'w-[44px] h-[44px]'}
        ${className}
      `}
    >
      <SpeakerArt size={size ?? (compact ? 22 : 30)} playing={playing} />
    </motion.button>
  );
};

export default CardSpeakerButton;
