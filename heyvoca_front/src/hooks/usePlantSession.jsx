import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useVocabulary } from '../context/VocabularyContext';
import { useNewBottomSheetActions } from '../context/NewBottomSheetContext';
import { ConfirmNewBottomSheet } from '../components/newBottomSheet/ConfirmNewBottomSheet';
import { getStudyRecommend } from '../api/study';
import { mapRecommendItemToWord } from '../utils/studyRecommendMapping';
import { vibrate } from '../utils/osFunction';
import { primeSfx } from '../utils/audio';

/*
  새 단어 학습("씨앗 심기") 전용 진입 — 2026-09-29 결정.

  기존 AI 추천 학습(useQuickReview)은 이제 복습만 한다(mode=review, TakeTest.jsx가
  중앙에서 붙인다). 새 단어는 오직 이 훅에서만 시작한다 — 홈 "오늘 할 일" 카드의
  "새 씨앗 심기" 줄, 홈 주 CTA가 그 줄과 같은 사실을 말할 때, "아직 심지 않은 씨앗"
  시트의 "심으러 가기"가 그 진입점이다.

  흐름: GET /study/recommend?mode=plant 로 최대 5단어 + session_id 를 한 번만 받아
  ① "만나기"(기존 단어 카드 학습 화면, /study → StudyMain)로 먼저 보여준 뒤, 그 화면이
  끝나면 같은 단어·세션으로 ② 테스트(TakeTest testType='plant')로 이어간다.
  같은 recommend 응답을 두 화면이 그대로 나눠 쓴다 — 두 번 부르면 오늘 남은 새 씨앗
  한도를 두 번 쓰거나, 카드에서 본 단어와 테스트에 나오는 단어가 달라질 수 있다.
*/

const MAX_PLANT_COUNT = 5;

export const usePlantSession = () => {
  const navigate = useNavigate();
  const { recentStudy } = useVocabulary();
  const { pushAwaitNewBottomSheet } = useNewBottomSheetActions();

  /**
   * @param {object} opts
   * @param {?number} opts.count  이번에 심을 단어 수 상한(예: 오늘 남은 새 씨앗 수).
   *                              기본은 최대 5개.
   * @param {?boolean} opts.force 오늘 목표를 이미 채웠어도 더 심기(서버 한도 무시).
   */
  const startPlantSession = async ({ count, force = false } = {}) => {
    vibrate({ duration: 5 });
    primeSfx();

    // "만나기"를 지나 ② 테스트 단계까지 갔다가 중단된 심기 세션이 있으면 새로 뽑지 않고
    // 그대로 이어간다 — TakeTest.jsx가 recentStudy['plant']의 study_data로 복원한다
    // ('만나기' 단계에서만 이탈했으면 이 기록 자체가 없어 아래로 내려가 새로 시작한다).
    if (recentStudy?.plant?.status === 'learning' && recentStudy.plant.study_data?.length > 0) {
      navigate('/take-test', { state: { testType: 'plant' } });
      return true;
    }

    const n = Math.max(1, Math.min(MAX_PLANT_COUNT, count ?? MAX_PLANT_COUNT));
    const res = await getStudyRecommend({ type: 'plant', mode: 'plant', count: n, force });
    const items = res?.code === 200 && Array.isArray(res.data?.items) ? res.data.items : [];

    if (items.length === 0) {
      const toBookStore = await pushAwaitNewBottomSheet(
        ConfirmNewBottomSheet,
        {
          title: (
            <>
              오늘 심을 새 단어가 없어요.<br />
              상점에서 단어장을 추가해보세요!
            </>
          ),
          btns: { confirm: '상점 가기', cancel: '취소' },
        },
        { isBackdropClickClosable: true, isDragToCloseEnabled: true }
      );
      if (toBookStore) navigate('/book-store');
      return false;
    }

    const words = items.map((item) => mapRecommendItemToWord(item));
    navigate('/study', {
      state: {
        words,
        plantSession: true,
        plantSessionId: res.data.session_id ?? null,
      },
    });
    return true;
  };

  return { startPlantSession };
};

export default usePlantSession;
