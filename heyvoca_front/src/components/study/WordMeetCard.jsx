import React from 'react';
import { motion } from 'framer-motion';
import { SpeakerHigh } from '@phosphor-icons/react';
import CropImage from '../farm/CropImage';
import TtsRipple from '../common/TtsRipple';
import ReadingLine from '../common/ReadingLine';
import FuriganaText from '../common/FuriganaText';
import { wordLang, isJa } from '../../utils/lang';
import { getReading, shouldShowReading } from '../../utils/jaWord';
import { renderHighlightedText, stripTags } from '../../plugins/questionTypes/highlightMarker';

/*
  단어 "만나기" 카드 — StudyMain(집중 반복 듣기)과 TakeTest의 ① wordIntro 슬라이드가
  같이 쓰는 공용 렌더러(2026-09-29). 재생 상태(playingItemId/Index/Duration)와 스피커
  클릭 핸들러는 호출부가 각자 관리해서 넘긴다 — 이 컴포넌트는 순수 표시 전담이다.

  isVisible/onReveal은 StudyMain의 "숨김 설정"(StudySettingsNewBottomSheet)을 위한 것으로,
  넘기지 않으면 항상 전부 보이는 것으로 취급한다(wordIntro 슬라이드는 이 기능이 없다).
*/

// 예문의 강조 마커(<strong class="target-word">)를 굵게 그리고 태그는 숨긴다.
const HighlightedExample = ({ html }) => {
  const parts = renderHighlightedText(html);
  if (!parts) return null;
  return parts.map((p) => (p.hl ? <b key={p.key} className="font-[800]">{p.text}</b> : <span key={p.key}>{p.text}</span>));
};

// 백엔드 voca_meaning.pos(UD 품사 태그) → 한국어 접두 라벨.
const POS_LABEL_KO = {
  NOUN: '명사', VERB: '동사', ADJ: '형용사', ADV: '부사', PRON: '대명사',
  DET: '한정사', ADP: '전치사', CCONJ: '접속사', SCONJ: '접속사', NUM: '수사',
  INTJ: '감탄사', PART: '불변화사', AUX: '조동사', PROPN: '고유명사', X: '기타',
};

// meanings 항목이 문자열이든 `{ meaning, pos }` 객체든 같은 모양으로 뽑아낸다.
const meaningParts = (item) => {
  if (item && typeof item === 'object') {
    const pos = item.pos ? (POS_LABEL_KO[item.pos] || item.pos) : null;
    return { text: item.meaning ?? item.text ?? '', pos };
  }
  return { text: item ?? '', pos: null };
};

// 스피커 버튼 — 재생 중일 때만 TtsRipple(실제 재생 길이에 맞춘 파동) + 아이콘 펄스.
export const SpeakerButton = ({ active, duration, reducedMotion, onClick, size = 16, className = '' }) => (
  <span className={`relative z-[1] flex-shrink-0 flex items-center justify-center ${className}`}>
    {active && !reducedMotion && (
      <TtsRipple size={size * 2.6} duration={duration} className="z-[0]" />
    )}
    <motion.button
      onClick={onClick}
      className="relative z-[1] py-[3px]"
      whileTap={{ scale: 0.85 }}
      animate={active && !reducedMotion ? { scale: [1, 1.15, 1] } : { scale: 1 }}
      transition={active && !reducedMotion ? { duration: 0.6, repeat: Infinity, ease: 'easeInOut' } : {}}
    >
      <SpeakerHigh weight="fill" color={active ? 'var(--primary-main-600)' : 'var(--layout-gray-200)'} size={size} />
    </motion.button>
  </span>
);

// 숨겨진 콘텐츠 placeholder 컴포넌트
const HiddenPlaceholder = ({ onReveal, label, small = false }) => (
  <motion.button
    onClick={onReveal}
    className={`
      w-full flex items-center justify-center
      ${small ? 'py-[8px]' : 'py-[12px]'}
      rounded-[8px] border border-dashed border-layout-gray-300
      text-layout-gray-400 ${small ? 'text-[12px]' : 'text-[13px]'} font-[400]
    `}
    whileTap={{ scale: 0.97 }}
  >
    클릭해서 {label} 확인하기
  </motion.button>
);

const defaultIsVisible = () => true;
const defaultOnReveal = () => {};

