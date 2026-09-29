"""
tests/test_example_select.py — "매번 새 문장" 선택 로직(app/services/example_select.py) 단위 테스트.

정본: heyvoca_service/docs/FRESH_SENTENCE_CONTRACT.md §3
DB 의존성 없음 — CandidateItem과 example_pool을 직접 구성한다(tests/test_tier_difficulty.py와
같은 패턴).
"""

import datetime as dt
import random

from app.services.recommend.pool import CandidateItem
from app.services.example_select import (
    SelectionContext, choose_example, _target_level_for_item, _eligible,
)


NOW = dt.datetime(2026, 9, 30, 12, 0, 0)

TAGGED_ORIGIN = 'I need to <strong class="target-word">check in</strong> for my flight.'
TAGGED_MEANING = '<strong class="target-word">체크인</strong>을 해야 해요.'

USABLE_PUZZLE = {
    'example_id':         1,
    'tokens':             ['I', 'need', 'to', 'check', 'in', 'for', 'my', 'flight'],
    'target_idx':         [3, 4],
    'first_form':         'i',
    'alt_orders':         [],
    'distractors':        ['book', 'cancel'],
    'listen_distractors': ['look', 'out'],
    'skip_reason':        None,
}

UNUSABLE_PUZZLE = dict(USABLE_PUZZLE, skip_reason='too_short')


def _ex(hash_, *, origin=TAGGED_ORIGIN, meaning=TAGGED_MEANING, puzzle=None, meta=None, source='dict'):
    return {'origin': origin, 'meaning': meaning, 'hash': hash_, 'puzzle': puzzle, 'meta': meta, 'source': source}


def _item(example_pool=None, fsrs_state=None, user_voca_id=1) -> CandidateItem:
    return CandidateItem(
        user_voca_id=user_voca_id,
        user_voca_book_id=None,
        word='check in',
        meanings=['체크인하다'],
        examples=[],
        fsrs_state=fsrs_state or {'state': 'new', 'stability': 0.0, 'next_review': None},
        bucket='new',
        word_length=8,
        example_pool=example_pool or [],
    )


def _ctx(**kwargs) -> SelectionContext:
    defaults = dict(recent_seen={}, known_words=set(), user_level_id=None, now=NOW,
                     rng=random.Random(0))
    defaults.update(kwargs)
    return SelectionContext(**defaults)


# ──────────────────────────────────────────────
# 자격 검증 (_eligible)
# ──────────────────────────────────────────────

class TestEligible:
    def test_text_type_requires_target_tag_and_meaning(self):
        assert _eligible(_ex('a'), 'fillInTheBlank') is True
        assert _eligible(_ex('a', origin='no tag.'), 'fillInTheBlank') is False
        assert _eligible(_ex('a', meaning=''), 'fillInTheBlank') is False

    def test_typing_same_rule_as_fill_in_the_blank(self):
        assert _eligible(_ex('a'), 'fillInTheBlankTyping') is True
        assert _eligible(_ex('a', origin='no tag.'), 'fillInTheBlankTyping') is False

    def test_arrange_requires_usable_puzzle(self):
        assert _eligible(_ex('a', puzzle=USABLE_PUZZLE), 'sentenceArrange') is True
        assert _eligible(_ex('a', puzzle=None), 'sentenceArrange') is False
        assert _eligible(_ex('a', puzzle=UNUSABLE_PUZZLE), 'listenArrange') is False

    def test_unknown_type_never_eligible(self):
        assert _eligible(_ex('a', puzzle=USABLE_PUZZLE), 'multipleChoice') is False


# ──────────────────────────────────────────────
# choose_example — 기본 동작
# ──────────────────────────────────────────────

class TestChooseExampleBasics:
    def test_returns_none_when_pool_empty(self):
        item = _item(example_pool=[])
        assert choose_example(item, 'fillInTheBlank', _ctx()) is None

    def test_returns_none_when_no_eligible_candidate(self):
        item = _item(example_pool=[_ex('a', origin='no tag.')])
        assert choose_example(item, 'fillInTheBlank', _ctx()) is None

    def test_picks_eligible_candidate(self):
        item = _item(example_pool=[_ex('a')])
        chosen = choose_example(item, 'fillInTheBlank', _ctx())
        assert chosen is not None
        assert chosen['hash'] == 'a'

    def test_arrange_needs_usable_puzzle_not_text_candidate(self):
        item = _item(example_pool=[_ex('a', puzzle=None), _ex('b', puzzle=USABLE_PUZZLE)])
        chosen = choose_example(item, 'sentenceArrangePartial', _ctx())
        assert chosen['hash'] == 'b'


