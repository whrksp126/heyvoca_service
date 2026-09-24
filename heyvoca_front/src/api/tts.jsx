import { backendUrl, fetchDataAsync, prefetchTtsList, stripHtmlTags } from '../utils/common';
import { SUPPORTED_TTS_LANGS, wordLang, isJa } from '../utils/lang';

// fillInTheBlank 빈칸 문장의 강조 마커(<strong class="target-word">…</strong>) — 빈칸 자체는
// 채점 전 텍스트로 드러나면 안 되므로, 단어 수집 시 이 구간을 통째로 제거하고 나머지만 쓴다.
const TARGET_WORD_TAG_RE = /<strong\b[^>]*\btarget-word\b[^>]*>[\s\S]*?<\/strong\s*>/gi;
// 빈칸 문장에서 탭 가능한 "단어" 추출 — FillInTheBlankQuestion.jsx의 WORD_EDGE_PUNCT_RE와 같은 기준.
const WORD_TOKEN_RE = /[A-Za-z0-9'’]+/g;

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
    if (!text || !SUPPORTED_TTS_LANGS.includes(language)) continue;
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

// 세션 시작 시 워밍 2단계:
//  ① 서버 prewarm — 캐시에 없는 음성만 생성(객체 존재 보장). 1요청으로 배치 생성해 resolve 레이트리밋 회피.
//  ② 클라이언트 prefetch — mp3 blob을 미리 받아둠 → 클릭/자동재생 시 네트워크 없이 즉시 재생.
// fire-and-forget으로 호출(학습 진입을 막지 않음). ②는 ①이 객체를 만들어둔 뒤 실행해 대부분 캐시 히트.
export const warmTts = async (items) => {
  if (!Array.isArray(items) || items.length === 0) return;
  try {
    await prewarmTts(items);
  } catch (e) { /* 서버 prewarm 실패해도 prefetch가 개별 생성으로 폴백 */ }
  prefetchTtsList(items);
};

// 테스트 문제 목록에서 자동 재생되는 텍스트(영어 단어) 수집.
// multipleChoice 계열은 origin, cardMatch 계열은 words[].origin 을 재생한다.
// fillInTheBlank는 진입 시 위 카드(한국어 예문)를 자동재생하므로 origin 대신 shownText를 쓴다.
export const collectTestTexts = (questions) => {
  const out = [];
  if (!Array.isArray(questions)) return out;
  for (const q of questions) {
    if (q?.questionType === 'fillInTheBlank') {
      const shown = stripHtmlTags(q.shownText);
      if (shown) out.push({ text: shown, language: 'ko' });
      continue;
    }
    if (q?.origin) out.push({ text: q.origin, language: wordLang(q) });
    if (Array.isArray(q?.words)) {
      for (const w of q.words) {
        if (w?.origin) out.push({ text: w.origin, language: wordLang(w, wordLang(q)) });
      }
    }
  }
  return out;
};

// 준비 진행률을 "세밀하게" 보고하며 TTS를 사전 캐싱한다.
// 서버 배치 생성(prewarm)을 통째로 한 번 부르면 생성이 끝날 때까지 진행률이 멈췄다가 갑자기
// 차오른다. 이를 막기 위해 생성을 작은 청크로 나눠 호출하고, 청크가 끝날 때마다 진행률을 올린다.
// 마지막에 클라이언트 blob prefetch(대부분 캐시 히트)로 마무리한다. onProgress(0~1) 콜백.
export const prepareTtsWithProgress = async (items, onProgress, { chunkSize = 4 } = {}) => {
  const report = (p) => {
    if (typeof onProgress === 'function') {
      try { onProgress(Math.max(0, Math.min(1, p))); } catch (e) { /* 콜백 오류 무시 */ }
    }
  };

  // dedup + 유효 항목만
  const seen = new Set();
  const list = [];
  for (const it of (Array.isArray(items) ? items : [])) {
    const text = (it?.text ?? '').trim();
    const language = it?.language;
    if (!text || !SUPPORTED_TTS_LANGS.includes(language)) continue;
    const k = `${language}::${text}`;
    if (seen.has(k)) continue;
    seen.add(k);
    list.push({ text, language });
  }
  const total = list.length;
  if (total === 0) { report(1); return; }

  // 1) 서버 배치 생성 — 청크 단위로 진행률 0 → 0.85 (생성 진행에 따라 바가 꾸준히 오름)
  let generated = 0;
  for (let i = 0; i < list.length; i += chunkSize) {
    const chunk = list.slice(i, i + chunkSize);
    try { await prewarmTts(chunk); } catch (e) { /* 실패해도 prefetch가 개별 폴백 */ }
    generated += chunk.length;
    report(0.85 * (generated / total));
  }

  // 2) 클라이언트 blob prefetch(대부분 캐시 히트) — 0.85 → 1
  await prefetchTtsList(list, 4, (done, t) => report(0.85 + 0.15 * (t ? done / t : 1)));
  report(1);
};

// 테스트 문제에서 재생 가능한 "모든" 텍스트(단어·의미·예문) 수집 — 진입 후 백그라운드 캐싱용.
// 테스트 자체는 단어(origin)만 자동재생하지만, 학습 결과·단어 상세에서 의미/예문 TTS를
// 즉시 재생할 수 있도록 진행 중 백그라운드로 미리 데워둔다(진입 게이트에는 포함하지 않음).
export const collectTestFullTexts = (questions) => {
  const out = [];
  const pushWord = (w, fallbackLang) => {
    if (!w) return;
    const lang = wordLang(w, fallbackLang);
    if (w.origin) out.push({ text: w.origin, language: lang });
    for (const m of (w.meanings || [])) {
      if (typeof m === 'string' && m) out.push({ text: m, language: 'ko' });
    }
    for (const ex of (w.examples || [])) {
      const src = ex?.origin || ex?.sentence;
      const ko = ex?.meaning || ex?.translation;
      if (src) out.push({ text: src, language: lang });
      if (ko) out.push({ text: ko, language: 'ko' });
    }
  };
  if (!Array.isArray(questions)) return out;
  for (const q of questions) {
    const qLang = wordLang(q);
    if (q?.questionType === 'fillInTheBlank') {
      // 선택지(학습 언어 단어) 4개 — 탭 시 재생.
      if (Array.isArray(q.options)) {
        for (const opt of q.options) {
          const text = stripHtmlTags(opt);
          if (text) out.push({ text, language: qLang });
        }
      }
      // 빈칸 문장의 각 영어 단어 — 단어 탭 시 재생(빈칸 자체는 제외).
      // 일본어 예문은 공백 단어 경계가 없어 WORD_TOKEN_RE 로 자를 수 없으므로 건너뛴다.
      if (!isJa(qLang)) {
        const withoutBlank = String(q.blankText ?? '').replace(TARGET_WORD_TAG_RE, ' ');
        const plain = stripHtmlTags(withoutBlank);
        const seenWords = new Set();
        const wordMatches = plain.match(WORD_TOKEN_RE) || [];
        for (const w of wordMatches) {
          const key = w.toLowerCase();
          if (seenWords.has(key)) continue;
          seenWords.add(key);
          out.push({ text: w, language: qLang });
        }
      }
    }
    pushWord(q, qLang);
    if (Array.isArray(q?.words)) q.words.forEach((w) => pushWord(w, qLang));
  }
  return out;
};

// 학습 카드 목록에서 자동 재생되는 텍스트 전부 수집.
// 재생 순서: 단어(학습 언어) → 뜻(ko) → 예문(학습 언어) → 예문 뜻(ko).
export const collectStudyTexts = (words) => {
  const out = [];
  if (!Array.isArray(words)) return out;
  for (const w of words) {
    const lang = wordLang(w);
    if (w?.origin) out.push({ text: w.origin, language: lang });
    for (const m of (w?.meanings || [])) {
      if (m) out.push({ text: m, language: 'ko' });
    }
    for (const ex of (w?.examples || [])) {
      const src = ex?.origin || ex?.sentence;
      const ko = ex?.meaning || ex?.translation;
      if (src) out.push({ text: src, language: lang });
      if (ko) out.push({ text: ko, language: 'ko' });
    }
  }
  return out;
};
