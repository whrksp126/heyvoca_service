"""composer._decide_slot_quotas — S2 일일 신규 cap + 신규/단기 floor 예약 테스트.

핵심 불변식:
  - full_recommend=False(명시적 선택): 기존 동작 유지 — 위급분(overdue 등)이 100%까지.
  - full_recommend=True(AI추천): overdue 백로그가 커도 신규/단기 floor 보장.
  - new_allowance: 신규 bucket을 일일 잔량으로 캡.
"""

from app.services.recommend.composer import _decide_slot_quotas


class TestExplicitModeUnchanged:
    """full_recommend=False → overdue가 count 100%까지 채움 (기존 동작)."""

    def test_overdue_fills_all_when_not_full_recommend(self):
        available = {'overdue': 50, 'new': 30, 'short': 30}
        q = _decide_slot_quotas(available, 20, 'mid', full_recommend=False)
        assert q['overdue'] == 20
        assert q['new'] == 0
        assert sum(q.values()) == 20


class TestFullRecommendFloor:
    """full_recommend=True → 신규/단기 floor 예약, overdue 독식 방지."""

    def test_overdue_backlog_still_reserves_new_and_short(self):
        available = {'overdue': 50, 'new': 30, 'short': 30}
        q = _decide_slot_quotas(available, 20, 'mid', full_recommend=True)
        # mid weights: new 0.30, short 0.40 → floor 6 + 8 = 14 예약
        assert q['new'] >= 1, q
        assert q['short'] >= 1, q
        assert q['overdue'] <= 20 - (q['new'] + q['short']) + q.get('medium', 0) + 1
        assert sum(q.values()) == 20

    def test_no_overdue_distributes_by_level(self):
        available = {'new': 30, 'short': 30, 'medium': 30}
        q = _decide_slot_quotas(available, 20, 'mid', full_recommend=True)
        assert sum(q.values()) == 20
        assert q['new'] > 0 and q['short'] > 0


class TestNewAllowanceCap:
    """new_allowance → 신규 bucket 상한."""

    def test_new_capped_by_allowance(self):
        available = {'new': 30}
        q = _decide_slot_quotas(available, 20, 'high', full_recommend=True, new_allowance=5)
        assert q['new'] <= 5, q

    def test_new_allowance_zero_blocks_new(self):
        available = {'new': 30, 'short': 10}
        q = _decide_slot_quotas(available, 20, 'high', full_recommend=True, new_allowance=0)
        assert q['new'] == 0
        # 신규가 막히면 남는 슬롯은 복습(short)으로
        assert q['short'] == 10

    def test_allowance_ignored_when_not_full_recommend(self):
        # 명시적 선택 모드에서는 new_allowance를 줘도 cap 미적용
        available = {'new': 30}
        q = _decide_slot_quotas(available, 20, 'high', full_recommend=False, new_allowance=5)
        assert q['new'] == 20
