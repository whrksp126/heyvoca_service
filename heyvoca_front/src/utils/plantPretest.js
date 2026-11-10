/*
  새 씨앗 심기 — 사전 테스트(이슈 #25 12차, 15차 단순화). 순수 함수만 둔다(Main.jsx·pages/TakeTest.jsx 가 쓴다).

  흐름(15차)
    ① 사전 테스트 — 단어마다 '뜻 보고 철자 쓰기'(spellingFill, plantPretest='spell') 한 장.
       철자를 만들 수 없는 단어(1글자 등)만 영→한 사지선다(plantPretest='mcq') 한 장으로 본다.
       정답(힌트 없이) → known: 소개·반복 없이 그 자리에서 심는다(그 문제가 단어의 유일한 1차 문제가 되어
       기존 심기 기록 경로로 /study/log 1회). 오답·힌트 사용 정답 → unknown.
       예전의 '오답 뒤 사지선다 2차 테스트(조금 아는 단어)'는 없앴다 — 분류는 아는/모르는 둘뿐이다.
    ② 인터루드 "모르는 단어만 학습해 볼게요!" — 모르는 단어가 0개면 학습 구간이 비어 바로 결과로 간다.
    ③ 학습 — 미리 짜 둔 학습 구간(모든 단어를 모르는 단어로 본 기존 심기 구성: 만나기 + 단어마다 2~3문제 +
       세트 + 문장 만들기)에서 아는 단어를 걸러 낸다(filterPlantTail). 다시 뽑지 않고 걸러 내기만 한다.
  진행바(computePlantProgress)는 두 구간을 따로 센다 — 사전 테스트 중에는 분모 = 단어 수, 답할 때마다
  (정답·오답 무관) 한 칸. 학습 구간에서는 새로 시작해 분모 = 걸러 낸 학습 구간의 채점 단위 수, 채움 규칙은
  농장 돌보기와 같다(utils/studyProgress.js — 정답 즉시, 오답 재출제는 분모 밖).
  사전 테스트 응답 자체는 채점 로그·FSRS·plantAttemptsRef 에 남기지 않는다(known 의 정답만 심기 기록).
*/

export const PRETEST_SPELL = 'spell';
export const PRETEST_MCQ = 'mcq';

export const KNOWN = 'known';
export const UNKNOWN = 'unknown';

export const pretestWordId = (q) => q?.vocaIndexId ?? q?.id;

// 사전 테스트 한 문제의 채점 결과 → 분류. 힌트 없이 맞혀야 아는 단어다(철자·사지선다 공통).
export const classifyPretest = (_stage, correct, { hinted = false } = {}) => (
  correct && !hinted ? KNOWN : UNKNOWN
);

// 사전 테스트에 들어 있는 단어 id 들(철자·사지선다 시작 문제 기준)
export const pretestWordIds = (questions) => {
  const ids = new Set();
  (questions ?? []).forEach((q) => {
    if (q?.plantPretest && !q.pretestFollowup) ids.add(String(pretestWordId(q)));
  });
  return ids;
};

/*
  학습 구간 걸러 내기 — 아는 단어(known)의 문제를 뺀다. 모르는 단어는 기존 심기 구성 그대로 남긴다.
  tail      : 사전 테스트 뒤에 미리 짜 둔 문제들(만나기 → 일반 문제 → 문장 만들기, 기존 buildPlantTestQuestions 구성)
  classOf   : (id:string) → 'known' | 'unknown'(없으면 unknown 취급, 구 저장 세션의 'partial' 도 unknown)
  makeMcq   : (word) → 사지선다 문제(세트에서 단어가 빠져 1단어만 남을 때)
  반환: 새 tail. 구간 표식(phaseStart)은 다시 붙인다 — 첫 문제 'plantLearn', 첫 문장 문제 'sentence'.
*/
export const filterPlantTail = (tail, classOf, makeMcq) => {
  const list = tail ?? [];
  const isKnown = (id) => classOf(String(id)) === KNOWN;
  const isSentence = (q) => q?.plantPhase === 'sentence';
  const strip = (q) => {
    if (!q?.phaseStart) return q;
    const c = { ...q };
    delete c.phaseStart;
    return c;
  };

  const out = [];
  list.forEach((q) => {
    if (!q) return;
    if (Array.isArray(q.words)) {
      const kept = q.words.filter((w) => !isKnown(pretestWordId(w)));
      if (kept.length === q.words.length) { out.push(strip(q)); return; }
      if (kept.length >= 2) { out.push({ ...strip(q), words: kept }); return; }
      kept.forEach((w) => {
        const mcq = makeMcq(w);
        if (mcq) out.push(mcq);
      });
      return;
    }
    if (isKnown(pretestWordId(q))) return;
    out.push(strip(q));
  });

  if (out.length > 0) {
    out[0] = { ...out[0], phaseStart: 'plantLearn' };
    const si = out.findIndex((q, i) => i > 0 && isSentence(q));
    if (si > 0) out[si] = { ...out[si], phaseStart: 'sentence' };
  }
  return out;
};

/*
  심기 세션 진행바 — 사전 테스트 / 학습 두 구간을 따로 센다.
  progressIndex 가 사전 테스트 마지막 문제 이하이면 사전 테스트 칸(분모 = 사전 테스트 문제 수 = 단어 수,
  분자 = 답한 수). 그 뒤면 사전 테스트를 뺀 나머지로 computeStudyProgress(농장 돌보기와 같은 규칙).
  사전 테스트 문제가 없는 세션(구 저장분 등)은 null — 호출부가 기존 계산을 쓴다.
*/
export const computePlantProgress = (questions, progressIndex, computeStudyProgress) => {
  const list = questions ?? [];
  let lastPre = -1;
  list.forEach((q, i) => { if (q?.plantPretest) lastPre = i; });
  if (lastPre < 0) return null;
  if (progressIndex <= lastPre) {
    const heads = list.filter((q) => q?.plantPretest && !q.pretestFollowup);
    const answered = heads.filter((q) => q.pretestGraded || q.pretestClass || q.isCorrect === true || q.isCorrect === false).length;
    return { phase: 'pretest', total: heads.length, done: Math.min(answered, heads.length) };
  }
  return { phase: 'learn', ...computeStudyProgress(list.slice(lastPre + 1)) };
};

// 모르는 단어 수(사전 테스트로 분류된 것 기준) — 학습 구간 인터루드 문구용
export const countUnknownWords = (questions) => (questions ?? [])
  .filter((q) => q?.plantPretest && !q.pretestFollowup && q.pretestClass && q.pretestClass !== KNOWN).length;
