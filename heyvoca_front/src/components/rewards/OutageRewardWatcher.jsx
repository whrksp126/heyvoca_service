// 2026-11-26 장애 사과 보상 — 홈 진입 시 서버에 1회 요청, 지급되면 보호권 획득 시트를 띄운다. 오늘만 쓴다.
import { useEffect, useRef } from 'react';
import { useUser } from '../../context/UserContext';
import { useStats } from '../../context/StatsContext';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { backendUrl, fetchDataAsync } from '../../utils/common';
import { getKstToday } from '../../utils/kstDate';
import { isHomeScreenBusy, useHomeScreenClear, START_SETTLE_MS, START_RETRY_MS } from '../home/homeCelebrationGate';
import { OutageRewardSheet } from './OutageRewardSheet';

const EVENT_DATE = '2026-11-26';
const DONE_KEY = 'outage_reward_20261126_done';

let calledThisSession = false; // 앱 세션당 1회

const isDone = () => {
  try { return localStorage.getItem(DONE_KEY) === '1'; } catch (e) { return false; }
};
const markDone = () => {
  try { localStorage.setItem(DONE_KEY, '1'); } catch (e) { /* 접근 실패 무시 */ }
};

const OutageRewardWatcher = () => {
  const { isLogin, isLoginChecked } = useUser();
  const { refreshStats } = useStats();
  const { openNewBottomSheet } = useNewBottomSheetActions();
  const screenClear = useHomeScreenClear();
  const grantedRef = useRef(false); // 지급 응답을 받았고 시트를 아직 못 연 상태
  const openedRef = useRef(false);
  const refreshRef = useRef(refreshStats);
  refreshRef.current = refreshStats;

  // 1) 홈에 들어왔을 때 한 번 호출
  useEffect(() => {
    if (!isLogin || !isLoginChecked || !screenClear) return;
    if (calledThisSession || isDone()) return;
    if (getKstToday() !== EVENT_DATE) return;
    calledThisSession = true;
    (async () => {
      try {
        const res = await fetchDataAsync(`${backendUrl}/farm/event/outage-reward`, 'POST', {});
        let body = res;
        if (typeof Response !== 'undefined' && res instanceof Response) body = await res.json().catch(() => null);
        const data = body?.data;
        if (!data) return;
        if (data.granted === true) {
          markDone();
          grantedRef.current = true;
          refreshRef.current?.();
          tryOpen();
        } else if (data.reason === 'already' || data.reason === 'closed') {
          markDone();
        }
      } catch (e) { /* 다음 세션에 다시 시도 */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLogin, isLoginChecked, screenClear]);

  // 2) 지급됐다면 다른 시트·연출이 없는 홈에서 연다
  const openRef = useRef(openNewBottomSheet);
  openRef.current = openNewBottomSheet;
  const timerRef = useRef(0);
  function tryOpen() {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(function attempt() {
      if (!grantedRef.current || openedRef.current) return;
      if (isHomeScreenBusy() || !window.location.pathname.startsWith('/home')) {
        timerRef.current = setTimeout(attempt, START_RETRY_MS);
        return;
      }
      openedRef.current = true;
      grantedRef.current = false;
      openRef.current(
        OutageRewardSheet,
        { onConfirm: () => refreshRef.current?.() },
        { isBackdropClickClosable: true, isDragToCloseEnabled: true },
      );
    }, START_SETTLE_MS);
  }
  useEffect(() => () => clearTimeout(timerRef.current), []);

  return null;
};

export default OutageRewardWatcher;
