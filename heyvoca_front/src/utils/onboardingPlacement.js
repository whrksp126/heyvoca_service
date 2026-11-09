/*
  온보딩 수준 맞춤 학습(이슈 #25) — 가입 전 게스트가 푸는 적응형 첫 학습.

  【무엇을 하나】 GET /onboarding/placement-pool 의 등급별 단어(band 1=A1 … 5=C1)로
  **답할 때마다 다음 문제를 한 개씩** 만든다. 미리 다 만들지 않는 이유는 다음 문제의 난이도가
  방금 답으로 갱신된 수준(θ)에 달려 있어서다.

    1부 체험  — **단어 유형만**(PART1_PLAN: 뜻 고르기·듣고 고르기·카드 맞추기·한→영·스펠링, 한 번씩).
               단어는 세션을 만들 때 미리 뽑은 체험 밭 8단어(drawFieldWords) 안에서 고른다.
    2부 실전  — 1부 단어 3개를 **예문 유형**(빈칸·문장 조립·문장 뜻, 한 번씩)으로 다시. 가장 쉬운 예문부터.
               예문 유형은 2부에서만 나온다(이슈 #25 3차 QA — 1부 '체험'에 문장 문제가 섞이면 2부
               '실전 문장' 안내와 어긋났다).
    3부 복습  — 틀린 단어를 **틀린 그 문제 그대로**(같은 유형·같은 문항 데이터) 한 번 더(단어당 MAX_RETRY 번 —
               4차부터 1). 이슈 #25 6차 QA: 예전엔 쉬운 뜻 고르기로 바꿔 내서 2부 예문 오답이 사지선다로 나왔다.

  【수준 θ】 백엔드 app/services/skill_level.py 와 같은 모형·척도다.
    P(정답) = σ((θ − b) / 10),  b = 문제 바탕 점수(예문 유형은 예문 score, 그 외는 단어 등급
    대표값 RANK_CENTER) + 유형 보정(QUESTION_TYPE_B_OFFSET).
  θ 는 지금까지 답 전체로 다시 추정(EAP)해 migrate 로 보낸다. 출제 등급은 아래 TUNE 주석의
  '오르기 → 안정' 계단 규칙이 정한다.
  3부(오답 복습) 재출제는 같은 단어를 다시 묻는 것이라 θ 를 움직이지 않는다(서버도 재출제는 기록 안 함).

  【저장】 기기 WebView 에서 router state 가 유실될 수 있어 세션 전체를 localStorage 에 둔다
  (STORE_KEY). 순수 JSON 이라 다시 읽어 그대로 이어 간다.

  React·플러그인 컴포넌트를 import 하지 않는다 — node 로 시뮬레이션할 수 있게(문제 스키마는
  plugins/questionTypes/* 가 읽는 형태와 같게 여기서 직접 만든다).
*/

import { wordsOverlap } from './meaningConcept.js';

// ── skill_level.py 사본 ────────────────────────────────────────────────
export const SCALE = 10;
export const RANK_CENTER = { 1: 10, 2: 27, 3: 45, 4: 65, 5: 82, 6: 95 };
export const QUESTION_TYPE_B_OFFSET = {
  multipleChoice: -10,
  cardMatch: -10,
  reverseMultipleChoice: -6,
  multipleChoiceListening: -6,
  cardMatchListening: -6,
  fillInTheBlank: -2,
  sentenceArrangePartial: 0,
  sentenceArrange: 3,
  listenArrange: 5,
  fillInTheBlankTyping: 5,
  sentenceTranslate: 5,
  spellingFill: 3,
};
export const pCorrect = (theta, b) => 1 / (1 + Math.exp(-(theta - b) / SCALE));

export const START_THETA = 15;
export const MAX_BAND = 5;
// 조정값 — node 시뮬레이션(가상 사용자 θ=10/30/50/70/90, 정답 확률대로 응답)으로 정했다. 바꾸면 sim 을 다시 돌릴 것.
//   priorSd  EAP 사전분포 N(START_THETA, priorSd) 의 폭
//   targetP  첫 오답 뒤 출제 목표 정답 확률(전체 정답률 75~90% 를 노린다)
export const TUNE = {
  priorSd: 60,
  targetP: 0.85,
};
/*
  출제 등급(band) 정하기 — 두 구간.
    오르기  아직 한 번도 안 틀렸으면 **맞힐 때마다 band +1**(1→2→…→5). 다 맞히는 사람은 1부 5번째 문제에 C1 에 닿는다.
    안정    처음 틀리면 band −1, 그 뒤로는 EAP θ 에서 P(정답)이 targetP 에 가장 가까운 단어를 고르되
            직전 band 에서 ±1 안에서만 움직인다(한 문제로 크게 튀지 않게).
  예전 규칙(시작 θ15 + 어려운 쪽 더듬기 + 출제 상한 + 예문 건너뛰기)은 너무 보수적이라 다 맞혀도
  쉬운 단어에 머물렀고, 처음 θ 에선 예문 유형이 P<0.6 으로 전부 건너뛰어져 사지선다만 나왔다.
*/
const isClimbing = (s) => !s.leftClimb;
const clampBand = (b) => Math.max(1, Math.min(MAX_BAND, b));

// ── 출제 계획 ──────────────────────────────────────────────────────────
// 이슈 #25 4차 — **문제 유형은 한 번씩만**. 1부 단어 유형 5문항(카드 맞추기 4단어 포함 8단어) +
// 2부 예문 유형 3문항 = 8문제, 그 뒤 틀린 단어 복습(3부).
// 1부 단어 8개는 세션을 만들 때 미리 뽑아 둔 '체험 밭' 단어(FIELD_BANDS)이고, 계단 규칙은 그 8개 안에서
// 어느 단어를 어느 유형으로 낼지(순서)만 정한다 — 그래야 학습 전에 밭에 심어 둔 단어가 곧 나올 단어다.
// 예문 유형(EXAMPLE_TYPES)을 1부에 넣지 말 것 — 2부(실전 문장)에서만 낸다.
export const PART1_PLAN = [
  'multipleChoice',
  'multipleChoiceListening',
  'cardMatch',
  'reverseMultipleChoice',
  'spellingFill',
];
export const CARD_MATCH_SIZE = 4;
// 2부 실전 문장 — 예문 유형만(nextPart2), 유형마다 한 번. 낼 예문이 없으면 2부를 그만큼 짧게 끝낸다
// (단어 유형으로 채우면 '실전 문장' 안내와 어긋난다).
const PART2_PLAN = ['fillInTheBlank', 'sentenceArrangePartial', 'sentenceTranslate'];
export const PART2_COUNT = PART2_PLAN.length;
// 4차 — 8문제로 줄이며 1번으로(예전 3). 다 틀리는 초보도 13~14문제에서 끝난다(아래 시뮬 표).
export const MAX_RETRY = 1;
// 체험 밭 단어 8개의 등급 구성 — 쉬운 단어부터 C1 까지 한 번씩은 닿게(θ 추정이 위아래 어느 쪽으로도 막히지 않게).
/*
  node 시뮬(가상 사용자 θ 별 400회, dev placement-pool 3벌, 정답 확률대로 응답 — 2026-11-10):
    θ   문항(복습 포함)  정답률  θ 추정 평균  |오차|   가상 진화(최소~최대)
    10      13.5          35%       12.8       4.9     1.9 (0~3)
    30      11.1          64%       32.4       6.9     2.8 (1~3)
    50       9.3          79%       49.2       7.8     2.9 (2~3)
    70       8.3          91%       68.6       8.9     3.0 (2~3)
    90       8.1          97%       78.6      11.4     3.0 (3~3)
  (예전 15문항 계단식: |오차| 3.7~7.2. 문항이 절반이라 오차는 조금 커졌다. [1,1,2,2,3,3,4,5] 는 초보 정답률 28%.)
*/
export const FIELD_BANDS = [1, 1, 1, 2, 2, 3, 4, 5];
export const FIELD_SIZE = FIELD_BANDS.length;

