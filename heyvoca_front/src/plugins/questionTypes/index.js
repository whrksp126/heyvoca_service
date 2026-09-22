import CardMatchQuestion from './cardMatch/CardMatchQuestion';
import CardMatchListeningQuestion from './cardMatch/CardMatchListeningQuestion';
import FillInTheBlankQuestion from './fillInTheBlank/FillInTheBlankQuestion';
import { wordsOverlap } from '../../utils/meaningConcept';
import { getDisplayMeaningText } from '../../utils/displayMeanings';

// ─── 강조 마커(<strong class="target-word">…</strong>) 유틸 ─────────────────────
const TARGET_WORD_RE = /<strong\b[^>]*\btarget-word\b[^>]*>([\s\S]*?)<\/strong\s*>/i;
const stripTags = (html) => String(html ?? '').replace(/<[^>]*>/g, '');

// 강조 마커 안의 텍스트(빈칸에 들어갈 활용형). 없으면 null.
export const extractTargetWord = (text) => {
  if (typeof text !== 'string') return null;
  const m = text.match(TARGET_WORD_RE);
  if (!m) return null;
  const inner = stripTags(m[1]).trim();
  return inner || null;
};

// 예문 키 — 표준은 {origin, meaning}, 레거시 {en, ko}도 읽는다.
const exampleEn = (ex) => ex?.origin ?? ex?.en ?? '';
const exampleKo = (ex) => ex?.meaning ?? ex?.ko ?? '';

/*
  빈칸 채우기 방향 — 두 유형이 같은 컴포넌트를 쓰고, 여기 정의만 다르다.

  - ko2en(fillInTheBlank):        한국어 예문을 보여 주고 영어 예문의 빈칸에 들어갈 **단어**를 고른다.
                                  자격: 영어 예문에 강조 마커가 있고, 보여 줄 한국어 예문이 비어 있지 않다.
  - en2ko(fillInTheBlankReverse): 영어 예문을 보여 주고 한국어 예문의 빈칸에 들어갈 **뜻**을 고른다.
                                  자격: 한국어 예문에 강조 마커가 있고, 단어에 뜻이 1개 이상 있다.
*/
const FILL_DIRECTIONS = {
  ko2en: {
    shown: exampleKo,
    blank: exampleEn,
    qualifies: (word, ex) => !!extractTargetWord(exampleEn(ex)) && stripTags(exampleKo(ex)).trim() !== '',
    // 선택지는 기본형(word.origin) — 빈칸에는 채점 후 활용형(blankFill)이 들어간다.
    optionText: (w) => (typeof w?.origin === 'string' ? w.origin.trim() : ''),
  },
  en2ko: {
    shown: exampleEn,
    blank: exampleKo,
    qualifies: (word, ex) =>
      !!extractTargetWord(exampleKo(ex)) && Array.isArray(word?.meanings) && word.meanings.length > 0,
    // 선택지는 사지선다와 같은 표시 뜻 문자열(utils/displayMeanings — 단일 소스)
    optionText: (w) => getDisplayMeaningText(w?.meanings),
  },
};

const FILL_TYPE_BY_DIRECTION = { ko2en: 'fillInTheBlank', en2ko: 'fillInTheBlankReverse' };

const qualifyingExamples = (word, direction) => {
  const dir = FILL_DIRECTIONS[direction];
  if (!dir || !Array.isArray(word?.examples)) return [];
  return word.examples.filter((ex) => dir.qualifies(word, ex));
};

// 빈칸 채우기 출제 가능 여부 — 방향별(기본 ko2en: 영어 예문에 강조 마커)
export const hasFillInTheBlankExample = (word, direction = 'ko2en') =>
  qualifyingExamples(word, direction).length > 0;

// 주어진 단어 배열에서 빈칸 채우기 출제 가능한 단어 개수 — 주어진 방향 중 하나라도 되면 셈
export const countFillInTheBlankCandidates = (words, directions = ['ko2en']) => {
  if (!Array.isArray(words)) return 0;
  const dirs = Array.isArray(directions) && directions.length > 0 ? directions : ['ko2en'];
  return words.filter((w) => dirs.some((d) => hasFillInTheBlankExample(w, d))).length;
};

