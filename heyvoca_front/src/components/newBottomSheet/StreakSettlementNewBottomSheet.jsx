import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { WarningCircle } from '@phosphor-icons/react';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useUser } from '../../context/UserContext';
import {
  protectStreakApi, startEarnBackApi, ackStreakNoticeApi, purchaseFarmItemApi,
} from '../../api/farm';
import { CROP_ASSETS } from '../farm/CropImage';
import { STREAK_PROTECTED_BG_CLASS } from '../farm/StreakDayMark';
import { toLocalDateString } from '../../utils/common';
import { vibrate } from '../../utils/osFunction';
import {
  SHEET_SHELL, Grab, Btn, Btns, Hint, HintB,
} from './purchaseParts';
import StoreNewFullSheet from '../newfullsheet/StoreNewFullSheet';

/**
 * 연속 학습 보호권 — 정산 알림 시트.
 *
 * 계약 정본: scratchpad/streak_shield_contract.md §3. notice type 4종(protected/paused/
 * broken/earn_back_success)을 한 컴포넌트가 다룬다 — 넷 다 "보호권 그림 · 헤더 · 본문 ·
 * 버튼 둘" 골격이 같고(시안 공통 .sheet .center), 버튼·본문만 갈린다.
 *
 * 열리는 경로가 둘이다.
 *   1) 정산 알림(notice) — 홈 진입 시 StreakCard가 GET /farm/streak의 notice를 보고 연다.
 *      닫힐 때(사유 불문: 버튼·백드롭·드래그) 한 번 ack한다(§3 "닫힐 때 ack").
 *   2) 멈춤 상태의 수동 재오픈 — StreakCard의 "멈춤" 알림 행 [지키기]가 언제든 다시 연다.
 *      이건 알림이 아니라 살아있는 pause 상태를 보여주는 것뿐이라 ack하지 않는다(ackId 없음).
 *
 * @param {'protected'|'paused'|'broken'|'earn_back_success'} props.type
 * @param {object} props.payload   type별 필드(계약 §2 notice/pause/earn_back 객체와 동일 모양)
 * @param {object} props.streak    GET /farm/streak 전체 스냅샷(보유 보석 등 부가 정보용)
 * @param {string|null} props.ackId  notice.id — 있으면 닫힐 때 ack한다
 * @param {function} props.onSettled 닫힐 때 호출(StreakCard가 /farm/streak 재조회로 이어받음)
 */

// 보호권 1개 = 보석 10개(계약 §1)
const PREFILL_UNIT_GEM = 10;

/**
 * 날짜만 있는 'YYYY-MM-DD'(next_earn_back_on 등)를 "10월 18일"로 표시한다.
 * new Date('YYYY-MM-DD')는 UTC 자정으로 해석돼 타임존에 따라 하루가 밀릴 수 있어
 * Date 객체를 거치지 않고 문자열을 직접 쪼갠다(백엔드 코디네이터 공지 — 문자열 비교/파싱 주의).
 */
const formatIsoDate = (isoDate) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate || '');
  if (!m) return '';
  return `${Number(m[2])}월 ${Number(m[3])}일`;
};

/**
 * "미리 채워두기" 스테퍼 — protected · paused(지킨 뒤) 두 화면이 함께 쓴다(계약 §3).
 * 모듈 스코프 컴포넌트로 뺀 이유는, 부모 안에서 매 렌더마다 새로 정의하면 React가
 * 다른 컴포넌트 타입으로 보고 매번 마운트를 새로 해서(로컬 state가 있는 컴포넌트라 위험)
 * 수량을 조작하는 도중에도 리셋될 수 있기 때문이다.
 */
