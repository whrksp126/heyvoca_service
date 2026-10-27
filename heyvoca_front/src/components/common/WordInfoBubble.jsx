import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { PlusCircle } from '@phosphor-icons/react';

import { getReading, shouldShowReading } from '../../utils/jaWord';
import { vibrate } from '../../utils/osFunction';
import { useNewBottomSheetActions, useNewBottomSheetContext } from '../../context/NewBottomSheetContext';
import PickPlotNewBottomSheet from '../newBottomSheet/PickPlotNewBottomSheet';
import { useVocabulary } from '../../context/VocabularyContext';
import { findOwnedWord } from '../../utils/ownedWord';
import { wordStage, wordHealth } from '../../utils/vocaCrop';
import { cropLabelDetail } from '../../utils/crop';
import CropImage from '../farm/CropImage';
import SpeakerArt from './SpeakerArt';

/*
  단어 사전 말풍선 — 예문 속 영어 단어를 탭하면 그 단어 아래(또는 위)에 뜬다(듀오링고 방식).

  document.body 에 포털로 그린다(2026-09-29) — 예전엔 부모 카드(relative + overflow-hidden)
  안에 절대 배치해서, 카드가 짧으면(위쪽 한국어 예문 카드 등) 말풍선 위쪽이 카드 밖으로
  못 나가고 잘렸다. 포털 + position:fixed 로 뷰포트 기준에 그리면 어떤 카드에서 열어도
  잘리지 않는다.

  위치 계산은 부모가 넘긴 anchor(탭한 단어 버튼의 **뷰포트 기준** getBoundingClientRect,
  { top, left, width, height })만으로 한다 — 카드 좌표계 변환이 필요 없다.

  배치 규칙
  1. 기본은 단어 **아래**. 아래쪽에 말풍선 자리(BUBBLE_ROOM_PX)가 없으면 **위**에 둔다.
     위쪽도 부족하면(예: 화면 맨 위 근처) 공간이 더 넓은 쪽을 쓴다 — 가장자리에서 잘리는
     대신 뒤집는다.
  2. 가로는 단어 중앙에 맞추되 화면 안쪽 EDGE_MARGIN_PX 를 남기고 clamp 한다.
  3. 꼬리(삼각형)는 말풍선이 clamp 로 밀렸어도 항상 단어 중앙을 가리킨다
     (꼬리 x 는 말풍선 안쪽으로만 clamp — 모서리 radius 를 침범하지 않게).

  말풍선 폭은 내용(min 140 / max 260)에 따라 달라서, 첫 렌더 뒤 useLayoutEffect 로 실제 폭을 재
  같은 프레임에 위치를 확정한다(첫 렌더는 추정 폭으로 그려 깜빡임이 없다).

  status: 'loading' | 'found' | 'notFound' | 'error'

  한국어 예문 카드(어절 탭 → ?from=ko&q= 역방향 조회) 용도로도 재사용한다 — 이때는 `info`
  대신 `results`(배열, 최대 3개)를 넘긴다. 결과가 여러 개일 수 있어 단일 단어 레이아웃(발음·
  TTS 버튼) 대신 "단어 + 대표 뜻 1줄" 목록을 그린다(TTS 없음 — 한국어라 발음 재생 대상이 아님).
  notFoundMessage 로 상태별 안내 문구를 바꿀 수 있다(기본은 영어 단어 조회 문구).

  '단어장에 추가'(QA #17, 2026-10-25) — 단일 단어 모드에서 사전 단어(voca_id)를 찾았으면 뜻 아래에
  버튼을 둔다. 누르면 찾기 화면과 같은 '어느 밭에 담을까' 시트(PickPlotNewBottomSheet)를 토스트 모드로
  띄워 기존 단어 추가 경로(addWord)로 새 씨앗을 심는다. 모든 문제 유형이 이 컴포넌트를 쓰므로 호출부는
  바꾸지 않는다. 말풍선(z 1200)이 시트(z 1001) 위에 뜨지 않게 바텀시트가 열려 있는 동안엔 그리지 않는다
  (시트를 누르면 호출부의 바깥 탭 규칙으로 말풍선 상태도 닫힌다). 게스트 맛보기에선 숨긴다.

  보유 표시(QA #19, 2026-10-28) — 이미 어느 단어장에든 있는 단어면 '단어장에 추가' 대신 그 단어의
  작물 그림 + 단계 이름(미학습/씨앗/새싹/이파리/당근)을 작게 보여 준다. 판단은 내 사전(userDictionary)
  으로만 한다(추가 네트워크 없음) — 사전 id 우선, 없으면 표기. word-info 의 word 가 이미 기본형이라
  temperatures 를 탭해도 temperature 로 맞춰진다. 찾기 화면의 '내 단어' 칩과 같은 그림·이름이다.
*/
const EDGE_MARGIN_PX = 12;      // 화면 좌우 여백
const TAIL_SIZE_PX = 10;        // 꼬리 한 변(회전 전 정사각형)
const TAIL_GAP_PX = 8;          // 단어와 말풍선 본체 사이 간격(꼬리 높이 ≈ 7px + 여유)
const BUBBLE_ROOM_PX = 120;     // 아래에 이만큼 없으면 위로 올린다
const MIN_WIDTH_PX = 140;
const MAX_WIDTH_PX = 260;
const ESTIMATED_WIDTH_PX = 200; // 첫 렌더 추정 폭

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

