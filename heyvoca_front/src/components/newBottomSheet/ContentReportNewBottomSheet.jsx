import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Flag, CaretRight } from '@phosphor-icons/react';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { vibrate } from '../../utils/osFunction';
import { createContentReportApi } from '../../api/report';
import { REPORT_REASONS, buildReportBody, reportTargetLabel, expandReportTargets } from '../report/reportPayload';

/**
 * 학습 중 오류 신고 바텀시트 — ReportFlagButton 이 pushAwaitNewBottomSheet 로 연다.
 * 사유 칩을 누르는 순간 바로 전송한다(메모는 선택, 칩보다 먼저 적어 두면 같이 간다).
 * 대상 고르기: 지금 문제를 아직 안 풀었고 방금 푼 문제가 있으면 그 문제도 후보에 넣는다
 * (채점 뒤 자동으로 넘어가 버려 직전 문제를 신고하려던 경우). 카드 맞추기처럼 단어가 여럿인
 * 문제는 단어마다 후보가 된다. 기본 선택은 틀린 단어 → 직전 문제 → 지금 문제 순.
 *
 * resolve 값: { sent: true, duplicate } | { sent: false }
 */
export const ContentReportNewBottomSheet = ({ question, previousQuestion = null, testType }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { resolveNewBottomSheet } = useNewBottomSheetActions();
  const memoRef = useRef(null);
  const targets = [
    ...expandReportTargets(previousQuestion, 'previous').map((t) => ({ ...t, tag: '방금 푼 문제' })),
    ...expandReportTargets(question, 'current').map((t) => ({ ...t, tag: previousQuestion ? '지금 문제' : null })),
  ];
  const defaultTarget =
    targets.find((t) => t.key.startsWith('current') && t.q.isCorrect === false)
    ?? targets.find((t) => t.key.startsWith('previous'))
    ?? targets[0];
  const [targetKey, setTargetKey] = useState(defaultTarget?.key);
  const [sending, setSending] = useState(null);
  const [error, setError] = useState('');

  const selected = targets.find((t) => t.key === targetKey) ?? defaultTarget;

  const handleReason = async (code) => {
    if (sending) return;
    vibrate({ duration: 5 });
    setSending(code);
    setError('');
    const memo = (memoRef.current?.value || '').trim();
    const res = await createContentReportApi({
      ...buildReportBody(selected?.q, { testType, setWords: selected?.setWords ?? null }),
      reason: code,
      memo: memo || null,
    });
    if (res?.code === 200) {
      resolveNewBottomSheet({ sent: true, duplicate: !!res.data?.duplicate });
      return;
    }
    setSending(null);
    setError(res?.message || '보내지 못했어요. 잠시 후 다시 시도해 주세요.');
  };

  return (
    <div className="flex flex-col">
      <div className="flex flex-col items-center gap-[6px] pt-[28px] px-[20px]">
        <div className="
          flex items-center justify-center
          w-[48px] h-[48px] rounded-full
          bg-primary-main-100 dark:bg-primary-main-dark text-primary-main-600
        ">
          <Flag size={26} weight="fill" />
        </div>
        <h3 className="text-layout-black dark:text-layout-white text-[18px] font-[700]">
          어떤 점이 잘못됐나요?
        </h3>
        <p className="text-layout-gray-400 dark:text-layout-gray-200 text-[13px] text-center leading-[1.5]">
          고르면 바로 전달돼요. 확인해서 고칠게요.
        </p>
      </div>

      {targets.length > 1 ? (
        <div className="flex flex-wrap justify-center gap-[8px] px-[20px] pt-[16px]">
          {targets.map((t) => {
            const on = t.key === selected?.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => { vibrate({ duration: 5 }); setTargetKey(t.key); }}
                className={`
                  flex flex-col items-center gap-[2px]
                  min-w-[88px] max-w-full py-[8px] px-[12px] rounded-[10px] border-[1px]
                  ${on
                    ? 'border-primary-main-600 bg-primary-main-50 dark:bg-primary-main-dark'
                    : 'border-layout-gray-200 dark:border-border-dark'}
                `}
              >
                {t.tag && (
                  <span className={`text-[11px] font-[600] ${on ? 'text-primary-main-600' : 'text-layout-gray-400'}`}>{t.tag}</span>
                )}
                <span className="max-w-full truncate text-[14px] font-[700] text-layout-black dark:text-layout-white">
                  {reportTargetLabel(t.q)}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="pt-[12px] px-[20px] text-center text-[15px] font-[700] text-layout-black dark:text-layout-white truncate">
          {reportTargetLabel(selected?.q)}
        </p>
      )}

      <div className="px-[20px] pt-[16px]">
        <input
          ref={memoRef}
          type="text"
          maxLength={200}
          placeholder="한 줄 메모 (선택)"
          className="
            w-full px-[14px] py-[11px] rounded-[10px]
            border border-border dark:border-border-dark
            bg-layout-white dark:bg-layout-black
            text-[16px] text-layout-black dark:text-layout-white
            placeholder:text-layout-gray-300
            focus:outline-none focus:border-primary-main-600
          "
        />
      </div>

      <div className="flex flex-col gap-[8px] px-[20px] pt-[12px] pb-[20px]">
        {REPORT_REASONS.map(({ code, label }) => (
          <motion.button
            key={code}
            type="button"
            disabled={!!sending}
            onClick={() => handleReason(code)}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 500, damping: 20 }}
            className={`
              flex items-center justify-between
              w-full h-[48px] px-[16px]
              rounded-[10px] border-[1px]
              text-[15px] font-[600]
              ${sending === code
                ? 'border-primary-main-600 bg-primary-main-50 dark:bg-primary-main-dark text-primary-main-600'
                : 'border-layout-gray-200 dark:border-border-dark text-layout-black dark:text-layout-white'}
              ${sending && sending !== code ? 'opacity-50' : ''}
            `}
          >
            <span>{label}</span>
            <span className="text-[12px] text-layout-gray-300">
              {sending === code ? '보내는 중' : <CaretRight size={16} />}
            </span>
          </motion.button>
        ))}
        {error && (
          <p className="pt-[4px] text-center text-[13px] text-status-error-600">{error}</p>
        )}
        <button
          type="button"
          onClick={() => { vibrate({ duration: 5 }); resolveNewBottomSheet({ sent: false }); }}
          className="mt-[4px] h-[44px] text-[15px] font-[600] text-layout-gray-400 dark:text-layout-gray-200"
        >
          닫기
        </button>
      </div>
    </div>
  );
};

export default ContentReportNewBottomSheet;
