/*
  학습 중 오류 신고 — 사유 목록과 신고 순간 화면 스냅샷 만들기.
  사유 코드는 백엔드 app/routes/content_report.py REASONS 와 같다(어드민도 같은 코드를 쓴다).
  스냅샷은 "이 문제를 그대로 다시 그릴 수 있을 만큼"만 담는다 — 서버 상한 20KB.
*/
import { getNativeEnv } from '../../utils/nativeBridge';
import { wordLang } from '../../utils/lang';

export const REPORT_REASONS = [
  { code: 'meaning', label: '뜻이 틀려요' },
  { code: 'example', label: '예문이 이상해요' },
  { code: 'audio', label: '발음·음성이 이상해요' },
  { code: 'grading', label: '정답 판정이 틀려요' },
  { code: 'question', label: '문제가 이상해요' },
  { code: 'other', label: '기타' },
];

const SNAPSHOT_MAX_CHARS = 18000;

const isScriptType = (t) => typeof t === 'string' && t.startsWith('script');

// 보기 하나 — 표시에 쓰인 값만(글자 학습 보기의 획 데이터 같은 큰 값은 뺀다)
const slimOption = (o) => {
  if (o == null || typeof o !== 'object') return o;
  return {
    origin: o.origin ?? undefined,
    char: o.char ?? undefined,
    meanings: o.displayMeanings ?? o.meanings ?? undefined,
    reading: o.reading ?? undefined,
  };
};

const slimExamples = (examples) =>
  Array.isArray(examples)
    ? examples.slice(0, 10).map((e) => (e && typeof e === 'object'
      ? { origin: e.origin ?? e.exam_en, meaning: e.meaning ?? e.exam_ko }
      : e))
    : undefined;

/**
 * 신고할 수 있는 대상 목록 — 카드 맞추기처럼 한 문제에 단어가 여럿(words)이면 단어마다 하나씩.
 * 각 원소: { key, q(단어 모양), questionType(부모 문제 유형) }
 */
export const expandReportTargets = (question, prefix) => {
  if (!question) return [];
  if (Array.isArray(question.words) && question.words.length) {
    return question.words.map((w, i) => ({
      key: `${prefix}-${i}`,
      q: { ...w, questionType: question.questionType },
      setWords: question.words.map((x) => x.origin),
    }));
  }
  return [{ key: prefix, q: question }];
};

/** 신고 대상 문제 → 서버로 보낼 본문(사유·메모 제외). */
export const buildReportBody = (question, { testType, setWords = null } = {}) => {
  const q = question || {};
  const qt = q.questionType ?? null;
  const script = isScriptType(qt);
  const env = getNativeEnv();

  const snapshot = {
    question_type: qt,
    origin: q.origin ?? null,
    char: q.char ?? null,
    script: q.script ?? null,
    reading: q.reading ?? null,
    pronunciation: q.pronunciation ?? null,
    meanings: q.meanings ?? null,
    examples: slimExamples(q.examples),
    options: Array.isArray(q.options) ? q.options.map(slimOption) : null,
    result_index: q.resultIndex ?? null,
    user_answer_index: q.userResultIndex ?? null,
    is_correct: q.isCorrect ?? null,
    is_retry: !!q.isRetry,
    question_payload: q.questionPayload ?? null,
    tier_shown: q.tierShown ?? null,
    set_words: setWords,
  };
  let json = JSON.stringify(snapshot);
  if (json.length > SNAPSHOT_MAX_CHARS) {
    // 출제형 payload 가 크면 그것부터 뺀다 — 나머지로도 대상은 충분히 특정된다
    snapshot.question_payload = '(생략: 너무 큼)';
    json = JSON.stringify(snapshot);
    if (json.length > SNAPSHOT_MAX_CHARS) snapshot.examples = '(생략: 너무 큼)';
  }

  const userVocaId = script ? null : (Number(q.vocaIndexId ?? q.id) || null);
  const char = q.char ?? null;
  return {
    user_voca_id: userVocaId,
    dict_lang: script ? 'script' : wordLang(q),
    target_key: script && char ? `${q.script ?? 'script'}:${char}` : null,
    word: q.origin ?? char ?? null,
    question_type: qt,
    test_type: testType ?? null,
    snapshot,
    platform: env.isApp ? String(env.platform || '').toLowerCase() || null : 'web',
    app_version: env.version ?? null,
    web_version: import.meta.env.MODE ?? null,
  };
};

/** 신고 시트에 보여 줄 대상 이름 한 줄 */
export const reportTargetLabel = (question) =>
  question?.origin ?? question?.char ?? '';
