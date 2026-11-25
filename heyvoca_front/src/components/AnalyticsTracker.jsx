import { useContext, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { NewBottomSheetContext } from '../context/NewBottomSheetContext';
import { NewFullSheetContext } from '../context/NewFullSheetContext';
import { OverlayStateContext } from '../context/OverlayContext';
import { isAppVersionAtLeast } from '../utils/osFunction';
import { getSheetName } from '../utils/sheetNames';
import { initAnalytics, trackPageView, trackEvent, setAnalyticsUserId } from '../utils/analytics';

// SPA 라우트 변경마다 page_view, 시트/모달 열림·닫힘 가상 page_view, 로그인 사용자 id 연결/해제.
export default function AnalyticsTracker() {
  const location = useLocation();
  const { isLogin, userProfile } = useUser();
  const userId = isLogin ? userProfile?.id : null;
  const route = location.pathname + location.search;
  const routeRef = useRef(route);
  routeRef.current = route;
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  useEffect(() => { initAnalytics(); }, []);

  const sentNativeRef = useRef(undefined);
  useEffect(() => {
    const id = userId ? String(userId) : null;
    setAnalyticsUserId(id);
    // 앱 1.1.9+ 네이티브 GA 에도 user_id 전달(같은 값 중복 전송 방지). 로그아웃·탈퇴 시 null.
    if (sentNativeRef.current === id) return;
    if (window.ReactNativeWebView && isAppVersionAtLeast('1.1.9')) {
      sentNativeRef.current = id;
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'setAnalyticsUserId', userId: id }));
    }
  }, [userId]);

  useEffect(() => {
    trackPageView(route);
  }, [route]);

  // ── 시트/모달: 공통 매니저 상태(스택)를 관찰해 열림/닫힘을 감지한다 ──
  const bottom = useContext(NewBottomSheetContext);
  const full = useContext(NewFullSheetContext);
  const overlay = useContext(OverlayStateContext);
  const openRef = useRef(new Map()); // id -> { name, type, route, openedAt }

  const items = [
    ...(bottom?.stack || []).map((it) => ({ it, type: 'bottom' })),
    ...(full?.stack || []).map((it) => ({ it, type: 'full' })),
    ...(overlay?.current ? [{ it: overlay.current, type: 'overlay' }] : []),
  ];
  const signature = items.map(({ it }) => it.id).join(',');

  useEffect(() => {
    const open = openRef.current;
    const now = Date.now();
    const present = new Set(items.map(({ it }) => it.id));
    let changed = false;

    open.forEach((v, id) => {
      if (present.has(id)) return;
      trackEvent('sheet_close', { sheet_name: v.name, sheet_type: v.type, duration_ms: now - v.openedAt });
      open.delete(id);
      changed = true;
    });
    items.forEach(({ it, type }) => {
      if (open.has(it.id)) return;
      open.set(it.id, { name: getSheetName(it.component, it.options), type, route: pathRef.current, openedAt: now });
      changed = true;
    });
    if (!changed) return;

    // 마지막 화면이 정확히 남도록: 남은 시트 중 가장 늦게 열린 것, 없으면 라우트
    let top = null;
    open.forEach((v) => { if (!top || v.openedAt >= top.openedAt) top = v; });
    if (top) {
      trackPageView(`${top.route}/sheet/${top.name}`, {
        title: `[sheet] ${top.name}`,
        params: { sheet_name: top.name, sheet_type: top.type },
      });
    } else {
      trackPageView(routeRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return null;
}
