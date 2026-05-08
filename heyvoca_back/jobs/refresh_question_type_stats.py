"""
문제 유형별 사용자 정답률 최근 N일 집계 배치 (Phase 2.1).

UserStudyLog를 최근 N일 기준으로 집계하여
UserQuestionTypeStat.last_30d_correct_rate를 갱신한다.

사용법:
  docker exec -it heyvoca_back_local python3 jobs/refresh_question_type_stats.py
  docker exec heyvoca_back_local python3 jobs/refresh_question_type_stats.py --days 7
  docker exec heyvoca_back_local python3 jobs/refresh_question_type_stats.py --user-id <uuid>
"""

import argparse
import os
import sys
from datetime import datetime, timedelta
from uuid import UUID

# Flask app context 로드
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db
from app.models.models import UserStudyLog, UserQuestionTypeStat
from sqlalchemy import func


def parse_args():
    parser = argparse.ArgumentParser(description='문제 유형별 정답률 최근 N일 집계 배치')
    parser.add_argument(
        '--user-id',
        type=str,
        default=None,
        help='특정 사용자 UUID만 처리 (기본: 전체 사용자)',
    )
    parser.add_argument(
        '--days',
        type=int,
        default=30,
        help='집계 기간 (기본 30일)',
    )
    return parser.parse_args()


def run(user_id_str=None, days=30):
    since = datetime.utcnow() - timedelta(days=days)
    print(f"[refresh_question_type_stats] 시작 — days={days}, since={since.isoformat()}, user_id={user_id_str or 'all'}")

    # 최근 N일 UserStudyLog에서 (user_id, question_type) 별 정답률 집계
    query = (
        db.session.query(
            UserStudyLog.user_id,
            UserStudyLog.question_type,
            func.count(UserStudyLog.id).label('total'),
            func.sum(
                db.case([(UserStudyLog.was_correct == True, 1)], else_=0)
            ).label('correct'),
        )
        .filter(UserStudyLog.created_at >= since)
    )

    if user_id_str:
        try:
            uid = UUID(user_id_str)
        except (ValueError, AttributeError):
            print(f"[ERROR] 유효하지 않은 user-id: {user_id_str}")
            return
        query = query.filter(UserStudyLog.user_id == uid)

    rows = query.group_by(UserStudyLog.user_id, UserStudyLog.question_type).all()

    if not rows:
        print("[refresh_question_type_stats] 집계할 데이터 없음.")
        return

    updated = 0
    skipped = 0

    for row in rows:
        uid_val = row.user_id
        qtype   = row.question_type
        total   = int(row.total)
        correct = int(row.correct)
        rate    = round(correct / total, 4) if total > 0 else 0.0

        stat = (
            db.session.query(UserQuestionTypeStat)
            .filter_by(user_id=uid_val, question_type=qtype)
            .first()
        )

        if stat is None:
            # stat 행이 없는 경우 — 로그는 있지만 stat이 아직 없는 경계 케이스
            # last_30d_correct_rate만 저장하는 신규 row는 만들지 않음 (total_count 신뢰 불가)
            skipped += 1
            continue

        stat.last_30d_correct_rate = rate
        updated += 1

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"[ERROR] commit 실패: {e}")
        return

    print(f"[refresh_question_type_stats] 완료 — 갱신: {updated}, 스킵(stat 없음): {skipped}")


def main():
    args = parse_args()
    app = create_app()
    with app.app_context():
        run(user_id_str=args.user_id, days=args.days)


if __name__ == '__main__':
    main()
