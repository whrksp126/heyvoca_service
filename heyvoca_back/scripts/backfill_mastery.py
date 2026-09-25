"""
UserVoca.data JSON에 mastery(최근5회 정오답·연속정답·마지막학습) 블록을 백필.

배경: app/services/fsrs/state.py의 mastery 블록은 2026-09부터 /study/log가 매 답안마다
갱신한다(app/routes/study.py post_study_log). 이 스크립트는 그 시점 이전에 이미 쌓여
있던 UserStudyLog 이력으로부터 기존 UserVoca 행에 mastery의 초기값을 한 번 채워 넣는
1회성 배치다. 마이그레이션(스키마 변경)은 아니다 — UserVoca.data는 TEXT 컬럼이라
JSON 필드만 늘어난다.

처리 규칙 (idempotent):
  - data IS NULL                        → SKIP (학습 이력 자체가 없는 행)
  - payload에 이미 'mastery' 키가 있음   → SKIP (이미 처리됨 — 재실행해도 안전)
  - 그 외                                → UserStudyLog에서 user_voca_id별 최근 5개
                                           (ROW_NUMBER() OVER (PARTITION BY user_voca_id
                                           ORDER BY created_at DESC) <= 5, 인덱스
                                           `user_voca_id` 사용) 조회 → mastery 계산 후 저장.
                                           로그가 0건이면 DEFAULT_MASTERY(빈 이력)로 기록.

streak는 recent(최신이 맨 앞) 리스트에서 파생한다(state.py._leading_streak와 동일 규칙) —
읽는 쪽(get_mastery)이 항상 recent로부터 재계산하므로 여기서 독립적으로 누적 카운터를
관리할 필요가 없다(정합성 어긋날 일이 없음).

사용법:
  docker exec -it heyvoca_back_local python3 scripts/backfill_mastery.py [옵션]

옵션:
  --dry-run          DB 변경 없이 처리 결과만 출력
  --batch-size N      UserVoca 배치 크기 (기본 1000)
  --limit N          최대 처리 row 수 (기본: 무제한)
  --from-id N        시작 user_voca.id (기본 0)
  --user-id UUID     특정 사용자만 처리 (검증/재실행용)
  --quiet            진행 로그 최소화
"""

import argparse
import json
import os
import sys
import datetime
from typing import Dict, List, Optional
from uuid import UUID

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import func

from app import create_app, db
from app.models.models import UserVoca, UserStudyLog
from app.services.fsrs.state import (
    parse_user_voca_data,
    serialize_user_voca_data,
    DEFAULT_MASTERY,
    MASTERY_RECENT_MAX_LEN,
)


def parse_args():
    parser = argparse.ArgumentParser(description='UserVoca.data에 mastery 블록 백필 (1회성)')
    parser.add_argument('--dry-run', action='store_true', help='DB 변경 없이 시뮬레이션')
    parser.add_argument('--batch-size', type=int, default=1000, help='배치 크기 (기본 1000)')
    parser.add_argument('--limit', type=int, default=None, help='최대 처리 row 수')
    parser.add_argument('--from-id', type=int, default=0, help='시작 user_voca.id')
    parser.add_argument('--user-id', type=str, default=None, help='특정 user_id(UUID)만 처리')
    parser.add_argument('--quiet', action='store_true', help='진행 로그 최소화')
    return parser.parse_args()


def _fetch_recent_logs_by_voca_id(user_voca_ids: List[int]) -> Dict[int, List[bool]]:
    """
    user_voca_id별 최근 MASTERY_RECENT_MAX_LEN개 was_correct(최신이 맨 앞)를 반환.

    ROW_NUMBER() OVER (PARTITION BY user_voca_id ORDER BY created_at DESC) 윈도우 함수
    1개 쿼리로 배치 전체를 한 번에 조회한다(배치당 쿼리 1개 — user_voca_id마다 쿼리하지
    않음). user_study_log.user_voca_id 단독 인덱스(SHOW INDEX 확인됨)를 사용한다.
    """
    if not user_voca_ids:
        return {}

    rn = func.row_number().over(
        partition_by=UserStudyLog.user_voca_id,
        order_by=UserStudyLog.created_at.desc(),
    ).label('rn')

    subq = (
        db.session.query(
            UserStudyLog.user_voca_id.label('user_voca_id'),
            UserStudyLog.was_correct.label('was_correct'),
            UserStudyLog.created_at.label('created_at'),
            rn,
        )
        .filter(UserStudyLog.user_voca_id.in_(user_voca_ids))
        .subquery()
    )

    rows = (
        db.session.query(subq.c.user_voca_id, subq.c.was_correct, subq.c.created_at)
        .filter(subq.c.rn <= MASTERY_RECENT_MAX_LEN)
        .order_by(subq.c.user_voca_id, subq.c.created_at.desc())
        .all()
    )

    result: Dict[int, List[bool]] = {}
    for voca_id, was_correct, _created_at in rows:
        result.setdefault(voca_id, []).append(bool(was_correct))
    return result


