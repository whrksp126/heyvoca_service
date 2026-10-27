// src/utils/ownedWord.js
//
// 사전 단어(검색 결과·말풍선 word-info)가 내 사전(userDictionary)에 이미 있는지 찾는다.
// 사전 찾기 화면(dictionary/Main)에만 있던 판단을 학습 말풍선(WordInfoBubble)도 같이 쓰도록 옮겼다(QA #19).
// 기준: 사전 id(vocaId) 우선, 없으면 표기 완전 일치(대소문자 무시). word-info 의 word 는 이미 기본형
// (temperatures → temperature)이라 따로 원형을 구하지 않는다.
import { wordLang } from './lang';

// 검색 결과(사전 단어)의 사전 id — 백엔드 응답 필드명이 섞여 있어 모두 본다.
export const dictIdOf = (w) => w?.vocaId ?? w?.voca_id ?? w?.dictionaryId ?? w?.id ?? null;

/**
 * @param {Array} words  내 사전 단어 목록(Object.values(userDictionary))
 * @param {object} item  사전 단어 {word, vocaId|voca_id, language?}
 * @param {string} [lang] 주면 표기 일치 폴백에서 언어가 같은 단어만 본다(영어 'mine' ↔ 일본어 표기 겹침 방지)
 */
export const findOwnedWord = (words, item, lang) => {
  const itemId = dictIdOf(item);
  if (itemId != null) {
    const byId = words.find((w) => {
      const wId = w?.vocaId ?? w?.voca_id ?? w?.dictionaryId ?? null;
      return wId != null && String(wId) === String(itemId);
    });
    if (byId) return byId;
  }
  const key = String(item?.word || '').toLowerCase();
  if (!key) return null;
  return words.find((w) => (w.origin || '').toLowerCase() === key
    && (!lang || wordLang(w, lang) === lang)) || null;
};