const EXAMPLE_TYPES = new Set(['fillInTheBlank', 'sentenceTranslate', 'sentenceArrangePartial', 'sentenceArrange']);

/** 진행바 분모 — 1부 채점 단위 + 2부 문항(재출제는 분모에 넣지 않는다, utils/studyProgress.js 와 같은 규칙). */
export const plannedProgressUnits = () =>
  PART1_PLAN.reduce((n, t) => n + (t === 'cardMatch' ? CARD_MATCH_SIZE : 1), 0) + PART2_COUNT;

// ── 문자열 유틸 ────────────────────────────────────────────────────────
const TAG_RE = /<[^>]*>/g;
const TARGET_RE = /<strong\b[^>]*\btarget-word\b[^>]*>([\s\S]*?)<\/strong\s*>/i;
const stripTags = (s) => String(s ?? '').replace(TAG_RE, '').replace(/\s+/g, ' ').trim();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const shuffle = (arr, rng = Math.random) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// 예문 영어 원문에 목표 단어 강조 마커를 보장한다 — 빈칸 채우기·문장 조립이 이 마커로 자리를 찾는다.
// 서버가 마커를 붙여 주면 그대로, 없으면 원형이 그대로 들어간 첫 자리를 감싼다. 못 찾으면 null.
export const ensureTargetMarker = (origin, word) => {
  if (!origin) return null;
  if (TARGET_RE.test(origin)) return origin;
  const plain = stripTags(origin);
  const re = new RegExp(`(^|[^A-Za-z'])(${escapeRe(word)})(?=[^A-Za-z']|$)`, 'i');
  const m = plain.match(re);
  if (!m) return null;
  const at = m.index + m[1].length;
  return `${plain.slice(0, at)}<strong class="target-word">${m[2]}</strong>${plain.slice(at + m[2].length)}`;
};

// ── 풀 정규화 ──────────────────────────────────────────────────────────
// 서버 W → 학습 화면이 읽는 단어 객체(guestQuestions.js 와 같은 모양) + 출제 메타.
export const normalizePool = (bands) => {
  const out = [];
  Object.entries(bands || {}).forEach(([band, list]) => {
    (Array.isArray(list) ? list : []).forEach((w) => {
      const meanings = (Array.isArray(w?.meanings) ? w.meanings : [])
        .map((x) => (typeof x === 'string' ? x : (x?.meaning || '')))
        .filter(Boolean)
        .slice(0, 3);
      if (w?.voca_id == null || !w?.origin || meanings.length === 0) return;
      const rank = Number(w.cefr_rank ?? band) || Number(band) || 1;
      let example = null;
      const ex = w.example;
      if (ex?.origin && stripTags(ex.meaning)) {
        const marked = ensureTargetMarker(ex.origin, w.origin);
        if (marked) {
          example = {
            origin: marked,
            meaning: stripTags(ex.meaning),
            score: Number.isFinite(Number(ex.score)) ? Number(ex.score) : RANK_CENTER[rank],
          };
        }
      }
      out.push({
        voca_id: w.voca_id,
        origin: String(w.origin).trim(),
        meanings,
        rank,
        example,
        distractorSentences: (Array.isArray(w.distractor_sentences) ? w.distractor_sentences : [])
          .filter((d) => d?.origin && d?.meaning)
          .map((d) => ({ origin: stripTags(d.origin), meaning: stripTags(d.meaning) })),
      });
    });
  });
  return out;
};

// 화면용 단어 객체(학습 화면 공통 필드). examples 는 출제에 쓸 쉬운 예문 하나만.
const toWord = (p) => ({
  id: p.voca_id,
  vocaIndexId: p.voca_id,
  origin: p.origin,
  meanings: p.meanings,
  examples: p.example ? [{ origin: p.example.origin, meaning: p.example.meaning }] : [],
  vocabularySheetId: 'guest-trial',
  fsrs: fsrsStub(),
  priorityBucket: 'new',
  isCorrect: null,
});

function fsrsStub() {
  const now = new Date();
  const next = new Date(now.getTime() + 3 * 86400000);
  return {
    state: 'new', stability: 0, difficulty: 0, retrievability: 0,
    next_review: next.toISOString(), last_review: now.toISOString(), reps: 0, lapses: 0,
  };
}

// ── 유형 자격 ──────────────────────────────────────────────────────────
const koTiles = (s) => stripTags(s).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
const enTokens = (s) => stripTags(s).split(/\s+/).filter(Boolean);

export const canUseType = (p, type) => {
  if (!p) return false;
  if (type === 'spellingFill') return p.origin.replace(/\s/g, '').length >= 2 && !/\s/.test(p.origin);
  if (!EXAMPLE_TYPES.has(type)) return true;
  if (!p.example) return false;
  if (type === 'fillInTheBlank') return enTokens(p.example.origin).length >= 3;
  if (type === 'sentenceTranslate') {
    const n = koTiles(p.example.meaning).length;
    return n >= 2 && n <= 6;
  }
  // 문장 조립 — 3~9 토큰(첫 학습이라 짧은 문장만)
  const n = enTokens(p.example.origin).length;
  return n >= 3 && n <= 9;
};

// 문제 바탕 점수 b(유형 보정 포함) — 서버 item_score + offset 과 같은 기준.
export const itemB = (p, type) => {
  const base = EXAMPLE_TYPES.has(type) && p.example ? p.example.score : RANK_CENTER[p.rank];
  return base + (QUESTION_TYPE_B_OFFSET[type] ?? 0);
};

// ── 문제 빌더 (plugins/questionTypes 가 읽는 스키마) ───────────────────
const distractorWords = (p, pool, n, rng) => {
  const others = pool.filter((x) => x.voca_id !== p.voca_id);
  // 비슷한 등급(±1)에서 먼저 — 너무 어려운 오답은 처음 보는 단어라 정답이 쉽게 드러난다
  const near = others.filter((x) => Math.abs(x.rank - p.rank) <= 1);
  const ordered = [...shuffle(near, rng), ...shuffle(others.filter((x) => !near.includes(x)), rng)];
  const picked = [];
  for (const x of ordered) {
    if (picked.length >= n) break;
    if (wordsOverlap(p, x)) continue;
    if (picked.some((y) => y.origin.toLowerCase() === x.origin.toLowerCase())) continue;
    if (x.origin.toLowerCase() === p.origin.toLowerCase()) continue;
    picked.push(x);
  }
  return picked;
};

