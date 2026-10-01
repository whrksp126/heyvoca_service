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

2026-09 "출제형 문제 1단계" 추가 — 문장 조각 조립/타이핑 4종. 계약 문서:
  heyvoca_service/docs/SENTENCE_QUESTIONS_CONTRACT.md
  - sentenceArrangePartial : 한글 해석 보고 목표 단어 주변 3~5조각만 조립(난이도 3)
  - sentenceArrange        : 한글 해석 보고 문장 전체(또는 뒷부분 최대 7조각) 조립(난이도 4)
  - listenArrange          : 영어 음성 듣고 조립, 원문 어순만 정답(난이도 4)
  - fillInTheBlankTyping   : 빈칸 채우기와 같은 예문, 타이핑으로 정답 입력(난이도 4~5 — tier 4 에서
                             sentenceArrange/listenArrange 와 균등 혼합(약 1/3), tier 5 에서는 단독)
  이 4종은 사전 테이블 voca_example_puzzle(dict) 데이터가 있는 단어에서만 출제 가능하다
  (app/services/recommend/composer.py::_item_can_use_question_type).
"""

# 추천 알고리즘(app/services/recommend/composer.py)이 단어에 배정할 수 있는 유형.
RECOMMENDABLE_QUESTION_TYPES = (
    'multipleChoice',
    'reverseMultipleChoice',
    'multipleChoiceListening',
    'fillInTheBlank',
    'cardMatch',
    'cardMatchListening',
    'sentenceArrangePartial',
    'sentenceArrange',
    'listenArrange',
    'fillInTheBlankTyping',
)

# 난이도 오르내리기(자동 출제, composer._compose_recommend full_recommend 경로) 전용 —
# 문제 유형 → 난이도 tier(1~5). tier가 없는 유형(사용자 직접 선택 전용 등)은 매핑에서 제외.
QUESTION_TYPE_TIER = {
    'multipleChoice':          1,
    'cardMatch':                1,
    'reverseMultipleChoice':   2,
    'multipleChoiceListening': 2,
    'cardMatchListening':      2,
    'fillInTheBlank':          3,
    'sentenceArrangePartial':  3,
    'sentenceArrange':         4,
    'listenArrange':           4,
    'fillInTheBlankTyping':    4,   # 대표 tier. tier 5 에도 노출(TIER_QUESTION_TYPES[5] 참고)
}

# tier → 그 tier에서 출제 가능한 유형 목록(순서 고정). QUESTION_TYPE_TIER의 역인덱스 + 예외 1건:
# fillInTheBlankTyping 은 대표 tier 4 이면서 tier 5 에도 들어간다(2026-10 tier 4 부터 노출).
# tier 4 는 같은 tier 안 균등 무작위라 typing 비중 약 1/3(puzzle 없는 단어는 typing 만 후보).
TIER_QUESTION_TYPES = {
    1: ('multipleChoice', 'cardMatch'),
    2: ('reverseMultipleChoice', 'multipleChoiceListening', 'cardMatchListening'),
    3: ('fillInTheBlank', 'sentenceArrangePartial'),
    4: ('sentenceArrange', 'listenArrange', 'fillInTheBlankTyping'),
    5: ('fillInTheBlankTyping',),
}

MAX_TIER = 5

# 작물 단계(app/services/recommend/stage.py::crop_stage) → 그 단계가 여는 최고 난이도.
CROP_STAGE_MAX_TIER = {
    'unlearned': 1,
    'seed':      2,
    'sprout':    3,
    'leaf':      4,
    'carrot':    5,
}

# 추천 알고리즘 밖에서 프론트가 직접 부여해 보낼 수 있는 유형(추천 후보에는 없음).
# script* 3종(2026-09-30 글자 밭) — heyvoca_front utils/scriptQuestions.js가 만드는
# scriptSeePick/scriptListenPick/scriptTrace. scriptIntro는 NO_GRADE_QUESTION_TYPES라
# /study/log 자체를 타지 않아 여기 없다. 이 목록에 없으면 /study/log가 400으로 거부해
# 글자 학습이 FSRS·농장 성장에 전혀 반영되지 않는다(모든 글자가 영원히 UNPLANTED_SEED로
# 남는 버그의 원인 — 2026-09-30 실기기 QA).
_NON_RECOMMENDABLE_QUESTION_TYPES = (
    'multipleChoiceDiagnosis',
    'scriptSeePick',
    'scriptListenPick',
    'scriptTrace',
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
