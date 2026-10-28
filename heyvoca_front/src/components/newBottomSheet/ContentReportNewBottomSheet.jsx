import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { vibrate } from '../../utils/osFunction';
import { createContentReportApi } from '../../api/report';
import { REPORT_REASONS, buildReportBody, reportTargetLabel, expandReportTargets } from '../report/reportPayload';
import ReportArt from '../report/ReportArt';

/**
 * 학습 중 오류 신고 바텀시트 — ReportFlagButton 이 pushAwaitNewBottomSheet 로 연다.
 * 두 단계: ① 이번 학습에서 지금까지 나온 단어를 휠 피커(알림 앱 시간 고르기처럼 위아래로 굴림)로 고르고
 * ② 사유 칩으로 고르고 '보내기'로 전송한다. 칩은 선택만 하고, 직접 입력란은 '기타'를 골랐을 때만 연다
 *   (QA #15: 칩을 누르자마자 가던 것을 되돌릴 수 없었다).
 * 기본 선택은 지금 문제의 단어(단어가 여럿인 카드 맞추기는 틀린 단어 → 첫 단어).
 * 같은 단어가 여러 번 나왔으면 가장 최근 문제 하나만 남긴다.
 *
 * resolve 값: { sent: true, duplicate } | { sent: false }
 */
const ROW_H = 40;
const VISIBLE_ROWS = 5;
const PAD = ROW_H * Math.floor(VISIBLE_ROWS / 2);

const buildTargets = (questions, currentIndex, previousQuestion) => {
  const list = [];
  const seen = new Map();
  const upto = Math.min(currentIndex, (questions?.length ?? 0) - 1);
  for (let i = 0; i <= upto; i += 1) {
    const q = questions[i];
    if (!q) continue;
    const isCurrent = i === currentIndex;
    for (const t of expandReportTargets(q, `q${i}`)) {
      const label = reportTargetLabel(t.q);
      if (!label) continue;
      const tag = isCurrent ? '지금 문제' : (q === previousQuestion ? '방금 푼 문제' : null);
      const item = { ...t, label, tag, isCurrent };
      if (seen.has(label)) list[seen.get(label)] = null;
      seen.set(label, list.length);
      list.push(item);
    }
  }
  return list.filter(Boolean);
};

