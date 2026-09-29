// src/components/newBottomSheet/ScriptCharDetailNewBottomSheet.jsx
//
// 글자 밭(문자 학습) 격자의 칸 하나를 탭하면 뜨는 상세 시트 — 2026-09-30 개편(듀오링고 문자
// 탭 방식): 줄 단위 "이 줄 배우기"·"이미 알아요" 버튼을 없애고 글자 하나하나를 여기서
// 배우거나 연습한다. 큰 글자 + 한글 발음(가나) / 글자 이름·대표 소리(알파벳) + 스피커, 예시
// 단어(있으면), 지금까지 자란 작물 단계·XP 진행을 보여주고, 하단 버튼 하나로 세션을 연다 —
// 아직 한 번도 심지 않은 글자는 "배우기"(만나기→보고 고르기→듣고 고르기→따라 쓰기), 이미
// 심은 글자는 "연습하기"(만나기 없는 랜덤 테스트형 몇 문제, 오답 보기엔 혼동 글자 포함).
//
// 2026-09-30 재개편: 단어 상세 바텀시트(WordDetaileNewBottomSheet)와 같은 배치로 맞춘다 —
// 좌측 작물 + 큰 글자·로마자 + 우측 원형 스피커 헤더, "발음" 섹션(단어 시트 "뜻" 자리),
// "예시 단어" 카드(단어 시트 "예문" 카드 스타일), 작물 성장 트랙(GrowthPath, 단어 시트와
// 동일 컴포넌트 재사용)까지 그대로 따른다. 다만 글자는 복습일 개념이 없어(기획 2026-09-30)
// "내일 복습"·"맞히면 +N XP" 같은 복습 헤더, "이 단어가 있는 단어장"·"학습 기록"은 뺀다.
//
// 실제 세션 시작(GET /script/session 호출 + /take-test 이동)은 components/script/
// ScriptFieldBody.jsx의 startSession을 그대로 받아 쓴다 — 그래야 돌아왔을 때 진행도
// 캐시를 다시 불러오는 로직(awaitingReturnRef)을 이 시트를 거쳐도 똑같이 탄다.

import React from 'react';
import { motion } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import CropImage from '../farm/CropImage';
import GrowthPath from '../vocabularySheets/GrowthPath';
import SpeakerButton from '../common/SpeakerButton';
import { scriptTtsLang, isStarted } from '../../utils/scriptData';
import { stageToCrop, cropIndex } from '../../utils/crop';
import { xpBarPct } from '../../utils/cropXp';
import { vibrate } from '../../utils/osFunction';

/** 블록 제목 — 단어 상세 바텀시트(WordDetaileNewBottomSheet) BlockTitle과 같은 규격(13px / 800) */
const BlockTitle = ({ children }) => (
  <h5 className="mt-[16px] mb-[8px] m-0 text-[13px] font-[800] tracking-[-0.02em] text-layout-black dark:text-layout-white">
    {children}
  </h5>
);

