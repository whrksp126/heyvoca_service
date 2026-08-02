import React from 'react';
import { motion } from 'framer-motion';
import { X, WarningCircle } from '@phosphor-icons/react';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { vibrate } from '../../utils/osFunction';
import {
  SHEET_SHELL, Grab, Btn, Btns, Hint,
} from './purchaseParts';

/**
 * 구매 리턴 화면 — 성공/실패 여덟 장이 쓰는 한 틀.
 *
 * 시안 정본: shop-result.txt §5(리턴 화면의 공통 규격) ·
 *            §2(성공 4종 ③④⑤⑥) · §3(실패 4종 ⑦⑧⑨⑩) ·
 *            shop-purchase.txt §4(결과 화면 — 확인이 아니라 다음 행동) · §5(실패 화면의 순서).
 *
 * 여덟 장이 같은 자리·같은 순서를 쓰고 **남기는 줄 수만 다르다**는 게 §5 의 요구라
 * 화면마다 결과 마크업을 다시 짜지 않고 이 컴포넌트에 값만 넣는다.
 *
 * 자리 1 그림 · 2 제목 · 3 변화 pill · 4 한 줄 · 5 버튼 · 6 캡션.
 * 실패에는 3·6 이 없다(§5) — "잔액 명세를 실패 화면에서 읽게 하지 않는다".
 *
 * 결과 화면에 없는 것들도 §5 가 못 박았다: 겹침 수량 pill · "아직 심지 않은 씨앗이에요" ·
 * 10초 취소 스낵바 · 보너스 안내 · 실패 화면의 변동 없음 명세.
 * 동작이 없는 게 아니라 이 화면에서 읽을 필요가 없을 뿐이다.
 */

/** 성공 그림 — 실물 3D 에셋 96px + 분홍 글로우 (시안 .res .im / .res .glow) */
const ResultImage = ({ src, alt = '', plot = false }) => (
  <>
    <span className="pointer-events-none absolute left-1/2 top-[44px] -translate-x-1/2 -translate-y-1/2 w-[190px] h-[190px] rounded-full bg-[radial-gradient(circle,rgba(255,189,235,0.55)_0%,rgba(255,238,250,0)_68%)]" />
    <motion.img
      src={src}
      alt={alt}
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 18 }}
      draggable={false}
      className={`relative mx-auto object-contain select-none ${
        plot ? 'w-[158px] h-[104px] mb-[16px]' : 'w-[96px] h-[96px] mb-[14px]'
      }`}
    />
  </>
);

/** 실패 그림 — 상태 원 84px. 이모지를 쓰지 않는다(§5: ❌ 는 사용자가 잘못한 것처럼 읽힌다) */
const ResultIcon = ({ kind }) => (
  <span
    className={`flex items-center justify-center w-[84px] h-[84px] mx-auto mt-[2px] mb-[14px] rounded-full ${
      kind === 'shortage'
        ? 'bg-secondary-yellow-100 dark:bg-secondary-yellow-dark'
        : 'bg-status-error-100 dark:bg-status-error-dark'
    }`}
  >
    {kind === 'shortage'
      ? <WarningCircle size={32} weight="fill" className="text-secondary-yellow-600" />
      : <X size={34} weight="bold" className="text-[#F04438]" />}
  </span>
);

/** 제목 안에서 수량만 분홍으로 한 번 강조한다 (§5 · 2 · 제목) */
export const ResultEm = ({ children }) => (
  <span className="text-primary-main-600">{children}</span>
);

/** 3 · 변화 — 사기 전 확인 시트에서 예고한 값과 같은 형식 (시안 .reshold) */
const ResultPill = ({ from, to }) => (
  <div className="relative inline-flex items-center gap-[7px] mt-[14px] px-[14px] py-[7px] rounded-full bg-layout-gray-50 dark:bg-layout-gray-dark text-[12.5px] font-[700] tracking-[-0.02em] text-layout-black dark:text-layout-white">
    <span>{from}</span>
    <span className="text-layout-gray-200">→</span>
    <span className="font-[800] text-primary-main-600">{to}</span>
  </div>
);

/**
 * 시트 없이 결과 본문만 쓰는 자리(보석 IAP 시트 등)를 위해 따로 뺀다.
 *
 * @param {boolean}  success  성공/실패
 * @param {string}   kind     실패 갈래 — 'error'(처리·결제 실패) | 'shortage'(보석 부족)
 * @param {string}   image    성공 그림 URL
 * @param {boolean}  plot     밭 그림이면 true — 마름모라 가로가 길다(시안 .res .im.plot)
 * @param {node}     title    2 · 제목
 * @param {object}   pill     3 · 변화 { from, to } — 수량이 바뀌는 것만
 * @param {node}     desc     4 · 한 줄 — 성공은 지금 할 수 있는 일, 실패는 원인
 */
export const PurchaseResultBody = ({
  success = true, kind = 'error', image, plot = false, title, pill = null, desc = null,
}) => (
  <div className="relative text-center pt-[6px]">
    {success
      ? (image ? <ResultImage src={image} plot={plot} /> : null)
      : <ResultIcon kind={kind} />}
    <h3 className="relative text-[19px] font-[800] leading-[1.35] tracking-[-0.04em] text-layout-black dark:text-layout-white">
      {title}
    </h3>
    {success && pill && <ResultPill from={pill.from} to={pill.to} />}
    {desc && (
      <p className="relative mt-[8px] text-[12.5px] leading-[1.6] tracking-[-0.02em] text-layout-gray-400 dark:text-layout-gray-300">
        {desc}
      </p>
    )}
  </div>
);

/**
 * @param {object} options
 * @param {node}   options.title      2 · 제목 (수량은 <ResultEm> 로 감싼다)
 * @param {object} options.primary    5 · 주 버튼 { label, onClick } — 성공이면 다음 행동, 실패면 다시 시도
 * @param {object} options.secondary  5 · 보조 버튼 { label, onClick } — 없으면 주 버튼이 전폭
 * @param {node}   options.caption    6 · 캡션 (성공에만)
 */
export const StorePurchaseResultNewBottomSheet = ({ options = {} }) => {
  "use memo";

  const { popNewBottomSheet } = useNewBottomSheetActions();
  const {
    success = true,
    kind = 'error',
    image,
    plot = false,
    title,
    pill = null,
    desc = null,
    caption = null,
    primary = null,
    secondary = null,
  } = options;

  const close = () => {
    vibrate({ duration: 5 });
    popNewBottomSheet();
  };

  const run = (btn) => {
    vibrate({ duration: 5 });
    if (btn?.onClick) btn.onClick();
    else popNewBottomSheet();
  };

  return (
    <div className={SHEET_SHELL}>
      <Grab />
      <PurchaseResultBody
        success={success}
        kind={kind}
        image={image}
        plot={plot}
        title={title}
        pill={pill}
        desc={desc}
      />

      <Btns>
        {secondary ? (
          <>
            <Btn tone="sec" onClick={secondary.onClick ? () => run(secondary) : close}>
              {secondary.label}
            </Btn>
            <Btn tone="pri" onClick={() => run(primary)}>{primary?.label || '확인'}</Btn>
          </>
        ) : (
          <Btn tone="pri" wide onClick={() => run(primary)}>{primary?.label || '확인'}</Btn>
        )}
      </Btns>

      {/* 6 · 캡션 — 남은 잔액 · 한도. 실패에는 없다(§5) */}
      {success && caption && <Hint center className="mt-[10px]">{caption}</Hint>}
    </div>
  );
};

export default StorePurchaseResultNewBottomSheet;
