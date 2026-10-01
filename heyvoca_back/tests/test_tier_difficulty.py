"""
tests/test_tier_difficulty.py — "출제형 문제 1단계" 난이도(tier) 오르내리기 순수 함수 테스트.

DB 의존성 없음 — CandidateItem을 직접 구성하고 puzzle은 dict로 흉내낸다.
"""

import random

from app.constants.question_types import (
    QUESTION_TYPE_TIER, TIER_QUESTION_TYPES, CROP_STAGE_MAX_TIER, RECOMMENDABLE_QUESTION_TYPES,
)
from app.services.recommend.pool import CandidateItem
from app.services.recommend.composer import (
    _item_can_use_question_type, _max_tier_for_item, _compute_target_tier,
    _pick_shown_tier, _pick_type_at_tier, _assign_tiered_question_type,
    _assign_restricted_question_type, _enrich_items, compose,
)


PUZZLE = {
    'example_id':         1,
    'tokens':             ['I', 'need', 'to', 'check', 'in', 'for', 'my', 'flight', 'online'],
    'target_idx':         [3, 4],
    'first_form':         'i',
    'alt_orders':         [],
    'distractors':        ['book', 'cancel'],
    'listen_distractors': ['look', 'out'],
    'skip_reason':        None,
}


def _make_item(fsrs_state=None, examples=None, example_puzzles=None, meanings=None,
               tier_state=None) -> CandidateItem:
    return CandidateItem(
        user_voca_id=1,
        user_voca_book_id=None,
        word='check in',
        meanings=meanings if meanings is not None else ['체크인하다'],
        examples=examples or [],
        fsrs_state=fsrs_state or {'state': 'new', 'stability': 0.0, 'retrievability': 0.0, 'next_review': None},
        bucket='new',
        word_length=8,
        example_puzzles=example_puzzles or [],
        tier_state=tier_state,
    )


TAGGED_EXAMPLE = {
    'origin':  'I need to <strong class="target-word">check in</strong> for my flight online.',
    'meaning': '비행기 온라인 <strong class="target-word">체크인</strong>을 해야 해요.',
}


# ──────────────────────────────────────────────
# 상수 정합성 — tier 표는 RECOMMENDABLE_QUESTION_TYPES와 어긋나면 안 된다
# ──────────────────────────────────────────────

class TestTierConstants:
    def test_typing_in_tier4_and_tier5(self):
        assert 'fillInTheBlankTyping' in TIER_QUESTION_TYPES[4]
        assert 'fillInTheBlankTyping' in TIER_QUESTION_TYPES[5]

    def test_every_recommendable_type_has_a_tier(self):
        for qt in RECOMMENDABLE_QUESTION_TYPES:
            assert qt in QUESTION_TYPE_TIER, f'{qt}에 tier가 없음'

    def test_tier_question_types_is_reverse_of_question_type_tier(self):
        rebuilt = {}
        for qt, tier in QUESTION_TYPE_TIER.items():
            rebuilt.setdefault(tier, []).append(qt)
        for tier, types in TIER_QUESTION_TYPES.items():
            # fillInTheBlankTyping 은 대표 tier(4) 외에 tier 5 에도 노출되는 유일한 예외
            expected = set(rebuilt.get(tier, []))
            if tier == 5:
                expected.add('fillInTheBlankTyping')
            assert set(types) == expected, f'tier {tier} 불일치'

    def test_crop_stage_max_tier_covers_all_stages(self):
        from app.services.recommend.stage import CROP_STAGES
        for stage in CROP_STAGES:
            assert stage in CROP_STAGE_MAX_TIER


# ──────────────────────────────────────────────
# _item_can_use_question_type — 새 4종
# ──────────────────────────────────────────────

