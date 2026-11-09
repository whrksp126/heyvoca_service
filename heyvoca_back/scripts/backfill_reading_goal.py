"""독서왕 업적 소급 (일회성, 이슈 #24).

배경
  서점 구매는 `POST /voca_books`(bookstoreId) 로 하는데, 독서왕 진행은 레거시
  `POST /user_voca_book/create` 에만 있어 서점 단어장을 산 사용자의 독서왕이 0 이었다.

판정
  진행값 = 지금 가진 서점 단어장의 서로 다른 bookstore_id 수(삭제한 단어장은 hard delete 라 셀 수 없음).
  실시간 경로와 **같은 함수**(`app/services/reading_goal.sync_reading_goal`)로 맞춘다 —
  문턱을 넘은 레벨은 완료 처리 + 다음 레벨 행 생성 + 보상 보석(change_gem, GemLog 원장) 지급.
  이미 맞춰진 사용자는 바뀌는 게 없으므로 여러 번 돌려도 같은 결과(멱등).

적용
  사용자별 한 트랜잭션: begin_user_tx(User 잠금이 첫 문장) → sync → commit.

실행 (compose 가 ./scripts 를 ro 마운트해 컨테이너 안 스크립트가 가려지므로 stdin 방식)
  docker exec -i -w /app heyvoca_back_<env> python3 - [--apply] [--user <uuid>] \
      < heyvoca_back/scripts/backfill_reading_goal.py

  기본은 dry-run(아무것도 바꾸지 않음 — 같은 계산을 한 뒤 롤백). --apply 일 때만 반영.
  출력에는 사용자 id 앞 8자만 쓴다.
"""

import sys
from uuid import UUID

from run import app

from app import db
from app.models.models import Goals, GoalType, UserGoals, UserVocaBook
from app.services.reading_goal import GOAL_TYPE_NAME, count_owned_bookstore_books, sync_reading_goal
from app.utils.db_lock import begin_user_tx


def _args():
    argv = sys.argv[1:]
    apply = '--apply' in argv
    only_user = UUID(argv[argv.index('--user') + 1]) if '--user' in argv else None
    return apply, only_user


def _progress(user_id):
    """(완료 최고 레벨, 진행 중 행의 current_value) — 출력용."""
    rows = (db.session.query(Goals.level, UserGoals.current_value, UserGoals.is_completed)
            .join(Goals, UserGoals.goal_id == Goals.id)
            .join(GoalType, Goals.type_id == GoalType.id)
            .filter(UserGoals.user_id == user_id, GoalType.type == GOAL_TYPE_NAME).all())
    done = max([lv for lv, _, c in rows if c] or [0])
    cur = max([v for _, v, c in rows if not c] or [0])
    return done, cur


def main():
    apply, only_user = _args()
    with app.app_context():
        if only_user is not None:
            user_ids = [only_user]
        else:
            user_ids = [r[0] for r in db.session.query(UserVocaBook.user_id)
                        .filter(UserVocaBook.bookstore_id.isnot(None)).distinct().all()]
        db.session.rollback()

        print(f'[{"APPLY" if apply else "DRY-RUN"}] 서점 단어장 보유 사용자 {len(user_ids)}명')
        changed = 0
        total_reward = 0
        for uid in user_ids:
            begin_user_tx(uid)
            before = _progress(uid)
            owned = count_owned_bookstore_books(uid)
            completed = sync_reading_goal(uid, owned=owned)
            after = _progress(uid)
            reward = sum(c['reward'] or 0 for c in completed)
            if before != after:
                changed += 1
                total_reward += reward
                print(f'  {str(uid)[:8]} 보유 {owned}권: 레벨 {before[0]}→{after[0]}, '
                      f'진행 {before[1]}→{after[1]}, 완료 레벨 {[c["level"] for c in completed]}, '
                      f'보상 +{reward}')
            if apply:
                db.session.commit()
            else:
                db.session.rollback()
        print(f'변경 대상 {changed}명, 보상 보석 합계 {total_reward}'
              + ('' if apply else ' (dry-run: 반영 안 함, --apply 로 실행)'))


if __name__ == '__main__':
    main()
