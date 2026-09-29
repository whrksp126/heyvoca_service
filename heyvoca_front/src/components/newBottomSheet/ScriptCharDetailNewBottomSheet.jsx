// src/components/newBottomSheet/ScriptCharDetailNewBottomSheet.jsx
//
// 글자 밭(문자 학습) 격자의 칸 하나를 탭하면 뜨는 상세 시트 — 2026-09-30 개편(듀오링고 문자
// 탭 방식): 줄 단위 "이 줄 배우기"·"이미 알아요" 버튼을 없애고 글자 하나하나를 여기서
// 배우거나 연습한다. 큰 글자 + 한글 발음(가나) / 글자 이름·대소문자(알파벳) + 스피커, 예시
// 단어(있으면), 지금까지 자란 작물 단계·XP 진행을 보여주고, 하단 버튼 하나로 세션을 연다 —
// 아직 한 번도 심지 않은 글자는 "배우기"(만나기→보고 고르기→듣고 고르기→따라 쓰기), 이미
// 심은 글자는 "연습하기"(만나기 없는 랜덤 테스트형 몇 문제, 오답 보기엔 혼동 글자 포함).
//
// 실제 세션 시작(GET /script/session 호출 + /take-test 이동)은 components/script/
// ScriptFieldBody.jsx의 startSession을 그대로 받아 쓴다 — 그래야 돌아왔을 때 진행도
// 캐시를 다시 불러오는 로직(awaitingReturnRef)을 이 시트를 거쳐도 똑같이 탄다.

import React from 'react';
import { motion } from 'framer-motion';
import { SpeakerHigh } from '@phosphor-icons/react';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import CropImage from '../farm/CropImage';
import SpeakerButton from '../common/SpeakerButton';
import { speakScriptText, scriptTtsLang, isStarted } from '../../utils/scriptData';
import { stageToCrop, CROP_LABEL } from '../../utils/crop';
import { xpFloor, xpNext as xpNextThresholdOf } from '../../utils/cropXp';
import { vibrate } from '../../utils/osFunction';

const ScriptCharDetailNewBottomSheet = ({ script, item, onStart }) => {
  "use memo";

  const { popNewBottomSheet } = useNewBottomSheetActions();

  const isAlphabet = script === 'alphabet';
  const lang = scriptTtsLang(script);
  const mainReading = isAlphabet ? item.name_hangul : item.hangul;
  const subReading = isAlphabet
    ? [item.sound_hangul, item.ipa].filter(Boolean).join(' ')
    : item.romaji;

  const crop = stageToCrop(item.stage);
  const stageLabel = CROP_LABEL[crop] ?? CROP_LABEL.seed;
  const xpNow = item.xp ?? 0;
  const floorXp = xpFloor(item.stage);
  const nextXp = xpNextThresholdOf(item.stage);
  const pct = nextXp == null
    ? 100
    : Math.min(100, Math.max(0, Math.round(((xpNow - floorXp) / Math.max(1, nextXp - floorXp)) * 100)));

  const started = isStarted(item);

  const handlePrimary = () => {
    vibrate({ duration: 5 });
    popNewBottomSheet();
    onStart?.([item], started ? 'review' : 'learn', item.char);
  };

  return (
    <div className="max-h-[85vh] overflow-y-auto overscroll-y-contain px-[20px] pt-[8px] pb-[22px]">
      <span className="block w-[38px] h-[4px] mx-auto mb-[14px] rounded-full bg-layout-gray-100 dark:bg-[#3A3A3A]" />

      {/* 큰 글자 + 발음 + 스피커 */}
      <div className="flex items-center gap-[14px]">
        <span className="flex-shrink-0 text-[52px] font-[800] leading-none text-layout-black dark:text-layout-white">
          {isAlphabet ? `${item.char}${item.lower}` : item.char}
        </span>
        <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
          <span className="text-[19px] font-[800] leading-[22px] text-layout-black dark:text-layout-white truncate">
            {mainReading}
          </span>
          {subReading && (
            <span className="text-[12.5px] font-[600] leading-[15px] text-layout-gray-300 truncate">
              {subReading}
            </span>
          )}
        </div>
        <SpeakerButton text={item.speak || item.char} lang={lang} size={24} className="flex-shrink-0" label="글자 발음 듣기" />
      </div>

      {/* 예시 단어 */}
      {item.example && (
        <>
          <h5 className="mt-[18px] text-[13px] font-[800] tracking-[-0.02em] text-layout-black dark:text-layout-white">
            예시 단어
          </h5>
          <div className="flex items-center justify-between gap-[10px] mt-[8px] px-[13px] py-[11px] rounded-[10px] bg-layout-gray-50 dark:bg-layout-gray-dark">
            <div className="flex flex-col gap-[2px] min-w-0">
              <span className="text-[15px] font-[700] text-layout-black dark:text-layout-white truncate">
                {item.example.word}
              </span>
              {item.example.reading && (
                <span className="text-[12px] font-[600] text-layout-gray-400">{item.example.reading}</span>
              )}
              <span className="text-[12.5px] text-layout-gray-400">{item.example.meaning}</span>
            </div>
            <button
              type="button"
              onClick={() => { vibrate({ duration: 5 }); speakScriptText(script, item.example.word); }}
              className="flex-shrink-0 flex items-center justify-center w-[34px] h-[34px] rounded-full bg-layout-white dark:bg-layout-black border border-border dark:border-border-dark text-layout-gray-300"
              aria-label="예시 단어 발음 듣기"
            >
              <SpeakerHigh size={16} weight="fill" />
            </button>
          </div>
        </>
      )}

      {/* 지금까지 자란 만큼 — 작물 단계 + XP 진행 */}
      <h5 className="mt-[18px] text-[13px] font-[800] tracking-[-0.02em] text-layout-black dark:text-layout-white">
        지금까지 자란 만큼
      </h5>
      <div className="flex items-center gap-[12px] mt-[8px]">
        <CropImage stage={item.stage} health="FRESH" size={54} align="center" className="shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-[8px]">
            <span className="text-[14px] font-[800] tracking-[-0.02em] text-layout-black dark:text-layout-white">
              {stageLabel}
            </span>
            <span className="text-[12px] font-[700] text-layout-gray-400">
              {nextXp != null ? `${xpNow} / ${nextXp} XP` : `${xpNow} XP`}
            </span>
          </div>
          <div className="mt-[7px] h-[8px] rounded-full bg-layout-gray-100 dark:bg-[#3A3A3A] overflow-hidden">
            <div className="h-full rounded-full bg-primary-main-600" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <motion.button
        type="button"
        onClick={handlePrimary}
        whileTap={{ scale: 0.97 }}
        className="w-full h-[52px] mt-[22px] rounded-[12px] text-[16px] font-[700] tracking-[-0.03em] bg-primary-main-600 text-layout-white"
      >
        {started ? '연습하기' : '배우기'}
      </motion.button>
    </div>
  );
};

export default ScriptCharDetailNewBottomSheet;
