import { useState, useEffect, useRef } from 'react';
import { getFarmPlantsApi } from '../../api/farm';

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
 */
const PAGE_SIZE = 100;   // 서버 상한
const MAX_PAGES = 60;    // 6,000개까지. 그 이상은 화면이 감당할 목록이 아니다

export default function useFarmPlants(enabled = true) {
  const [plants, setPlants] = useState({});
  const [isPlantsLoading, setIsPlantsLoading] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!enabled || startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;
    (async () => {
      setIsPlantsLoading(true);
      const map = {};
      let cursor;
      try {
        for (let page = 0; page < MAX_PAGES; page += 1) {
          // fetchDataAsync 는 비-2xx 도 throw 하지 않는다 → code 를 직접 본다
          const res = await getFarmPlantsApi({ limit: PAGE_SIZE, cursor });
          if (res?.code !== 200) break;
          (res.data?.items || []).forEach((item) => {
            map[String(item.user_voca_id)] = item;
          });
          cursor = res.data?.next_cursor;
          if (!cursor) break;
        }
      } catch (err) {
        console.error('농장 작물 목록 조회 오류:', err);
      }
      if (!cancelled) {
        setPlants(map);
        setIsPlantsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [enabled]);

  return { plants, isPlantsLoading };
}
