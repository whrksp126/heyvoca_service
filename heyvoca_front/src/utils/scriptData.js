// src/utils/scriptData.js
//
// 글자 밭(문자 학습) — 정적 글자 데이터(src/data/script/*.json) + 서버 진행도(GET
// /script/progress)를 합쳐 화면이 바로 쓸 수 있는 모양으로 만드는 단일 소스.
// 히라가나/가타카나/알파벳 셋 다 "script" 코드('hiragana'|'katakana'|'alphabet')로 구분한다.

import hiraganaData from '../data/script/hiragana.json';
import katakanaData from '../data/script/katakana.json';
import alphabetData from '../data/script/alphabet.json';
import hiraganaStrokes from '../data/script/strokes/hiragana.json';
import katakanaStrokes from '../data/script/strokes/katakana.json';
import alphabetStrokes from '../data/script/strokes/alphabet.json';
import { getTextSound, prefetchTextSound, prefetchTtsList } from './common';
import { stageToCrop } from './crop';

export const SCRIPT_TYPES = {
  HIRAGANA: 'hiragana',
  KATAKANA: 'katakana',
  ALPHABET: 'alphabet',
};

export const SCRIPT_LABEL = {
  hiragana: '히라가나',
  katakana: '가타카나',
  alphabet: '알파벳',
};

// 학습 언어별로 이 화면에서 기본으로 보여줄 스크립트 목록.
export const scriptsForLearningLang = (learningLang) =>
  learningLang === 'ja' ? [SCRIPT_TYPES.HIRAGANA, SCRIPT_TYPES.KATAKANA] : [SCRIPT_TYPES.ALPHABET];

const RAW_DATA = {
  hiragana: hiraganaData,
  katakana: katakanaData,
  alphabet: alphabetData,
};

const STROKE_DATA = {
  hiragana: hiraganaStrokes,
  katakana: katakanaStrokes,
  alphabet: alphabetStrokes,
};

// script -> Map(char -> 정적 데이터 항목). 세션 응답(문자만 옴)에 정적 데이터를 붙일 때 쓴다.
const STATIC_BY_CHAR = {};
const staticMapFor = (script) => {
  if (!STATIC_BY_CHAR[script]) {
    STATIC_BY_CHAR[script] = new Map((RAW_DATA[script] || []).map((it) => [it.char, it]));
  }
  return STATIC_BY_CHAR[script];
};
export const getStaticChar = (script, char) => staticMapFor(script).get(char) || null;

/** 문자의 TTS 재생 언어. 가나는 ja, 알파벳은 en. */
export const scriptTtsLang = (script) => (script === 'alphabet' ? 'en' : 'ja');

/**
 * 문자 하나를 소리 내어 읽을 때 실제로 TTS에 넘길 텍스트.
 * 기본은 item.char 그대로지만, 단독으로 넘기면 오독되거나 어색한 항목은
 * data/script/*.json 의 "speak" 필드로 안전한 텍스트를 지정해 덮어쓴다.
 *
 * 알파벳: 대문자 한 글자만 넘기면 ElevenLabs가 관사 "a"(어)처럼 슈와 발음으로 읽을 위험이
 * 있는 항목(특히 A)이 있어, 26자 전부 영어 알파벳 이름의 표준 표기(Ay/Bee/See...)를
 * alphabet.json 에 미리 채워 뒀다 — 모든 TTS 보이스가 흔들림 없이 "글자 이름"으로 읽는다.
 *
 * 가나: 단독 글자 음성은 실제 소리 구간이 0.14~0.25초뿐이라(앞뒤 무음 포함 파일 길이는
 * 1.87초) "틱" 하고 끊기듯 들린다(2026-09-29 실기기 QA — objectstore mp3 실측). 장음 부호
 * (ー)를 붙이면 0.28~0.34초로 늘어나 또렷해져서, 기본형은 여기서 "글자+ー"로 만든다
 * (あー/いー/かー/きゃー…). 개별 항목의 speak 오버라이드(hiragana.json/katakana.json)가
 * 있으면 그 글자 대신 오버라이드 글자를 기준으로 장음을 붙인다:
 *   - ぢ/づ, ヂ/ヅ → 현대 일본어에서 じ/ず, ジ/ズ 와 발음이 같다(4단 동음화) → speak을
 *     그 동음 글자로 지정 → "じー"/"ずー"로 재생된다.
 *   - を → 조사로 쓰일 때도 「오」로만 발음된다(역사적 철자, wo 아님) → speak: "お" →
 *     "おー". ヲ(가타카나)도 같은 이유로 speak: "オ" → "オー".
 *   - は/へ → 히라가나 단독 は/へ는 "조사"로 오인돼 일부 TTS가 わ/え(조사일 때의 발음)로
 *     읽을 위험이 있다 → 조사 규칙이 적용되지 않는 가타카나 동음(ハ/ヘ)으로 speak을 지정
 *     → "ハー"/"ヘー".
 *   - ん/ン → speak이 이미 "ンー"(장음 포함)로 지정돼 있어 아래에서 다시 늘이지 않는다
 *     (이미 ー로 끝나는 speak은 그대로 쓴다).
 *   - っ/ッ(촉음) → 그 자체로 다음 글자를 위해 숨을 막는 무음 표기라 장음을 붙이면
 *     부자연스럽다 — 예외로 두고 늘이지 않는다.
 * 알파벳은 이 장음 규칙과 무관 — alphabet.json의 speak을 그대로 쓴다.
 */
