"""당근 농장 게임 레이어 서비스.

정책 (2026-07-05 확정):
- 성장 단계는 저장하지 않고 FSRS 분류에서 파생:
    unlearned→씨앗(seed), short→새싹(sprout), medium→잎(leaf), long→당근(carrot).
- 시듦/죽음은 예정 복습일(next_review) + 간격 비례 + 최소 유예로 lazy 계산:
    시듦1 = next_review + max(0.25·간격, 1일)
    시듦2 = next_review + max(0.5·간격,  2일)
    죽음   = next_review + max(1.0·간격,  3일)
  단어별로 "N일 뒤 시듦/죽음" 잔여 일수를 반드시 노출한다.
- 죽음은 게임 레이어(user_voca_game.life)만 바꾼다 — FSRS 데이터(UserVoca.data) 절대 불가침.
- 죽은 단어는 AI 추천에서만 제외(부활 전까지), 직접 학습·시험은 가능. 자동 부활 없음.
- 부활: 부활템 1개 = 죽은 단어 1개 부활(ALIVE 복귀). 보석 1개 = 부활템 5개 구매.
- 당근(장기) 첫 도달 시 보석 1개 지급(단어당 1회, 재당근은 미지급).

study/log 커밋 '이후' 별도 트랜잭션으로 호출된다(농장 실패가 학습 저장을 깨지 않도록).
"""

import datetime as dt
from typing import Optional
from uuid import UUID

from app import db
from app.models.models import User, UserVoca, UserVocaGame, GemReason
from app.routes.common import register_gem_log

# ── 튜닝 상수 ──
CARROT_REWARD_GEM   = 1    # 당근(장기) 첫 도달 보석
REVIVE_PER_GEM      = 5    # 보석 1개당 부활템 개수
BUY_REVIVE_GEM_COST = 1    # 부활템 5개 구매 보석 비용

LIFE_ALIVE = 'ALIVE'
LIFE_DEAD  = 'DEAD'

# 성장 단계 매핑 (memory state → farm stage)
STAGE_BY_STATE = {
    'unlearned': 'seed',
    'short':     'sprout',
    'medium':    'leaf',
    'long':      'carrot',
}
_DAY = dt.timedelta(days=1)


def _classify(fsrs_state: dict) -> str:
    """study.py 단일 소스 재사용 (임계값 자동 추종)."""
    from app.routes.study import _classify_memory_state
    return _classify_memory_state(fsrs_state or {})


def _parse_next_review(fsrs_state: dict) -> Optional[dt.datetime]:
    nr = (fsrs_state or {}).get('next_review')
    if not nr:
        return None
    try:
        return dt.datetime.fromisoformat(str(nr).replace('Z', '+00:00')).replace(tzinfo=None)
    except (ValueError, TypeError):
        return None