# ──────────────────────────────────────────────
# used_hashes — 이번 응답에서 이미 쓴 hash 제외 + 누적
# ──────────────────────────────────────────────

class TestUsedHashesExclusion:
    def test_excludes_hash_already_in_used_hashes(self):
        item = _item(example_pool=[_ex('a')])
        ctx = _ctx(used_hashes={'a'})
        assert choose_example(item, 'fillInTheBlank', ctx) is None

    def test_choosing_adds_hash_to_used_hashes(self):
        item = _item(example_pool=[_ex('a')])
        ctx = _ctx()
        chosen = choose_example(item, 'fillInTheBlank', ctx)
        assert chosen['hash'] == 'a'
        assert 'a' in ctx.used_hashes

    def test_same_word_different_types_get_different_sentences(self):
        """plant question_payloads — 한 단어가 여러 유형으로 나가면 서로 다른 문장."""
        item = _item(example_pool=[
            _ex('a', puzzle=USABLE_PUZZLE),
            _ex('b', puzzle=USABLE_PUZZLE),
        ])
        ctx = _ctx()
        first = choose_example(item, 'fillInTheBlankTyping', ctx)
        second = choose_example(item, 'sentenceArrange', ctx)
        assert first['hash'] != second['hash']
        assert {first['hash'], second['hash']} == {'a', 'b'}

    def test_exhausted_pool_returns_none_for_next_call(self):
        item = _item(example_pool=[_ex('a')])
        ctx = _ctx()
        assert choose_example(item, 'fillInTheBlank', ctx) is not None
        assert choose_example(item, 'fillInTheBlank', ctx) is None


# ──────────────────────────────────────────────
# 최근성 — 안 본 문장 최우선, 본 문장 중엔 오래전일수록 우선
# ──────────────────────────────────────────────

class TestRecencyScoring:
    def test_never_seen_beats_seen(self):
        item = _item(example_pool=[_ex('seen'), _ex('unseen')])
        ctx = _ctx(recent_seen={1: {'seen': NOW - dt.timedelta(days=1)}})
        chosen = choose_example(item, 'fillInTheBlank', ctx)
        assert chosen['hash'] == 'unseen'

    def test_among_seen_oldest_wins(self):
        item = _item(example_pool=[_ex('recent'), _ex('old')])
        ctx = _ctx(recent_seen={1: {
            'recent': NOW - dt.timedelta(days=1),
            'old':    NOW - dt.timedelta(days=29),
        }})
        chosen = choose_example(item, 'fillInTheBlank', ctx)
        assert chosen['hash'] == 'old'

    def test_recent_seen_is_keyed_per_word(self):
        """다른 단어(user_voca_id)의 최근 기록은 이 단어 선택에 영향 없음."""
        item = _item(example_pool=[_ex('a')], user_voca_id=2)
        ctx = _ctx(recent_seen={1: {'a': NOW}})  # user_voca_id=1의 기록, item은 2
        chosen = choose_example(item, 'fillInTheBlank', ctx)
        assert chosen['hash'] == 'a'


# ──────────────────────────────────────────────
# 수준 적합 — 목표 수준에 가까운 예문 우선
# ──────────────────────────────────────────────

class TestLevelScoring:
    def test_prefers_closer_level_to_target(self):
        # state='new' → crop_stage='unlearned' → target_level=1
        item = _item(example_pool=[
            _ex('lv1', meta={'level': 1, 'words': []}),
            _ex('lv3', meta={'level': 3, 'words': []}),
        ], fsrs_state={'state': 'new', 'stability': 0.0, 'next_review': None})
        chosen = choose_example(item, 'fillInTheBlank', _ctx())
        assert chosen['hash'] == 'lv1'

    def test_meta_less_example_treated_as_target_level(self):
        # meta 없는 예문(사용자 직접 입력)은 목표 수준과 같다고 본다 → lv3보다 우선.
        item = _item(example_pool=[
            _ex('no_meta', meta=None),
            _ex('lv3', meta={'level': 3, 'words': []}),
        ], fsrs_state={'state': 'new', 'stability': 0.0, 'next_review': None})
        chosen = choose_example(item, 'fillInTheBlank', _ctx())
        assert chosen['hash'] == 'no_meta'

    def test_carrot_stage_targets_level_3(self):
        item = _item(example_pool=[
            _ex('lv1', meta={'level': 1, 'words': []}),
            _ex('lv3', meta={'level': 3, 'words': []}),
        ], fsrs_state={'state': 'review', 'stability': 90.0, 'next_review': '2026-10-05T00:00:00'})
        chosen = choose_example(item, 'fillInTheBlank', _ctx())
        assert chosen['hash'] == 'lv3'


