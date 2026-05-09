"""
UserVoca.data 컬럼을 schema_version=3 (FSRS-only) 로 일괄 정규화.

처리 규칙 (idempotent):
  - data IS NULL                 → SKIP
  - schema_version == 3          → SKIP (이미 V3)
  - schema_version 없음 (V1 SM2) → migrate_v1_to_v2() 호출 → V3 payload 저장
  - schema_version == 2          → fsrs 블록 추출, 학습 흔적이 있는데 fsrs.state="new"
                                   인 경우는 sm2 → fsrs 재계산. set_fsrs_state() 로 sm2 블록 제거.

사용법:
  docker exec -it heyvoca_back_local python jobs/migrate_user_voca_to_v3.py [옵션]

옵션:
  --dry-run         DB 변경 없이 처리 결과만 출력
  --batch-size N    배치 크기 (기본 500)
  --limit N         최대 처리 row 수 (기본: 무제한)
  --from-id N       시작 user_voca.id (기본 0)
  --quiet           진행 로그 최소화 (entrypoint 용)
"""

import argparse
import json
import os
import sys
import datetime
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db
from app.models.models import UserVoca
from app.services.fsrs.state import (
    parse_user_voca_data,
    serialize_user_voca_data,
    set_fsrs_state,
    get_fsrs_state,
    migrate_v1_to_v2,
    is_v1,
    DEFAULT_FSRS_NEW,
)
from app.services.fsrs.converter import sm2_to_fsrs


def parse_args():
    parser = argparse.ArgumentParser(description='UserVoca.data → schema_version=3 정규화')
    parser.add_argument('--dry-run', action='store_true', help='DB 변경 없이 시뮬레이션')
    parser.add_argument('--batch-size', type=int, default=500, help='배치 크기 (기본 500)')
    parser.add_argument('--limit', type=int, default=None, help='최대 처리 row 수')
    parser.add_argument('--from-id', type=int, default=0, help='시작 user_voca.id')
    parser.add_argument('--quiet', action='store_true', help='진행 로그 최소화')
    return parser.parse_args()


def _convert_payload(payload: dict) -> Optional[dict]:
    """payload 를 V3 로 변환. 이미 V3 면 None 반환 (변경 없음)."""
    schema_version = payload.get('schema_version')

    if schema_version == 3:
        return None

    if is_v1(payload):
        # V1 (SM2-only flat dict) → V3
        return migrate_v1_to_v2(payload)

    if schema_version == 2:
        fsrs = get_fsrs_state(payload)
        sm2 = payload.get('sm2') or {}

        # V2 fsrs 가 비어있고 sm2 에 학습 흔적이 있으면 → sm2_to_fsrs 재계산
        if (not fsrs or fsrs.get('state') in (None, 'new')) and (
            int(sm2.get('repetition') or 0) > 0 or int(sm2.get('interval') or 0) > 0
        ):
            fsrs = sm2_to_fsrs(sm2)

        if not fsrs:
            fsrs = dict(DEFAULT_FSRS_NEW)

        return set_fsrs_state(payload, fsrs)

    # 알 수 없는 schema_version — 안전하게 그대로 둠
    return None


def main():
    args = parse_args()
    app = create_app()
    with app.app_context():
        run_migration(args)


def run_migration(args):
    dry_run    = args.dry_run
    batch_size = max(1, args.batch_size)
    limit      = args.limit
    from_id    = args.from_id
    quiet      = args.quiet

    if not quiet:
        print(f"[migrate-v3] 시작 — dry_run={dry_run}, batch_size={batch_size}, limit={limit}, from_id={from_id}")

    total_done      = 0
    total_v1_to_v3  = 0
    total_v2_to_v3  = 0
    total_skipped   = 0
    total_null      = 0
    total_errors    = 0
    error_ids: list = []
    current_id      = from_id

    while True:
        if limit is not None and total_done >= limit:
            break

        remaining = (limit - total_done) if limit is not None else batch_size
        fetch_size = min(batch_size, remaining)

        rows = (
            db.session.query(UserVoca)
            .filter(UserVoca.id > current_id)
            .order_by(UserVoca.id.asc())
            .limit(fetch_size)
            .all()
        )

        if not rows:
            break

        batch_v1   = 0
        batch_v2   = 0
        batch_skip = 0
        batch_null = 0
        batch_err  = 0

        for row in rows:
            try:
                if row.data is None:
                    batch_null += 1
                    continue

                payload = parse_user_voca_data(row.data)
                schema_before = payload.get('schema_version')

                new_payload = _convert_payload(payload)
                if new_payload is None:
                    batch_skip += 1
                    continue

                if not dry_run:
                    row.data = serialize_user_voca_data(new_payload)
                    row.updated_at = datetime.datetime.utcnow()

                if schema_before == 2:
                    batch_v2 += 1
                else:
                    batch_v1 += 1

            except Exception as e:
                batch_err += 1
                error_ids.append(row.id)
                print(f"[migrate-v3] ERROR row_id={row.id}: {e}", file=sys.stderr)

        if not dry_run and (batch_v1 + batch_v2) > 0:
            try:
                db.session.commit()
            except Exception as e:
                db.session.rollback()
                print(f"[migrate-v3] 배치 커밋 실패: {e}", file=sys.stderr)
                total_errors += (batch_v1 + batch_v2)
                current_id = rows[-1].id
                total_done += len(rows)
                continue
        else:
            db.session.expunge_all()

        total_done     += len(rows)
        total_v1_to_v3 += batch_v1
        total_v2_to_v3 += batch_v2
        total_skipped  += batch_skip
        total_null     += batch_null
        total_errors   += batch_err
        current_id      = rows[-1].id

        if not quiet:
            print(f"[migrate-v3] {total_done} 처리: v1→v3={total_v1_to_v3}, "
                  f"v2→v3={total_v2_to_v3}, skip(v3)={total_skipped}, "
                  f"null={total_null}, errors={total_errors}")

    # 리포트 (entrypoint 호출 시에는 변환 0건이면 리포트 생략)
    has_changes = (total_v1_to_v3 + total_v2_to_v3) > 0
    if has_changes or not quiet:
        timestamp = datetime.datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')
        report = {
            'timestamp':      timestamp,
            'dry_run':        dry_run,
            'total_processed': total_done,
            'v1_to_v3':       total_v1_to_v3,
            'v2_to_v3':       total_v2_to_v3,
            'skipped':        total_skipped,
            'null':           total_null,
            'errors':         total_errors,
            'error_ids':      error_ids,
        }
        if has_changes:
            report_dir = os.path.dirname(os.path.abspath(__file__))
            report_path = os.path.join(report_dir, f'.migration_v3_report_{timestamp}.json')
            try:
                with open(report_path, 'w', encoding='utf-8') as f:
                    json.dump(report, f, ensure_ascii=False, indent=2)
                if not quiet:
                    print(f"[migrate-v3] 리포트 저장: {report_path}")
            except Exception as e:
                print(f"[migrate-v3] 리포트 저장 실패: {e}", file=sys.stderr)
        if not quiet:
            print(f"[migrate-v3] 완료 — v1→v3={total_v1_to_v3}, v2→v3={total_v2_to_v3}, "
                  f"skip(v3)={total_skipped}, null={total_null}, errors={total_errors}")
    elif quiet and total_errors == 0:
        # entrypoint 모드 + 변환 0건 → 한 줄만
        print(f"[migrate-v3] OK — all V3 (processed={total_done})")

    if total_errors > 0:
        sys.exit(1)
    sys.exit(0)


if __name__ == '__main__':
    main()
