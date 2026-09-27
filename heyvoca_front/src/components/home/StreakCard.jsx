// src/components/home/StreakCard.jsx
//
// 홈 — 연속 학습 카드 (2026-09-27 확정 목업, scratchpad/home10/IMPL_SPEC.md "1주 불꽃 달력").
//
// 1층 헤더 — 불꽃 24px + "N일 연속"(15px/800) + 우측 "최장 N일"(12px/600) + CaretRight
//           (기존 §6 헤더와 동일 — 그대로 둔다)
// 2층 7칸 grid(최근 6일 + 오늘) — 그날 daily_mission_complete/streak_qualified/streak_protected로
//           채색한다("오늘 할 일 모두" 진한 색 · "일부" 옅은 색 · 보호권 회색+아이콘 · 오늘 미달성은
//           점선 빈칸). 개수·말풍선은 두지 않는다 — 그날 "오늘 할 일을 다 했는가"만 본다.
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
import { CaretRight } from '@phosphor-icons/react';
import { getStreakApi, startEarnBackApi } from '../../api/farm';
import { CROP_ASSETS } from '../farm/CropImage';
import { useStats } from '../../context/StatsContext';
import { useVocabulary } from '../../context/VocabularyContext';
import { vibrate } from '../../utils/osFunction';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useNewBottomSheetContext, useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import FarmVisitCalendarSheet from './FarmVisitCalendarSheet';
import StreakSettlementNewBottomSheet from '../newBottomSheet/StreakSettlementNewBottomSheet';
import WeekStreakStrip, { buildWeekCells } from '../farm/WeekStreakStrip';

const MIN_RELOAD_INTERVAL_MS = 5000;

