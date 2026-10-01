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
  새 단어 학습("씨앗 심기") 전용 진입 — 2026-09-29 결정, 같은 날 실기기 피드백으로 흐름 변경.

  기존 AI 추천 학습(useQuickReview)은 이제 복습만 한다(mode=review, TakeTest.jsx가
  중앙에서 붙인다). 새 단어는 오직 이 훅에서만 시작한다 — 홈 "오늘 할 일" 카드의
  "새 씨앗 심기" 줄, 홈 주 CTA가 그 줄과 같은 사실을 말할 때, "아직 심지 않은 씨앗"
  시트의 "심으러 가기"가 그 진입점이다.

  흐름: GET /study/recommend?mode=plant 로 최대 5단어 + session_id 를 한 번만 받아 곧장
  ② 테스트(TakeTest testType='plant')로 보낸다. ① "만나기"는 더 이상 별도 화면(/study)이
  아니라 TakeTest 안의 슬라이드(wordIntro, 단어마다 그 단어 블록의 맨 앞)다.
  2026-10-02 — 단어마다 만나기 뒤에 영→한/한→영/빈칸 채우기/빈칸 입력 중 임의 2~3개만 내고,
  문장 만들기는 맨 끝 안내 슬라이드 뒤 2~3문제, 오답 재학습도 맨 끝에서 안내 슬라이드와 함께
  나온다(구성은 pages/TakeTest.jsx buildPlantTestQuestions, 재출제 삽입은 components/takeTest/Main.jsx).

  중간 이탈 재개는 세션 중(같은 앱 인스턴스) recentStudy.plant 로컬 상태로만 판단한다 —
  plant는 서버 RecentStudy에 쓰지 않는다(RecentStudyType enum에 값이 없어 500이 나던
  버그, pages/TakeTest.jsx 주석 참고). 앱을 완전히 종료했다 다시 열면 이어하기 없이
  새로 시작한다.
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

    // 이미 진행 중(같은 앱 인스턴스)인 심기 세션이 있으면 새로 뽑지 않고 그대로 이어간다 —
    // TakeTest.jsx가 recentStudy['plant']의 study_data(로컬 상태, 서버에는 없음)로 복원한다.
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
    // "만나기" 화면(/study) 없이 곧장 테스트로 — ①만나기는 TakeTest 안의 첫 슬라이드다.
    navigate('/take-test', {
      state: {
        testType: 'plant',
        data: {
          words,
          sessionId: res.data.session_id ?? null,
          vocabularySheetId: 'all',
          count: words.length,
        },
      },
    });
    return true;
  };

  return { startPlantSession };
};

export default usePlantSession;