def _fetch_last_studied_at(user_voca_ids: List[int]) -> Dict[int, Optional[datetime.datetime]]:
    """user_voca_id별 가장 최근 created_at (mastery.last_studied_at 용). 배치당 쿼리 1개."""
    if not user_voca_ids:
        return {}
    rows = (
        db.session.query(UserStudyLog.user_voca_id, func.max(UserStudyLog.created_at))
        .filter(UserStudyLog.user_voca_id.in_(user_voca_ids))
        .group_by(UserStudyLog.user_voca_id)
        .all()
    )
    return {voca_id: last for voca_id, last in rows}


def _leading_streak(recent: List[bool]) -> int:
    streak = 0
    for v in recent:
        if v:
            streak += 1
        else:
            break
    return streak


def main():
    args = parse_args()
    app = create_app()
    with app.app_context():
        run_backfill(args)


def run_backfill(args):
    dry_run    = args.dry_run
    batch_size = max(1, args.batch_size)
    limit      = args.limit
    from_id    = args.from_id
    quiet      = args.quiet

    user_filter_id = None
    if args.user_id:
        try:
            user_filter_id = UUID(args.user_id)
        except ValueError:
            print(f"[backfill-mastery] 잘못된 --user-id: {args.user_id}", file=sys.stderr)
            sys.exit(2)

    if not quiet:
        print(f"[backfill-mastery] 시작 — dry_run={dry_run}, batch_size={batch_size}, "
              f"limit={limit}, from_id={from_id}, user_id={user_filter_id}")

    total_done     = 0
    total_written  = 0
    total_skipped  = 0   # 이미 mastery 있음
    total_null     = 0   # data IS NULL
    total_errors   = 0
    error_ids: list = []
    current_id     = from_id

    while True:
        if limit is not None and total_done >= limit:
            break

        remaining  = (limit - total_done) if limit is not None else batch_size
        fetch_size = min(batch_size, remaining)

        query = (
            db.session.query(UserVoca)
            .filter(UserVoca.id > current_id)
        )
        if user_filter_id is not None:
            query = query.filter(UserVoca.user_id == user_filter_id)
        query = query.order_by(UserVoca.id.asc()).limit(fetch_size)
        if not dry_run:
            # 적용 모드는 배치 행을 잠그고 읽는다 — 잠그지 않고 읽은 data 에 mastery 를 얹어 쓰면
            # 그 사이 study/log 가 커밋한 학습 결과(FSRS 상태)를 옛 값으로 덮는다(lost update).
            query = query.with_for_update().populate_existing()
        rows = query.all()

        if not rows:
            break

        # 이번 배치에서 실제로 mastery를 계산해야 하는 행만 추린다(이미 있는 건 스킵).
        pending: List[tuple] = []  # (row, payload)
        batch_null = 0
        batch_skip = 0
        for row in rows:
            if row.data is None:
                batch_null += 1
                continue
            payload = parse_user_voca_data(row.data)
            if 'mastery' in payload:
                batch_skip += 1
                continue
            pending.append((row, payload))

        batch_written = 0
        batch_err = 0

        if pending:
            ids = [row.id for row, _ in pending]
            try:
                recent_map = _fetch_recent_logs_by_voca_id(ids)
                last_map   = _fetch_last_studied_at(ids)
            except Exception as e:
                print(f"[backfill-mastery] 배치 로그 조회 실패 (ids={ids[:5]}...): {e}", file=sys.stderr)
                recent_map, last_map = {}, {}

            for row, payload in pending:
                try:
                    recent = recent_map.get(row.id, [])
                    last_dt = last_map.get(row.id)
                    if recent:
                        mastery = {
                            'recent': recent,
                            'streak': _leading_streak(recent),
                            'last_studied_at': (last_dt.isoformat() + 'Z') if last_dt else None,
                        }
                    else:
                        mastery = dict(DEFAULT_MASTERY)

                    if not dry_run:
                        new_payload = dict(payload)
                        new_payload['mastery'] = mastery
                        row.data = serialize_user_voca_data(new_payload)
                        row.updated_at = datetime.datetime.utcnow()
                    batch_written += 1
                except Exception as e:
                    batch_err += 1
                    error_ids.append(row.id)
                    print(f"[backfill-mastery] ERROR row_id={row.id}: {e}", file=sys.stderr)

        if not dry_run and batch_written > 0:
            try:
                db.session.commit()
            except Exception as e:
                db.session.rollback()
                print(f"[backfill-mastery] 배치 커밋 실패: {e}", file=sys.stderr)
                total_errors += batch_written
                current_id = rows[-1].id
                total_done += len(rows)
                continue
        else:
            db.session.expunge_all()

        total_done    += len(rows)
        total_written += batch_written
        total_skipped += batch_skip
        total_null    += batch_null
        total_errors  += batch_err
        current_id     = rows[-1].id

        if not quiet:
            print(f"[backfill-mastery] {total_done} 처리: written={total_written}, "
                  f"skip(이미있음)={total_skipped}, null={total_null}, errors={total_errors}")

    if not quiet:
        print(f"[backfill-mastery] 완료 — written={total_written}, skip={total_skipped}, "
              f"null={total_null}, errors={total_errors}, dry_run={dry_run}")
        if error_ids:
            print(f"[backfill-mastery] error_ids(최대 50개): {error_ids[:50]}")

    if total_errors > 0:
        sys.exit(1)
    sys.exit(0)


if __name__ == '__main__':
    main()
