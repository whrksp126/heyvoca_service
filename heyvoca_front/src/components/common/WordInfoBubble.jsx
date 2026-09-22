import { useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { SpeakerHigh } from '@phosphor-icons/react';

/*
  단어 사전 말풍선 — 예문 속 영어 단어를 탭하면 그 단어 아래(또는 위)에 뜬다(듀오링고 방식).

  위치 계산은 부모가 넘긴 값만으로 한다(이 컴포넌트는 DOM 을 조회하지 않는다).
  - anchor:    탭한 단어 버튼의 사각형 — **컨테이너(부모 카드) 기준** 좌표 { top, left, width, height }
  - container: 컨테이너 크기 { width, height } — 카드는 relative + overflow-hidden 이라
               말풍선이 카드 밖으로 나가면 잘리므로 여기 안에 가두어야 한다.

  배치 규칙
  1. 기본은 단어 **아래**. 단어 아래쪽에 말풍선 자리(BUBBLE_ROOM_PX)가 없으면 **위**에 둔다.
  2. 가로는 단어 중앙에 맞추되 컨테이너 안쪽 EDGE_MARGIN_PX 를 남기고 clamp 한다.
  3. 꼬리(삼각형)는 말풍선이 clamp 로 밀렸어도 항상 단어 중앙을 가리킨다
     (꼬리 x 는 말풍선 안쪽으로만 clamp — 모서리 radius 를 침범하지 않게).

  말풍선 폭은 내용(min 140 / max 260)에 따라 달라서, 첫 렌더 뒤 useLayoutEffect 로 실제 폭을 재
  같은 프레임에 위치를 확정한다(첫 렌더는 추정 폭으로 그려 깜빡임이 없다).

  status: 'loading' | 'found' | 'notFound' | 'error'
*/
const EDGE_MARGIN_PX = 12;      // 컨테이너 좌우 여백
const TAIL_SIZE_PX = 10;        // 꼬리 한 변(회전 전 정사각형)
const TAIL_GAP_PX = 8;          // 단어와 말풍선 본체 사이 간격(꼬리 높이 ≈ 7px + 여유)
const BUBBLE_ROOM_PX = 120;     // 아래에 이만큼 없으면 위로 올린다
const MIN_WIDTH_PX = 140;
const MAX_WIDTH_PX = 260;
const ESTIMATED_WIDTH_PX = 200; // 첫 렌더 추정 폭

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

const WordInfoBubble = ({ anchor, container, status, info, speaking = false, onReplay }) => {
  const bodyRef = useRef(null);
  const [measuredWidth, setMeasuredWidth] = useState(null);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    if (w && w !== measuredWidth) setMeasuredWidth(w);
  });

  const width = measuredWidth ?? ESTIMATED_WIDTH_PX;
  const containerW = container?.width ?? 0;
  const containerH = container?.height ?? 0;
  const wordCenterX = (anchor?.left ?? 0) + (anchor?.width ?? 0) / 2;
  const wordBottom = (anchor?.top ?? 0) + (anchor?.height ?? 0);

  // 1. 위/아래 — 단어 아래 남은 공간이 부족하면 위에 둔다
  const placeBelow = containerH - wordBottom - TAIL_GAP_PX >= BUBBLE_ROOM_PX;

  // 2. 가로 clamp — 컨테이너가 말풍선보다 좁으면 왼쪽 여백 기준으로 붙인다
  const maxLeft = Math.max(EDGE_MARGIN_PX, containerW - EDGE_MARGIN_PX - width);
  const left = clamp(wordCenterX - width / 2, EDGE_MARGIN_PX, maxLeft);

  // 3. 꼬리는 항상 단어 중앙 — 말풍선 안쪽(모서리 radius 밖)으로만 clamp
  const tailX = clamp(wordCenterX - left, EDGE_MARGIN_PX + TAIL_SIZE_PX / 2, Math.max(EDGE_MARGIN_PX + TAIL_SIZE_PX / 2, width - EDGE_MARGIN_PX - TAIL_SIZE_PX / 2));

  // 위치 스타일 — 계산값이라 Tailwind 클래스로 표현할 수 없어 style 로 넘긴다(여기만).
  const positionStyle = placeBelow
    ? { top: wordBottom + TAIL_GAP_PX, left }
    : { bottom: containerH - (anchor?.top ?? 0) + TAIL_GAP_PX, left };

  const word = info?.word ?? info?.query ?? '';
  const pronunciation = info?.pronunciation ? String(info.pronunciation).trim() : '';
  const meanings = Array.isArray(info?.meanings)
    ? info.meanings
        .map((m) => (typeof m === 'string' ? m : (m?.meaning ?? m?.text ?? '')))
        .map((m) => String(m ?? '').trim())
        .filter(Boolean)
        .slice(0, 3)
    : [];

  return (
    <motion.div
      role="dialog"
      aria-label="단어 뜻"
      data-word-info-bubble
      className="absolute z-[4] pointer-events-auto"
      style={positionStyle}
      initial={{ opacity: 0, y: placeBelow ? 4 : -4, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: placeBelow ? 4 : -4, scale: 0.96 }}
      transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 꼬리 — 본체와 같은 배경/테두리를 가진 정사각형을 45° 돌려 두 변만 보이게 한다 */}
      <span
        aria-hidden
        className={`
          absolute w-[10px] h-[10px] rotate-45
          bg-layout-white dark:bg-[#2E2E2E]
          border-layout-gray-100 dark:border-[#3A3A3A]
          ${placeBelow
            ? 'top-[-5px] border-l border-t'
            : 'bottom-[-5px] border-r border-b'}
        `}
        style={{ left: tailX - TAIL_SIZE_PX / 2 }}
      />
      <div
        ref={bodyRef}
        className="
          relative
          bg-layout-white dark:bg-[#2E2E2E]
          rounded-[12px]
          shadow-[0_4px_16px_rgba(0,0,0,0.12)]
          border border-layout-gray-100 dark:border-[#3A3A3A]
          px-[14px] py-[10px]
          min-w-[140px] max-w-[260px]
          text-left
        "
      >
        {status === 'loading' && (
          <div className="flex flex-col gap-[8px] py-[2px]" aria-label="불러오는 중">
            <div className="flex items-center gap-[6px]">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="block w-[6px] h-[6px] rounded-full bg-layout-gray-100 dark:bg-[#4A4A4A]"
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
                />
              ))}
            </div>
            <span className="block w-[120px] h-[10px] rounded-[4px] bg-layout-gray-100 dark:bg-[#4A4A4A]" />
          </div>
        )}

        {status === 'notFound' && (
          <p className="text-[13px] font-[500] text-layout-gray-300 whitespace-nowrap">사전에 없는 단어예요</p>
        )}

        {status === 'error' && (
          <p className="text-[13px] font-[500] text-layout-gray-300 whitespace-nowrap">뜻을 불러오지 못했어요</p>
        )}

        {status === 'found' && (
          <div className="flex flex-col gap-[4px]">
            <div className="flex items-center gap-[6px]">
              <span className="text-[15px] font-[700] leading-[1.3] text-layout-black dark:text-layout-white break-keep">
                {word}
              </span>
              {pronunciation && (
                <span className="text-[12px] font-[400] leading-[1.3] text-layout-gray-300 whitespace-nowrap">
                  {pronunciation}
                </span>
              )}
              <button
                type="button"
                aria-label="단어 듣기"
                className={`
                  flex items-center justify-center flex-shrink-0 ml-auto
                  w-[24px] h-[24px] -mr-[4px] rounded-full
                  transition-colors duration-150
                  ${speaking ? 'text-primary-main-600' : 'text-layout-gray-300'}
                  active:bg-layout-gray-50 dark:active:bg-[#3A3A3A]
                `}
                onClick={(e) => { e.stopPropagation(); onReplay?.(); }}
              >
                <SpeakerHigh size={16} weight="fill" />
              </button>
            </div>
            {meanings.length > 0 && (
              <p className="text-[13px] font-[500] leading-[1.45] text-layout-gray-500 dark:text-layout-gray-200 break-keep">
                {meanings.join(', ')}
              </p>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default WordInfoBubble;