function buildChoice(p, pool, questionType, rng) {
  const options = shuffle([p, ...distractorWords(p, pool, 3, rng)], rng)
    .map((x) => ({ id: x.voca_id, origin: x.origin, meanings: x.meanings }));
  return {
    ...toWord(p),
    suggestedQuestionType: questionType,
    reason: null,
    questionType,
    options,
    resultIndex: options.findIndex((o) => o.id === p.voca_id),
    userResultIndex: null,
    displayNextReview: null,
    isRetry: false,
  };
}

function buildCardMatch(words, rng) {
  return {
    questionType: 'cardMatch',
    id: `onb-cardMatch-${words.map((w) => w.voca_id).join('-')}`,
    words: shuffle(words.map(toWord), rng),
    vocabularySheetId: 'guest-trial',
    isCorrect: null,
  };
}

// fillInTheBlank — plugins/questionTypes/index.js buildFillInTheBlankQuestions 와 같은 필드.
function buildFill(p, pool, rng) {
  const blankText = p.example.origin;
  const m = blankText.match(TARGET_RE);
  const blankFill = m ? stripTags(m[1]) : p.origin;
  const wrong = distractorWords(p, pool, 3, rng).map((x) => x.origin);
  const options = shuffle([p.origin, ...wrong], rng);
  return {
    ...toWord(p),
    questionType: 'fillInTheBlank',
    shownText: p.example.meaning,
    blankText,
    blankFill,
    blankReadingTokens: null,
    options,
    resultIndex: options.indexOf(p.origin),
    userResultIndex: null,
    exampleHash: null,
    isRetry: false,
  };
}

function buildSpelling(p) {
  return { ...toWord(p), questionType: 'spellingFill', userResultIndex: null, isRetry: false };
}

// 문장 조립(부분) — heyvoca_back/app/services/sentence_puzzle.py build_arrange_payload(mode='partial', easy)
// 를 단순화한 것. 서버 puzzle 데이터가 없으므로 공백 단위 토큰으로 자른다.
// 조각(bank·prefix·suffix·accepted)에는 앞뒤 구두점을 붙이지 않는다("court." → "court") — 서버 계약
// §3-1 과 같다. 구두점은 answer_text(원문)에만 남고, ArrangeTray 가 그걸 보고 정답 문장 표시에 다시 얹는다.
// 약어(Mr. · Dr. · U.S. · a.m. 등)의 마침표는 문장 끝 구두점이 아니라 단어의 일부라 둔다.
const EDGE_PUNCT_RE = /^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu;
const ABBR_RE = /^(?:mr|mrs|ms|dr|jr|sr|st|mt|vs|etc|e\.g|i\.e|a\.m|p\.m|(?:[a-z]\.){1,3}[a-z])\.$/i;
const cleanPiece = (t) => {
  const core = t.replace(/^[^\p{L}\p{N}']+/u, '').replace(/[,!?;:"”’)\]]+$/u, '');
  if (ABBR_RE.test(core)) return core;
  return t.replace(EDGE_PUNCT_RE, '');
};
function buildArrange(p, pool, rng, questionType = 'sentenceArrangePartial') {
  const marked = p.example.origin;
  const rawTokens = marked.replace(TARGET_RE, (_, inner) => `\u0000${stripTags(inner)}\u0001`).split(/\s+/).filter(Boolean);
  const targetIdx = [];
  const tokens = [];
  rawTokens.forEach((t) => {
    const isTarget = t.includes('\u0000') || t.includes('\u0001');
    const piece = cleanPiece(t.replace(/[\u0000\u0001]/g, ''));
    if (!piece) return; // 구두점만 있는 토큰('—' 등)은 조각이 아니다(ArrangeTray 도 낱말로 안 센다)
    if (isTarget) targetIdx.push(tokens.length);
    tokens.push(piece);
  });
  if (targetIdx.length === 0) targetIdx.push(0);
  // 문장 맨 앞이라 대문자인 조각이 힌트가 되지 않게(서버 first_form). 'I' 와 고유명사처럼 보이는 건 둔다.
  if (tokens[0] && tokens[0] !== 'I' && !/^I'/.test(tokens[0]) && targetIdx[0] !== 0) {
    tokens[0] = tokens[0][0].toLowerCase() + tokens[0].slice(1);
  }
  const n = tokens.length;
  let start = 0;
  let end = n;
  if (questionType === 'sentenceArrangePartial') {
    const size = Math.min(n, rng() < 0.5 ? 3 : 4);
    const tStart = Math.min(...targetIdx);
    const tEnd = Math.max(...targetIdx) + 1;
    const extra = Math.max(0, size - (tEnd - tStart));
    start = Math.max(0, Math.min(tStart - Math.floor(extra / 2), n - Math.max(size, tEnd - tStart)));
    end = Math.max(tEnd, start + size);
  }
  const window = tokens.slice(start, end);
  const lowerWin = new Set(window.map((t) => t.toLowerCase()));
  const extraTokens = shuffle(
    p.distractorSentences.flatMap((d) => enTokens(d.origin))
      .concat(distractorWords(p, pool, 2, rng).map((x) => x.origin)),
    rng,
  ).map(cleanPiece).filter((t) => t && !lowerWin.has(t.toLowerCase()));
  const distractors = [...new Set(extraTokens)].slice(0, rng() < 0.5 ? 1 : 2);
  return {
    ...toWord(p),
    questionType,
    arrange: {
      bank: shuffle([...window, ...distractors], rng),
      prefix: tokens.slice(0, start).join(' '),
      suffix: tokens.slice(end).join(' '),
      accepted: [window],
      answer_text: stripTags(marked),
      ko: p.example.meaning,
      target_tokens_count: targetIdx.length,
    },
    userResultIndex: null,
    exampleHash: null,
    isRetry: false,
  };
}

// ── 문장 뜻 맞추기(sentenceTranslate) — heyvoca_back/app/services/sentence_meaning.py 이식 ──
const JOSA = ['에서는', '에게서', '으로는', '에서', '에게', '한테', '께서', '으로', '부터', '까지', '처럼',
  '보다', '이랑', '은', '는', '이', '가', '을', '를', '에', '로', '와', '과', '도', '만', '의', '랑']
  .sort((a, b) => b.length - a.length);
const MOVABLE = JOSA.filter((j) => j !== '의');
const HANGUL0 = 0xAC00;
const ADN_NEUN = new Set('하되있없않았었였겠');
const ADN_EUN = new Set('좋작많높같깊넓낮짧적싫찮옳굵얇늦젊맑밝붉검하되있없않았었였겠');
const ADN_EUL = new Set([...ADN_EUN, ...'먹읽찾받입앉잃']);
const ADN_BASE = new Set('하되가오보주사서나자타지내쓰크');
const TIME_POST = new Set(['동안', '때', '후', '전', '중', '뒤', '내내', '이후', '이전', '무렵', '도중', '만큼', '처럼',
  '대신', '쯤', '즈음', '때문', '덕분', '뿐']);
const BIND_POST = new Set(['수', '것', '거', '줄', '적', '데', '바', '채', '척', '듯', '리', '앞', '위', '아래', '밖', '옆',
  '사이', '근처', '속', '쪽']);
const ADVERBS = new Set(['오늘', '내일', '어제', '매일', '매주', '매년', '요즘', '항상', '자주', '가끔', '보통', '늘', '이미',
  '벌써', '아직', '곧', '지금', '이제', '다시', '또', '함께', '같이', '모두', '결국', '먼저', '갑자기',
  '천천히', '빨리', '열심히', '일찍', '늦게', '주로', '원래', '계속', '오래', '그냥', '아까']);
const CONNECTIVE = ['면서', '니까', '지만', '는데', '은데', '도록', '려고', '다가', '어도', '아도', '해도', '라도',
  '자마자', '거나', '든지', '듯이', '고', '서', '면', '며', '데', '러'];
const AUX_PREV = ['고', '게', '지', '아', '어', '여', '해', '워', '줘', '봐', '둬'];
const AUX_HEAD = ['있', '없', '않', '못하', '못했', '버리', '버렸', '주', '줬', '보', '봤', '싶', '하', '했', '한',
  '할', '해', '되', '됐', '된', '될', '놓', '두', '뒀', '가', '갔', '오', '왔', '계', '말'];

const endsWithAny = (w, list) => list.some((s) => w.endsWith(s));
const stem = (w) => {
  for (const j of JOSA) if (w.endsWith(j) && w.length > j.length) return w.slice(0, -j.length);
  return w;
};
const finalOf = (ch) => { const o = ch.charCodeAt(0) - HANGUL0; return o >= 0 && o < 11172 ? o % 28 : -1; };
const baseOf = (ch) => { const o = ch.charCodeAt(0) - HANGUL0; return o >= 0 && o < 11172 ? String.fromCharCode(HANGUL0 + o - (o % 28)) : ch; };
const hasJosa = (w) => w.length > 1 && endsWithAny(w, MOVABLE);
const nlFinal = (w) => !!w && [4, 8].includes(finalOf(w[w.length - 1]));
const adnominal = (w) => {
  if (w.length < 2) return false;
  const last = w[w.length - 1];
  const pre = w[w.length - 2];
  if (last === '의' || last === '던') return true;
  if (last === '는') return ADN_NEUN.has(pre);
  if (last === '은') return ADN_EUN.has(pre);
  if (last === '을') return ADN_EUL.has(pre);
  if (['를', '란', '만', '엔'].includes(last)) return false;
  return [4, 8].includes(finalOf(last)) && ADN_BASE.has(baseOf(last));
};
const isPost = (w) => !!w && w !== '안' && w !== '못' && (TIME_POST.has(w) || BIND_POST.has(w) || TIME_POST.has(stem(w)) || BIND_POST.has(stem(w)));
const link = (w, nxt, curLen, nextIsLast) => {
  if (nextIsLast && AUX_HEAD.some((h) => nxt.startsWith(h)) && endsWithAny(w, AUX_PREV) && !hasJosa(w)) return 'bind';
  if (isPost(nxt) && (!hasJosa(w) || nlFinal(w))) return 'bind';
  if (adnominal(w)) return 'bind';
  if (curLen >= 2 && (TIME_POST.has(w) || TIME_POST.has(stem(w)))) return 'end';
  if (hasJosa(w) || ADVERBS.has(w)) return 'end';
  if (w.length > 1 && endsWithAny(w, CONNECTIVE)) return 'clause';
  return 'bind';
};
const chunkTiles = (tiles) => {
  const chunks = [];
  let fixedN = 0;
  let cur = [];
  tiles.forEach((w, i) => {
    cur.push(w);
    if (i === tiles.length - 1) return;
    const kind = link(w, tiles[i + 1], cur.length, i + 1 === tiles.length - 1);
    if (kind === 'bind') return;
    chunks.push(cur);
    cur = [];
    if (kind === 'clause') fixedN = chunks.length;
  });
  return { fixed: chunks.slice(0, fixedN), movable: chunks.slice(fixedN), pred: cur };
};
const permutations = (arr) => (arr.length <= 1 ? [arr]
  : arr.flatMap((x, i) => permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p])));
