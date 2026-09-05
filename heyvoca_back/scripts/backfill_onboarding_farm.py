#!/usr/bin/env python3
"""온보딩 학습이 농장에 반영되지 않은 사용자를 되짚어 심어 준다.

배경:
  `POST /onboarding/migrate` 가 가입 직후 온보딩 답안을 FSRS 상태와 UserStudyLog 로는
  남기면서 게임 훅(`app.services.game.hooks.on_study_answer`)은 부르지 않았다.
  심기(UserVocaGame 행 생성)와 연속 학습일은 전부 그 훅이 하는 일이라, 온보딩을
  제대로 마친 사용자도 홈에서
      - 밭이 텅 빈 채(맞힌 단어가 전부 '보유 씨앗'으로 집계)
      - 0일 연속
  으로 보였다. 라우트는 고쳤고(그 커밋 이후 가입자는 정상), 이 스크립트는 **그 전에
  가입한 사용자**를 위한 1회성 백필이다.

동작:
  is_onboarding=True 인 학습 세션의 로그를 그대로 다시 훅에 흘려 보낸다. 답안을
  새로 지어내지 않고 남아 있는 로그를 재생하는 것이라, 정규 학습을 거친 뒤라면
  성장은 그대로 두고(성장은 내려가지 않는다) 빠진 행만 채운다.

  이미 UserVocaGame 행이 있는 단어는 건너뛴다 — 정규 학습으로 이미 심긴 단어에
  훅을 다시 부르면 그날의 연속 학습일 집계에 같은 단어가 두 번 들어갈 수 있다.

사용 (백엔드 컨테이너 안에서):
    python /app/scripts/backfill_onboarding_farm.py --dry-run      # 대상만 확인
    python /app/scripts/backfill_onboarding_farm.py                # 전체 적용
    python /app/scripts/backfill_onboarding_farm.py --user <uuid>  # 한 명만
"""

import argparse
import sys
from uuid import UUID

from app import create_app, db
from app.models.models import UserStudyLog, UserStudySession, UserVocaGame
from app.services.game.hooks import on_study_answer


def _targets(user_filter):
    """되짚을 (user_id, session_id, user_voca_id, was_correct) 목록.

    UserVocaGame 이 없는 단어만 고른다. 온보딩 세션이 여러 개일 수는 없지만
    (migrate 는 onboarding_ver 로 멱등하다) 그래도 세션 단위로 훑는다 —
    독립 정답 판정이 session_id 에 기대기 때문이다.
    """
    q = (
        db.session.query(
            UserStudyLog.user_id,
            UserStudyLog.session_id,
            UserStudyLog.user_voca_id,
            UserStudyLog.was_correct,
        )
        .join(UserStudySession, UserStudySession.id == UserStudyLog.session_id)
        .outerjoin(UserVocaGame, UserVocaGame.user_voca_id == UserStudyLog.user_voca_id)
        .filter(UserStudySession.is_onboarding.is_(True))
        .filter(UserVocaGame.user_voca_id.is_(None))
        .filter(UserStudyLog.user_voca_id.isnot(None))
    )
    if user_filter:
        q = q.filter(UserStudyLog.user_id == user_filter)
    # 심기 판정은 로그 순서를 타지 않지만(세션 안의 오답 유무만 본다), 재생 순서를
    # 원래 학습 순서와 맞춰 두면 이벤트 로그가 실제 흐름과 같은 모양으로 남는다.
    return q.order_by(UserStudyLog.user_id, UserStudyLog.id).all()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--user', '-u', default=None, help='특정 사용자 UUID 만 처리')
    parser.add_argument('--dry-run', action='store_true', help='적용하지 않고 대상만 출력')
    args = parser.parse_args()

    user_filter = UUID(args.user) if args.user else None

    app = create_app()
    with app.app_context():
        rows = _targets(user_filter)
        users = {r[0] for r in rows}
        print(f"[backfill] 대상 사용자 {len(users)}명 · 답안 {len(rows)}건")
        if args.dry_run:
            for uid in sorted(users, key=str):
                n = sum(1 for r in rows if r[0] == uid)
                ok = sum(1 for r in rows if r[0] == uid and r[3])
                print(f"  {uid}  답안 {n}건 (정답 {ok}건)")
            return 0

        done = 0
        failed = 0
        for user_id, session_id, user_voca_id, was_correct in rows:
            try:
                on_study_answer(user_id, 'today', bool(was_correct),
                                user_voca_id=user_voca_id, session_id=session_id)
                done += 1
            except Exception as exc:  # noqa: BLE001 — 한 건 실패가 나머지를 막지 않는다
                db.session.rollback()
                failed += 1
                print(f"  [실패] user={user_id} user_voca={user_voca_id}: {exc}")

        print(f"[backfill] 완료 {done}건 · 실패 {failed}건")
        return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
