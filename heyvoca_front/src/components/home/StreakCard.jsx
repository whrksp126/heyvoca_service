// src/components/home/StreakCard.jsx
//
// 홈 — 연속 학습 카드 (2026-09-27 확정 목업, scratchpad/home10/IMPL_SPEC.md "1주 불꽃 달력").
//
// 그림은 streak/StreakCardView.jsx 가 그린다(2026-10-07 연속 학습 화면 고도화) — 이 파일은 조회 ·
// 재조회 시점 · 정산 알림만 맡는다.
// 1층 머리말 — 일렁이는 불꽃 + 굴러 올라가는 "N일 연속" + 우측 "최장 N일" 버튼(농장 방문 풀시트)
// 2층 7칸(최근 6일 + 오늘) — 그날 daily_mission_complete/streak_qualified/streak_protected로
//           그린다. 이어진 날은 같은 색 띠 한 줄로 잇고 상태는 띠 위 표식으로만 구분한다
//           ("오늘 할 일 모두" 찬 불꽃 · "일부" 작은 불씨 · 보호권 그림 · 오늘 미달성은 점선 빈칸
//           — streak/StreakMark.jsx). 개수는 두지 않는다 — 그날 "오늘 할 일을 다 했는가"만 본다.
// 이전의 "일별 학습량 막대 7칸"(맞힌 개수 높이)은 이 화면으로 대체됐다 — 오늘 할 일 카드가
// 이미 "무엇을 얼마나 했는가"를 말하고 있어 여기서는 "그날 다 끝냈는가"만 겹치지 않게 말한다.
// week 데이터는 /farm/today-tasks(StatsContext.todayTasks.week)에서 받는다 — 이 카드가 원래
// 쓰던 /farm/streak 응답에는 없는 필드라 두 응답을 같이 본다(아래 주석 참고).
//
// §6 — 홈은 "얼마나 해 왔나"만 말한다. "14일 배지까지 2일 남음" 같은 남은 거리 문구는
// 두지 않는다. 홈에서 눌러야 할 것은 CTA 하나인데 또 하나의 목표가 생기면 시선이 나뉜다.
//
// QA §F — 학습 세션 완료 말고도 두 시점에 조용히 재조회한다. 홈은 keep-alive 탭(TabShell)이라
// 다른 탭에서 학습하고 돌아와도 다시 마운트되지 않아 useLocation().pathname 이 '/home' 으로
// 바뀌는 순간(=탭 전환)을 감지해야 하고, 앱을 백그라운드에 뒀다 돌아온 경우는 마운트도
// 경로 전환도 없어 document.visibilitychange 로 따로 봐야 한다. 둘 다 연타 방지로 최소
// 5초 간격을 둔다 — 짧은 시간에 탭을 왔다갔다 하거나 화면을 껐다 켜도 요청이 겹치지 않게.
//
// 연속 학습 보호권 개편(scratchpad/streak_shield_contract.md §3) — 정산 알림(notice)은
// 이 카드가 이미 불러온 /farm/streak 응답 안에 함께 내려온다. 별도 조회를 새로 만들지 않고
// 이 컴포넌트의 streak state를 그대로 관찰해 "홈 탭에 실제로 있고 · 다른 바텀시트가 없을
// 때"만 한 번 연다 — OnboardingMissionRewardWatcher와 같은 안전 라우트 판단 방식이다.
// 이 카드는 TabShell이 항상 마운트해 두므로(§QA F 주석) isHomeTab이 그 자체로 "학습 결과
// 화면 등과 겹치지 않는 화면에 있다"는 가드를 겸한다.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getStreakApi, startEarnBackApi } from '../../api/farm';
import { useStats } from '../../context/StatsContext';
import { useVocabulary } from '../../context/VocabularyContext';
import { vibrate } from '../../utils/osFunction';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useNewBottomSheetContext, useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import FarmVisitCalendarSheet from './FarmVisitCalendarSheet';
import StreakSettlementNewBottomSheet from '../newBottomSheet/StreakSettlementNewBottomSheet';
import { buildWeekCells } from '../farm/WeekStreakStrip';
import StreakCardView from '../streak/StreakCardView';

