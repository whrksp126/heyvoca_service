"""
tests/test_recommend_target_states.py — /study/recommend target_states 필터 단위 테스트.

DB 의존성 없음. 세 영역을 검증한다:
  1. stage.crop_stage — stability 경계값(4.9/5/20.9/21/59.9/60), new state, next_review 누락.
  2. stage.expand_target_states — crop_stage 키 + legacy alias(short/medium/long/new) 확장.
  3. pool-filter 회귀: overdue(과거 복습예정) + stability=10 인 단어가
     target_states=['sprout']와 ['short'](legacy) 양쪽에서 살아남는지 — bucket 기반 필터였다면
     bucket='overdue'라 'short'/'sprout' 어느 쪽으로도 걸러지지 않고 빠졌던 버그.
"""

from app.services.recommend.stage import crop_stage, expand_target_states
from app.services.recommend.pool import CandidateItem


def _fsrs(state='review', stability=0.0, next_review='2099-01-01T00:00:00Z'):
    return {'state': state, 'stability': stability, 'next_review': next_review}


# ──────────────────────────────────────────────
# crop_stage — unlearned 판정
# ──────────────────────────────────────────────

def test_crop_stage_falsy_state_is_unlearned():
    assert crop_stage({}) == 'unlearned'
    assert crop_stage(None) == 'unlearned'


def test_crop_stage_new_state_is_unlearned():
    assert crop_stage({'state': 'new', 'stability': 0.0, 'next_review': None}) == 'unlearned'
    assert crop_stage({'state': '', 'stability': 0.0, 'next_review': None}) == 'unlearned'


def test_crop_stage_missing_next_review_is_unlearned():
    # state는 review인데 next_review가 없으면(비정상 데이터) 여전히 unlearned —
    # pool.py::_classify_bucket의 "new" 판정과 일치해야 한다.
    assert crop_stage({'state': 'review', 'stability': 10.0, 'next_review': None}) == 'unlearned'
    assert crop_stage({'state': 'review', 'stability': 10.0}) == 'unlearned'


# ──────────────────────────────────────────────
# crop_stage — stability 경계값
# ──────────────────────────────────────────────

def test_crop_stage_seed_below_sprout_threshold():
    assert crop_stage(_fsrs(stability=4.9)) == 'seed'


def test_crop_stage_sprout_at_threshold():
    assert crop_stage(_fsrs(stability=5.0)) == 'sprout'


def test_crop_stage_sprout_below_short_threshold():
    assert crop_stage(_fsrs(stability=20.9)) == 'sprout'


def test_crop_stage_leaf_at_short_threshold():
    assert crop_stage(_fsrs(stability=21.0)) == 'leaf'


def test_crop_stage_leaf_below_medium_threshold():
    assert crop_stage(_fsrs(stability=59.9)) == 'leaf'


def test_crop_stage_carrot_at_medium_threshold():
    assert crop_stage(_fsrs(stability=60.0)) == 'carrot'


# ──────────────────────────────────────────────
# expand_target_states — alias 확장
# ──────────────────────────────────────────────

def test_expand_target_states_crop_stage_keys_map_to_self():
    assert expand_target_states(['seed']) == {'seed'}
    assert expand_target_states(['sprout']) == {'sprout'}
    assert expand_target_states(['leaf']) == {'leaf'}
    assert expand_target_states(['carrot']) == {'carrot'}
    assert expand_target_states(['unlearned']) == {'unlearned'}


def test_expand_target_states_legacy_aliases():
    assert expand_target_states(['short']) == {'seed', 'sprout'}
    assert expand_target_states(['medium']) == {'leaf'}
    assert expand_target_states(['long']) == {'carrot'}
    assert expand_target_states(['new']) == {'unlearned'}


def test_expand_target_states_unknown_value_ignored():
    assert expand_target_states(['bogus']) == set()
    assert expand_target_states(['seed', 'bogus']) == {'seed'}


def test_expand_target_states_empty_input():
    assert expand_target_states([]) == set()
    assert expand_target_states(None) == set()


# ──────────────────────────────────────────────
# 회귀: overdue + stability=10 인 단어가 bucket 필터로는 빠졌었다
# ──────────────────────────────────────────────

def _make_overdue_item(stability=10.0) -> CandidateItem:
    return CandidateItem(
        user_voca_id=1,
        user_voca_book_id=None,
        word='linger',
        meanings=['머무르다'],
        examples=[],
        fsrs_state=_fsrs(state='review', stability=stability, next_review='2020-01-01T00:00:00Z'),
        bucket='overdue',  # pool._classify_bucket: 과거 next_review → 'overdue' (short/medium/long 아님)
        word_length=6,
    )


def test_overdue_item_kept_by_sprout_filter():
    item = _make_overdue_item(stability=10.0)
    allowed = expand_target_states(['sprout'])
    pool = [it for it in [item] if crop_stage(it.fsrs_state) in allowed]
    assert pool == [item]


def test_overdue_item_kept_by_legacy_short_filter():
    item = _make_overdue_item(stability=10.0)
    allowed = expand_target_states(['short'])
    pool = [it for it in [item] if crop_stage(it.fsrs_state) in allowed]
    assert pool == [item]


def test_overdue_item_dropped_by_old_bucket_based_filter():
    # 옛 버그 재현: bucket 기반 필터였다면 bucket='overdue'는 'short' 세트에 없어 걸러졌다.
    item = _make_overdue_item(stability=10.0)
    old_allowed_buckets = {'short'}  # 옛 _state_bucket_map['short']
    pool = [it for it in [item] if it.bucket in old_allowed_buckets]
    assert pool == []