const NO_LENGTHEN_KANA = new Set(['っ', 'ッ']);
export const scriptSpokenText = (script, item) => {
  if (!item) return '';
  if (script === 'alphabet') return item.speak || item.char;
  const base = item.speak || item.char || '';
  if (!base || base.endsWith('ー') || NO_LENGTHEN_KANA.has(item.char)) return base;
  return `${base}ー`;
};

// 재생 실패(캐시 미스·resolve/다운로드 실패)를 1회 재시도한 뒤 재생한다.
// getTextSound 자체는 실패를 조용히 삼키므로, prefetchTextSound의 성공 여부(objectURL 반환)로
// 성공/실패를 판별해 재시도한다 — 이미 성공적으로 캐시된 경우는 즉시 반환되어 비용이 없다.
const speakTextWithRetry = async (text, lang, onMeta) => {
  if (!text) return;
  let cached = await prefetchTextSound(text, lang);
  if (!cached) {
    // 1회 재시도
    cached = await prefetchTextSound(text, lang);
  }
  return getTextSound(text, lang, onMeta);
};

/** script 문자 하나(item.speak 우선)를 소리 내 읽는다 — 실패 시 1회 재시도, 연속 탭 시
 *  이전 재생은 getTextSound 내부의 공유 오디오 인스턴스가 자동으로 끊고 새로 재생한다. */
export const speakScriptItem = (script, item, onMeta) =>
  speakTextWithRetry(scriptSpokenText(script, item), scriptTtsLang(script), onMeta);

/** 예시 단어처럼 item.char 가 아닌 임의 텍스트(같은 스크립트 언어)를 재생할 때. */
export const speakScriptText = (script, text, onMeta) =>
  speakTextWithRetry(text, scriptTtsLang(script), onMeta);

/** 세션에 들어갈 글자들의 음성을 세션 시작 시 미리 받아 둔다(줄 단위 prefetch) —
 *  글자 자체 소리 + 예시 단어 소리까지 포함해 첫 탭에서도 끊김 없이 재생되게 한다. */
export const prefetchScriptSession = (script, chars) => {
  const lang = scriptTtsLang(script);
  const seen = new Set();
  const list = [];
  const add = (text) => {
    const t = (text || '').trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    list.push({ text: t, language: lang });
  };
  (chars || []).forEach((item) => {
    add(scriptSpokenText(script, item));
    if (item?.example?.word) add(item.example.word);
  });
  return prefetchTtsList(list, 4);
};

/*
  격자(그리드) 구성 — 2026-09-30 듀오링고 문자표 스타일 개편.
  예전엔 "○행" 제목 + 그 아래 글자들을 줄마다 구분선으로 나눠 그렸다(groupByRow/rowLabel).
  지금은 하나로 이어진 격자를 묶음(기본/탁음·반탁음/요음) 단위로만 나눈다 — 묶음 제목만
  보이고, 행 사이 제목·구분선은 없다.

  히라가나/가타카나 data/script/*.json 의 item.row 는 오십음도 행 키(a/ka/…/n, 탁음
  ga/za/da/ba/pa, 요음 kya/gya/…/rya)다. 기본(basic) 묶음은 5열 격자에서 열이 모음
  (あいうえお) 순서와 일치해야 하는데, や행(や・ゆ・よ 3개)·わ행(わ・を 2개)·ん행(1개)은
  실제 글자 수가 5개보다 적어 "빈 칸"이 생긴다 — BASIC_ROW_COLUMNS 가 그 빈 칸의 위치를
  정의한다(null로 채워 칸 크기는 유지하되 탭은 되지 않게 한다).
*/
const BASIC_ROW_COLUMNS = {
  ya: [0, 2, 4], // や・(빈칸)・ゆ・(빈칸)・よ
  wa: [0, 4], // わ・(빈칸)・(빈칸)・(빈칸)・を
  n: [0], // ん만, 나머지 4칸은 빈칸
};