export const acceptedOrders = (tiles) => {
  const orders = [[...tiles]];
  const { fixed, movable, pred } = chunkTiles(tiles);
  if (movable.length < 2 || movable.length > 4) return orders;
  const head = fixed.flat();
  permutations(movable).forEach((perm) => {
    const seq = [...head, ...perm.flat(), ...pred];
    if (!orders.some((o) => o.join('\u0001') === seq.join('\u0001'))) orders.push(seq);
  });
  return orders;
};
const conflicts = (d, answer) => {
  const sd = stem(d);
  return answer.some((a) => {
    const sa = stem(a);
    if (d === a || sd === sa) return true;
    if (sd.length >= 2 && sa.length >= 2 && sd.slice(0, 2) === sa.slice(0, 2)) return true;
    return sd.length === 1 && sa.length === 1 && sd === sa;
  });
};

function buildTranslate(p, pool, rng) {
  const tiles = koTiles(p.example.meaning);
  const sources = [
    ...p.distractorSentences.map((d) => d.meaning),
    ...shuffle(pool.filter((x) => x.voca_id !== p.voca_id && x.example), rng).slice(0, 6).map((x) => x.example.meaning),
  ];
  const cands = shuffle(sources.flatMap(koTiles), rng);
  const k = rng() < 0.5 ? 2 : 3;
  const distractors = [];
  for (const w of cands) {
    if (distractors.length >= k) break;
    if (distractors.includes(w) || conflicts(w, tiles) || distractors.some((o) => stem(o) === stem(w))) continue;
    distractors.push(w);
  }
  const bank = shuffle([...tiles, ...distractors], rng);
  const origin = p.example.origin;
  const m = origin.match(TARGET_RE);
  return {
    ...toWord(p),
    questionType: 'sentenceTranslate',
    meaning: {
      type: 'sentenceTranslate',
      lang: 'en',
      sentence: stripTags(origin),
      sentence_html: m ? origin.replace(TARGET_RE, (_, inner) => `<b>${stripTags(inner)}</b>`).replace(/<(?!\/?b>)[^>]*>/g, '') : null,
      example_hash: null,
      prefix: '',
      tiles: bank.map((t, i) => ({ id: `t${i}`, text: t })),
      accepted: acceptedOrders(tiles),
      translation: p.example.meaning,
      score: p.example.score,
    },
    userResultIndex: null,
    exampleHash: null,
    isRetry: false,
  };
}

