"""
tests/test_recommend_weakness_score.py — 약함 점수(weakness score) 관련 유닛 테스트.

compute_weakness / is_known_word / rank_by_weakness / weighted_sample_without_replacement
(app/services/recommend/ranking.py, 2026-09 추가). DB 의존성 없음.
"""

import random
import datetime as dt

from app.services.recommend.pool import CandidateItem
from app.services.recommend.ranking import (
    compute_weakness,
    is_known_word,
    rank_by_weakness,
    weighted_sample_without_replacement,
)

NOW = dt.datetime(2026, 5, 8, 12, 0, 0)


def _leading_streak(recent: list) -> int:
    """실제 파이프라인에서는 state.get_mastery()가 항상 recent로부터 streak를 재계산해
    CandidateItem.mastery에 실어 온다 — 테스트 헬퍼도 동일하게 맞춘다(그렇지 않으면
    streak=0 고정이라 is_known_word가 항상 False가 되는 테스트 버그가 생긴다)."""
    streak = 0
    for v in (recent or []):
        if v:
            streak += 1
        else:
            break
    return streak


def _make_item(
    uid: int,
    *,
    difficulty: float = 5.0,
    retrievability: float = 0.8,
    lapses: int = 0,
    recent: list = None,
    last_studied_at: str = None,
) -> CandidateItem:
    fsrs = {
        "state": "review",
        "difficulty": difficulty,
        "stability": 5.0,
        "retrievability": retrievability,
        "lapses": lapses,
    }
    return CandidateItem(
        user_voca_id=uid,
        user_voca_book_id=None,
        word=f"word{uid}",
        meanings=[],
        examples=[],
        fsrs_state=fsrs,
        bucket="short",
        word_length=5,
        mastery={
            "recent": recent if recent is not None else [],
            "streak": _leading_streak(recent),
            "last_studied_at": last_studied_at,
        },
    )


class TestComputeWeakness:
    def test_score_in_unit_range(self):
        item = _make_item(1, difficulty=8.0, retrievability=0.3, lapses=5, recent=[False, False, True])
        score = compute_weakness(item, NOW)
        assert 0.0 <= score <= 1.0

    def test_lower_recent_acc_increases_weakness(self):
        weak_item = _make_item(1, recent=[False, False, False, False, False])
        strong_item = _make_item(2, recent=[True, True, True, True, True])
        assert compute_weakness(weak_item, NOW) > compute_weakness(strong_item, NOW)

    def test_higher_difficulty_increases_weakness(self):
        hard = _make_item(1, difficulty=9.0)
        easy = _make_item(2, difficulty=1.0)
        assert compute_weakness(hard, NOW) > compute_weakness(easy, NOW)

    def test_more_lapses_increases_weakness(self):
        many_lapses = _make_item(1, lapses=10)
        no_lapses = _make_item(2, lapses=0)
        assert compute_weakness(many_lapses, NOW) > compute_weakness(no_lapses, NOW)

    def test_lower_retrievability_increases_weakness(self):
        forgetting_soon = _make_item(1, retrievability=0.1)
        fresh = _make_item(2, retrievability=0.95)
        assert compute_weakness(forgetting_soon, NOW) > compute_weakness(fresh, NOW)

    def test_no_recent_history_is_neutral_not_zero(self):
        """recent가 비어 있으면(신규 편입) 실패율을 0으로도 1로도 취급하지 않는다(중립 0.5)."""
        no_history = _make_item(1, recent=[])
        all_correct = _make_item(2, recent=[True, True, True, True, True])
        # recent_acc 중립(0.5) → 실패율 성분 0.5 vs all_correct의 0.0 → 이력 없는 쪽이 더 취약 취급
        assert compute_weakness(no_history, NOW) > compute_weakness(all_correct, NOW)

    def test_recency_penalty_24h_vs_old(self):
        recent_study = _make_item(1, last_studied_at="2026-05-08T00:00:00Z")  # 12h 전
        old_study = _make_item(2, last_studied_at="2026-04-01T00:00:00Z")     # 72h 훌쩍 지남
        # recency_penalty는 감점 항(2026-09 정정) — "최근에 본 단어는 순위를 뒤로"이므로
        # 최근에 학습한 쪽의 weakness가 더 낮아야 한다.
        assert compute_weakness(recent_study, NOW) < compute_weakness(old_study, NOW)

    def test_recency_penalty_does_not_push_score_below_zero(self):
        """recency 감점이 다른 항의 합보다 커도 최종 점수는 0 미만으로 내려가지 않는다."""
        item = _make_item(
            1,
            difficulty=1.0, retrievability=0.98, lapses=0,
            recent=[True, True, True, True, True],
            last_studied_at="2026-05-08T11:00:00Z",  # 1h 전 — recency_penalty=1.0(최대)
        )
        assert compute_weakness(item, NOW) >= 0.0