const WordInfoBubble = ({
  anchor, status, info, speaking = false, onReplay,
  results = null, notFoundMessage = '사전에 없는 단어예요',
}) => {
  const bodyRef = useRef(null);
  const [measuredWidth, setMeasuredWidth] = useState(null);
  const { stack: bottomSheetStack } = useNewBottomSheetContext();
  const { pushNewBottomSheet } = useNewBottomSheetActions();
  const isGuest = !!useLocation()?.state?.guestMode;
  const { userDictionary } = useVocabulary();

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    if (w && w !== measuredWidth) setMeasuredWidth(w);
  });

  const width = measuredWidth ?? ESTIMATED_WIDTH_PX;
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 0;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 0;
  const wordCenterX = (anchor?.left ?? 0) + (anchor?.width ?? 0) / 2;
  const wordTop = anchor?.top ?? 0;
  const wordBottom = wordTop + (anchor?.height ?? 0);

  // 1. 위/아래 — 단어 아래 남은 공간이 부족하면 위에 둔다. 위쪽도 부족하면(화면 맨 위 근처)
  //    잘리는 대신 공간이 더 넓은 쪽으로 뒤집는다.
  const spaceBelow = viewportH - wordBottom - TAIL_GAP_PX;
  const spaceAbove = wordTop - TAIL_GAP_PX;
  const placeBelow = spaceBelow >= BUBBLE_ROOM_PX || spaceBelow >= spaceAbove;

  // 2. 가로 clamp — 화면이 말풍선보다 좁으면 왼쪽 여백 기준으로 붙인다
  const maxLeft = Math.max(EDGE_MARGIN_PX, viewportW - EDGE_MARGIN_PX - width);
  const left = clamp(wordCenterX - width / 2, EDGE_MARGIN_PX, maxLeft);

  // 3. 꼬리는 항상 단어 중앙 — 말풍선 안쪽(모서리 radius 밖)으로만 clamp
  const tailX = clamp(wordCenterX - left, EDGE_MARGIN_PX + TAIL_SIZE_PX / 2, Math.max(EDGE_MARGIN_PX + TAIL_SIZE_PX / 2, width - EDGE_MARGIN_PX - TAIL_SIZE_PX / 2));

  // 위치 스타일 — position:fixed 라 뷰포트 기준 값을 그대로 쓴다(계산값이라 Tailwind 클래스로
  // 표현할 수 없어 style 로 넘긴다 — 여기만).
  const positionStyle = placeBelow
    ? { position: 'fixed', top: wordBottom + TAIL_GAP_PX, left }
    : { position: 'fixed', bottom: viewportH - wordTop + TAIL_GAP_PX, left };

  const word = info?.word ?? info?.query ?? '';
  // ja 단어는 발음 자리에 읽기(reading)를 둔다(romaji 는 표시하지 않음)
  const isJaWord = info?.language === 'ja';
  // 가나만 있는 단어(읽기 === 표기)는 읽기를 숨긴다(공용 규칙 shouldShowReading)
  const pronunciationRaw = isJaWord
    ? (shouldShowReading({ ...info, origin: word }, 'ja') ? getReading(info) : '')
    : info?.pronunciation;
  const pronunciation = pronunciationRaw ? String(pronunciationRaw).trim() : '';
  const meaningsOf = (item) => (Array.isArray(item?.meanings)
    ? item.meanings
        .map((m) => (typeof m === 'string' ? m : (m?.meaning ?? m?.text ?? '')))
        .map((m) => String(m ?? '').trim())
        .filter(Boolean)
    : []);
  const meanings = meaningsOf(info).slice(0, 3);
  // 활용형을 탭했을 때(matched_form !== base_form) — 제목은 이미 base_form(voca.word)이라
  // 그 아래 작게 "「あります」의 기본형" 같은 안내만 덧붙인다.
  const matchedForm = info?.matched_form ? String(info.matched_form).trim() : '';
  const baseForm = info?.base_form ? String(info.base_form).trim() : '';
  const showBaseFormHint = !results && matchedForm && baseForm && matchedForm !== baseForm;
  const resultList = Array.isArray(results) ? results.slice(0, 3) : [];
  const dictionaryId = info?.voca_id ?? info?.vocaId ?? null;
  const ownedWord = status === 'found' && !results && !isGuest && word
    ? findOwnedWord(Object.values(userDictionary ?? {}), info, info?.language)
    : null;
  const ownedStage = ownedWord ? wordStage(ownedWord) : null;
  const canAddToBook = status === 'found' && !results && !isGuest && dictionaryId != null && !!word && !ownedWord;

  const handleAddToBook = (e) => {
    e.stopPropagation();
    vibrate({ duration: 5 });
    pushNewBottomSheet(PickPlotNewBottomSheet, {
      origin: word,
      meanings: meaningsOf(info),
      examples: [],
      dictionaryId,
      reading: isJaWord ? (getReading(info) || null) : null,
      language: info?.language,
      resultMode: 'toast',
      enrich: true,
    });
  };

  if (typeof document === 'undefined') return null;
  if (bottomSheetStack.length > 0) return null;

  return createPortal(
    <motion.div
      role="dialog"
      aria-label="단어 뜻"
      data-word-info-bubble
      className="z-[1200] pointer-events-auto"
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
          <p className="text-[13px] font-[500] text-layout-gray-300 whitespace-nowrap">{notFoundMessage}</p>
        )}

        {status === 'error' && (
          <p className="text-[13px] font-[500] text-layout-gray-300 whitespace-nowrap">뜻을 불러오지 못했어요</p>
        )}

        {status === 'found' && results && (
          // 한국어 어절 역방향 조회 — 결과가 여러 개일 수 있어 "단어 + 대표 뜻 1줄" 목록으로 그린다.
          // TTS 버튼 없음(한국어라 발음 재생 대상이 아님).
          <div className="flex flex-col">
            {resultList.map((item, i) => (
              <div
                key={item.voca_id ?? item.vocaId ?? `${item.word}-${i}`}
                className={i > 0 ? 'mt-[6px] pt-[6px] border-t border-layout-gray-100 dark:border-[#3A3A3A]' : ''}
              >
                <span className="text-[14px] font-[700] leading-[1.3] text-layout-black dark:text-layout-white break-keep">
                  {item.word}
                </span>
                {meaningsOf(item).slice(0, 1).map((m) => (
                  <p key={m} className="text-[12px] font-[500] leading-[1.4] text-layout-gray-500 dark:text-layout-gray-200 break-keep">
                    {m}
                  </p>
                ))}
              </div>
            ))}
          </div>
        )}

        {status === 'found' && !results && (
          <div className="flex flex-col gap-[4px]">
            <div className="flex items-center gap-[6px]">
              {ownedWord && (
                <span className="flex-shrink-0" role="img" aria-label={cropLabelDetail(ownedStage)} title={cropLabelDetail(ownedStage)}>
                  <CropImage stage={ownedStage} health={wordHealth(ownedWord)} size={24} align="center" alt="" />
                </span>
              )}
              <span lang={isJaWord ? 'ja' : undefined} className="min-w-0 flex-1 text-[15px] font-[700] leading-[1.3] text-layout-black dark:text-layout-white break-keep [overflow-wrap:anywhere]">
                {word}
              </span>
              <button
                type="button"
                aria-label="단어 듣기"
                className={`
                  flex items-center justify-center flex-shrink-0
                  w-[24px] h-[24px] -mr-[4px] rounded-full
                  transition-colors duration-150
                  ${speaking ? 'text-primary-main-600' : 'text-layout-gray-300'}
                  active:bg-layout-gray-50 dark:active:bg-[#3A3A3A]
                `}
                onClick={(e) => { e.stopPropagation(); onReplay?.(); }}
              >
                <SpeakerArt size={17} playing={speaking} />
              </button>
            </div>
            {/* 발음기호 — 길면(예: 유/무성음 조건 표기) 말풍선 밖으로 새지 않도록 줄바꿈 +
                2줄에서 말줄임한다(가로 폭에 맞춰 제목 줄과 분리된 자기 줄을 쓴다). */}
            {pronunciation && pronunciation !== word && (
              <span lang={isJaWord ? 'ja' : undefined} className="block text-[12px] font-[400] leading-[1.35] text-layout-gray-300 break-words [overflow-wrap:anywhere] line-clamp-2">
                {pronunciation}
              </span>
            )}
            {showBaseFormHint && (
              <span className="text-[12px] font-[400] leading-[1.3] text-layout-gray-300 break-words [overflow-wrap:anywhere]">
                「{matchedForm}」의 기본형
              </span>
            )}
            {meanings.length > 0 && (
              <p className="text-[13px] font-[500] leading-[1.45] text-layout-gray-500 dark:text-layout-gray-200 break-keep [overflow-wrap:anywhere]">
                {meanings.join(', ')}
              </p>
            )}
            {canAddToBook && (
              <button
                type="button"
                className="
                  flex items-center gap-[4px] self-start
                  mt-[4px] -ml-[2px] px-[8px] h-[26px] rounded-full
                  bg-primary-main-100 dark:bg-[#3A3A3A]
                  text-[12px] font-[700] tracking-[-0.02em] text-primary-main-600
                  active:opacity-70
                "
                onClick={handleAddToBook}
              >
                <PlusCircle size={14} weight="bold" />
                단어장에 추가
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>,
    document.body,
  );
};

export default WordInfoBubble;