const KANA_GROUP_DEFS = [
  {
    key: 'basic',
    label: '기본',
    columns: 5,
    rows: ['a', 'ka', 'sa', 'ta', 'na', 'ha', 'ma', 'ya', 'ra', 'wa', 'n'],
  },
  {
    key: 'dakuten',
    label: '탁음 · 반탁음',
    columns: 5,
    rows: ['ga', 'za', 'da', 'ba', 'pa'],
  },
  {
    key: 'yoon',
    label: '요음',
    columns: 3,
    rows: ['kya', 'gya', 'sha', 'ja', 'cha', 'nya', 'hya', 'bya', 'pya', 'mya', 'rya'],
  },
];

/**
 * 격자 묶음 배열을 만든다 — [{ key, label, columns, cells: [item|null, ...] }].
 * - 히라가나/가타카나: KANA_GROUP_DEFS 순서대로 묶음을 만들고, 기본 묶음의 や/わ/ん행은
 *   BASIC_ROW_COLUMNS 로 열을 맞춘 뒤 빈 칸을 null로 채운다(다른 행은 이미 5칸을 꽉 채우므로
 *   그대로 이어 붙인다 — 탁음 5행×5칸, 요음은 행 하나가 곧 3칸 한 줄).
 * - 알파벳: 묶음 제목 없이 전체 26자를 한 묶음으로 이어 붙인다(row 순서 그대로 이미 5개씩).
 * cells의 null은 "보이지 않는 자리 채움"(칸 크기 유지, 탭 불가) — ScriptCell 대신 렌더링하는
 * 쪽(components/script/ScriptRow.jsx)에서 null이면 빈 div를 그린다.
 */
export const buildScriptGroups = (script, mergedItems) => {
  if (script === 'alphabet') {
    return [{ key: 'all', label: null, columns: 5, cells: [...(mergedItems || [])] }];
  }

  const byRow = new Map();
  (mergedItems || []).forEach((it) => {
    if (!byRow.has(it.row)) byRow.set(it.row, []);
    byRow.get(it.row).push(it);
  });

  return KANA_GROUP_DEFS.map((group) => {
    const cells = [];
    group.rows.forEach((rowKey) => {
      const rowItems = byRow.get(rowKey) || [];
      const columnMap = group.key === 'basic' ? BASIC_ROW_COLUMNS[rowKey] : null;
      if (columnMap) {
        const slots = new Array(group.columns).fill(null);
        columnMap.forEach((col, idx) => { slots[col] = rowItems[idx] || null; });
        cells.push(...slots);
      } else {
        cells.push(...rowItems);
      }
    });
    return { key: group.key, label: group.label, columns: group.columns, cells };
  });
};

/*
  숙달 단계 — 2026-09-30부터 백엔드가 단어와 같은 visual_stage 문자열(PLANTED_SEED/SPROUT/
  LEAF/CARROT 등)을 GET /script/progress·/script/session 응답에 직접 실어 준다(items[].stage).
  예전에는 프론트가 임의의 level(0-5) 정수를 5단계 crop 키로 자체 매핑했는데(levelToCropStage),
  그 매핑이 학습 결과 화면(StudyResult.jsx cropOfWord — farm 세션 요약의 visual_stage 기준)과
  서로 다른 규칙이라 같은 글자인데 격자와 결과 화면의 작물 그림이 어긋나는 문제가 있었다.
  지금은 두 화면 다 CropImage에 stage(visual_stage)를 그대로 넘긴다 — utils/crop.js
  stageToCrop 하나만 거치므로 항상 같은 그림이 나온다.
*/
export const isMastered = (stage) => stageToCrop(stage) === 'carrot';

/** 심긴 적이 있는지(서버 stage 기준) — "처음 배우는 줄" 판정·연습하기 대상용.
 *  /script/progress 는 fsrs 를 내려주지 않으므로(글자는 복습일 개념 없음) stage 로만 판정한다. */
export const isStarted = (item) => {
  const st = item?.stage;
  if (st) return st !== 'UNPLANTED_SEED';
  return !!item?.fsrs && (Number(item.fsrs.reps) > 0 || (item.fsrs.state && item.fsrs.state !== 'new'));
};

/**
 * 정적 데이터 + 서버 진행도(items: [{char, user_voca_id, stage, health, xp,
 * fsrs:{state,next_review,last_review}, due}])를 합친다. 진행도가 없는 글자는 미학습으로 취급.
 */
