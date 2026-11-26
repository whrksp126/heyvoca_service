// 실험실 farm_home — 밭 위치(slot)·작물 종류 서버 상태. 켜진 경우에만 불러온다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { getFarmStateApi, saveFarmLayoutApi, setBookCropApi, unwrap } from '../../api/farmLab';

const useLabFarm = (enabled) => {
  const [state, setState] = useState({ layout: [], version: 0, crops: {}, slots: {} });
  const ref = useRef(state);
  ref.current = state;

  const load = useCallback(async () => {
    const d = unwrap(await getFarmStateApi());
    if (!d || !Array.isArray(d.layout)) return false;
    const crops = {};
    (d.books || []).forEach((b) => { crops[String(b.id)] = b.crop_type || 'carrot'; });
    const slots = {};
    d.layout.forEach((e) => {
      if (e.item_id === 'field' && Number.isInteger(e.slot)) slots[String(e.book_id)] = e.slot;
    });
    setState({ layout: d.layout, version: d.version || 0, crops, slots });
    return true;
  }, []);

  useEffect(() => { if (enabled) load(); }, [enabled, load]);

  /** slotMap: Map<bookId, slot> — 성공 true */
  const saveSlots = useCallback(async (slotMap) => {
    const { layout, version } = ref.current;
    const next = layout.map((e) => (
      e.item_id === 'field' && slotMap.has(String(e.book_id)) ? { ...e, slot: slotMap.get(String(e.book_id)) } : e
    ));
    const d = unwrap(await saveFarmLayoutApi({ layout: next, version }));
    const ok = !!(d && Array.isArray(d.layout));
    await load(); // 성공이면 새 version, 409 등이면 최신 상태로 다시 불러온다
    return ok;
  }, [load]);

  const setCrop = useCallback(async (bookId, cropType) => {
    setState((s) => ({ ...s, crops: { ...s.crops, [String(bookId)]: cropType } }));
    const res = await setBookCropApi(bookId, cropType);
    if (res && res.code && res.code >= 400) await load();
  }, [load]);

  return { ...state, saveSlots, setCrop, reload: load };
};

export default useLabFarm;