const PrefillStepper = ({ defaultQty, gemCnt, onSkip, onNeedGems, setUserProfile }) => {
  const [qty, setQty] = useState(() => Math.min(10, Math.max(1, defaultQty || 1)));
  const [status, setStatus] = useState('idle'); // idle | loading | short | done
  const cost = qty * PREFILL_UNIT_GEM;

  if (status === 'done') {
    return (
      <Hint center className="mt-[14px]">
        보호권을 채웠어요 · 보유 보석 <HintB>{gemCnt}</HintB>
      </Hint>
    );
  }

  const buy = async () => {
    vibrate({ duration: 5 });
    if (status === 'loading') return;
    if (gemCnt < cost) { setStatus('short'); return; }
    setStatus('loading');
    const res = await purchaseFarmItemApi({ sku: 'shield_1', qty });
    if (res?.code !== 200 || !res?.data) { setStatus('idle'); return; }
    setUserProfile((prev) => ({ ...prev, gem_cnt: res.data.gem_cnt }));
    setStatus('done');
  };

  return (
    <>
      <div className="mt-[16px] mb-[8px] text-[11.5px] font-[800] tracking-[-0.02em] text-layout-gray-400 dark:text-layout-gray-300">
        미리 채워두기
      </div>
      <div className="flex items-center gap-[11px] p-[9px] rounded-[12px] border-[1.5px] border-[#EEEEEE] dark:border-transparent bg-layout-white dark:bg-layout-gray-dark">
        <img src={CROP_ASSETS.shield} alt="" draggable={false} className="w-[38px] h-[38px] shrink-0 object-contain select-none" />
        <span className="flex-1 min-w-0">
          <span className="block text-[13.5px] font-[800] tracking-[-0.03em] text-layout-black dark:text-layout-white">
            보호권 {qty}개
          </span>
          <span className="block mt-[2px] text-[11px] font-[500] text-layout-gray-300">
            쓴 만큼 다시 채워 둬요
          </span>
        </span>
        <span className="flex items-center rounded-[9px] bg-layout-gray-50 dark:bg-layout-gray-dark overflow-hidden">
          <button
            type="button"
            aria-label="줄이기"
            onClick={() => { vibrate({ duration: 5 }); setQty((q) => Math.max(1, q - 1)); }}
            className="w-[30px] h-[30px] text-[16px] font-[700] text-layout-gray-400"
          >
            −
          </button>
          <output className="min-w-[22px] text-center text-[14px] font-[800] tabular-nums text-layout-black dark:text-layout-white">
            {qty}
          </output>
          <button
            type="button"
            aria-label="늘리기"
            onClick={() => { vibrate({ duration: 5 }); setQty((q) => Math.min(10, q + 1)); }}
            className="w-[30px] h-[30px] text-[16px] font-[700] text-layout-gray-400"
          >
            +
          </button>
        </span>
      </div>
      {status === 'short' ? (
        <Btns>
          <Btn tone="sec" onClick={onSkip}>괜찮아요</Btn>
          <Btn tone="pri" onClick={onNeedGems}>보석이 모자라요 · 충전</Btn>
        </Btns>
      ) : (
        <Btns>
          <Btn tone="sec" onClick={onSkip}>괜찮아요</Btn>
          <Btn tone="pri" onClick={buy} disabled={status === 'loading'}>
            <img src={CROP_ASSETS.gem} alt="" className="w-[14px] h-[14px] object-contain" />
            {cost}개로 채우기
          </Btn>
        </Btns>
      )}
    </>
  );
};

/** 최근 7일 막대 한 칸(§3 "보호일=민트, 기존 STREAK_PROTECTED_BG_CLASS") */
const WeekStrip = ({ week }) => (
  <div className="flex gap-[6px] mt-[14px]">
    {week.map((d) => (
      <div key={d.key} className="flex-1 flex flex-col items-center gap-[5px]">
        <div className={`w-full h-[30px] rounded-[4px] flex items-end ${d.isToday ? 'bg-primary-main-100 dark:bg-primary-main-dark' : ''}`}>
          <i
            style={{ height: `${Math.max(d.pct, d.isToday && d.pct > 0 ? 10 : 0)}%` }}
            className={`block w-full rounded-[4px] ${
              d.isProtected
                ? STREAK_PROTECTED_BG_CLASS
                : (d.isStudied || d.isToday) ? 'bg-primary-main-500' : 'bg-[#F3DEEC] dark:bg-[rgba(255,255,255,.14)]'
            }`}
          />
        </div>
        <span className={`text-[10px] font-[700] ${d.isToday ? 'text-primary-main-600 dark:text-primary-main-500' : 'text-[#B8709F] dark:text-primary-main-400'}`}>
          {d.label}
        </span>
      </div>
    ))}
  </div>
);

