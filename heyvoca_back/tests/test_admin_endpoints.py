"""
admin 모니터링 엔드포인트 단위 테스트.

테스트 전략:
  - Flask test client로 HTTP 요청 발행.
  - DB 의존 쿼리는 monkeypatch로 mock (SQLAlchemy execute).
  - ADMIN_TOKEN 환경변수는 monkeypatch.setenv로 설정.
  - 빈 데이터 상태(현재 로컬)에서 0/None 안전 처리 검증.
"""

import pytest
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from unittest.mock import MagicMock, patch
from app import create_app


# ──────────────────────────────────────────────────────────
# 픽스처
# ──────────────────────────────────────────────────────────

@pytest.fixture(scope='module')
def app():
    """테스트용 Flask 앱."""
    _app = create_app()
    _app.config['TESTING'] = True
    return _app


@pytest.fixture(scope='module')
def client(app):
    return app.test_client()


# ──────────────────────────────────────────────────────────
# 공용 DB mock 헬퍼
# ──────────────────────────────────────────────────────────

def _make_row(**kwargs):
    """딕셔너리를 속성 접근 가능한 객체로 변환."""
    row = MagicMock()
    for k, v in kwargs.items():
        setattr(row, k, v)
    return row


def _mock_execute_metrics(mock_db, total_logs=0, correct_logs=0,
                           active_users=0, avg_time=0, total_sessions=0):
    """study_metrics용 execute side_effect 시퀀스."""
    log_row     = _make_row(total_logs=total_logs, correct_logs=correct_logs,
                            active_users=active_users, avg_time_taken_ms=avg_time)
    session_row = _make_row(total_sessions=total_sessions)

    def _execute(stmt, params=None):
        result = MagicMock()
        sql = str(stmt)
        if 'total_sessions' in sql:
            result.fetchone.return_value = session_row
        elif 'total_logs' in sql:
            result.fetchone.return_value = log_row
        else:
            result.fetchall.return_value = []
            result.fetchone.return_value = _make_row(cnt=0, lt10=0, mid=0, gte60=0,
                                                      total=0, lapses=0)
        return result

    mock_db.session.execute.side_effect = _execute


# ──────────────────────────────────────────────────────────
# 1. 인증 테스트
# ──────────────────────────────────────────────────────────

class TestAdminAuth:
    def test_no_token_returns_401_or_503(self, client, monkeypatch):
        """X-Admin-Token 헤더 없으면 401 또는 503 반환."""
        monkeypatch.setenv('ADMIN_TOKEN', 'secret-token')
        resp = client.get('/admin/study/metrics')
        assert resp.status_code in (401, 503)

    def test_wrong_token_returns_401(self, client, monkeypatch):
        """잘못된 토큰 → 401."""
        monkeypatch.setenv('ADMIN_TOKEN', 'correct-token')
        resp = client.get('/admin/study/metrics',
                          headers={'X-Admin-Token': 'wrong-token'})
        assert resp.status_code == 401
        data = resp.get_json()
        assert data['code'] == 401

    def test_wrong_token_message(self, client, monkeypatch):
        """401 응답에 message 필드 존재."""
        monkeypatch.setenv('ADMIN_TOKEN', 'correct-token')
        resp = client.get('/admin/study/metrics',
                          headers={'X-Admin-Token': 'bad'})
        assert 'message' in resp.get_json()

    def test_no_env_token_returns_503(self, client, monkeypatch):
        """ADMIN_TOKEN 환경변수 미설정 → 503."""
        monkeypatch.delenv('ADMIN_TOKEN', raising=False)
        resp = client.get('/admin/study/metrics',
                          headers={'X-Admin-Token': 'any'})
        assert resp.status_code == 503

    def test_correct_token_passes_auth(self, client, monkeypatch):
        """올바른 토큰 → 401/503 아님 (DB mock 필요 없이 인증 통과 확인)."""
        monkeypatch.setenv('ADMIN_TOKEN', 'valid-token')
        with patch('app.routes.admin.db') as mock_db:
            _mock_execute_metrics(mock_db)
            resp = client.get('/admin/study/metrics',
                              headers={'X-Admin-Token': 'valid-token'})
        assert resp.status_code not in (401, 503)


