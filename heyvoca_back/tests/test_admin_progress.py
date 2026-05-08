"""
GET /admin/progress 엔드포인트 단위 테스트.

테스트 전략:
  - Flask test client로 HTTP 요청 발행.
  - DB 의존 쿼리는 monkeypatch로 mock (app.routes.admin.db).
  - ADMIN_TOKEN / LAUNCH_DATE 환경변수는 monkeypatch.setenv로 제어.
  - 빈 데이터 / 다양한 시나리오 검증.
"""

import os
import sys
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch, call

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app


# ──────────────────────────────────────────────────────────
# 픽스처
# ──────────────────────────────────────────────────────────

@pytest.fixture(scope='module')
def app():
    _app = create_app()
    _app.config['TESTING'] = True
    return _app


@pytest.fixture(scope='module')
def client(app):
    return app.test_client()


VALID_TOKEN = 'progress-test-token'
HEADERS = {'X-Admin-Token': VALID_TOKEN}


# ──────────────────────────────────────────────────────────
# DB mock 헬퍼
# ──────────────────────────────────────────────────────────

def _make_row(**kwargs):
    row = MagicMock()
    for k, v in kwargs.items():
        setattr(row, k, v)
    return row


def _mock_db_for_progress(
    mock_db,
    total_logs=0,
    total_sessions=0,
    active_users_30d=0,
    users_with_200_plus=0,
    users_with_500_plus=0,
):
    """
    admin_progress 뷰가 호출하는 raw SQL execute를 mock한다.

    뷰 내부 db.session.execute() 호출 순서:
      1. COUNT(*) user_study_log                     → total_logs
      2. COUNT(*) user_study_session                 → total_sessions
      3. COUNT(DISTINCT user_id) ... WHERE created_at → active_users_30d
      4. COUNT(*) FROM (... HAVING review_cnt >= 200) → users_with_200_plus
      5. COUNT(*) FROM (... HAVING review_cnt >= 500) → users_with_500_plus

    SQL 내용을 보고 순서를 구분한다.
    """
    cnt_rows = iter([
        _make_row(cnt=total_logs),
        _make_row(cnt=total_sessions),
        _make_row(cnt=active_users_30d),
        _make_row(cnt=users_with_200_plus),
        _make_row(cnt=users_with_500_plus),
    ])

    def _execute_side_effect(stmt, params=None):
        result = MagicMock()
        result.fetchone.return_value = next(cnt_rows)
        result.fetchall.return_value = []
        return result

    mock_db.session.execute.side_effect = _execute_side_effect


# ──────────────────────────────────────────────────────────
# 공통 헬퍼 — 인증 포함 GET 요청
# ──────────────────────────────────────────────────────────

def _get_progress(client, monkeypatch, launch_date=None, **db_kwargs):
    """LAUNCH_DATE 환경변수와 DB mock을 설정하고 /admin/progress GET."""
    monkeypatch.setenv('ADMIN_TOKEN', VALID_TOKEN)
    if launch_date:
        monkeypatch.setenv('LAUNCH_DATE', launch_date)
    else:
        monkeypatch.delenv('LAUNCH_DATE', raising=False)

    with patch('app.routes.admin.db') as mock_db:
        _mock_db_for_progress(mock_db, **db_kwargs)
        return client.get('/admin/progress', headers=HEADERS)


# ──────────────────────────────────────────────────────────
# 1. 인증 테스트
# ──────────────────────────────────────────────────────────

class TestProgressAuth:
    def test_no_token_returns_401(self, client, monkeypatch):
        """X-Admin-Token 헤더 없으면 401."""
        monkeypatch.setenv('ADMIN_TOKEN', VALID_TOKEN)
        resp = client.get('/admin/progress')
        assert resp.status_code == 401

    def test_wrong_token_returns_401(self, client, monkeypatch):
        """잘못된 토큰 → 401."""
        monkeypatch.setenv('ADMIN_TOKEN', VALID_TOKEN)
        resp = client.get('/admin/progress', headers={'X-Admin-Token': 'wrong'})
        assert resp.status_code == 401

    def test_no_env_token_returns_503(self, client, monkeypatch):
        """ADMIN_TOKEN 환경변수 미설정 → 503."""
        monkeypatch.delenv('ADMIN_TOKEN', raising=False)
        resp = client.get('/admin/progress', headers={'X-Admin-Token': 'any'})
        assert resp.status_code == 503

    def test_correct_token_returns_200(self, client, monkeypatch):
        """올바른 토큰 → 200."""
        resp = _get_progress(client, monkeypatch)
        assert resp.status_code == 200


