/**
 * buildVersion.js — "지금 열려 있는 이 탭이 낡았는가" 를 스스로 판정하고, **안전한 순간에** 새로고침한다.
 *
 * 왜 필요한가: prod 배포는 컨테이너를 통째로 교체하므로 이전 빌드의 해시 자산이 서버에서 사라진다.
 * 그런데 사용자의 웹뷰/탭은 그대로 열려 있다(앱을 종료하지 않는 한). 그 상태에서 폰트·wasm·이미지처럼
 * **나중에 요청되는 자산**을 부르면 404 가 나고, 사용자에겐 원인 모를 깨짐으로 보인다.
 * 예전에는 백엔드 `web_version` 을 손으로 올려야만 새로고침이 걸렸고, 잊으면 방치됐다.
 * 이제는 빌드가 남긴 지문(`/version.json`, vite.config.js 의 buildFingerprintPlugin)을 직접 본다.
 *
 * 규율 2개:
 *  1. **작업 중에 새로고침하지 않는다.** 새 빌드를 감지해도 즉시 reload 하지 않고 "대기" 로 표시만 하고,
 *     화면이 보이지 않게 된 뒤 다시 돌아오는 순간(앱 재진입 = 사용자가 아무것도 하고 있지 않은 시점)에
 *     적용한다. 학습 도중 갑자기 새로고침되면 그건 우리가 없애려는 버그보다 나쁘다.
 *  2. **모르면 아무것도 하지 않는다.** version.json 을 못 읽거나(구버전 배포·네트워크 오류) 값이
 *     이상하면 조용히 넘어간다. 잘못된 판정으로 무한 새로고침을 만드는 것이 최악이다.
 */

const VERSION_URL = '/version.json';
// 앱을 켜 둔 채 오래 쓰는 사용자를 위한 주기 확인. 짧을 이유가 없다(배포는 하루 몇 번이다).
const POLL_INTERVAL_MS = 10 * 60 * 1000;

let currentBuild = null;   // 이 탭이 기준으로 삼는 빌드 지문
let pendingBuild = null;   // 새로 감지한 빌드(안전한 순간을 기다리는 중이면 non-null)
let started = false;

async function fetchBuild() {
  try {
    // no-store: 판정 근거가 캐시되면 영원히 낡은 값을 본다.
    const res = await fetch(`${VERSION_URL}?_cb=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.build === 'string' && data.build ? data.build : null;
  } catch (_) {
    return null; // 오프라인·배포 중 등 — 모르면 아무것도 하지 않는다
  }
}

function applyIfPending() {
  if (!pendingBuild) return;
  // ★ 새로고침을 **걸기 전에** 기준값을 목표 빌드로 옮긴다.
  //   실제 브라우저라면 reload 로 모듈이 재초기화되므로 무의미해 보이지만, 새로고침이 실제로 일어나지
  //   않는 경우(웹뷰가 백그라운드에서 지연시키거나 차단하는 경우)에 이게 없으면 화면 전환 때마다
  //   reload 를 다시 걸어 **무한 새로고침**이 된다(테스트로 재현됨).
  //   대가는 "새로고침이 실패하면 그 빌드에 대해선 더 안 조른다" 인데, 다음 배포나 다음 진입에서
  //   자연히 해소되므로 무한 루프보다 훨씬 안전하다.
  currentBuild = pendingBuild;
  pendingBuild = null;
  // replace 가 아니라 reload — 히스토리를 건드리지 않는다(뒤로가기 동작 보존).
  window.location.reload();
}

async function check() {
  const build = await fetchBuild();
  if (!build) return;
  if (!currentBuild) {
    currentBuild = build; // 최초 1회: 기준값 확보(이때는 절대 새로고침하지 않는다)
    return;
  }
  if (build === currentBuild) return;

  // 새 빌드가 떴다. 지금 화면이 보이지 않는 상태라면 바로 적용해도 사용자를 방해하지 않는다.
  pendingBuild = build;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') applyIfPending();
}

/**
 * 감시 시작(앱 부팅 시 1회). 반환값은 정리 함수.
 *  ※ 개발 서버(vite dev)에는 version.json 이 없다 → fetchBuild 가 null 을 돌려주고 아무 일도 안 한다.
 */
export function startBuildVersionWatch() {
  if (started || typeof window === 'undefined') return () => {};
  started = true;

  check();
  const timer = setInterval(check, POLL_INTERVAL_MS);

  const onVisibility = () => {
    if (document.visibilityState === 'visible') {
      // 돌아온 순간 = 사용자가 아직 아무것도 하지 않은 시점 → 대기 중이던 갱신을 여기서 적용한다.
      applyIfPending();
      check();
    } else {
      applyIfPending();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisibility);
    started = false;
  };
}

/** 진단용 — 콘솔에서 상태를 확인할 때. */
export function getBuildVersionState() {
  return { currentBuild, pendingBuild, pendingReload: !!pendingBuild };
}
