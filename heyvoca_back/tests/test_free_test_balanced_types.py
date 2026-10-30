"""이슈 #21 2차(2026-10-30) — 자유 설정 테스트(question_types 직접 선택)는 고른 유형을 고르게 섞는다.

단어 고르기만 추천 로직을 따르고, 유형·방향·듣기는 고른 것 안에서 균등(묶음 균등 → 묶음 안 변형 균등).
약점 유형·가중치에 끌려 한 유형만 나오던 신고(문장 조립만 나옴)의 회귀 테스트.
"""
from collections import Counter

from app.constants.question_types import QUESTION_TYPE_FAMILY
from app.services.recommend.composer import _assign_balanced_question_types, compose
from app.services.recommend.pool import CandidateItem

PUZZLE = {
    'example_id': 1,
    'tokens': ['I', 'need', 'to', 'check', 'in', 'for', 'my', 'flight', 'online'],
    'target_idx': [3, 4], 'first_form': 'i', 'alt_orders': [],
    'distractors': ['book', 'cancel'], 'listen_distractors': ['look', 'out'], 'skip_reason': None,
}
TAGGED = {
    'origin': 'I need to <strong class="target-word">check in</strong> for my flight online.',
    'meaning': '비행기 온라인 <strong class="target-word">체크인</strong>을 해야 해요.',
}


def _item(uid, puzzle=True, bucket='review'):
    return CandidateItem(
        user_voca_id=uid, user_voca_book_id=None, word=f'checkin{uid}', meanings=['체크인하다'],
        examples=[TAGGED], example_puzzles=[PUZZLE] if puzzle else [None],
        fsrs_state={'state': 'review', 'stability': 5.0, 'retrievability': 0.9, 'next_review': None},
        bucket=bucket, word_length=8,
    )


def _no_repeat(seq):
    return all(a != b for a, b in zip(seq, seq[1:]))


THREE = ['spellingFill', 'sentenceArrange', 'fillInTheBlankTyping']
WEAK_STATS = {'weakness_types': [{'question_type': 'sentenceArrange', 'correct_rate': 0.1}]}


def test_three_types_twelve_words_balanced_compose():
    for selection in ('recommended', 'random'):
        for _ in range(50):
            pool = [_item(i) for i in range(30)]
            res = compose(pool, 12, selection=selection, user_stats=WEAK_STATS,
                          full_recommend=True, allowed_types=THREE)
            seq = [e['suggested_question_type'] for e in res['enriched_items']]
            assert len(seq) == 12
            c = Counter(seq)
            assert set(c) <= set(THREE)                 # 고르지 않은 유형 0회
            assert all(c[t] >= 3 for t in THREE), c     # 약점 유형이 있어도 쏠리지 않는다
            assert _no_repeat(seq), seq


def test_family_first_then_variant():
    # 사지선다 3방향 + 스펠링 1개 → 묶음 기준 6:6, 사지선다 안에서 2:2:2
    allowed = ['multipleChoice', 'reverseMultipleChoice', 'multipleChoiceListening', 'spellingFill']
    for _ in range(50):
        seq = _assign_balanced_question_types([_item(i) for i in range(12)], allowed)
        fams = Counter(QUESTION_TYPE_FAMILY.get(t, t) for t in seq)
        assert fams['multipleChoice'] == 6 and fams['spellingFill'] == 6, fams
        c = Counter(seq)
        assert all(c[t] == 2 for t in allowed[:3]), c
        assert _no_repeat(seq), seq


def test_unusable_type_is_skipped_for_that_word():
    # puzzle 없는 단어는 문장 조립을 못 쓴다 — 그 단어는 다른 고른 유형으로, 선택 밖으로는 안 샌다
    items = [_item(i, puzzle=(i % 2 == 0)) for i in range(12)]
    for _ in range(50):
        seq = _assign_balanced_question_types(items, THREE)
        assert set(seq) <= set(THREE)
        for it, qt in zip(items, seq):
            if not it.example_puzzles[0]:
                assert qt != 'sentenceArrange'