# ──────────────────────────────────────────────────────────
# 2. GET /admin/study/metrics
# ──────────────────────────────────────────────────────────

class TestStudyMetrics:
    VALID_TOKEN = 'test-admin-token'
    HEADERS     = {'X-Admin-Token': VALID_TOKEN}

    @pytest.fixture(autouse=True)
    def set_token(self, monkeypatch):
        monkeypatch.setenv('ADMIN_TOKEN', self.VALID_TOKEN)

    def _get(self, client, **query):
        qs = '&'.join(f'{k}={v}' for k, v in query.items())
        url = f'/admin/study/metrics?{qs}' if qs else '/admin/study/metrics'
        with patch('app.routes.admin.db') as mock_db:
            _mock_execute_metrics(mock_db)
            return client.get(url, headers=self.HEADERS)

    def test_returns_200(self, client):
        resp = self._get(client)
        assert resp.status_code == 200

    def test_response_has_code_200(self, client):
        data = self._get(client).get_json()
        assert data['code'] == 200

    def test_response_has_data_key(self, client):
        data = self._get(client).get_json()
        assert 'data' in data

    def test_required_fields_present(self, client):
        payload = self._get(client).get_json()['data']
        required = {
            'period_days', 'since', 'total_logs', 'total_sessions',
            'active_users', 'avg_correct_rate',
            'schema_version_distribution', 'question_type_distribution',
            'test_type_distribution', 'avg_time_taken_ms', 'fsrs_state_distribution',
        }
        assert required.issubset(payload.keys())

    def test_default_period_days_is_7(self, client):
        payload = self._get(client).get_json()['data']
        assert payload['period_days'] == 7

    def test_custom_period_days(self, client, monkeypatch):
        monkeypatch.setenv('ADMIN_TOKEN', self.VALID_TOKEN)
        with patch('app.routes.admin.db') as mock_db:
            _mock_execute_metrics(mock_db)
            resp = client.get('/admin/study/metrics?days=30', headers=self.HEADERS)
        assert resp.get_json()['data']['period_days'] == 30

    def test_empty_data_returns_zero_total_logs(self, client):
        """데이터 없을 때 total_logs=0 안전 처리."""
        payload = self._get(client).get_json()['data']
        assert payload['total_logs'] == 0

    def test_empty_data_avg_correct_rate_is_none(self, client):
        """로그 없을 때 avg_correct_rate=None (0 나누기 방지)."""
        payload = self._get(client).get_json()['data']
        assert payload['avg_correct_rate'] is None

    def test_schema_version_distribution_has_v1_v2_v3(self, client):
        """schema_version_distribution에 v1/v2/v3 키가 존재."""
        dist = self._get(client).get_json()['data']['schema_version_distribution']
        assert 'v1' in dist and 'v2' in dist and 'v3' in dist

    def test_days_clamped_max_90(self, client, monkeypatch):
        """days=999 → 90으로 클램프."""
        monkeypatch.setenv('ADMIN_TOKEN', self.VALID_TOKEN)
        with patch('app.routes.admin.db') as mock_db:
            _mock_execute_metrics(mock_db)
            resp = client.get('/admin/study/metrics?days=999', headers=self.HEADERS)
        assert resp.get_json()['data']['period_days'] == 90

    def test_days_clamped_min_1(self, client, monkeypatch):
        """days=0 → 1로 클램프."""
        monkeypatch.setenv('ADMIN_TOKEN', self.VALID_TOKEN)
        with patch('app.routes.admin.db') as mock_db:
            _mock_execute_metrics(mock_db)
            resp = client.get('/admin/study/metrics?days=0', headers=self.HEADERS)
        assert resp.get_json()['data']['period_days'] == 1


# ──────────────────────────────────────────────────────────
# 3. GET /admin/study/recent-sessions
# ──────────────────────────────────────────────────────────

