// 정답 안내 문구 — 매번 같은 말이 나오면 금방 닳으므로 무작위로 돌려 쓴다(바로 직전 것은 피함).
export const CORRECT_PHRASES = ['잘했어요', '정확해요', '좋아요', '잘 캐치했어요'];

let lastIdx = -1;
export function pickCorrectPhrase() {
  let i = Math.floor(Math.random() * CORRECT_PHRASES.length);
  if (i === lastIdx) i = (i + 1) % CORRECT_PHRASES.length;
  lastIdx = i;
  return CORRECT_PHRASES[i];
}