# ──────────────────────────────────────────────────────────
# 2. 응답 구조 검증
# ──────────────────────────────────────────────────────────

class TestProgressResponseStructure:
    @pytest.fixture(autouse=True)
    def _base_resp(self, client, monkeypatch):
        self._resp = _get_progress(client, monkeypatch)
        self._data = self._resp.get_json()

    def test_status_200(self):
        assert self._resp.status_code == 200

    def test_code_200_in_body(self):
        assert self._data['code'] == 200

    def test_top_level_keys(self):
        assert {'code', 'data'} == set(self._data.keys())

    def test_data_has_now(self):
        assert 'now' in self._data['data']

    def test_data_has_summary(self):
        assert 'summary' in self._data['data']

    def test_data_has_phases(self):
        assert 'phases' in self._data['data']

    def test_phases_count_is_4(self):
        assert len(self._data['data']['phases']) == 4

    def test_phase_ids(self):
        ids = [p['id'] for p in self._data['data']['phases']]
        assert ids == ['1.4', '3.1', '3.2', '3.3']

    def test_summary_fields(self):
        summary = self._data['data']['summary']
        required = {
            'total_logs', 'total_sessions', 'active_users_30d',
            'users_with_200_plus_reviews', 'days_since_launch',
            'patch_voca_indexs_sm2_calls_7d', 'fallback_users_7d',
        }
        assert required.issubset(summary.keys())

    def test_phase_required_fields(self):
        for phase in self._data['data']['phases']:
            for field in ('id', 'title', 'description', 'status', 'thresholds', 'next_action'):
                assert field in phase, f"phase {phase.get('id')} missing field: {field}"

    def test_threshold_required_fields(self):
        for phase in self._data['data']['phases']:
            for t in phase['thresholds']:
                for field in ('name', 'criteria', 'current', 'target',
                              'progress_percent', 'met'):
                    assert field in t, (
                        f"phase {phase['id']} threshold '{t.get('name')}' missing: {field}"
                    )

    def test_next_action_fields(self):
        for phase in self._data['data']['phases']:
            na = phase['next_action']
            for field in ('trigger_label', 'command_for_claude', 'doc_link'):
                assert field in na, f"phase {phase['id']} next_action missing: {field}"

    def test_now_format(self):
        """now 필드가 ISO 형식(Z 접미어)인지 확인."""
        now_str = self._data['data']['now']
        assert now_str.endswith('Z'), f"now 필드 형식 오류: {now_str}"
        # 파싱 가능한지도 확인
        datetime.strptime(now_str, '%Y-%m-%dT%H:%M:%SZ')


# ──────────────────────────────────────────────────────────
# 3. LAUNCH_DATE 시나리오
# ──────────────────────────────────────────────────────────