class TestItemCanUseNewTypes:
    def test_arrange_types_require_usable_puzzle(self):
        item = _make_item(examples=[TAGGED_EXAMPLE], example_puzzles=[None])
        for qt in ('sentenceArrangePartial', 'sentenceArrange', 'listenArrange'):
            assert _item_can_use_question_type(item, qt) is False

    def test_arrange_types_allowed_with_usable_puzzle(self):
        item = _make_item(examples=[TAGGED_EXAMPLE], example_puzzles=[PUZZLE])
        for qt in ('sentenceArrangePartial', 'sentenceArrange', 'listenArrange'):
            assert _item_can_use_question_type(item, qt) is True

    def test_arrange_types_blocked_by_skip_reason(self):
        skipped = dict(PUZZLE, skip_reason='ambiguous')
        item = _make_item(examples=[TAGGED_EXAMPLE], example_puzzles=[skipped])
        assert _item_can_use_question_type(item, 'sentenceArrange') is False

    def test_typing_requires_target_tag_like_fill_in_the_blank(self):
        untagged = _make_item(examples=[{'origin': 'no tag here.', 'meaning': 'x'}])
        tagged = _make_item(examples=[TAGGED_EXAMPLE])
        assert _item_can_use_question_type(untagged, 'fillInTheBlankTyping') is False
        assert _item_can_use_question_type(tagged, 'fillInTheBlankTyping') is True


# ──────────────────────────────────────────────
# _max_tier_for_item — crop_stage 기반
# ──────────────────────────────────────────────

class TestMaxTierForItem:
    def test_new_word_is_tier_1(self):
        item = _make_item(fsrs_state={'state': 'new', 'stability': 0.0, 'next_review': None})
        assert _max_tier_for_item(item) == 1

    def test_carrot_stage_is_tier_5(self):
        item = _make_item(fsrs_state={
            'state': 'review', 'stability': 999.0, 'next_review': '2099-01-01T00:00:00Z',
        })
        assert _max_tier_for_item(item) == 5


# ──────────────────────────────────────────────
# _compute_target_tier — 정해진 난이도 오르내리기
# ──────────────────────────────────────────────

class TestComputeTargetTier:
    def test_no_history_is_max_minus_1(self):
        assert _compute_target_tier(None, 5) == 4
        assert _compute_target_tier(None, 1) == 1  # 최소 1 보장

    def test_legacy_state_without_tier_target_treated_as_first_time(self):
        state = {'tier_target': None, 'tier_shown': None, 'was_correct': True}
        assert _compute_target_tier(state, 4) == 3

    def test_correct_at_target_tier_increments(self):
        state = {'tier_target': 3, 'tier_shown': 3, 'was_correct': True}
        assert _compute_target_tier(state, 5) == 4

    def test_correct_at_easier_shown_tier_stays(self):
        state = {'tier_target': 3, 'tier_shown': 1, 'was_correct': True}
        assert _compute_target_tier(state, 5) == 3

    def test_wrong_decrements(self):
        state = {'tier_target': 3, 'tier_shown': 3, 'was_correct': False}
        assert _compute_target_tier(state, 5) == 2

    def test_clamped_to_max_tier(self):
        state = {'tier_target': 5, 'tier_shown': 5, 'was_correct': True}
        assert _compute_target_tier(state, 3) == 3

    def test_clamped_floor_at_1(self):
        state = {'tier_target': 1, 'tier_shown': 1, 'was_correct': False}
        assert _compute_target_tier(state, 5) == 1


# ──────────────────────────────────────────────
# _pick_shown_tier — 70/30 분포
# ──────────────────────────────────────────────

class TestPickShownTier:
    def test_target_tier_1_always_returns_1(self):
        for _ in range(20):
            assert _pick_shown_tier(1) == 1

    def test_roughly_70_percent_target_30_percent_easier(self, monkeypatch=None):
        random.seed(42)
        target = 4
        counts = {'target': 0, 'easier': 0}
        for _ in range(2000):
            shown = _pick_shown_tier(target)
            if shown == target:
                counts['target'] += 1
            else:
                assert 1 <= shown < target
                counts['easier'] += 1
        ratio = counts['target'] / 2000
        assert 0.6 < ratio < 0.8  # 대략 70% ± 허용오차


# ──────────────────────────────────────────────
# _pick_type_at_tier / _assign_tiered_question_type
# ──────────────────────────────────────────────

class TestPickTypeAtTier:
    def test_returns_none_when_tier_has_no_usable_type(self):
        item = _make_item(examples=[], example_puzzles=[], meanings=[])
        # meanings/examples 둘 다 없으면 tier1(multipleChoice/cardMatch)도 후보가 안 됨
        assert _pick_type_at_tier(item, 1, [], set()) is None

    def test_picks_from_tier_types_only(self):
        item = _make_item(examples=[TAGGED_EXAMPLE], example_puzzles=[PUZZLE])
        for _ in range(20):
            chosen = _pick_type_at_tier(item, 3, [], set())
            assert chosen in TIER_QUESTION_TYPES[3]

    def test_weakness_type_preferred_when_available(self):
        item = _make_item(examples=[TAGGED_EXAMPLE], example_puzzles=[PUZZLE])
        chosen = _pick_type_at_tier(item, 3, ['sentenceArrangePartial'], set())
        assert chosen == 'sentenceArrangePartial'

    def test_avoid_excludes_type_when_alternative_exists(self):
        item = _make_item(examples=[TAGGED_EXAMPLE], example_puzzles=[PUZZLE])
        for _ in range(20):
            chosen = _pick_type_at_tier(item, 3, [], {'fillInTheBlank'})
            assert chosen != 'fillInTheBlank'


