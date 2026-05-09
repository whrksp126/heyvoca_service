import CardMatchQuestion from './cardMatch/CardMatchQuestion';
import CardMatchListeningQuestion from './cardMatch/CardMatchListeningQuestion';
import FillInTheBlankQuestion from './fillInTheBlank/FillInTheBlankQuestion';

const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// 두 단어의 의미가 하나라도 겹치는지 (동의어 충돌 검사용)
const meaningsOverlap = (a, b) => {
  const setA = new Set((a.meanings ?? []).map(m => String(m).trim()));
  return (b.meanings ?? []).some(m => setA.has(String(m).trim()));
};

// cardMatch 세트 빌드 — 같은 세트 안에 의미가 겹치는 단어가 들어가지 않게 분배.
// 예: [town:마을, village:마을, home:집, park:공원]
//     → [[town, home, park], [village]] → 후처리로 village를 다른 청크에 시도
//     → 결국 [[town, home, park, village]]가 되면 충돌이 풀린 형태로 합쳐짐
// 모두 동의어인 극단 케이스는 2개 미만 청크가 되어 자연스럽게 폐기.
const buildChunksAvoidingMeaningClash = (words, maxSize = 4) => {
  const chunks = [];
  for (const w of words) {
    let placed = false;
    for (const chunk of chunks) {
      if (chunk.length >= maxSize) continue;
      if (chunk.some(c => meaningsOverlap(c, w))) continue;
      chunk.push(w);
      placed = true;
      break;
    }
    if (!placed) chunks.push([w]);
  }
  // 1짜리 청크는 다른 청크 중 충돌 없고 자리 있는 곳으로 이동 시도
  for (let i = chunks.length - 1; i >= 0; i--) {
    if (chunks[i].length !== 1) continue;
    const single = chunks[i][0];
    for (let j = 0; j < chunks.length; j++) {
      if (j === i) continue;
      if (chunks[j].length >= maxSize) continue;
      if (chunks[j].some(c => meaningsOverlap(c, single))) continue;
      chunks[j].push(single);
      chunks.splice(i, 1);
      break;
    }
  }
  // 카드매치는 최소 2개 필요. 이동 못 한 1짜리는 폐기.
  return chunks.filter(c => c.length >= 2);
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
    id: 'fillInTheBlank',
    label: '빈칸 채우기',
    enabled: true,
    minWords: 4,
    component: FillInTheBlankQuestion,
    setupQuestions: (selectedWords, allWords) => {
      const extractTargetWord = (text) => {
        const m = text?.match(/<strong[^>]*class="target-word"[^>]*>(.*?)<\/strong>/);
        return m ? m[1] : null;
      };

      const questions = [];
      for (const word of selectedWords) {
        if (!word.examples?.length) continue;
        const validExample = word.examples.find(ex => extractTargetWord(ex.origin));
        if (!validExample) continue;

        const targetWord = extractTargetWord(validExample.origin);
        const wrongOptions = allWords
          .filter(w => w.id !== word.id)
          .sort(() => Math.random() - 0.5)
          .slice(0, 3)
          .map(w => w.origin);

        const opts = shuffleArray([targetWord, ...wrongOptions]);
        questions.push({
          ...word,
          questionType: 'fillInTheBlank',
          exampleText: validExample.origin,
          exampleTranslation: validExample.meaning,
          targetWord,
          options: opts,
          resultIndex: opts.indexOf(targetWord),
          isCorrect: null,
        });
      }
      return questions;
    },
  },
  {
    id: 'cardMatch',
    label: '카드 맞추기',
    enabled: true,
    minWords: 4,
    component: CardMatchQuestion,
    setupQuestions: (selectedWords) => {
      const chunks = buildChunksAvoidingMeaningClash(selectedWords, 4);
      return chunks.map((chunk, i) => ({
        questionType: 'cardMatch',
        id: `cardMatch-set-${i}`,
        words: shuffleArray(chunk),
        vocabularySheetId: chunk[0].vocabularySheetId,
        isCorrect: null,
      }));
    },
  },
  {
    id: 'cardMatchListening',
    label: '카드 맞추기(듣기)',
    enabled: true,
    minWords: 4,
    component: CardMatchListeningQuestion,
    setupQuestions: (selectedWords) => {
      const chunks = buildChunksAvoidingMeaningClash(selectedWords, 4);
      return chunks.map((chunk, i) => ({
        questionType: 'cardMatchListening',
        id: `cardMatchListening-set-${i}`,
        words: shuffleArray(chunk),
        vocabularySheetId: chunk[0].vocabularySheetId,
        isCorrect: null,
      }));
    },
  },
];

export const getQuestionType = (id) => QUESTION_TYPE_PLUGINS.find(p => p.id === id);