export function buildQuestion(type, words, pool, rng = Math.random) {
  const p = words[0];
  switch (type) {
    case 'cardMatch': return buildCardMatch(words, rng);
    case 'fillInTheBlank': return buildFill(p, pool, rng);
    case 'spellingFill': return buildSpelling(p);
    case 'sentenceTranslate': return buildTranslate(p, pool, rng);
    case 'sentenceArrangePartial':
    case 'sentenceArrange': return buildArrange(p, pool, rng, type);
    default: return buildChoice(p, pool, type, rng);
  }
}

// ── 세션 ───────────────────────────────────────────────────────────────
/*
  상태(state)는 전부 JSON — localStorage 에 그대로 둔다.
    pool      정규화된 단어 풀
    theta     현재 수준 추정치
    nAnswers  θ 에 반영한 답 수(K 결정)
    step      다음에 낼 1부 계획 순번 / part2Done / 2부 대상 큐
    used      1부에서 이미 쓴 단어 id
    firstById 단어별 1부 결과 {type, correct}
    log       migrate 로 보낼 답 [{voca_id, question_type, correct}] (첫 시도만 — 1·2부)
    wrong     아직 맞히지 못한 단어 id (3부 대상)
    retryCount 단어별 재출제 수
    wrongQ    단어별 '틀린 그 문제'의 출제 직후 사본(3부에서 그대로 다시 낸다)
    pendingQ  지금 화면 문제의 출제 직후 사본(플러그인이 문제 객체에 답을 써 넣기 전)
    pending   지금 화면에 낸 문제의 정보 {kind:'p1'|'p2'|'p3', type, ids}
    current   지금 화면의 문제 객체(복원용)
*/
export function createSession(bands, { theta = START_THETA, rng = Math.random } = {}) {
  const pool = normalizePool(bands);
  const fieldIds = drawFieldWords(pool, rng);
  return {
    v: 2,
    pool,
    fieldIds,
    farm: initVirtualFarm(pool, fieldIds),
    farmStart: null,
    farmKeys: {},
    theta,
    band: 1,
    nAnswers: 0,
    step: 0,
    part2Done: 0,
    used: [],
    firstById: {},
    log: [],
    wrong: [],
    retryCount: {},
    wrongQ: {},
    pendingQ: null,
    pending: null,
    current: null,
    done: false,
  };
}

// 사후 평균(EAP) — 지금까지의 모든 답 (b, 정답)을 근거로 θ 를 다시 추정한다. 사전분포는 N(START_THETA, priorSd).
// 같은 P 모형(σ((θ−b)/10))을 쓰므로 서버 식과 척도가 같고, 쉬운 문제를 맞힌 건 약한 근거, 어려운 문제를
// 맞힌 건 강한 근거로 저절로 반영돼 초반에 튀지 않으면서도 잘하는 사람은 몇 문제 만에 올라온다.
const eapTheta = (items) => {
  let num = 0;
  let den = 0;
  let sq = 0;
  for (let t = 0; t <= 100; t += 1) {
    let lw = -((t - START_THETA) ** 2) / (2 * TUNE.priorSd ** 2);
    items.forEach(([b, c]) => {
      const p = pCorrect(t, b);
      lw += Math.log(c ? p : 1 - p);
    });
    const w = Math.exp(lw);
    num += w * t;
    den += w;
    sq += w * t * t;
  }
  if (!(den > 0)) return { mean: START_THETA, sd: TUNE.priorSd };
  const mean = num / den;
  return { mean, sd: Math.sqrt(Math.max(0, sq / den - mean * mean)) };
};

const updateTheta = (s, b, correct) => {
  s.items = [...(s.items || []), [b, correct ? 1 : 0]];
  const est = eapTheta(s.items);
  s.theta = est.mean;
  s.thetaSd = est.sd;
  s.nAnswers += 1;
};

// 이번 문제의 단어. 오르기 구간은 지금 band 의 단어에서 쉬운(짧은·쉬운 예문) 것부터,
// 안정 구간은 band ±1 안에서 P(정답)이 targetP 에 가장 가까운 것(어려운 쪽은 1.5배 벌점). 근처 3개 중 무작위.
const pickWords = (s, type, count, rng, extraFilter = () => true) => {
  const used = new Set(s.used);
  const band = s.band ?? 1;
  const climbing = isClimbing(s);
  const field = Array.isArray(s.fieldIds) && s.fieldIds.length ? new Set(s.fieldIds) : null;
  const base = s.pool.filter((p) => !used.has(p.voca_id) && (!field || field.has(p.voca_id))
    && canUseType(p, type) && extraFilter(p));
  // 정해진 band 에 단어가 모자라면 가까운 band 로 넓힌다
  let cands = [];
  for (let r = 0; r <= MAX_BAND && cands.length < count; r += 1) {
    cands = base.filter((p) => Math.abs(p.rank - band) <= (climbing ? r : Math.max(1, r)));
  }
  const ease = (p) => (EXAMPLE_TYPES.has(type) && p.example ? p.example.score : 0) + p.origin.length;
  const scored = cands.map((p) => {
    const pc = pCorrect(s.theta, itemB(p, type));
    const d = climbing
      ? Math.abs(p.rank - band) * 10 + ease(p) / 100
      : (pc < TUNE.targetP ? (TUNE.targetP - pc) * 1.5 : pc - TUNE.targetP);
    return { p, d, ease: ease(p) };
  }).sort((x, y) => (x.d - y.d) || (x.ease - y.ease));
  if (count === 1) {
    const top = scored.filter((x) => x.d <= (scored[0]?.d ?? 0) + (climbing ? 0.1 : 0.03)).slice(0, 3);
    if (!top.length) return [];
    return [top[Math.floor(rng() * top.length)].p];
  }
  // 카드 맞추기 — 뜻이 서로 겹치지 않는 count 개
  const set = [];
  for (const { p } of scored) {
    if (set.length >= count) break;
    if (set.some((x) => wordsOverlap(x, p))) continue;
    set.push(p);
  }
  return set.length >= 2 ? set : [];
};

const byId = (s, id) => s.pool.find((p) => p.voca_id === id);

// 1부 다음 문제 — 단어 유형만. 2부(실전 문장)에서 다시 물을 수 있게 예문 있는 단어를 먼저 고르고,
// 없으면 아무 단어나. 그 유형에 맞는 단어가 없으면(스펠링인데 띄어쓰기 단어 등) 뜻 고르기로 채운다.
const nextPart1 = (s, rng) => {
  while (s.step < PART1_PLAN.length) {
    let type = PART1_PLAN[s.step];
    s.step += 1;
    const count = type === 'cardMatch' ? CARD_MATCH_SIZE : 1;
    let words = pickWords(s, type, count, rng, (p) => !!p.example);
    if (words.length === 0) words = pickWords(s, type, count, rng);
    if (words.length === 0 && type !== 'multipleChoice') {
      type = 'multipleChoice';
      words = pickWords(s, type, 1, rng);
    }
    if (words.length === 0) continue;
    words.forEach((w) => s.used.push(w.voca_id));
    s.pending = { kind: 'p1', type, ids: words.map((w) => w.voca_id) };
    return buildQuestion(type, words, s.pool, rng);
  }
  return null;
};

