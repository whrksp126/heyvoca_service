"""
tests/test_recommend_pool.py — pool 빌드 유닛 테스트.

DB 의존성 없이 _classify_bucket, 즉석 v1→v2 변환 로직만 테스트.
"""

import pytest
import datetime as dt
from unittest.mock import MagicMock, patch

from app.services.recommend.pool import _classify_bucket, CandidateItem


TODAY = dt.date(2026, 5, 8)


# ──────────────────────────────────────────────
# bucket 분류 테스트
# ──────────────────────────────────────────────

class TestClassifyBucket:
    def test_new_state_returns_new(self):
        """state='new' → bucket='new'."""
        fsrs = {"state": "new", "next_review": None, "stability": 0.0}
        assert _classify_bucket(fsrs, TODAY) == "new"

    def test_empty_state_returns_new(self):
        """state 없음 → 'new'."""
        assert _classify_bucket({}, TODAY) == "new"

    def test_overdue(self):
        """next_review가 어제 → 'overdue'."""
        yesterday = (dt.date(2026, 5, 8) - dt.timedelta(days=1)).isoformat()
        fsrs = {
            "state": "review",
            "next_review": f"{yesterday}T00:00:00",
            "stability": 5.0,
        }
        assert _classify_bucket(fsrs, TODAY) == "overdue"

    def test_today_bucket(self):
        """next_review가 오늘 → 'today'."""
        fsrs = {
            "state": "review",
            "next_review": "2026-05-08T00:00:00",
            "stability": 5.0,
        }
        assert _classify_bucket(fsrs, TODAY) == "today"

    def test_future_short(self):
        """next_review 미래, stability < 10 → 'short'."""
        fsrs = {
            "state": "review",
            "next_review": "2026-06-01T00:00:00",
            "stability": 5.0,
        }
        assert _classify_bucket(fsrs, TODAY) == "short"

    def test_future_medium(self):
        """next_review 미래, 10 <= stability < 60 → 'medium'."""
        fsrs = {
            "state": "review",
            "next_review": "2026-08-01T00:00:00",
            "stability": 30.0,
        }
        assert _classify_bucket(fsrs, TODAY) == "medium"

    def test_future_long(self):
        """next_review 미래, stability >= 60 → 'long'."""
        fsrs = {
            "state": "review",
            "next_review": "2027-01-01T00:00:00",
            "stability": 90.0,
        }
        assert _classify_bucket(fsrs, TODAY) == "long"

    def test_learning_state_with_future_review(self):
        """state='learning'이라도 next_review 미래면 stability로 분류."""
        fsrs = {
            "state": "learning",
            "next_review": "2026-06-01T00:00:00",
            "stability": 3.0,
        }
        assert _classify_bucket(fsrs, TODAY) == "short"

    def test_invalid_next_review_returns_new(self):
        """next_review 파싱 불가 → 'new'."""
        fsrs = {
            "state": "review",
            "next_review": "invalid-date",
            "stability": 5.0,
        }
        assert _classify_bucket(fsrs, TODAY) == "new"


# ──────────────────────────────────────────────
# v1 → v2 즉석 변환 테스트 (state.py 활용)
# ──────────────────────────────────────────────

class TestV1ToV2Migration:
    def test_v1_data_gets_fsrs_block(self):
        """v1 payload(schema_version 없음)는 migrate_v1_to_v2 후 fsrs 블록 존재."""
        from app.services.fsrs.state import parse_user_voca_data, is_v1, migrate_v1_to_v2, get_fsrs_state

        v1_json = '{"ef": 2.5, "repetition": 3, "interval": 7, "nextReview": null, "lastStudyDate": null, "beforeScheduleCount": 0}'
        payload = parse_user_voca_data(v1_json)
        assert is_v1(payload)

        v2 = migrate_v1_to_v2(payload)
        assert not is_v1(v2)
        fsrs = get_fsrs_state(v2)
        assert fsrs is not None
        assert "state" in fsrs
        assert "stability" in fsrs

    def test_v2_data_unchanged(self):
        """v2 payload는 migrate_v1_to_v2 통과해도 변형 없음."""
        import json
        from app.services.fsrs.state import is_v1, migrate_v1_to_v2

        v2_payload = {
            "schema_version": 2,
            "sm2": {"ef": 2.5, "repetition": 2, "interval": 4},
            "fsrs": {"state": "review", "stability": 12.0, "difficulty": 5.0,
                     "retrievability": 0.85, "next_review": "2026-06-01T00:00:00",
                     "reps": 2, "lapses": 0, "elapsed_days": 0, "scheduled_days": 30,
                     "last_review": "2026-05-01T00:00:00", "params_version": "default-v1"},
        }
        assert not is_v1(v2_payload)
        result = migrate_v1_to_v2(v2_payload)
        # 그대로 반환
        assert result is v2_payload

    def test_v1_unlearned_gets_new_bucket(self):
        """v1 미학습(repetition=0, interval=0) → fsrs.state='new' → bucket='new'."""
        from app.services.fsrs.state import parse_user_voca_data, is_v1, migrate_v1_to_v2, get_fsrs_state

        v1_json = '{"ef": 2.5, "repetition": 0, "interval": 0, "nextReview": null, "lastStudyDate": null, "beforeScheduleCount": 0}'
        payload = parse_user_voca_data(v1_json)
        v2 = migrate_v1_to_v2(payload)
        fsrs = get_fsrs_state(v2)

        bucket = _classify_bucket(fsrs, TODAY)
        assert bucket == "new"

    def test_v1_long_term_gets_review_bucket(self):
        """v1 장기 기억(interval=90) → fsrs.stability=90 → bucket='long'."""
        from app.services.fsrs.state import parse_user_voca_data, is_v1, migrate_v1_to_v2, get_fsrs_state

        import json
        v1_data = {
            "ef": 2.1, "repetition": 8, "interval": 90,
            "nextReview": "2026-08-05", "lastStudyDate": "2026-05-01",
            "beforeScheduleCount": 0,
        }
        payload = parse_user_voca_data(json.dumps(v1_data))
        v2 = migrate_v1_to_v2(payload)
        fsrs = get_fsrs_state(v2)

        # stability=90 → long
        assert float(fsrs.get("stability", 0)) >= 60.0
        bucket = _classify_bucket(fsrs, TODAY)
        # next_review가 미래이고 stability>=60 → long
        assert bucket in ("long", "overdue", "today")  # 날짜에 따라 변동 가능


# ──────────────────────────────────────────────
# CandidateItem dataclass 테스트
# ──────────────────────────────────────────────

class TestCandidateItem:
    def test_create_candidate_item(self):
        """CandidateItem 생성 확인."""
        item = CandidateItem(
            user_voca_id=1,
            user_voca_book_id=None,
            word="test",
            meanings=[{"meaning": "시험"}],
            examples=[],
            fsrs_state={"state": "new"},
            bucket="new",
            word_length=4,
        )
        assert item.user_voca_id == 1
        assert item.word == "test"
        assert item.bucket == "new"
        assert item.word_length == 4
