/*
  스펠링 채우기(spellingFill) — 칸 만들기·힌트·채점 순수 함수(이슈 #21).

  칸(cell) = 정답 문자열의 글자 하나. 종류:
  - fixed:  공백·하이픈·아포스트로피 등 글자가 아닌 칸 — 그대로 보여 주고 입력받지 않는다.
  - given:  처음부터 공개하는 글자(회색).
  - open:   사용자가 입력하는 빈칸. 힌트로 공개되면 hinted 표시(primary 색)가 붙고 입력 대상에서 빠진다.

  영어는 표제어(origin), 일본어는 읽기(가나, utils/jaWord.getReading)로 칸을 만든다 — 일본어
  표기(한자)는 정답을 알려 주는 셈이라 문제 화면에 쓰지 않는다.
*/
import { wordLang, isJa } from '../../../utils/lang';
import { getReading } from '../../../utils/jaWord';

export const MAX_HINTS = 2;

const LETTER_RE = /[\p{L}\p{N}]/u;

// 가타카나 → 히라가나(장음 'ー'·기호는 그대로). 비교·입력 정규화 공용.
export const toHiragana = (s) => String(s ?? '').replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

// 비교용 글자 정규화 — 대소문자 무시, 가타카나는 히라가나로.
export const normChar = (c) => toHiragana(String(c ?? '')).toLowerCase();

// 공백 제외 길이 → 앞부분 공개 글자 수(4 이하 1, 5~8 2, 9 이상 3).
const givenCountFor = (len) => (len <= 4 ? 1 : len <= 8 ? 2 : 3);

// 이 단어로 칸을 만들 정답 문자열. 못 만들면 ''.
export const spellingAnswerOf = (word) => {
  if (!word) return '';
  if (isJa(wordLang(word))) return getReading(word);
  return typeof word.origin === 'string' ? word.origin.trim().replace(/\s+/g, ' ') : '';
};

export const buildSpellingCells = (answer) => {
  const chars = Array.from(String(answer ?? ''));
  const cells = chars.map((ch) => ({ ch, kind: LETTER_RE.test(ch) ? 'open' : 'fixed' }));
  const isPhrase = chars.includes(' ');
  if (isPhrase) {
    // 숙어/구 — 단어마다 첫 글자 공개
    let atWordStart = true;
    cells.forEach((c) => {
      if (c.ch === ' ') { atWordStart = true; return; }
      if (atWordStart && c.kind === 'open') c.kind = 'given';
      atWordStart = false;
    });
  } else {
    let n = givenCountFor(chars.filter((ch) => ch.trim() !== '').length);
    for (const c of cells) {
      if (n <= 0) break;
      if (c.kind !== 'open') continue;
      c.kind = 'given';
      n -= 1;
    }
  }
  return cells;
};

// 출제 가능 여부 — 공백 제외 2글자 이상 + 빈칸이 하나 이상(일본어는 읽기가 있어야 한다).
export const canBuildSpelling = (word) => {
  const answer = spellingAnswerOf(word);
  if (Array.from(answer.replace(/\s+/g, '')).length < 2) return false;
  return buildSpellingCells(answer).some((c) => c.kind === 'open');
};

/*
  입력값(value) → 칸별 글자. 입력은 힌트로 공개되지 않은 빈칸(입력 칸)에 왼쪽부터 채운다.
  반환: cellIndex → 글자(입력/힌트), 입력 칸 index 배열.
*/
export const inputCellIndexes = (cells, hinted) => cells
  .map((c, i) => (c.kind === 'open' && !hinted.has(i) ? i : -1))
  .filter((i) => i >= 0);

export const mapInputToCells = (cells, hinted, value) => {
  const slots = inputCellIndexes(cells, hinted);
  const chars = Array.from(value ?? '');
  const filled = {};
  slots.forEach((cellIdx, k) => { if (k < chars.length) filled[cellIdx] = chars[k]; });
  return { slots, filled };
};

/*
  힌트 1번 — 입력 칸 중 "비었거나 틀린" 첫 칸을 정답 글자로 공개한다. 입력 칸이 1개 이하이면
  (= 마지막 빈칸) 공개하지 않는다(null). 그 칸에 입력해 둔 글자는 지우고 나머지 입력은 순서대로 유지.
*/
export const applyHint = (cells, hinted, value) => {
  const { slots, filled } = mapInputToCells(cells, hinted, value);
  if (slots.length <= 1) return null;
  const target = slots.find((i) => filled[i] == null || normChar(filled[i]) !== normChar(cells[i].ch));
  if (target == null) return null;
  const nextHinted = new Set(hinted);
  nextHinted.add(target);
  const nextValue = slots.filter((i) => i !== target && filled[i] != null).map((i) => filled[i]).join('');
  return { hinted: nextHinted, value: nextValue };
};

// 채점 — 입력 칸 전부 비교. wrong = 틀린 cellIndex 집합.
export const gradeSpelling = (cells, hinted, value) => {
  const { slots, filled } = mapInputToCells(cells, hinted, value);
  const wrong = new Set(slots.filter((i) => normChar(filled[i]) !== normChar(cells[i].ch)));
  return { isCorrect: wrong.size === 0, wrong };
};