// 2부 실전 — 1부 단어 PART2_COUNT 개를 **예문 유형**(PART2_PLAN 순서)으로 다시 묻는다.
// 예문은 단어마다 풀이 준 가장 쉬운 것 하나뿐이다. 단어는 1부에서 다른 유형으로 만난 것 중
// 지금 θ 에서 P(정답)이 targetP 에 가까운 것(같으면 예문 score 낮은 것) — 잘하는 사람이 A1 단어를 다시 보지 않게.
// 계획한 유형을 낼 단어가 없으면 다른 예문 유형으로. 예문 유형을 낼 단어가 없으면 2부를 끝낸다.
const nextPart2 = (s, rng) => {
  const asked = new Set(s.part2Asked || []);
  if (s.part2Done >= PART2_COUNT) return null;
  const words = Object.keys(s.firstById).map(Number)
    .filter((id) => !asked.has(id)).map((id) => byId(s, id)).filter(Boolean);
  if (words.length === 0) return null;
  // 유형은 한 번씩 — 계획한 유형부터, 그 유형을 낼 단어가 없으면 아직 안 낸 다른 예문 유형으로.
  const doneTypes = new Set(s.part2Types || []);
  const planned = PART2_PLAN[s.part2Done % PART2_PLAN.length];
  const order = [planned, ...PART2_PLAN.filter((t) => t !== planned)].filter((t) => !doneTypes.has(t));
  let pick = null;
  for (const t of order) {
    const fit = (p) => {
      const pc = pCorrect(s.theta, itemB(p, t));
      return pc < TUNE.targetP ? (TUNE.targetP - pc) * 1.5 : pc - TUNE.targetP;
    };
    const cands = words
      .filter((p) => s.firstById[p.voca_id]?.type !== t && canUseType(p, t))
      .map((p) => ({ p, d: fit(p) }))
      .sort((x, y) => (x.d - y.d) || ((x.p.example?.score ?? 99) - (y.p.example?.score ?? 99)));
    if (cands.length) {
      const top = cands.filter((x) => x.d <= cands[0].d + 0.03).slice(0, 2);
      pick = { p: top[Math.floor(rng() * top.length)].p, t };
      break;
    }
  }
  if (!pick) return null;
  const { p, t: type } = pick;
  s.part2Asked = [...asked, p.voca_id];
  s.part2Done += 1;
  s.lastP2Type = type;
  s.part2Types = [...doneTypes, type];
  s.pending = { kind: 'p2', type, ids: [p.voca_id] };
  const q = buildQuestion(type, [p], s.pool, rng);
  // 2부 = 문장 문제만이라 안내도 '실전 문장'(StudyInterlude PHASE_COPY.sentence)
  if (s.part2Done === 1) q.phaseStart = 'sentence';
  return q;
};

// 3부 — 아직 못 맞힌 단어를 **틀린 그 문제 그대로** 다시(최대 MAX_RETRY). 사본이 없으면(구버전 세션) 뜻 고르기.
// 카드 맞추기처럼 한 문제에 틀린 단어가 여럿이면 그 문제를 한 번만 내고, 함께 든 틀린 단어도 재출제 1회로 센다.
const nextPart3 = (s, rng) => {
  while (s.wrong.length > 0) {
    const id = s.wrong[0];
    const count = s.retryCount[id] ?? 0;
    if (count >= MAX_RETRY) { s.wrong.shift(); continue; }
    const p = byId(s, id);
    if (!p) { s.wrong.shift(); continue; }
    const first = !s.startedRetry;
    s.startedRetry = true;
    // 같은 단어를 연달아 두 번 묻지 않게 — 한 단어를 낸 뒤 줄 맨 뒤로 보낸다
    s.wrong.push(s.wrong.shift());
    const snap = s.wrongQ?.[id];
    let q;
    if (snap) {
      q = { ...JSON.parse(JSON.stringify(snap)), isCorrect: null, userResultIndex: null, isRetry: true };
      delete q.phaseStart;
    } else {
      q = { ...buildQuestion('multipleChoice', [p], s.pool, rng), isRetry: true };
    }
    const ids = Array.isArray(q.words) ? q.words.map((w) => w.vocaIndexId ?? w.id) : [id];
    if (!ids.includes(id)) ids.push(id);
    ids.forEach((x) => { if (s.wrong.includes(x)) s.retryCount[x] = (s.retryCount[x] ?? 0) + 1; });
    s.pending = { kind: 'p3', type: q.questionType, ids };
    if (first) q.phaseStart = 'retry';
    return q;
  }
  return null;
};

/**
 * 방금 화면에 있던 문제의 결과를 반영하고 다음 문제를 만든다. 더 낼 게 없으면 null(세션 끝).
 * @param s        세션 상태(제자리 변경)
 * @param answered 방금 끝난 문제 객체(채점 결과가 q.isCorrect / q.words[].isCorrect 에 들어 있다). 첫 문제를 만들 땐 null.
 */
export function advance(s, answered, rng = Math.random) {
  if (s.done) return null;
  const pend = s.pending;
  if (pend && answered) {
    const results = Array.isArray(answered.words)
      ? answered.words.map((w) => [w.vocaIndexId ?? w.id, w.isCorrect === true])
      : [[answered.vocaIndexId ?? answered.id, answered.isCorrect === true]];
    results.forEach(([id, correct]) => {
      const p = byId(s, id);
      if (!p) return;
      if (pend.kind === 'p3') {
        // 카드 맞추기 재출제엔 이미 맞힌 단어도 같이 들어 있다 — 틀렸던 단어만 센다
        if (correct && s.wrong.includes(id)) {
          s.wrong = s.wrong.filter((x) => x !== id);
          s.filled = (s.filled ?? 0) + 1; // 틀렸던 칸을 채운다(진행바)
        }
        return;
      }
      if (correct) s.filled = (s.filled ?? 0) + 1;
      // 2부에서 맞히면 3부(오답 복습) 대상에서 뺀다 — 이미 맞힌 단어를 또 묻지 않는다
      if (pend.kind === 'p2' && correct) s.wrong = s.wrong.filter((x) => x !== id);
      updateTheta(s, itemB(p, pend.type), correct);
      s.log.push({ voca_id: id, question_type: pend.type, correct });
      if (pend.kind === 'p1') s.firstById[id] = { type: pend.type, correct };
      if (!correct && pend.kind === 'p1' && !s.wrong.includes(id)) s.wrong.push(id);
      if (!correct && pend.kind === 'p2' && !s.wrong.includes(id)) s.wrong.push(id);
      // 3부는 틀린 그 문제를 그대로 다시 낸다 — 마지막으로 틀린 문제(2부가 1부보다 뒤)를 남긴다
      if (!correct && s.pendingQ) s.wrongQ = { ...(s.wrongQ || {}), [id]: s.pendingQ };
    });
  }
  if (pend && answered && pend.kind !== 'p3') {
    const allRight = Array.isArray(answered.words)
      ? answered.words.every((w) => w.isCorrect === true)
      : answered.isCorrect === true;
    s.nQuestions = (s.nQuestions ?? 0) + 1;
    s.streak = allRight ? (s.streak ?? 0) + 1 : 0;
    // 다음 band — 오르기 구간(아직 안 틀림)은 +1, 첫 오답은 −1. 그 뒤(안정)는 pickWords 가 θ 로 고르고
    // 여기서는 방금 낸 단어의 band 를 기준점으로 남긴다.
    const askedBand = Math.round(pend.ids.map((id) => byId(s, id)?.rank ?? 1)
      .reduce((n, r) => n + r, 0) / Math.max(1, pend.ids.length));
    const wasClimbing = !s.leftClimb;
    if (wasClimbing && allRight) s.band = clampBand(askedBand + 1);
    else if (wasClimbing) { s.band = clampBand(askedBand - 1); s.leftClimb = true; }
    else s.band = askedBand;
  }
  s.pending = null;
  // 첫 문제 앞 '문제 유형을 하나씩 체험해요'(PHASE_COPY.trial) 안내는 없앴다(이슈 #25 4차) — 온보딩 '체험 밭'
  // 장면이 그 자리를 대신한다. 학습 화면 안 안내가 떠 있는 동안 아직 안 보이는 첫 문제의 TTS 가 먼저 나왔다.
  const q = nextPart1(s, rng) || nextPart2(s, rng) || nextPart3(s, rng);
  // 출제 직후 사본 — 플러그인이 문제 객체에 답(isCorrect·userResultIndex 등)을 써 넣기 전 상태
  s.pendingQ = q && s.pending?.kind !== 'p3' ? JSON.parse(JSON.stringify(q)) : null;
  s.current = q;
  if (!q) s.done = true;
  return q;
}

