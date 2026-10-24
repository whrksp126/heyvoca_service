"""
skill_level.py — 사용자 수준(θ) 단일 소스 (이슈 #16).

정본: heyvoca_service/docs/LEVEL_AND_MEANING_CONTRACT.md §2

척도: 예문 score 와 같은 0~100. P(정답) = σ((θ − b) / SCALE).
  b = 예문 score(예문 있는 문제) 또는 목표 단어 등급 대표값 + 문제 유형 보정치(QUESTION_TYPE_B_OFFSET).
갱신: θ += K · (정답여부 − P). K 는 답변이 쌓일수록 줄어든다(초반 빠른 수렴, 이후 안정).
출제: P ≈ TARGET_P(0.8) 이 되는 b → target_score_for(θ, qtype).
"""

import math
from typing import Optional

SCALE = 10.0
TARGET_P = 0.8
DEFAULT_THETA = 20.0

# 구간 하한(계약 §0): A1 0 / A2 20 / B1 35 / B2 55 / C1 75 / C2 90
_BAND_LOWER = (0, 20, 35, 55, 75, 90)
CEFR_NAMES = ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')
# 등급 대표 점수(구간 가운데쯤) — 예문 score 가 없을 때 단어 등급으로 b 를 정한다.
RANK_CENTER = {1: 10, 2: 27, 3: 45, 4: 65, 5: 82, 6: 95}
JLPT_RANK = {'N5': 1, 'N4': 2, 'N3': 3, 'N2': 4, 'N1': 5}

# 가입 수준(User.level_id 1~4) → 초기 θ. 없으면 DEFAULT_THETA.
LEVEL_ID_THETA = {1: 12.0, 2: 25.0, 3: 42.0, 4: 60.0}

# 문제 유형별 난이도 보정치(b 에 더함). 여기 없는 유형(글자 학습·진단 등)은 θ 를 갱신하지 않는다.
QUESTION_TYPE_B_OFFSET = {
    'multipleChoice':          -10,
    'cardMatch':               -10,
    'reverseMultipleChoice':    -6,
    'multipleChoiceListening':  -6,
    'cardMatchListening':       -6,
    'fillInTheBlank':           -2,
    'fillInTheBlankReverse':    -2,
    'sentenceArrangePartial':    0,
    'sentenceArrange':           3,
    'listenArrange':             5,
    'fillInTheBlankTyping':      5,
    'sentenceMeaning':          -2,   # 문장 뜻 고르기(4지선다, 이슈 #15)
    'sentenceTranslate':         5,   # 문장 뜻 맞추기(한국어 조각 나열, 이슈 #16)
}

ERROR_TYPES = ('typo', 'form', 'distractor', 'order', 'wrong_choice', 'timeout')
_EWMA_ALPHA = 0.1


def counts_for_skill(question_type: Optional[str]) -> bool:
    """글자 학습(script*)·다시 심기 진단은 단어·문장 수준과 무관해 프로필에 넣지 않는다."""
    return bool(question_type) and not question_type.startswith('script') and question_type != 'multipleChoiceDiagnosis'


def score_to_cefr(score) -> int:
    """0~100 → 1(A1)~6(C2)."""
    s = 0 if score is None else float(score)
    rank = 1
    for i, lo in enumerate(_BAND_LOWER):
        if s >= lo:
            rank = i + 1
    return rank


def cefr_name(rank: int) -> str:
    return CEFR_NAMES[max(1, min(6, int(rank))) - 1]


def p_correct(theta: float, b: float) -> float:
    return 1.0 / (1.0 + math.exp(-(theta - b) / SCALE))


def k_factor(answers: int) -> float:
    if answers < 30:
        return 6.0
    if answers < 200:
        return 3.0
    return 1.5


def target_score_for(theta: float, question_type: Optional[str] = None) -> float:
    """P(정답)=TARGET_P 가 되는 예문 score."""
    offset = QUESTION_TYPE_B_OFFSET.get(question_type or '', 0)
    return max(0.0, min(100.0, theta - SCALE * math.log(TARGET_P / (1 - TARGET_P)) - offset))


def initial_theta(level_id: Optional[int]) -> float:
    return LEVEL_ID_THETA.get(level_id, DEFAULT_THETA)


def word_rank_score(rank: Optional[int]) -> Optional[float]:
    return RANK_CENTER.get(rank) if rank else None


