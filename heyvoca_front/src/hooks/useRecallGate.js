import { useEffect } from 'react';

/*
  '먼저 떠올려 보기'(실험실 recall_first) 공용 훅 — 보기가 있는 문제 유형이 얇게 연결한다.

  Main.jsx 가 recall = { covered, reveal, giveUpRef } 를 만들어 플러그인에 넘긴다.
  - covered: 지금 문제의 보기를 가림막으로 덮는 중인가(켠 사용자 + 대상 유형 + 아직 '알아요' 전)
  - reveal: '알아요' — 가림막을 걷는다(이후는 평소와 동일)
  - giveUpRef: 하단 '모르겠어요' 버튼이 부를 함수 자리. 각 유형이 이 훅으로 자기 채점 함수를 등록한다.

  유형 컴포넌트:
    useRecallGiveUp(recall, giveUp);   // giveUp: 정답 보기 표시 + 오답 기록 (이미 채점됐으면 no-op)
    <RecallCover covered={recall?.covered} onKnow={recall?.reveal}> …보기… </RecallCover>
*/
export function useRecallGiveUp(recall, giveUp) {
  useEffect(() => {
    if (!recall?.giveUpRef) return undefined;
    recall.giveUpRef.current = giveUp;
    return undefined;
  });
  useEffect(() => () => {
    if (recall?.giveUpRef) recall.giveUpRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// '먼저 떠올려 보기'를 적용하는 문제 유형 — 보기가 있는 유형만.
// 실전 유형(문장 뜻 맞추기·문장 만들기·듣고 만들기·예문 직접 입력 등 실전 문장 구간)은 가리지 않는다.
export const RECALL_QUESTION_TYPES = [
  'multipleChoice',
  'multipleChoiceListening',
  'reverseMultipleChoice',
  'fillInTheBlank',
  'cardMatch',
  'cardMatchListening',
];
