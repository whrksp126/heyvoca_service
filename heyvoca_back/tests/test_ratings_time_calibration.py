"""
ratings.py — Phase 2.3 시간 컷오프 보정(RATINGS_USE_TIME_CALIBRATION) 단위 테스트.

보정 공식:
  expected_time_ms = 1500 + 120 * word_length + 200 * fsrs_difficulty
  ratio = time_taken_ms / expected_time_ms
  ratio <= 0.5  → EASY (4)
  ratio <= 1.0  → GOOD (3)
  그 외         → HARD (2)

폴백(단순 컷오프):
  time_taken_ms <= 5000  → EASY (4)
  time_taken_ms <= 10000 → GOOD (3)
  그 외                  → HARD (2)
"""

import os
import pytest

from app.services.fsrs.ratings import derive_rating
from app.services.fsrs.core import AGAIN, HARD, GOOD, EASY


# ── 헬퍼: expected_time_ms 직접 계산 ──────────────────────────────────────────
def _expected(word_length: int, difficulty: float) -> float:
    return 1500 + 120 * word_length + 200 * difficulty


class TestCalibrationEnabled:
    """RATINGS_USE_TIME_CALIBRATION=true (기본) 환경에서 보정 동작 검증."""

    def test_short_word_fast_answer_is_easy(self, monkeypatch):
        """
        짧은 단어(len=3), difficulty=5.0:
          expected = 1500 + 120*3 + 200*5 = 1500 + 360 + 1000 = 2860ms
          2000ms → ratio = 2000/2860 ≈ 0.699 → GOOD(3)
        """
        monkeypatch.setenv('RATINGS_USE_TIME_CALIBRATION', 'true')
        expected = _expected(3, 5.0)  # 2860
        ratio = 2000 / expected       # ≈ 0.699
        assert ratio > 0.5 and ratio <= 1.0  # 이 케이스는 GOOD
        result = derive_rating(True, 2000, word_length=3, fsrs_difficulty=5.0)
        assert result == GOOD

    def test_short_word_very_fast_answer_is_easy(self, monkeypatch):
        """
        짧은 단어(len=3), difficulty=5.0:
          expected = 2860ms
          500ms → ratio ≈ 0.175 → EASY(4)
        """
        monkeypatch.setenv('RATINGS_USE_TIME_CALIBRATION', 'true')
        result = derive_rating(True, 500, word_length=3, fsrs_difficulty=5.0)
        assert result == EASY

    def test_long_word_long_time_is_hard(self, monkeypatch):
        """
        긴 단어(len=20), difficulty=5.0:
          expected = 1500 + 120*20 + 200*5 = 1500 + 2400 + 1000 = 4900ms
          20000ms → ratio ≈ 4.08 → HARD(2)
        """
        monkeypatch.setenv('RATINGS_USE_TIME_CALIBRATION', 'true')
        expected = _expected(20, 5.0)  # 4900
        ratio = 20000 / expected        # ≈ 4.08
        assert ratio > 1.0
        result = derive_rating(True, 20000, word_length=20, fsrs_difficulty=5.0)
        assert result == HARD

    def test_high_difficulty_long_time_is_hard(self, monkeypatch):
        """
        difficulty=10, len=5:
          expected = 1500 + 120*5 + 200*10 = 1500 + 600 + 2000 = 4100ms
          15000ms → ratio ≈ 3.66 → HARD(2)
        """
        monkeypatch.setenv('RATINGS_USE_TIME_CALIBRATION', 'true')
        expected = _expected(5, 10.0)  # 4100
        ratio = 15000 / expected        # ≈ 3.66
        assert ratio > 1.0
        result = derive_rating(True, 15000, word_length=5, fsrs_difficulty=10.0)
        assert result == HARD

    def test_ratio_exactly_half_is_easy(self, monkeypatch):
        """ratio == 0.5 → EASY(4) (경계값)."""
        monkeypatch.setenv('RATINGS_USE_TIME_CALIBRATION', 'true')
        word_length = 10
        difficulty = 5.0
        expected = _expected(word_length, difficulty)  # 1500+1200+1000=3700
        time_at_half = int(expected * 0.5)             # 1850ms
        result = derive_rating(True, time_at_half, word_length=word_length, fsrs_difficulty=difficulty)
        assert result == EASY

    def test_ratio_just_over_half_is_good(self, monkeypatch):
        """ratio 살짝 > 0.5 → GOOD(3)."""
        monkeypatch.setenv('RATINGS_USE_TIME_CALIBRATION', 'true')
        word_length = 10
        difficulty = 5.0
        expected = _expected(word_length, difficulty)  # 3700
        time_just_over = int(expected * 0.5) + 1
        result = derive_rating(True, time_just_over, word_length=word_length, fsrs_difficulty=difficulty)
        assert result == GOOD

    def test_ratio_exactly_one_is_good(self, monkeypatch):
        """ratio == 1.0 → GOOD(3) (경계값)."""
        monkeypatch.setenv('RATINGS_USE_TIME_CALIBRATION', 'true')
        word_length = 8
        difficulty = 4.0
        expected = _expected(word_length, difficulty)  # 1500+960+800=3260
        result = derive_rating(True, int(expected), word_length=word_length, fsrs_difficulty=difficulty)
        assert result == GOOD

    def test_ratio_just_over_one_is_hard(self, monkeypatch):
        """ratio 살짝 > 1.0 → HARD(2)."""
        monkeypatch.setenv('RATINGS_USE_TIME_CALIBRATION', 'true')
        word_length = 8
        difficulty = 4.0
        expected = _expected(word_length, difficulty)  # 3260
        result = derive_rating(True, int(expected) + 1, word_length=word_length, fsrs_difficulty=difficulty)
        assert result == HARD