def apply_answer(profile: dict, *, question_type: str, was_correct: bool,
                 item_score: Optional[float], error_type: Optional[str] = None) -> dict:
    """profile({theta, answers, type_stats, error_stats}) 를 한 답변만큼 갱신해 돌려준다(순수 함수).

    item_score 가 None 이면(예문·단어 등급 모두 없음) θ 는 그대로, 유형·실수 집계만 쌓는다.
    """
    theta = float(profile.get('theta') if profile.get('theta') is not None else DEFAULT_THETA)
    answers = int(profile.get('answers') or 0)
    type_stats = dict(profile.get('type_stats') or {})
    error_stats = dict(profile.get('error_stats') or {})
    correct = 1.0 if was_correct else 0.0

    if item_score is not None and question_type in QUESTION_TYPE_B_OFFSET:
        b = float(item_score) + QUESTION_TYPE_B_OFFSET[question_type]
        theta += k_factor(answers) * (correct - p_correct(theta, b))
        theta = max(0.0, min(100.0, theta))
        answers += 1

    st = dict(type_stats.get(question_type) or {'n': 0, 'correct': 0, 'ewma': None})
    st['n'] = int(st.get('n') or 0) + 1
    st['correct'] = int(st.get('correct') or 0) + int(correct)
    prev = st.get('ewma')
    st['ewma'] = round(correct if prev is None else (1 - _EWMA_ALPHA) * float(prev) + _EWMA_ALPHA * correct, 4)
    type_stats[question_type] = st

    if error_type in ERROR_TYPES:
        error_stats[error_type] = int(error_stats.get(error_type) or 0) + 1

    return {'theta': round(theta, 3), 'answers': answers,
            'type_stats': type_stats, 'error_stats': error_stats}


# ── DB 경로 ─────────────────────────────────────────────────────────────

def item_score(lang: str, example_hash: Optional[str], voca_id: Optional[int]) -> Optional[float]:
    """문제 난이도 b 의 바탕 점수: 예문 score(있으면) → 목표 단어 등급 대표값 → None.

    현재 요청의 사전 언어(g.dict_lang)가 lang 과 같을 때만 부른다(사전 모델이 그 schema 로 간다).
    """
    from app import db
    from app.models.models import VocaExampleMeta, VocaExampleJaMeta, VocaLabel, VocaJa

    if example_hash:
        model = VocaExampleJaMeta if lang == 'ja' else VocaExampleMeta
        s = (db.session.query(model.score)
             .filter(model.sentence_hash == example_hash, model.score.isnot(None)).first())
        if s and s[0] is not None:
            return float(s[0])
    if voca_id:
        if lang == 'ja':
            row = db.session.query(VocaJa.jlpt).filter(VocaJa.voca_id == voca_id).first()
            rank = JLPT_RANK.get((row[0] if row else None) or '', 6) if row else None
        else:
            row = db.session.query(VocaLabel.cefr).filter(VocaLabel.voca_id == voca_id).first()
            rank = CEFR_NAMES.index(row[0]) + 1 if row and row[0] in CEFR_NAMES else None
        return word_rank_score(rank)
    return None


def load_profile_row(user_id, lang: str, *, lock: bool = False, create: bool = False):
    """UserSkillProfile 행. create=True 면 없을 때 초기 θ(가입 수준)로 만든다(세션에 add, commit 은 호출부)."""
    from app import db
    from app.models.models import UserSkillProfile, User

    q = db.session.query(UserSkillProfile).filter_by(user_id=user_id, lang=lang)
    if lock:
        q = q.with_for_update()
    row = q.first()
    if row is None and create:
        level_id = db.session.query(User.level_id).filter(User.id == user_id).scalar()
        row = UserSkillProfile(user_id=user_id, lang=lang, theta=initial_theta(level_id), answers=0,
                               type_stats={}, error_stats={})
        db.session.add(row)
    return row


def record_answer(user_id, lang: str, *, question_type: str, was_correct: bool,
                  example_hash: Optional[str], voca_id: Optional[int],
                  error_type: Optional[str] = None) -> Optional[dict]:
    """/study/log 한 건을 프로필에 반영(commit 은 호출부 트랜잭션). en/ja 만."""
    if lang not in ('en', 'ja') or not counts_for_skill(question_type):
        return None
    row = load_profile_row(user_id, lang, lock=True, create=True)
    b = item_score(lang, example_hash, voca_id) if question_type in QUESTION_TYPE_B_OFFSET else None
    before = row.theta
    out = apply_answer({'theta': row.theta, 'answers': row.answers, 'type_stats': row.type_stats,
                        'error_stats': row.error_stats},
                       question_type=question_type, was_correct=was_correct, item_score=b,
                       error_type=error_type)
    row.theta, row.answers = out['theta'], out['answers']
    row.type_stats, row.error_stats = out['type_stats'], out['error_stats']
    return {'theta_before': before, 'theta': row.theta, 'b': b}


def profile_response(row, lang: str, level_id: Optional[int] = None) -> dict:
    theta = row.theta if row is not None else initial_theta(level_id)
    return {
        'lang':        lang,
        'theta':       round(float(theta), 2),
        'cefr':        cefr_name(score_to_cefr(theta)),
        'answers':     int(row.answers) if row is not None else 0,
        'type_stats':  (row.type_stats or {}) if row is not None else {},
        'error_stats': (row.error_stats or {}) if row is not None else {},
    }