const ScriptCharDetailNewBottomSheet = ({ script, item, onStart }) => {
  "use memo";

  const { popNewBottomSheet } = useNewBottomSheetActions();

  const isAlphabet = script === 'alphabet';
  const lang = scriptTtsLang(script);

  // 헤더 아래 로마자 줄 — 가나는 로마자 그대로, 알파벳은 대소문자 쌍 + 글자 이름(한글)
  const romanizationLine = isAlphabet
    ? [`${item.char} ${item.lower}`, item.name_hangul].filter(Boolean).join(' · ')
    : item.romaji;

  // 발음 섹션(단어 시트 "뜻" 자리) — 가나는 한글 근사 발음, 알파벳은 글자 이름 + 대표 소리
  const pronunciationLine = isAlphabet
    ? [item.name_hangul, [item.sound_hangul, item.ipa].filter(Boolean).join(' ')].filter(Boolean).join(' · ')
    : item.hangul;

  const crop = stageToCrop(item.stage);
  const started = isStarted(item);
  const xpNow = item.xp ?? 0;
  const pct = xpBarPct(item.stage, xpNow);
  const golden = crop === 'golden';
  const cur = Math.min(cropIndex(crop), 3);

  const handlePrimary = () => {
    vibrate({ duration: 5 });
    popNewBottomSheet();
    onStart?.([item], started ? 'review' : 'learn', item.char);
  };

  return (
    <div className="max-h-[90vh] overflow-y-auto overscroll-y-contain px-[20px] pt-[8px] pb-[22px]">
      <span className="block w-[38px] h-[4px] mx-auto mb-[10px] rounded-full bg-layout-gray-100 dark:bg-[#3A3A3A]" />

      {/* 헤더 — 작물 · 큰 글자 · 로마자 · 원형 스피커. 단어 시트 헤더와 같은 배치(가운데 정렬). */}
      <div className="flex items-center gap-[13px]">
        <CropImage stage={crop} health="FRESH" size={88} align="center" className="shrink-0 -my-[10px]" />
        <div className="flex-1 min-w-0">
          <div className="text-[40px] font-[800] tracking-[-0.02em] leading-[1.1] text-layout-black dark:text-layout-white">
            {isAlphabet ? `${item.char}${item.lower}` : item.char}
          </div>
          {romanizationLine && (
            <div className="mt-[3px] text-[12.5px] font-[500] text-layout-gray-300">
              {romanizationLine}
            </div>
          )}
        </div>
        <span className="flex items-center justify-center w-[36px] h-[36px] shrink-0 rounded-full bg-layout-gray-50 dark:bg-layout-gray-dark">
          <SpeakerButton text={item.speak || item.char} lang={lang} size={19} label="글자 발음 듣기" />
        </span>
      </div>

      {/* 발음 — 단어 시트 "뜻" 자리 */}
      <BlockTitle>발음</BlockTitle>
      <div className="text-[15px] font-[500] tracking-[-0.02em] leading-[1.4] text-layout-black dark:text-layout-white">
        {pronunciationLine || '발음 정보 없음'}
      </div>
      {item.note && (
        <div className="mt-[4px] text-[12px] font-[500] leading-[1.5] text-layout-gray-400 dark:text-layout-gray-300">
          {item.note}
        </div>
      )}

      {/* 예시 단어 — 단어 시트 "예문" 카드와 같은 스타일 */}
      {item.example && (
        <>
          <BlockTitle>예시 단어</BlockTitle>
          <div className="rounded-[10px] pl-[13px] pr-[9px] py-[9px] bg-layout-gray-50 dark:bg-layout-gray-dark">
            <div className="flex items-center gap-[8px]">
              <div className="flex-1 min-w-0">
                <span className="block text-[15px] font-[700] tracking-[-0.02em] text-layout-black dark:text-layout-white truncate">
                  {item.example.word}
                </span>
                {item.example.reading && (
                  <span className="block mt-[2px] text-[12px] font-[600] text-layout-gray-400">
                    {item.example.reading}
                  </span>
                )}
              </div>
              <SpeakerButton text={item.example.word} lang={lang} size={16} label="예시 단어 발음 듣기" />
            </div>
            {item.example.meaning && (
              <div className="mt-[4px] text-[12px] text-layout-gray-400 dark:text-layout-gray-300">
                {item.example.meaning}
              </div>
            )}
          </div>
        </>
      )}

      {/* 자라는 중 — 단어 시트와 같은 작물 성장 트랙(GrowthPath) 재사용. 복습 예정일 개념이
          없어 "내일 복습"·"맞히면 +N XP" 뱃지는 넣지 않는다. */}
      <BlockTitle>자라는 중</BlockTitle>
      <GrowthPath
        cur={cur}
        pct={pct}
        gain={0}
        curXp={xpNow}
        planted={started}
        rotten={false}
        golden={golden}
        health="FRESH"
      />

      <motion.button
        type="button"
        onClick={handlePrimary}
        whileTap={{ scale: 0.97 }}
        className="w-full h-[52px] mt-[18px] rounded-[12px] text-[16px] font-[700] tracking-[-0.02em] bg-primary-main-600 text-layout-white"
      >
        {started ? '연습하기' : '배우기'}
      </motion.button>
    </div>
  );
};

export default ScriptCharDetailNewBottomSheet;