class TestRecentSessions:
    VALID_TOKEN = 'test-admin-token'
    HEADERS     = {'X-Admin-Token': VALID_TOKEN}

    @pytest.fixture(autouse=True)
    def set_token(self, monkeypatch):
        monkeypatch.setenv('ADMIN_TOKEN', self.VALID_TOKEN)

    def _get(self, client, **query):
        qs = '&'.join(f'{k}={v}' for k, v in query.items())
        url = f'/admin/study/recent-sessions?{qs}' if qs else '/admin/study/recent-sessions'
        with patch('app.routes.admin.db') as mock_db:
            result = MagicMock()
            result.fetchall.return_value = []
            mock_db.session.execute.return_value = result
            return client.get(url, headers=self.HEADERS)

    def test_returns_200(self, client):
        assert self._get(client).status_code == 200

    def test_response_structure(self, client):
        data = self._get(client).get_json()
        assert data['code'] == 200
        assert 'sessions' in data['data']
        assert 'count' in data['data']

    def test_empty_sessions_returns_empty_list(self, client):
        """데이터 없으면 sessions=[], count=0."""
        payload = self._get(client).get_json()['data']
        assert payload['sessions'] == []
        assert payload['count'] == 0

    def test_limit_default_20(self, client, monkeypatch):
        """limit 기본값 20이 쿼리에 반영됨 (execute 파라미터 검증)."""
        monkeypatch.setenv('ADMIN_TOKEN', self.VALID_TOKEN)
        with patch('app.routes.admin.db') as mock_db:
            result = MagicMock()
            result.fetchall.return_value = []
            mock_db.session.execute.return_value = result
            client.get('/admin/study/recent-sessions', headers=self.HEADERS)
            # execute가 호출됐는지 확인
            assert mock_db.session.execute.called
            call_params = mock_db.session.execute.call_args[0][1]
            assert call_params.get('limit') == 20

    def test_limit_clamped_max_100(self, client, monkeypatch):
        """limit=999 → 100으로 클램프."""
        monkeypatch.setenv('ADMIN_TOKEN', self.VALID_TOKEN)
        with patch('app.routes.admin.db') as mock_db:
            result = MagicMock()
            result.fetchall.return_value = []
            mock_db.session.execute.return_value = result
            client.get('/admin/study/recent-sessions?limit=999', headers=self.HEADERS)
            call_params = mock_db.session.execute.call_args[0][1]
            assert call_params.get('limit') == 100

    def test_session_fields(self, client, monkeypatch):
        """세션 row가 있을 때 필수 필드 포함 검증."""
        from datetime import datetime as dt
        monkeypatch.setenv('ADMIN_TOKEN', self.VALID_TOKEN)
        fake_row = _make_row(
            session_id_hex='A' * 32,
            user_id_hex='B' * 32,
            test_type='test',
            question_count=20,
            correct_count=15,
            duration_seconds=120,
            started_at=dt(2026, 5, 7, 10, 0, 0),
            finished_at=dt(2026, 5, 7, 10, 2, 0),
        )
        with patch('app.routes.admin.db') as mock_db:
            result = MagicMock()
            result.fetchall.return_value = [fake_row]
            mock_db.session.execute.return_value = result
            resp = client.get('/admin/study/recent-sessions', headers=self.HEADERS)
        sessions = resp.get_json()['data']['sessions']
        assert len(sessions) == 1
        s = sessions[0]
        for field in ('session_id', 'user_id', 'test_type', 'question_count',
                       'correct_count', 'correct_rate', 'duration_seconds',
                       'started_at', 'finished_at'):
            assert field in s, f"missing field: {field}"

    def test_correct_rate_zero_question_count(self, client, monkeypatch):
        """question_count=0이면 correct_rate=None (0 나누기 방지)."""
        from datetime import datetime as dt
        monkeypatch.setenv('ADMIN_TOKEN', self.VALID_TOKEN)
        fake_row = _make_row(
            session_id_hex='A' * 32,
            user_id_hex='B' * 32,
            test_type='exam',
            question_count=0,
            correct_count=0,
            duration_seconds=None,
            started_at=dt(2026, 5, 7, 10, 0, 0),
            finished_at=None,
        )
        with patch('app.routes.admin.db') as mock_db:
            result = MagicMock()
            result.fetchall.return_value = [fake_row]
            mock_db.session.execute.return_value = result
            resp = client.get('/admin/study/recent-sessions', headers=self.HEADERS)
        s = resp.get_json()['data']['sessions'][0]
        assert s['correct_rate'] is None


