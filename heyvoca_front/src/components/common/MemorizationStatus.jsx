import React, { useMemo } from 'react';
import { Leaf, Plant, Carrot, EggCrack } from '@phosphor-icons/react';
import { motion } from 'framer-motion';

const MemorizationStatus = ({ repetition, interval, ef, isCorrect=null, nextReview=null, wordId=null, useRandomMessages=false }) => {
  // 암기 상태 판단 함수
  const getMemoryState = () => {
    // 진짜 미학습 상태 체크 (한 번도 학습하지 않은 단어)
    // repetition === 0 && interval === 0: 아직 한 번도 학습하지 않은 상태
    if (repetition === 0 && interval === 0) {
      return 'unlearned';
    }

    // 암기율 계산
    let score = 0;
    score += repetition * 15;
    score += interval * 2;
    score += (ef - 1.3) * 20;
    const percent = Math.max(0, Math.min(100, Math.round(score)));

    if (percent < 30) {
      return 'leaf';
    } else if (percent < 70) {
      return 'plant';
    } else {
      return 'carrot';
    }
  };

  // 결정론적 랜덤 멘트 선택 함수 (시드를 기반으로 항상 같은 결과 반환)
  const getRandomMessage = (messages, seed) => {
    // 간단한 해시 함수로 시드를 숫자로 변환
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 32bit 정수로 변환
    }
    // 절댓값을 취하고 배열 길이로 나눈 나머지 사용
    const index = Math.abs(hash) % messages.length;
    return messages[index];
  };

  // 기본 상태별 텍스트 (랜덤 모드가 아닐 때)
  const getDefaultStatusText = (state) => {
    switch (state) {
      case 'unlearned':
        return '미학습';
      case 'leaf':
        return '단기암기';
      case 'plant':
        return '중기암기';
      case 'carrot':
        return '장기암기';
      default:
        return '';
    }
  };

  // 복습 지연 상태 확인
  const isReviewOverdue = (nextReviewDate) => {
    if (!nextReviewDate) return false;
    const reviewDate = new Date(nextReviewDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    reviewDate.setHours(0, 0, 0, 0);
    return reviewDate < today;
  };

  // 상태별 텍스트 가져오기 (isCorrect가 null일 때)
  const getStatusText = (state, repetition, interval, ef, seed, useRandom, nextReviewDate) => {
    // 복습 지연 상태 확인
    if (isReviewOverdue(nextReviewDate)) {
      return '복습 지연';
    }
    
    // 랜덤 모드가 아니면 기본값 반환
    if (!useRandom) {
      return getDefaultStatusText(state);
    }

    switch (state) {
      case 'unlearned':
        // 진짜 미학습: 한 번도 학습하지 않은 단어
        const unlearnedMessages = [
          'new!',
          '새 단어예요',
          '처음이에요',
          '신규 단어예요'
        ];
        return getRandomMessage(unlearnedMessages, seed);
      case 'leaf':
        // repetition이 0이고 interval이 0보다 크면: 학습 시도했지만 틀린 상태
        if (repetition === 0 && interval > 0) {
          const messages = [
            '복습 필요해요',
            '다시 공부해요',
            '다시 확인해봐요',
            '복습해요',
            '재학습 필요해요'
          ];
          return getRandomMessage(messages, seed);
        }
        // ef가 낮으면 자주 틀린 단어
        if (repetition > 0 && ef < 2.0) {
          const messages = [
            '자주 틀려요',
            '어려워요',
            '복습 많이 필요해요',
            '더 공부 필요해요',
            '자주 확인해봐요'
          ];
          return getRandomMessage(messages, seed);
        }
        const leafMessages = [
          '복습 필요해요',
          '다시 공부해요',
          '다시 확인해봐요',
          '복습해요',
          '재학습 필요해요'
        ];
        return getRandomMessage(leafMessages, seed);
      case 'plant':
        const plantMessages = [
          '중간 기억이에요',
          '좋은 진행이에요',
          '계속 노력해요',
          '기억 향상했어요',
          '잘하고 있어요',
          '꾸준히 공부해요'
        ];
        return getRandomMessage(plantMessages, seed);
      case 'carrot':
        const carrotMessages = [
          '완벽 암기했어요',
          '완전 외웠어요',
          '완벽 기억했어요',
          '잘 암기했어요',
          '암기 완료했어요',
          '완벽해요'
        ];
        return getRandomMessage(carrotMessages, seed);
      default:
        return '';
    }
  };

  // 정답/오답 후 멘트 가져오기
  const getResultMessage = (state, isCorrect, interval, nextReviewDate, repetition, seed, useRandom) => {
    // 복습 지연 상태 확인 (정답/오답 후에도 확인)
    if (isReviewOverdue(nextReviewDate)) {
      return '복습 지연';
    }
    
    // 랜덤 모드가 아니면 기본값 반환 (isCorrect가 null이 아닐 때는 기본 상태 텍스트 반환)
    if (!useRandom) {
      return getDefaultStatusText(state);
    }
    if (isCorrect === false) {
      // 오답인 경우
      // repetition이 0이고 interval이 1이면: 방금 틀린 상태 (학습 시도했지만 틀림)
      if (repetition === 0 && interval === 1) {
        const messages = [
          '다시 공부해요',
          '다시 확인해봐요',
          '조금 더 노력해요',
          '다시 생각해봐요',
          '괜찮아요',
          '다음엔 맞을 거예요'
        ];
        return getRandomMessage(messages, seed);
      }
      // repetition이 0이면: 연속해서 틀린 상태
      if (repetition === 0) {
        const messages = [
          '연속 틀렸어요',
          '더 집중해봐요',
          '다시 공부해요',
          '어려워요',
          '천천히 생각해봐요',
          '복습 필요해요'
        ];
        return getRandomMessage(messages, seed);
      }
      // 그 외: 이전에 맞췄지만 이번에 틀린 상태
      const messages = [
        '다시 공부해요',
        '괜찮아요',
        '다음엔 맞을 거예요',
        '다시 확인해봐요',
        '조금 더 노력해요',
        '다시 기억해봐요'
      ];
      return getRandomMessage(messages, seed);
    } else {
      // 정답인 경우
      // 미학습 상태에서 첫 정답
      if (state === 'unlearned' || (repetition === 1 && interval === 1)) {
        const messages = [
          '정답이에요!',
          '맞았어요',
          '완벽해요',
          '잘했어요',
          '훌륭해요',
          '첫 걸음이에요',
          '좋은 시작이에요'
        ];
        return getRandomMessage(messages, seed);
      }
      // 다음 복습일이 있으면
      if (interval > 0 && nextReview) {
        const reviewDate = new Date(nextReview);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        reviewDate.setHours(0, 0, 0, 0);
        const daysDiff = Math.ceil((reviewDate - today) / (1000 * 60 * 60 * 24));
        if (daysDiff > 0) {
          const messages = [
            `${daysDiff}일 후 복습해요`,
            `${daysDiff}일 뒤 복습해요`,
            `${daysDiff}일 후 만나요`,
            `${daysDiff}일 후 복습할게요`,
            `${daysDiff}일 후 확인해요`
          ];
          return getRandomMessage(messages, seed);
        }
      }
      if (state === 'carrot') {
        const messages = [
          '완벽해요',
          '완전 암기했어요',
          '대단해요',
          '훌륭해요',
          '완벽 기억했어요',
          '잘 외웠어요',
          '암기 완료했어요',
          '잘했어요'
        ];
        return getRandomMessage(messages, seed);
      }
      if (state === 'plant') {
        const messages = [
          '중간 기억이에요',
          '계속 노력해요',
          '잘하고 있어요',
          '기억 향상했어요',
          '꾸준히 공부해요',
          '좋은 진행이에요',
          '계속 해요'
        ];
        return getRandomMessage(messages, seed);
      }
      const messages = [
        '정답이에요',
        '맞았어요',
        '잘했어요',
        '훌륭해요',
        '좋아요',
        '완벽해요',
        '대단해요'
      ];
      return getRandomMessage(messages, seed);
    }
  };

  const memoryState = getMemoryState();
  
  // 상황별 고유 키 생성 (멘트를 고정하기 위해, wordId를 포함하여 각 단어별로 고유한 멘트 선택)
  const messageKey = useMemo(() => {
    return `${wordId || 'default'}-${memoryState}-${repetition}-${interval}-${ef}-${isCorrect}-${nextReview}`;
  }, [wordId, memoryState, repetition, interval, ef, isCorrect, nextReview]);
  
  // 멘트를 useMemo로 고정 (상황이 동일하면 같은 멘트 유지)
  const statusText = useMemo(() => {
    return isCorrect === null 
      ? getStatusText(memoryState, repetition, interval, ef, messageKey, useRandomMessages, nextReview) 
      : getResultMessage(memoryState, isCorrect, interval, nextReview, repetition, messageKey, useRandomMessages);
  }, [messageKey, memoryState, repetition, interval, ef, isCorrect, nextReview, useRandomMessages]);

  // 상태별 스타일 설정
  const getStateStyles = (state, isCorrect, nextReviewDate) => {
    const baseStyles = {
      unlearned: {
        border: 'border-[#9D835A]',
        text: 'text-[#9D835A]',
        bg: 'bg-[#FFFCF3]',
        icon: <EggCrack size={10} weight="fill" />
      },
      leaf: {
        border: 'border-[#77CE4F]',
        text: 'text-[#77CE4F]',
        bg: 'bg-[#F2FFEB]',
        icon: <Leaf size={10} weight="fill" />
      },
      plant: {
        border: 'border-[#38CE38]',
        text: 'text-[#38CE38]',
        bg: 'bg-[#EBFFEE]',
        icon: <Plant size={10} weight="fill" />
      },
      carrot: {
        border: 'border-[#F68300]',
        text: 'text-[#F68300]',
        bg: 'bg-[#FFF8E8]',
        icon: <Carrot size={10} weight="fill" />
      }
    };

    const styles = baseStyles[state];

    // 복습 지연 상태인 경우 빨간색으로 변경 (아이콘은 원래 상태 유지)
    if (isReviewOverdue(nextReviewDate)) {
      return {
        ...styles,
        border: 'border-[#F26A6A]',
        text: 'text-[#F26A6A]',
        bg: 'bg-[#FFE9E9]'
      };
    }

    // 오답인 경우 빨간색으로 변경
    if (isCorrect === false) {
      return {
        ...styles,
        border: 'border-[#F26A6A]',
        text: 'text-[#F26A6A]',
        bg: 'bg-[#FFE9E9]'
      };
    }

    return styles;
  };

  const styles = getStateStyles(memoryState, isCorrect, nextReview);

  // 정적 컴포넌트 (isCorrect가 null일 때)
  if (isCorrect === null) {
    return (
      <div className={`
        flex items-center gap-[3px] 
        w-[max-content]
        py-[3px] px-[5px]
        border rounded-[3px]
        text-[10px] font-[600]
        ${styles.border} ${styles.text} ${styles.bg}
      `}>
        {styles.icon}
        <span>{statusText}</span>
      </div>
    );
  }

  // 애니메이션 컴포넌트 (isCorrect가 true/false일 때)
  return (
    <motion.div
      className={`
        flex items-center gap-[3px] 
        w-[max-content]
        py-[3px] px-[5px]
        border rounded-[3px]
        text-[10px] font-[600]
        ${styles.border} ${styles.text} ${styles.bg}
      `}
      initial={{ opacity: 0, y: -30, scale: 1.2, rotate: 10 }}
      animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 700, damping: 18, duration: 0.5 }}
    >
      {styles.icon}
      <span>{statusText}</span>
    </motion.div>
  );
};

export default MemorizationStatus; 