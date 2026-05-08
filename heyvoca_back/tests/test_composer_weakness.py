"""
tests/test_composer_weakness.py — 약점 유형 우선 출제 검증.

UserQuestionTypeStat에서 correct_rate < 0.6 AND samples >= 10 인 question_type을
suggested_question_type으로 우선 부여하는지 확인.
DB 의존성 없음.
"""

import pytest
from uuid import uuid4

from app.services.recommend.pool import CandidateItem
from app.services.recommend.composer import (
    compose,
    _apply_intra_day_and_weakness,
    _get_weakness_types,
    _assign_suggested_question_type,
)


def _make_item(uid: int, bucket: str = "overdue",
               meanings: list = None, examples: list = None) -> CandidateItem:
    fsrs = {
        "state": "review",
        "stability": 5.0,
        "retrievability": 0.7,
        "next_review": "2026-04-01T00:00:00",
    }
    return CandidateItem(
        user_voca_id=uid,
        user_voca_book_id=None,
        word=f"word{uid}",
        meanings=meanings if meanings is not None else [{"meaning": "뜻"}],
        examples=examples if examples is not None else [],
        fsrs_state=fsrs,
        bucket=bucket,
        word_length=5,
    )


class TestGetWeaknessTypes:
    def test_extracts_weak_types(self):
        """correct_rate < 0.6 AND samples >= 10 → 약점 목록에 포함."""
        user_stats = {
            "weakness_types": [
                {"question_type": "multipleChoiceListening", "correct_rate": 0.42, "samples": 87},
                {"question_type": "fillInTheBlank", "correct_rate": 0.55, "samples": 15},
                {"question_type": "multipleChoice", "correct_rate": 0.80, "samples": 200},
            ]
        }
        result = _get_weakness_types(user_stats)
        assert "multipleChoiceListening" in result
        assert "fillInTheBlank" in result
        assert "multipleChoice" not in result

    def test_excludes_low_samples(self):
        """samples < 10 → 약점에서 제외."""
        user_stats = {
            "weakness_types": [
                {"question_type": "cardMatch", "correct_rate": 0.30, "samples": 5},
            ]
        }
        result = _get_weakness_types(user_stats)
        assert "cardMatch" not in result

    def test_empty_weakness(self):
        """weakness_types 없으면 빈 리스트."""
        assert _get_weakness_types({}) == []
        assert _get_weakness_types(None) == []

    def test_boundary_correct_rate(self):
        """경계값: correct_rate == 0.6 → 약점 아님 (미만만 약점)."""
        user_stats = {
            "weakness_types": [
                {"question_type": "cardMatch", "correct_rate": 0.60, "samples": 20},
                {"question_type": "cardMatchListening", "correct_rate": 0.59, "samples": 20},
            ]
        }
        result = _get_weakness_types(user_stats)
        assert "cardMatch" not in result
        assert "cardMatchListening" in result


class TestAssignSuggestedQuestionType:
    def test_weakness_type_preferred(self):
        """약점 유형이 단어에서 지원 가능하면 우선 배정."""
        item = _make_item(1, meanings=[{"m": "뜻"}], examples=[{"e": "예문"}])
        weakness_types = ["multipleChoiceListening"]
        result = _assign_suggested_question_type(item, weakness_types, set())
        assert result == "multipleChoiceListening"

    def test_weakness_type_skipped_if_avoided(self):
        """약점 유형이 avoid_types에 포함되면 다음 유형으로."""
        item = _make_item(1, meanings=[{"m": "뜻"}])
        weakness_types = ["multipleChoiceListening"]
        avoid = {"multipleChoiceListening"}
        result = _assign_suggested_question_type(item, weakness_types, avoid)
        assert result != "multipleChoiceListening"
        assert result is not None

    def test_no_weakness_returns_any_supported_type(self):
        """약점 없으면 지원 가능한 첫 번째 유형."""
        item = _make_item(1, meanings=[{"m": "뜻"}])
        result = _assign_suggested_question_type(item, [], set())
        # 지원 가능한 유형 중 하나
        assert result in {
            'multipleChoice', 'multipleChoiceListening',
            'fillInTheBlank', 'cardMatch', 'cardMatchListening',
        }

    def test_multiple_weakness_types_first_usable(self):
        """여러 약점 중 처음 지원 가능한 것이 배정됨."""
        item = _make_item(1, meanings=[{"m": "뜻"}])
        weakness_types = ["cardMatch", "multipleChoiceListening"]
        result = _assign_suggested_question_type(item, weakness_types, set())
        assert result == "cardMatch"


class TestComposeWithWeakness:
    def _make_pool(self, n: int = 10) -> list:
        return [_make_item(i, "overdue") for i in range(1, n + 1)]

    def test_weakness_reflected_in_enriched_items(self):
        """
        compose() 결과의 enriched_items에 weakness 기반 suggested_question_type이 포함됨.
        """
        pool = self._make_pool(10)
        user_stats = {
            "recent_7d_correct_rate": 0.75,
            "recent_7d_total": 50,
            "weakness_types": [
                {"question_type": "multipleChoiceListening", "correct_rate": 0.40, "samples": 20},
            ],
            "today_seen": {},
        }
        result = compose(pool, 10, 'daily', user_stats=user_stats)
        enriched = result['enriched_items']
        assert len(enriched) > 0

        # 적어도 하나는 weakness 유형이 배정되어야 함
        weakness_assigned = [
            e for e in enriched
            if e['suggested_question_type'] == 'multipleChoiceListening'
        ]
        assert len(weakness_assigned) > 0

    def test_composition_strategy_includes_weakness_types(self):
        """composition_strategy에 weakness_types 포함."""
        pool = self._make_pool(5)
        user_stats = {
            "recent_7d_correct_rate": 0.75,
            "recent_7d_total": 50,
            "weakness_types": [
                {"question_type": "fillInTheBlank", "correct_rate": 0.45, "samples": 30},
            ],
            "today_seen": {},
        }
        result = compose(pool, 5, 'daily', user_stats=user_stats)
        strategy = result['composition_strategy']
        assert 'weakness_types' in strategy
        assert 'fillInTheBlank' in strategy['weakness_types']

    def test_no_weakness_no_impact(self):
        """약점 없으면 suggested_question_type은 정상 유형 중 하나."""
        pool = self._make_pool(5)
        user_stats = {
            "recent_7d_correct_rate": 0.80,
            "recent_7d_total": 50,
            "weakness_types": [],
            "today_seen": {},
        }
        result = compose(pool, 5, 'daily', user_stats=user_stats)
        for enriched in result['enriched_items']:
            qt = enriched['suggested_question_type']
            assert qt is None or qt in {
                'multipleChoice', 'multipleChoiceListening',
                'fillInTheBlank', 'cardMatch', 'cardMatchListening',
            }
