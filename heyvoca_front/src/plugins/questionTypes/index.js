import CardMatchQuestion from './cardMatch/CardMatchQuestion';
import CardMatchListeningQuestion from './cardMatch/CardMatchListeningQuestion';

const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

export const QUESTION_TYPE_PLUGINS = [
  {
    id: 'multipleChoice',
    label: '사지선다',
    enabled: true,
    minWords: 4,
    component: null,       // Main.jsx 기존 코드로 처리
    setupQuestions: null,  // TakeTest.jsx 기존 코드로 처리
  },
  {
    id: 'multipleChoiceListening',
    label: '사지선다(듣기)',
    enabled: true,
    minWords: 4,
    component: null,
    setupQuestions: null,
  },
  {
    id: 'cardMatch',
    label: '카드 맞추기',
    enabled: true,
    minWords: 4,
    component: CardMatchQuestion,
    setupQuestions: (selectedWords) => {
      // 유동적 세트 크기 계산 (최대 4, 최소 2 보장)
      // 예: 5→[3,2], 6→[4,2], 7→[4,3], 9→[4,3,2], 10→[4,4,2]
      const calcSizes = (total) => {
        const sizes = [];
        let rem = total;
        while (rem > 0) {
          if (rem <= 4) {
            sizes.push(rem);
            rem = 0;
          } else if (rem === 5) {
            sizes.push(3, 2);
            rem = 0;
          } else {
            sizes.push(4);
            rem -= 4;
          }
        }
        return sizes;
      };

      const sizes = calcSizes(selectedWords.length);
      const sets = [];
      let idx = 0;
      sizes.forEach((size) => {
        const chunk = selectedWords.slice(idx, idx + size);
        sets.push({
          questionType: 'cardMatch',
          id: `cardMatch-set-${idx}`,
          words: shuffleArray(chunk),
          vocabularySheetId: chunk[0].vocabularySheetId,
          isCorrect: null,
        });
        idx += size;
      });
      return sets;
    },
  },
  {
    id: 'cardMatchListening',
    label: '카드 맞추기(듣기)',
    enabled: true,
    minWords: 4,
    component: CardMatchListeningQuestion,
    setupQuestions: (selectedWords) => {
      const calcSizes = (total) => {
        const sizes = [];
        let rem = total;
        while (rem > 0) {
          if (rem <= 4) {
            sizes.push(rem);
            rem = 0;
          } else if (rem === 5) {
            sizes.push(3, 2);
            rem = 0;
          } else {
            sizes.push(4);
            rem -= 4;
          }
        }
        return sizes;
      };

      const sizes = calcSizes(selectedWords.length);
      const sets = [];
      let idx = 0;
      sizes.forEach((size) => {
        const chunk = selectedWords.slice(idx, idx + size);
        sets.push({
          questionType: 'cardMatchListening',
          id: `cardMatchListening-set-${idx}`,
          words: shuffleArray(chunk),
          vocabularySheetId: chunk[0].vocabularySheetId,
          isCorrect: null,
        });
        idx += size;
      });
      return sets;
    },
  },
];

export const getQuestionType = (id) => QUESTION_TYPE_PLUGINS.find(p => p.id === id);
