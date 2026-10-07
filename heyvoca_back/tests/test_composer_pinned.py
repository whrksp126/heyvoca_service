"""composer._compose_recommend / compose — pinned_ids(오늘 할 일 우선 포함) 테스트. DB 없음."""

import datetime as dt
import random

from app.services.recommend.pool import CandidateItem
from app.services.recommend.composer import compose


def _item(uid, bucket='short'):
    fsrs = {"state": "new" if bucket == 'new' else "review", "difficulty": 5.0, "stability": 5.0,
            "retrievability": 0.5, "lapses": 0, "next_review": None}
    return CandidateItem(
        user_voca_id=uid, user_voca_book_id=None, word=f"word{uid}",
        meanings=[{"meaning": "뜻"}], examples=[], fsrs_state=fsrs, bucket=bucket,
        word_length=5, mastery={"recent": [], "streak": 0, "last_studied_at": None},
    )


def _ids(res):
    return [it.user_voca_id for it in res['items']]


def _pool(n=60):
    return [_item(i, 'overdue') for i in range(1, n + 1)]


def test_pinned_always_selected():
    pool = _pool()
    pinned = [57, 58]  # priority 상위 밖일 수 있는 단어
    for seed in range(20):
        random.seed(seed)
        res = compose(pool, 14, full_recommend=True, pinned_ids=pinned)
        assert {57, 58} <= set(_ids(res))
        assert len(_ids(res)) == 14


def test_no_pinned_same_as_before():
    pool = _pool()
    for pinned in (None, []):
        random.seed(7)
        a = _ids(compose(pool, 14, full_recommend=True, pinned_ids=pinned))
        random.seed(7)
        b = _ids(compose(pool, 14, full_recommend=True))
        assert a == b


def test_unknown_pinned_ignored():
    pool = _pool(30)
    res = compose(pool, 10, full_recommend=True, pinned_ids=[9999, 5])
    ids = _ids(res)
    assert 9999 not in ids and 5 in ids and len(ids) == 10


def test_new_bucket_pinned_not_pinned():
    # new 는 pinned 로 못 끼어든다 — 신규 슬롯 판정은 pinned 유무와 무관(결과 동일).
    pool = _pool(30) + [_item(500, 'new')]
    random.seed(1)
    a = _ids(compose(pool, 10, full_recommend=True, pinned_ids=[500]))
    random.seed(1)
    b = _ids(compose(pool, 10, full_recommend=True))
    assert a == b


def test_pinned_more_than_count_takes_front():
    pool = _pool(40)
    pinned = [40, 39, 38, 37, 36, 35]
    res = compose(pool, 4, full_recommend=True, pinned_ids=pinned)
    assert set(_ids(res)) == {40, 39, 38, 37}


def test_duplicate_pinned_not_double_counted():
    pool = _pool(40)
    res = compose(pool, 5, full_recommend=True, pinned_ids=[40, 40, 39])
    ids = _ids(res)
    assert len(ids) == len(set(ids)) == 5 and {40, 39} <= set(ids)
