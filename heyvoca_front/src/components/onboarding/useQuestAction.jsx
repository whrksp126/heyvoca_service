// src/components/onboarding/useQuestAction.jsx
//
// 입문 퀘스트 '하러 가기' — 미션 key 별로 그 기능이 있는 곳으로 데려간다(이슈 #25).
// 홈 퀘스트 카드(OnboardingQuestCard)와 잠금 안내 시트(UnlockGuideNewBottomSheet)가 같이 쓴다.
//
//  plant_seed  → 심기 세션 바로 시작(usePlantSession)
//  make_book   → 단어장 탭
//  search_word → 찾기 탭
//  buy_book    → 상점 탭
//  focus_study → 밭 골라 학습(단어장 고르기 → 방식 시트에서 '집중 반복 학습')
//  care_farm   → 복습(AI 추천 학습 = 농장 돌보기)

import { useNavigate } from 'react-router-dom';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { usePlantSession } from '../../hooks/usePlantSession';
import { useQuickReview } from '../../hooks/useQuickReview';
import VocabularySheetNewFullSheet from '../newfullsheet/VocabularySheetNewFullSheet';
import { vibrate } from '../../utils/osFunction';

export const useQuestAction = () => {
  const navigate = useNavigate();
  const { clearStack } = useNewBottomSheetActions();
  const { pushNewFullSheet } = useNewFullSheetActions();
  const { startPlantSession } = usePlantSession();
  const { startQuickReview } = useQuickReview();

  /**
   * @param {string} key  미션 key
   * @param {object} opts
   * @param {boolean} opts.fromSheet 바텀시트 안에서 눌렀으면 먼저 시트를 모두 닫는다
   */
  const goToQuest = (key, { fromSheet = false } = {}) => {
    vibrate({ duration: 5 });
    if (fromSheet) clearStack();
    switch (key) {
      case 'plant_seed':
        startPlantSession({ count: 5 });
        return;
      case 'make_book':
        navigate('/vocabulary-sheets');
        return;
      case 'search_word':
        navigate('/dictionary');
        return;
      case 'buy_book':
        navigate('/book-store');
        return;
      case 'focus_study':
        pushNewFullSheet(VocabularySheetNewFullSheet, { testType: 'pick' }, { smFull: true, closeOnBackdropClick: true });
        return;
      case 'care_farm':
        startQuickReview();
        return;
      default:
        navigate('/home');
    }
  };

  return { goToQuest };
};

export default useQuestAction;