/** 지금 화면에 낼 문제 — 복원 시 저장된 current, 처음이면 새로 만든다. */
export function currentQuestion(s, rng = Math.random) {
  if (s.current) return s.current;
  if (s.done) return null;
  return advance(s, null, rng);
}

/** 결과 요약 — 정답률·θ·답 기록(migrate 용). */
export function summarize(s) {
  const firsts = Object.values(s.firstById);
  const correct = s.log.filter((a) => a.correct).length;
  return {
    theta: Math.round(s.theta * 10) / 10,
    answers: s.log,
    uniqueWords: firsts.length,
    asked: s.log.length,
    correct,
  };
}

/**
 * 결과 화면 목록 — 1부에서 만난 단어마다 한 줄(첫 시도 정오답). 화면의 문제 배열이 아니라 세션에서 만든다:
 * 학습 중 새로고침·재진입하면 화면 배열엔 그 뒤 문제만 남기 때문이다.
 */
export function resultWords(s) {
  return Object.keys(s?.firstById || {}).map(Number)
    .map((id) => {
      const p = byId(s, id);
      if (!p) return null;
      return { ...toWord(p), questionType: s.firstById[id].type, isCorrect: s.firstById[id].correct };
    })
    .filter(Boolean);
}

/** 진행바에 이미 채워진 칸 수 — 화면 복원(재진입) 때 Main 진행바 오프셋으로 쓴다. */
export const filledUnits = (s) => Math.min(s?.filled ?? 0, plannedProgressUnits());

/** 이미 통과(정답 처리)된 단어 id — 진행바 복원용. */
export function passedIds(s) {
  const wrong = new Set(s.wrong);
  return Object.keys(s.firstById).map(Number).filter((id) => !wrong.has(id));
}

// ── 체험 밭 단어 ─────────────────────────────────────────────────────────
/*
  학습 전에 밭에 심어 보여 줄 8단어 = 1부에서 실제로 낼 8단어. 적응형이라 다음 단어를 미리 알 수 없으므로
  등급 구성(FIELD_BANDS)을 고정해 미리 뽑고, 1부 계단 규칙은 이 안에서 순서만 고른다.
  모든 유형을 한 번씩 낼 수 있게 — 띄어쓰기 없는 단어(단어 쓰기)·2부 예문 유형 셋을 다 낼 수 있는 예문을
  가진 단어를 먼저, 서로 뜻이 겹치지 않게(카드 맞추기) 고른다. 모자라면 조건을 하나씩 풀어 채운다.
*/
const exampleScore = (p) => ['fillInTheBlank', 'sentenceArrangePartial', 'sentenceTranslate']
  .filter((t) => canUseType(p, t)).length;
export function drawFieldWords(pool, rng = Math.random) {
  const picked = [];
  const tiers = [
    (p) => exampleScore(p) === 3 && canUseType(p, 'spellingFill'),
    (p) => exampleScore(p) >= 2 && canUseType(p, 'spellingFill'),
    (p) => !!p.example && canUseType(p, 'spellingFill'),
    () => true,
  ];
  FIELD_BANDS.forEach((band) => {
    for (const ok of tiers) {
      for (let r = 0; r <= MAX_BAND; r += 1) {
        const cands = pool.filter((p) => Math.abs(p.rank - band) === r && ok(p)
          && !picked.some((x) => x.voca_id === p.voca_id || wordsOverlap(x, p)
            || x.origin.toLowerCase() === p.origin.toLowerCase()));
        if (cands.length) {
          // 쉬운 쪽(짧은 단어·쉬운 예문)에서 — 첫 학습이라
          const ease = (p) => p.origin.length + (p.example ? p.example.score / 10 : 10);
          const top = [...cands].sort((a, b) => ease(a) - ease(b)).slice(0, 6);
          picked.push(top[Math.floor(rng() * top.length)]);
          return;
        }
      }
    }
  });
  return picked.map((p) => p.voca_id);
}

