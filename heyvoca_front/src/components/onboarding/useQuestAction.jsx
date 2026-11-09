// src/components/onboarding/useQuestAction.jsx
//
// 입문 퀘스트 '하러 가기' — 미션 key 별로 그 기능을 바로 시작한다(이슈 #25 2차).
// 홈 퀘스트 카드(OnboardingQuestCard)와 퀘스트 바텀시트(UnlockGuideNewBottomSheet)가 같이 쓴다.
//
//  buy_book    → 상점 탭
//  plant_seed  → 심기 세션 바로 시작(usePlantSession)
//  care_farm   → 복습(AI 추천 학습 = 농장 돌보기)
//  search_word → 찾기 탭
//  make_book   → 단어장 탭 + 단어장 만들기 시트
//  free_test   → 단어장 고르기 → 자유 설정 테스트 시트
//  focus_study → 단어장 고르기 → 집중 반복 듣기 설정 시트

import { useNavigate } from 'react-router-dom';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { usePlantSession } from '../../hooks/usePlantSession';
import { useQuickReview } from '../../hooks/useQuickReview';
import VocabularySheetNewFullSheet from '../newfullsheet/VocabularySheetNewFullSheet';
import { useVocabularySetNewBottomSheet } from '../newBottomSheet/VocabularySetNewBottomSheet';
import { vibrate } from '../../utils/osFunction';

export const useQuestAction = () => {
  const navigate = useNavigate();
  const { clearStack } = useNewBottomSheetActions();
  const { pushNewFullSheet } = useNewFullSheetActions();
  const { startPlantSession } = usePlantSession();
  const { startQuickReview } = useQuickReview();
  const { showVocabularySetNewBottomSheet } = useVocabularySetNewBottomSheet();

  /**
   * @param {string} key  미션 key
   * @param {object} opts
   * @param {boolean} opts.fromSheet 바텀시트 안에서 눌렀으면 먼저 시트를 모두 닫는다
   */
  const goToQuest = (key, { fromSheet = false } = {}) => {
    vibrate({ duration: 5 });
    if (fromSheet) clearStack();
    switch (key) {
      case 'buy_book':
        navigate('/book-store');
        return;
      case 'plant_seed':
        startPlantSession({ count: 5 });
        return;
      case 'care_farm':
        startQuickReview();
        return;
      case 'search_word':
        navigate('/dictionary');
        return;
      case 'make_book':
        navigate('/vocabulary-sheets');
        showVocabularySetNewBottomSheet();
        return;
      case 'free_test':
        pushNewFullSheet(VocabularySheetNewFullSheet, { testType: 'exam' }, { smFull: true, closeOnBackdropClick: true });
        return;
      case 'focus_study':
        pushNewFullSheet(VocabularySheetNewFullSheet, { testType: 'study' }, { smFull: true, closeOnBackdropClick: true });
        return;
      default:
        navigate('/home');
    }
  };

  return { goToQuest };
};

export default useQuestAction;
