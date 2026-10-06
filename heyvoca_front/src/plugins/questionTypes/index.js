import CardMatchQuestion from './cardMatch/CardMatchQuestion';
import CardMatchListeningQuestion from './cardMatch/CardMatchListeningQuestion';
import FillInTheBlankQuestion from './fillInTheBlank/FillInTheBlankQuestion';
import SentenceArrangeQuestion from './sentenceArrange/SentenceArrangeQuestion';
import ListenArrangeQuestion from './sentenceArrange/ListenArrangeQuestion';
import FillInTheBlankTypingQuestion from './fillInTheBlankTyping/FillInTheBlankTypingQuestion';
import WordIntroQuestion from './wordIntro/WordIntroQuestion';
import ScriptIntroQuestion from './script/ScriptIntroQuestion';
import ScriptChoiceQuestion from './script/ScriptChoiceQuestion';
import ScriptTraceQuestion from './script/ScriptTraceQuestion';
import { wordsOverlap } from '../../utils/meaningConcept';
import { wordLang, isJa } from '../../utils/lang';
import { buildScriptChoiceQuestion } from '../../utils/scriptQuestions';

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
  빈칸 채우기 — 한 방향(ko2en)만 존재한다.
  한국어 예문을 보여 주고 영어 예문의 빈칸에 들어갈 **단어**를 고른다.
  자격: 영어 예문에 강조 마커가 있고, 보여 줄 한국어 예문이 비어 있지 않다.
  (예전에 있던 역방향 fillInTheBlankReverse(en2ko)는 제품 결정으로 제거됐다.)
*/
const FILL_RULE = {
  shown: exampleKo,
  blank: exampleEn,
  qualifies: (ex) => !!extractTargetWord(exampleEn(ex)) && stripTags(exampleKo(ex)).trim() !== '',
  // 선택지는 기본형(word.origin) — 빈칸에는 채점 후 활용형(blankFill)이 들어간다.
  optionText: (w) => (typeof w?.origin === 'string' ? w.origin.trim() : ''),
};

const qualifyingExamples = (word) => {
  if (!Array.isArray(word?.examples)) return [];
  return word.examples.filter((ex) => FILL_RULE.qualifies(ex));
};

// 빈칸 채우기 출제 가능 여부 — 영어 예문에 강조 마커 + 한국어 예문 존재.
// 두 번째 인자(옛 direction)는 호환을 위해 받기만 하고 무시한다.
export const hasFillInTheBlankExample = (word, _direction) =>
  qualifyingExamples(word).length > 0;

// 주어진 단어 배열에서 빈칸 채우기 출제 가능한 단어 개수.
// 두 번째 인자(옛 directions)는 호환을 위해 받기만 하고 무시한다.
export const countFillInTheBlankCandidates = (words, _directions) => {
  if (!Array.isArray(words)) return 0;
  return words.filter((w) => hasFillInTheBlankExample(w)).length;
};

