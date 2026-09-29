// src/utils/vocaSheetsTab.js
//
// 학습장(pages/VocabularySheets) 상단 탭("단어장"|"글자") 선택 기억.
// localStorage가 없거나(웹뷰 프라이빗 모드 등) 예외를 던지는 환경도 있어 항상 try-catch.

export const VOCA_SHEETS_TABS = ['books', 'script'];
const STORAGE_KEY = 'heyvoca_vocabulary_sheets_tab';

export const getStoredVocaSheetsTab = () => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return VOCA_SHEETS_TABS.includes(v) ? v : 'books';
  } catch {
    return 'books';
  }
};

export const setStoredVocaSheetsTab = (tab) => {
  if (!VOCA_SHEETS_TABS.includes(tab)) return;
  try {
    localStorage.setItem(STORAGE_KEY, tab);
  } catch {
    /* 저장 실패는 무시 — 이번 세션 동안만 기억 못 할 뿐 기능에는 지장 없다 */
  }
};
