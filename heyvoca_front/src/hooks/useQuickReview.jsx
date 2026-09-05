import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useVocabulary } from '../context/VocabularyContext';
import { useNewBottomSheetActions } from '../context/NewBottomSheetContext';
import { useNewFullSheetActions } from '../context/NewFullSheetContext';
import { ConfirmNewBottomSheet } from '../components/newBottomSheet/ConfirmNewBottomSheet';
import { vibrate } from '../utils/osFunction';
import { primeSfx } from '../utils/audio';

/*
  AI 추천 학습(quick) 시작 — **한 자리에 모아 둔 진입 로직.**

  홈의 주 버튼은 학습 종류를 고르는 시트를 거치지 않고 곧바로 이 학습을 연다.
  종류를 고르게 하는 건 "무엇을 할지 이미 아는 사람"에게나 쓸모가 있는데, 홈은
  그 반대의 자리다 — 무엇을 할지 정해 주는 것이 이 화면의 일이고, 그래서 화면 전체가
  이미 오늘 무엇이 급한지(급한 작물·물 기다리는 당근·새 씨앗)를 말하고 있다.
  거기서 버튼을 누른 사람에게 종류를 다시 묻는 건 방금 한 말을 무르는 것이다.

  종류를 고르는 자리는 단어장 상세 시트로 옮겼다 — 거기서는 '이 단어장'이라는
  대상이 정해져 있어 무엇을 할지가 실제로 남은 선택이다.

  전제 조건은 둘뿐이다.
    · 전체 단어가 4개 미만이면 출제가 안 된다 → 상점으로 안내
    · 진행 중이던 회차가 있으면 이어서 할지 묻는다
*/

// 출제 최소 단어 수 — 4지선다 보기를 채우지 못하면 문제를 만들 수 없다
const MIN_WORDS = 4;
const MAX_QUESTIONS = 14;

const QUESTION_TYPES = ['multipleChoice', 'multipleChoiceListening', 'cardMatch', 'cardMatchListening'];

export const useQuickReview = () => {
  const navigate = useNavigate();
  const { recentStudy, vocabularySheets, updateRecentStudy } = useVocabulary();
  const { pushAwaitNewBottomSheet } = useNewBottomSheetActions();
  const { closeNewFullSheet } = useNewFullSheetActions();

  const buildState = (count) => ({
    testType: 'quick',
    data: {
      questionType: QUESTION_TYPES,
      vocabularySheetId: 'all',
      memoryState: null,
      count,
    },
  });

  /**
   * @param {object}  opts
   * @param {boolean} opts.fromFullSheet  풀시트 안에서 부른 경우 — 이동 전에 시트를 닫는다
   */
  const startQuickReview = async ({ fromFullSheet = false } = {}) => {
    vibrate({ duration: 5 });
    // 정답·오답 효과음 unlock 은 **user gesture 의 동기 시점**에 해야 한다.
    // await 뒤로 밀리면 iOS WKWebView 에서 AudioContext 가 열리지 않아 소리가 늦게 난다.
    primeSfx();

    const allWords = vocabularySheets.flatMap((sheet) => sheet.words || []);
    if (allWords.length < MIN_WORDS) {
      const toBookStore = await pushAwaitNewBottomSheet(
        ConfirmNewBottomSheet,
        {
          title: (
            <>
              단어가 부족해요.<br />
              상점에서 단어장을 추가해보세요!
            </>
          ),
          btns: { confirm: '상점 가기', cancel: '취소' },
        },
        { isBackdropClickClosable: true, isDragToCloseEnabled: true }
      );
      if (toBookStore) {
        if (fromFullSheet) closeNewFullSheet();
        navigate('/book-store');
      }
      return;
    }

    const count = Math.min(MAX_QUESTIONS, allWords.length);

    if (recentStudy?.quick?.status === 'learning') {
      const resume = await pushAwaitNewBottomSheet(
        ConfirmNewBottomSheet,
        {
          title: (
            <>
              하던 물주기가 남아 있어요.<br />
              이어서 하시겠어요?
            </>
          ),
          btns: { confirm: '이어서 하기', cancel: '새로 시작' },
        },
        { isBackdropClickClosable: true, isDragToCloseEnabled: true }
      );
      if (resume) {
        if (fromFullSheet) closeNewFullSheet();
        navigate('/take-test', { state: buildState(count) });
        return;
      }
    }

    // 새로 시작 — 이전 회차 기록을 비운 뒤 들어간다
    await updateRecentStudy('quick', {
      progress_index: null,
      type: 'quick',
      status: null,
      study_data: null,
      updated_at: null,
      created_at: null,
    });

    if (fromFullSheet) closeNewFullSheet();
    navigate('/take-test', { state: buildState(count) });
  };

  return { startQuickReview };
};

export default useQuickReview;
