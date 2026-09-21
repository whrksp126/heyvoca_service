import CardMatchQuestion from './cardMatch/CardMatchQuestion';
import CardMatchListeningQuestion from './cardMatch/CardMatchListeningQuestion';
import FillInTheBlankQuestion from './fillInTheBlank/FillInTheBlankQuestion';
import { wordsOverlap } from '../../utils/meaningConcept';

const TARGET_WORD_RE = /<strong[^>]*class="target-word"[^>]*>(.*?)<\/strong>/;

// 빈칸 채우기 출제 가능 여부: 단어의 examples 중 강조 마커가 포함된 예문이 있는지
export const hasFillInTheBlankExample = (word) =>
  Array.isArray(word?.examples) && word.examples.some(ex => TARGET_WORD_RE.test(ex?.origin ?? ''));

// 주어진 단어 배열에서 빈칸 채우기 출제 가능한 단어 개수
export const countFillInTheBlankCandidates = (words) =>
  Array.isArray(words) ? words.filter(hasFillInTheBlankExample).length : 0;

const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
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
      if (chunk.some(c => wordsOverlap(c, w))) continue;
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
      if (chunks[j].some(c => wordsOverlap(c, single))) continue;
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
    // 역방향 사지선다 — 뜻을 보고 영어 단어 4개 중 고르기. 일반 사지선다(multipleChoice)와
    // 렌더링·채점·로깅 경로를 전부 공유한다(TakeTest.jsx/Main.jsx가 questionType으로 방향만 분기).
    // 출제 데이터 요구사항이 multipleChoice와 같아 component/setupQuestions는 동일하게 null —
    // Main.jsx 기존 코드(사지선다 인라인 렌더)와 TakeTest.jsx의 createMultipleChoiceQuestion이 처리한다.
    id: 'reverseMultipleChoice',
    label: '뜻 보고 단어 고르기',
    enabled: true,
    minWords: 4,
    component: null,
    setupQuestions: null,
  },
  {
    id: 'fillInTheBlank',
    label: '빈칸 채우기',
    enabled: false,
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
        // 뜻이 겹치는 단어는 오답 후보에서 우선 배제 — 부족하면 나머지로 채운다.
        const otherWords = allWords.filter(w => w.id !== word.id);
        const nonOverlapping = otherWords.filter(w => !wordsOverlap(word, w));
        let wrongCandidates = shuffleArray(nonOverlapping).slice(0, 3);
        if (wrongCandidates.length < 3) {
          const used = new Set(wrongCandidates.map(w => w.id));
          const fillers = shuffleArray(otherWords.filter(w => !used.has(w.id)))
            .slice(0, 3 - wrongCandidates.length);
          wrongCandidates = [...wrongCandidates, ...fillers];
        }
        const wrongOptions = wrongCandidates.map(w => w.origin);

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

// "AI 추천 학습"(quick — 홈 물주기·빠른 복습) 진입 시 쓰는 유형 후보 풀.
// enabled 플러그인에서 파생해 새 유형을 여기 배열에 추가하면 자동으로 quick에도 반영된다
// (예전엔 useQuickReview.jsx/StudyNewFullSheet.jsx 세 곳에 이 목록이 따로 복제돼 있어서
//  새 유형을 추가해도 quick에서만 빠지는 사고가 있었다).
export const QUICK_QUESTION_TYPES = QUESTION_TYPE_PLUGINS.filter(p => p.enabled).map(p => p.id);