/** 시트 공용 헤더 — 그림 + 제목 (넷 다 같은 골격, 시안 공통 .center) */
const Header = ({ image, children }) => (
  <div className="relative text-center pt-[6px]">
    <span className="pointer-events-none absolute left-1/2 top-[44px] -translate-x-1/2 -translate-y-1/2 w-[190px] h-[190px] rounded-full bg-[radial-gradient(circle,rgba(255,189,235,0.55)_0%,rgba(255,238,250,0)_68%)]" />
    <motion.img
      src={image}
      alt=""
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 18 }}
      draggable={false}
      className="relative w-[84px] h-[84px] mx-auto mb-[12px] object-contain select-none"
    />
    <h3 className="relative text-[19px] font-[800] leading-[1.35] tracking-[-0.04em] text-layout-black dark:text-layout-white text-balance">
      {children}
    </h3>
  </div>
);

/** paused 상세 표(시안 .kv) — 빈 날 · 필요/보유 · 지킬 수 있는 시간 */
const KvRow = ({ k, children, warn = false }) => (
  <div className="flex justify-between items-center py-[10px] border-b border-[#F0F0F0] dark:border-white/[0.08] text-[12.5px]">
    <span className="text-layout-gray-400 dark:text-layout-gray-300">{k}</span>
    <b className={`font-[800] ${warn ? 'text-secondary-yellow-600' : 'text-layout-black dark:text-layout-white'}`}>{children}</b>
  </div>
);