export const ContentReportNewBottomSheet = ({ question, previousQuestion = null, testType, testQuestions = null, progressIndex = null }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { resolveNewBottomSheet } = useNewBottomSheetActions();
  const memoRef = useRef(null);
  const wheelRef = useRef(null);

  const [targets] = useState(() => {
    const fromSession = Array.isArray(testQuestions) && Number.isInteger(progressIndex)
      ? buildTargets(testQuestions, progressIndex, previousQuestion)
      : [];
    if (fromSession.length) return fromSession;
    // 학습 목록을 못 받았을 때(옛 호출) — 직전·지금 문제만
    return [
      ...expandReportTargets(previousQuestion, 'previous').map((t) => ({ ...t, label: reportTargetLabel(t.q), tag: '방금 푼 문제' })),
      ...expandReportTargets(question, 'current').map((t) => ({ ...t, label: reportTargetLabel(t.q), tag: '지금 문제', isCurrent: true })),
    ];
  });
  const [index, setIndex] = useState(() => {
    const cur = targets.findIndex((t) => t.isCurrent && t.q.isCorrect === false);
    if (cur >= 0) return cur;
    const first = targets.findIndex((t) => t.isCurrent);
    return first >= 0 ? first : Math.max(0, targets.length - 1);
  });
  const [reason, setReason] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const selected = targets[index];

  // 처음 열 때 기본 선택 단어를 가운데로
  useEffect(() => {
    if (wheelRef.current) wheelRef.current.scrollTop = index * ROW_H;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScroll = () => {
    const el = wheelRef.current;
    if (!el) return;
    const next = Math.max(0, Math.min(targets.length - 1, Math.round(el.scrollTop / ROW_H)));
    if (next !== index) {
      vibrate({ duration: 3 });
      setIndex(next);
    }
  };

  const scrollToRow = (i) => {
    wheelRef.current?.scrollTo({ top: i * ROW_H, behavior: 'smooth' });
  };

  const handleReason = (code) => {
    if (sending) return;
    vibrate({ duration: 5 });
    setReason(code);
    setError('');
    // '기타'면 바로 입력란에 커서 — 키보드가 뜨면 시트는 NewBottomSheetProvider 가 키보드 위로 올린다
    if (code === 'other') requestAnimationFrame(() => memoRef.current?.focus());
  };

  const handleSend = async () => {
    if (sending || !selected || !reason) return;
    vibrate({ duration: 5 });
    setSending(true);
    setError('');
    const memo = reason === 'other' ? (memoRef.current?.value || '').trim() : '';
    const res = await createContentReportApi({
      ...buildReportBody(selected.q, { testType, setWords: selected.setWords ?? null }),
      reason,
      memo: memo || null,
    });
    if (res?.code === 200) {
      resolveNewBottomSheet({ sent: true, duplicate: !!res.data?.duplicate });
      return;
    }
    setSending(false);
    setError(res?.message || '보내지 못했어요. 잠시 후 다시 시도해 주세요.');
  };

  const stepLabel = 'text-[12px] font-[700] text-layout-gray-400 dark:text-layout-gray-200';

  return (
    <div className="flex flex-col px-[20px] pb-[20px]">
      <div className="flex flex-col items-center gap-[4px] pt-[24px]">
        <ReportArt size={52} />
        <h3 className="text-layout-black dark:text-layout-white text-[18px] font-[700]">
          어떤 점이 잘못됐나요?
        </h3>
      </div>

      <p className={`${stepLabel} pt-[16px] pb-[6px]`}>1 · 어떤 단어인가요?</p>
      {/* 휠 피커 — scroll-snap 으로 한 줄씩 멈춘다. data-drag-handle: 굴리는 동안 시트가 끌려 내려가지 않게 */}
      <div className="relative" style={{ height: ROW_H * VISIBLE_ROWS }} data-drag-handle>
        <div
          aria-hidden
          className="absolute left-0 right-0 rounded-[12px] bg-primary-main-100 dark:bg-primary-main-dark pointer-events-none"
          style={{ top: PAD, height: ROW_H }}
        />
        <div
          ref={wheelRef}
          onScroll={handleScroll}
          role="listbox"
          aria-label="신고할 단어"
          className="relative h-full overflow-y-auto overscroll-contain snap-y snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{
            paddingTop: PAD,
            paddingBottom: PAD,
            WebkitMaskImage: 'linear-gradient(transparent, #000 30%, #000 70%, transparent)',
            maskImage: 'linear-gradient(transparent, #000 30%, #000 70%, transparent)',
          }}
        >
          {targets.map((t, i) => {
            const dist = Math.abs(i - index);
            const on = dist === 0;
            return (
              <button
                key={t.key}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => scrollToRow(i)}
                className="w-full flex items-center justify-center gap-[6px] snap-center transition-[opacity,transform] duration-150"
                style={{
                  height: ROW_H,
                  opacity: on ? 1 : dist === 1 ? 0.4 : 0.15,
                  transform: `scale(${on ? 1 : dist === 1 ? 0.9 : 0.8})`,
                }}
              >
                <span className="max-w-[70%] truncate text-[18px] font-[700] text-layout-black dark:text-layout-white">{t.label}</span>
                {t.tag && (
                  <span className={`shrink-0 text-[11px] font-[600] ${on ? 'text-primary-main-600' : 'text-layout-gray-400'}`}>{t.tag}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <p className={`${stepLabel} pt-[12px] pb-[8px]`}>2 · 무엇이 잘못됐나요?</p>
      <div className="grid grid-cols-2 gap-[8px]">
        {REPORT_REASONS.map(({ code, label }) => {
          const on = reason === code;
          return (
            <motion.button
              key={code}
              type="button"
              aria-pressed={on}
              disabled={sending}
              onClick={() => handleReason(code)}
              whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 500, damping: 20 }}
              className={`
                flex items-center justify-center
                h-[46px] px-[8px] rounded-[12px] border-[1px]
                text-[14px] font-[600] break-keep
                ${on
                  ? 'border-primary-main-600 bg-primary-main-100 dark:bg-primary-main-dark text-primary-main-600'
                  : 'border-layout-gray-200 dark:border-border-dark text-layout-black dark:text-layout-white'}
              `}
            >
              {label}
            </motion.button>
          );
        })}
      </div>

      {reason === 'other' && (
        <input
          ref={memoRef}
          type="text"
          maxLength={200}
          enterKeyHint="send"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSend(); } }}
          placeholder="무엇이 잘못됐는지 적어 주세요"
          className="
            mt-[10px] w-full px-[14px] py-[10px] rounded-[10px]
            border border-border dark:border-border-dark
            bg-layout-white dark:bg-layout-black
            text-[16px] text-layout-black dark:text-layout-white
            placeholder:text-layout-gray-300 placeholder:text-[14px]
            focus:outline-none focus:border-primary-main-600
          "
        />
      )}
      {error && (
        <p className="pt-[8px] text-center text-[13px] text-status-error-600">{error}</p>
      )}

      <motion.button
        type="button"
        disabled={!reason || sending}
        onClick={handleSend}
        whileTap={{ scale: 0.97 }}
        className="mt-[14px] w-full py-[14px] rounded-[8px] bg-primary-main-600 text-[16px] font-[700] text-layout-white disabled:bg-layout-gray-200 dark:disabled:bg-layout-gray-dark disabled:text-layout-gray-400"
      >
        {sending ? '보내는 중…' : '보내기'}
      </motion.button>
    </div>
  );
};

export default ContentReportNewBottomSheet;