class TestUserLevelAdjustment:
    def test_level_1_lowers_target_by_one_clamped_to_1(self):
        # carrot(목표 3) + user_level_id=1 → 목표 2 → lv2가 lv3보다 우선
        item = _item(example_pool=[
            _ex('lv2', meta={'level': 2, 'words': []}),
            _ex('lv3', meta={'level': 3, 'words': []}),
        ], fsrs_state={'state': 'review', 'stability': 90.0, 'next_review': '2026-10-05T00:00:00'})
        chosen = choose_example(item, 'fillInTheBlank', _ctx(user_level_id=1))
        assert chosen['hash'] == 'lv2'

    def test_level_4_raises_target_by_one_clamped_to_3(self):
        # unlearned(목표 1) + user_level_id=4 → 목표 2
        item = _item(example_pool=[
            _ex('lv1', meta={'level': 1, 'words': []}),
            _ex('lv2', meta={'level': 2, 'words': []}),
        ], fsrs_state={'state': 'new', 'stability': 0.0, 'next_review': None})
        chosen = choose_example(item, 'fillInTheBlank', _ctx(user_level_id=4))
        assert chosen['hash'] == 'lv2'

    def test_target_level_helper_direct(self):
        item_new = _item(fsrs_state={'state': 'new', 'stability': 0.0, 'next_review': None})
        assert _target_level_for_item(item_new, None) == 1
        assert _target_level_for_item(item_new, user_level_id=4) == 2
        assert _target_level_for_item(item_new, user_level_id=1) == 1  # 이미 최소치, 더 못 내려감

        item_carrot = _item(fsrs_state={'state': 'review', 'stability': 90.0,
                                         'next_review': '2026-10-05T00:00:00'})
        assert _target_level_for_item(item_carrot, None) == 3
        assert _target_level_for_item(item_carrot, user_level_id=4) == 3  # 이미 최대치
        assert _target_level_for_item(item_carrot, user_level_id=1) == 2


# ──────────────────────────────────────────────
# 아는 단어 비율 — 높을수록 가점(우선)
# ──────────────────────────────────────────────

class TestKnownWordRatio:
    def test_higher_known_ratio_preferred_when_level_tied(self):
        item = _item(example_pool=[
            _ex('low_known',  meta={'level': 1, 'words': ['obscure', 'rare']}),
            _ex('high_known', meta={'level': 1, 'words': ['common', 'known']}),
        ], fsrs_state={'state': 'new', 'stability': 0.0, 'next_review': None})
        ctx = _ctx(known_words={'common', 'known'})
        chosen = choose_example(item, 'fillInTheBlank', ctx)
        assert chosen['hash'] == 'high_known'

    def test_empty_words_is_neutral(self):
        # words가 비면 known-word 보너스가 0 — 순수 레벨/최근성만으로 결정돼야 한다.
        item = _item(example_pool=[
            _ex('empty_words', meta={'level': 1, 'words': []}),
        ], fsrs_state={'state': 'new', 'stability': 0.0, 'next_review': None})
        chosen = choose_example(item, 'fillInTheBlank', _ctx())
        assert chosen['hash'] == 'empty_words'


# ──────────────────────────────────────────────
# 동점 — 무작위(예외 없이 후보 중 하나)
# ──────────────────────────────────────────────

class TestTieBreak:
    def test_tie_picks_one_of_the_best(self):
        item = _item(example_pool=[_ex('a'), _ex('b')])
        chosen = choose_example(item, 'fillInTheBlank', _ctx(rng=random.Random(1)))
        assert chosen['hash'] in ('a', 'b')