class TestCalibrationFallback:
    """폴백 조건 검증: word_length/fsrs_difficulty None, 또는 env=false."""

    def test_word_length_none_uses_cutoff(self, monkeypatch):
        """word_length=None → 보정 미적용, 단순 컷오프 사용."""
        monkeypatch.setenv('RATINGS_USE_TIME_CALIBRATION', 'true')
        # 5000ms 이하 → EASY
        assert derive_rating(True, 3000, word_length=None, fsrs_difficulty=5.0) == EASY
        # 7000ms → GOOD
        assert derive_rating(True, 7000, word_length=None, fsrs_difficulty=5.0) == GOOD
        # 11000ms → HARD
        assert derive_rating(True, 11000, word_length=None, fsrs_difficulty=5.0) == HARD

    def test_difficulty_none_uses_cutoff(self, monkeypatch):
        """fsrs_difficulty=None → 보정 미적용, 단순 컷오프 사용."""
        monkeypatch.setenv('RATINGS_USE_TIME_CALIBRATION', 'true')
        assert derive_rating(True, 4000, word_length=5, fsrs_difficulty=None) == EASY
        assert derive_rating(True, 8000, word_length=5, fsrs_difficulty=None) == GOOD
        assert derive_rating(True, 12000, word_length=5, fsrs_difficulty=None) == HARD

    def test_both_none_uses_cutoff(self, monkeypatch):
        """word_length=None, fsrs_difficulty=None → 폴백."""
        monkeypatch.setenv('RATINGS_USE_TIME_CALIBRATION', 'true')
        assert derive_rating(True, 5000) == EASY
        assert derive_rating(True, 10000) == GOOD
        assert derive_rating(True, 10001) == HARD

    def test_env_false_uses_cutoff(self, monkeypatch):
        """RATINGS_USE_TIME_CALIBRATION=false → 파라미터 있어도 단순 컷오프."""
        monkeypatch.setenv('RATINGS_USE_TIME_CALIBRATION', 'false')
        # word_length/difficulty 있어도 폴백
        assert derive_rating(True, 5000,  word_length=10, fsrs_difficulty=5.0) == EASY
        assert derive_rating(True, 10000, word_length=10, fsrs_difficulty=5.0) == GOOD
        assert derive_rating(True, 10001, word_length=10, fsrs_difficulty=5.0) == HARD

    def test_env_false_case_insensitive(self, monkeypatch):
        """RATINGS_USE_TIME_CALIBRATION=FALSE (대문자) → 폴백."""
        monkeypatch.setenv('RATINGS_USE_TIME_CALIBRATION', 'FALSE')
        assert derive_rating(True, 5000, word_length=5, fsrs_difficulty=5.0) == EASY

    def test_env_default_is_calibration_on(self, monkeypatch):
        """환경변수 미설정(기본값) → 보정 ON."""
        monkeypatch.delenv('RATINGS_USE_TIME_CALIBRATION', raising=False)
        # 보정 모드: len=5, diff=5.0, expected=1500+600+1000=3100ms
        # 500ms → ratio ≈ 0.16 → EASY
        result = derive_rating(True, 500, word_length=5, fsrs_difficulty=5.0)
        assert result == EASY