const WordMeetCard = ({
  word,
  playingItemId,
  playingItemIndex,
  playDuration,
  reducedMotion,
  onSpeakerClick,
  isVisible = defaultIsVisible,
  onReveal = defaultOnReveal,
  showCrop = true,
}) => {
  if (!word) return null;

  const meanings = word.meanings || [];
  const examples = word.examples || [];

  const isPlayingLine = (itemId, index = null) =>
    playingItemId === itemId && playingItemIndex === index;

  return (
    <div className="p-[20px] flex flex-col gap-[22px]">
      {showCrop && (
        <CropImage stage={word.farm?.stage || 'UNPLANTED_SEED'} health={word.farm?.health} size={30} align="center" />
      )}

      <div className="flex flex-col gap-[12px]">
        <div>
          {/* 단어 */}
          {isVisible('word') ? (
            <div className={`flex items-start justify-between gap-[5px] ${playingItemId === 'word' ? 'text-primary-main-600' : ''}`}>
              <div className="flex-1 min-w-0">
                <span lang={isJa(wordLang(word)) ? 'ja' : undefined} className={`block text-[24px] font-[700] leading-[29px] ${playingItemId === 'word' ? 'text-primary-main-600' : 'text-layout-black dark:text-layout-white'}`}>
                  {word.origin}
                </span>
                {isJa(wordLang(word)) ? (
                  shouldShowReading(word) && <ReadingLine reading={getReading(word)} className="block mt-[2px] dark:text-layout-gray-200" />
                ) : word.pronunciation && (
                  <span className="block mt-[2px] text-[12px] font-[500] text-layout-gray-300 dark:text-layout-gray-200">
                    /{word.pronunciation}/
                  </span>
                )}
              </div>
              <SpeakerButton
                active={isPlayingLine('word')}
                duration={playDuration}
                reducedMotion={reducedMotion}
                onClick={() => onSpeakerClick('word', null, word.origin, wordLang(word))}
                className="mt-[3px]"
              />
            </div>
          ) : (
            <HiddenPlaceholder onReveal={() => onReveal('word')} label="단어" />
          )}
        </div>
        {/* 의미 */}
        {isVisible('meanings') ? (
          <div className="flex flex-col gap-[4px]">
            {meanings.map((meaningItem, idx) => {
              const { text: meaningText, pos: meaningPos } = meaningParts(meaningItem);
              const isActive = isPlayingLine('meanings', idx);
              return (
                <div key={idx} className="flex items-center justify-between gap-[8px]">
                  <span className={`text-[13px] font-[400] leading-[16px] flex-1 ${isActive ? 'text-primary-main-600' : 'text-layout-gray-500 dark:text-layout-gray-50'}`}>
                    {meaningPos && (
                      <span className="text-layout-gray-300 dark:text-layout-gray-400 font-[500] mr-[4px]">
                        {meaningPos}
                      </span>
                    )}
                    {meaningText}
                  </span>
                  <SpeakerButton
                    active={isActive}
                    duration={playDuration}
                    reducedMotion={reducedMotion}
                    onClick={() => onSpeakerClick('meanings', idx, meaningText, 'ko')}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <HiddenPlaceholder onReveal={() => onReveal('meanings')} label="의미" />
        )}
      </div>
      {/* 예문 — 원문/뜻 텍스트가 하나도 없는 단어는 섹션 자체를 숨긴다 */}
      {examples.length > 0 && examples.some(ex => (ex.origin || ex.sentence) || (ex.meaning || ex.translation)) && (
        <div className="flex flex-col gap-[8px]">
          <p className="text-[14px] font-[700] text-layout-black dark:text-layout-white">
            예문
          </p>
          {examples.map((example, idx) => {
            const exOrigin = example.origin || example.sentence || '';
            const exMeaning = example.meaning || example.translation || '';
            if (!exOrigin && !exMeaning) return null;
            const isOriginActive = isPlayingLine('exampleSentences', idx);
            const isMeaningActive = isPlayingLine('exampleMeanings', idx);
            return (
              <div key={idx} className="flex flex-col gap-[10px]">
                {/* 예문 원문 — 텍스트가 있을 때만 스피커 포함 렌더 */}
                {exOrigin && (
                  isVisible('exampleSentences') ? (
                    <div className="flex items-start justify-between gap-[5px]">
                      {isJa(wordLang(word)) ? (
                        <FuriganaText
                          html={exOrigin}
                          readingTokens={example.reading_tokens}
                          lang="ja"
                          className={`text-[14px] font-[400] flex-1 ${isOriginActive ? 'text-primary-main-600' : 'text-layout-black dark:text-layout-white'}`}
                        />
                      ) : (
                        <span className={`text-[14px] font-[400] flex-1 ${isOriginActive ? 'text-primary-main-600' : 'text-layout-black dark:text-layout-white'}`}>
                          <HighlightedExample html={exOrigin} />
                        </span>
                      )}
                      <SpeakerButton
                        active={isOriginActive}
                        duration={playDuration}
                        reducedMotion={reducedMotion}
                        onClick={() => onSpeakerClick('exampleSentences', idx, stripTags(exOrigin), wordLang(word))}
                        className="mt-[2px]"
                      />
                    </div>
                  ) : (
                    <HiddenPlaceholder onReveal={() => onReveal('exampleSentences')} label="예문 문장" small />
                  )
                )}

                {/* 예문 의미 — 텍스트가 있을 때만 스피커 포함 렌더 */}
                {exMeaning && (
                  isVisible('exampleMeanings') ? (
                    <div className="flex items-start justify-between gap-[8px]">
                      <span className={`text-[13px] font-[400] flex-1 ${isMeaningActive ? 'text-primary-main-600' : 'text-layout-gray-500 dark:text-layout-gray-50'}`}>
                        <HighlightedExample html={exMeaning} />
                      </span>
                      <SpeakerButton
                        active={isMeaningActive}
                        duration={playDuration}
                        reducedMotion={reducedMotion}
                        onClick={() => onSpeakerClick('exampleMeanings', idx, stripTags(exMeaning), 'ko')}
                        className="mt-[2px]"
                      />
                    </div>
                  ) : (
                    <HiddenPlaceholder onReveal={() => onReveal('exampleMeanings')} label="예문 뜻" small />
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default WordMeetCard;
