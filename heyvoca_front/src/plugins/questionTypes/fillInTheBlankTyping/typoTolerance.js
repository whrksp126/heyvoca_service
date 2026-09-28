/*
  fillInTheBlankTyping 채점 — 계약: SENTENCE_QUESTIONS_CONTRACT.md 3-2절.

  1) 완전 일치(trim+lowercase) → 정답.
  2) 아니면 base_form과 같고 정답(활용형)과 다르면 → 오답("형태가 달라요").
  3) 아니면 정답과 "오타(편집거리 1)"인지 검사 — 치환(QWERTY 인접 키)·인접 두 글자 전치·
     한 글자 삽입(앞/뒤 글자와 같거나 인접 키)·한 글자 삭제 중 하나.
     blocked_typos(사전에 있는 다른 단어)에 있으면 → 오답. 없으면 → 정답(typo:true).
  4) 그 외 → 오답.
*/

// 표준 QWERTY 배열 기준 물리적 인접 키(대각선 포함, 대략치 — 완벽한 지도가 아니어도 충분).
const ADJACENCY = {
  q: 'wa', w: 'qeas', e: 'wrsd', r: 'etdf', t: 'ryfg', y: 'tugh', u: 'yihj', i: 'uojk', o: 'ipkl', p: 'ol',
  a: 'qwsz', s: 'awedzx', d: 'serfxc', f: 'drtgcv', g: 'ftyhvb', h: 'gyujbn', j: 'huikmn', k: 'jiolm', l: 'kop',
  z: 'asx', x: 'zsdc', c: 'xdfv', v: 'cfgb', b: 'vghn', n: 'bhjm', m: 'njk',
};

const isAdjacentKey = (a, b) => {
  if (a === b) return true;
  const neighbors = ADJACENCY[a];
  return !!neighbors && neighbors.includes(b);
};

// 정답과 입력이 편집거리 1(치환·전치·삽입·삭제 중 하나)이면서, 계약이 정한 "키보드 인접"
// 조건까지 만족하는지. 순수 함수 — Damerau-Levenshtein 의 네 연산을 각각 명시적으로 검사한다.
export const isKeyboardTypo = (answer, input) => {
  const a = String(answer ?? '');
  const b = String(input ?? '');
  if (!a || !b || a === b) return false;
  const lenDiff = b.length - a.length;
  if (Math.abs(lenDiff) > 1) return false;

  if (lenDiff === 0) {
    const diffIdx = [];
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) diffIdx.push(i);
      if (diffIdx.length > 2) return false;
    }
    if (diffIdx.length === 1) {
      const i = diffIdx[0];
      return isAdjacentKey(a[i], b[i]); // 치환 — QWERTY 인접 키
    }
    if (diffIdx.length === 2 && diffIdx[1] === diffIdx[0] + 1) {
      const [i, j] = diffIdx;
      return b[i] === a[j] && b[j] === a[i]; // 인접 두 글자 전치
    }
    return false;
  }

  if (lenDiff === 1) {
    // 삽입 — 입력에서 한 글자를 빼면 정답과 같아지는 자리를 찾는다.
    for (let i = 0; i < b.length; i++) {
      const candidate = b.slice(0, i) + b.slice(i + 1);
      if (candidate !== a) continue;
      const c = b[i];
      const prev = i > 0 ? b[i - 1] : null;
      const next = i < b.length - 1 ? b[i + 1] : null;
      if ((prev && isAdjacentKey(c, prev)) || (next && isAdjacentKey(c, next))) return true;
    }
    return false;
  }

  // lenDiff === -1 — 삭제. 정답에서 한 글자를 빼면 입력과 같아지는 자리가 있으면 인정
  // (계약에 추가 조건이 없다 — "한 글자 삭제"만 명시).
  for (let i = 0; i < a.length; i++) {
    const candidate = a.slice(0, i) + a.slice(i + 1);
    if (candidate === b) return true;
  }
  return false;
};

const normalize = (s) => String(s ?? '').trim().toLowerCase();

/**
 * fillInTheBlankTyping 한 문항 채점.
 * @returns {{ isCorrect: boolean, typo: boolean, reason: 'exact'|'typo'|'baseForm'|'wrong' }}
 */
export const gradeTypingAnswer = (rawInput, { answerText, baseForm, blockedTypos = [] }) => {
  const input = normalize(rawInput);
  const answer = normalize(answerText);
  const base = normalize(baseForm);

  if (!input) return { isCorrect: false, typo: false, reason: 'wrong' };
  if (input === answer) return { isCorrect: true, typo: false, reason: 'exact' };

  // "형태가 달라요" — 기본형을 그대로 입력한 경우(활용형과 다를 때만 의미가 있다).
  if (base && input === base && base !== answer) {
    return { isCorrect: false, typo: false, reason: 'baseForm' };
  }

  // 오타 허용은 "정답이 4글자 이상이고 공백 없는 단일어일 때만"(구동사/숙어는 완전 일치만 인정).
  const singleWordEligible = answer.length >= 4 && !answer.includes(' ');
  if (singleWordEligible && isKeyboardTypo(answer, input)) {
    const blocked = (blockedTypos ?? []).some((t) => normalize(t) === input);
    if (blocked) return { isCorrect: false, typo: false, reason: 'wrong' };
    return { isCorrect: true, typo: true, reason: 'typo' };
  }

  return { isCorrect: false, typo: false, reason: 'wrong' };
};
