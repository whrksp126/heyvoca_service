/*
  온보딩 수준 맞춤 학습(이슈 #25) — 가입 전 게스트가 푸는 적응형 첫 학습.

  【무엇을 하나】 GET /onboarding/placement-pool 의 등급별 단어(band 1=A1 … 5=C1)로
  **답할 때마다 다음 문제를 한 개씩** 만든다. 미리 다 만들지 않는 이유는 다음 문제의 난이도가
  방금 답으로 갱신된 수준(θ)에 달려 있어서다.

    1부 체험  — 유형마다 한 번씩(PART1_PLAN). 새 단어만.
    2부 실전  — 1부 단어 5개를 **다른 유형**으로 다시(농장 돌보기처럼). 예문 유형은 가장 쉬운 예문만.
    3부 복습  — 첫 시도에 틀린 단어를 맞힐 때까지(단어당 최대 MAX_RETRY 번) 쉬운 뜻 고르기로.

  【수준 θ】 백엔드 app/services/skill_level.py 와 같은 모형·척도다.
    P(정답) = σ((θ − b) / 10),  b = 문제 바탕 점수(예문 유형은 예문 score, 그 외는 단어 등급
    대표값 RANK_CENTER) + 유형 보정(QUESTION_TYPE_B_OFFSET).
  다른 점 — 서버의 θ += K·(정답 − P) 한 걸음 갱신 대신 **지금까지 답 전체로 다시 추정(EAP)**한다.
    시작 θ 15 에서 K 갱신은 잘하는 사람이 20문제 안에 제 수준에 못 닿았다(θ=80 → 40 에서 끝, 정답률 99.6%),
    K·도약을 키우면 처음인 사람이 몇 문제 운 좋게 맞혀 튀었다가 어려운 문제를 연달아 틀렸다.
    EAP 는 쉬운 문제를 맞힌 건 약한 근거, 어려운 걸 맞힌 건 강한 근거로 저절로 다룬다.
    출제 규칙(TUNE, 값은 node 시뮬레이션으로 정함):
      - 아직 안 틀렸으면 P≈probeP(어려운 쪽)로 위를 더듬는다 — 잘하는 사람이 빨리 올라온다.
      - 한 번 틀린 뒤로는 P≈targetP, 그리고 (추정 − caution·불확실성) 기준으로 쉬운 쪽에 선다.
      - 출제 θ 상한(cap)을 문제마다 조금씩 연다 — 첫 정답 하나로 갑자기 어려워지지 않게.
      - 처음인 사람에게 예문 유형의 가장 쉬운 문제도 P < skipBelow 면 그 유형은 이번엔 건너뛴다.
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
// 조정값 — 시뮬레이션(가상 사용자 θ=20/50/80, 정답 확률대로 응답)으로 정했다. 바꾸면 sim 을 다시 돌릴 것.
//   priorSd   사전분포 N(START_THETA, priorSd) 의 폭 — 넓을수록 잘하는 사람이 빨리 올라온다
//   targetP   한 번 틀린 뒤의 출제 목표 정답 확률
//   probeP    아직 안 틀린 동안의 목표(어려운 쪽 더듬기), probeFrom~probeN 답 사이에서만
//   caution   틀린 뒤 출제 θ = 추정 − caution × 사후 표준편차
//   capStep   출제 θ 상한을 문제마다 여는 폭, 연속 정답이면 × (1 + capGrow × (연속 − 1))
//   skipBelow 예문 유형 가장 쉬운 문제의 P 가 이보다 낮으면 그 유형은 건너뜀
export const TUNE = {
  priorSd: 60,
  targetP: 0.9,
  probeP: 0.3, probeFrom: 1, probeN: 30,
  caution: 1,
  capStep: 8, capGrow: 3,
  skipBelow: 0.6,
};
// 출제 목표 P — 아직 한 번도 안 틀렸으면 probeP(더 어려운 쪽)로 빨리 위를 더듬고, 처음 틀린 뒤로는 targetP.
const goalP = (s) => (s.nAnswers >= TUNE.probeFrom && s.nAnswers < TUNE.probeN && !(s.log || []).some((a) => !a.correct) ? TUNE.probeP : TUNE.targetP);
// 출제에 쓰는 θ — 한 번이라도 틀린 뒤로는 추정이 불확실한 만큼(사후 표준편차 × caution) 쉬운 쪽으로 잡는다.
// 처음인 사람이 몇 문제 운 좋게 맞혀 추정이 튀어도 갑자기 어려운 문제가 나오지 않게.
const selTheta = (s) => {
  const missed = (s.log || []).some((a) => !a.correct);
  const t = missed ? s.theta - TUNE.caution * (s.thetaSd ?? TUNE.priorSd) : s.theta;
  // 오르는 속도 제한 — 쉬운 문제 하나 맞혔다고 추정이 확 뛰어도 출제는 문제당 capStep 씩만 올린다.
  return Math.min(t, s.cap ?? START_THETA);
};

// ── 출제 계획 ──────────────────────────────────────────────────────────
// 1부 — 유형마다 한 번씩. 카드 맞추기 4단어 포함 13단어 10문항.
// (4지선다 문장 뜻 고르기 sentenceMeaning 은 2026-10-30 출제 중단·컴포넌트 삭제 —
//  같은 '문장 뜻' 자리를 지금 쓰는 sentenceTranslate(해석 조립)로 낸다.)
export const PART1_PLAN = [
  'multipleChoice',
  'multipleChoiceListening',
  'cardMatch',
  'reverseMultipleChoice',
  'fillInTheBlank',
  'spellingFill',
  'multipleChoiceListening',
  'sentenceTranslate',
  'reverseMultipleChoice',
  'sentenceArrangePartial',
];
export const CARD_MATCH_SIZE = 4;
export const PART2_COUNT = 5;
// 2부 유형 후보 — 1부와 다른 유형 중 지금 θ 에 맞는 것(nextPart2).
const PART2_TYPES = ['reverseMultipleChoice', 'fillInTheBlank', 'multipleChoiceListening', 'spellingFill', 'multipleChoice'];
export const MAX_RETRY = 3;

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
// 를 단순화한 것. 서버 puzzle 데이터가 없으므로 공백 단위 토큰(문장부호는 붙은 채)으로 자른다.
function buildArrange(p, pool, rng, questionType = 'sentenceArrangePartial') {
  const marked = p.example.origin;
  const rawTokens = marked.replace(TARGET_RE, (_, inner) => `\u0000${stripTags(inner)}\u0001`).split(/\s+/).filter(Boolean);
  const targetIdx = [];
  const tokens = rawTokens.map((t, i) => {
    if (t.includes('\u0000') || t.includes('\u0001')) targetIdx.push(i);
    return t.replace(/[\u0000\u0001]/g, '');
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
  ).filter((t) => !lowerWin.has(t.toLowerCase()));
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
    pending   지금 화면에 낸 문제의 정보 {kind:'p1'|'p2'|'p3', type, ids}
    current   지금 화면의 문제 객체(복원용)
*/
export function createSession(bands, { theta = START_THETA } = {}) {
  return {
    v: 1,
    pool: normalizePool(bands),
    theta,
    nAnswers: 0,
    step: 0,
    part2Done: 0,
    used: [],
    firstById: {},
    log: [],
    wrong: [],
    retryCount: {},
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

// P(정답)이 목표(goalP)에 가장 가까운 단어 — 목표보다 어려운 쪽은 1.5배 벌점. 비슷하면 쉬운(짧은) 단어부터, 근처 3개 중 무작위.
const pickWords = (s, type, count, rng, extraFilter = () => true) => {
  const used = new Set(s.used);
  const cands = s.pool.filter((p) => !used.has(p.voca_id) && canUseType(p, type) && extraFilter(p));
  const goal = goalP(s);
  const th = selTheta(s);
  const scored = cands.map((p) => {
    const pc = pCorrect(th, itemB(p, type));
    return { p, pc, d: pc < goal ? (goal - pc) * 1.5 : pc - goal, ease: (p.example?.score ?? RANK_CENTER[p.rank]) + p.origin.length };
  }).sort((a, b) => (a.d - b.d) || (a.ease - b.ease));
  if (count === 1) {
    const top = scored.filter((x) => x.d <= (scored[0]?.d ?? 0) + 0.03).slice(0, 3);
    if (!top.length) return [];
    // 처음인 사람에게 이 유형의 가장 쉬운 문제도 너무 어려우면(P < skipBelow) 이번엔 내지 않는다.
    if (EXAMPLE_TYPES.has(type) && scored[0].pc < TUNE.skipBelow) return [];
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

// 1부 다음 문제. 그 유형에 맞는 단어가 없으면(예문 없음 등) 계획의 다음 유형으로 넘어간다.
const nextPart1 = (s, rng) => {
  while (s.step < PART1_PLAN.length) {
    let type = PART1_PLAN[s.step];
    s.step += 1;
    let words = pickWords(s, type, type === 'cardMatch' ? CARD_MATCH_SIZE : 1, rng);
    // 예문 유형을 낼 수 없으면(예문 없음·지금 수준엔 너무 어려움) 같은 자리를 새 단어 뜻 고르기로 채운다
    // — 고유 단어 수(12~14)와 분량은 지킨다.
    if (words.length === 0 && EXAMPLE_TYPES.has(type)) {
      type = s.lastFallback === 'multipleChoice' ? 'reverseMultipleChoice' : 'multipleChoice';
      s.lastFallback = type;
      words = pickWords(s, type, 1, rng);
    }
    if (words.length === 0) continue;
    words.forEach((w) => s.used.push(w.voca_id));
    s.pending = { kind: 'p1', type, ids: words.map((w) => w.voca_id) };
    return buildQuestion(type, words, s.pool, rng);
  }
  return null;
};

// 2부 — 1부 단어 PART2_COUNT 개를 **다른 유형**으로 다시(농장 돌보기처럼).
// 매 문제 (단어, 유형) 쌍 중 지금 θ 에서 P(정답)이 목표에 가장 가까운 것을 고른다 — 잘하는 사람은
// 1부의 어려운 단어를 철자·빈칸으로, 처음인 사람은 쉬운 단어를 뜻 고르기로 만난다.
// 목표보다 어려운 쪽은 1.5배 벌점(첫 학습은 쉬운 쪽으로 틀리는 게 낫다), 직전 2부와 같은 유형은 작은 벌점.
const nextPart2 = (s, rng) => {
  const asked = new Set(s.part2Asked || []);
  if (s.part2Done >= PART2_COUNT) return null;
  const goal = goalP(s);
  const th = selTheta(s);
  const cands = [];
  Object.keys(s.firstById).map(Number).forEach((id) => {
    if (asked.has(id)) return;
    const p = byId(s, id);
    if (!p) return;
    const firstType = s.firstById[id]?.type;
    PART2_TYPES.forEach((t) => {
      if (t === firstType || !canUseType(p, t)) return;
      const pc = pCorrect(th, itemB(p, t));
      cands.push({ p, t, d: (pc < goal ? (goal - pc) * 1.5 : pc - goal) + (t === s.lastP2Type ? 0.08 : 0) });
    });
  });
  if (cands.length === 0) return null;
  cands.sort((x, y) => x.d - y.d);
  const near = cands.filter((x) => x.d <= cands[0].d + 0.03);
  const { p, t: type } = near[Math.floor(rng() * near.length)];
  s.part2Asked = [...asked, p.voca_id];
  s.part2Done += 1;
  s.lastP2Type = type;
  s.pending = { kind: 'p2', type, ids: [p.voca_id] };
  const q = buildQuestion(type, [p], s.pool, rng);
  if (s.part2Done === 1) q.phaseStart = 'practice';
  return q;
};

// 3부 — 아직 못 맞힌 단어를 쉬운 뜻 고르기로, 맞힐 때까지(최대 MAX_RETRY).
const nextPart3 = (s, rng) => {
  while (s.wrong.length > 0) {
    const id = s.wrong[0];
    const count = s.retryCount[id] ?? 0;
    if (count >= MAX_RETRY) { s.wrong.shift(); continue; }
    s.retryCount[id] = count + 1;
    const p = byId(s, id);
    if (!p) { s.wrong.shift(); continue; }
    const first = !s.startedRetry;
    s.startedRetry = true;
    // 같은 단어를 연달아 두 번 묻지 않게 — 한 단어를 낸 뒤 줄 맨 뒤로 보낸다
    s.wrong.push(s.wrong.shift());
    s.pending = { kind: 'p3', type: 'multipleChoice', ids: [id] };
    const q = { ...buildQuestion('multipleChoice', [p], s.pool, rng), isRetry: true };
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
        if (correct) {
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
    });
  }
  if (pend && answered && pend.kind !== 'p3') {
    const allRight = Array.isArray(answered.words)
      ? answered.words.every((w) => w.isCorrect === true)
      : answered.isCorrect === true;
    s.nQuestions = (s.nQuestions ?? 0) + 1;
    s.streak = allRight ? (s.streak ?? 0) + 1 : 0;
    // 출제 상한 — 연달아 맞힐수록 더 크게 연다(capStep × (1 + capGrow × (연속−1))). 틀리면 capStep 만.
    s.cap = (s.cap ?? START_THETA) + TUNE.capStep * (allRight ? 1 + TUNE.capGrow * (s.streak - 1) : 0.5);
  }
  s.pending = null;
  const first = !answered && s.step === 0;
  const q = nextPart1(s, rng) || nextPart2(s, rng) || nextPart3(s, rng);
  if (q && first) q.phaseStart = 'trial';
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
