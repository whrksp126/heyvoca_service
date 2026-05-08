"""
ratings.py — was_correct × time_taken_ms 매트릭스 테스트.
"""

import pytest

from app.services.fsrs.ratings import derive_rating, rating_to_q_score
from app.services.fsrs.core import AGAIN, HARD, GOOD, EASY


class TestDeriveRating:
    # ── 오답 케이스 ──

    def test_incorrect_any_time_is_again(self):
        """오답이면 시간과 무관하게 AGAIN(1)."""
        assert derive_rating(False, 0)      == AGAIN
        assert derive_rating(False, 4999)   == AGAIN
        assert derive_rating(False, 5000)   == AGAIN
        assert derive_rating(False, 10000)  == AGAIN
        assert derive_rating(False, 99999)  == AGAIN

    # ── 정답 케이스 ──

    def test_correct_very_fast_is_easy(self):
        """정답 + 5초 이하 → EASY(4)."""
        assert derive_rating(True, 0)    == EASY
        assert derive_rating(True, 1000) == EASY
        assert derive_rating(True, 5000) == EASY

    def test_correct_medium_is_good(self):
        """정답 + 5001~10000ms → GOOD(3)."""
        assert derive_rating(True, 5001)  == GOOD
        assert derive_rating(True, 7500)  == GOOD
        assert derive_rating(True, 10000) == GOOD

    def test_correct_slow_is_hard(self):
        """정답 + 10001ms 이상 → HARD(2)."""
        assert derive_rating(True, 10001) == HARD
        assert derive_rating(True, 15000) == HARD
        assert derive_rating(True, 30000) == HARD
        assert derive_rating(True, 99999) == HARD

    # ── 경계값 ──

    def test_boundary_5000ms(self):
        """5000ms 경계: <=5000 → EASY."""
        assert derive_rating(True, 4999) == EASY
        assert derive_rating(True, 5000) == EASY
        assert derive_rating(True, 5001) == GOOD

    def test_boundary_10000ms(self):
        """10000ms 경계: <=10000 → GOOD."""
        assert derive_rating(True, 9999)  == GOOD
        assert derive_rating(True, 10000) == GOOD
        assert derive_rating(True, 10001) == HARD

    # ── 전체 매트릭스 ──

    @pytest.mark.parametrize("was_correct,time_ms,expected", [
        (False, 0,     AGAIN),
        (False, 5000,  AGAIN),
        (False, 15000, AGAIN),
        (True,  0,     EASY),
        (True,  5000,  EASY),
        (True,  5001,  GOOD),
        (True,  10000, GOOD),
        (True,  10001, HARD),
        (True,  15000, HARD),
        (True,  20000, HARD),
    ])
    def test_matrix(self, was_correct, time_ms, expected):
        assert derive_rating(was_correct, time_ms) == expected


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
