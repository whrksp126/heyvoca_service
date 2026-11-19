// 글자 수 → 글자 크기 단계(2026-11-19 3차 QA).
//
// 학습 문제 카드의 단어·뜻이 길이와 무관하게 같은 크기라 긴 것은 넘치고 짧은 것은 작아 보였다.
// 글자 수(한글·가나·한자는 가중치)로 4단계 중 하나를 고르고, 실제로 그려 보니 줄 수가 넘치면
// 한 단계씩 더 줄인다(useFitTier). 단계는 4개로 고정 — 화면마다 크기가 제각각이 되지 않게
// 모든 유형이 아래 SCALES 의 같은 표를 쓴다. 예: pay = 가장 크게, gas station = 한 단계 작게.
import { useLayoutEffect, useRef, useState } from 'react';
import { groupMeaningsByPos } from './meaningPos';

// 한글·가나·한자·전각 — 영문 소문자 약 1.8자 폭
const WIDE_RE = /[ᄀ-ᇿ぀-ヿ㄰-㆏㐀-鿿가-힯豈-﫿＀-￯]/;
const stripTags = (s) => String(s ?? '').replace(/<[^>]*>/g, '');

// 영문 1글자 = 1 로 환산한 길이. 공백 0.5, 한글 등 1.8.
export const textUnits = (text) => {
  let n = 0;
  for (const ch of stripTags(text)) {
    if (/\s/.test(ch)) n += 0.5;
    else if (WIDE_RE.test(ch)) n += 1.8;
    else n += 1;
  }
  return n;
};

// 단계 경계(이하) — 마지막 단계는 그보다 긴 전부.
const THRESHOLDS = {
  // 영어 단어: ~6자 아주 크게 / 7~11자 크게 / 12~16자 보통 / 17자 이상 작게
  word: [6, 11, 16],
  // 뜻(한글 기준 약 4자 / 9자 / 15자)
  meaning: [8, 16, 28],
  // 예문(빈칸 문장)
  sentence: [32, 56, 84],
};

// 자리별 크기표 — [아주 크게, 크게, 보통, 작게]. Tailwind JIT 가 읽도록 클래스 문자열 그대로 둔다.
export const SCALES = {
  heroWord: { kind: 'word', classes: ['text-[34px]', 'text-[30px]', 'text-[26px]', 'text-[22px]'] },        // 뜻 고르기 문제 단어
  heroMeaning: { kind: 'meaning', classes: ['text-[26px]', 'text-[23px]', 'text-[20px]', 'text-[17px]'] }, // 역방향 문제 뜻
  meetWord: { kind: 'word', classes: ['text-[30px]', 'text-[26px]', 'text-[23px]', 'text-[20px]'] },        // 단어 만나기 카드
  cardWord: { kind: 'word', classes: ['text-[22px]', 'text-[20px]', 'text-[17px]', 'text-[14px]'] },        // 카드 맞추기 단어
  cardMeaning: { kind: 'meaning', classes: ['text-[16px]', 'text-[15px]', 'text-[13px]', 'text-[12px]'] },  // 카드 맞추기 뜻
  optionWord: { kind: 'word', classes: ['text-[18px]', 'text-[17px]', 'text-[15px]', 'text-[14px]'] },      // 보기 버튼(단어)
  optionMeaning: { kind: 'meaning', classes: ['text-[16px]', 'text-[15px]', 'text-[14px]', 'text-[13px]'] },// 보기 버튼(뜻)
  sentence: { kind: 'sentence', classes: ['text-[24px]', 'text-[22px]', 'text-[20px]', 'text-[18px]'] },    // 빈칸 영어 예문
  sentenceKo: { kind: 'sentence', classes: ['text-[20px]', 'text-[19px]', 'text-[18px]', 'text-[17px]'] },  // 빈칸 한국어 예문
};

const LAST = 3;

// 글자 수만으로 고른 단계(0~3)
export const tierIndex = (text, scale) => {
  const kind = SCALES[scale]?.kind ?? 'word';
  const u = textUnits(text);
  const idx = THRESHOLDS[kind].findIndex((t) => u <= t);
  return idx < 0 ? LAST : idx;
};

// 글자 수만으로 고른 크기 클래스(측정 없이 — 줄 수가 고정된 버튼 등)
export const fitTextClass = (text, scale, shift = 0) =>
  SCALES[scale].classes[Math.min(LAST, tierIndex(text, scale) + shift)];

// 뜻 + 품사 라벨이 그려질 모양 그대로의 글자(라벨 길이도 단계 계산에 넣는다)
export const meaningTierText = (meanings, posMap) =>
  groupMeaningsByPos(meanings, posMap)
    .map((g) => (g.label ? `${g.label} ` : '') + g.texts.join(', '))
    .join(' ');

// 측정 대상(block/inline-block)이 maxLines 줄을 넘거나 가로로 넘치는지
const overflows = (el, maxLines) => {
  if (el.scrollWidth > el.clientWidth + 1) return true;
  const cs = window.getComputedStyle(el);
  const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3;
  if (!lh) return false;
  return Math.round(el.scrollHeight / lh) > maxLines;
};

/*
  글자 수로 단계를 고르고, 그려진 결과가 maxLines 줄을 넘으면 한 단계씩 더 줄인다(마지막 단계까지).
  반환: [ref, 크기 클래스]. ref 는 패딩 없는 block/inline-block 글자 요소에 건다.
*/
export const useFitTier = (text, scale, { maxLines = 2 } = {}) => {
  const ref = useRef(null);
  const key = `${scale}|${text}|${maxLines}`;
  const [state, setState] = useState({ key, extra: 0 });
  const extra = state.key === key ? state.extra : 0;
  if (state.key !== key) setState({ key, extra: 0 });
  const idx = Math.min(LAST, tierIndex(text, scale) + extra);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || idx >= LAST) return;
    if (overflows(el, maxLines)) setState((s) => (s.key === key ? { key, extra: s.extra + 1 } : s));
  });

  return [ref, SCALES[scale].classes[idx]];
};
