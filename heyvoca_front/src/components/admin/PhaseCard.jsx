// src/components/admin/PhaseCard.jsx
import React, { useState } from 'react';
import ProgressBar from './ProgressBar';

const STATUS_META = {
  available: {
    label: '진행 가능',
    badgeClass: 'bg-green-900/50 text-green-400 border border-green-700/50',
    borderClass: 'border-green-700/30',
  },
  blocked: {
    label: '대기 중',
    badgeClass: 'bg-yellow-900/50 text-yellow-400 border border-yellow-700/50',
    borderClass: 'border-gray-700/50',
  },
  deferred: {
    label: '보류',
    badgeClass: 'bg-gray-700/50 text-gray-400 border border-gray-600/50',
    borderClass: 'border-gray-700/50',
  },
  completed: {
    label: '완료',
    badgeClass: 'bg-blue-900/50 text-blue-400 border border-blue-700/50',
    borderClass: 'border-blue-700/30',
  },
};

const THRESHOLD_LABEL_CLASS = {
  '최소': 'text-orange-400',
  '권장': 'text-yellow-400',
  '최상': 'text-green-400',
};

/**
 * 임계치 한 줄 렌더
 */
const ThresholdRow = ({ threshold }) => {
  const { name, criteria, progress_percent, met } = threshold;
  const labelClass = THRESHOLD_LABEL_CLASS[name] ?? 'text-gray-300';

  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-center gap-2 mb-1">
        {met ? (
          <span className="text-green-400 text-sm font-bold">✓</span>
        ) : (
          <span className={`text-xs font-semibold ${labelClass}`}>{name}</span>
        )}
        <span className="text-gray-400 text-xs">{criteria}</span>
      </div>
      <ProgressBar percent={progress_percent ?? 0} met={met} />
    </div>
  );
};

/**
 * next_action 명령어 박스
 */
const NextActionBox = ({ nextAction, status }) => {
  const [copied, setCopied] = useState(false);

  if (!nextAction) return null;
  // command_short: 박스에 보일 짧은 라벨 / command_for_claude: 클립보드에 들어갈 디테일 풀 프롬프트
  const { trigger_label, command_short, command_for_claude } = nextAction;
  const displayLabel = command_short || command_for_claude;
  const clipboardText = command_for_claude || command_short;

  const isAvailable = status === 'available';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(clipboardText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API 실패 시 무시
    }
  };

  return (
    <div
      className={`mt-4 rounded-xl border p-4 transition-opacity ${
        isAvailable
          ? 'border-green-600/60 bg-green-950/30'
          : 'border-gray-700/40 bg-gray-800/30 opacity-50'
      }`}
    >
      <p className="text-gray-300 text-xs font-medium mb-2">
        {trigger_label || '다음 단계 진행하려면'}
      </p>
      <div className="bg-gray-950/60 rounded-lg px-3 py-2 mb-3 font-mono text-sm text-gray-100 break-words">
        {displayLabel}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleCopy}
          disabled={!isAvailable}
          className="px-3 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-200 transition-colors"
        >
          {copied ? '복사됨!' : '복사 (디테일 프롬프트)'}
        </button>
        <span className="text-gray-500 text-xs">새 세션에서 그대로 붙여넣어 실행</span>
      </div>
    </div>
  );
};

/**
 * Phase 단위 카드 컴포넌트
 * @param {{ phase: object }} props
 */
const PhaseCard = ({ phase }) => {
  "use memo";

  const { id, title, description, status, thresholds = [], next_action } = phase;
  const meta = STATUS_META[status] ?? STATUS_META.blocked;

  return (
    <div className={`bg-gray-900 rounded-2xl border p-6 ${meta.borderClass}`}>
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-sm font-mono">Phase {id}</span>
          <h3 className="text-white font-semibold">{title}</h3>
        </div>
        <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${meta.badgeClass}`}>
          {meta.label}
        </span>
      </div>

      {description && (
        <p className="text-gray-400 text-sm mb-4">{description}</p>
      )}

      {thresholds.length > 0 && (
        <div className="border-t border-gray-800 pt-4">
          <p className="text-gray-500 text-xs font-medium mb-3 uppercase tracking-wide">임계치</p>
          {thresholds.map((t, idx) => (
            <ThresholdRow key={idx} threshold={t} />
          ))}
        </div>
      )}

      <NextActionBox nextAction={next_action} status={status} />
    </div>
  );
};

export default PhaseCard;