const MIN_RELOAD_INTERVAL_MS = 5000;

/**
 * registerRefresh — 부모(홈 Main)가 당겨서 새로고침 때 이 카드의 /farm/streak도 같이
 * 갱신하고 싶을 때 쓰는 트리거 전달용 콜백. 마운트 시 한 번 `loadStreak(true)`(연타 방지
 * 간격 무시)를 실행 함수로 넘겨준다 — 이 카드 자체는 streak 상태를 밖으로 내보내지 않으므로
 * 부모가 직접 재조회할 수 없어, 실행 함수를 대신 내려받는 방식을 쓴다.
 */
const StreakCard = ({ registerRefresh } = {}) => {
  "use memo";

  const { lastSessionResult } = useVocabulary();
  const { pushNewFullSheet } = useNewFullSheetActions();
  const [streak, setStreak] = useState(null);
  const lastLoadedAtRef = useRef(0);
  const location = useLocation();
  const isHomeTab = location.pathname === '/home';
  const wasHomeTabRef = useRef(isHomeTab);

  const loadStreak = useCallback(async (force = false) => {
    // 연타 방지 — 최소 5초 간격. force(학습 세션 완료 직후·최초 로딩)는 이 간격을 건너뛴다.
    const now = Date.now();
    if (!force && now - lastLoadedAtRef.current < MIN_RELOAD_INTERVAL_MS) return;
    lastLoadedAtRef.current = now;

    const res = await getStreakApi();
    if (res?.code === 200) setStreak(res.data);
  }, []);

  // 최초 1회 + 학습 세션 완료 시 조용히 갱신(스피너 없이 기존 값 유지)
  useEffect(() => {
    loadStreak(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSessionResult?.completedAt]);

  // 홈 탭이 다시 활성될 때 재조회 — keep-alive 탭이라 마운트가 아니라 경로 전환으로 감지한다
  useEffect(() => {
    const wasActive = wasHomeTabRef.current;
    wasHomeTabRef.current = isHomeTab;
    if (!wasActive && isHomeTab) loadStreak();
  }, [isHomeTab, loadStreak]);

  // 백그라운드에 있다가 돌아왔을 때 재조회 — 탭 전환이 없어도 화면을 다시 보게 된 시점이다
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') loadStreak();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [loadStreak]);

  // 부모(홈 Main)에게 강제 재조회 함수를 내려준다 — 당겨서 새로고침용
  useEffect(() => {
    if (typeof registerRefresh === 'function') registerRefresh(() => loadStreak(true));
  }, [registerRefresh, loadStreak]);

  // ── 정산 알림(notice) — 홈 탭에 있고 다른 바텀시트가 없을 때 한 번만 연다 ─────
  // 새 API 호출 없이 이 컴포넌트가 이미 들고 있는 streak(=/farm/streak 응답)의 notice만 본다.
  const { stack } = useNewBottomSheetContext();
  const { openNewBottomSheet } = useNewBottomSheetActions();
  const shownNoticeIdRef = useRef(null);

  useEffect(() => {
    const notice = streak?.notice;
    if (!notice?.id) return;
    if (shownNoticeIdRef.current === notice.id) return; // 이번 세션에 이미 열었다
    if (!isHomeTab) return; // 학습 결과 화면 등 다른 화면에 있는 동안은 열지 않는다
    if (stack.length > 0) return; // 다른 바텀시트가 열려 있으면 방해하지 않는다(다음 재평가에 열림)

    shownNoticeIdRef.current = notice.id;
    openNewBottomSheet(
      StreakSettlementNewBottomSheet,
      { type: notice.type, payload: notice, streak, ackId: notice.id, onSettled: () => loadStreak(true) },
      { isBackdropClickClosable: true, isDragToCloseEnabled: true }
    );
  }, [streak, isHomeTab, stack.length, openNewBottomSheet, loadStreak]);

  // 멈춤 알림 행의 [지키기] — 알림(notice)이 아니라 살아있는 pause 상태를 그대로 보여준다.
  // ack 대상이 없으므로 ackId를 넘기지 않는다.
  const openPausedSheet = () => {
    vibrate({ duration: 5 });
    if (!streak?.pause) return;
    openNewBottomSheet(
      StreakSettlementNewBottomSheet,
      { type: 'paused', payload: streak.pause, streak, ackId: null, onSettled: () => loadStreak(true) },
      { isBackdropClickClosable: true, isDragToCloseEnabled: true }
    );
  };

  /**
   * 1주 불꽃 달력 — /farm/today-tasks(week)에서 받는다. 오늘 포함 최근 7일, 오래된→오늘 순.
   * status: 'all'(오늘 할 일 모두) | 'part'(일부) | 'shield'(보호권) | 'none'(빈 날) |
   *         'today_empty'(오늘, 아직 미달성). 칸 변환은 WeekStreakStrip.buildWeekCells —
   * 학습 결과 연속 학습 슬라이드(StudyResult.jsx)와 같은 함수를 쓴다.
   *
   * 이 카드는 원래 /farm/streak(streak state)만으로 그렸는데, week 판정 기준
   * (daily_mission_complete·streak_qualified·streak_protected)은 이 응답에 없어
   * StatsContext.todayTasks 를 함께 본다 — 새 API 호출을 이 컴포넌트가 새로 만들지 않고
   * 이미 홈이 받아 둔 캐시를 구독하기만 한다(다른 카드들과 같은 방식).
   */
  // todayKey(KST 날짜) — 자정이 지나면 바뀐다. 이 값이 deps 에 없으면 week 데이터가 그대로인 동안
  // "오늘" 칸·요일 라벨이 어제 기준으로 굳는다(2026-10-02). buildWeekCells 도 KST 오늘을 쓴다.
  const { todayTasks, todayKey } = useStats();
  const weekCells = useMemo(() => buildWeekCells(todayTasks?.week), [todayTasks, todayKey]);

  // 날짜가 바뀌면 연속 학습 상태(오늘 정답 수·정산 알림)도 새로 받는다 — 최초 마운트는 건너뛴다
  const prevTodayKeyRef = useRef(todayKey);
  useEffect(() => {
    if (prevTodayKeyRef.current === todayKey) return;
    prevTodayKeyRef.current = todayKey;
    loadStreak(true);
  }, [todayKey, loadStreak]);

  // §6 "최장 기록 … 누르면 기록 화면" — 농장 방문 달력은 하단 탭을 덮는 풀시트다
  // (home-calendar §3 "풀시트라 하단 탭이 없다"). 진입로는 홈의 이 버튼 하나뿐이다.
  const handleBest = () => {
    vibrate({ duration: 5 });
    pushNewFullSheet(FarmVisitCalendarSheet, {}, {
      smFull: true,
      closeOnBackdropClick: true,
    });
  };

  const [startingEarnBack, setStartingEarnBack] = useState(false);
  const handleStartEarnBack = async () => {
    vibrate({ duration: 5 });
    if (startingEarnBack) return;
    setStartingEarnBack(true);
    const res = await startEarnBackApi();
    setStartingEarnBack(false);
    if (res?.code === 200) loadStreak(true);
  };

  // 조회 전이거나 실패했으면 홈에 빈 카드를 남기지 않는다
  if (!streak) return null;

  return (
    <StreakCardView
      streak={streak}
      weekCells={weekCells}
      onOpenRecord={handleBest}
      onOpenPaused={openPausedSheet}
      onStartEarnBack={handleStartEarnBack}
      startingEarnBack={startingEarnBack}
    />
  );
};

export default StreakCard;
