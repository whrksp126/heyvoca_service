"""
SM2 → FSRS 데이터 마이그레이션 스크립트.

UserVoca.data 컬럼을 schema_version=1(SM2-only)에서
schema_version=2(SM2+FSRS 공존)로 배치 변환한다.

idempotent: schema_version >= 2인 row는 SKIP.

사용법:
  docker exec -it heyvoca_back_local python scripts/migrate_sm2_to_fsrs.py [옵션]

옵션:
  --dry-run              DB 변경 없이 처리 결과만 출력
  --batch-size N         배치 크기 (기본 500)
  --limit N              최대 처리 row 수 (기본: 무제한)
  --from-id N            시작 user_voca.id (기본 0)
"""

import argparse
import json
import os
import sys
import datetime

# Flask app context 로드
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db
from app.models.models import UserVoca
from app.services.fsrs.state import (
    parse_user_voca_data,
    serialize_user_voca_data,
    migrate_v1_to_v2,
    is_v1,
)


def parse_args():
    parser = argparse.ArgumentParser(description='SM2 → FSRS 데이터 마이그레이션')
    parser.add_argument('--dry-run', action='store_true', help='DB 변경 없이 시뮬레이션')
    parser.add_argument('--batch-size', type=int, default=500, help='배치 크기 (기본 500)')
    parser.add_argument('--limit', type=int, default=None, help='최대 처리 row 수 (기본: 무제한)')
    parser.add_argument('--from-id', type=int, default=0, help='시작 user_voca.id (기본 0)')
    return parser.parse_args()


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

    print(f"[migrate] 시작 — dry_run={dry_run}, batch_size={batch_size}, limit={limit}, from_id={from_id}")

    total_done    = 0
    total_converted = 0
    total_skipped = 0
    total_errors  = 0
    error_ids     = []
    current_id    = from_id

    while True:
        # 처리 한도 체크
        if limit is not None and total_done >= limit:
            break

        remaining = (limit - total_done) if limit is not None else batch_size
        fetch_size = min(batch_size, remaining)

        # 배치 조회 (id 오름차순)
        rows = (
            db.session.query(UserVoca)
            .filter(UserVoca.id > current_id)
            .order_by(UserVoca.id.asc())
            .limit(fetch_size)
            .all()
        )

        if not rows:
            break

        batch_converted = 0
        batch_skipped   = 0
        batch_errors    = 0

        for row in rows:
            try:
                payload = parse_user_voca_data(row.data)

                if not is_v1(payload):
                    # schema_version >= 2 → SKIP
                    batch_skipped += 1
                    continue

                new_payload = migrate_v1_to_v2(payload)

                if not dry_run:
                    row.data = serialize_user_voca_data(new_payload)
                    row.updated_at = datetime.datetime.utcnow()

                batch_converted += 1

            except Exception as e:
                batch_errors += 1
                error_ids.append(row.id)
                print(f"[migrate] ERROR row_id={row.id}: {e}")

        # 배치 커밋
        if not dry_run and batch_converted > 0:
            try:
                db.session.commit()
            except Exception as e:
                db.session.rollback()
                print(f"[migrate] 배치 커밋 실패: {e}")
                total_errors += len(rows) - batch_skipped
                current_id = rows[-1].id
                total_done += len(rows)
                continue
        else:
            db.session.expunge_all()

        total_done      += len(rows)
        total_converted += batch_converted
        total_skipped   += batch_skipped
        total_errors    += batch_errors
        current_id       = rows[-1].id

        print(f"[migrate] {total_done} 처리, converted={total_converted}, skipped={total_skipped}, errors={total_errors}")

    # 리포트 저장
    timestamp = datetime.datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')
    report = {
        'timestamp':       timestamp,
        'dry_run':         dry_run,
        'total_processed': total_done,
        'total_converted': total_converted,
        'total_skipped':   total_skipped,
        'total_errors':    total_errors,
        'error_ids':       error_ids,
    }
    report_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        f'.migration_report_{timestamp}.json'
    )
    try:
        with open(report_path, 'w', encoding='utf-8') as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        print(f"[migrate] 리포트 저장: {report_path}")
    except Exception as e:
        print(f"[migrate] 리포트 저장 실패: {e}")

    print(f"[migrate] 완료 — processed={total_done}, converted={total_converted}, skipped={total_skipped}, errors={total_errors}")

    if total_errors > 0:
        sys.exit(1)
    sys.exit(0)


if __name__ == '__main__':
    main()
