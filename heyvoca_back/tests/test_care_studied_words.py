"""get_today_tasks care.studied_words 계약 — 로컬 DB 필요(없으면 skip)."""
import pytest


def test_studied_words_matches_studied_today():
    try:
        from app import create_app, db
        from app.models.models import UserStudyLog
        from app.services.game.farm_v2 import query
        from app.services.study_day import logical_day_start_utc
        import datetime as dt
        app = create_app()
    except Exception as e:  # pragma: no cover
        pytest.skip(str(e))
    with app.app_context():
        from sqlalchemy import func
        row = (db.session.query(UserStudyLog.user_id, func.max(UserStudyLog.created_at))
               .group_by(UserStudyLog.user_id)
               .order_by(func.max(UserStudyLog.created_at).desc()).first())
        if not row:
            pytest.skip('no study log')
        res = query.get_today_tasks(row[0], now=row[1] + dt.timedelta(minutes=1), refresh=False)
        care = res['care']
        assert len(care['studied_words']) == min(care['studied_today'], query.STUDIED_WORDS_LIMIT)
        assert care['studied_words_truncated'] == (care['studied_today'] > query.STUDIED_WORDS_LIMIT)
        keys = {'user_voca_id', 'word', 'meaning', 'stage', 'health_state', 'done'}
        for w in care['words'] + care['studied_words'] + res['wilted']['words']:
            assert keys <= set(w)
