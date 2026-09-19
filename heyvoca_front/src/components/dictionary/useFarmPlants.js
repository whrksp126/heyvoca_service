import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { getFarmPlantsApi } from '../../api/farm';
import { useVocabulary } from '../../context/VocabularyContext';

/**
 * 찾기 화면 — 내 단어 전체 목록에 붙일 농장 상태 맵.
 *
 * 시안 find §4 는 목록의 모든 행에 작물 그림과 다음 복습을 요구한다. 그런데
 * `/farm/plants` 는 정렬 옵션이 없고(항상 user_voca_id asc) 화면의 정렬은
 * 최근 수정순 · 생성일순 · 알파벳순이라, 서버 페이지를 그대로 화면 페이지로 쓸 수 없다.
 * 그래서 목록 자체는 이미 클라이언트에 있는 userDictionary 로 그리고,
 * 농장 상태만 커서로 전부 받아 `user_voca_id → item` 맵으로 붙인다.
 *
 * 맵이 도착하기 전에도 목록은 그려진다 — 작물만 나중에 채워진다.
 *
 * QA §E — 최초 진입 뒤에도 두 시점에 조용히 재조회한다(둘 다 스피너 없이 기존 맵을
 * 유지한 채 새 맵으로 한 번에 교체한다).
 *   ① 학습 세션이 끝났을 때(lastSessionResult.completedAt 변경) — 방금 물 준 단어의
 *      단계가 바로 반영돼야 한다.
 *   ② 찾기 탭이 다시 활성될 때 — 찾기 탭은 keep-alive(TabShell)라 다른 탭에서 학습하고
 *      돌아와도 다시 마운트되지 않는다. 마운트 신호 대신 `useLocation().pathname` 이
 *      '/dictionary' 로 바뀌는 시점(=탭 전환)을 감지해 재조회한다.
 * 재조회가 진행 중일 때 또 트리거되면(예: 두 조건이 거의 동시에 일어남) 무시한다 —
 * loadingRef 가 그 판단을 맡는다.
 */
const PAGE_SIZE = 100;   // 서버 상한
const MAX_PAGES = 60;    // 6,000개까지. 그 이상은 화면이 감당할 목록이 아니다

export default function useFarmPlants(enabled = true) {
  const [plants, setPlants] = useState({});
  const [isPlantsLoading, setIsPlantsLoading] = useState(false);
  const loadingRef = useRef(false);   // 재조회 진행 중 — 겹쳐 들어오면 무시
  const startedRef = useRef(false);   // 최초 1회 로딩 여부(스피너는 그때만 켠다)

  const { lastSessionResult } = useVocabulary();
  const location = useLocation();
  const isDictionaryTab = location.pathname === '/dictionary';
  // 탭이 "다시" 활성될 때만 반응해야 한다 — 처음부터 이 경로로 마운트된 경우는
  // 아래 최초 로딩 effect가 이미 처리하므로 여기서 또 부르면 중복 호출이 된다.
  const wasDictionaryTabRef = useRef(isDictionaryTab);

  const load = useCallback(async () => {
    if (!enabled || loadingRef.current) return;
    loadingRef.current = true;
    const isFirstLoad = !startedRef.current;
    startedRef.current = true;
    if (isFirstLoad) setIsPlantsLoading(true);

    const map = {};
    let cursor;
    let ok = true; // 첫 페이지부터 끝까지 전부 성공했을 때만 true로 남는다
    try {
      for (let page = 0; page < MAX_PAGES; page += 1) {
        // fetchDataAsync 는 비-2xx 도 throw 하지 않는다 → code 를 직접 본다
        const res = await getFarmPlantsApi({ limit: PAGE_SIZE, cursor });
        if (res?.code !== 200) { ok = false; break; }
        (res.data?.items || []).forEach((item) => {
          map[String(item.user_voca_id)] = item;
        });
        cursor = res.data?.next_cursor;
        if (!cursor) break;
      }
      // 재조회(학습 후 갱신 등) 도중 서버가 한 페이지라도 실패하면 map 은 부분(심하면 빈)
      // 상태다. 그걸 그대로 덮으면 서버 일시 오류 하나가 이미 심긴 작물까지 전부 봉투로
      // 되돌리는 셈이라, 전부 성공했을 때만 교체하고 실패하면 기존 맵을 유지한 채 로그만
      // 남긴다. 단, 최초 로딩 실패는 어차피 빈 맵으로 시작하므로 그대로 반영해도 된다.
      if (ok || isFirstLoad) {
        setPlants(map);
      } else {
        console.error('농장 작물 재조회 실패 — 기존 목록을 유지합니다.');
      }
    } catch (err) {
      console.error('농장 작물 목록 조회 오류:', err);
    } finally {
      if (isFirstLoad) setIsPlantsLoading(false);
      loadingRef.current = false;
    }
  }, [enabled]);

  // 최초 진입 + 학습 세션 완료 시 재조회
  useEffect(() => {
    if (!enabled) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, lastSessionResult?.completedAt]);

  // 찾기 탭이 다시 활성될 때 재조회 — keep-alive 탭이라 마운트가 아니라 경로 전환으로 감지한다
  useEffect(() => {
    const wasActive = wasDictionaryTabRef.current;
    wasDictionaryTabRef.current = isDictionaryTab;
    if (!wasActive && isDictionaryTab) load();
  }, [isDictionaryTab, load]);

  // reload — 당겨서 새로고침 등 외부에서 강제 재조회할 때 쓴다. load() 자체가 loadingRef로
  // 중복 실행을 막으므로 그대로 노출해도 안전하다.
  return { plants, isPlantsLoading, reloadPlants: load };
}