class TestIncorrectAlwaysAgain:
    """오답은 보정/폴백 무관하게 항상 AGAIN(1)."""

    def test_incorrect_with_calibration_params(self, monkeypatch):
        monkeypatch.setenv('RATINGS_USE_TIME_CALIBRATION', 'true')
        assert derive_rating(False, 500,   word_length=3,  fsrs_difficulty=1.0) == AGAIN
        assert derive_rating(False, 3000,  word_length=10, fsrs_difficulty=5.0) == AGAIN
        assert derive_rating(False, 20000, word_length=20, fsrs_difficulty=10.0) == AGAIN

    def test_incorrect_with_env_false(self, monkeypatch):
        monkeypatch.setenv('RATINGS_USE_TIME_CALIBRATION', 'false')
        assert derive_rating(False, 0,     word_length=5, fsrs_difficulty=5.0) == AGAIN
        assert derive_rating(False, 99999, word_length=5, fsrs_difficulty=5.0) == AGAIN

    def test_incorrect_without_params(self, monkeypatch):
        monkeypatch.delenv('RATINGS_USE_TIME_CALIBRATION', raising=False)
        assert derive_rating(False, 0)     == AGAIN
        assert derive_rating(False, 99999) == AGAIN


@pytest.mark.parametrize("word_length,difficulty,time_ms,expected_rating", [
    # 짧은 단어(len=4), diff=3.0, expected=1500+480+600=2580ms
    # 1200ms → ratio≈0.465 → EASY
    (4,  3.0, 1200,  EASY),
    # ratio≈0.775 → GOOD
    (4,  3.0, 2000,  GOOD),
    # ratio≈1.55 → HARD
    (4,  3.0, 4000,  HARD),
    # 긴 단어(len=15), diff=8.0, expected=1500+1800+1600=4900ms
    # 2000ms → ratio≈0.408 → EASY
    (15, 8.0, 2000,  EASY),
    # ratio≈0.816 → GOOD
    (15, 8.0, 4000,  GOOD),
    # ratio≈2.04 → HARD
    (15, 8.0, 10000, HARD),
])
def test_calibration_matrix(word_length, difficulty, time_ms, expected_rating, monkeypatch):
    """다양한 word_length/difficulty/time 조합 매트릭스 테스트."""
    monkeypatch.setenv('RATINGS_USE_TIME_CALIBRATION', 'true')
    result = derive_rating(True, time_ms, word_length=word_length, fsrs_difficulty=difficulty)
    expected_ms = _expected(word_length, difficulty)
    ratio = time_ms / expected_ms
    assert result == expected_rating, (
        f"word_length={word_length}, difficulty={difficulty}, time_ms={time_ms}, "
        f"expected_ms={expected_ms:.0f}, ratio={ratio:.3f} → "
        f"결과={result}, 기대={expected_rating}"
    )