const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// 빈칸 채우기 문제 빌더(두 방향 공용). 자격 예문이 없는 단어는 건너뛴다(호출부가 사지선다로 폴백).
const buildFillInTheBlankQuestions = (selectedWords, allWords, direction) => {
  const dir = FILL_DIRECTIONS[direction];
  const questionType = FILL_TYPE_BY_DIRECTION[direction];
  const wordKey = (w) => w?.id ?? w?.vocaIndexId;
  const questions = [];

  for (const word of selectedWords ?? []) {
    const candidates = qualifyingExamples(word, direction);
    if (candidates.length === 0) continue;
    const correctText = dir.optionText(word);
    if (!correctText) continue;

    const example = shuffleArray(candidates)[0];
    const blankText = dir.blank(example);
    const shownText = dir.shown(example);
    const blankFill = extractTargetWord(blankText);

    // 오답 후보: 자기 자신 제외 + 선택지 문자열이 있어야 함 + 정답과 같은 문자열 제외.
    // 뜻이 겹치는 단어는 우선 배제 — 부족하면 나머지로 채운다.
    const seenTexts = new Set([correctText.toLowerCase()]);
    const otherWords = (allWords ?? []).filter((w) => {
      if (wordKey(w) === wordKey(word)) return false;
      const t = dir.optionText(w);
      if (!t || seenTexts.has(t.toLowerCase())) return false;
      seenTexts.add(t.toLowerCase());
      return true;
    });
    const nonOverlapping = otherWords.filter((w) => !wordsOverlap(word, w));
    let wrongCandidates = shuffleArray(nonOverlapping).slice(0, 3);
    if (wrongCandidates.length < 3) {
      const used = new Set(wrongCandidates.map(wordKey));
      const fillers = shuffleArray(otherWords.filter((w) => !used.has(wordKey(w))))
        .slice(0, 3 - wrongCandidates.length);
      wrongCandidates = [...wrongCandidates, ...fillers];
    }
    const wrongOptions = wrongCandidates.map(dir.optionText);

    const options = shuffleArray([correctText, ...wrongOptions]);
    questions.push({
      ...word,
      questionType,
      direction,
      shownText,
      blankText,
      blankFill,
      options,
      resultIndex: options.indexOf(correctText),
      isCorrect: null,
      userResultIndex: null,
    });
  }
  return questions;
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

/*
  문제 유형 플러그인 메타데이터
  - family:    '사지선다' | '카드 맞추기' | '빈칸 채우기' 묶음 — 자유 설정 테스트 시트의 [문제 유형] 칩
  - direction: 'en2ko'(영어를 보고 뜻/한국어를 고름) | 'ko2en'(뜻/한국어를 보고 영어를 고름) | null(양쪽 동시)
               — 시트의 [방향] 칩. null 이면 방향 선택과 무관하게 항상 포함.
  - listening: 듣기 변형 — 시트의 [듣기 문제 포함] 토글이 켜졌을 때만 포함.
*/
export const QUESTION_TYPE_PLUGINS = [
  {
    id: 'multipleChoice',
    label: '사지선다',
    enabled: true,
    family: 'multipleChoice',
    direction: 'en2ko',
    listening: false,
    component: null,       // Main.jsx 기존 코드로 처리
    setupQuestions: null,  // TakeTest.jsx 기존 코드로 처리
  },
  {
    id: 'multipleChoiceListening',
    label: '사지선다(듣기)',
    enabled: true,
    family: 'multipleChoice',
    direction: 'en2ko',
    listening: true,
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
    family: 'multipleChoice',
    direction: 'ko2en',
    listening: false,
    component: null,
    setupQuestions: null,
  },
  {
    // 빈칸 채우기(한→영) — 한국어 예문을 보고 영어 예문의 빈칸에 들어갈 단어를 고른다.
    id: 'fillInTheBlank',
    label: '빈칸 채우기',
    enabled: true,
    family: 'fillInTheBlank',
    direction: 'ko2en',
    listening: false,
    component: FillInTheBlankQuestion,
    setupQuestions: (selectedWords, allWords) => buildFillInTheBlankQuestions(selectedWords, allWords, 'ko2en'),
  },
  {
    // 빈칸 채우기(영→한) — 영어 예문을 보고 한국어 예문의 빈칸에 들어갈 뜻을 고른다.
    id: 'fillInTheBlankReverse',
    label: '빈칸 채우기(영→한)',
    enabled: true,
    family: 'fillInTheBlank',
    direction: 'en2ko',
    listening: false,
    component: FillInTheBlankQuestion,
    setupQuestions: (selectedWords, allWords) => buildFillInTheBlankQuestions(selectedWords, allWords, 'en2ko'),
  },
  {
    id: 'cardMatch',
    label: '카드 맞추기',
    enabled: true,
    family: 'cardMatch',
    direction: null,
    listening: false,
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
    family: 'cardMatch',
    direction: null,
    listening: true,
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

// 빈칸 채우기 계열(단일 단어 플러그인) 판별 — Main/TakeTest 의 분기에서 id 를 나열하지 않게.
export const FILL_IN_THE_BLANK_TYPES = QUESTION_TYPE_PLUGINS
  .filter(p => p.family === 'fillInTheBlank')
  .map(p => p.id);
export const isFillInTheBlankType = (id) => FILL_IN_THE_BLANK_TYPES.includes(id);

// "AI 추천 학습"(quick — 홈 물주기·빠른 복습) 진입 시 쓰는 유형 후보 풀.
// enabled 플러그인에서 파생해 새 유형을 여기 배열에 추가하면 자동으로 quick에도 반영된다
// (예전엔 useQuickReview.jsx/StudyNewFullSheet.jsx 세 곳에 이 목록이 따로 복제돼 있어서
//  새 유형을 추가해도 quick에서만 빠지는 사고가 있었다).
export const QUICK_QUESTION_TYPES = QUESTION_TYPE_PLUGINS.filter(p => p.enabled).map(p => p.id);
