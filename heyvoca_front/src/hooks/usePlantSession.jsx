import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useVocabulary } from '../context/VocabularyContext';
import { useUser } from '../context/UserContext';
import { useNewBottomSheetActions } from '../context/NewBottomSheetContext';
import { ConfirmNewBottomSheet } from '../components/newBottomSheet/ConfirmNewBottomSheet';
import { getStudyRecommend } from '../api/study';
import { mapRecommendItemToWord } from '../utils/studyRecommendMapping';
import { vibrate } from '../utils/osFunction';
import { primeSfx } from '../utils/audio';
import { unlockTtsAudio, prefetchTtsList } from '../utils/common';
import { wordIntroSoundItems } from '../plugins/questionTypes/wordIntro/WordIntroQuestion';

/*
  새 단어 학습("씨앗 심기") 전용 진입 — 2026-09-29 결정, 같은 날 실기기 피드백으로 흐름 변경.

  기존 AI 추천 학습(useQuickReview)은 이제 복습만 한다(mode=review, TakeTest.jsx가
  중앙에서 붙인다). 새 단어는 오직 이 훅에서만 시작한다 — 홈 "오늘 할 일" 카드의
  "새 씨앗 심기" 줄, 홈 주 CTA가 그 줄과 같은 사실을 말할 때, "아직 심지 않은 씨앗"
  시트의 "심으러 가기"가 그 진입점이다.

  흐름: GET /study/recommend?mode=plant 로 오늘 남은 새 씨앗 수만큼 + session_id 를 한 번만 받아 곧장
  ② 테스트(TakeTest testType='plant')로 보낸다. ① "만나기"는 더 이상 별도 화면(/study)이
  아니라 TakeTest 안의 슬라이드(wordIntro, 단어마다 그 단어 블록의 맨 앞)다.
  2026-10-02 — 단어마다 만나기 뒤에 영→한/한→영/빈칸 채우기/빈칸 입력 중 임의 2~3개만 내고,
  문장 만들기는 맨 끝 안내 슬라이드 뒤 2~3문제, 오답 재학습도 맨 끝에서 안내 슬라이드와 함께
  나온다(구성은 pages/TakeTest.jsx buildPlantTestQuestions, 재출제 삽입은 components/takeTest/Main.jsx).

  중간에 그만둔 세션은 이어 하지 않는다(2026-10-24 이슈 #15) — 다시 누르면 항상 새로 뽑는다.
  plant는 서버 RecentStudy에 쓰지 않는다(RecentStudyType enum에 값이 없어 500이 나던
  버그, pages/TakeTest.jsx 주석 참고).
*/

/*
  한 번에 심는 단어 수 = 사용자 설정 '하루 새 단어 수'(daily_new_limit) 기준(이슈 #25 9차).
  예전엔 여기서 5개로 잘라 설정이 10이어도 항상 5개였다. 이제 요청 count 는 설정값으로 보내고,
  서버(GET /study/recommend mode=plant)가 '설정값 − 오늘 이미 심은 수'(최소 0)로 줄이며
  서점 단어가 부족하면 있는 만큼만 준다. 서버 count 상한(50)과 맞춘다.
  호출부가 넘기던 count(대개 5)는 더 이상 상한으로 쓰지 않는다 — 설정을 무시하게 되므로.
*/
const DEFAULT_DAILY_NEW_LIMIT = 20; // User.daily_new_limit 컬럼 기본값과 동일
const SERVER_MAX_COUNT = 50;        // routes/study.py get_recommend 의 count 상한

const resolvePlantCount = (dailyNewLimit) => {
  const limit = Number(dailyNewLimit);
  // 0(무제한)·미설정이면 기본 20개
  const base = Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_DAILY_NEW_LIMIT;
  return Math.max(1, Math.min(SERVER_MAX_COUNT, Math.floor(base)));
};

export const usePlantSession = () => {
  const navigate = useNavigate();
  const { recentStudy } = useVocabulary();
  const { userProfile } = useUser();
  const { pushAwaitNewBottomSheet } = useNewBottomSheetActions();

  /**
   * @param {object} opts
   * @param {?number} opts.count  (무시됨, 하위호환) 예전 5개 상한. 지금은 설정값 기준.
   * @param {?boolean} opts.force 오늘 목표를 이미 채웠어도 더 심기(서버 한도 무시) —
   *                              이때도 한 번에 설정값만큼 심는다.
   */
  // eslint-disable-next-line no-unused-vars
  const startPlantSession = async ({ count: _ignoredCount, force = false } = {}) => {
    vibrate({ duration: 5 });
    primeSfx();
    unlockTtsAudio(); // 제스처 안에서 AudioContext resume — 첫 카드 자동 재생이 무음이 되지 않게

    // 중간에 그만둔 심기 세션은 이어 하지 않고 항상 새로 뽑는다(2026-10-24 이슈 #15) —
    // TakeTest.jsx는 session_id가 다르면 저장분을 버리고 새 세션을 만든다.
    const n = resolvePlantCount(userProfile?.daily_new_limit);
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
    // 첫 카드의 단어·뜻(·예문)을 먼저, 나머지 카드는 단어·뜻만 백그라운드로 미리 받아 둔다.
    prefetchTtsList(
      words.flatMap((w, i) => wordIntroSoundItems(w, { withExamples: i === 0 })),
      4,
    );
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
