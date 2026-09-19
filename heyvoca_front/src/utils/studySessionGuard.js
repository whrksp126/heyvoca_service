/*
  studySessionGuard.js — "지금 학습 세션이 진행 중인가"를 앱 전역에서 알 수 있게 하는 모듈 싱글턴.

  왜 필요한가 — buildVersion.js는 백그라운드 복귀(visibilitychange) 시점에 새 빌드가 감지되면
  안전하다고 판단해 `window.location.reload()`를 건다. 하지만 TakeTest(학습 화면)가 떠 있는
  상태에서 이 reload가 발생하면:
    1. 진행 중이던 문제 슬라이드(로컬 React state)가 통째로 날아가고,
    2. 그 순간 진행 중이던 진행률/정오답 저장(updateRecentStudyServer), /study/log 전송이
       reload로 인한 네비게이션에 끊겨 서버에 반영되지 못하거나 응답을 못 받을 수 있고,
    3. 재부팅된 페이지는 마지막으로 "성공적으로 저장된" 서버 상태로 복원되므로, 사용자 눈에는
       "학습 화면이 초기화됐다"·"암기 게이지가 실제보다 훨씬 많이 올랐다"로 보인다
       (진행/로깅용 ref가 재초기화되며 이미 보낸 로그를 다시 보내는 경로가 열림).

  이 모듈은 TakeTest가 마운트돼 있는 동안 "학습 세션 활성" 상태를 표시하고, buildVersion.js는
  이 값을 확인해 학습 세션 중에는 reload를 걸지 않는다. 세션이 끝나면(TakeTest 언마운트) 대기 중이던
  빌드 갱신을 그 즉시(숨김 상태라면) 적용한다 — 무한정 미뤄지지 않는다.
*/

let activeCount = 0;
let releaseListeners = [];

export function beginStudySession() {
  activeCount += 1;
  let released = false;
  return function endStudySession() {
    if (released) return;
    released = true;
    activeCount = Math.max(0, activeCount - 1);
    if (activeCount === 0) {
      releaseListeners.forEach((cb) => {
        try { cb(); } catch (_) { /* 리스너 오류로 세션 종료 처리를 막지 않는다 */ }
      });
    }
  };
}

export function isStudySessionActive() {
  return activeCount > 0;
}

/** 학습 세션이 완전히 끝나는 시점(activeCount 0 진입)에 1회성 콜백을 등록. */
export function onStudySessionEnd(cb) {
  releaseListeners.push(cb);
  return () => {
    releaseListeners = releaseListeners.filter((fn) => fn !== cb);
  };
}

export default { beginStudySession, isStudySessionActive, onStudySessionEnd };
