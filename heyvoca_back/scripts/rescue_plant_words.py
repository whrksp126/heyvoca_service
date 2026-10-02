"""
새 씨앗 심기(plant) 세션으로 학습했는데 '보유 씨앗(포장된 씨앗)'으로 남은 단어 구제 (1회성, idempotent).

배경: 직전 plant_first 수정 전에는 심기 세션에서 오답이면 FSRS 가 new 로 남거나(수정 전),
FSRS 만 졸업하고 농장(UserVocaGame.visual_stage)은 '첫 독립 정답'이 아니라 UNPLANTED_SEED 로 남았다
(수정 후). 프론트는 서버 farm.stage 를 그대로 그려서 이런 단어가 복습에서 '포장된 씨앗'으로 보인다.
규칙: plant 세션에서 한 번이라도 학습된 단어는 PLANTED_SEED 이상이어야 한다.

처리 (단어당, 이미 처리된 단어는 조건 불일치로 SKIP → 재실행 안전):
  1) FSRS state 가 new/next_review 없음  → 첫 plant 로그 시각 기준 Good 1회 졸업 상태로 저장
  2) 게임 행이 없거나 visual_stage == UNPLANTED_SEED → PLANTED_SEED 로 올림
     (심은 씨앗은 재화 보상 없음, 보석/XP 지급 없음. 이벤트 로그도 남기지 않는다)

기본은 dry-run. 실제 반영은 --apply.

  docker exec heyvoca_back_local python3 scripts/rescue_plant_words.py            # dry-run
  docker exec heyvoca_back_local python3 scripts/rescue_plant_words.py --apply
옵션: --user-id UUID, --limit N
"""

import argparse
import datetime as dt
import os
import sys
from uuid import UUID

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import func

from app import create_app, db
from app.models.models import UserVoca, UserStudyLog, UserVocaGame, VisualStage, HealthState


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--user-id', default=None)
    ap.add_argument('--limit', type=int, default=None)
    args = ap.parse_args()
    app = create_app()
    with app.app_context():
        run(args)


def run(args):
    from app.services.fsrs.state import (
        parse_user_voca_data, serialize_user_voca_data, get_fsrs_state,
        set_fsrs_state, migrate_v1_to_v2, is_v1,
    )
    from app.services.fsrs.scheduler import review as fsrs_review
    from app.services.game.farm_v2 import growth, health, localday

    q = (
        db.session.query(UserStudyLog.user_voca_id, func.min(UserStudyLog.created_at))
        .filter(UserStudyLog.test_type == 'plant')
        .group_by(UserStudyLog.user_voca_id)
    )
    if args.user_id:
        q = q.filter(UserStudyLog.user_id == UUID(args.user_id))
    rows = q.all()
    if args.limit:
        rows = rows[:args.limit]

    total = len(rows)
    n_fsrs_new = n_game_missing = n_game_unplanted = n_skip = 0
    users = set()
    for user_voca_id, first_at in rows:
        uv = db.session.query(UserVoca).filter(UserVoca.id == user_voca_id).with_for_update().first()
        if uv is None:
            n_skip += 1
            continue
        payload = parse_user_voca_data(uv.data)
        if is_v1(payload):
            payload = migrate_v1_to_v2(payload)
        fsrs = get_fsrs_state(payload) or {}
        game = db.session.query(UserVocaGame).filter(UserVocaGame.user_voca_id == user_voca_id).first()

        need_fsrs = (fsrs.get('state') or 'new').lower() in ('new', '') or not fsrs.get('next_review')
        need_game = game is None or (game.visual_stage or VisualStage.UNPLANTED_SEED) == VisualStage.UNPLANTED_SEED
        if not need_fsrs and not need_game:
            n_skip += 1
            continue
        users.add(uv.user_id)
        if need_fsrs:
            n_fsrs_new += 1
        if game is None:
            n_game_missing += 1
        elif need_game:
            n_game_unplanted += 1

        if not args.apply:
            continue

        if need_fsrs:
            fsrs = fsrs_review(fsrs or {}, 3, first_at)
            payload = set_fsrs_state(payload, fsrs)
            uv.data = serialize_user_voca_data(payload)
            uv.updated_at = dt.datetime.utcnow()
        if need_game:
            if game is None:
                game = UserVocaGame(user_voca_id=user_voca_id, user_id=uv.user_id)
                db.session.add(game)
            tz = localday.get_timezone(uv.user_id)
            game.visual_stage = VisualStage.PLANTED_SEED
            if VisualStage.rank(game.highest_stage or '') < VisualStage.rank(VisualStage.PLANTED_SEED):
                game.highest_stage = VisualStage.PLANTED_SEED
            game.first_planted_at = first_at
            game.planted_study_day = localday.local_day(first_at, tz)
            game.first_due_at = growth.parse_fsrs_due(fsrs)
            if game.health_state is None:
                game.health_state = HealthState.FRESH
            due_at = growth.parse_fsrs_due(fsrs)
            if due_at is not None and game.health_state not in (HealthState.ROTTEN, HealthState.GOLDEN):
                t = health.thresholds(due_at, growth._stability(fsrs), game.visual_stage,
                                      game.protection_days or 0)
                game.rot_due_at = t['rotten_at']
            game.updated_at = dt.datetime.utcnow()
        db.session.commit()

    mode = 'APPLY' if args.apply else 'DRY-RUN'
    print(f'[{mode}] plant 로그가 있는 단어 {total}개 / 구제 대상 {total - n_skip}개 '
          f'(FSRS new 졸업 {n_fsrs_new}, 게임행 없음 {n_game_missing}, UNPLANTED→PLANTED {n_game_unplanted}) '
          f'/ 대상 사용자 {len(users)}명 / SKIP {n_skip}')


if __name__ == '__main__':
    main()