# ──────────────────────────────────────────────────────────
# 4. GET /admin/fsrs/health
# ──────────────────────────────────────────────────────────

class TestFsrsHealth:
    VALID_TOKEN = 'test-admin-token'
    HEADERS     = {'X-Admin-Token': VALID_TOKEN}

    @pytest.fixture(autouse=True)
    def set_token(self, monkeypatch):
        monkeypatch.setenv('ADMIN_TOKEN', self.VALID_TOKEN)

    def _get_with_empty_db(self, client):
        with patch('app.routes.admin.db') as mock_db:
            def _execute(stmt, params=None):
                result = MagicMock()
                sql = str(stmt)
                if 'users_with_stats' in sql or 'COUNT(DISTINCT user_id)' in sql:
                    result.fetchone.return_value = _make_row(cnt=0)
                elif 'lt10' in sql or 'avg_stability' in sql or 'stability' in sql:
                    result.fetchone.return_value = _make_row(lt10=0, mid=0, gte60=0)
                elif 'lapses' in sql or 'lapse' in sql:
                    result.fetchone.return_value = _make_row(total=0, lapses=0)
                elif 'weakness' in sql or 'weakness_count' in sql:
                    result.fetchall.return_value = []
                elif 'PARTITION_NAME' in sql or 'partition' in sql.lower():
                    result.fetchall.return_value = []
                else:
                    result.fetchone.return_value = _make_row(cnt=0)
                    result.fetchall.return_value = []
                return result
            mock_db.session.execute.side_effect = _execute
            return client.get('/admin/fsrs/health', headers=self.HEADERS)

    def test_returns_200(self, client):
        assert self._get_with_empty_db(client).status_code == 200

    def test_response_code_200(self, client):
        data = self._get_with_empty_db(client).get_json()
        assert data['code'] == 200

    def test_required_fields_present(self, client):
        payload = self._get_with_empty_db(client).get_json()['data']
        required = {
            'users_with_stats', 'avg_stability_distribution',
            'lapse_rate_last_7d', 'weakness_users_top',
            'fsrs_param_active_version', 'logs_per_partition',
        }
        assert required.issubset(payload.keys())

    def test_empty_db_users_with_stats_zero(self, client):
        payload = self._get_with_empty_db(client).get_json()['data']
        assert payload['users_with_stats'] == 0

    def test_empty_db_lapse_rate_none(self, client):
        """rated 로그 없으면 lapse_rate=None."""
        payload = self._get_with_empty_db(client).get_json()['data']
        assert payload['lapse_rate_last_7d'] is None

    def test_stability_distribution_has_three_buckets(self, client):
        dist = self._get_with_empty_db(client).get_json()['data']['avg_stability_distribution']
        assert '<10' in dist and '10-60' in dist and '>=60' in dist

    def test_weakness_users_top_is_list(self, client):
        payload = self._get_with_empty_db(client).get_json()['data']
        assert isinstance(payload['weakness_users_top'], list)

    def test_fsrs_param_version_default(self, client):
        """Phase 3.1 전이므로 default-v1 반환."""
        payload = self._get_with_empty_db(client).get_json()['data']
        assert payload['fsrs_param_active_version'] == 'default-v1'

    def test_logs_per_partition_is_dict(self, client):
        payload = self._get_with_empty_db(client).get_json()['data']
        assert isinstance(payload['logs_per_partition'], dict)


# ──────────────────────────────────────────────────────────
# 5. _fmt_uuid_hex 헬퍼 단위 테스트
# ──────────────────────────────────────────────────────────

class TestFmtUuidHex:
    def test_32_char_hex_formatted(self):
        from app.routes.admin import _fmt_uuid_hex
        result = _fmt_uuid_hex('A' * 32)
        assert result == 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

    def test_none_returns_none(self):
        from app.routes.admin import _fmt_uuid_hex
        assert _fmt_uuid_hex(None) is None

    def test_short_hex_returned_as_is(self):
        from app.routes.admin import _fmt_uuid_hex
        assert _fmt_uuid_hex('abc') == 'abc'
