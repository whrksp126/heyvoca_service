"""홈 "아직 N개가 기다리고 있어요"(overview.today.care_due_cnt) 판정 검증.

정본은 단어장 카드 배지 `vocaCrop.js::bookCareCount` 다:
  isCareDue(daysToReview(word), isUnplanted(word))
    - isUnplanted: 서버 farm.stage === 'UNPLANTED_SEED' (게임 행이 없으면 UNPLANTED_SEED)
    - daysToReview: next_review 의 현지(KST) 자정 경계 기준 남은 일수 <= 0
    - 부패(ROTTEN)는 포함, 황금은 제외(서버 쪽 추가 규칙)

배경(2026-09 prod 신고): 홈 46 vs 단어장 카드 합 17. 서버가 예정일만 보고 게임 행이 없는
(= 보유 씨앗으로 그려지는) 단어까지 세고 있었다.
"""

import datetime as dt
import json

from app.models.models import VisualStage
from app.services.game.farm_v2.query import care_due_ids_from_rows

# 2026-09-25 12:00 KST
NOW = dt.datetime(2026, 9, 25, 3, 0, 0)


def _data(due_utc=None):
    fsrs = {'state': 'review', 'stability': 5.0}
    if due_utc is not None:
        fsrs['next_review'] = due_utc.isoformat() + 'Z'
    return json.dumps({'schema_version': 3, 'fsrs': fsrs})


def _row(uv_id, stage=VisualStage.SPROUT, due_utc=None, has_game=True):
    """(game.user_voca_id, game.visual_stage, user_voca.id, user_voca.data) — LEFT JOIN 1행."""
    return (uv_id if has_game else None, stage if has_game else None, uv_id, _data(due_utc))


def test_overdue_and_today_are_counted():
    rows = [
        _row(1, due_utc=NOW - dt.timedelta(days=3)),       # 3일 지남
        _row(2, due_utc=NOW + dt.timedelta(hours=10)),     # 오늘 22시 KST — 시각은 아직이지만 오늘
        _row(3, due_utc=NOW + dt.timedelta(days=1)),       # 내일
    ]
    assert care_due_ids_from_rows(rows, NOW) == {1, 2}


def test_tomorrow_kst_boundary_is_not_counted():
    # 2026-09-25 15:00 UTC = 09-26 00:00 KST → 내일
    rows = [_row(1, due_utc=dt.datetime(2026, 9, 25, 15, 0, 0))]
    assert care_due_ids_from_rows(rows, NOW) == set()


def test_unplanted_with_fsrs_due_is_not_counted():
    # 이번 버그 — 게임 행이 없는(단어장·밭 팻말에서는 '미학습') 단어가 예정일만으로 잡혔다
    rows = [
        _row(1, due_utc=NOW - dt.timedelta(days=5), has_game=False),
        _row(2, stage=VisualStage.UNPLANTED_SEED, due_utc=NOW - dt.timedelta(days=5)),
    ]
    assert care_due_ids_from_rows(rows, NOW) == set()


def test_rotten_stage_word_is_counted_but_golden_is_not():
    # 부패는 건강 상태라 visual_stage 와 무관 — 심은 작물이면 예정일 기준으로 센다(기존 정책)
    rows = [
        _row(1, stage=VisualStage.LEAF, due_utc=NOW - dt.timedelta(days=60)),
        _row(2, stage=VisualStage.GOLDEN, due_utc=NOW - dt.timedelta(days=60)),
    ]
    assert care_due_ids_from_rows(rows, NOW) == {1}


def test_no_due_date_is_not_counted():
    rows = [_row(1, stage=VisualStage.PLANTED_SEED, due_utc=None)]
    assert care_due_ids_from_rows(rows, NOW) == set()
