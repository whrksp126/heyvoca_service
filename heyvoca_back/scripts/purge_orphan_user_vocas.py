"""
어느 단어장 매핑(user_voca_book_map)도 없는 사용자 단어(고아 UserVoca) 정리 — 이슈 #19 3차.

단어장을 지운 뒤에도 그 안에만 있던 단어가 남아 있으면 안 된다. 삭제 경로는
app/services/user_voca_purge.purge_orphan_user_vocas 로 통일했고, 이 스크립트는
그 전에 이미 남은 행을 같은 규칙(게임 행 → 문장 노출 기록 → UserVoca)으로 지운다.
사용자마다 begin_user_tx 로 잠그고, 잠근 뒤 고아 여부를 다시 판정한다(그 사이 연결된 단어 보호).

idempotent — 고아가 없으면 아무것도 하지 않는다. 기본은 dry-run(대상 수만 출력).

사용법:
  docker exec heyvoca_back_dev python3 scripts/purge_orphan_user_vocas.py           # dry-run
  docker exec heyvoca_back_dev python3 scripts/purge_orphan_user_vocas.py --apply   # 실제 삭제
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db
from app.models.models import UserVoca, UserVocaBookMap, UserVocaGame, UserExampleSeen
from app.utils.db_lock import begin_user_tx
from app.services.user_voca_purge import purge_orphan_user_vocas, invalidate_user_word_caches


def _orphan_rows():
    """(user_id, user_voca_id) — 매핑이 하나도 없는 UserVoca."""
    return (
        db.session.query(UserVoca.user_id, UserVoca.id)
        .outerjoin(UserVocaBookMap, UserVocaBookMap.user_voca_id == UserVoca.id)
        .filter(UserVocaBookMap.id.is_(None))
        .all()
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true', help='실제로 삭제한다(없으면 dry-run)')
    args = ap.parse_args()

    app = create_app()
    with app.app_context():
        rows = _orphan_rows()
        by_user = {}
        for user_id, uv_id in rows:
            by_user.setdefault(user_id, []).append(uv_id)

        all_ids = [uv_id for _, uv_id in rows]
        game_cnt = seen_cnt = 0
        if all_ids:
            game_cnt = db.session.query(UserVocaGame).filter(UserVocaGame.user_voca_id.in_(all_ids)).count()
            seen_cnt = db.session.query(UserExampleSeen).filter(UserExampleSeen.user_voca_id.in_(all_ids)).count()
        db.session.rollback()

        print(f'[대상] 고아 user_voca {len(all_ids)}행 · 사용자 {len(by_user)}명 · '
              f'user_voca_game {game_cnt}행 · user_example_seen {seen_cnt}행')
        for user_id, ids in sorted(by_user.items(), key=lambda kv: -len(kv[1]))[:20]:
            print(f'  user {user_id}: {len(ids)}개 (예: {ids[:5]})')

        if not args.apply:
            print('[dry-run] 변경 없음. 실제 삭제는 --apply')
            return

        total = 0
        for user_id, ids in by_user.items():
            try:
                begin_user_tx(user_id)
                n = purge_orphan_user_vocas(user_id, ids)
                db.session.commit()
                invalidate_user_word_caches(user_id)
                total += n
            except Exception as e:
                db.session.rollback()
                print(f'  [실패] user {user_id}: {e}')
        print(f'[적용] user_voca {total}행 삭제')


if __name__ == '__main__':
    main()
