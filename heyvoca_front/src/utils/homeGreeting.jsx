// 메인 화면 동기부여 멘트.
// 우선순위는 위에서 아래. 모든 분기는 3줄을 이어 읽으면 자연스러운 한 문장이고,
// <strong>은 핵심 정보(단어 수/카테고리)에만 둔다.
// 심리 트리거: "잃는 공포"(reviewDue 다수, decreased), "되찾는 기쁨"(longTerm/improved), "도전"(새 단어 권유).

const SESSION_FRESH_MS = 5 * 60 * 1000; // 학습 직후 5분 이내면 세션 멘트 사용

export function getHomeGreeting(stats, sessionResult = null, todayNewWords = 0) {
  const {
    total      = 0,
    unlearned  = 0,
    shortTerm  = 0,
    mediumTerm = 0,
    longTerm   = 0,
    reviewDue  = 0,
  } = stats || {};

  // ── A. 방금 학습이 끝난 직후 (5분 이내) ──
  const isSessionFresh =
    sessionResult &&
    typeof sessionResult.completedAt === 'number' &&
    Date.now() - sessionResult.completedAt < SESSION_FRESH_MS;

  if (isSessionFresh) {
    const {
      totalCnt        = 0,
      correctCnt      = 0,
      incorrectCnt    = 0,
      improvedCount   = 0,
      decreasedCount  = 0,
      newLearnedCount = 0,
    } = sessionResult;
    const allCorrect = totalCnt > 0 && incorrectCnt === 0;

    // A1. 모두 정답 + 오늘 더 풀 게 없음 → 완벽 마무리
    if (allCorrect && reviewDue === 0) {
      return {
        line1: '완벽해요!',
        line2: <><strong>오늘 학습</strong>을</>,
        line3: '모두 끝냈어요',
      };
    }

    // A2. 암기가 떨어진 단어가 있음 (잃는 공포 — 막 발생)
    if (decreasedCount >= 1) {
      return {
        line1: '아쉬워요',
        line2: <><strong>{decreasedCount}개 단어</strong>의 기억이</>,
        line3: '흐릿해졌어요',
      };
    }

    // A3. 새 단어를 처음 학습했음 — 표시는 오늘 누적(todayNewWords) 기준.
    // (직전 세션만이 아니라 오늘 여러 번 학습한 새 단어 합계로 동기부여)
    if (newLearnedCount >= 1) {
      const shownNew = todayNewWords >= newLearnedCount ? todayNewWords : newLearnedCount;
      return {
        line1: '잘했어요!',
        line2: <><strong>새 단어 {shownNew}개</strong>가</>,
        line3: '자라기 시작했어요',
      };
    }

    // A4. 암기 상태가 올라간 단어가 많음 (되찾기 + 성장)
    if (improvedCount >= 1) {
      return {
        line1: '훌륭해요',
        line2: <><strong>{improvedCount}개 단어</strong>의</>,
        line3: '기억이 자랐어요',
      };
    }

    // A5. 모두 정답이지만 reviewDue가 남음
    if (allCorrect && reviewDue >= 1) {
      return {
        line1: '잘하고 있어요',
        line2: <>이어서 <strong>{reviewDue}개</strong></>,
        line3: '더 챙겨볼까요',
      };
    }

    // A6. 일반 마무리
    return {
      line1: '수고했어요',
      line2: <><strong>{correctCnt}개</strong> 맞췄어요</>,
      line3: '꾸준히 가봐요',
    };
  }

  // ── B. 단어장 비어있음 ──
  if (total === 0) {
    return {
      line1: '비어있네요',
      line2: <><strong>상점</strong>에서 단어장을</>,
      line3: '골라볼까요?',
    };
  }

  // ── C. 위험: 잊기 직전 단어가 너무 많음 (잃는 공포 — 강) ──
  if (reviewDue >= 20) {
    return {
      line1: '위험해요!',
      line2: <><strong>{reviewDue}개 단어</strong>의 기억이</>,
      line3: '흐려지고 있어요',
    };
  }

  // ── D. 잊기 전에 챙겨야 할 단어가 꽤 있음 (잃는 공포 — 중) ──
  if (reviewDue >= 5) {
    return {
      line1: '잊기 전에',
      line2: <><strong>오늘 복습 {reviewDue}개</strong></>,
      line3: '챙겨볼까요',
    };
  }

  // ── E. 오늘 가볍게 챙길 분량 (잃는 공포 — 약) ──
  if (reviewDue >= 1) {
    return {
      line1: '오늘만 잠깐!',
      line2: <><strong>복습 {reviewDue}개</strong>가</>,
      line3: '기다리고 있어요',
    };
  }

  // ── F. 장기 기억 마스터 등급 (성취감 — 강) ──
  if (longTerm >= 50) {
    return {
      line1: '대단해요',
      line2: <><strong>장기 기억 {longTerm}개</strong>라니</>,
      line3: '진짜 잘하고 있어요',
    };
  }

  // ── G. 장기 기억 30+ 돌파 (성취감 — 중) ──
  if (longTerm >= 30) {
    return {
      line1: '와!',
      line2: <><strong>장기 기억 {longTerm}개</strong></>,
      line3: '돌파했어요',
    };
  }

  // ── H. 모두 암기했고 새 도전 권유 ──
  if (unlearned === 0 && longTerm >= 5) {
    return {
      line1: '완벽해요!',
      line2: <><strong>새로운 단어</strong>도</>,
      line3: '미리 공부해볼까요?',
    };
  }

  // ── I. 첫 장기 기억 진입 ──
  if (longTerm >= 1) {
    return {
      line1: '좋아요!',
      line2: <><strong>{longTerm}개</strong>가 장기 기억으로</>,
      line3: '옮겨갔어요',
    };
  }

  // ── J. 단기 → 중장기 굳히기 권유 ──
  if (shortTerm >= 10) {
    return {
      line1: '한 발짝만 더',
      line2: <><strong>단기 암기 {shortTerm}개</strong></>,
      line3: '굳혀볼까요',
    };
  }

  // ── K. 자라는 중 ──
  if (shortTerm + mediumTerm >= 10) {
    return {
      line1: '잘하고 있어요',
      line2: <><strong>{shortTerm + mediumTerm}개 단어</strong>가</>,
      line3: '자라는 중이에요',
    };
  }

  // ── L. 새 단어 출발 권유 ──
  if (unlearned >= 10 && total >= 10) {
    return {
      line1: '출발할까요?',
      line2: <><strong>새 단어 {unlearned}개</strong>가</>,
      line3: '기다리고 있어요',
    };
  }

  // ── M. 기본 격려 ──
  return {
    line1: '오늘도',
    line2: <>꾸준히 <strong>{total}개 단어</strong></>,
    line3: '학습 중이에요',
  };
}
