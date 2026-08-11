import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { PencilSimple, Trash, Timer, WarningCircle } from '@phosphor-icons/react';

import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useVocabulary } from '../../context/VocabularyContext';
import { stripHtmlTags } from '../../utils/common';
import { useWordInsights, WordMemoryHistory } from '../common/WordMemorySection';
import SpeakerButton from '../common/SpeakerButton';
import DeleteWordNewBottomSheet from './DeleteWordNewBottomSheet';
import AddWordNewBottomSheet from './AddWordNewBottomSheet';
import ReplantConfirmNewBottomSheet from './ReplantConfirmNewBottomSheet';
import RecoverConfirmNewBottomSheet from './RecoverConfirmNewBottomSheet';
import StoreNewFullSheet from '../newfullsheet/StoreNewFullSheet';
import CropImage, { CROP_ASSETS } from '../farm/CropImage';
import GrowthPath from '../vocabularySheets/GrowthPath';
import VerifyMark from '../vocabularySheets/VerifyMark';
import { vibrate, showToast } from '../../utils/osFunction';
import { getFarmItemsApi, replantApi, recoverPlantsApi } from '../../api/farm';
import { addPendingReplantIds } from '../../utils/replantPending';
import { CROP_LABEL, stageDetail } from '../../utils/crop';
import {
  wordCropStage,
  wordStage,
  wordHealth,
  wordVerification,
  daysToReview,
  isUnplanted,
  isRotten,
} from '../../utils/vocaCrop';

/**
 * 받침 유무에 따른 조사 — "이파리으로 성장"이 되지 않게 한다.
 * 시안 문구는 "맞히면 당근으로 성장"이고, 단계 이름 네 개 중 이파리만 받침이 없다.
 */
const withRo = (noun) => {
  const last = String(noun ?? '').slice(-1);
  const code = last.charCodeAt(0);
  const hasJong = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
  return `${noun}${hasJong ? '으로' : '로'}`;
};

/** 백엔드 memory state → 성장 경로 index (시안 §2 이름 대응) */
const STATE_INDEX = { unlearned: 0, short: 1, medium: 2, long: 3 };
const CROP_INDEX = { seed: 0, sprout: 1, leaf: 2, carrot: 3, golden: 3 };

/** 블록 제목 — 시안 `.blk h5` (13px / 800) */
const BlockTitle = ({ children, right }) => (
  <div className="flex items-center mt-[16px]">
    <h5 className="flex-1 m-0 text-[13px] font-[800] tracking-[-0.02em] text-layout-black dark:text-layout-white">
      {children}
    </h5>
    {right}
  </div>
);

/**
 * 단어 상세 바텀시트 — 시안 vocabooks §1③④⑤ · §6 · §7.
 *
 * 시트는 위에서 아래로 사실 → 상태 → 행동 순서다.
 * "지금 물주기"는 없다 — 물주기는 학습 세션이고 세션은 단어 하나로 성립하지 않는다.
 * 학습 시작은 단어장 화면의 "이 단어장 물주기" 하나로 모은다.
 */
