import React from 'react';
import CropImage from '../farm/CropImage';
import {
  wordStage, wordHealth, wordDue, DUE_TONE_CLASS,
  isUnplanted, wordXp, wordXpNext, wordFarmProgressPct,
} from '../../utils/vocaCrop';
import { wordLang, isJa } from '../../utils/lang';
import { getReading, shouldShowReading } from '../../utils/jaWord';
import JlptBadge from '../common/JlptBadge';

/**
 * 단어 목록 한 줄 — 시안 vocabooks §5 + crop_xp_contract.md §3 "단어장 단어 목록".
 *   작물 아이콘 · 단어 15/700 · 뜻 12px 한 줄 말줄임(+ 그 아래 얇은 XP 게이지) · 우측 다음 복습 11.5/700
 *   행 높이 62px(XP 게이지 한 줄이 늘어나 58→62px) · 구분선 #F4F4F4
 *
 * 정답률과 학습 횟수는 넣지 않는다 — 목록에서 필요한 판단은 "지금 이걸 봐야 하나" 하나다.
 * XP 게이지는 그 판단에 쓰라는 게 아니라(그건 여전히 우측 복습일 몫이다), "얼마나
 * 자랐는지"를 한눈에 보여주는 보조 정보라 얇게(4px) 둔다. 미심은 씨앗(보유 씨앗)은
 * 심지도 않았으니 게이지 자체를 그리지 않는다 — 0/50 을 그리면 이미 심긴 것처럼 읽힌다.
 */
const WordRow = ({ word, onClick }) => {
  "use memo";

  // 봉투(보유 씨앗)와 흙에 묻힌 씨앗(심은 씨앗)을 가르려면 visual_stage 가 필요하다
  const stage = wordStage(word);
  const health = wordHealth(word);
  const due = wordDue(word);
  const meaning = Array.isArray(word?.meanings) ? word.meanings.join(', ') : '';
  const ja = isJa(wordLang(word));
  const showReading = shouldShowReading(word);

  const unplanted = isUnplanted(word);
  const xp = unplanted ? null : wordXp(word);
  const xpNextThreshold = unplanted ? null : wordXpNext(word);
  const xpPct = unplanted ? 0 : wordFarmProgressPct(word);

  return (
    <button
      type="button"
      onClick={onClick}
      className="
        flex items-center gap-[11px] w-full h-[62px] shrink-0
        text-left
        border-b border-[#F4F4F4] dark:border-layout-gray-dark
      "
    >
      <CropImage stage={stage} health={health} size={52} align="center" className="shrink-0" />

      <span className="flex-1 min-w-0">
        {/* 검증 인장은 여기 두지 않는다.
            목록은 "지금 이걸 봐야 하나"에 답하는 자리인데, 사전 연결 여부는 그 판단을
            바꾸지 않는다. 게다가 대부분의 단어가 검증돼 있어 파란 점이 모든 줄에 찍히면
            정작 눈에 걸려야 할 것(작물 상태·지난 날짜)을 가린다. 상세 시트에만 둔다. */}
        <span className="flex items-center gap-[5px]">
          <span lang={ja ? 'ja' : undefined} className="min-w-0 truncate text-[15px] font-[700] tracking-[-0.02em] text-layout-black dark:text-layout-white">
            {word?.origin}
          </span>
          {/* ja 단어는 표기 옆에 작은 읽기(히라가나) — 표기가 가나뿐이면 같은 글자라 생략 */}
          {showReading && (
            <span lang="ja" className="shrink-0 truncate text-[10.5px] font-[500] text-layout-gray-300">
              {getReading(word)}
            </span>
          )}
          {ja && <JlptBadge level={word?.jlpt} size="sm" />}
        </span>
        <span className="block mt-[1px] truncate text-[12px] tracking-[-0.02em] text-layout-gray-400 dark:text-layout-gray-300">
          {meaning}
        </span>
        {!unplanted && (
          <span className="flex items-center gap-[6px] mt-[4px]">
            <span className="relative flex-1 h-[4px] rounded-[99px] bg-[#E8E8E8] dark:bg-[#454545] overflow-hidden">
              <i
                className="absolute left-0 top-0 h-full rounded-[99px] bg-primary-main-600 block"
                style={{ width: `${xpPct}%` }}
              />
            </span>
            <span className="shrink-0 text-[10px] font-[700] tracking-[-0.02em] text-layout-gray-300 dark:text-layout-gray-200 tabular-nums whitespace-nowrap">
              {xp}{xpNextThreshold != null ? `/${xpNextThreshold}` : ''}
            </span>
          </span>
        )}
      </span>

      <span className={`shrink-0 text-right text-[11.5px] font-[700] ${DUE_TONE_CLASS[due.tone]}`}>
        {due.text}
      </span>
    </button>
  );
};

export default WordRow;
