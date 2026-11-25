import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { isAppVersionAtLeast } from '../utils/osFunction';
import { initAnalytics, trackPageView, setAnalyticsUserId } from '../utils/analytics';

// SPA 라우트 변경마다 page_view 를 보내고, 로그인 사용자 id 를 GA 에 연결/해제한다.
export default function AnalyticsTracker() {
  const location = useLocation();
  const { isLogin, userProfile } = useUser();
  const userId = isLogin ? userProfile?.id : null;

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
    trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search]);

  return null;
}