const WordDetaileNewBottomSheet = ({ vocabularyId, id }) => {
  "use memo";

  const { getWord, getVocabularySheet, vocabularySheets, fetchUserDictionary } = useVocabulary();
  const { pushAwaitNewBottomSheet, popNewBottomSheet } = useNewBottomSheetActions();
  const { pushNewFullSheet } = useNewFullSheetActions();

  const word = getWord(vocabularyId, id);
  const vocabularySheet = typeof getVocabularySheet === 'function' ? getVocabularySheet(vocabularyId) : null;
  const isPurchasedBook = vocabularySheet?.vocaBookStoreId != null;

  const userVocaId = word?.vocaIndexId ?? id;
  const insights = useWordInsights(userVocaId);

  const rotten = word ? isRotten(word) : false;
  const verification = wordVerification(word);
  const unverified = verification === 'unverified';
  // 검증된 단어는 헤이보카 사전의 표제어라 한 사람이 고치면 다른 단어장과 어긋난다 (시안 §6)
  const canEdit = !isPurchasedBook && verification !== 'verified';

  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!rotten) return;
    let cancelled = false;
    (async () => {
      const res = await getFarmItemsApi();
      if (!cancelled && res?.code === 200) setItems(res?.data?.items || null);
    })();
    return () => { cancelled = true; };
  }, [rotten]);

  useEffect(() => {
    if (!word) popNewBottomSheet();
  }, [word, popNewBottomSheet]);

  // 이 단어가 있는 단어장 — 기획 7.4, 한 단어가 여러 밭에 있을 수 있다
  const belongs = useMemo(() => {
    const ids = (word?.vocaBooks || []).map((vb) => String(vb.vocaBookId));
    if (ids.length === 0 && vocabularySheet) return [vocabularySheet.title];
    return ids
      .map((bookId) => vocabularySheets.find((sheet) => String(sheet.id) === bookId)?.title)
      .filter(Boolean);
  }, [word, vocabularySheets, vocabularySheet]);

  if (!word) return null;

  const stage = wordCropStage(word);
  const health = wordHealth(word);
  const planted = !isUnplanted(word);
  // 기획 5.1 의 여섯 단계 — 보유 씨앗과 심은 씨앗을 이름으로 갈라 준다.
  // 시트 맨 위 그림은 둘이 같아서(에셋이 하나뿐이라) 글자가 없으면 구분이 안 된다.
  const detailStage = wordStage(word);
  const golden = stageDetail(detailStage) === 'golden';

  /*
    성장 경로가 가리킬 단계.

    **농장의 visual_stage 를 먼저 본다.** 예전에는 `/insights` 의 FSRS 구간
    (unlearned/short/medium/long)을 먼저 봤는데, 그 둘은 같은 값이 아니다 —
    성장 단계는 오답으로 내려가지 않고 최고 도달 단계가 보존되며(기획 5.2),
    새싹 승급에는 "첫 예정 복습 이후의 독립 정답"이라는 별도 조건이 붙는다(기획 5.1).
    그래서 같은 단어가 목록·밭에서는 당근인데 이 시트에서만 새싹으로 보이는 일이 있었다.
    FSRS 구간은 농장 정보가 없는 구버전 응답의 폴백으로만 남긴다.
  */
  const cur = word?.farm?.stage
    ? (CROP_INDEX[stage] ?? 0)
    : (STATE_INDEX[insights?.memory?.state] ?? CROP_INDEX[stage] ?? 0);
  const pct = Math.round((insights?.next_stage?.progress ?? 0) * 100);
  const onCorrect = insights?.next_stage?.on_correct ?? null;
  const gain = Math.round((onCorrect?.gain ?? 0) * 100);
  const promotes = Boolean(onCorrect?.promotes);

  const days = daysToReview(word);
  const reviewText = !planted
    ? '아직 심지 않았어요'
    : days === null
      ? '복습 예정이 없어요'
      : days < 0
        ? `${Math.abs(days)}일 지남`
        : days === 0
          ? '오늘 복습'
          : days === 1
            ? '내일 복습'
            : `${days}일 뒤 복습`;

  const growthBadge = !planted || rotten
    ? null
    : promotes
      ? `맞히면 ${withRo(CROP_LABEL[['seed', 'sprout', 'leaf', 'carrot'][Math.min(3, cur + 1)]])} 성장`
      : gain >= 1
        ? `맞히면 +${gain}%`
        : null;

  const meanings = Array.isArray(word.meanings) ? word.meanings : [];
  const examples = Array.isArray(word.examples) ? word.examples : [];

  const handleEdit = async () => {
    vibrate({ duration: 5 });
    const editResult = await pushAwaitNewBottomSheet(
      AddWordNewBottomSheet,
      { vocabularyId, dictionaryId: word.dictionaryId, id },
      { hideUnderlying: true },
    );
    if (editResult?.cancelled) return;
    popNewBottomSheet();
  };

  const handleDelete = async () => {
    vibrate({ duration: 5 });
    const deleteResult = await pushAwaitNewBottomSheet(
      DeleteWordNewBottomSheet,
      { vocabularyId, id },
      { hideUnderlying: true },
    );
    if (deleteResult?.cancelled) return;
    popNewBottomSheet();
  };

  const openShop = () => {
    vibrate({ duration: 5 });
    pushNewFullSheet(StoreNewFullSheet, { initialTab: 'items' }, {
      smFull: true,
      closeOnBackdropClick: true,
    });
  };

  const handleReplant = async () => {
    vibrate({ duration: 5 });
    if (busy) return;
    const answer = await pushAwaitNewBottomSheet(
      ReplantConfirmNewBottomSheet,
      { count: 1, shovelCnt: items?.SHOVEL ?? 0 },
      { isBackdropClickClosable: true, isDragToCloseEnabled: true },
    );
    if (answer?.action === 'shop') return openShop();
    if (answer?.action !== 'confirm') return;

    setBusy(true);
    const res = await replantApi([userVocaId]);
    setBusy(false);
    if (res?.code === 200) {
      setItems((prev) => ({ ...prev, SHOVEL: res?.data?.shovel_left ?? Math.max(0, (prev?.SHOVEL ?? 1) - 1) }));
      // 학습 시안 §6 — 다시 심기를 예약한 단어는 다음 학습에서 "다시 심기 진단"으로 그린다.
      // 서버가 진단 표시를 내려주지 않아 예약 id 를 기기에 적어 둔다(utils/replantPending 참조).
      // RottenListSheet(돌볼 작물 목록)와 **같은 처리**여야 한다 — 여기서 빠뜨리면
      // 바로 아래 안내문("진단 문제로 만나요")이 지켜지지 않는다.
      addPendingReplantIds(res?.data?.reserved || [userVocaId]);
      setNotice('다시 심었어요. 오늘 학습에서 진단 문제로 만나요.');
      fetchUserDictionary?.();
    } else {
      setNotice(res?.message || '잠시 뒤 다시 시도해 주세요.');
    }
  };

  const handleRecover = async () => {
    vibrate({ duration: 5 });
    if (busy) return;
    const answer = await pushAwaitNewBottomSheet(
      RecoverConfirmNewBottomSheet,
      { count: 1, nutrientCnt: items?.NUTRIENT ?? 0 },
      { isBackdropClickClosable: true, isDragToCloseEnabled: true },
    );
    if (answer?.action === 'shop') return openShop();
    if (answer?.action !== 'confirm') return;

    setBusy(true);
    const res = await recoverPlantsApi([userVocaId]);
    setBusy(false);
    if (res?.code === 200) {
      setItems((prev) => ({ ...prev, NUTRIENT: res?.data?.nutrient_left ?? Math.max(0, (prev?.NUTRIENT ?? 1) - 1) }));
      setNotice('작물이 다시 자라기 시작했어요.');
      fetchUserDictionary?.();
    } else {
      setNotice(res?.message || '잠시 뒤 다시 시도해 주세요.');
    }
  };

  const handleLink = () => {
    vibrate({ duration: 5 });
    if (!canEdit) {
      showToast('이 단어는 수정할 수 없어요.');
      return;
    }
    handleEdit();
  };

  const shovelCnt = items?.SHOVEL ?? 0;
  const nutrientCnt = items?.NUTRIENT ?? 0;

  return (
    <div className="max-h-[90vh] overflow-y-auto px-[20px] pt-[8px] pb-[22px]">
      <span className="block w-[38px] h-[4px] mx-auto mb-[10px] rounded-full bg-layout-gray-100 dark:bg-[#3A3A3A]" />

      {/*
        도구 줄 — 고칠 수 있는 단어에만 편집·삭제를 둔다.

        고칠 수 없는 단어에 "사전 단어 · 수정 불가" 칩을 띄우던 것은 내렸다.
        할 수 없는 일을 굳이 이름 붙여 알리는 자리였고, 시트에서 가장 눈에 띄는 위치를
        차지했다. 버튼이 없는 것 자체가 이미 "여기서는 못 고친다"는 답이다.
        (검증된 단어라는 사실은 단어 옆 파란 인장이 말한다.)
      */}
      {canEdit && (
        <div className="flex items-center justify-end gap-[4px] h-[26px] mb-[2px]">
          <motion.button
            type="button"
            onClick={handleEdit}
            whileTap={{ scale: 0.9 }}
            className="flex items-center justify-center w-[28px] h-[28px] rounded-[8px]"
            aria-label="단어 수정"
          >
            <PencilSimple size={17} className="text-layout-gray-400 dark:text-layout-gray-200" />
          </motion.button>
          <motion.button
            type="button"
            onClick={handleDelete}
            whileTap={{ scale: 0.9 }}
            className="flex items-center justify-center w-[28px] h-[28px] rounded-[8px]"
            aria-label="단어 삭제"
          >
            <Trash size={17} className="text-layout-gray-400 dark:text-layout-gray-200" />
          </motion.button>
        </div>
      )}

      {/* 헤더 — 작물 · 단어 24px · 발음기호 · 검증 마크 · 36px 스피커.
          가운데 정렬이다. 작물 그림은 512 상자 안에서 세로 가운데에 놓여 있어
          위 정렬로 두면 씨앗처럼 작은 단계가 상자 한가운데(=글자보다 한참 아래)에
          떨어져 단어와 따로 노는 것처럼 보인다. */}
      <div className="flex items-center gap-[13px]">
        <CropImage stage={detailStage} health={health} size={88} className="shrink-0 -my-[10px]" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-[6px] text-[24px] font-[800] tracking-[-0.04em] leading-[1.15] text-layout-black dark:text-layout-white">
            <span className="min-w-0 break-words">{word.origin}</span>
            <VerifyMark word={word} size={17} badgeClassName="text-[11px]" />
          </div>
          {(word.pronunciation || unverified) && (
            <div className="mt-[3px] text-[12.5px] font-[500] text-layout-gray-300">
              {word.pronunciation || '발음 정보 없음'}
            </div>
          )}
          {/* 단계·건강을 글자로 적던 줄은 내렸다.
              새 작물 세트가 그 둘을 그림 하나로 이미 말한다 — 봉투인지 흙 구멍인지가
              보유/심은 씨앗이고, 잎이 처졌는지 갈변했는지가 건강이다.
              옆에 "심은 씨앗 · 많이 시들었어요"를 덧붙이면 같은 말이 두 번이 된다. */}
        </div>
        <span className="flex items-center justify-center w-[36px] h-[36px] shrink-0 rounded-full bg-layout-gray-50 dark:bg-layout-gray-dark">
          <SpeakerButton text={word.origin} lang="en" size={19} label="단어 발음 듣기" />
        </span>
      </div>

      {/* 썩은 작물 — 잃은 것이 아니라 남은 것을 먼저 보여준다 (시안 §7) */}
      {rotten && (
        <div className="
          flex gap-[9px] mt-[14px] px-[13px] py-[12px] rounded-[10px]
          bg-layout-gray-50 dark:bg-layout-gray-dark
          text-[12.5px] leading-[1.65] tracking-[-0.02em]
          text-layout-gray-500 dark:text-layout-gray-200
        ">
          <WarningCircle size={15} weight="fill" className="shrink-0 mt-[1px] text-layout-gray-400" />
          <div>
            <b className="font-[700] text-layout-gray-500 dark:text-layout-white">
              썩은 작물이에요. 오늘의 농장에서 빠져 있어요.
            </b>
            <br />
            <b className="font-[700] text-layout-gray-500 dark:text-layout-white">{CROP_LABEL[stage]}</b>
            까지 자랐던 기록과 학습 이력은 그대로 남아 있어요.
          </div>
        </div>
      )}

      {/* 뜻 — 품사 배지는 사전에서 온 검증된 정보라는 표시다 */}
      {!rotten && (
        <>
          <BlockTitle
            right={meanings.length > 0 && (
              <SpeakerButton text={meanings.join(', ')} lang="ko" size={17} label="의미 듣기" />
            )}
          >
            뜻
          </BlockTitle>
          <div className="flex flex-col gap-[5px] mt-[8px]">
            {meanings.map((meaning, index) => (
              <div
                key={index}
                className="flex gap-[7px] text-[15px] font-[500] tracking-[-0.02em] leading-[1.4] text-layout-black dark:text-layout-white"
              >
                <span className="shrink-0 font-[700] text-layout-gray-200">{index + 1}</span>
                <span className="min-w-0 break-words">{meaning}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 미검증 — 막지 않는다. 대신 대가를 정확히 알려 준다 (시안 §3) */}
      {unverified && (
        <div className="
          mt-[14px] px-[13px] py-[12px] rounded-[10px]
          bg-secondary-yellow-100 dark:bg-secondary-yellow-dark
          text-[12.5px] leading-[1.65] tracking-[-0.02em] text-[#7A4A12] dark:text-secondary-yellow-300
        ">
          <b className="font-[700] text-[#B54708] dark:text-secondary-yellow-400">
            헤이보카 사전에 연결되지 않았어요.
          </b>
          <br />
          다른 단어장에 같은 단어가 있어도{' '}
          <b className="font-[700] text-[#B54708] dark:text-secondary-yellow-400">따로 자랍니다.</b>{' '}
          발음·예문·품사 정보도 쓸 수 없어요.
        </div>
      )}

      {/* 예문 — 기존 예문 강조 태깅을 그대로 쓴다 */}
      {!rotten && examples.length > 0 && (
        <>
          <BlockTitle>예문</BlockTitle>
          <div className="
            mt-[8px] rounded-[10px] pl-[13px] pr-[9px] py-[9px]
            bg-layout-gray-50 dark:bg-layout-gray-dark
            text-[13px] leading-[1.5] tracking-[-0.02em]
            [&_b]:text-primary-main-600 [&_strong]:text-primary-main-600 [&_.target-word]:text-primary-main-600
          ">
            {examples.map((example, index) => {
              const origin = example?.origin ?? example?.en ?? '';
              const meaning = example?.meaning ?? example?.ko ?? '';
              const originText = stripHtmlTags(origin).trim();
              if (!originText) return null;
              return (
                <div key={`${id}-${index}`} className={index > 0 ? 'mt-[8px]' : ''}>
                  <div className="flex items-center gap-[8px]">
                    <span
                      className="flex-1 min-w-0 text-layout-black dark:text-layout-white"
                      dangerouslySetInnerHTML={{ __html: origin }}
                    />
                    <SpeakerButton text={originText} lang="en" size={16} label="예문 발음 듣기" />
                  </div>
                  {meaning && (
                    <div className="flex items-center gap-[8px] mt-[4px]">
                      <span
                        className="flex-1 min-w-0 text-[12px] text-layout-gray-400 dark:text-layout-gray-300"
                        dangerouslySetInnerHTML={{ __html: meaning }}
                      />
                      <SpeakerButton text={stripHtmlTags(meaning)} lang="ko" size={16} label="예문 의미 듣기" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* 복습 예정 — 언제 하고, 하면 무엇이 되는지. 썩은 작물은 예정이 없어 빼낸다 */}
      {!rotten && (
        <div className="flex items-center gap-[8px] mt-[18px]">
          <span className={`
            flex items-center justify-center w-[22px] h-[22px] shrink-0 rounded-full
            ${planted ? 'bg-primary-main-100 dark:bg-primary-main-dark' : 'bg-layout-gray-50 dark:bg-layout-gray-dark'}
          `}>
            <Timer size={11} weight="fill" className={planted ? 'text-primary-main-600' : 'text-layout-gray-200'} />
          </span>
          <span className={`
            flex-1 text-[14px] font-[700] tracking-[-0.02em]
            ${planted ? 'text-layout-black dark:text-layout-white' : 'text-layout-gray-300'}
          `}>
            {reviewText}
          </span>
          {growthBadge && (
            <span className="
              px-[9px] py-[4px] rounded-full
              text-[11.5px] font-[800] tracking-[-0.02em]
              text-status-success-600 bg-status-success-100 dark:bg-status-success-dark
            ">
              {growthBadge}
            </span>
          )}
        </div>
      )}

      {/* 성장 경로 — 호리병 대신 심긴 작물 */}
      {rotten && <BlockTitle>지금까지 자란 만큼</BlockTitle>}
      <GrowthPath
        cur={cur}
        pct={rotten ? 100 : pct}
        gain={rotten ? 0 : gain}
        planted={planted}
        rotten={rotten}
        golden={golden}
      />

      {/* 이 단어가 있는 단어장 — 기록이 아니라 이 단어가 무엇인지에 관한 사실이다 */}
      {!rotten && belongs.length > 0 && (
        <>
          <BlockTitle>이 단어가 있는 단어장</BlockTitle>
          <div className="flex flex-wrap items-center gap-[6px] mt-[8px]">
            {belongs.map((title) => (
              <span
                key={title}
                className="
                  px-[9px] py-[4px] rounded-full
                  text-[11.5px] font-[700]
                  text-layout-gray-500 dark:text-layout-gray-100
                  bg-layout-gray-50 dark:bg-layout-gray-dark
                "
              >
                {title}
              </span>
            ))}
          </div>
        </>
      )}

      {/* 학습 기록 — 기존 WordMemoryHistory 구조 그대로 */}
      {(insights?.total_count ?? 0) > 0 && (
        <>
          <BlockTitle
            right={rotten && (
              <span className="
                px-[8px] py-[3px] rounded-full
                text-[11px] font-[800]
                text-status-success-600 bg-status-success-100 dark:bg-status-success-dark
              ">
                누적 {insights.total_count}회
              </span>
            )}
          >
            학습 기록
          </BlockTitle>
          <WordMemoryHistory insights={insights} userVocaId={userVocaId} />
        </>
      )}

      {/* 미검증 — 연결은 한 번의 탭으로 */}
      {unverified && !rotten && (
        <div className="flex gap-[8px] mt-[16px]">
          <motion.button
            type="button"
            onClick={handleLink}
            whileTap={{ scale: 0.98 }}
            className="
              flex-1 flex items-center justify-center h-[52px] rounded-[12px]
              text-[16px] font-[700] tracking-[-0.02em] text-layout-white
              bg-[linear-gradient(180deg,#FD853A_0%,#FB6514_100%)]
              shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_8px_20px_rgba(251,101,20,0.34)]
            "
          >
            사전에서 찾아 연결
          </motion.button>
        </div>
      )}

      {/* 다시 살리기 — 버튼 두 개가 아니라 대등한 선택 카드 두 장 (시안 §7) */}
      {rotten && (
        <>
          <BlockTitle>다시 살리기</BlockTitle>
          <div className="flex gap-[9px] mt-[10px]">
            <button
              type="button"
              onClick={shovelCnt > 0 ? handleReplant : openShop}
              disabled={busy}
              className={`
                flex-1 rounded-[12px] px-[8px] pt-[12px] pb-[11px] text-center
                bg-farm-canvas dark:bg-layout-gray-dark
                ${shovelCnt > 0
                  ? 'border-[1.5px] border-primary-main-300'
                  : 'border-[1.5px] border-dashed border-layout-gray-100 dark:border-[#3A3A3A]'}
              `}
            >
              <img
                src={CROP_ASSETS.shovel}
                alt=""
                draggable={false}
                className={`block w-[46px] h-[46px] mx-auto mb-[7px] object-contain select-none ${shovelCnt > 0 ? '' : 'opacity-[0.42]'}`}
              />
              <span className={`block text-[13px] font-[800] tracking-[-0.03em] ${shovelCnt > 0 ? 'text-layout-black dark:text-layout-white' : 'text-layout-gray-300'}`}>
                새심기 삽
              </span>
              <span className={`block mt-[3px] text-[11px] font-[700] tracking-[-0.02em] ${shovelCnt > 0 ? 'text-primary-main-600' : 'text-layout-gray-300'}`}>
                {shovelCnt > 0 ? `보유 ${shovelCnt}개` : '5개 1보석'}
              </span>
            </button>

            <button
              type="button"
              onClick={nutrientCnt > 0 ? handleRecover : openShop}
              disabled={busy}
              className={`
                flex-1 rounded-[12px] px-[8px] pt-[12px] pb-[11px] text-center
                bg-farm-canvas dark:bg-layout-gray-dark
                ${nutrientCnt > 0
                  ? 'border-[1.5px] border-primary-main-300'
                  : 'border-[1.5px] border-dashed border-layout-gray-100 dark:border-[#3A3A3A]'}
              `}
            >
              <img
                src={CROP_ASSETS.nutrient}
                alt=""
                draggable={false}
                className={`block w-[46px] h-[46px] mx-auto mb-[7px] object-contain select-none ${nutrientCnt > 0 ? '' : 'opacity-[0.42]'}`}
              />
              <span className={`block text-[13px] font-[800] tracking-[-0.03em] ${nutrientCnt > 0 ? 'text-layout-black dark:text-layout-white' : 'text-layout-gray-300'}`}>
                영양 회복제
              </span>
              <span className={`block mt-[3px] text-[11px] font-[700] tracking-[-0.02em] ${nutrientCnt > 0 ? 'text-primary-main-600' : 'text-layout-gray-300'}`}>
                {nutrientCnt > 0 ? `보유 ${nutrientCnt}개` : '10개 3보석'}
              </span>
            </button>
          </div>

          {notice && (
            <p className="mt-[10px] text-center text-[12px] font-[500] text-layout-gray-400 dark:text-layout-gray-200">
              {notice}
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default WordDetaileNewBottomSheet;
