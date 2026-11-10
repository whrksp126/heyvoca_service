/*
  새 씨앗 심기 — 사전 테스트(이슈 #25 12차). 순수 함수만 둔다(Main.jsx·pages/TakeTest.jsx 가 쓴다).

  흐름
    ① 세션 맨 앞에 단어마다 '뜻 보고 철자 쓰기'(spellingFill, plantPretest='spell') 한 장.
       철자를 만들 수 없는 단어(1글자 등)는 곧장 사지선다(plantPretest='mcq')로 본다.
    ② 철자 정답(힌트 없이) → known: 소개·반복 없이 그 자리에서 심는다(그 철자 문제가 단어의 유일한
       1차 문제가 되어 기존 심기 기록 경로로 /study/log 1회).
       철자 정답(힌트 사용) → partial. 철자 오답 → 바로 뒤에 같은 단어 영→한 사지선다(plantPretest='mcq').
    ③ 사지선다 정답 → partial(소개 + 반복 1회), 오답 → unknown(소개 + 전체 반복, 기존 그대로).
    ④ 모든 단어가 분류되면 미리 짜 둔 학습 구간(모든 단어를 unknown 으로 본 기존 구성)을 분류에 맞게
       걸러 낸다(filterPlantTail). 다시 뽑지 않고 걸러 내기만 하므로 진행바 분모가 늘지 않는다 —
       처음부터 '사전 테스트 + 전체 학습'으로 잡힌 분모가 아는 단어만큼 줄어 앞으로만 뛴다.
  사전 테스트 응답 자체는 채점 로그·FSRS·plantAttemptsRef 에 남기지 않는다(known 의 철자 정답만 심기 기록).
  사전 사지선다(오답 뒤에 끼우는 문제)는 진행바에서 재출제처럼 다룬다 — 분모에 넣지 않고, 맞히면
  그 단어의 빈 칸(철자 오답)을 채운다(utils/studyProgress.js).
*/

export const PRETEST_SPELL = 'spell';
export const PRETEST_MCQ = 'mcq';

export const KNOWN = 'known';
export const PARTIAL = 'partial';
export const UNKNOWN = 'unknown';

const TYPING_TYPES = ['fillInTheBlankTyping', 'spellingFill'];

export const pretestWordId = (q) => q?.vocaIndexId ?? q?.id;

// 사전 테스트 한 문제의 채점 결과 → 분류(또는 'mcq' = 사지선다를 한 번 더 낸다)
export const classifyPretest = (stage, correct, { hinted = false } = {}) => {
  if (stage === PRETEST_SPELL) {
    if (correct) return hinted ? PARTIAL : KNOWN;
    return PRETEST_MCQ;
  }
  return correct ? PARTIAL : UNKNOWN;
};

// 사전 테스트에 들어 있는 단어 id 들(철자·사지선다 시작 문제 기준)
export const pretestWordIds = (questions) => {
  const ids = new Set();
  (questions ?? []).forEach((q) => {
    if (q?.plantPretest && !q.pretestFollowup) ids.add(String(pretestWordId(q)));
  });
  return ids;
};

/*
  학습 구간 걸러 내기.
  tail      : 사전 테스트 뒤에 미리 짜 둔 문제들(만나기 → 일반 문제 → 문장 만들기, 기존 buildPlantTestQuestions 구성)
  classOf   : (id:string) → 'known' | 'partial' | 'unknown'(없으면 unknown 취급)
  makeMcq   : (word) → 사지선다 문제(부분 단어의 1회 문제를 새로 만들어야 할 때·세트가 깨질 때)
  반환: 새 tail. 구간 표식(phaseStart)은 다시 붙인다 — 첫 문제 'plantLearn', 첫 문장 문제 'sentence'.
*/
export const filterPlantTail = (tail, classOf, makeMcq) => {
  const list = tail ?? [];
  const cls = (id) => classOf(String(id)) ?? UNKNOWN;
  const isSet = (q) => Array.isArray(q?.words);
  const isIntro = (q) => q?.questionType === 'wordIntro';
  const isSentence = (q) => q?.plantPhase === 'sentence';
  const strip = (q) => {
    if (!q?.phaseStart) return q;
    const c = { ...q };
    delete c.phaseStart;
    return c;
  };

  // 부분 단어(partial)의 '1회 문제' — 일반 단일 문제 중 고르기형 우선, 없으면 아무 단일 문제
  const keeper = new Map(); // id → tail index
  list.forEach((q, i) => {
    if (!q || isSet(q) || isIntro(q) || isSentence(q)) return;
    const id = String(pretestWordId(q));
    if (cls(id) !== PARTIAL) return;
    const cur = keeper.get(id);
    const typing = TYPING_TYPES.includes(q.questionType);
    if (cur == null) keeper.set(id, i);
    else if (!typing && TYPING_TYPES.includes(list[cur].questionType)) keeper.set(id, i);
  });
  const partialCovered = new Set(keeper.keys()); // 1회 문제가 정해진 부분 단어

  const out = [];
  const extraMcq = []; // 세트가 깨져 사지선다로 바꾸는 문제 — 원래 자리에 넣는다
  const introWords = new Map(); // id → 만나기 문제(부분 단어 사지선다를 만들 단어 원본)
  list.forEach((q, i) => {
    if (!q) return;
    if (isIntro(q)) {
      const id = String(pretestWordId(q));
      if (cls(id) === KNOWN) return;
      introWords.set(id, q);
      out.push(strip(q));
      return;
    }
    if (isSet(q)) {
      const kept = q.words.filter((w) => {
        const id = String(pretestWordId(w));
        const c = cls(id);
        if (c === UNKNOWN) return true;
        if (c === PARTIAL && !partialCovered.has(id)) {
          partialCovered.add(id); // 이 세트가 그 단어의 1회 문제
          return true;
        }
        return false;
      });
      if (kept.length === q.words.length) { out.push(strip(q)); return; }
      if (kept.length >= 2) { out.push({ ...strip(q), words: kept }); return; }
      kept.forEach((w) => {
        const mcq = makeMcq(w);
        if (mcq) out.push(mcq);
      });
      return;
    }
    const id = String(pretestWordId(q));
    const c = cls(id);
    if (c === KNOWN) return;
    if (isSentence(q)) { if (c === UNKNOWN) out.push(strip(q)); return; }
    if (c === PARTIAL) { if (keeper.get(id) === i) out.push(strip(q)); return; }
    out.push(strip(q));
  });

  // 1회 문제를 못 받은 부분 단어 — 만나기 뒤(일반 문제 맨 앞)에 사지선다 한 문제
  introWords.forEach((introQ, id) => {
    if (cls(id) !== PARTIAL || partialCovered.has(id)) return;
    const mcq = makeMcq(introQ);
    if (mcq) extraMcq.push(mcq);
  });
  if (extraMcq.length > 0) {
    let at = 0;
    out.forEach((q, i) => { if (isIntro(q)) at = i + 1; });
    out.splice(at, 0, ...extraMcq);
  }

  if (out.length > 0) {
    out[0] = { ...out[0], phaseStart: 'plantLearn' };
    const si = out.findIndex((q, i) => i > 0 && isSentence(q));
    if (si > 0) out[si] = { ...out[si], phaseStart: 'sentence' };
  }
  return out;
};
