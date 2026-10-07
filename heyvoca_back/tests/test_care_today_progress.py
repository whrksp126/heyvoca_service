"""홈 '오늘 돌봄 물주기' 집계 — split_care_progress (DB 없음).

기준: 오늘 돌볼 목록에 있던 단어를 오늘 한 번이라도 학습(정답·오답 무관)했으면 돌본 것.
"""

from app.services.game.farm_v2.query import split_care_progress


def _snapshot(snapshot_before, remaining):
    """호출부와 같은 규칙: 스냅샷에는 remaining 만 합집합한다."""
    return set(snapshot_before) | set(remaining)


def test_wrong_answers_still_due_today_count_as_done():
    targets = set(range(1, 8))                 # 오늘 돌봄 대상 7개
    studied = {1, 2, 3, 4, 5, 6, 7}            # 전부 학습, 일부는 오답이라 예정일이 여전히 오늘
    live = {1, 2, 3}                           # live 에 아직 남아 있음
    remaining, _ = split_care_progress(targets, set(), targets, set(), set())
    assert len(remaining) == 7                 # 아침: 0/7
    snap = _snapshot(targets, remaining)
    remaining, done = split_care_progress(live, studied, snap, set(), set())
    assert remaining == set()
    assert done == targets
    assert len(remaining) + len(done) == 7     # 분모 7 고정


def test_partial_progress():
    targets = {1, 2, 3, 4}
    snap = _snapshot(set(), targets)
    remaining, done = split_care_progress({3, 4}, {1, 3}, snap, set(), set())
    assert remaining == {4}
    assert done == {1, 2, 3}
    assert len(remaining) + len(done) == 4


def test_newly_live_after_study_does_not_grow_denominator():
    targets = {1, 2}
    snap = _snapshot(set(), targets)
    # 단어 9 는 오늘 학습하면서 예정일이 오늘로 생김(live 에 새로 등장) — 학습했으므로 remaining 제외
    remaining, done = split_care_progress({1, 9}, {2, 9}, snap, set(), set())
    snap = _snapshot(snap, remaining)
    assert 9 not in snap
    assert remaining == {1}
    assert done == {2}
    assert len(remaining) + len(done) == 2


def test_moved_to_wilted_or_rotten_is_not_done():
    snap = {1, 2, 3}
    remaining, done = split_care_progress({1}, set(), snap, wilted_ids={2}, rotten_ids={3})
    assert remaining == {1}
    assert done == set()


def test_no_study_matches_old_behavior():
    snap = {1, 2, 3}
    remaining, done = split_care_progress({2, 3}, set(), snap, set(), set())
    assert remaining == {2, 3}
    assert done == {1}
