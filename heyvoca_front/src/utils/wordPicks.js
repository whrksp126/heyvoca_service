// src/utils/wordPicks.js
//
// 사전 단어를 단어장에 담을 때 들어갈 기본 뜻·예문 개수(QA #19).
// 사전을 통째로 담으면 physical 하나에 뜻 4개·예문 10개+가 쌓여 단어 상세가 너무 길어졌다.
// 서버 추천(/search/word-picks — 대표 뜻 2개 + 사용자 수준 맞춤 예문 2개)을 우선 쓰고,
// 그걸 못 받으면 여기서 뜻은 앞 2개(사전 저장 순 = 대표 순), 예문은 짧은 순 2개로 줄인다.
import { stripHtmlTags } from './common';

export const DEFAULT_MEANING_N = 2;
export const DEFAULT_EXAMPLE_N = 2;

const exampleOrigin = (ex) => String(ex?.origin ?? ex?.en ?? '');
const hasTargetTag = (ex) => /target-word/.test(exampleOrigin(ex));

export const pickDefaultWordContent = ({ meanings = [], examples = [] } = {}) => {
  const ms = (Array.isArray(meanings) ? meanings : []).slice(0, DEFAULT_MEANING_N);
  const usable = (Array.isArray(examples) ? examples : []).filter((ex) => stripHtmlTags(exampleOrigin(ex)).trim());
  const exs = usable
    .map((ex, i) => ({ ex, i, tag: hasTargetTag(ex) ? 0 : 1, len: stripHtmlTags(exampleOrigin(ex)).trim().split(/\s+/).length }))
    .sort((a, b) => a.tag - b.tag || a.len - b.len || a.i - b.i)
    .slice(0, DEFAULT_EXAMPLE_N)
    .map(({ ex }) => ex);
  return { meanings: ms, examples: exs };
};

// 서버 추천 → 실패 시 위 규칙. 서버가 예문을 0개 주면(사전에 예문이 없는 단어) 그대로 0개다.
export const resolveWordPicks = (picks, fallback) => {
  const local = pickDefaultWordContent(fallback);
  if (!picks) return local;
  return {
    meanings: picks.meanings?.length ? picks.meanings.slice(0, DEFAULT_MEANING_N) : local.meanings,
    examples: Array.isArray(picks.examples) ? picks.examples.slice(0, DEFAULT_EXAMPLE_N) : local.examples,
  };
};