class TestLaunchDate:
    def test_no_launch_date_days_since_launch_is_none(self, client, monkeypatch):
        """LAUNCH_DATE 미설정 → days_since_launch=null."""
        resp = _get_progress(client, monkeypatch, launch_date=None)
        summary = resp.get_json()['data']['summary']
        assert summary['days_since_launch'] is None

    def test_launch_date_30_days_ago(self, client, monkeypatch):
        """LAUNCH_DATE가 정확히 30일 전 → days_since_launch=30."""
        launch = (datetime.utcnow() - timedelta(days=30)).strftime('%Y-%m-%d')
        resp = _get_progress(client, monkeypatch, launch_date=launch)
        summary = resp.get_json()['data']['summary']
        assert summary['days_since_launch'] == 30

    def test_launch_date_7_days_ago(self, client, monkeypatch):
        """LAUNCH_DATE가 7일 전 → days_since_launch=7."""
        launch = (datetime.utcnow() - timedelta(days=7)).strftime('%Y-%m-%d')
        resp = _get_progress(client, monkeypatch, launch_date=launch)
        summary = resp.get_json()['data']['summary']
        assert summary['days_since_launch'] == 7

    def test_no_launch_date_time_thresholds_progress_zero(self, client, monkeypatch):
        """LAUNCH_DATE 미설정 → Phase 1.4 최소 임계치 progress=0."""
        resp = _get_progress(client, monkeypatch, launch_date=None)
        phase_14 = resp.get_json()['data']['phases'][0]
        min_threshold = phase_14['thresholds'][0]
        assert min_threshold['progress_percent'] == 0
        assert min_threshold['met'] is False

    def test_no_launch_date_phase_14_status_blocked(self, client, monkeypatch):
        """LAUNCH_DATE 미설정 → Phase 1.4 status=blocked."""
        resp = _get_progress(client, monkeypatch, launch_date=None)
        phase_14 = resp.get_json()['data']['phases'][0]
        assert phase_14['status'] == 'blocked'

    def test_launch_date_past_28_days_phase14_min_sm2_zero(self, client, monkeypatch):
        """
        LAUNCH_DATE 28일 초과 + sm2 호출 0 → Phase 1.4 최소 기준 met.
        (patch_voca_indexs_sm2_calls_7d는 현재 0 고정이므로 자동 충족)
        """
        launch = (datetime.utcnow() - timedelta(days=29)).strftime('%Y-%m-%d')
        resp = _get_progress(client, monkeypatch, launch_date=launch)
        phase_14 = resp.get_json()['data']['phases'][0]
        min_threshold = phase_14['thresholds'][0]
        assert min_threshold['met'] is True


# ──────────────────────────────────────────────────────────
# 4. Phase 3.1 진행률 시나리오
# ──────────────────────────────────────────────────────────

class TestPhase31Progress:
    def test_total_logs_zero_all_progress_zero(self, client, monkeypatch):
        """total_logs=0 → Phase 3.1 모든 임계치 progress=0."""
        resp = _get_progress(client, monkeypatch, total_logs=0)
        phase_31 = resp.get_json()['data']['phases'][1]
        for t in phase_31['thresholds']:
            assert t['progress_percent'] == 0.0
            assert t['met'] is False

    def test_total_logs_zero_status_blocked(self, client, monkeypatch):
        """total_logs=0 → Phase 3.1 status=blocked."""
        resp = _get_progress(client, monkeypatch, total_logs=0)
        phase_31 = resp.get_json()['data']['phases'][1]
        assert phase_31['status'] == 'blocked'

    def test_total_logs_15000_min_met_rec_50pct(self, client, monkeypatch):
        """total_logs=15,000 → 최소(10K) met=True, 권장(30K) ~50%."""
        resp = _get_progress(client, monkeypatch, total_logs=15000)
        phase_31 = resp.get_json()['data']['phases'][1]
        thresholds = phase_31['thresholds']

        min_t = thresholds[0]
        rec_t = thresholds[1]

        assert min_t['met'] is True
        assert min_t['progress_percent'] == 100.0

        # 15000/30000 = 50.0%
        assert rec_t['progress_percent'] == 50.0
        assert rec_t['met'] is False

    def test_total_logs_15000_status_available(self, client, monkeypatch):
        """total_logs=15,000 → Phase 3.1 status=available."""
        resp = _get_progress(client, monkeypatch, total_logs=15000)
        phase_31 = resp.get_json()['data']['phases'][1]
        assert phase_31['status'] == 'available'

    def test_total_logs_100000_all_met(self, client, monkeypatch):
        """total_logs=100,000 → 모든 임계치 met."""
        resp = _get_progress(client, monkeypatch, total_logs=100000)
        phase_31 = resp.get_json()['data']['phases'][1]
        for t in phase_31['thresholds']:
            assert t['met'] is True
            assert t['progress_percent'] == 100.0

    def test_total_logs_5000_progress_50pct_of_min(self, client, monkeypatch):
        """total_logs=5,000 → 최소(10K) 기준 50%."""
        resp = _get_progress(client, monkeypatch, total_logs=5000)
        phase_31 = resp.get_json()['data']['phases'][1]
        assert phase_31['thresholds'][0]['progress_percent'] == 50.0