// ── 가상 농장 ──────────────────────────────────────────────────────────
/*
  체험 밭 작물의 가상 상태 — 서버에 아무것도 심지 않는다. 학습 화면 농장 결과 바(FarmResultBar)가
  이 값을 실제 /study/log 농장 payload 와 같은 모양으로 받아 그대로 그린다.

  【실제 규칙을 줄여 쓴다】 작물 XP 문턱은 실제와 같다(cropXp.js: 씨앗 0→50, 새싹 50→210, 이파리 210→600,
  당근 600→1800 — 막대·숫자가 실제 화면과 같은 말을 해야 한다). 실제로는 '기억 1일 = 10XP' 라 한 번에
  한 단계가 오르기 어렵지만, 8문제 안에서 진화를 보여 주려고
    정답  지금 단계 폭의 GAIN_PCT% 만큼 오른다(문턱을 넘으면 다음 단계로 진화).
    오답  단계 폭의 LOSS_PCT% 만큼 줄고(실제와 같이 현재 단계 시작점 아래로는 안 내려간다) 한 단계 마른다
          (싱싱 → 마름 → 시듦). 단계는 내려가지 않는다(기획 5.2).
    시든 작물을 맞히면 되살아난다(싱싱).
  당근은 황금 당근으로 넘어가지 않는다(체험에선 다루지 않는다).

  시작 상태는 단어 id 해시로 정해진다(같은 단어 = 같은 그림). 진화가 1~3번 보이게 쉬운 단어 쪽(1·2등급)에
  문턱 가까운 작물 셋을 둔다 — 다 맞히면 3번, 쉬운 단어를 하나 틀리면 2번. 어려운 쪽은 막 단계에 들어선 작물이라
  한 번 맞혀서는 진화하지 않는다.
*/
export const VFARM_GAIN_PCT = 40;
export const VFARM_LOSS_PCT = 25;
const VFARM_STAGES = ['PLANTED_SEED', 'SPROUT', 'LEAF', 'CARROT'];
const VFARM_FLOOR = { PLANTED_SEED: 0, SPROUT: 50, LEAF: 210, CARROT: 600 };
const VFARM_NEXT = { PLANTED_SEED: 50, SPROUT: 210, LEAF: 600, CARROT: 1800 };
const VFARM_CROP = { PLANTED_SEED: 'seed', SPROUT: 'sprout', LEAF: 'leaf', CARROT: 'carrot' };
// 쉬운 쪽 4 · 어려운 쪽 4. pct = 단계 안 진행률(0~100).
const VFARM_EASY = [
  { stage: 'PLANTED_SEED', health: 'FRESH', pct: 66 },
  { stage: 'LEAF', health: 'THIRSTY', pct: 62 },
  { stage: 'SPROUT', health: 'WILTED', pct: 70 },
  { stage: 'PLANTED_SEED', health: 'FRESH', pct: 14 },
];
const VFARM_HARD = [
  { stage: 'SPROUT', health: 'FRESH', pct: 10 },
  { stage: 'LEAF', health: 'FRESH', pct: 4 },
  { stage: 'LEAF', health: 'WILTED', pct: 8 },
  { stage: 'CARROT', health: 'FRESH', pct: 40 },
];
// 단어 id 해시(FNV-1a) — 결정적 배정용
export const hashId = (id) => {
  let h = 0x811c9dc5;
  const str = String(id);
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
};
const xpAt = (stage, pct) => Math.round(VFARM_FLOOR[stage] + (pct / 100) * (VFARM_NEXT[stage] - VFARM_FLOOR[stage]));

export function initVirtualFarm(pool, fieldIds) {
  const rank = (id) => pool.find((p) => p.voca_id === id)?.rank ?? 1;
  const byHash = (a, b) => hashId(a) - hashId(b);
  const ids = [...(fieldIds || [])];
  // 쉬운 쪽 = 등급 낮은 절반(같으면 해시 순) — 템플릿은 해시 순서로 배정
  const sorted = [...ids].sort((a, b) => (rank(a) - rank(b)) || byHash(a, b));
  const easy = sorted.slice(0, Math.ceil(sorted.length / 2)).sort(byHash);
  const hard = sorted.slice(Math.ceil(sorted.length / 2)).sort(byHash);
  const farm = {};
  easy.forEach((id, i) => { const t = VFARM_EASY[i % VFARM_EASY.length]; farm[id] = { stage: t.stage, health: t.health, xp: xpAt(t.stage, t.pct) }; });
  hard.forEach((id, i) => { const t = VFARM_HARD[i % VFARM_HARD.length]; farm[id] = { stage: t.stage, health: t.health, xp: xpAt(t.stage, t.pct) }; });
  return farm;
}

/** 가상 작물 하나에 채점 1건을 반영한 다음 상태와 상태 바 payload. 순수 함수. */
export function stepVirtualCrop(cur, correct) {
  const span = VFARM_NEXT[cur.stage] - VFARM_FLOOR[cur.stage];
  let { stage, health, xp } = cur;
  const revived = !!correct && health !== 'FRESH';
  let withered = false;
  if (correct) {
    xp += Math.round(span * VFARM_GAIN_PCT / 100);
    health = 'FRESH';
    while (stage !== 'CARROT' && xp >= VFARM_NEXT[stage]) stage = VFARM_STAGES[VFARM_STAGES.indexOf(stage) + 1];
    if (stage === 'CARROT') xp = Math.min(xp, VFARM_NEXT.CARROT - 1);
  } else {
    xp = Math.max(VFARM_FLOOR[stage], xp - Math.round(span * VFARM_LOSS_PCT / 100));
    const nextHealth = health === 'FRESH' ? 'THIRSTY' : 'WILTED';
    withered = nextHealth !== health;
    health = nextHealth;
  }
  const next = { stage, health, xp };
  const pctOf = (st, x) => Math.max(0, Math.min(100, Math.round(((x - VFARM_FLOOR[st]) / (VFARM_NEXT[st] - VFARM_FLOOR[st])) * 100)));
  const payload = {
    crop: VFARM_CROP[stage], stage,
    crop_from: VFARM_CROP[cur.stage], stage_from: cur.stage,
    grew: stage !== cur.stage,
    pct_from: pctOf(cur.stage, cur.xp), pct_to: pctOf(stage, xp),
    xp_from: cur.xp, xp_to: xp, xp_delta: xp - cur.xp, xp_next: VFARM_NEXT[stage],
    health, health_from: cur.health,
    revived, withered,
    days_to_review: null,
    wasCorrect: !!correct,
    virtual: true,
  };
  return { next, payload };
}

/**
 * 학습 화면이 채점할 때 부른다 — 그 단어 가상 작물을 바꾸고 상태 바 payload 를 돌려준다.
 * key(문제 자리:단어)로 한 번만 반영한다(같은 채점을 두 번 부르거나 화면을 다시 그려도 두 번 자라지 않게).
 * 체험 밭 단어가 아니면 null.
 */
export function gradeVirtualFarm(s, vocaId, correct, key) {
  if (!s?.farm) return null;
  s.farmKeys = s.farmKeys || {};
  if (key != null && s.farmKeys[key]) return s.farmKeys[key];
  const cur = s.farm[vocaId];
  if (!cur) return null;
  if (!s.farmStart) s.farmStart = JSON.parse(JSON.stringify(s.farm));
  const { next, payload } = stepVirtualCrop(cur, correct);
  s.farm[vocaId] = next;
  if (key != null) s.farmKeys[key] = payload;
  return payload;
}

/** 밭에 그릴 단어 목록 — 체험 밭 순서대로 { id, origin, meanings, rank, stage, health, xp }. */
export function fieldWords(s, { start = false } = {}) {
  const src = start ? (s?.farmStart || s?.farm) : s?.farm;
  return (s?.fieldIds || []).map((id) => {
    const p = byId(s, id);
    const f = src?.[id];
    if (!p || !f) return null;
    return { id, origin: p.origin, meanings: p.meanings, rank: p.rank, ...f };
  }).filter(Boolean);
}

// ── 저장 ───────────────────────────────────────────────────────────────
export const STORE_KEY = 'heyvoca_guest_onb_session_v1';
export function saveSession(s) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* 저장 실패 무시 */ }
}
export function loadSession() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { return null; }
}
export function clearSession() {
  try { localStorage.removeItem(STORE_KEY); } catch { /* 무시 */ }
}
