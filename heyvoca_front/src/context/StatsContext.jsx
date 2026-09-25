// src/context/StatsContext.jsx
//
// 홈/마이페이지가 공유하는 학습 통계(오늘 요약·복습 일정·오늘의 기억 변화) 캐시.
//
// 라우터(AppLayout) 바깥에 위치해 탭 전환으로 페이지가 remount돼도 유지된다.
// 기존에는 홈 Main과 마이페이지 ReviewScheduleContent가 각자 mount될 때마다 API를 다시 호출하고
// "불러오는 중..." 스피너를 매번 띄워, 탭을 오갈 때마다 통계 전체를 새로 그리는 것처럼 보였다.
// 여기서 한 번만 조회해 캐시하고, "실제로 바뀌는 시점"(학습 세션 완료 = lastSessionResult.completedAt 변경)
// 에만 조용히(스피너 없이) 재조회한다. 캐시된 데이터는 그대로 유지되므로 변경분만 다시 그려진다.
//
// 【학습 세션 완료 한 경로만으로는 부족했다】(2026-09 prod: 학습해도 "아직 46개가 기다리고
// 있어요"가 줄지 않음) lastSessionResult 는 결과 화면(StudyResult)이 저장 API 성공 → 농장
// 요약 조회 → 슬라이드 구성을 다 마친 **끝에서만** 바뀐다. 학습 도중 종료, 저장 API 실패,
// 구성 중 예외, 네이티브 채팅 학습(웹뷰 밖에서 /study/log 호출)은 전부 이 신호를 못 내
// 서버 FSRS 는 바뀌었는데 홈 캐시는 그대로 굳었다. 그래서 두 가지를 더 본다.
//   1) /study/log 응답마다 오는 STUDY_DATA_CHANGED_EVENT → "낡음" 표시. 학습 화면
//      (/take-test*) 밖으로 나오는 순간 재조회(학습 중에는 매 문항 재조회하지 않는다).
//   2) 홈 탭 재진입 · 앱 복귀(visibilitychange) — 마지막 조회가 STALE_MS 보다 오래됐으면
//      재조회. 웹이 신호를 받을 수 없는 네이티브 채팅 학습과 날짜 변경을 받쳐 준다.

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useUser, LEARNING_LANG_CHANGED_EVENT } from './UserContext';
import { useVocabulary } from './VocabularyContext';
import { getTodaySummary, getReviewScheduleApi, getTodayMemoryChangesApi } from '../api/study';
import { getFarmOverviewApi, getFarmHomeFeedApi } from '../api/farm';
import { STUDY_DATA_CHANGED_EVENT } from '../utils/studyDataEvents';

// 홈 탭 재진입 · 앱 복귀 때 이보다 오래된 캐시면 다시 받는다
const STALE_MS = 30 * 1000;
// 학습 화면 밖에서 /study/log 응답이 몰려 올 때(예: 도중 종료 직후 늦게 도착) 한 번으로 묶는다
const DIRTY_DEBOUNCE_MS = 600;

const isStudyRoute = (pathname) => (pathname || '').startsWith('/take-test');

const StatsContext = createContext(null);

