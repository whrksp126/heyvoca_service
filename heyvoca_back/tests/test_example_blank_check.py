"""빈칸 계열 예문 적격 판정(example_blank_check) + 일반 모드 fillInTheBlankTyping 미배정 테스트."""

import datetime as dt
import random

import pytest

from app.services.example_blank_check import highlight_matches_headword as ok, example_blank_ok
from app.services.example_select import SelectionContext, choose_example, _eligible
from app.services.recommend.pool import CandidateItem


@pytest.mark.parametrize('head,hl', [
    ('give a call', 'give a call'),
    ('give a call', 'gave a call'),
    ('wake', 'woke'),
    ('wake', 'woken'),
    ('check in', 'checking in'),
    ('high', 'higher'),
    ('stop', 'stopped'),
    ('carry', 'carried'),
    ('take one\'s time', 'take his time'),
    ('afford to do', 'afford to buy'),
    ('be familiar with', 'was familiar with'),
    ('seat belt', 'seatbelt'),
    ('come-with', 'come with'),
    ('gentleman', 'Gentlemen'),
    ('overrun', 'overran'),
    ('wear your heart on your sleeve', 'wears her heart on her sleeve'),
])
def test_eligible(head, hl):
    assert ok(head, hl)


@pytest.mark.parametrize('head,hl', [
    ('give a call', 'give her old friend a call'),
    ('wake', 'woke up'),
    ('high', 'extremely high'),
    ('pick up', 'pick the book up'),
    ('give a hand', 'give me a hand'),
    ('passport', 'lost'),
    ('take A out', 'took her keys out'),
])
def test_ineligible(head, hl):
    assert not ok(head, hl)


def test_example_blank_ok_uses_first_tag():
    assert example_blank_ok('wake', 'I <strong class="target-word">woke</strong> early.')
    assert not example_blank_ok('wake', 'I <strong class="target-word">woke up</strong> early.')
    assert not example_blank_ok('wake', 'No tag here.')


NOW = dt.datetime(2026, 11, 23, 12, 0, 0)


def _item(word, pool):
    return CandidateItem(
        user_voca_id=1, user_voca_book_id=None, word=word, meanings=['x'], examples=[],
        fsrs_state={'state': 'new', 'stability': 0.0, 'next_review': None},
        bucket='new', word_length=len(word), example_pool=pool,
    )


def _ex(h, origin):
    return {'origin': origin, 'meaning': '뜻', 'hash': h, 'puzzle': None, 'meta': None, 'source': 'dict'}


def test_choose_example_skips_wide_highlight():
    wide = _ex('w', 'I will <strong class="target-word">give her old friend a call</strong>.')
    good = _ex('g', 'I will <strong class="target-word">give</strong> a call.')  # 강조가 표제어보다 좁은 건 통과
    item = _item('give a call', [wide, good])
    ctx = SelectionContext(now=NOW, rng=random.Random(0))
    for qt in ('fillInTheBlank', 'fillInTheBlankTyping'):
        ctx.used_hashes.clear()
        assert choose_example(item, qt, ctx)['hash'] == 'g'
    assert not _eligible(wide, 'fillInTheBlankTyping', 'give a call')
    # 모든 예문이 부적격이면 출제 안 함
    assert choose_example(_item('give a call', [wide]), 'fillInTheBlank', SelectionContext(now=NOW)) is None


def test_general_mode_has_no_typing():
    from app.routes.study import _strip_typing_from_general, _demote_arrange_to_general
    pool = [_ex('g', 'I <strong class="target-word">check in</strong> now.')]
    it = _item('check in', pool)
    items = [
        {'_item': it, 'suggested_question_type': 'fillInTheBlankTyping', 'tier_shown': 5},
        {'_item': it, 'suggested_question_type': 'sentenceArrange', 'tier_shown': 4},
        {'_item': it, 'suggested_question_type': 'sentenceArrangePartial', 'tier_shown': 3},
        {'_item': _item('x', []), 'suggested_question_type': 'fillInTheBlankTyping', 'tier_shown': 4},
    ]
    for _ in range(20):
        for e in items:
            e['suggested_question_type'] = e.get('_orig', e['suggested_question_type'])
            e.setdefault('_orig', e['suggested_question_type'])
        _demote_arrange_to_general(items)
        _strip_typing_from_general(items)
        assert all(e['suggested_question_type'] != 'fillInTheBlankTyping' for e in items)
    assert items[0]['suggested_question_type'] == 'fillInTheBlank'
    assert items[3]['suggested_question_type'] == 'multipleChoice'


def test_practice_section_includes_typing(monkeypatch):
    """실전 구간(sentence_arrange)에 직접 입력이 1개 섞이고, 문장이 겹치지 않으며, 개수는 유지."""
    from app.routes.study import _select_sentence_arrange
    from app.services import typing_guard
    monkeypatch.setattr(typing_guard, '_load_word_set', lambda: set())
    words = ['alpha', 'bravo', 'charlie', 'delta', 'echo']
    items = []
    for i, w in enumerate(words):
        it = _item(w, [_ex('h%d' % i, 'I <strong class="target-word">%s</strong> now.' % w),
                       _ex('s%d' % i, 'We <strong class="target-word">%s</strong> too.' % w)])
        it.user_voca_id = i + 1
        items.append({'_item': it, 'suggested_question_type': 'multipleChoice', 'tier_shown': 4 if i == 3 else 2})
    for seed in range(20):
        ctx = SelectionContext(now=NOW, rng=random.Random(seed))
        out = _select_sentence_arrange(items, [], ctx)
        typ = [v for v in out.values() if v['question_type'] == 'fillInTheBlankTyping']
        assert len(typ) == 1
        pl = typ[0]['question_payload']
        assert pl['typing'] and pl['example_hash'] in ctx.used_hashes
        assert out[4]['question_type'] == 'fillInTheBlankTyping'  # 티어 4+ 우선
        hashes = [v['question_payload'].get('example_hash') for v in out.values()]
        assert len(hashes) == len(set(hashes))