class TestAssignTieredQuestionType:
    def test_falls_back_to_lower_tier_when_word_cannot_use_shown_tier(self):
        # example_puzzles가 없으면 tier3/4의 조립형은 못 쓴다 — fillInTheBlank도
        # 강조 태그 없는 예문이라 tier3 후보에서 빠지므로 tier1/2로 내려가야 한다.
        item = _make_item(
            fsrs_state={'state': 'review', 'stability': 999.0, 'next_review': '2099-01-01T00:00:00Z'},
            examples=[{'origin': 'no tag.', 'meaning': '태그 없음'}],
            example_puzzles=[None],
        )
        random.seed(1)
        for _ in range(30):
            chosen, target_tier, shown_tier = _assign_tiered_question_type(item, [], set())
            assert chosen in ('multipleChoice', 'cardMatch', 'reverseMultipleChoice',
                               'multipleChoiceListening', 'cardMatchListening')
            assert shown_tier <= 2

    def test_returns_target_tier_matching_compute_target_tier(self):
        item = _make_item(
            fsrs_state={'state': 'review', 'stability': 999.0, 'next_review': '2099-01-01T00:00:00Z'},
            examples=[TAGGED_EXAMPLE], example_puzzles=[PUZZLE],
            tier_state={'tier_target': 3, 'tier_shown': 3, 'was_correct': True},
        )
        chosen, target_tier, shown_tier = _assign_tiered_question_type(item, [], set())
        assert target_tier == 4
        assert chosen is not None

    def test_uses_persisted_tier_state_from_item_not_external_dict(self):
        # 2026-09 2차 보완: tier 상태는 item.tier_state(=UserVoca 컬럼)에서만 읽는다 —
        # 세션당 최근 로그 윈도우 근사치를 더 이상 쓰지 않는다.
        item_no_history = _make_item(
            fsrs_state={'state': 'review', 'stability': 999.0, 'next_review': '2099-01-01T00:00:00Z'},
            examples=[TAGGED_EXAMPLE], example_puzzles=[PUZZLE],
            tier_state=None,
        )
        _, target_tier, _ = _assign_tiered_question_type(item_no_history, [], set())
        assert target_tier == 4  # max_tier(5) - 1, 처음 보는 단어 취급


# ──────────────────────────────────────────────
# question_types 파라미터 — 설정 시트에서 유형을 직접 고른 경우 (2026-09)
# ──────────────────────────────────────────────

class TestAssignRestrictedQuestionType:
    def test_only_picks_from_allowed_types_when_supported(self):
        item = _make_item(examples=[TAGGED_EXAMPLE], example_puzzles=[PUZZLE])
        for _ in range(20):
            chosen = _assign_restricted_question_type(item, ['sentenceArrange'], [], set())
            assert chosen == 'sentenceArrange'

    def test_picks_among_multiple_allowed_types_only(self):
        item = _make_item(examples=[TAGGED_EXAMPLE], example_puzzles=[PUZZLE])
        allowed = ['sentenceArrange', 'listenArrange', 'fillInTheBlankTyping']
        for _ in range(30):
            chosen = _assign_restricted_question_type(item, allowed, [], set())
            assert chosen in allowed

    def test_weakness_type_preferred_within_allowed_set(self):
        item = _make_item(examples=[TAGGED_EXAMPLE], example_puzzles=[PUZZLE])
        allowed = ['sentenceArrange', 'listenArrange']
        chosen = _assign_restricted_question_type(item, allowed, ['listenArrange'], set())
        assert chosen == 'listenArrange'

    def test_falls_back_to_full_weighted_when_word_cannot_use_any_allowed_type(self):
        # example_puzzles가 없어 조립형(sentenceArrange)을 못 쓰는 단어 — 지정된 유형이
        # sentenceArrange 하나뿐이면 완전 폴백(기존 전체 유형 가중치 배정)으로 넘어가야
        # 하고, 그 결과는 sentenceArrange가 아니어도 된다(폴백 후보에 포함될 수는 있음).
        item = _make_item(
            examples=[{'origin': 'no tag.', 'meaning': '태그 없음'}], example_puzzles=[None],
        )
        chosen = _assign_restricted_question_type(item, ['sentenceArrange'], [], set())
        assert chosen in ('multipleChoice', 'cardMatch', 'reverseMultipleChoice',
                           'multipleChoiceListening', 'cardMatchListening')

    def test_avoid_excludes_type_when_alternative_allowed_type_exists(self):
        item = _make_item(examples=[TAGGED_EXAMPLE], example_puzzles=[PUZZLE])
        allowed = ['sentenceArrange', 'listenArrange']
        for _ in range(20):
            chosen = _assign_restricted_question_type(item, allowed, [], {'sentenceArrange'})
            assert chosen == 'listenArrange'


