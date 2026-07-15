// src/context/StatsContext.jsx
//
// 홈/마이페이지가 공유하는 학습 통계(오늘 요약·복습 일정·오늘의 기억 변화) 캐시.
//
// 라우터(AppLayout) 바깥에 위치해 탭 전환으로 페이지가 remount돼도 유지된다.
// 기존에는 홈 Main과 마이페이지 ReviewScheduleContent가 각자 mount될 때마다 API를 다시 호출하고
// "불러오는 중..." 스피너를 매번 띄워, 탭을 오갈 때마다 통계 전체를 새로 그리는 것처럼 보였다.
// 여기서 한 번만 조회해 캐시하고, "실제로 바뀌는 시점"(학습 세션 완료 = lastSessionResult.completedAt 변경)
// 에만 조용히(스피너 없이) 재조회한다. 캐시된 데이터는 그대로 유지되므로 변경분만 다시 그려진다.

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useUser } from './UserContext';
import { useVocabulary } from './VocabularyContext';
import { getTodaySummary, getReviewScheduleApi, getTodayMemoryChangesApi } from '../api/study';

const StatsContext = createContext(null);

export const StatsProvider = ({ children }) => {
  const { isLogin, isLoginChecked } = useUser();
  const { lastSessionResult } = useVocabulary();

  const [todaySummary, setTodaySummary] = useState(null);     // { new_words, reviews_done }
  const [reviewSchedule, setReviewSchedule] = useState(null); // { distribution, due, total, today, days }
  const [todayChanges, setTodayChanges] = useState(null);     // { counts, ... }
  const [reviewLoaded, setReviewLoaded] = useState(false);    // 최초 로드 완료 여부(스피너 제어용)

  const inFlightRef = useRef(false);

  // 세 통계를 한 번에 조회. 이미 조회 중이면 중복 방지. 성공 항목만 갱신(기존 캐시 보존).
  const refreshStats = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const [summary, schedule, changes] = await Promise.all([
        getTodaySummary(),
        getReviewScheduleApi(),
        getTodayMemoryChangesApi(),
      ]);
      if (summary?.code === 200) setTodaySummary(summary.data);
      if (schedule?.code === 200) setReviewSchedule(schedule.data);
      if (changes?.code === 200) setTodayChanges(changes.data);
    } catch (e) {
      console.error('refreshStats 오류:', e);
    } finally {
      setReviewLoaded(true);
      inFlightRef.current = false;
    }
  }, []);

  // 로그인 시 최초 1회 + 학습 세션 완료(lastSessionResult.completedAt 변경) 시 조용히 갱신.
  // 로그아웃 시 캐시 초기화.
  useEffect(() => {
    if (isLogin && isLoginChecked) {
      refreshStats();
    } else if (!isLogin && isLoginChecked) {
      setTodaySummary(null);
      setReviewSchedule(null);
      setTodayChanges(null);
      setReviewLoaded(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLogin, isLoginChecked, lastSessionResult?.completedAt]);

  const value = {
    todaySummary,
    reviewSchedule,
    todayChanges,
    reviewLoaded,
    refreshStats,
  };

  return <StatsContext.Provider value={value}>{children}</StatsContext.Provider>;
};

export const useStats = () => {
  const ctx = useContext(StatsContext);
  if (!ctx) throw new Error('useStats must be used within StatsProvider');
  return ctx;
};
