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

    def test_new_allowance_zero_blocks_new_when_not_done(self):
        # overdue가 있어 DONE 상태가 아님 → 기존 동작(신규 상한 0이면 new=0) 그대로 유지.
        available = {'overdue': 5, 'new': 30, 'short': 10}
        q = _decide_slot_quotas(available, 20, 'high', full_recommend=True, new_allowance=0)
        assert q['new'] == 0

    def test_allowance_ignored_when_not_full_recommend(self):
        # 명시적 선택 모드에서는 new_allowance를 줘도 cap 미적용
        available = {'new': 30}
        q = _decide_slot_quotas(available, 20, 'high', full_recommend=False, new_allowance=5)
        assert q['new'] == 20


class TestDoneStateNewQuota:
    """
    DONE 상태(lapse+overdue+today == 0, 2026-09 추가)에서는 하루 신규 상한이 소진돼도
    (new_allowance=0) 세션당 최소 _DONE_NEW_MIN_QUOTA(4)개는 신규를 허용한다.
    "더 돌보러 가기"를 눌렀는데 신규가 0개인 체감을 막기 위한 예외.
    """

    def test_allowance_zero_still_gets_minimum_quota(self):
        # lapse/overdue/today 키가 아예 없음 → 전부 0 취급 → DONE 상태로 판정.
        # short를 넉넉히 둬서(30) "가용 총량 부족" 케이스와 분리해 new 쿼터만 검증.
        available = {'new': 30, 'short': 30}
        q = _decide_slot_quotas(available, 20, 'high', full_recommend=True, new_allowance=0)
        assert q['new'] == 4
        assert sum(q.values()) == 20

    def test_ratio_cap_applies_even_when_allowance_is_healthy(self):
        # DONE 상태에서는 new_allowance가 넉넉해도(10) round(count*0.3)로 캡된다 —
        # 'high' 레벨 가중치(0.55)보다 낮은 고정 30% 상한.
        available = {'new': 30, 'short': 30}
        q = _decide_slot_quotas(available, 20, 'high', full_recommend=True, new_allowance=10)
        assert q['new'] == 6  # round(20 * 0.3)
        assert sum(q.values()) == 20

    def test_not_applied_when_not_full_recommend(self):
        # 명시적 선택 모드에서는 DONE 여부와 무관하게 이 예외가 적용되지 않는다.
        available = {'new': 30}
        q = _decide_slot_quotas(available, 20, 'high', full_recommend=False, new_allowance=0)
        assert q['new'] == 20
