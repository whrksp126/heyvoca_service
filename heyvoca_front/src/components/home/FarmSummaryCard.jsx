// src/components/home/FarmSummaryCard.jsx
//
// 홈 — 당근 농장 요약 카드.
// 단계별 보유 개수 · 돌봐야 할 작물 수 · 오늘 할 일을 한 장에 담고, 누르면 농장 상세(/farm)로 간다.
//
// 히어로 일러스트는 시안에서 PIL 로 합성한 PNG 다. 여기서는 그 합성을 재현하지 않고
// 마스코트 + 단계별 작물 에셋을 CSS 로 배치해 근사한다(보고 참조).
// 문구는 기획 13.4 를 따른다 — 죽음/손실 공포/결제 압박 표현을 쓰지 않고, 부패 개수를 앞세우지 않는다.

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CaretRight } from '@phosphor-icons/react';
import CropImage, { CROP_ASSETS } from '../farm/CropImage';
import { CROP_LABEL, HEALTH_STATES } from '../../utils/crop';
import { useStats } from '../../context/StatsContext';
import { vibrate } from '../../utils/osFunction';

// 단계 칩 — 클래스명을 문자열로 조립하지 않는다(Tailwind 가 정적 스캔으로 클래스를 수집한다)
const CROP_CHIPS = [
  { crop: 'seed', bg: 'bg-crop-seed-bg', text: 'text-crop-seed' },
  { crop: 'sprout', bg: 'bg-crop-sprout-bg', text: 'text-crop-sprout' },
  { crop: 'leaf', bg: 'bg-crop-leaf-bg', text: 'text-crop-leaf' },
  { crop: 'carrot', bg: 'bg-crop-carrot-bg', text: 'text-crop-carrot' },
];

// 밭에 심긴 자리 — 뒤(작고 위)에서 앞(크고 아래)으로 성장 순서가 읽힌다
const SCENE_SPOTS = [
  { crop: 'seed', pos: 'left-[41%] bottom-[54px]', size: 20 },
  { crop: 'sprout', pos: 'left-[56%] bottom-[43px]', size: 28 },
  { crop: 'leaf', pos: 'left-[72%] bottom-[30px]', size: 38 },
  { crop: 'carrot', pos: 'left-[88%] bottom-[13px]', size: 48 },
];

// 밭 전체의 분위기 — 가장 손이 필요한 상태를 대표값으로 삼아 일부 작물에만 입힌다
const sceneMood = (health) => {
  if ((health?.critical ?? 0) > 0 || (health?.wilted ?? 0) > 0) return HEALTH_STATES.WILTED;
  if ((health?.thirsty ?? 0) > 0) return HEALTH_STATES.THIRSTY;
  return HEALTH_STATES.FRESH;
};