class TestEnrichItemsWithAllowedTypes:
    def test_allowed_types_bypasses_tier_logic_even_when_full_recommend(self):
        item = _make_item(
            fsrs_state={'state': 'review', 'stability': 999.0, 'next_review': '2099-01-01T00:00:00Z'},
            examples=[TAGGED_EXAMPLE], example_puzzles=[PUZZLE],
            tier_state={'tier_target': 3, 'tier_shown': 3, 'was_correct': True},
        )
        enriched = _enrich_items(
            [(item, 'new')], {}, [],
            full_recommend=True, allowed_types=['sentenceArrange'],
        )
        assert enriched[0]['suggested_question_type'] == 'sentenceArrange'
        # allowed_types가 있으면 tier 로직을 안 타므로 tier_target/tier_shown은 항상 None —
        # item.tier_state에 값이 있어도 UserVoca의 tier 진행에 영향을 주면 안 된다.
        assert enriched[0]['tier_target'] is None
        assert enriched[0]['tier_shown'] is None

    def test_without_allowed_types_full_recommend_still_uses_tier(self):
        item = _make_item(
            fsrs_state={'state': 'review', 'stability': 999.0, 'next_review': '2099-01-01T00:00:00Z'},
            examples=[TAGGED_EXAMPLE], example_puzzles=[PUZZLE],
            tier_state={'tier_target': 3, 'tier_shown': 3, 'was_correct': True},
        )
        enriched = _enrich_items([(item, 'new')], {}, [], full_recommend=True, allowed_types=None)
        assert enriched[0]['tier_target'] == 4  # 정상적으로 tier 진행


class TestComposeWithAllowedTypes:
    def _make_pool_item(self, user_voca_id, has_puzzle=True):
        return _make_item(
            fsrs_state={'state': 'new', 'stability': 0.0, 'next_review': None},
            examples=[TAGGED_EXAMPLE] if has_puzzle else [{'origin': 'no tag.', 'meaning': 'x'}],
            example_puzzles=[PUZZLE] if has_puzzle else [None],
        )

    def test_every_capable_word_gets_the_single_requested_type(self):
        # "문장 만들기"(sentenceArrange)만 고르면, 그 유형을 쓸 수 있는 단어는 전부
        # sentenceArrange로 나와야 한다 — 우연히 배정된 일부만이 아니라.
        pool = []
        for i in range(10):
            it = self._make_pool_item(i, has_puzzle=True)
            it.user_voca_id = i
            pool.append(it)
        result = compose(
            pool, 10, selection='recommended', user_stats=None,
            full_recommend=True, allowed_types=['sentenceArrange'],
        )
        for enriched in result['enriched_items']:
            assert enriched['suggested_question_type'] == 'sentenceArrange'
            assert enriched['tier_target'] is None
            assert enriched['tier_shown'] is None

    def test_incapable_words_fall_back_instead_of_being_dropped(self):
        pool = []
        for i in range(6):
            it = self._make_pool_item(i, has_puzzle=False)  # sentenceArrange 못 씀
            it.user_voca_id = i
            pool.append(it)
        result = compose(
            pool, 6, selection='recommended', user_stats=None,
            full_recommend=True, allowed_types=['sentenceArrange'],
        )
        assert len(result['enriched_items']) == 6
        for enriched in result['enriched_items']:
            assert enriched['suggested_question_type'] is not None
            assert enriched['suggested_question_type'] != 'sentenceArrange'
