"""
question_type 상수 — 백엔드 여러 곳(추천 composer, /study/log 화이트리스트)이 공유하는
단일 소스. 새 유형을 추가/제거할 때는 여기만 고치면 된다.

프론트 question_type 페이로드 근거(2026-09 기준, heyvoca_front/src grep):
  - app/plugins/questionTypes/index.js  (QUESTION_TYPE_PLUGINS — multipleChoice,
    multipleChoiceListening, reverseMultipleChoice, fillInTheBlank, cardMatch,
    cardMatchListening. fillInTheBlankReverse는 프론트에서 드롭됨(2026-09) — 더 이상
    출제하지 않는다.)
  - components/takeTest/Main.jsx        (question_type: question.questionType 로 그대로 전송)
  - pages/TakeTest.jsx                  ('multipleChoiceDiagnosis' — "다시 심기 진단" 전용,
    추천 알고리즘(composer)이 배정하지 않고 그 화면에서 직접 부여한다)
"""

# 추천 알고리즘(app/services/recommend/composer.py)이 단어에 배정할 수 있는 유형.
RECOMMENDABLE_QUESTION_TYPES = (
    'multipleChoice',
    'reverseMultipleChoice',
    'multipleChoiceListening',
    'fillInTheBlank',
    'cardMatch',
    'cardMatchListening',
)

# 추천 알고리즘 밖에서 프론트가 직접 부여해 보낼 수 있는 유형(추천 후보에는 없음).
_NON_RECOMMENDABLE_QUESTION_TYPES = (
    'multipleChoiceDiagnosis',
)

# 프론트에서 드롭되어 더 이상 출제되지 않지만, 과거 /study/log 기록에 남아 있어
# 화이트리스트에서는 계속 허용해야 하는 유형(2026-09 fillInTheBlankReverse 드롭).
_DEPRECATED_QUESTION_TYPES = (
    'fillInTheBlankReverse',
)

# /study/log 가 허용하는 question_type 전체(화이트리스트).
ALLOWED_QUESTION_TYPES = (
    frozenset(RECOMMENDABLE_QUESTION_TYPES)
    | frozenset(_NON_RECOMMENDABLE_QUESTION_TYPES)
    | frozenset(_DEPRECATED_QUESTION_TYPES)
)
