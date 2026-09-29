/*
  /study/recommend, /study/requeue-easier 응답의 item 하나를 프론트 "word" 모양으로 변환.

  pages/TakeTest.jsx(최초 세션 구성)와 components/takeTest/Main.jsx(세션 중 requeue-easier
  재출제, 계약 6절)가 이 하나의 함수를 공유한다 — 두 곳이 각자 다른 모양을 만들면 출제형
  4종(question_payload 기반) 문제가 한쪽 경로에서만 렌더되는 사고로 이어진다.

  계약: heyvoca_service/docs/SENTENCE_QUESTIONS_CONTRACT.md
*/
export const mapRecommendItemToWord = (item, { isDiagnosis = false } = {}) => ({
  id: item.user_voca_id,
  vocaIndexId: item.user_voca_id,
  vocabularySheetId: item.user_voca_book_id,
  origin: item.word,
  meanings: item.meanings ?? [],
  examples: item.examples ?? [],
  // 일본어 연동(INTEGRATION_SPEC 4절 단어 공통 필드) — language 가 TTS·표시 언어를 정한다.
  ...(item.language ? { language: item.language } : {}),
  ...(item.reading ? { reading: item.reading } : {}),
  ...(item.romaji ? { romaji: item.romaji } : {}),
  ...(item.jlpt ? { jlpt: item.jlpt } : {}),
  ...(item.pronunciation ? { pronunciation: item.pronunciation } : {}),
  // 오답 선택지에서 "뜻이 같거나 유사한 단어"를 제외하는 데 쓰는 개념 그룹 정보
  concept_ids: item.concept_ids ?? [],
  meaning_concepts: item.meaning_concepts ?? [],
  fsrs: item.fsrs,
  priorityBucket: item.priority_bucket,
  suggestedQuestionType: item.suggested_question_type ?? null,
  // 출제형 4종 전용 — 서버가 이미 조립한 payload(arrange/typing). 없으면 {}(계약 2절).
  questionPayload: item.question_payload ?? null,
  // plant(새 씨앗 심기) 전용 — 유형별 payload({fillInTheBlankTyping, sentenceArrange})
  questionPayloads: item.question_payloads ?? null,
  // 난이도 tier(계약 5절) — 설정 시트로 유형을 직접 고른 테스트에서는 항상 null.
  tierTarget: item.tier_target ?? null,
  tierShown: item.tier_shown ?? null,
  reason: item.reason ?? null,
  // 서버가 표시를 내려주면 그쪽이 정본이다(호출부가 넘긴 값을 기본값으로 폴백)
  isDiagnosis: item.pending_action === 'REPLANT' || isDiagnosis,
});
