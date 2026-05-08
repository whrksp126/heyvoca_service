// 문제 유형 ID → 한국어 이름 매핑
// Phase 2.1: 약점 시각화 + 기타 유형 표시에 활용
export const QUESTION_TYPE_LABELS = {
  multipleChoice:          '4지선다 (뜻 고르기)',
  multipleChoiceListening: '듣기 (뜻 고르기)',
  fillInTheBlank:          '빈칸 채우기',
  cardMatch:               '카드 맞추기',
  cardMatchListening:      '듣기 카드 맞추기',
};

/**
 * 정답률에 따른 색상 클래스 반환
 * < 60%  → 빨강 계열
 * 60~80% → 노랑 계열
 * >= 80% → 초록 계열
 */
export const getRateColorClasses = (rate) => {
  if (rate < 0.6) {
    return {
      text: 'text-red-500',
      bg: 'bg-red-50 dark:bg-red-950/30',
      border: 'border-red-200 dark:border-red-800/50',
      bar: 'bg-red-400',
    };
  }
  if (rate < 0.8) {
    return {
      text: 'text-amber-500',
      bg: 'bg-amber-50 dark:bg-amber-950/30',
      border: 'border-amber-200 dark:border-amber-800/50',
      bar: 'bg-amber-400',
    };
  }
  return {
    text: 'text-green-500',
    bg: 'bg-green-50 dark:bg-green-950/30',
    border: 'border-green-200 dark:border-green-800/50',
    bar: 'bg-green-400',
  };
};