const StreakSettlementNewBottomSheet = ({
  type, payload = {}, streak = {}, ackId = null, onSettled,
}) => {
  "use memo";

  const { popNewBottomSheet } = useNewBottomSheetActions();
  const { pushNewFullSheet } = useNewFullSheetActions();
  const { userProfile, setUserProfile } = useUser();

  // 닫힐 때 한 번만 — 사유(버튼/백드롭/드래그) 불문. ackId가 없으면(수동 재오픈) ack하지 않는다.
  useEffect(() => () => {
    if (ackId) ackStreakNoticeApi(ackId);
    onSettled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    vibrate({ duration: 5 });
    popNewBottomSheet();
  };

  const openGemStore = () => {
    vibrate({ duration: 5 });
    popNewBottomSheet();
    pushNewFullSheet(StoreNewFullSheet, { initialTab: 'gems' }, { smFull: true, closeOnBackdropClick: true });
  };

  const gemCnt = Number(userProfile?.gem_cnt) || 0;

  // ── 최근 7일 막대(protected 전용, 시안 §3 "최근 7일 막대") ────────────
  const today = toLocalDateString(new Date());
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const week = useMemo(() => {
    const calendar = (streak?.calendar ?? []).slice().sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-7);
    const required = Math.max(1, streak?.required ?? 5);
    return calendar.map((d) => {
      const isToday = d.date === today;
      const date = new Date(`${d.date}T00:00:00`);
      const isProtected = d.status === 'protected';
      const isStudied = d.status ? d.status === 'studied' : (d.qualified && !isProtected);
      let pct;
      if (isToday) pct = Math.min(100, Math.round(((streak?.today_correct ?? 0) / required) * 100));
      else if (isProtected) pct = 100;
      else if (isStudied) pct = Math.max(30, Math.min(100, Math.round(((d.correct_cnt ?? required) / required) * 100)));
      else pct = 0;
      return {
        key: d.date,
        isToday,
        isProtected,
        isStudied,
        pct,
        label: isToday ? '오늘' : (Number.isNaN(date.getTime()) ? '' : DOW[date.getDay()]),
      };
    });
  }, [streak, today]);

  // ── protected: 자동 적용 완료 ───────────────────────────────
  if (type === 'protected') {
    const { shields_spent: spent, streak: streakVal, shield_before: before, shield_after: after } = payload;
    return (
      <div className={`${SHEET_SHELL} max-h-[calc(90vh-40px)] overflow-y-auto`}>
        <Grab />
        <Header image={CROP_ASSETS.shield}>
          보호권 <span className="text-primary-main-600">{spent}개</span>로<br />연속 {streakVal}일을 지켰어요
        </Header>
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-[7px] mt-[12px] px-[14px] py-[7px] rounded-full bg-layout-gray-50 dark:bg-layout-gray-dark text-[12.5px] font-[700] tracking-[-0.02em] text-layout-black dark:text-layout-white">
            <span>보유 {before}개</span>
            <span className="text-layout-gray-200">→</span>
            <span className="font-[800] text-primary-main-600">{after}개</span>
          </span>
        </div>
        <WeekStrip week={week} />
        <PrefillStepper
          defaultQty={spent}
          gemCnt={gemCnt}
          onSkip={close}
          onNeedGems={openGemStore}
          setUserProfile={setUserProfile}
        />
        <Hint center className="mt-[10px]">보유 보석 <HintB>{gemCnt}</HintB></Hint>
      </div>
    );
  }

  // ── paused: 부족 · 지키기 가능 ──────────────────────────────
  if (type === 'paused') {
    const {
      needed, have, short, missed_days: missedDays = [], deadline, from_streak: fromStreak, gem_cost: gemCost,
    } = payload;

    const [pausedStage, setPausedStage] = useState('view'); // view | loading | short | done
    const [protectResult, setProtectResult] = useState(null);
    const [shortageAmt, setShortageAmt] = useState(null);

    const formatMissedDays = (arr) => {
      if (!Array.isArray(arr) || arr.length === 0) return '';
      const parsed = arr.map((s) => {
        const d = new Date(`${s}T00:00:00`);
        return { month: d.getMonth() + 1, day: d.getDate() };
      });
      const sameMonth = parsed.every((p) => p.month === parsed[0].month);
      return sameMonth
        ? `${parsed[0].month}월 ${parsed.map((p) => `${p.day}일`).join(' · ')}`
        : parsed.map((p) => `${p.month}월 ${p.day}일`).join(' · ');
    };

    const formatDeadline = (iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      const month = d.getMonth() + 1;
      const day = d.getDate();
      const hours = d.getHours();
      const ampm = hours < 12 ? '오전' : '오후';
      let h = hours % 12;
      if (hours !== 0 && h === 0) h = 12;
      return `${month}월 ${day}일 ${ampm} ${h}시까지`;
    };

    const doProtect = async () => {
      vibrate({ duration: 5 });
      if (pausedStage === 'loading') return;
      setPausedStage('loading');
      const res = await protectStreakApi();
      if (res?.code !== 200 || !res?.data) {
        if (res?.code === 400 && Number.isFinite(Number(res?.data?.shortage))) {
          setShortageAmt(Number(res.data.shortage));
          setPausedStage('short');
        } else {
          // 409(이미 멈춤 상태가 아님) 등 — 그 사이 상태가 바뀐 것이라, 붙들고 있지 않고
          // 닫아서 onSettled(재조회)로 홈 카드가 최신 상태를 다시 그리게 한다.
          close();
        }
        return;
      }
      setUserProfile((prev) => ({ ...prev, gem_cnt: res.data.gem_cnt }));
      setProtectResult(res.data);
      setPausedStage('done');
    };

    if (pausedStage === 'done' && protectResult) {
      return (
        <div className={`${SHEET_SHELL} max-h-[calc(90vh-40px)] overflow-y-auto`}>
          <Grab />
          <Header image={CROP_ASSETS.streak}>
            연속 <span className="text-primary-main-600">{protectResult.streak}일</span>을 지켰어요
          </Header>
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-[7px] mt-[12px] px-[14px] py-[7px] rounded-full bg-layout-gray-50 dark:bg-layout-gray-dark text-[12.5px] font-[700] tracking-[-0.02em] text-layout-black dark:text-layout-white">
              <span>보호권 {protectResult.shields_spent}개 사용</span>
              <span className="text-layout-gray-200">·</span>
              <span>남은 {protectResult.shield_cnt}개</span>
            </span>
          </div>
          <PrefillStepper
            defaultQty={protectResult.shields_spent}
            gemCnt={gemCnt}
            onSkip={close}
            onNeedGems={openGemStore}
            setUserProfile={setUserProfile}
          />
        </div>
      );
    }

    if (pausedStage === 'short') {
      // 서버가 계산한 shortage(계약 §2 protect 400 {data:{shortage}})를 그대로 쓴다 —
      // gemCost-gemCnt로 다시 계산하면 클라이언트가 들고 있는 gemCnt가 낡았을 때 어긋난다.
      const shortage = shortageAmt ?? Math.max(0, Number(gemCost) - gemCnt);
      return (
        <div className={SHEET_SHELL}>
          <Grab />
          <div className="text-center pt-[6px]">
            <span className="flex items-center justify-center w-[84px] h-[84px] mx-auto mt-[2px] mb-[14px] rounded-full bg-secondary-yellow-100 dark:bg-secondary-yellow-dark">
              <WarningCircle size={34} weight="fill" className="text-secondary-yellow-600" />
            </span>
            <h3 className="text-[19px] font-[800] leading-[1.35] tracking-[-0.04em] text-layout-black dark:text-layout-white">
              보석이 <span className="text-primary-main-600">{shortage}개</span> 모자라요
            </h3>
          </div>
          <Btns>
            <Btn tone="sec" onClick={close}>나중에 하기</Btn>
            <Btn tone="pri" onClick={openGemStore}>보석 충전</Btn>
          </Btns>
        </div>
      );
    }

    return (
      <div className={`${SHEET_SHELL} max-h-[calc(90vh-40px)] overflow-y-auto`}>
        <Grab />
        <Header image={CROP_ASSETS.shield}>
          보호권 <span className="text-primary-main-600">{short}개</span>만 더 있으면<br />연속 {fromStreak}일을 지킬 수 있어요
        </Header>
        <Hint center className="mt-[8px]">
          {missedDays.length}일을 쉬어서 보호권 {needed}개가 필요해요.
        </Hint>
        <div className="mt-[14px] border-t border-[#F0F0F0] dark:border-white/[0.08]">
          <KvRow k="빈 날">{formatMissedDays(missedDays)}</KvRow>
          <KvRow k="필요 / 보유">{needed}개 / {have}개</KvRow>
          <KvRow k="지킬 수 있는 시간" warn>{formatDeadline(deadline)}</KvRow>
        </div>
        <Btns>
          <Btn tone="sec" onClick={close}>괜찮아요</Btn>
          <Btn tone="pri" onClick={doProtect} disabled={pausedStage === 'loading'}>
            <img src={CROP_ASSETS.gem} alt="" className="w-[14px] h-[14px] object-contain" />
            {gemCost}개로 지키기
          </Btn>
        </Btns>
        <Hint center className="mt-[10px]">
          사면 가진 {have}개와 함께 바로 쓰여요 · 보유 보석 <HintB>{gemCnt}</HintB>
        </Hint>
      </div>
    );
  }

  // ── broken: 연속 종료 (+ 다시 잇기 제안) ───────────────────
  if (type === 'broken') {
    const {
      gap_days: gapDays, lost_streak: lostStreak, shield_cnt: shieldCnt, max_gap: maxGap,
      earn_back: earnBack, next_earn_back_on: nextEarnBackOn,
    } = payload;

    const [starting, setStarting] = useState(false);

    const startChallenge = async () => {
      vibrate({ duration: 5 });
      if (starting) return;
      setStarting(true);
      const res = await startEarnBackApi();
      setStarting(false);
      if (res?.code === 200) close();
    };

    return (
      <div className={`${SHEET_SHELL} max-h-[calc(90vh-40px)] overflow-y-auto`}>
        <Grab />
        <Header image={CROP_ASSETS.streak}>
          {gapDays}일 쉬어서<br />연속이 이어지지 않았어요
        </Header>
        <Hint center className="mt-[8px]">
          보호권은 빈 날이 <HintB>{maxGap}일 이하</HintB>일 때만 자동으로 쓰여요.<br />
          가진 보호권 {shieldCnt}개는 그대로 남아 있어요.
        </Hint>

        {earnBack ? (
          <>
            <div className="mt-[14px] p-[14px] rounded-[12px] bg-primary-main-50 dark:bg-primary-main-dark border border-primary-main-200 dark:border-transparent">
              <div className="text-[13.5px] font-[800] text-layout-black dark:text-layout-white">
                연속 {lostStreak}일 다시 잇기
              </div>
              <div className="mt-[4px] text-[12px] leading-[1.55] text-layout-gray-400 dark:text-layout-gray-300">
                오늘부터 {earnBack.days_required}일 동안 매일 단어 5개를 맞히면<br />
                {lostStreak}일에 이어서 {earnBack.result_streak}일이 돼요.
              </div>
              <div className="flex gap-[8px] mt-[12px]">
                {Array.from({ length: earnBack.days_required }).map((_, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-[5px]">
                    <i className="block w-full h-[8px] rounded-full bg-[#F3DEEC] dark:bg-[rgba(255,255,255,.14)]" />
                    <span className="text-[10.5px] font-[700] text-[#B8709F] dark:text-primary-main-400">
                      {['오늘', '내일', '모레'][i] || `${i + 1}일째`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <Btns>
              <Btn tone="sec" onClick={close}>다음에</Btn>
              <Btn tone="pri" onClick={startChallenge} disabled={starting}>도전 시작</Btn>
            </Btns>
          </>
        ) : nextEarnBackOn ? (
          <>
            <Hint center className="mt-[10px]">
              다음 도전은 <HintB>{formatIsoDate(nextEarnBackOn)}</HintB>부터 열려요.
            </Hint>
            <Btns>
              <Btn tone="pri" wide onClick={close}>확인</Btn>
            </Btns>
          </>
        ) : (
          <Btns>
            <Btn tone="pri" wide onClick={close}>확인</Btn>
          </Btns>
        )}
      </div>
    );
  }

  // ── earn_back_success: 다시 잇기 성공 ───────────────────────
  if (type === 'earn_back_success') {
    const { from_streak: fromStreak, added, streak: streakVal } = payload;
    return (
      <div className={SHEET_SHELL}>
        <Grab />
        <Header image={CROP_ASSETS.streak}>
          연속 <span className="text-primary-main-600">{streakVal}일</span>을 되찾았어요
        </Header>
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-[7px] mt-[12px] px-[14px] py-[7px] rounded-full bg-layout-gray-50 dark:bg-layout-gray-dark text-[12.5px] font-[700] tracking-[-0.02em] text-layout-black dark:text-layout-white">
            <span>{fromStreak}일</span>
            <span className="text-layout-gray-200">+</span>
            <span>도전 {added}일</span>
            <span className="text-layout-gray-200">=</span>
            <span className="font-[800] text-primary-main-600">{streakVal}일</span>
          </span>
        </div>
        <Hint center className="mt-[10px]">쉰 날은 세지 않아요.</Hint>
        <Btns>
          <Btn tone="pri" wide onClick={close}>확인</Btn>
        </Btns>
      </div>
    );
  }

  return null;
};

export default StreakSettlementNewBottomSheet;
