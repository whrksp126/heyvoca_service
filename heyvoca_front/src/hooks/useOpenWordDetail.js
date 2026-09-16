// src/hooks/useOpenWordDetail.js
//
// 단어 하나(user_voca_id)를 보고 상세 바텀시트를 여는 공용 진입점 — QA §B.
//
// 원래 dictionary/Main.jsx 의 handleWordItemClick 하나에만 있던 로직이다. 단어장이
// 1개면 바로 WordDetaileNewBottomSheet, 여러 개면 SelectVocaBookForWordNewBottomSheet 로
// 먼저 고르게 한다. 홈 피드 카드(GrewTodayCard·WordFeedCard)·농장 목록(WordListSheet)의
// 행도 같은 상세를 열어야 해서(시안 A: 힌트 없이 press 배경만) 이 훅 하나로 모은다 —
// 같은 판단을 화면마다 따로 베끼면 한쪽만 고치는 사고가 난다.
import { useCallback } from 'react';
import { useVocabulary } from '../context/VocabularyContext';
import { useNewBottomSheetActions } from '../context/NewBottomSheetContext';
import WordDetaileNewBottomSheet from '../components/newBottomSheet/WordDetaileNewBottomSheet';
import SelectVocaBookForWordNewBottomSheet from '../components/newBottomSheet/SelectVocaBookForWordNewBottomSheet';
import { vibrate } from '../utils/osFunction';

/**
 * @returns {(userVocaId: string|number) => void} openWordDetail
 *
 * userDictionary 에 없는 단어(사전이 아직 안 실렸거나 모르는 id)는 아무 것도 하지 않는다 —
 * 상세 시트가 요구하는 (vocabularySheetId, id) 쌍을 만들 수 없어서다.
 */
export const useOpenWordDetail = () => {
  const { userDictionary } = useVocabulary();
  const { pushNewBottomSheet } = useNewBottomSheetActions();

  return useCallback((userVocaId) => {
    const word = userDictionary[userVocaId];
    if (!word) return;

    const books = word.vocaBooks ?? [];
    if (books.length === 0) return;

    vibrate({ duration: 5 });

    if (books.length === 1) {
      pushNewBottomSheet(WordDetaileNewBottomSheet, {
        vocabularyId: books[0].vocaBookId,
        id: word.vocaIndexId,
      });
      return;
    }
    pushNewBottomSheet(SelectVocaBookForWordNewBottomSheet, {
      vocaIndexId: word.vocaIndexId,
      vocaBookIds: books.map((b) => b.vocaBookId),
    });
  }, [userDictionary, pushNewBottomSheet]);
};

export default useOpenWordDetail;
