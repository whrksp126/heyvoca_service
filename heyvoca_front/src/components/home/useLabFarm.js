// 실험실 farm_home — 밭 배치(x,y 격자)·작물 종류 서버 상태. 켜진 경우에만 불러온다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { getFarmStateApi, saveFarmLayoutApi, setBookCropApi, unwrap } from '../../api/farmLab';

const swapRot = (w, h, rot) => (rot === 90 || rot === 270 ? [h, w] : [w, h]);

const useLabFarm = (enabled) => {
  const [state, setState] = useState({
    ready: false, layout: [], version: 0, crops: {}, items: {}, obstacles: [], gridW: 40, gridH: 40,
  });
  const ref = useRef(state);
  ref.current = state;

  const load = useCallback(async () => {
    const d = unwrap(await getFarmStateApi());
    if (!d || !Array.isArray(d.layout)) return false;
    const crops = {};
    const dims = {};
    (d.books || []).forEach((b) => {
      crops[String(b.id)] = b.crop_type || 'carrot';
      dims[String(b.id)] = [b.fw || 4, b.fh || 4];
    });
    const items = {};
    const obstacles = [];
    const catalog = {};
    (d.catalog || []).forEach((c) => { catalog[c.id] = c; });
    d.layout.forEach((e) => {
      const rot = e.rot ?? (e.flip ? 90 : 0);
      if (e.item_id === 'field') {
        const id = String(e.book_id);
        if (!dims[id]) return;
        const [w, h] = swapRot(dims[id][0], dims[id][1], rot);
        items[id] = { x: e.x, y: e.y, w, h };
      } else if (catalog[e.item_id]) {
        const [w, h] = swapRot(catalog[e.item_id].w || 1, catalog[e.item_id].h || 1, rot);
        obstacles.push({ x: e.x, y: e.y, w, h });
      }
    });
    setState({
      ready: true, layout: d.layout, version: d.version || 0, crops, items, obstacles,
      gridW: d.grid?.w || 40, gridH: d.grid?.h || 40,
    });
    return true;
  }, []);

  useEffect(() => { if (enabled) load(); }, [enabled, load]);

  /** posMap: Map<bookId, {x,y}> — 성공 true. 실패(400/409)는 최신 상태를 다시 불러온다 */
  const savePositions = useCallback(async (posMap) => {
    const { layout, version } = ref.current;
    const next = layout.map((e) => {
      const p = e.item_id === 'field' ? posMap.get(String(e.book_id)) : null;
      return p ? { ...e, x: p.x, y: p.y } : e;
    });
    const d = unwrap(await saveFarmLayoutApi({ layout: next, version }));
    const ok = !!(d && Array.isArray(d.layout));
    await load();
    return ok;
  }, [load]);

  const setCrop = useCallback(async (bookId, cropType) => {
    setState((s) => ({ ...s, crops: { ...s.crops, [String(bookId)]: cropType } }));
    const res = await setBookCropApi(bookId, cropType);
    if (res && res.code && res.code >= 400) await load();
  }, [load]);

  return { ...state, savePositions, setCrop, reload: load };
};

export default useLabFarm;
