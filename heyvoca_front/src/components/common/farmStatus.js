// 당근 농장 상태 표기 공용 상수/헬퍼 (컴포넌트 아님)

export const STAGE_LABELS = {
  seed: '씨앗',
  sprout: '새싹',
  leaf: '잎',
  carrot: '당근',
};

export const STAGE_STATE_LABELS = {
  seed: '학습 전',
  sprout: '단기 암기',
  leaf: '중기 암기',
  carrot: '장기 암기',
};

/**
 * 단어별 "N일 뒤 시들어요/죽어요" 문구 (승인된 A안: 남은 일수 중심).
 * plant: { wilt, life, days_to_wilt, days_to_death, stage }
 * 반환: { text, tone } — tone: 'ok' | 'warn' | 'danger'
 */
export function farmStatusText(plant) {
  if (!plant) return { text: '', tone: 'ok' };

  if (plant.wilt === 'dead') {
    return { text: '죽었어요', tone: 'danger' };
  }
  if (plant.stage === 'seed') {
    return { text: '학습 전', tone: 'ok' };
  }

  const dayWord = (n) => (n <= 0 ? '오늘' : n === 1 ? '내일' : `${n}일 뒤`);

  // 이미 시드는 중 → 죽음까지 남은 일수 강조
  if (plant.wilt === 'wilt1' || plant.wilt === 'wilt2') {
    const d = plant.days_to_death;
    if (d == null) return { text: '시드는 중', tone: 'warn' };
    return {
      text: `${dayWord(d)} 죽어요`,
      tone: plant.wilt === 'wilt2' || d <= 1 ? 'danger' : 'warn',
    };
  }

  // 정상 → 시듦까지 남은 일수
  const d = plant.days_to_wilt;
  if (d == null) return { text: '건강해요', tone: 'ok' };
  return { text: `${dayWord(d)} 시들어요`, tone: 'ok' };
}

export const TONE_CLASS = {
  ok: 'text-layout-gray-300',
  warn: 'text-[#E8890C]',
  danger: 'text-status-error-600',
};