export const StatsProvider = ({ children }) => {
  const { isLogin, isLoginChecked } = useUser();
  const { lastSessionResult, fetchVocabularySheets } = useVocabulary();
  const { pathname } = useLocation();

  const [todaySummary, setTodaySummary] = useState(null);     // { new_words, reviews_done }
  const [reviewSchedule, setReviewSchedule] = useState(null); // { distribution, due, total, today, days }
  const [todayChanges, setTodayChanges] = useState(null);     // { counts, ... }
  const [farmOverview, setFarmOverview] = useState(null);     // { counts, health, today, items, streak, ... }
  const [farmFeed, setFarmFeed] = useState(null);             // { care, rotten, seeds, recent } — 홈 아래 목록
  const [reviewLoaded, setReviewLoaded] = useState(false);    // 최초 로드 완료 여부(스피너 제어용)

  // 마지막 조회 시작 시각 · 그 뒤 서버 학습 기록이 바뀌었는지(아래 주석 1)
  const lastFetchedAtRef = useRef(0);
  const dirtyRef = useRef(false);

  const inFlightRef = useRef(false);
  // 조회 중에 들어온 갱신 요청 — 끝나면 한 번 더 돈다(아래 주석)
  const queuedRef = useRef(false);

  // 네 통계를 한 번에 조회. 성공 항목만 갱신(기존 캐시 보존).
  // 농장 요약은 .catch 로 개별 격리한다 — 농장 API 가 실패해도 기존 세 통계의 동작이 바뀌면 안 된다.
  const refreshStats = useCallback(async () => {
    /*
      이미 조회 중이면 **버리지 않고 뒤에 한 번 더** 돈다.
      예전에는 그냥 return 이었는데, 그러면 "조회가 떠 있는 사이에 서버 데이터가 바뀐" 경우
      갱신 요청이 통째로 사라지고 캐시가 옛날 값으로 굳는다. 실제로 온보딩 가입이 그 경우다 —
      로그인되는 순간 첫 조회가 뜨고, 그 뒤 온보딩 이전(migrate)이 밭을 채운다.
    */
    if (inFlightRef.current) { queuedRef.current = true; return; }
    inFlightRef.current = true;
    // 조회 **시작** 시점에 지운다 — 조회 도중 들어온 신호는 다시 낡음으로 남아야 한다
    dirtyRef.current = false;
    lastFetchedAtRef.current = Date.now();
    try {
      const [summary, schedule, changes, farm, feed] = await Promise.all([
        getTodaySummary(),
        getReviewScheduleApi(),
        getTodayMemoryChangesApi(),
        getFarmOverviewApi().catch(() => null),
        // limit 20(서버 상한) — 카드는 여전히 3행만 보여주지만(WordFeedCard VISIBLE_ROWS),
        // "+n개 더" 전체 목록 시트(recent·care)가 별도 API 없이 이 캐시를 그대로 보여준다.
        getFarmHomeFeedApi({ limit: 20 }).catch(() => null),
      ]);
      if (summary?.code === 200) setTodaySummary(summary.data);
      if (schedule?.code === 200) setReviewSchedule(schedule.data);
      if (changes?.code === 200) setTodayChanges(changes.data);
      if (farm?.code === 200) setFarmOverview(farm.data);
      if (feed?.code === 200) setFarmFeed(feed.data);
    } catch (e) {
      console.error('refreshStats 오류:', e);
    } finally {
      setReviewLoaded(true);
      inFlightRef.current = false;
    }
    if (queuedRef.current) {
      queuedRef.current = false;
      await refreshStatsRef.current();
    }
  }, []);

  // 자기 자신을 다시 부르기 위한 참조 — useCallback 안에서 이름으로 부르면
  // 정의 시점에는 아직 값이 없다(TDZ).
  const refreshStatsRef = useRef(refreshStats);
  refreshStatsRef.current = refreshStats;

  // 로그인 시 최초 1회 + 학습 세션 완료(lastSessionResult.completedAt 변경) 시 조용히 갱신.
  // 로그아웃 시 캐시 초기화.
  useEffect(() => {
    if (isLogin && isLoginChecked) {
      refreshStats();
    } else if (!isLogin && isLoginChecked) {
      setTodaySummary(null);
      setReviewSchedule(null);
      setTodayChanges(null);
      setFarmOverview(null);
      setFarmFeed(null);
      setReviewLoaded(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLogin, isLoginChecked, lastSessionResult?.completedAt]);

  // ── 낡음 신호(주석 1) ─────────────────────────────────────────
  // 결과 화면 경로를 못 탄 학습은 단어장 목록(userDictionary)도 옛 FSRS 로 남으므로 같이 받는다.
  // 정상 완료 경로에서는 결과 화면이 이미 둘 다 다시 받고 dirty 를 지우므로 중복되지 않는다.
  const refreshDirty = useCallback(() => {
    if (!dirtyRef.current) return;
    refreshStatsRef.current();
    if (typeof fetchVocabularySheets === 'function') {
      Promise.resolve(fetchVocabularySheets()).catch(() => { /* 실패해도 다음 진입에 다시 */ });
    }
  }, [fetchVocabularySheets]);
  const refreshDirtyRef = useRef(refreshDirty);
  refreshDirtyRef.current = refreshDirty;

  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    if (!isLogin) return undefined;
    let timer = null;
    const onStudyDataChanged = () => {
      dirtyRef.current = true;
      if (isStudyRoute(pathnameRef.current)) return; // 학습 중 — 화면을 벗어날 때 한 번
      clearTimeout(timer);
      timer = setTimeout(() => refreshDirtyRef.current(), DIRTY_DEBOUNCE_MS);
    };
    window.addEventListener(STUDY_DATA_CHANGED_EVENT, onStudyDataChanged);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(STUDY_DATA_CHANGED_EVENT, onStudyDataChanged);
    };
  }, [isLogin]);

  // 경로 전환 — 학습 화면을 벗어났고 낡았으면 즉시, 홈 탭 재진입이면 오래된 캐시만(주석 2).
  // 홈은 keep-alive 탭(TabShell)이라 마운트가 아니라 경로로 감지한다(StreakCard 와 같은 방식).
  const prevPathRef = useRef(pathname);
  useEffect(() => {
    const prev = prevPathRef.current;
    prevPathRef.current = pathname;
    if (!isLogin || !isLoginChecked || prev === pathname) return;
    if (isStudyRoute(pathname)) return;
    if (dirtyRef.current) {
      refreshDirtyRef.current();
      return;
    }
    if (pathname === '/home' && Date.now() - lastFetchedAtRef.current > STALE_MS) {
      refreshStatsRef.current();
    }
  }, [pathname, isLogin, isLoginChecked]);

  // 앱 복귀 — 백그라운드·네이티브 화면(채팅 학습 등)에서 돌아온 경우(주석 2)
  useEffect(() => {
    if (!isLogin) return undefined;
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (isStudyRoute(pathnameRef.current)) return;
      if (dirtyRef.current) {
        refreshDirtyRef.current();
      } else if (Date.now() - lastFetchedAtRef.current > STALE_MS) {
        refreshStatsRef.current();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [isLogin]);

  // 학습 언어 전환 등으로 통계·홈 피드·농장 요약을 전부 다시 받아야 할 때.
  // 이전 언어 수치가 남아 보이지 않도록 캐시를 먼저 비우고(스피너 상태) 새로 조회한다.
  const refetchAll = useCallback(async () => {
    setTodaySummary(null);
    setReviewSchedule(null);
    setTodayChanges(null);
    setFarmOverview(null);
    setFarmFeed(null);
    setReviewLoaded(false);
    await refreshStatsRef.current();
  }, []);

  // UserContext.setLearningLang 성공 → 전역 재조회 이벤트
  useEffect(() => {
    const onLangChanged = () => {
      if (!isLogin) return;
      refetchAll();
    };
    window.addEventListener(LEARNING_LANG_CHANGED_EVENT, onLangChanged);
    return () => window.removeEventListener(LEARNING_LANG_CHANGED_EVENT, onLangChanged);
  }, [isLogin, refetchAll]);

  const value = {
    todaySummary,
    reviewSchedule,
    todayChanges,
    farmOverview,
    farmFeed,
    reviewLoaded,
    refreshStats,
    refetchAll,
  };

  return <StatsContext.Provider value={value}>{children}</StatsContext.Provider>;
};

export const useStats = () => {
  const ctx = useContext(StatsContext);
  if (!ctx) throw new Error('useStats must be used within StatsProvider');
  return ctx;
};
