"""
tests/test_composer_known_word_exclusion.py — "지금 아는 단어" 제외 규칙
(streak>=3 && last_studied_at 24h 이내 → lapse/overdue/today 아닌 버킷에서 제외,
세션이 count 미만이면 약함 점수 순으로 다시 채움) 유닛 테스트.

app/services/recommend/composer.py의 _extract_known_words(내부 함수)와
compose() 공개 인터페이스를 함께 검증한다. DB 의존성 없음.
"""

import random
import datetime as dt

from app.services.recommend.pool import CandidateItem
from app.services.recommend.composer import (
    compose,
    _split_pool,
    _extract_known_words,
    _KNOWN_WORD_STREAK_THRESHOLD,
    _KNOWN_WORD_RECENCY_HOURS,
)

NOW = dt.datetime(2026, 5, 8, 12, 0, 0)


def _make_item(
    uid: int,
    bucket: str,
    *,
    streak_recent: list = None,   # mastery.recent — leading True 개수가 streak
    last_studied_at: str = None,
    next_review: str = None,
    retrievability: float = 0.5,
) -> CandidateItem:
    fsrs = {
        "state": "new" if bucket == "new" else "review",
        "difficulty": 5.0,
        "stability": 5.0,
        "retrievability": retrievability,
        "lapses": 0,
        "next_review": next_review,
    }
    return CandidateItem(
        user_voca_id=uid,
        user_voca_book_id=None,
        word=f"word{uid}",
        meanings=[{"meaning": "뜻"}],
        examples=[],
        fsrs_state=fsrs,
        bucket=bucket,
        word_length=5,
        mastery={
            "recent": streak_recent if streak_recent is not None else [],
            "streak": 0,  # get_mastery류가 아니라 여기서는 recent만 실질 반영(is_known_word가 재계산 안 하고 mastery.streak를 직접 읽음 — 아래 참고)
            "last_studied_at": last_studied_at,
        },
    )


def _known_mastery_item(uid: int, bucket: str = "short") -> CandidateItem:
    """streak>=임계값 && 24h 이내 학습 — "지금 아는 단어" 조건을 만족하는 아이템."""
    item = _make_item(uid, bucket, last_studied_at="2026-05-08T06:00:00Z")  # 6h 전
    item.mastery["streak"] = _KNOWN_WORD_STREAK_THRESHOLD  # is_known_word는 mastery.streak를 직접 읽는다
    return item


def _unknown_item(uid: int, bucket: str = "short") -> CandidateItem:
    item = _make_item(uid, bucket, last_studied_at=None)
    item.mastery["streak"] = 0
    return item


class TestExtractKnownWords:
    def test_known_word_removed_from_bucket(self):
        buckets = _split_pool([_known_mastery_item(1, "short")], lapse_ids=set())
        excluded = _extract_known_words(buckets, NOW)
        assert buckets["short"] == []
        assert [it.user_voca_id for it, _ in excluded] == [1]

    def test_unknown_word_kept_in_bucket(self):
        buckets = _split_pool([_unknown_item(1, "short")], lapse_ids=set())
        excluded = _extract_known_words(buckets, NOW)
        assert len(buckets["short"]) == 1
        assert excluded == []

    def test_overdue_bucket_never_excluded_even_if_known(self):
        """lapse/overdue/today는 streak 조건을 만족해도 제외 대상이 아니다."""
        item = _known_mastery_item(1, "overdue")
        item.fsrs_state["next_review"] = "2026-04-01T00:00:00"  # 실제로 overdue
        buckets = _split_pool([item], lapse_ids=set())
        excluded = _extract_known_words(buckets, NOW)
        assert len(buckets["overdue"]) == 1
        assert excluded == []

    def test_today_bucket_never_excluded(self):
        item = _known_mastery_item(1, "today")
        buckets = _split_pool([item], lapse_ids=set())
        excluded = _extract_known_words(buckets, NOW)
        assert len(buckets["today"]) == 1
        assert excluded == []

    def test_lapse_bucket_never_excluded(self):
        item = _known_mastery_item(1, "short")  # 원래 bucket이 short여도 lapse_ids에 있으면 lapse로 재분류
        buckets = _split_pool([item], lapse_ids={1})
        excluded = _extract_known_words(buckets, NOW)
        assert len(buckets["lapse"]) == 1
        assert excluded == []

    def test_mixed_pool_only_known_ones_removed(self):
        known = _known_mastery_item(1, "medium")
        unknown = _unknown_item(2, "medium")
        buckets = _split_pool([known, unknown], lapse_ids=set())
        excluded = _extract_known_words(buckets, NOW)
        assert [it.user_voca_id for it in buckets["medium"]] == [2]
        assert [it.user_voca_id for it, _ in excluded] == [1]


class TestComposeRefillsWhenPoolTooSmall:
    def test_all_known_pool_still_fills_session(self):
        """
        후보 전부가 "지금 아는 단어"라도(제외하면 0개) 세션이 완전히 비지 않고
        약함 점수 순으로 다시 채워진다 — 빈 세션 방지.
        """
        random.seed(0)
        pool = [_known_mastery_item(i, "short") for i in range(1, 6)]
        result = compose(pool, 5, selection='recommended', full_recommend=True)
        assert len(result['items']) == 5
        assert {it.user_voca_id for it in result['items']} == {1, 2, 3, 4, 5}

    def test_known_word_excluded_when_enough_other_candidates(self):
        """
        제외해도 채울 만큼 후보가 충분하면 "아는 단어"는 세션에 들어가지 않는다.
        """
        random.seed(0)
        known = _known_mastery_item(1, "short")
        plenty_unknown = [_unknown_item(i, "short") for i in range(2, 12)]  # 10개
        pool = [known] + plenty_unknown
        result = compose(pool, 5, selection='recommended', full_recommend=True)
        selected_ids = {it.user_voca_id for it in result['items']}
        assert 1 not in selected_ids
        assert len(result['items']) == 5

    def test_partial_shortfall_refills_only_the_gap(self):
        """
        비-known 후보가 count보다 적을 때만 그 부족분만큼 known 풀에서 채운다.
        """
        random.seed(0)
        known = [_known_mastery_item(i, "short") for i in range(1, 4)]     # 3개(제외 대상)
        unknown = [_unknown_item(i, "short") for i in range(11, 13)]        # 2개(정상 후보)
        pool = known + unknown
        result = compose(pool, 4, selection='recommended', full_recommend=True)
        # 정상 후보 2개 + known 중 부족분 2개 = 총 4개
        assert len(result['items']) == 4
        selected_ids = {it.user_voca_id for it in result['items']}
        assert {11, 12}.issubset(selected_ids)
