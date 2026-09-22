// 선택지/카드에 표시할 뜻 고르기 — 단일 소스.
//
// meanings가 여러 개면 2~3개만 선택(중복 제거). 표시 뜻은 '뜻 내용'을 시드로 결정적으로
// 고른다 → 정답 선택 등으로 재렌더돼도 옵션 텍스트가 바뀌지 않는다(예전엔 Math.random이라
// 재계산 시 옵션이 변경되는 버그가 있었다).
//
// 사지선다(takeTest/Main.jsx)와 빈칸 채우기(영→한, plugins/questionTypes)가 같은 함수를
// 써야 한다 — 한쪽만 규칙이 달라지면 같은 단어의 뜻이 유형마다 다르게 보인다.
export const getDisplayMeanings = (meanings) => {
  if (!meanings || meanings.length === 0) return [];

  // 중복 제거
  const uniqueMeanings = [...new Set(meanings)];

  if (uniqueMeanings.length <= 2) return uniqueMeanings;

  // 내용 기반 시드 PRNG(mulberry32) — 같은 뜻 집합이면 항상 같은 결과.
  const seedStr = uniqueMeanings.join('|');
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  const rand = () => {
    h = (h + 0x6D2B79F5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const count = rand() < 0.5 ? 2 : 3;
  const shuffled = [...uniqueMeanings].sort(() => rand() - 0.5);
  return shuffled.slice(0, Math.min(count, uniqueMeanings.length));
};

// 선택지 한 줄로 합친 표시 문자열 ("뜻1, 뜻2")
export const getDisplayMeaningText = (meanings) => getDisplayMeanings(meanings).join(', ');
