"""
converter.py — SM2 → FSRS 변환 7케이스 테스트.
"""

import pytest
from datetime import datetime, timedelta

from app.services.fsrs.converter import sm2_to_fsrs, DEFAULT_FSRS_NEW


# 공통 날짜 기준
TODAY = datetime(2026, 5, 7, 12, 0, 0)


class TestSm2ToFsrs:
    def test_1_unlearned_returns_new(self):
        """미학습 단어 (repetition=0, interval=0) → state=new."""
        sm2 = {
            "ef": 2.5, "repetition": 0, "interval": 0,
            "nextReview": None, "lastStudyDate": None, "beforeScheduleCount": 0,
        }
        result = sm2_to_fsrs(sm2, today=TODAY)
        assert result["state"] == "new"
        assert result["reps"] == 0
        assert result["stability"] == 0.0
        assert result["difficulty"] == 0.0

    def test_2_short_term_word(self):
        """단기 기억 단어 (repetition=2, interval=3)."""
        sm2 = {
            "ef": 2.3, "repetition": 2, "interval": 3,
            "nextReview": None, "lastStudyDate": None, "beforeScheduleCount": 0,
        }
        result = sm2_to_fsrs(sm2, today=TODAY)
        assert result["state"] == "review"
        assert result["stability"] == 3.0
        assert result["reps"] == 2
        # difficulty: 10 - 2*(2.3-1.3) = 10 - 2 = 8.0
        assert result["difficulty"] == pytest.approx(8.0, abs=0.01)

    def test_3_long_term_word(self):
        """장기 기억 단어 (repetition=8, interval=90)."""
        sm2 = {
            "ef": 2.1, "repetition": 8, "interval": 90,
            "nextReview": "2026-08-05", "lastStudyDate": "2026-05-06",
            "beforeScheduleCount": 0,
        }
        result = sm2_to_fsrs(sm2, today=TODAY)
        assert result["state"] == "review"
        assert result["stability"] == 90.0
        assert result["reps"] == 8
        # difficulty: 10 - 2*(2.1-1.3) = 10 - 1.6 = 8.4
        assert result["difficulty"] == pytest.approx(8.4, abs=0.01)

    def test_4_high_difficulty_low_ef(self):
        """고난이도 단어 (ef 낮음 = 1.3 최솟값)."""
        sm2 = {
            "ef": 1.3, "repetition": 3, "interval": 5,
            "nextReview": None, "lastStudyDate": None, "beforeScheduleCount": 0,
        }
        result = sm2_to_fsrs(sm2, today=TODAY)
        # difficulty: 10 - 2*(1.3-1.3) = 10.0 → clip max 10
        assert result["difficulty"] == pytest.approx(10.0, abs=0.01)
        assert result["state"] == "review"

    def test_5_after_lapse_repetition_0_interval_1(self):
        """오답 직후 상태 (repetition=0, interval=1 — lapse 후 재학습 중)."""
        sm2 = {
            "ef": 2.0, "repetition": 0, "interval": 1,
            "nextReview": None, "lastStudyDate": None, "beforeScheduleCount": 0,
        }
        # interval>0이므로 review로 변환되어야 함
        result = sm2_to_fsrs(sm2, today=TODAY)
        assert result["state"] == "review"
        assert result["stability"] == 1.0

    def test_6_last_study_date_only(self):
        """lastStudyDate만 있고 nextReview 없는 경우."""
        last_date = (TODAY - timedelta(days=5)).isoformat()
        sm2 = {
            "ef": 2.5, "repetition": 3, "interval": 7,
            "nextReview": None, "lastStudyDate": last_date, "beforeScheduleCount": 0,
        }
        result = sm2_to_fsrs(sm2, today=TODAY)
        assert result["state"] == "review"
        # last_review는 last_date 기준
        assert result["last_review"].startswith(last_date[:10])
        # next_review는 last_review + stability일
        assert result["next_review"] is not None

    def test_7_next_review_only(self):
        """nextReview만 있고 lastStudyDate 없는 경우."""
        next_date = (TODAY + timedelta(days=3)).isoformat()
        sm2 = {
            "ef": 2.2, "repetition": 4, "interval": 10,
            "nextReview": next_date, "lastStudyDate": None, "beforeScheduleCount": 0,
        }
        result = sm2_to_fsrs(sm2, today=TODAY)
        assert result["state"] == "review"
        assert result["next_review"] is not None

    def test_difficulty_clipped_to_1_10(self):
        """ef > 2.6이면 difficulty < 1 → clip to 1."""
        sm2 = {
            "ef": 3.0, "repetition": 5, "interval": 20,
            "nextReview": None, "lastStudyDate": None, "beforeScheduleCount": 0,
        }
        result = sm2_to_fsrs(sm2, today=TODAY)
        assert 1.0 <= result["difficulty"] <= 10.0

    def test_lapses_always_zero(self):
        """SM2에는 lapse 정보가 없으므로 항상 0."""
        sm2 = {
            "ef": 2.0, "repetition": 6, "interval": 30,
            "nextReview": None, "lastStudyDate": None, "beforeScheduleCount": 0,
        }
        result = sm2_to_fsrs(sm2, today=TODAY)
        assert result["lapses"] == 0

    def test_params_version_set(self):
        """params_version 필드가 설정돼야 함."""
        sm2 = {
            "ef": 2.5, "repetition": 2, "interval": 4,
            "nextReview": None, "lastStudyDate": None, "beforeScheduleCount": 0,
        }
        result = sm2_to_fsrs(sm2, today=TODAY)
        assert result["params_version"] == "default-v1"
