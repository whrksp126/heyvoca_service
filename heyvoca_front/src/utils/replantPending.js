// src/utils/replantPending.js
//
// 부패 진단(학습 시안 §6) 대상 표시 — **임시 다리(bridge)**.
//
// 시안 §6 은 "다시 심기 진단"을 일반 학습과 다르게 그리라고 규정한다
// (헤더 '다시 심기 진단' · 주황 진행바 · 채점 전부터 뜨는 삽 pill).
// 화면은 이미 구현돼 있지만, **서버가 어떤 문제가 진단인지 알려 주지 않는다** —
// GET /study/recommend 응답 item 에 표시 필드가 없고, 백엔드의
// restore.pending_targets() 도 HTTP 라우트로 노출돼 있지 않다.
// 그래서 화면이 영영 뜨지 않는 상태였다.
//
// 표시가 서버에서 내려오기 전까지, 삽으로 '다시 심기'를 예약한 순간의
// user_voca_id 만 기기에 적어 두고 다음 학습에서 그 문제를 진단으로 그린다.
// 진단 정답이 확정되면(= /study/log 가 성공) 지운다.
//
// 어디까지나 표시용이다 — 삽 차감·상태 확정은 전부 서버(restore.complete_diagnosis)가 한다.
// 서버가 표시를 내려주기 시작하면 이 파일을 통째로 지우면 된다.

const KEY = 'heyvoca_replant_pending';

const read = () => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => v !== null && v !== undefined) : [];
  } catch (e) {
    return [];
  }
};

const write = (ids) => {
  try {
    if (!ids.length) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(ids.slice(0, 200)));
  } catch (e) {
    /* 저장소를 못 쓰면 진단 표시만 안 뜬다 — 학습 자체는 그대로 진행된다 */
  }
};

/** 진단을 기다리는 user_voca_id 집합. 문자열/숫자 섞임에 대비해 String 으로 통일한다. */
export const getPendingReplantIds = () => new Set(read().map(String));

/** 다시 심기 예약 성공 시 — 예약된 id 를 더한다 */
export const addPendingReplantIds = (ids) => {
  if (!Array.isArray(ids) || ids.length === 0) return;
  const next = new Set(read().map(String));
  ids.forEach((id) => next.add(String(id)));
  write([...next]);
};

/** 예약 취소(되돌리기) 또는 진단 정답 확정 시 — 해당 id 를 뺀다 */
export const removePendingReplantIds = (ids) => {
  if (!Array.isArray(ids) || ids.length === 0) return;
  const drop = new Set(ids.map(String));
  write(read().map(String).filter((id) => !drop.has(id)));
};
