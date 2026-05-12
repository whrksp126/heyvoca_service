import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getUserDatesMonthlyApi, getUserFirstCheckinApi } from '../api/study';
import { useUser } from './UserContext';

const AttendanceCalendarContext = createContext(null);

// 모듈 스코프 ref — UserContext처럼 다른 컨텍스트에서 무효화 트리거할 때 사용
let invalidateCurrentRef = () => {};
let prefetchMonthRef = () => {};

export const invalidateCurrentAttendance = () => invalidateCurrentRef();
export const prefetchAttendanceMonth = (y, m) => prefetchMonthRef(y, m);

export const AttendanceCalendarProvider = ({ children }) => {
  const { isLogin, isLoginChecked } = useUser();
  const [daysMap, setDaysMap] = useState({});
  const [firstCheckin, setFirstCheckin] = useState(null);
  const [firstCheckinLoaded, setFirstCheckinLoaded] = useState(false);

  // 한 달치 강제 fetch (캐시 무시)
  const fetchMonth = useCallback(async (y, m) => {
    try {
      const res = await getUserDatesMonthlyApi(y, m);
      if (res?.code === 200) {
        setDaysMap((prev) => ({ ...prev, [`${y}-${m}`]: res.data }));
      }
    } catch {
      // ignore
    }
  }, []);

  // 캐시 미스일 때만 fetch
  const prefetchMonth = useCallback(
    (y, m) => {
      const key = `${y}-${m}`;
      if (daysMap[key]) return;
      fetchMonth(y, m);
    },
    [daysMap, fetchMonth]
  );

  const invalidateCurrent = useCallback(() => {
    const today = new Date();
    fetchMonth(today.getFullYear(), today.getMonth() + 1);
  }, [fetchMonth]);

  const fetchFirstCheckin = useCallback(async () => {
    try {
      const res = await getUserFirstCheckinApi();
      if (res?.code === 200 && res.data?.first_date) {
        const [y, m] = res.data.first_date.split('-').map(Number);
        setFirstCheckin({ year: y, month: m });
      } else {
        setFirstCheckin(null);
      }
    } catch {
      setFirstCheckin(null);
    } finally {
      setFirstCheckinLoaded(true);
    }
  }, []);

  // 로그인 직후 이번 달 + firstCheckin 한 번 prefetch
  useEffect(() => {
    if (!isLogin || !isLoginChecked) return;
    const today = new Date();
    fetchMonth(today.getFullYear(), today.getMonth() + 1);
    fetchFirstCheckin();
  }, [isLogin, isLoginChecked, fetchMonth, fetchFirstCheckin]);

  // 로그아웃 시 캐시 비움
  useEffect(() => {
    if (!isLogin) {
      setDaysMap({});
      setFirstCheckin(null);
      setFirstCheckinLoaded(false);
    }
  }, [isLogin]);

  // 모듈 스코프 ref 등록
  useEffect(() => {
    invalidateCurrentRef = invalidateCurrent;
    prefetchMonthRef = prefetchMonth;
    return () => {
      invalidateCurrentRef = () => {};
      prefetchMonthRef = () => {};
    };
  }, [invalidateCurrent, prefetchMonth]);

  return (
    <AttendanceCalendarContext.Provider
      value={{
        daysMap,
        firstCheckin,
        firstCheckinLoaded,
        prefetchMonth,
        fetchMonth,
        invalidateCurrent,
      }}
    >
      {children}
    </AttendanceCalendarContext.Provider>
  );
};

export const useAttendanceCalendar = () => {
  const ctx = useContext(AttendanceCalendarContext);
  if (!ctx) {
    throw new Error('useAttendanceCalendar must be used within AttendanceCalendarProvider');
  }
  return ctx;
};