def _ceil_days(delta: dt.timedelta) -> int:
    """남은 시간 → 올림 일수 (음수면 0)."""
    secs = delta.total_seconds()
    if secs <= 0:
        return 0
    return int((secs + 86399) // 86400)


def compute_plant_status(fsrs_state: dict, life: str, now: dt.datetime) -> dict:
    """단어 1개의 농장 상태 계산 (순수 함수, 쓰기 없음).

    반환:
      {
        'stage': 'seed|sprout|leaf|carrot',
        'wilt':  'fresh|wilt1|wilt2|dead',
        'is_dead_now': bool,     # ALIVE인데 death 시점 경과 → 호출부가 DEAD 확정 쓰기
        'wilt_at': iso|None, 'death_at': iso|None,
        'days_to_wilt': int|None, 'days_to_death': int|None,
      }
    """
    state = _classify(fsrs_state)
    stage = STAGE_BY_STATE.get(state, 'seed')

    # 이미 죽은 단어
    if life == LIFE_DEAD:
        return {
            'stage': stage, 'wilt': 'dead', 'is_dead_now': False,
            'wilt_at': None, 'death_at': None,
            'days_to_wilt': None, 'days_to_death': None,
        }

    next_review = _parse_next_review(fsrs_state)
    # 미학습(씨앗) 또는 next_review 없음 → 시들지 않음
    if state == 'unlearned' or next_review is None:
        return {
            'stage': stage, 'wilt': 'fresh', 'is_dead_now': False,
            'wilt_at': None, 'death_at': None,
            'days_to_wilt': None, 'days_to_death': None,
        }

    interval_days = float((fsrs_state or {}).get('stability') or 0.0)
    wilt1_at = next_review + max(dt.timedelta(days=0.25 * interval_days), 1 * _DAY)
    wilt2_at = next_review + max(dt.timedelta(days=0.5 * interval_days), 2 * _DAY)
    death_at = next_review + max(dt.timedelta(days=1.0 * interval_days), 3 * _DAY)

    if now >= death_at:
        wilt, is_dead_now = 'dead', True
    elif now >= wilt2_at:
        wilt, is_dead_now = 'wilt2', False
    elif now >= wilt1_at:
        wilt, is_dead_now = 'wilt1', False
    else:
        wilt, is_dead_now = 'fresh', False

    return {
        'stage': stage,
        'wilt': wilt,
        'is_dead_now': is_dead_now,
        # 다음으로 닥칠 이벤트 시점 노출 (시듦 전이면 시듦1, 시들었으면 죽음)
        'wilt_at': wilt1_at.isoformat() if wilt == 'fresh' else None,
        'death_at': death_at.isoformat(),
        'days_to_wilt': _ceil_days(wilt1_at - now) if wilt == 'fresh' else None,
        'days_to_death': _ceil_days(death_at - now),
    }


def _get_or_create_game(user_voca_id: int, user_id: UUID, lock: bool = False) -> UserVocaGame:
    q = db.session.query(UserVocaGame).filter(UserVocaGame.user_voca_id == user_voca_id)
    if lock:
        q = q.with_for_update()
    row = q.first()
    if row is None:
        row = UserVocaGame(user_voca_id=user_voca_id, user_id=user_id)
        db.session.add(row)
        db.session.flush()
    return row


# ──────────────────────────────────────────────────────────────
# 학습 hook — study/log 커밋 이후 호출
# ──────────────────────────────────────────────────────────────

def on_answer(user_id: UUID, user_voca_id: int, memory_state_after: str, was_correct: bool) -> Optional[dict]:
    """답안 1건을 농장에 반영. /study/log 응답 'farm' 키로 나간다.

    - 당근(장기) 첫 도달 시 보석 지급(1회만).
    - 죽은 단어의 자동 부활은 하지 않음(정책).

    Returns:
        farm event payload dict 또는 None.
    """
    game = _get_or_create_game(user_voca_id, user_id, lock=True)
    event = None

    # 당근(장기) 첫 도달 보석 — 단어당 1회
    if memory_state_after == 'long' and not game.carrot_rewarded:
        game.carrot_rewarded = True
        user = db.session.query(User).filter(User.id == user_id).with_for_update().first()
        if user is not None:
            user.gem_cnt = (user.gem_cnt or 0) + CARROT_REWARD_GEM
            db.session.flush()
            register_gem_log(
                user_id=user_id, amount=CARROT_REWARD_GEM, reason=GemReason.FARM_REWARD,
                description=f'당근 수확 보상 (장기 암기 도달, user_voca #{user_voca_id})',
                source_type='user_voca', source_id=None,  # source_id는 UUID 전용, user_voca_id(int)는 설명에 기록
                balance_after=user.gem_cnt,
            )  # register_gem_log가 내부 commit
            event = {'type': 'carrot_harvest', 'gem': CARROT_REWARD_GEM, 'gem_balance': user.gem_cnt}

    db.session.commit()
    return event


# ──────────────────────────────────────────────────────────────
# AI 추천 필터 — 죽은 단어 제외 (직접 학습·시험은 영향 없음)
# ──────────────────────────────────────────────────────────────

def dead_user_voca_ids(user_id: UUID, candidate_ids: list) -> set:
    """candidate 중 죽은(user_voca_game.life=DEAD) user_voca_id 집합."""
    if not candidate_ids:
        return set()
    rows = (
        db.session.query(UserVocaGame.user_voca_id)
        .filter(
            UserVocaGame.user_id == user_id,
            UserVocaGame.life == LIFE_DEAD,
            UserVocaGame.user_voca_id.in_(candidate_ids),
        )
        .all()
    )
    return {r[0] for r in rows}


# ──────────────────────────────────────────────────────────────
# 농장 조회 / 부활 / 구매
# ──────────────────────────────────────────────────────────────

def _load_plants(user_id: UUID, now: dt.datetime, write_deaths: bool = True) -> list:
    """사용자의 모든 단어를 농장 식물로 변환 (lazy death 확정 포함).

    반환: [{user_voca_id, word, meaning, stage, wilt, life,
            days_to_wilt, days_to_death, wilt_at, death_at}, ...]
    """
    from app.services.fsrs.state import parse_user_voca_data, get_fsrs_state

    vocas = (
        db.session.query(UserVoca)
        .filter(UserVoca.user_id == user_id)
        .all()
    )
    if not vocas:
        return []

    game_rows = {
        g.user_voca_id: g
        for g in db.session.query(UserVocaGame).filter(UserVocaGame.user_id == user_id).all()
    }

    plants = []
    newly_dead = False
    for uv in vocas:
        fsrs_state = get_fsrs_state(parse_user_voca_data(uv.data)) or {}
        game = game_rows.get(uv.id)
        life = game.life if game else LIFE_ALIVE
        status = compute_plant_status(fsrs_state, life, now)

        # lazy 죽음 확정 — 조회 시점에 death 경과했으면 게임 레이어만 DEAD로
        if status['is_dead_now'] and write_deaths:
            if game is None:
                game = _get_or_create_game(uv.id, user_id)
            game.life = LIFE_DEAD
            game.died_at = now
            game.death_seen = False
            game.deaths_cnt = (game.deaths_cnt or 0) + 1
            newly_dead = True
            status = dict(status, wilt='dead')

        meaning = ''
        try:
            import json
            m = json.loads(uv.voca_meanings) if uv.voca_meanings else []
            if isinstance(m, list) and m:
                meaning = m[0] if isinstance(m[0], str) else (m[0].get('meaning', '') if isinstance(m[0], dict) else '')
        except Exception:
            meaning = ''

        plants.append({
            'user_voca_id': uv.id,
            'word': uv.word or '',
            'meaning': meaning,
            'stage': status['stage'],
            'wilt': status['wilt'],
            'life': 'DEAD' if status['wilt'] == 'dead' else 'ALIVE',
            'days_to_wilt': status['days_to_wilt'],
            'days_to_death': status['days_to_death'],
            'wilt_at': status['wilt_at'],
            'death_at': status['death_at'],
        })

    if newly_dead and write_deaths:
        db.session.commit()

    return plants


def _summarize(plants: list) -> dict:
    """식물 리스트 → 요약 카운트."""
    by_stage = {'seed': 0, 'sprout': 0, 'leaf': 0, 'carrot': 0}
    wilting = 0
    dead = 0
    for p in plants:
        if p['wilt'] == 'dead':
            dead += 1
            continue
        by_stage[p['stage']] = by_stage.get(p['stage'], 0) + 1
        if p['wilt'] in ('wilt1', 'wilt2'):
            wilting += 1
    return {
        'by_stage': by_stage,
        'wilting': wilting,
        'dead': dead,
        'alive_total': sum(by_stage.values()),
        'total': len(plants),
    }


def get_farm(user_id: UUID, now: dt.datetime) -> dict:
    """농장 전체 (밭 그리드용) — 식물 목록 + 요약 + 부활템 보유 수."""
    plants = _load_plants(user_id, now, write_deaths=True)
    user = db.session.query(User).filter(User.id == user_id).first()
    return {
        'summary': _summarize(plants),
        'plants': plants,
        'revive_item_cnt': (user.revive_item_cnt if user else 0) or 0,
        'gem_cnt': (user.gem_cnt if user else 0) or 0,
    }


def get_summary(user_id: UUID, now: dt.datetime) -> dict:
    """홈 요약 카드용 — 카운트 + 부활템/보석."""
    plants = _load_plants(user_id, now, write_deaths=True)
    user = db.session.query(User).filter(User.id == user_id).first()
    summary = _summarize(plants)
    summary['revive_item_cnt'] = (user.revive_item_cnt if user else 0) or 0
    summary['gem_cnt'] = (user.gem_cnt if user else 0) or 0
    return summary


def revive(user_id: UUID, user_voca_id: int) -> dict:
    """부활템 1개로 죽은 단어 1개 부활 (ALIVE 복귀).

    Raises:
        LookupError     — 게임 행 없음
        ValueError      — 죽은 단어가 아님
        PermissionError — 부활템 부족
    """
    user = db.session.query(User).filter(User.id == user_id).with_for_update().first()
    if user is None:
        raise LookupError('사용자 없음')

    game = (
        db.session.query(UserVocaGame)
        .filter(UserVocaGame.user_voca_id == user_voca_id, UserVocaGame.user_id == user_id)
        .with_for_update()
        .first()
    )
    if game is None:
        raise LookupError('농장 정보가 없습니다.')
    if game.life != LIFE_DEAD:
        raise ValueError('죽은 단어가 아닙니다.')
    if (user.revive_item_cnt or 0) < 1:
        raise PermissionError('부활템이 부족합니다.')

    user.revive_item_cnt = (user.revive_item_cnt or 0) - 1
    game.life = LIFE_ALIVE
    game.died_at = None
    game.death_seen = True
    game.revives_cnt = (game.revives_cnt or 0) + 1
    db.session.commit()

    return {
        'user_voca_id': user_voca_id,
        'life': 'ALIVE',
        'revive_item_cnt': user.revive_item_cnt,
    }


def buy_revive(user_id: UUID) -> dict:
    """보석 BUY_REVIVE_GEM_COST개로 부활템 REVIVE_PER_GEM개 구매.

    Raises:
        PermissionError — 보석 부족
    """
    user = db.session.query(User).filter(User.id == user_id).with_for_update().first()
    if user is None:
        raise LookupError('사용자 없음')
    if (user.gem_cnt or 0) < BUY_REVIVE_GEM_COST:
        raise PermissionError('보석이 부족합니다.')

    user.gem_cnt = (user.gem_cnt or 0) - BUY_REVIVE_GEM_COST
    user.revive_item_cnt = (user.revive_item_cnt or 0) + REVIVE_PER_GEM
    db.session.flush()
    register_gem_log(
        user_id=user_id, amount=-BUY_REVIVE_GEM_COST, reason=GemReason.ITEM_PURCHASE,
        description=f'부활템 {REVIVE_PER_GEM}개 구매',
        source_type='revive_item', source_id=None,
        balance_after=user.gem_cnt,
    )  # register_gem_log가 내부 commit

    return {
        'gem_cnt': user.gem_cnt,
        'revive_item_cnt': user.revive_item_cnt,
        'purchased': REVIVE_PER_GEM,
    }
