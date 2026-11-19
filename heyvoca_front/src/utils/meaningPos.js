// 뜻 품사(pos) — 단일 소스(2026-11-19 회의 QA).
//
// 서버는 뜻 문자열 배열(meanings)과 같은 순서/길이의 품사 배열을 따로 내려 준다
// (단어장/단어 목록: meaningPos, 학습 추천: meaning_pos, 사전 상세: meanings:[{meaning,pos}]).
// 화면은 뜻을 고르거나 섞은 뒤(getDisplayMeanings) 그리므로, 위치가 아니라 "뜻 텍스트 → 품사"
// 맵으로 찾는다. 백엔드 정본: heyvoca_back/app/services/meaning_pos.py

// UD 품사 태그 → 한국어 라벨
export const POS_LABEL_KO = {
  NOUN: '명사', VERB: '동사', ADJ: '형용사', ADV: '부사', PRON: '대명사',
  DET: '한정사', ADP: '전치사', CCONJ: '접속사', SCONJ: '접속사', NUM: '수사',
  INTJ: '감탄사', PART: '불변화사', AUX: '조동사', PROPN: '고유명사',
};

export const posLabelKo = (tag) => (tag && POS_LABEL_KO[tag]) || null;

const addPairs = (map, meanings, posList) => {
  if (!Array.isArray(meanings)) return;
  meanings.forEach((m, i) => {
    if (m && typeof m === 'object') {
      const text = m.meaning ?? m.text;
      if (text && m.pos && !map.has(text)) map.set(text, m.pos);
      return;
    }
    const tag = Array.isArray(posList) ? posList[i] : null;
    if (typeof m === 'string' && tag && !map.has(m)) map.set(m, tag);
  });
};

// word(단어 객체) → Map<뜻 텍스트, UD 태그>
export const buildMeaningPosMap = (word) => {
  const map = new Map();
  if (!word) return map;
  addPairs(map, word.meanings, word.meaningPos ?? word.meaning_pos);
  for (const vb of word.vocaBooks ?? []) addPairs(map, vb?.meanings, vb?.meaningPos);
  addPairs(map, word.dictDetail?.meanings);
  return map;
};

// 뜻 리스트를 품사 묶음으로 — 연속으로 같은 품사인 뜻은 한 라벨 아래로 모은다.
// [{ label: '동사'|null, texts: [...] }]
export const groupMeaningsByPos = (meanings, posMap) => {
  const groups = [];
  for (const m of meanings ?? []) {
    const text = typeof m === 'string' ? m : (m?.meaning ?? m?.text ?? '');
    if (!text) continue;
    const label = posLabelKo(posMap?.get?.(text));
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.texts.push(text);
    else groups.push({ label, texts: [text] });
  }
  return groups;
};
