import CropImage from '../farm/CropImage';
import SetupTile from './SetupTile';
import { MEMORY_STAGE_ORDER } from '../../utils/vocaCrop';

/**
 * '어떤 단어를' — 농장 작물 단계 5칸(미학습 · 씨앗 · 새싹 · 이파리 · 당근).
 *
 * 테스트 설정과 학습 설정이 같은 칸을 쓴다. 판정은 utils/vocaCrop.wordMemoryStage 한 곳이다.
 * 칸에는 글자를 두지 않는다(그림만) — 이름과 개수는 aria-label 로만 읽힌다.
 * 개수가 0인 칸은 흐리게 그리지만 여전히 고를 수 있다(다른 단어장을 합칠 때 0이 아니게 될 수 있다).
 */
const MEMORY_STAGE_META = {
  unlearned: { label: '미학습', stage: 'UNPLANTED_SEED' },
  seed: { label: '씨앗', stage: 'PLANTED_SEED' },
  sprout: { label: '새싹', stage: 'SPROUT' },
  leaf: { label: '이파리', stage: 'LEAF' },
  carrot: { label: '당근', stage: 'CARROT' },
};

const MemoryStageSelector = ({ value = [], counts = {}, onToggle }) => (
  <div className="flex gap-[6px]" role="group" aria-label="어떤 단어를">
    {MEMORY_STAGE_ORDER.map((key) => {
      const meta = MEMORY_STAGE_META[key];
      const count = counts[key] ?? 0;
      const selected = value.includes(key);
      return (
        <SetupTile
          key={key}
          selected={selected}
          onClick={() => onToggle?.(key)}
          aria-label={`${meta.label} ${count}개`}
          className={`h-[68px] ${count === 0 ? 'opacity-40' : ''}`}
        >
          <CropImage stage={meta.stage} size={44} align="center" alt="" />
        </SetupTile>
      );
    })}
  </div>
);

export default MemoryStageSelector;
