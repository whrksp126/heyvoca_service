export function getHomeGreeting(stats) {
  const { total = 0, unlearned = 0, shortTerm = 0, mediumTerm = 0, longTerm = 0, overdue = 0, dueToday = 0 } = stats || {};

  if (overdue >= 5) {
    return { line1: '잠깐!', line2: '복습이 많이 밀렸어요', line3: '지금 챙겨주세요' };
  }
  if (overdue >= 1) {
    return { line1: '오늘 잠깐만', line2: '밀린 복습을 챙겨주세요', line3: '금방이에요' };
  }
  if (dueToday >= 1) {
    return { line1: '잊기 전에', line2: '오늘의 복습을 챙겨주세요', line3: '지금 바로!' };
  }
  if (longTerm >= 30) {
    return { line1: '와!', line2: '장기 암기 단어가 많아요', line3: '정말 잘하고 있어요' };
  }
  if (longTerm >= 1) {
    return { line1: '좋아요!', line2: '단어가 장기 기억으로', line3: '옮겨가고 있어요' };
  }
  if (shortTerm >= 10) {
    return { line1: '조금만 더!', line2: '단기 암기 단어가 많아요', line3: '굳혀볼까요' };
  }
  if (shortTerm + mediumTerm >= 10) {
    return { line1: '잘하고 있어요', line2: '꾸준한 복습으로', line3: '단어가 자라고 있어요' };
  }
  if (unlearned >= 10 && total >= 10) {
    return { line1: '출발할까요?', line2: '기다리는 단어들이 많아요', line3: '지금 도전!' };
  }
  if (total === 0) {
    return { line1: '비어있네요', line2: '상점에서 단어장을 골라', line3: '시작해볼까요?' };
  }
  return { line1: '오늘도', line2: '꾸준히 단어를 학습 중!', line3: '잘하고 있어요' };
}
