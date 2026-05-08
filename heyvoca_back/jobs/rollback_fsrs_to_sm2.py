"""
FSRS → SM2 롤백 스크립트.

schema_version >= 2인 UserVoca.data를 v1(SM2-only) 형식으로 되돌린다.
즉, fsrs / schema_version / params_version 키를 제거하고
sm2 블록을 평탄하게 펼쳐 v1 형식으로 복원.

idempotent: 이미 v1이면 SKIP.

사용법:
  docker exec -it heyvoca_back_local python scripts/rollback_fsrs_to_sm2.py [옵션]

옵션:
  --dry-run              DB 변경 없이 처리 결과만 출력
  --batch-size N         배치 크기 (기본 500)
"""

import argparse
import json
import os
import sys
import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db
from app.models.models import UserVoca
from app.services.fsrs.state import (
    parse_user_voca_data,
    serialize_user_voca_data,
    is_v1,
    DEFAULT_SM2,
)


def parse_args():
    parser = argparse.ArgumentParser(description='FSRS → SM2 롤백')
    parser.add_argument('--dry-run', action='store_true', help='DB 변경 없이 시뮬레이션')
    parser.add_argument('--batch-size', type=int, default=500, help='배치 크기 (기본 500)')
    return parser.parse_args()


def _rollback_to_v1(payload: dict) -> dict:
    """
    v2 payload → v1(SM2-only) 평탄 dict 복원.
    sm2 블록을 루트 레벨로 올리고 fsrs/schema_version 키 제거.
    """
    sm2 = payload.get('sm2', {})
    if not sm2:
        # sm2 블록이 없으면 기본값
        return dict(DEFAULT_SM2)
    return dict(sm2)


def main():
    args = parse_args()

    app = create_app()
    with app.app_context():
        run_rollback(args)


def run_rollback(args):
    dry_run    = args.dry_run
    batch_size = max(1, args.batch_size)

    print(f"[rollback] 시작 — dry_run={dry_run}, batch_size={batch_size}")

    total_done      = 0
    total_converted = 0
    total_skipped   = 0
    total_errors    = 0
    error_ids       = []
    current_id      = 0

    while True:
        rows = (
            db.session.query(UserVoca)
            .filter(UserVoca.id > current_id)
            .order_by(UserVoca.id.asc())
            .limit(batch_size)
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

                if is_v1(payload):
                    # 이미 v1 → SKIP
                    batch_skipped += 1
                    continue

                v1_payload = _rollback_to_v1(payload)

                if not dry_run:
                    row.data = serialize_user_voca_data(v1_payload)
                    row.updated_at = datetime.datetime.utcnow()

                batch_converted += 1

            except Exception as e:
                batch_errors += 1
                error_ids.append(row.id)
                print(f"[rollback] ERROR row_id={row.id}: {e}")

        if not dry_run and batch_converted > 0:
            try:
                db.session.commit()
            except Exception as e:
                db.session.rollback()
                print(f"[rollback] 배치 커밋 실패: {e}")
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

        print(f"[rollback] {total_done} 처리, converted={total_converted}, skipped={total_skipped}, errors={total_errors}")

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
        f'.rollback_report_{timestamp}.json'
    )
    try:
        with open(report_path, 'w', encoding='utf-8') as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        print(f"[rollback] 리포트 저장: {report_path}")
    except Exception as e:
        print(f"[rollback] 리포트 저장 실패: {e}")

    print(f"[rollback] 완료 — processed={total_done}, converted={total_converted}, skipped={total_skipped}, errors={total_errors}")

    if total_errors > 0:
        sys.exit(1)
    sys.exit(0)


if __name__ == '__main__':
    main()