export const mergeProgress = (script, progressItems) => {
  const raw = RAW_DATA[script] || [];
  const byChar = new Map((progressItems || []).map((p) => [p.char, p]));
  return raw.map((item) => {
    const p = byChar.get(item.char);
    return {
      ...item,
      user_voca_id: p?.user_voca_id ?? null,
      book_id: p?.book_id ?? null,
      stage: p?.stage ?? null,
      health: p?.health ?? null,
      xp: p?.xp ?? 0,
      fsrs: p?.fsrs ?? null,
      due: !!p?.due,
    };
  });
};

/*
  글자는 복습 예정일 개념이 없다(사용자 결정 2026-09-30 — 작물 성장(XP·단계)만 있고
  시듦/썩음·복습일 알림은 없음). "복습하기 N"(서버 due 플래그 기준) 대신 "연습하기"를
  둔다 — 이미 한 번이라도 배운 글자가 있으면 항상 누를 수 있고, 개수를 세지 않는다.
  실제로 어떤 글자를 우선 물을지는 GET /script/session?mode=review 가 숙달 낮은 글자를
  우선하도록 서버가 정한다(클라이언트는 "이미 시작한 글자 전체"만 후보로 넘긴다).
*/
export const practicableItems = (mergedItems) => (mergedItems || []).filter((it) => isStarted(it));

export const masteredCount = (mergedItems) => (mergedItems || []).filter((it) => isMastered(it.stage)).length;

/**
 * 정적 글자 하나 — GET /script/session(=/study/recommend와 같은 모양) 응답 item(user_voca_id,
 * word=글자, meanings, fsrs …)을 학습하기(TakeTest) 가 쓰는 "word" 모양으로 바꾼다.
 * item.* 은 기존 components/script/IntroCard·ChoiceCard·TraceCard가 그대로 기대하는
 * 정적 데이터 모양(hangul/romaji/confusables/example/compound/lower/…)이라 그대로 중첩해 둔다.
 */
export const mapScriptSessionItem = (script, serverItem) => {
  const staticItem = getStaticChar(script, serverItem.word) || { char: serverItem.word };
  return {
    id: serverItem.user_voca_id,
    vocaIndexId: serverItem.user_voca_id,
    vocabularySheetId: serverItem.user_voca_book_id ?? null,
    origin: serverItem.word,
    char: serverItem.word,
    script,
    meanings: [],
    fsrs: serverItem.fsrs ?? null,
    language: scriptTtsLang(script),
    item: staticItem,
  };
};

/**
 * 오답 후보 풀(utils/scriptQuestions.js buildScriptChoiceQuestion 등이 기대하는 { char, item }
 * 래퍼 모양) — 이 스크립트의 전체 글자 목록(mergeProgress 결과)을 그대로 넘긴다.
 *
 * 2026-09-30 듀오링고식 탭 학습으로 개편하며 세션이 글자 하나(단일 칸 "배우기"/"연습하기")
 * 만 담는 경우가 흔해졌다 — 그 하나짜리 words 배열을 그대로 오답 풀로 쓰면 사지선다가
 * 정답 하나뿐인 문제가 된다. 항상 이 스크립트 전체를 풀로 넘겨 어떤 세션 크기에서도
 * 그럴듯한 오답 3개(우선 confusables, 모자라면 무작위)를 채울 수 있게 한다.
 */
export const buildDistractorPool = (script, mergedItems) =>
  (mergedItems || []).map((it) => ({ char: it.char, item: it }));

/** strokeKey(단일 글자) 또는 compound([base, small])로 획 데이터를 찾는다. */
export const getStrokeEntry = (script, item) => {
  const table = STROKE_DATA[script] || {};
  if (Array.isArray(item.compound)) {
    return item.compound.map((k) => table[k]).filter(Boolean);
  }
  const key = item.strokeKey || item.char || item.lower;
  const entry = table[key];
  return entry ? [entry] : [];
};

/** 알파벳 전용 — 대문자/소문자 획 데이터를 함께 돌려준다. */
export const getAlphabetStrokeEntries = (item) => {
  const table = STROKE_DATA.alphabet || {};
  return {
    upper: table[item.char] ? [table[item.char]] : [],
    lower: table[item.lower] ? [table[item.lower]] : [],
  };
};

/** 혼동쌍(confusables) 문자 → 같은 데이터셋의 항목 객체로 확장. */
export const resolveConfusables = (script, item, allMerged) => {
  if (!item?.confusables?.length) return [];
  const byChar = new Map(allMerged.map((it) => [it.char, it]));
  return item.confusables.map((c) => byChar.get(c)).filter(Boolean);
};