# ──────────────────────────────────────────────────────────
# 5. Phase 3.2 진행률 시나리오
# ──────────────────────────────────────────────────────────

class TestPhase32Progress:
    def test_50_users_200plus_min_50pct(self, client, monkeypatch):
        """200+ reviews 사용자 50명 → 최소(100명) 기준 50%."""
        resp = _get_progress(client, monkeypatch, users_with_200_plus=50)
        phase_32 = resp.get_json()['data']['phases'][2]
        min_t = phase_32['thresholds'][0]
        assert min_t['progress_percent'] == 50.0
        assert min_t['met'] is False

    def test_50_users_200plus_status_blocked(self, client, monkeypatch):
        """200+ reviews 사용자 50명 → status=blocked."""
        resp = _get_progress(client, monkeypatch, users_with_200_plus=50)
        phase_32 = resp.get_json()['data']['phases'][2]
        assert phase_32['status'] == 'blocked'

    def test_100_users_200plus_min_met(self, client, monkeypatch):
        """200+ reviews 사용자 100명 → 최소 기준 met."""
        resp = _get_progress(client, monkeypatch, users_with_200_plus=100)
        phase_32 = resp.get_json()['data']['phases'][2]
        min_t = phase_32['thresholds'][0]
        assert min_t['met'] is True
        assert min_t['progress_percent'] == 100.0

    def test_100_users_200plus_status_available(self, client, monkeypatch):
        """200+ reviews 사용자 100명 → status=available."""
        resp = _get_progress(client, monkeypatch, users_with_200_plus=100)
        phase_32 = resp.get_json()['data']['phases'][2]
        assert phase_32['status'] == 'available'

    def test_zero_users_all_progress_zero(self, client, monkeypatch):
        """users_with_200_plus=0 → 모든 임계치 progress=0."""
        resp = _get_progress(client, monkeypatch)
        phase_32 = resp.get_json()['data']['phases'][2]
        for t in phase_32['thresholds']:
            assert t['progress_percent'] == 0.0

    def test_500plus_threshold_uses_500_plus_users(self, client, monkeypatch):
        """최상 임계치는 users_with_500_plus_reviews 기준."""
        resp = _get_progress(
            client, monkeypatch,
            users_with_200_plus=600,
            users_with_500_plus=500,
        )
        phase_32 = resp.get_json()['data']['phases'][2]
        best_t = phase_32['thresholds'][2]
        # 500/1000 = 50%
        assert best_t['progress_percent'] == 50.0

    def test_500plus_1000_best_met(self, client, monkeypatch):
        """users_with_500_plus=1000 → 최상 기준 met."""
        resp = _get_progress(
            client, monkeypatch,
            users_with_200_plus=1000,
            users_with_500_plus=1000,
        )
        phase_32 = resp.get_json()['data']['phases'][2]
        best_t = phase_32['thresholds'][2]
        assert best_t['met'] is True


# ──────────────────────────────────────────────────────────
# 6. Phase 3.3 시나리오
# ──────────────────────────────────────────────────────────

class TestPhase33:
    def test_status_always_deferred(self, client, monkeypatch):
        """Phase 3.3 status는 항상 deferred."""
        resp = _get_progress(client, monkeypatch)
        phase_33 = resp.get_json()['data']['phases'][3]
        assert phase_33['status'] == 'deferred'

    def test_no_launch_date_progress_zero(self, client, monkeypatch):
        """LAUNCH_DATE 미설정 → Phase 3.3 권장 임계치 progress=0."""
        resp = _get_progress(client, monkeypatch, launch_date=None)
        phase_33 = resp.get_json()['data']['phases'][3]
        t = phase_33['thresholds'][0]
        assert t['progress_percent'] == 0
        assert t['met'] is False

    def test_launch_date_90_days_half_progress(self, client, monkeypatch):
        """90일 경과 → 180일 기준 50%."""
        launch = (datetime.utcnow() - timedelta(days=90)).strftime('%Y-%m-%d')
        resp = _get_progress(client, monkeypatch, launch_date=launch)
        phase_33 = resp.get_json()['data']['phases'][3]
        t = phase_33['thresholds'][0]
        assert t['progress_percent'] == 50.0
        assert t['met'] is False

    def test_launch_date_180_days_met(self, client, monkeypatch):
        """180일 경과 → met=True."""
        launch = (datetime.utcnow() - timedelta(days=180)).strftime('%Y-%m-%d')
        resp = _get_progress(client, monkeypatch, launch_date=launch)
        phase_33 = resp.get_json()['data']['phases'][3]
        t = phase_33['thresholds'][0]
        assert t['met'] is True


