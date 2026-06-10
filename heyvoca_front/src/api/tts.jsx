import { backendUrl, fetchDataAsync } from '../utils/common';

// localStorage의 사용자 voice 설정 (getTextSound/resolve와 동일 키 사용)
const getUserVoices = () => {
  try {
    return JSON.parse(localStorage.getItem('ttsVoices') || '{}') || {};
  } catch (e) {
    return {};
  }
};

// 학습/테스트 시작 전 TTS 사전 캐싱(워밍).
// 백엔드는 캐시에 없는 음성만 생성하므로, 학습 중 첫 재생 지연이 사라진다.
// fire-and-forget 으로 호출 — 실패해도 학습 흐름엔 영향 없음.
export const prewarmTts = async (items) => {
  if (!Array.isArray(items) || items.length === 0) return;
  const voices = getUserVoices();
  const seen = new Set();
  const payloadItems = [];
  for (const it of items) {
    const text = (it?.text ?? '').trim();
    const language = it?.language;
    if (!text || (language !== 'en' && language !== 'ko')) continue;
    const key = `${language}::${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = { text, language };
    if (voices[language]) entry.voice = voices[language];
    payloadItems.push(entry);
  }
  if (payloadItems.length === 0) return;
  try {
    return await fetchDataAsync(`${backendUrl}/tts/prewarm`, 'POST', { items: payloadItems });
  } catch (e) {
    console.warn('[TTS] prewarm 실패:', e);
  }
};

// 테스트 문제 목록에서 자동 재생되는 텍스트(영어 단어) 수집.
// multipleChoice 계열은 origin, cardMatch 계열은 words[].origin 을 재생한다.
export const collectTestTexts = (questions) => {
  const out = [];
  if (!Array.isArray(questions)) return out;
  for (const q of questions) {
    if (q?.origin) out.push({ text: q.origin, language: 'en' });
    if (Array.isArray(q?.words)) {
      for (const w of q.words) {
        if (w?.origin) out.push({ text: w.origin, language: 'en' });
      }
    }
  }
  return out;
};

// 학습 카드 목록에서 자동 재생되는 텍스트 전부 수집.
// 재생 순서: 단어(en) → 뜻(ko) → 예문(en) → 예문 뜻(ko).
export const collectStudyTexts = (words) => {
  const out = [];
  if (!Array.isArray(words)) return out;
  for (const w of words) {
    if (w?.origin) out.push({ text: w.origin, language: 'en' });
    for (const m of (w?.meanings || [])) {
      if (m) out.push({ text: m, language: 'ko' });
    }
    for (const ex of (w?.examples || [])) {
      const en = ex?.origin || ex?.sentence;
      const ko = ex?.meaning || ex?.translation;
      if (en) out.push({ text: en, language: 'en' });
      if (ko) out.push({ text: ko, language: 'ko' });
    }
  }
  return out;
};