const FarmSummaryCard = ({ overview: overviewProp }) => {
  "use memo";

  const navigate = useNavigate();
  const { farmOverview } = useStats();
  const overview = overviewProp ?? farmOverview;

  // 농장 데이터가 아직 없으면(최초 로드 전 · 조회 실패) 홈에 빈 카드를 남기지 않는다
  if (!overview) return null;

  const counts = overview.counts ?? {};
  const health = overview.health ?? {};
  const today = overview.today ?? {};

  const planted = CROP_CHIPS.reduce((sum, c) => sum + (counts[c.crop] ?? 0), 0);
  const golden = counts.golden ?? 0;
  const needCare = (health.thirsty ?? 0) + (health.wilted ?? 0) + (health.critical ?? 0);
  const criticalFirst = today.critical_first ?? 0;
  const due = today.due ?? 0;
  const recommended = today.recommended_limit ?? 0;
  const mood = sceneMood(health);

  const handleClick = () => {
    vibrate({ duration: 5 });
    navigate('/farm');
  };

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      className="
        flex flex-col gap-[12px] w-full
        px-[15px] py-[12px]
        rounded-[12px]
        bg-crop-seed-bg
        text-left
      "
    >
      <div className="flex items-center justify-between gap-[8px] w-full">
        <h2 className="text-layout-black dark:text-layout-white text-[16px] font-[700]">당근 농장</h2>
        <span className="flex items-center gap-[2px] text-layout-gray-300 text-[12px] font-[700]">
          농장 보기
          <CaretRight size={14} />
        </span>
      </div>

      {/* 밭 — 시안 히어로의 축약판. 실제 배치가 아니라 분위기를 전한다 */}
      <div className="
        relative w-full h-[112px] overflow-hidden
        rounded-[10px]
        bg-gradient-to-b from-[#FBF1DE] to-[#FFFCF3]
        dark:from-[#2B271D] dark:to-[#1E1A14]
      ">
        <div className="absolute top-[12px] right-[16px] w-[32px] h-[32px] rounded-full bg-[#FFEFC0] dark:bg-[#3A3320]" />
        <div className="absolute left-[-12%] right-[-12%] bottom-[-34px] h-[96px] rounded-[50%] bg-[#B6E08A] dark:bg-[#33421F]" />
        <div className="absolute left-[4%] right-[4%] bottom-[-24px] h-[72px] rounded-[50%] bg-[#9C7047] dark:bg-[#4A3520]" />

        {planted > 0 ? (
          SCENE_SPOTS.map((spot, idx) => (
            (counts[spot.crop] ?? 0) > 0 ? (
              <span key={spot.crop} className={`absolute -translate-x-1/2 ${spot.pos}`}>
                <CropImage
                  stage={spot.crop}
                  health={idx % 2 === 1 ? mood : HEALTH_STATES.FRESH}
                  size={spot.size}
                />
              </span>
            ) : null
          ))
        ) : (
          <span className="
            absolute left-1/2 bottom-[26px] -translate-x-1/2 whitespace-nowrap
            text-layout-gray-400 dark:text-layout-gray-200 text-[12px] font-[600]
          ">
            학습을 시작하면 첫 씨앗이 심겨요
          </span>
        )}

        <img
          src={CROP_ASSETS.mascotWatering}
          alt=""
          draggable={false}
          className="absolute left-[10px] bottom-[16px] h-[64px] w-auto object-contain select-none"
        />
      </div>

      {/* 단계별 보유 — 씨앗·새싹·이파리·당근 4그룹 */}
      <div className="grid grid-cols-4 gap-[6px] w-full">
        {CROP_CHIPS.map(({ crop, bg, text }) => (
          <div key={crop} className={`flex flex-col items-center gap-[2px] py-[8px] rounded-[10px] ${bg}`}>
            <CropImage stage={crop} size={22} />
            <span className={`text-[14px] font-[800] leading-[1.1] ${text}`}>{counts[crop] ?? 0}</span>
            <span className="text-layout-gray-400 dark:text-layout-gray-200 text-[10px] font-[600]">
              {CROP_LABEL[crop]}
            </span>
          </div>
        ))}
      </div>

      {golden > 0 && (
        <div className="flex items-center gap-[8px] w-full px-[12px] py-[9px] rounded-[10px] bg-crop-golden-bg">
          <img
            src={CROP_ASSETS.goldenCarrot}
            alt=""
            draggable={false}
            className="w-[22px] h-[22px] object-contain select-none"
          />
          <span className="flex-1 text-layout-black dark:text-layout-white text-[13px] font-[700]">
            황금 당근
          </span>
          <span className="text-crop-golden text-[14px] font-[800]">{golden}</span>
        </div>
      )}

      {/* 먼저 돌볼 작물 — 오늘 물을 주면 바로 회복된다. 개수는 '해결 가능한 양'으로만 보여준다 */}
      {criticalFirst > 0 && (
        <div className="flex items-center gap-[10px] w-full px-[12px] py-[10px] rounded-[10px] bg-secondary-yellow-100 dark:bg-secondary-yellow-dark">
          <CropImage stage="leaf" health={HEALTH_STATES.WILTED} size={24} />
          <span className="flex flex-col min-w-0 flex-1">
            <span className="text-layout-black dark:text-layout-white text-[13px] font-[700]">
              먼저 돌볼 작물 {criticalFirst}개
            </span>
            <span className="text-layout-gray-400 dark:text-layout-gray-200 text-[11px] font-[500]">
              오늘 물을 주면 바로 다시 촉촉해져요
            </span>
          </span>
        </div>
      )}

      {/* 오늘 할 일 */}
      <div className={`
        flex items-center gap-[10px] w-full px-[12px] py-[10px] rounded-[10px]
        ${due > 0 ? 'bg-primary-main-100 dark:bg-primary-main-dark' : 'bg-status-success-100 dark:bg-status-success-dark'}
      `}>
        <span className="flex flex-col min-w-0 flex-1">
          <span className="text-layout-black dark:text-layout-white text-[13px] font-[700]">
            {due > 0 ? `오늘 물 줄 작물 ${due}개` : '오늘 물 줄 작물을 다 돌봤어요'}
          </span>
          <span className="text-layout-gray-400 dark:text-layout-gray-200 text-[11px] font-[500]">
            {due > 0
              ? (recommended > 0 && recommended < due
                ? `${recommended}개만 가볍게 시작해도 좋아요`
                : '물을 주면 한 단계씩 자라요')
              : (needCare > 0
                ? `물이 필요한 작물 ${needCare}개는 내일 다시 챙겨볼게요`
                : '밭이 촉촉해요')}
          </span>
        </span>
      </div>
    </motion.button>
  );
};

export default FarmSummaryCard;
