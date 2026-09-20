import React from 'react';
import CropImage from '../farm/CropImage';
import CropProgressBar from '../farm/CropProgressBar';
import { cropLabelDetail } from '../../utils/crop';

/**
 * 집중 반복 학습 카드 — 작물 상태 **정적** 표시.
 *
 * `FarmStatusBar`(farm/FarmStatusBar.jsx)는 채점 직후 "무엇이 바뀌었는지"를 애니메이션으로
 * 보여주는 전용 컴포넌트라 grew/pctFrom/pctTo 같은 전환 값이 없으면 아예 아무것도 그리지
 * 않는다(hasContent 가드) — 학습 카드처럼 "지금 이 단어가 어디까지 자랐는지"만 조용히 보여줄
 * 자리에는 맞지 않는다. 그래서 같은 부품(`CropImage`·`CropProgressBar`)을 그대로 가져다
 * 이 화면 전용으로 한 줄만 새로 짠다 — 그림과 막대 자체는 홈/채점 화면과 동일한 컴포넌트라
 * 서로 어긋나지 않는다.
 *
 * `word.farm`(`/vocaIndexs` 응답)이 없으면(구버전 응답·단어장 병합 직후처럼 farm 필드가
 * 아직 안 채워진 경우) 미학습으로 그린다.
 */
const StudyFarmStatusBar = ({ farm, className = '' }) => {
  const stage = farm?.stage || 'UNPLANTED_SEED';
  const health = farm?.health;
  const pct = Math.max(0, Math.min(100, Number(farm?.pct) || 0));
  const label = cropLabelDetail(stage);

  const days = farm?.days_to_review;
  let dayText = null;
  if (typeof days === 'number') {
    if (days <= 0) dayText = '오늘';
    else if (days === 1) dayText = '내일';
    else dayText = `${days}일 뒤`;
  }

  return (
    <div className={`flex items-center gap-[10px] ${className}`}>
      <span className="relative z-[1] flex-shrink-0 flex items-center justify-center w-[28px] h-[28px]">
        <CropImage stage={stage} health={health} size={28} align="center" />
      </span>
      <span className="flex-shrink-0 whitespace-nowrap text-[12px] font-[700] text-layout-gray-400 dark:text-layout-gray-200">
        {label}
      </span>
      {/* 항상 부모 칸(카드) 폭 기준 100% — pctFrom=pctTo 로 두면 채점 연출 없이 지금 값에
          그대로 멈춰 있다(grew=false, pending 미사용). */}
      <CropProgressBar pctFrom={pct} pctTo={pct} tone="primary" height={6} showGain={false} />
      <span className="flex-shrink-0 whitespace-nowrap text-right tabular-nums font-[600] tracking-[-0.02em] text-layout-gray-300 dark:text-layout-gray-200 min-w-[38px] text-[11.5px]">
        {dayText}
      </span>
    </div>
  );
};

export default StudyFarmStatusBar;
