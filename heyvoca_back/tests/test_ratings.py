"""
ratings.py — 정답/오답/오타 판정 테스트 (2026-10: 응답 시간·글자 수 무관).
"""

import pytest

from app.services.fsrs.ratings import derive_rating, rating_to_q_score
from app.services.fsrs.core import AGAIN, HARD, GOOD, EASY


class TestDeriveRating:
    @pytest.mark.parametrize("time_ms", [0, 1000, 5000, 10001, 99999])
    def test_incorrect_is_again(self, time_ms):
        assert derive_rating(False, time_ms) == AGAIN
        assert derive_rating(False, time_ms, typo=True) == AGAIN

    @pytest.mark.parametrize("time_ms", [0, 1000, 5000, 10001, 99999])
    def test_correct_is_always_good(self, time_ms):
        assert derive_rating(True, time_ms) == GOOD
        assert derive_rating(True, time_ms, word_length=3, fsrs_difficulty=1.0) == GOOD
        assert derive_rating(True, time_ms, word_length=15, fsrs_difficulty=9.0,
                             question_type='sentenceArrange') == GOOD

    def test_typo_correct_is_hard(self):
        assert derive_rating(True, 500, typo=True) == HARD

    def test_never_easy(self):
        assert derive_rating(True, 0, word_length=20, fsrs_difficulty=10.0) != EASY


class TestRatingToQScore:
    def test_again_maps_to_0(self):
        assert rating_to_q_score(AGAIN) == 0

    def test_hard_maps_to_3(self):
        assert rating_to_q_score(HARD) == 3

    def test_good_maps_to_4(self):
        assert rating_to_q_score(GOOD) == 4

    def test_easy_maps_to_5(self):
        assert rating_to_q_score(EASY) == 5

    def test_unknown_rating_defaults_to_4(self):
        assert rating_to_q_score(99) == 4

    @pytest.mark.parametrize("rating,q_score", [
        (AGAIN, 0),
        (HARD,  3),
        (GOOD,  4),
        (EASY,  5),
    ])
    def test_all_mappings(self, rating, q_score):
        assert rating_to_q_score(rating) == q_score
