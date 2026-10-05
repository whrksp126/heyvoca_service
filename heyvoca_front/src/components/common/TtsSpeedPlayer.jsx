import { motion } from 'framer-motion';
import { SpeakerHigh } from '@phosphor-icons/react';
import TtsRipple from './TtsRipple';

/*
  보통 속도 / 0.7배속 재생 버튼을 한 박스에 담은 공용 컴포넌트: [스피커 | 0.7 스피커]
  - 박스 자체와 세로 구분선은 탭에 반응하지 않는다. 각 스피커 아이콘의 터치 타깃(56px,
    서로 겹치지 않음)만 버튼이다.
  - 재생 중 표시(TtsRipple + 색)는 눌린 쪽 아이콘에만 붙는다.
*/
const SpeakerTarget = ({ label, onPress, speaking, slow }) => (
  <div className="flex-1 flex items-center justify-center">
    <motion.button
      type="button"
      aria-label={label}
      onClick={onPress}
      whileTap={{ scale: 0.92 }}
      transition={{ duration: 0.15 }}
      className="relative flex items-center justify-center w-[56px] h-[56px] rounded-full"
    >
      {speaking && (
        <TtsRipple
          size={72}
          loop
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[0] pointer-events-none"
        />
      )}
      <span className={`relative z-[1] inline-flex ${speaking ? 'text-primary-main-600' : 'text-layout-gray-300'}`}>
        <SpeakerHigh size={36} weight="fill" />
        {slow && (
          <span className="absolute -bottom-[2px] -right-[10px] text-[11px] font-[800] leading-none">0.7</span>
        )}
      </span>
    </motion.button>
  </div>
);

const TtsSpeedPlayer = ({ onPlayNormal, onPlaySlow, speakingNormal, speakingSlow }) => (
  <div className="flex items-center h-[84px] rounded-[12px] bg-layout-gray-50 dark:bg-layout-gray-dark">
    <SpeakerTarget label="보통 속도로 듣기" onPress={onPlayNormal} speaking={speakingNormal} />
    <div className="w-px h-[40px] bg-layout-gray-100 dark:bg-border-dark flex-shrink-0" />
    <SpeakerTarget label="0.7배속으로 듣기" onPress={onPlaySlow} speaking={speakingSlow} slow />
  </div>
);

export default TtsSpeedPlayer;
