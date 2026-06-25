// 메인 화면 동기부여 멘트.
// 우선순위는 위에서 아래. 모든 분기는 3줄을 이어 읽으면 자연스러운 한 문장이고,
// <strong>은 핵심 정보(단어 수/카테고리)에만 둔다.
// 심리 트리거: "잃는 공포"(reviewDue 다수, decreased), "되찾는 기쁨"(longTerm/improved), "도전"(새 단어 권유).

const SESSION_FRESH_MS = 5 * 60 * 1000; // 학습 직후 5분 이내면 세션 멘트 사용

/** 배열에서 무작위 1개를 반환. Math.random() 사용(렌더 안정성은 호출부 useMemo로 보장). */
function pick(candidates) {
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * @param {object} stats           - effectiveStats (total, unlearned, shortTerm, mediumTerm, longTerm, reviewDue, …)
 * @param {object|null} sessionResult - lastSessionResult (totalCnt, correctCnt, incorrectCnt, improvedCount, decreasedCount, newLearnedCount, completedAt)
 * @param {number} todayNewWords   - 오늘 처음 배운 새 단어 수
 * @param {number} dailyNewLimit   - userProfile.daily_new_limit (0=무제한)
 * @returns {{ line1, line2, line3, cta? }}
 */
export function getHomeGreeting(stats, sessionResult = null, todayNewWords = 0, dailyNewLimit = 0) {
  const {
    total      = 0,
    unlearned  = 0,
    shortTerm  = 0,
    mediumTerm = 0,
    longTerm   = 0,
    reviewDue  = 0,
  } = stats || {};

  // ── 신규 여력 계산 ──
  // daily_new_limit=0 → 무제한. 남은 여력은 unlearned 기준으로 표현.
  const isUnlimited = dailyNewLimit === 0;
  const remainingNew = isUnlimited
    ? (unlearned > 0 ? Math.min(unlearned, 10) : 0) // 무제한일 땐 최대 10개로 권유
    : Math.max(0, dailyNewLimit - todayNewWords);
  const newQuota = isUnlimited
    ? Math.min(unlearned, 10)
    : Math.max(0, Math.min(remainingNew, unlearned));
  const hasNewCapacity = unlearned > 0 && (isUnlimited || remainingNew > 0);

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

    // A1-a. 복습 완료 + 신규 여력 남음 → 새 단어 적극 권유 (완벽 마무리보다 우선)
    if (reviewDue === 0 && hasNewCapacity) {
      const candidates = [
        {
          line1: allCorrect ? '완벽해요!' : '수고했어요!',
          line2: <><strong>새 단어 {newQuota}개</strong>도</>,
          line3: '도전해볼까요?',
          cta: '새 단어 배우기',
        },
        {
          line1: allCorrect ? '다 맞췄어요!' : '잘했어요!',
          line2: <>아직 <strong>{newQuota}개</strong>가</>,
          line3: '기다리고 있어요',
          cta: '새 단어 배우기',
        },
        {
          line1: '복습 끝!',
          line2: <><strong>새 단어 {newQuota}개</strong></>,
          line3: '더 쌓아볼까요?',
          cta: '새 단어 배우기',
        },
        {
          line1: allCorrect ? '완벽해요!' : '고생했어요!',
          line2: <>오늘 <strong>{newQuota}개</strong> 더 배우면</>,
          line3: '더 빠르게 늘어요',
          cta: '새 단어 배우기',
        },
      ];
      return pick(candidates);
    }

    // A1-b. 복습 완료 + 완전 완료 (신규 여력 없음)
    if (reviewDue === 0 && !hasNewCapacity) {
      const candidates = [
        {
          line1: allCorrect ? '완벽해요!' : '다 끝냈어요!',
          line2: <><strong>장기 기억 {longTerm}개</strong></>,
          line3: '쌓아가는 중이에요',
        },
        {
          line1: '오늘 완주!',
          line2: <><strong>{longTerm}개</strong>가 이미</>,
          line3: '장기 기억 속에 있어요',
        },
        {
          line1: allCorrect ? '퍼펙트!' : '모두 끝냈어요',
          line2: <>내일도 <strong>{reviewDue === 0 ? longTerm : reviewDue}개</strong>와</>,
          line3: '다시 만나요',
        },
        {
          line1: '오늘치 완료!',
          line2: <>꾸준함이 <strong>어휘력</strong>을</>,
          line3: '만들어요',
        },
      ];
      return pick(candidates);
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

  // ── reviewDue === 0 평상시 분기 (세션 직후가 아닌 일반 방문) ──

  // 평상시 복습 완료 + 신규 여력 남음 → 적극 권유
  if (reviewDue === 0 && hasNewCapacity) {
    const candidates = [
      {
        line1: '복습 완료!',
        line2: <><strong>새 단어 {newQuota}개</strong>도</>,
        line3: '배워볼까요?',
        cta: '새 단어 배우기',
      },
      {
        line1: '오늘도 완벽!',
        line2: <>아직 <strong>{newQuota}개</strong>가</>,
        line3: '기다리고 있어요',
        cta: '새 단어 배우기',
      },
      {
        line1: '잘했어요!',
        line2: <><strong>새 단어 {newQuota}개</strong>로</>,
        line3: '어휘를 더 늘려요',
        cta: '새 단어 배우기',
      },
      {
        line1: '여기서 한 발 더!',
        line2: <><strong>{newQuota}개</strong>를 오늘 배우면</>,
        line3: '내일이 달라져요',
        cta: '새 단어 배우기',
      },
      {
        line1: '복습은 끝!',
        line2: <>새 단어 <strong>{newQuota}개</strong>에</>,
        line3: '도전해볼까요?',
        cta: '새 단어 배우기',
      },
    ];
    return pick(candidates);
  }

  // 평상시 복습 완료 + 완전 완료 → 강한 칭찬 + 누적 성과 + 내일 동기
  if (reviewDue === 0 && !hasNewCapacity) {
    const candidates = [
      {
        line1: '완전 완주!',
        line2: <><strong>장기 기억 {longTerm}개</strong></>,
        line3: '쌓아가고 있어요',
      },
      {
        line1: '오늘 할 일 끝!',
        line2: <>벌써 <strong>{longTerm}개</strong>가</>,
        line3: '머릿속에 자리 잡았어요',
      },
      {
        line1: '대단해요!',
        line2: <>꾸준함으로 <strong>{longTerm}개</strong></>,
        line3: '장기 기억에 넣었어요',
      },
      {
        line1: '오늘도 완벽!',
        line2: <>내일 새 단어들이</>,
        line3: '또 기다릴 거예요',
      },
      {
        line1: '최고예요!',
        line2: <><strong>{longTerm}개</strong> 장기 기억,</>,
        line3: '내일도 같이 해요',
      },
    ];
    return pick(candidates);
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
