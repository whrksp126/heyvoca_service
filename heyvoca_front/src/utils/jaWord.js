/*
  일본어 단어 표시 규칙 — 화면 간 공용 단일 소스.

  - 읽기(reading) 값은 word.reading 우선, 없으면 word.pronunciation(구 데이터 호환).
  - 가나만 있는 단어(reading === 표제어)는 읽기 줄을 숨긴다(같은 글자를 두 번 보여 주지 않음).
  - 표제어 키는 화면마다 달라 origin → word 순으로 본다(검색 제안 항목은 word).
*/
import { wordLang, isJa } from './lang';

export const getReading = (word) => {
  if (!word || typeof word !== 'object') return '';
  return String(word.reading || word.pronunciation || '').trim();
};

const headword = (word) => String(word?.origin ?? word?.word ?? '').trim();

// ja 단어이고, 읽기가 있고, 읽기가 표제어와 다를 때만 true.
// fallbackLang: word.language 가 없을 때 쓸 언어(생략 시 현재 학습 언어).
export const shouldShowReading = (word, fallbackLang) => {
  if (!word || typeof word !== 'object') return false;
  if (!isJa(wordLang(word, fallbackLang))) return false;
  const reading = getReading(word);
  return !!reading && reading !== headword(word);
};

// JLPT 배지를 붙일 단어인지(ja 단어 + jlpt 값 존재). 배지 자체가 유효 급수만 렌더한다.
export const jlptLevelOf = (word, fallbackLang) =>
  (word && isJa(wordLang(word, fallbackLang)) ? word.jlpt || null : null);
