import json

from app.services.bookstore_recommend import (
    build_mastery_stats,
    build_target_mix,
    calc_level_fit,
    calc_popularity,
    determine_official_level,
    is_attempted_word,
    is_mastered_word,
    score_book,
)


def _row(level_id: int, *, state="review", reps=2, stability=30.0):
    return {
        "level_id": level_id,
        "data": json.dumps(
            {
                "schema_version": 3,
                "fsrs": {
                    "state": state,
                    "reps": reps,
                    "stability": stability,
                    "retrievability": 0.8,
                    "next_review": "2026-06-10T00:00:00",
                },
            },
            ensure_ascii=False,
        ),
    }


class TestWordStateRules:
    def test_attempted_requires_non_new_or_reps(self):
        assert not is_attempted_word({"state": "new", "reps": 0})
        assert is_attempted_word({"state": "review", "reps": 0})
        assert is_attempted_word({"state": "new", "reps": 1})

    def test_mastered_requires_stability_and_reps(self):
        assert is_mastered_word({"state": "review", "reps": 2, "stability": 21})
        assert not is_mastered_word({"state": "review", "reps": 1, "stability": 50})
        assert not is_mastered_word({"state": "review", "reps": 3, "stability": 10})


class TestBuildMasteryStats:
    def test_counts_attempted_and_mastered_by_level(self):
        rows = [
            _row(1, state="review", reps=2, stability=30),
            _row(1, state="review", reps=1, stability=30),
            _row(2, state="new", reps=0, stability=0),
        ]

        mastery = build_mastery_stats(rows)

        assert mastery[1]["total_words"] == 2
        assert mastery[1]["attempted_words"] == 2
        assert mastery[1]["mastered_words"] == 1
        assert mastery[1]["mastery_rate"] == 0.5
        assert mastery[2]["total_words"] == 1
        assert mastery[2]["attempted_words"] == 0
        assert mastery[2]["mastery_rate"] == 0.0


class TestDetermineOfficialLevel:
    def test_uses_signup_when_no_valid_data(self):
        mastery = {
            1: {"total_words": 3, "attempted_words": 5, "mastered_words": 4, "mastery_rate": 0.8},
            2: {"total_words": 0, "attempted_words": 0, "mastered_words": 0, "mastery_rate": 0.0},
            3: {"total_words": 0, "attempted_words": 0, "mastered_words": 0, "mastery_rate": 0.0},
            4: {"total_words": 0, "attempted_words": 0, "mastered_words": 0, "mastery_rate": 0.0},
        }
        result = determine_official_level(mastery, 2)
        assert result["level_id"] == 2
        assert result["source"] == "signup"

    def test_promotes_to_highest_mastered_level(self):
        mastery = {
            1: {"total_words": 50, "attempted_words": 40, "mastered_words": 36, "mastery_rate": 0.9},
            2: {"total_words": 50, "attempted_words": 30, "mastered_words": 24, "mastery_rate": 0.8},
            3: {"total_words": 50, "attempted_words": 20, "mastered_words": 10, "mastery_rate": 0.5},
            4: {"total_words": 0, "attempted_words": 0, "mastered_words": 0, "mastery_rate": 0.0},
        }
        result = determine_official_level(mastery, 1)
        assert result["level_id"] == 2
        assert result["source"] == "mastery"

    def test_marks_learning_when_only_attempt_volume_exists(self):
        mastery = {
            1: {"total_words": 50, "attempted_words": 25, "mastered_words": 5, "mastery_rate": 0.2},
            2: {"total_words": 60, "attempted_words": 35, "mastered_words": 10, "mastery_rate": 0.2857},
            3: {"total_words": 0, "attempted_words": 0, "mastered_words": 0, "mastery_rate": 0.0},
            4: {"total_words": 0, "attempted_words": 0, "mastered_words": 0, "mastery_rate": 0.0},
        }
        result = determine_official_level(mastery, 1)
        assert result["level_id"] == 2
        assert result["source"] == "learning"


class TestBuildTargetMix:
    def test_returns_single_level_when_samples_are_low(self):
        mix = build_target_mix(1, {"attempted_words": 10, "mastery_rate": 0.9})
        assert mix == [{"level_id": 1, "weight": 1.0}]

    def test_low_mastery_keeps_current_level(self):
        mix = build_target_mix(2, {"attempted_words": 20, "mastery_rate": 0.4})
        assert mix == [
            {"level_id": 2, "weight": 0.8},
            {"level_id": 1, "weight": 0.2},
        ]

    def test_mid_mastery_mixes_next_level(self):
        mix = build_target_mix(1, {"attempted_words": 20, "mastery_rate": 0.7})
        assert mix == [
            {"level_id": 1, "weight": 0.6},
            {"level_id": 2, "weight": 0.4},
        ]

    def test_high_mastery_prefers_next_level(self):
        mix = build_target_mix(3, {"attempted_words": 20, "mastery_rate": 0.85})
        assert mix == [
            {"level_id": 3, "weight": 0.3},
            {"level_id": 4, "weight": 0.7},
        ]


class TestRecommendationScore:
    def test_level_fit_uses_weighted_mix(self):
        target_mix = [
            {"level_id": 1, "weight": 0.3},
            {"level_id": 2, "weight": 0.7},
        ]
        assert calc_level_fit(target_mix, 2) > calc_level_fit(target_mix, 1)
        assert calc_level_fit(target_mix, 4) < calc_level_fit(target_mix, 2)

    def test_popularity_is_normalized(self):
        assert calc_popularity(0, 100) == 0.0
        assert calc_popularity(100, 100) == 1.0

    def test_owned_books_receive_large_penalty(self):
        target_mix = [{"level_id": 2, "weight": 1.0}]
        book = {
            "id": 10,
            "name": "중등 단어장",
            "downloads": 100,
            "category": "기초",
            "color": {},
            "gem": 10,
            "level_id": 2,
            "owned": False,
        }
        owned_book = dict(book)
        owned_book["owned"] = True

        scored = score_book(book, target_mix, 100)
        scored_owned = score_book(owned_book, target_mix, 100)

        assert scored["score"] > scored_owned["score"]