const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// 빈칸 채우기 문제 빌더. 자격 예문이 없는 단어는 건너뛴다(호출부가 사지선다로 폴백).
//
// 계약(FRESH_SENTENCE_CONTRACT §5): 서버가 word.questionPayload.example(suggestedQuestionType
// === 'fillInTheBlank'일 때, plant 단계 payload 포함)을 이미 골라 내려주면 그 예문을 그대로
// 쓴다(최근성·수준·아는 단어 점수를 서버가 매겨 골랐으므로 프론트가 다시 고르지 않는다).
// 없으면(설정 시트 직접 선택 테스트 등 서버 payload가 없는 경로) 기존 로컬 랜덤 선택 그대로.
const buildFillInTheBlankQuestions = (selectedWords, allWords) => {
  const dir = FILL_RULE;
  const questionType = 'fillInTheBlank';
  const wordKey = (w) => w?.id ?? w?.vocaIndexId;
  const questions = [];

  for (const word of selectedWords ?? []) {
    const serverExample = word?.suggestedQuestionType === 'fillInTheBlank'
      ? word.questionPayload?.example
      : null;
    const useServerExample = !!serverExample && dir.qualifies(serverExample);

    let example;
    let exampleHash = null;
    if (useServerExample) {
      example = serverExample;
      exampleHash = word.questionPayload?.example_hash ?? null;
    } else {
      const candidates = qualifyingExamples(word);
      if (candidates.length === 0) continue;

      // 짧은 예문은 빈칸을 뚫으면 단서가 한두 단어만 남는다("I feel cold." → "I feel ___.").
      // 사전 쪽은 긴 예문으로 보강했지만, 한 단어에 긴 예문과 짧은 예문이 같이 남아 있을 수
      // 있어 출제에서도 긴 쪽(4단어 이상)을 우선 고른다. 전부 짧으면 그대로 쓴다.
      // 일본어는 띄어쓰기가 없어 단어 수 대신 문자 수(공백 제외 8자 이상)로 판정한다.
      const ja = isJa(wordLang(word));
      const longEnough = candidates.filter((ex) => {
        const plain = stripTags(exampleEn(ex)).trim();
        return ja
          ? plain.replace(/\s+/g, '').length >= 8
          : plain.split(/\s+/).length >= 4;
      });
      example = shuffleArray(longEnough.length > 0 ? longEnough : candidates)[0];
    }

    const correctText = dir.optionText(word);
    if (!correctText) continue;

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
      shownText,
      blankText,
      blankFill,
      // ja 예문 후리가나/토큰 탭용 — 빈칸 원문(blankText)의 plain 과 이어 붙이면 같다
      blankReadingTokens: Array.isArray(example?.reading_tokens) ? example.reading_tokens : null,
      options,
      resultIndex: options.indexOf(correctText),
      isCorrect: null,
      userResultIndex: null,
      // 서버가 고른 예문일 때만 존재 — /study/log 전송부(components/takeTest/Main.jsx)가
      // 있으면 example_hash로 함께 보낸다(계약 4·5절).
      exampleHash,
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
  출제형 문제 1단계 — 문장 조립·타이핑 4종(sentenceArrangePartial/sentenceArrange/listenArrange/
  fillInTheBlankTyping). 계약: heyvoca_service/docs/SENTENCE_QUESTIONS_CONTRACT.md.

  기존 빈칸 채우기와 달리 이 4종은 **프론트가 직접 문제를 조립하지 않는다** — 서버가
  puzzle 데이터를 섞고 방해 조각을 샘플링해 완성된 payload(question_payload)를
  /study/recommend 응답에 실어 준다. 그래서 setupQuestions는 로컬 생성이 아니라
  "이 단어에 이 유형의 서버 payload가 이미 붙어 있으면 문제로 승격, 없으면 건너뛴다"만 한다
  (건너뛴 단어는 호출부가 기존 fillInTheBlank와 같은 규칙으로 multipleChoice로 폴백한다).

  word.suggestedQuestionType / word.questionPayload는 pages/TakeTest.jsx의
  mapRecommendItemToWord가 /study/recommend(또는 /study/requeue-easier) 응답에서 그대로
  옮겨 붙인 값이다 — 로컬 유형 선택 테스트(설정 시트로 직접 고른 경우)에서도 이 단어가
  마침 서버 추천에서 이 유형으로 배정된 경우에만 조립형 payload를 쓸 수 있다(자동 추천과
  동일한 근거 데이터를 재사용하는 것이지, 직접 선택이 서버 배정을 강제하지는 않는다).
*/
const buildArrangeQuestions = (questionType) => (selectedWords) => {
  const out = [];
  for (const word of selectedWords ?? []) {
    if (word?.suggestedQuestionType !== questionType) continue;
    const arrange = word.questionPayload?.arrange;
    if (!arrange) continue;
    // FRESH_SENTENCE_CONTRACT §4 — 조립형 payload에도 example_hash가 함께 온다.
    out.push({
      ...word,
      questionType,
      arrange,
      isCorrect: null,
      userResultIndex: null,
      exampleHash: word.questionPayload?.example_hash ?? null,
    });
  }
  return out;
};

const buildTypingQuestions = (selectedWords) => {
  const out = [];
  for (const word of selectedWords ?? []) {
    if (word?.suggestedQuestionType !== 'fillInTheBlankTyping') continue;
    const typing = word.questionPayload?.typing;
    if (!typing) continue;
    out.push({
      ...word,
      questionType: 'fillInTheBlankTyping',
      typing,
      isCorrect: null,
      userResultIndex: null,
      exampleHash: word.questionPayload?.example_hash ?? null,
    });
  }
  return out;
};

/*
  문제 유형 플러그인 메타데이터
  - family:    '사지선다' | '카드 맞추기' | '빈칸 채우기' 묶음 — 자유 설정 테스트 시트의 [문제 유형] 칩
  - direction: 'en2ko'(영어를 보고 뜻/한국어를 고름) | 'ko2en'(뜻/한국어를 보고 영어를 고름) | null(양쪽 동시)
               — 시트의 [방향] 칩. null 이면 방향 선택과 무관하게 항상 포함.
  - listening: 듣기 변형 — 시트의 [듣기 문제 포함] 토글이 켜졌을 때만 포함.
  - autoSpeakOnShow: 문제 등장 시 Main.jsx 가 question.origin 을 자동으로 읽어 줄지. false 면 각 컴포넌트가
               직접 재생하거나(빈칸·조립·카드·만나기) 읽어 주면 문제가 무의미해지는 유형(scriptSeePick).
               생략하면 읽는다(shouldAutoSpeakOnShow).
*/
export const QUESTION_TYPE_PLUGINS = [
  {
    id: 'multipleChoice',
    label: '사지선다',
    enabled: true,
    family: 'multipleChoice',
    direction: 'en2ko',
    listening: false,
    // 상단 헤더 안내 문구(components/takeTest/Header.jsx) — 없으면 "테스트" 폴백.
    guideTitle: '알맞은 뜻을 선택하세요',
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
    guideTitle: '듣고 알맞은 뜻을 선택하세요',
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
    guideTitle: '알맞은 단어를 선택하세요',
    component: null,
    setupQuestions: null,
  },
  {
    // 빈칸 채우기 — 한국어 예문을 보고 영어 예문의 빈칸에 들어갈 단어를 고른다.
    // 방향이 하나뿐이라 direction: null — 시트의 [방향] 선택과 무관하게 항상 포함(카드 맞추기와 같다).
    id: 'fillInTheBlank',
    autoSpeakOnShow: false,
    label: '빈칸 채우기',
    enabled: true,
    family: 'fillInTheBlank',
    direction: null,
    listening: false,
    guideTitle: '빈칸에 알맞은 단어를 선택하세요',
    component: FillInTheBlankQuestion,
    setupQuestions: (selectedWords, allWords) => buildFillInTheBlankQuestions(selectedWords, allWords),
  },
  {
    id: 'cardMatch',
    autoSpeakOnShow: false,
    label: '카드 맞추기',
    enabled: true,
    family: 'cardMatch',
    direction: null,
    listening: false,
    guideTitle: '같은 뜻끼리 짝지어 보세요',
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
    autoSpeakOnShow: false,
    label: '카드 맞추기(듣기)',
    enabled: true,
    family: 'cardMatch',
    direction: null,
    listening: true,
    guideTitle: '듣고 같은 카드를 짝지어 보세요',
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
  {
    // 문장 만들기(부분 조립) — 한글 해석을 보고 목표 단어 주변 3~5조각만 조립(앞뒤는 고정 텍스트).
    // sentenceArrange(전체 조립)와 같은 family — 설정 시트에서는 "문장 만들기" 한 타일로 묶인다.
    id: 'sentenceArrangePartial',
    autoSpeakOnShow: false,
    label: '문장 만들기(부분)',
    enabled: true,
    family: 'sentenceArrange',
    direction: null,
    listening: false,
    guideTitle: '문장을 완성하세요',
    component: SentenceArrangeQuestion,
    setupQuestions: buildArrangeQuestions('sentenceArrangePartial'),
  },
  {
    // 문장 만들기(전체 조립) — 문장 전체 또는 뒷부분 최대 7조각을 조립.
    id: 'sentenceArrange',
    autoSpeakOnShow: false,
    label: '문장 만들기',
    enabled: true,
    family: 'sentenceArrange',
    direction: null,
    listening: false,
    guideTitle: '문장을 완성하세요',
    component: SentenceArrangeQuestion,
    setupQuestions: buildArrangeQuestions('sentenceArrange'),
  },
  {
    // 듣고 받아쓰기 — 영어 음성을 듣고 조립(원문 어순만 정답). "문장 만들기" family의 듣기 변형
    // — 설정 시트의 [듣기 문제 포함] 토글이 켜졌을 때만 선택지에 포함된다(카드 맞추기와 같은 방식).
    id: 'listenArrange',
    autoSpeakOnShow: false,
    label: '듣고 받아쓰기',
    enabled: true,
    family: 'sentenceArrange',
    direction: null,
    listening: true,
    guideTitle: '듣고 문장을 만드세요',
    component: ListenArrangeQuestion,
    setupQuestions: buildArrangeQuestions('listenArrange'),
  },
  {
    // 빈칸 직접 입력 — 기존 빈칸 채우기와 같은 예문, 사지선다 대신 타이핑으로 정답 입력.
    id: 'fillInTheBlankTyping',
    autoSpeakOnShow: false,
    label: '빈칸 입력',
    enabled: true,
    family: 'fillInTheBlankTyping',
    direction: null,
    listening: false,
    guideTitle: '빈칸에 단어를 입력하세요',
    component: FillInTheBlankTypingQuestion,
    setupQuestions: buildTypingQuestions,
  },
  {
    // ① "만나기" 슬라이드 — 새 씨앗 심기(plant) 세션 전용, 채점 없음(2026-09-29).
    // enabled:false — 자유 설정 테스트 시트 유형 목록·AI 추천(QUICK_QUESTION_TYPES)에는
    // 노출되지 않는다. setupQuestions도 없다 — pages/TakeTest.jsx의 buildPlantTestQuestions가
    // 단어당 1개씩 직접 만들어 배열 맨 앞에 넣는다(일반 추천 파이프라인에서는 절대 안 만들어짐).
    id: 'wordIntro',
    autoSpeakOnShow: false,
    label: '단어 만나기',
    enabled: false,
    family: 'wordIntro',
    direction: null,
    listening: false,
    guideTitle: '단어를 익혀요',
    component: WordIntroQuestion,
    setupQuestions: null,
  },
  /*
    글자(문자 학습) 4종 — 2026-09-30. 학습장 "글자" 탭(components/script/ScriptFieldBody.jsx)이
    학습하기(TakeTest, testType='script') 안에서 돌리는 전용 유형들이다. wordIntro와 마찬가지로
    enabled:false — 설정 시트 유형 목록·AI 추천(QUICK_QUESTION_TYPES)에는 노출되지 않고,
    pages/TakeTest.jsx의 buildScriptTestQuestions(utils/scriptQuestions.js)가 직접 배열을 만든다.
    글자 하나 = 단어 하나 — id/vocaIndexId는 그 글자의 user_voca_id다(백엔드가 글자장을
    일반 단어장처럼 취급). 기록은 다른 단어 유형과 같은 /study/log 경로를 그대로 쓴다.
  */
  {
    // ① 만나기 — 채점 없음(NO_GRADE_QUESTION_TYPES). UI는 components/script/IntroCard.jsx 재사용.
    id: 'scriptIntro',
    label: '글자 만나기',
    enabled: false,
    family: 'script',
    direction: null,
    listening: false,
    guideTitle: '글자를 익혀요',
    component: ScriptIntroQuestion,
    setupQuestions: null,
  },
  {
    // ② 글자를 보고 발음(한글 발음·로마자)을 고른다.
    id: 'scriptSeePick',
    // 글자를 읽어 주면 "글자 보고 발음 고르기"가 무의미해진다 — 등장 시 자동 재생 끔(정답 발음은 선택 후 ChoiceCard 가 재생).
    autoSpeakOnShow: false,
    label: '글자 보고 발음 고르기',
    enabled: false,
    family: 'script',
    direction: null,
    listening: false,
    guideTitle: '알맞은 발음을 고르세요',
    component: ScriptChoiceQuestion,
    // 재출제(오답 시 같은 유형으로 다시 만들기) 경로가 이 함수의 존재로 이 유형을
    // isSingleWordPluginType으로 인식한다 — 없으면 Main.jsx가 사지선다(meanings 기반)
    // 폴백을 시도하다 렌더가 깨진다(글자에는 meanings가 없다).
    setupQuestions: (selectedWords, allWords) => {
      const pool = (allWords && allWords.length > 0) ? allWords : selectedWords;
      return selectedWords.map((w) => buildScriptChoiceQuestion(w, pool, 'scriptSeePick'));
    },
  },
  {
    // ③ 소리를 듣고 글자를 고른다(혼동쌍 포함).
    id: 'scriptListenPick',
    label: '소리 듣고 글자 고르기',
    enabled: false,
    family: 'script',
    direction: null,
    listening: false,
    guideTitle: '듣고 알맞은 글자를 고르세요',
    component: ScriptChoiceQuestion,
    setupQuestions: (selectedWords, allWords) => {
      const pool = (allWords && allWords.length > 0) ? allWords : selectedWords;
      return selectedWords.map((w) => buildScriptChoiceQuestion(w, pool, 'scriptListenPick'));
    },
  },
  {
    // ④ 따라 쓰기 — 알파벳은 대문자·소문자 각각. 판정 없음(항상 정답), 완료 시 자동으로 다음.
    id: 'scriptTrace',
    label: '따라 쓰기',
    enabled: false,
    family: 'script',
    direction: null,
    listening: false,
    guideTitle: '따라 써 보세요',
    component: ScriptTraceQuestion,
    setupQuestions: null,
  },
];

export const getQuestionType = (id) => QUESTION_TYPE_PLUGINS.find(p => p.id === id);

// 문제 등장 시 origin 자동 읽기 여부 — 메타에 없는 알 수 없는 유형은 기존처럼 읽는다.
export const shouldAutoSpeakOnShow = (id) => getQuestionType(id)?.autoSpeakOnShow !== false;

// 채점 없이 그냥 다음으로 넘어가는 "정보 전달" 슬라이드 — Main.jsx가 onComplete를 전용
// 핸들러(정오답 집계·재출제·로깅을 전혀 타지 않는 handleNoGradeNext)로 바꿔 넘기고,
// pages/TakeTest.jsx가 결과 화면 집계에서 제외할 때 이 배열 하나를 공유한다.
export const NO_GRADE_QUESTION_TYPES = ['wordIntro', 'scriptIntro'];
export const isNoGradeQuestionType = (id) => NO_GRADE_QUESTION_TYPES.includes(id);

// 빈칸 채우기 계열(단일 단어 플러그인) 판별 — Main/TakeTest 의 분기에서 id 를 나열하지 않게.
export const FILL_IN_THE_BLANK_TYPES = QUESTION_TYPE_PLUGINS
  .filter(p => p.family === 'fillInTheBlank')
  .map(p => p.id);
export const isFillInTheBlankType = (id) => FILL_IN_THE_BLANK_TYPES.includes(id);

// 단일 단어 플러그인 전체(카드 세트가 아닌 유형) — 빈칸 채우기 + 출제형 4종(조립·타이핑).
// TakeTest.jsx/Main.jsx가 "이 유형은 단어 하나로 재구성/재출제할 수 있는가"를 물을 때 쓴다
// (family가 'cardMatch'가 아니고 setupQuestions가 있으면 자동으로 여기 포함된다 — 새 유형을
// 추가할 때 이 배열에 id를 직접 나열하지 않아도 되게 하기 위함).
export const SINGLE_WORD_PLUGIN_TYPES = QUESTION_TYPE_PLUGINS
  .filter(p => typeof p.setupQuestions === 'function' && p.family !== 'cardMatch')
  .map(p => p.id);
export const isSingleWordPluginType = (id) => SINGLE_WORD_PLUGIN_TYPES.includes(id);

// 출제형 4종(서버 payload 기반 — 로컬 setupQuestions가 word.questionPayload 유무로 스스로
// 판단한다) 판별. Main.jsx의 로그 페이로드(typo 필드 등) 분기에 쓴다.
export const SENTENCE_QUESTION_TYPES = ['sentenceArrangePartial', 'sentenceArrange', 'listenArrange', 'fillInTheBlankTyping'];
export const isSentenceQuestionType = (id) => SENTENCE_QUESTION_TYPES.includes(id);

// "문장 만들기" 구간(맨 끝 3문제 고정)으로 모으는 조립형 3종 — 빈칸 입력(fillInTheBlankTyping)은
// 문장 구간이 아니라 일반 문제로 남는다. 이 유형의 오답은 단어 상태(FSRS·작물·콤보)에 페널티를
// 주지 않는다(components/takeTest/Main.jsx processCardWord).
export const ARRANGE_QUESTION_TYPES = ['sentenceArrangePartial', 'sentenceArrange', 'listenArrange'];
export const isArrangeQuestionType = (id) => ARRANGE_QUESTION_TYPES.includes(id);

// 구간 안내는 이제 슬라이드(phaseNotice 유형)가 아니라 구간 첫 문제의 phaseStart 표식('sentence'|'retry') +
// 전체 화면 인터루드(components/takeTest/StudyInterlude.jsx PhaseInterlude)다. 구세션 저장 데이터에 남은
// phaseNotice 슬라이드는 utils/studyProgress.js normalizePhaseNotices 가 복원 시 표식으로 바꾼다.

// "AI 추천 학습"(quick — 홈 물주기·빠른 복습) 진입 시 쓰는 유형 후보 풀.
// enabled 플러그인에서 파생해 새 유형을 여기 배열에 추가하면 자동으로 quick에도 반영된다
// (예전엔 useQuickReview.jsx/StudyNewFullSheet.jsx 세 곳에 이 목록이 따로 복제돼 있어서
//  새 유형을 추가해도 quick에서만 빠지는 사고가 있었다).
export const QUICK_QUESTION_TYPES = QUESTION_TYPE_PLUGINS.filter(p => p.enabled).map(p => p.id);