/** 멈춤 기한까지 남은 시간(시간 단위, 올림) — "41시간 안에 채우면 이어져요" */
const hoursUntil = (iso) => {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 3600000));
};

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

  const required = Math.max(1, streak?.required ?? 5);
  const todayCorrect = streak?.today_correct ?? 0;

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
  const { todayTasks } = useStats();
  const weekCells = useMemo(() => buildWeekCells(todayTasks?.week), [todayTasks]);

  // §6 "최장 기록 … 누르면 기록 화면" — 농장 방문 달력은 하단 탭을 덮는 풀시트다
  // (home-calendar §3 "풀시트라 하단 탭이 없다"). 진입로는 홈의 이 버튼 하나뿐이다.
  const handleBest = () => {
    vibrate({ duration: 5 });
    pushNewFullSheet(FarmVisitCalendarSheet, {}, {
      smFull: true,
      closeOnBackdropClick: true,
    });
  };

  // 다시 잇기 도전(§3 "막대 7칸 자리 대신 도전 진행") — active/offered 모두 막대를 밀어낸다
  const earnBack = streak?.earn_back ?? null;
  const showEarnBack = earnBack?.status === 'active' || earnBack?.status === 'offered';
  const earnBackDots = useMemo(() => {
    if (!earnBack) return [];
    const total = earnBack.days_required ?? 3;
    const doneCnt = earnBack.days_done ?? 0;
    const labels = ['오늘', '내일', '모레'];
    return Array.from({ length: total }).map((_, i) => {
      let fillPct = 0;
      if (i < doneCnt) fillPct = 100;
      else if (i === doneCnt && earnBack.status === 'active' && !earnBack.today_done) {
        fillPct = Math.min(100, Math.round((todayCorrect / required) * 100));
      }
      return { key: i, label: labels[i] || `${i + 1}일째`, fillPct, isNow: i === doneCnt && earnBack.status === 'active' };
    });
  }, [earnBack, todayCorrect, required]);

  const dayOrdinal = earnBack ? (earnBack.today_done ? (earnBack.days_done ?? 0) : (earnBack.days_done ?? 0) + 1) : 0;
  const daysLeft = earnBack ? Math.max(0, (earnBack.days_required ?? 3) - dayOrdinal) : 0;

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

  const current = streak.current ?? 0;
  const best = streak.best ?? 0;
  const paused = !!streak.paused;
  const pause = streak.pause ?? null;

  return (
    <div className="
      rounded-[12px] p-[18px]
      bg-layout-white dark:bg-layout-gray-dark
      border border-farm-line dark:border-transparent
    ">
      {/* 1층 — 불꽃 · 연속 일수 · 최장 기록 */}
      <div className="flex items-center gap-[10px]">
        <img
          src={CROP_ASSETS.streak}
          alt=""
          draggable={false}
          className="w-[26px] h-[26px] object-contain select-none flex-shrink-0"
        />
        <span className="flex items-center gap-[6px] flex-1 min-w-0 text-layout-black dark:text-layout-white text-[15px] font-[700] tracking-[-0.03em]">
          {current}일 연속
          {/* 멈춤(paused) — 계약 §3 "M일 연속 옆 멈춤 태그" */}
          {paused && (
            <span className="shrink-0 px-[8px] py-[3px] rounded-full text-[10.5px] font-[800] bg-primary-main-100 dark:bg-primary-main-dark text-primary-main-600 dark:text-primary-main-400">
              멈춤
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={handleBest}
          className="flex items-center gap-[2px] text-[12px] font-[600] text-[#9A9A9A]"
        >
          최장 {best}일
          <CaretRight size={10} weight="fill" className="text-[#BBBBBB]" />
        </button>
      </div>

      {/* 멈춤 알림 행 — 계약 §3 "보호권 이미지 · 보호권 K개가 모자라요 · N시간 안에 채우면
          이어져요 · [지키기] → paused 시트 재오픈" */}
      {paused && pause && (
        <div className="flex items-center gap-[10px] mt-[12px] px-[11px] py-[10px] rounded-[10px] bg-layout-gray-50 dark:bg-layout-black">
          <img src={CROP_ASSETS.shield} alt="" draggable={false} className="w-[28px] h-[28px] object-contain select-none shrink-0" />
          <span className="flex-1 min-w-0 text-[12px] leading-[1.45] text-layout-gray-400 dark:text-layout-gray-300">
            <span className="block text-[12.5px] font-[800] text-layout-black dark:text-layout-white">
              보호권 {pause.short}개가 모자라요
            </span>
            {hoursUntil(pause.deadline)}시간 안에 채우면 이어져요
          </span>
          <button
            type="button"
            onClick={openPausedSheet}
            className="shrink-0 h-[30px] px-[11px] rounded-[8px] bg-primary-main-600 text-layout-white text-[12px] font-[800]"
          >
            지키기
          </button>
        </div>
      )}

      {/* 다시 잇기 도전 — 막대 7칸 자리를 대신한다(계약 §3) */}
      {showEarnBack ? (
        <div className="mt-[12px] p-[12px] rounded-[10px] bg-layout-gray-50 dark:bg-layout-black">
          {earnBack.status === 'active' ? (
            <>
              <div className="flex items-center gap-[6px] text-[12.5px] font-[800] text-layout-black dark:text-layout-white">
                다시 잇기 {dayOrdinal}일째
                <span className="px-[7px] py-[2px] rounded-full text-[10.5px] font-[800] bg-primary-main-100 dark:bg-primary-main-dark text-primary-main-600 dark:text-primary-main-400">
                  오늘 {todayCorrect}/{required}
                </span>
              </div>
              <div className="mt-[4px] text-[11px] leading-[1.5] text-layout-gray-400 dark:text-layout-gray-300">
                {daysLeft > 0
                  ? `${daysLeft}일 더 하면 연속 ${earnBack.from_streak}일에 이어서 ${earnBack.result_streak}일이 돼요`
                  : `오늘 완료하면 연속 ${earnBack.result_streak}일이 돼요`}
              </div>
              <div className="flex gap-[8px] mt-[10px]">
                {earnBackDots.map((dot) => (
                  <div key={dot.key} className="flex-1 flex flex-col items-center gap-[5px]">
                    <span className="block w-full h-[8px] rounded-full bg-[#F3DEEC] dark:bg-[rgba(255,255,255,.14)] overflow-hidden">
                      <span
                        style={{ width: `${dot.fillPct}%` }}
                        className="block h-full rounded-full bg-primary-main-600"
                      />
                    </span>
                    <span className="text-[10px] font-[700] text-[#B8709F] dark:text-primary-main-400">{dot.label}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="text-[12.5px] font-[800] text-layout-black dark:text-layout-white">다시 잇기 도전</div>
              <div className="mt-[4px] text-[11px] leading-[1.5] text-layout-gray-400 dark:text-layout-gray-300">
                끊긴 연속 {earnBack.from_streak}일, {earnBack.days_required}일 동안 이어가면 다시 연결돼요
              </div>
              <button
                type="button"
                onClick={handleStartEarnBack}
                disabled={startingEarnBack}
                className="mt-[10px] w-full h-[36px] rounded-[9px] bg-primary-main-600 text-layout-white text-[12.5px] font-[800] disabled:opacity-50"
              >
                도전 시작
              </button>
            </>
          )}
        </div>
      ) : weekCells.length === 7 ? (
        <WeekStreakStrip cells={weekCells} showLegend className="mt-[14px]" />
      ) : (
        // week 응답이 아직 없을 때(로딩·구버전 백엔드) — 막대 대신 빈 칸 스켈레톤만 둔다
        <div className="grid grid-cols-7 gap-[6px] mt-[14px]">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-[46px] rounded-[12px] bg-layout-gray-50 dark:bg-layout-gray-dark animate-pulse" />
          ))}
        </div>
      )}
    </div>
  );
};

export default StreakCard;