class TestIsKnownWord:
    def test_streak_below_threshold_not_known(self):
        item = _make_item(1, recent=[True, True, False])  # streak=2
        assert is_known_word(item, NOW) is False

    def test_streak_met_but_too_long_ago_not_known(self):
        item = _make_item(1, recent=[True, True, True], last_studied_at="2026-04-01T00:00:00Z")
        assert is_known_word(item, NOW) is False

    def test_streak_met_and_recent_is_known(self):
        item = _make_item(1, recent=[True, True, True], last_studied_at="2026-05-08T00:00:00Z")  # 12h 전
        assert is_known_word(item, NOW) is True

    def test_exactly_24h_boundary_is_known(self):
        item = _make_item(1, recent=[True, True, True], last_studied_at="2026-05-07T12:00:00Z")  # 정확히 24h
        assert is_known_word(item, NOW) is True

    def test_no_last_studied_at_not_known(self):
        item = _make_item(1, recent=[True, True, True], last_studied_at=None)
        assert is_known_word(item, NOW) is False

    def test_custom_threshold(self):
        item = _make_item(1, recent=[True, True], last_studied_at="2026-05-08T00:00:00Z")  # streak=2
        assert is_known_word(item, NOW, streak_threshold=2) is True
        assert is_known_word(item, NOW, streak_threshold=3) is False


class TestRankByWeakness:
    def test_sorted_descending(self):
        weak = _make_item(1, recent=[False, False, False])
        mid = _make_item(2, recent=[True, False])
        strong = _make_item(3, recent=[True, True, True, True, True])
        result = rank_by_weakness([mid, strong, weak], NOW)
        assert [it.user_voca_id for it in result] == [1, 2, 3]

    def test_original_not_mutated(self):
        items = [_make_item(1, recent=[False]), _make_item(2, recent=[True])]
        original_order = [it.user_voca_id for it in items]
        rank_by_weakness(items, NOW)
        assert [it.user_voca_id for it in items] == original_order


class TestWeightedSampleWithoutReplacement:
    def test_returns_k_unique_items(self):
        items = [_make_item(i, recent=[False] * (i % 5)) for i in range(1, 11)]
        rng = random.Random(42)
        picked = weighted_sample_without_replacement(items, NOW, 4, rng=rng)
        assert len(picked) == 4
        assert len(set(it.user_voca_id for it in picked)) == 4

    def test_k_greater_than_pool_returns_all(self):
        items = [_make_item(i) for i in range(1, 4)]
        rng = random.Random(1)
        picked = weighted_sample_without_replacement(items, NOW, 10, rng=rng)
        assert len(picked) == 3

    def test_k_zero_returns_empty(self):
        items = [_make_item(1)]
        assert weighted_sample_without_replacement(items, NOW, 0) == []

    def test_empty_pool_returns_empty(self):
        assert weighted_sample_without_replacement([], NOW, 3) == []

    def test_deterministic_with_seeded_rng(self):
        items = [_make_item(i, recent=[False] * (i % 3)) for i in range(1, 8)]
        picked_a = weighted_sample_without_replacement(items, NOW, 3, rng=random.Random(7))
        picked_b = weighted_sample_without_replacement(items, NOW, 3, rng=random.Random(7))
        assert [it.user_voca_id for it in picked_a] == [it.user_voca_id for it in picked_b]

    def test_higher_weakness_selected_more_often_over_many_trials(self):
        """
        가중 샘플링이 실제로 약함 점수에 비례하는지 대략적으로 검증 —
        압도적으로 약한 단어 1개 vs 압도적으로 강한 단어 9개 중 1개를 뽑으면
        절대다수는 약한 단어가 나와야 한다(확률적 검증이라 넉넉한 여유를 둔다).
        """
        very_weak = _make_item(1, recent=[False] * 5, difficulty=9.5, lapses=10, retrievability=0.05)
        strong_pool = [
            _make_item(i, recent=[True] * 5, difficulty=1.0, lapses=0, retrievability=0.98)
            for i in range(2, 11)
        ]
        pool = [very_weak] + strong_pool
        rng = random.Random(123)
        weak_picked_count = 0
        trials = 200
        for _ in range(trials):
            picked = weighted_sample_without_replacement(pool, NOW, 1, rng=rng)
            if picked[0].user_voca_id == 1:
                weak_picked_count += 1
        # 균등 랜덤이면 대략 10%(1/10)일 텐데, 가중 샘플링이면 훨씬 높아야 한다.
        assert weak_picked_count > trials * 0.3