# ──────────────────────────────────────────────────────────
# 7. summary 필드 값 검증
# ──────────────────────────────────────────────────────────

class TestProgressSummaryValues:
    def test_empty_db_all_zero(self, client, monkeypatch):
        """빈 DB → summary 수치 필드 모두 0."""
        resp = _get_progress(client, monkeypatch)
        summary = resp.get_json()['data']['summary']
        assert summary['total_logs'] == 0
        assert summary['total_sessions'] == 0
        assert summary['active_users_30d'] == 0
        assert summary['users_with_200_plus_reviews'] == 0
        assert summary['patch_voca_indexs_sm2_calls_7d'] == 0
        assert summary['fallback_users_7d'] == 0

    def test_patch_voca_indexs_sm2_calls_always_zero(self, client, monkeypatch):
        """patch_voca_indexs_sm2_calls_7d는 현재 0 고정 (인프라 미구현)."""
        resp = _get_progress(client, monkeypatch)
        summary = resp.get_json()['data']['summary']
        assert summary['patch_voca_indexs_sm2_calls_7d'] == 0

    def test_fallback_users_7d_always_zero(self, client, monkeypatch):
        """fallback_users_7d는 현재 0 고정."""
        resp = _get_progress(client, monkeypatch)
        summary = resp.get_json()['data']['summary']
        assert summary['fallback_users_7d'] == 0


# ──────────────────────────────────────────────────────────
# 8. _parse_launch_date / _calc_progress 유닛 테스트
# ──────────────────────────────────────────────────────────

class TestHelperFunctions:
    def test_calc_progress_zero_target_current_zero(self):
        """target=0, current=0 → 1.0 (조건 충족)."""
        from app.routes.admin import _calc_progress
        assert _calc_progress(0, 0) == 1.0

    def test_calc_progress_zero_target_current_nonzero(self):
        """target=0, current>0 → 0.0 (조건 미충족)."""
        from app.routes.admin import _calc_progress
        assert _calc_progress(5, 0) == 0.0

    def test_calc_progress_normal(self):
        """current=50, target=100 → 0.5."""
        from app.routes.admin import _calc_progress
        assert _calc_progress(50, 100) == 0.5

    def test_calc_progress_capped_at_1(self):
        """current > target → 1.0으로 클램프."""
        from app.routes.admin import _calc_progress
        assert _calc_progress(200, 100) == 1.0

    def test_parse_launch_date_none_when_unset(self, monkeypatch):
        """LAUNCH_DATE 미설정 → None 반환."""
        monkeypatch.delenv('LAUNCH_DATE', raising=False)
        from app.routes.admin import _parse_launch_date
        assert _parse_launch_date() is None

    def test_parse_launch_date_valid_date(self, monkeypatch):
        """LAUNCH_DATE=2026-06-01 → datetime(2026, 6, 1) 반환."""
        monkeypatch.setenv('LAUNCH_DATE', '2026-06-01')
        from app.routes.admin import _parse_launch_date
        result = _parse_launch_date()
        assert result is not None
        assert result.year == 2026
        assert result.month == 6
        assert result.day == 1

    def test_parse_launch_date_invalid_format(self, monkeypatch):
        """잘못된 형식 → None 반환 (예외 없음)."""
        monkeypatch.setenv('LAUNCH_DATE', 'not-a-date')
        from app.routes.admin import _parse_launch_date
        assert _parse_launch_date() is None
