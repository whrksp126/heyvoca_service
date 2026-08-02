"""부패 후 처리 — 다시 심기 / 영양 회복 / 진단 완료 (기획 7.1~7.3).

부패는 V2 에서 유일하게 학습을 막는 상태다(6.1). 그래서 여기서 하는 일은
"막힌 것을 푸는 절차"이고, 절차의 핵심은 **재화를 쓴 사용자가 반드시 결과를 받는 것**이다.
아이템을 썼는데 진단을 못 끝냈다고 그 아이템이 사라지면, 사용자는 두 번째로 시도할 때
또 재화를 내야 한다고 느낀다. 기획 7.2 가 "다시 심기 미완료"를 명시한 이유가 이것이다.

두 선택지의 차이는 **과거 성장 단계를 버리는가**다.
    삽(REPLANT)  — 단계를 심은 씨앗으로 되돌린다. 대신 값이 싸다.
    회복제(RECOVER) — 단계를 그대로 둔다. 대신 값이 비싸다.
둘 다 highest_stage 는 건드리지 않는다(5.2 "최고 도달 단계는 영구 보존").

FSRS 안정성 처리 — 왜 이 모듈이 UserVoca.data 를 건드리는가:
    기획 7.2 는 "과거 안정성을 그대로 사용하지 않고 낮은 안정성으로 재설정",
    7.3 은 "부패 직전 안정성의 70~80% 로 복원"을 요구한다. 이걸 안 하면 다시 심기가
    **동작하지 않는다** — growth.stage_from_stability() 는 안정성 60일 이상이면 당근을
    돌려주므로, 심은 씨앗으로 되돌려 놓아도 다음 정답 한 번에 당근으로 되돌아간다.
    게임 레이어가 FSRS 를 건드리지 않는다는 원칙의 유일한 예외이며, 아래 두 함수
    (_reset_fsrs_for_replant / _soften_fsrs_for_recover)에만 가둬 둔다.
"""

import datetime as dt
import functools
import json
from typing import List, Optional
from uuid import UUID

from app import db
from app.models.models import (FarmEvent, FarmItem, HealthState, UserStudyLog,
                               UserVoca, UserVocaGame, VisualStage)
from app.services.fsrs.state import (DEFAULT_FSRS_NEW, get_fsrs_state,
                                     parse_user_voca_data,
                                     serialize_user_voca_data, set_fsrs_state)
from app.services.game.farm_v2 import events, growth, health, inventory, localday

# 예약 취소 창 (기획 7.2 확인 문구 → 오조작 되돌리기용).
# 짧게 두는 이유는 이 창이 "실수로 눌렀다"를 위한 것이지 "생각해 보고 무르기"가 아니어서다.
CANCEL_WINDOW_SECONDS = 10

# 다시 심은 작물의 재시작 안정성. 씨앗 구간(잎 임계값 10일 미만)이어야
# growth 의 씨앗 판정(심은 씨앗 → 새싹)이 다시 돌아간다.
REPLANT_STABILITY_DAYS = 1.0
REPLANT_FIRST_INTERVAL_DAYS = 1     # 다시 심은 뒤 첫 복습은 내일

# 영양 회복제 복원율 (기획 7.3 "70~80% 범위, 초기값 75% 권장")
NUTRIENT_STABILITY_RATIO = 0.75

PENDING_REPLANT = 'REPLANT'
PENDING_RECOVER = 'RECOVER'

# 단계 → 시안 작물 키. answer.py 의 표를 그대로 쓴다 — 화면이 같은 그림을 쓰는데
# 모듈마다 다른 표를 두면 목록과 학습 화면의 작물이 어긋난다.
from app.services.game.farm_v2.answer import CROP_KEY  # noqa: E402


# ──────────────────────────────────────────────────────────────
# 공통 헬퍼
# ──────────────────────────────────────────────────────────────

def atomic(fn):
    """실패하면 세션을 되돌리고 예외를 그대로 올린다.

    아이템 차감은 여러 번의 flush 로 나뉜다. 중간에 부족해서 예외가 나면 앞의 차감이
    커밋되지 않은 채 세션에 남는데, 라우트가 그 예외를 400 으로 바꾸고 같은 요청에서
    다른 커밋을 하면 그 차감이 딸려 들어간다. 실패의 흔적을 여기서 지워 둔다.
    """
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except Exception:
            db.session.rollback()
            raise
    return wrapper


def first_meaning(raw: Optional[str]) -> str:
    """UserVoca.voca_meanings JSON → 대표 뜻 1개.

    목록 화면은 뜻을 한 줄만 보여준다. 키 이름이 유입 경로마다 달라
    (admin 사전은 'ko', 앱 생성분은 'meaning') 어느 쪽이든 받아 준다.
    파싱이 실패해도 빈 문자열을 돌려준다 — 뜻 하나 때문에 목록 전체가 죽으면 안 된다.
    """
    if not raw:
        return ''
    try:
        parsed = json.loads(raw)
    except (ValueError, TypeError):
        return ''
    if isinstance(parsed, dict):
        parsed = [parsed]
    if not isinstance(parsed, list) or not parsed:
        return ''
    head = parsed[0]
    if isinstance(head, str):
        return head
    if isinstance(head, dict):
        for key in ('meaning', 'ko', 'mean', 'text'):
            value = head.get(key)
            if isinstance(value, str) and value:
                return value
    return ''


def _lock_games(user_id: UUID, user_voca_ids: List[int]) -> dict:
    """대상 게임 행을 잠그고 {user_voca_id: row} 로 반환.

    잠그는 이유는 inventory._row_for_update 와 같다 — 두 기기에서 같은 작물에
    동시에 아이템을 쓰면 아이템만 두 번 나가고 상태는 한 번 바뀐다.
    """
    if not user_voca_ids:
        return {}
    rows = (
        db.session.query(UserVocaGame)
        .filter(UserVocaGame.user_id == user_id,
                UserVocaGame.user_voca_id.in_(user_voca_ids))
        .with_for_update()
        .all()
    )
    return {r.user_voca_id: r for r in rows}


def _normalize_ids(user_voca_ids) -> List[int]:
    """중복 제거 + 정수화. 중복을 남기면 같은 작물에 아이템이 두 번 나간다."""
    seen = []
    for raw in (user_voca_ids or []):
        try:
            value = int(raw)
        except (TypeError, ValueError):
            raise ValueError('잘못된 단어 번호가 있어요.')
        if value not in seen:
            seen.append(value)
    if not seen:
        raise ValueError('대상 작물을 선택해 주세요.')
    return seen


def _apply_rot_schedule(game: UserVocaGame, due_at: Optional[dt.datetime],
                        stability: float, now: dt.datetime) -> None:
    """건강 타이머 재설정. 부패에서 벗어난 직후에는 항상 여기를 거친다.

    protection_days 를 0 으로 되돌리는 이유는, 무료 긴급 급수(8.4)가 "그 회차의
    지연을 메우는 것"이지 영구 연장이 아니기 때문이다. answer.py 의 물주기 처리와 같다.
    """
    game.protection_days = 0
    game.rotten_at = None
    if due_at is None or game.visual_stage == VisualStage.UNPLANTED_SEED:
        game.rot_due_at = None
        return
    game.rot_due_at = health.thresholds(due_at, stability, game.visual_stage, 0)['rotten_at']


# ──────────────────────────────────────────────────────────────
# FSRS 재설정 (이 모듈에서만)
# ──────────────────────────────────────────────────────────────

def _load_state(user_voca: UserVoca) -> tuple:
    payload = parse_user_voca_data(user_voca.data)
    state = dict(get_fsrs_state(payload) or DEFAULT_FSRS_NEW)
    return payload, state


def _store_state(user_voca: UserVoca, payload: dict, state: dict, now: dt.datetime) -> None:
    user_voca.data = serialize_user_voca_data(set_fsrs_state(payload, state))
    user_voca.updated_at = now


def _reset_fsrs_for_replant(user_voca: UserVoca, now: dt.datetime) -> dict:
    """다시 심기 확정 — 안정성을 씨앗 수준으로 재설정 (기획 7.2).

    **진단이 끝난 뒤에** 부르는 이유: 진단 답안은 학습 파이프라인(study/log → FSRS)을
    그대로 타야 로그와 lapse 이력이 정상으로 남는다. 그 결과를 여기서 마지막에
    덮어쓰면 "과거 안정성을 그대로 쓰지 않는다"는 요구를 만족하면서도
    FSRS 계산 경로 자체는 손대지 않는다.

    reps/lapses/difficulty 는 남긴다 — 7.2 의 "FSRS 원본 로그는 보존"이다.
    """
    payload, state = _load_state(user_voca)
    before = float(state.get('stability') or 0.0)
    state['stability'] = REPLANT_STABILITY_DAYS
    state['scheduled_days'] = REPLANT_FIRST_INTERVAL_DAYS
    state['retrievability'] = 1.0
    state['last_review'] = now.isoformat()
    next_review = now + dt.timedelta(days=REPLANT_FIRST_INTERVAL_DAYS)
    state['next_review'] = next_review.isoformat()
    _store_state(user_voca, payload, state, now)
    return {'stability_before': round(before, 2),
            'stability_after': REPLANT_STABILITY_DAYS,
            'next_review': next_review}


def _soften_fsrs_for_recover(user_voca: UserVoca, now: dt.datetime) -> dict:
    """영양 회복 — 안정성 75% 로 복원하고 즉시 복습 대상으로 (기획 7.3).

    **아이템을 쓰는 시점에** 부르는 이유는 두 가지다.
    1) 다음 예정일을 지금으로 당겨야 "즉시 진단 복습 1회 필수"가 성립한다.
       진단을 미루면 유예 G 안에 다시 부패한다 — 회복만 걸어 두고 방치해
       공짜로 촉촉함을 유지하는 길을 막는다.
    2) 진단 답안이 낮아진 안정성 위에서 FSRS 를 타므로, 다음 복습일이
       회복 결과를 반영한 값으로 자연스럽게 계산된다(7.3 마지막 문단).

    last_review 는 건드리지 않는다 — FSRS 가 경과일을 그걸로 재는데,
    지금으로 옮기면 이번 회차의 경과가 0일이 되어 안정성이 부풀려진다.
    """
    payload, state = _load_state(user_voca)
    before = float(state.get('stability') or 0.0)
    after = round(max(0.1, before * NUTRIENT_STABILITY_RATIO), 4) if before > 0 else 1.0
    state['stability'] = after
    state['next_review'] = now.isoformat()
    _store_state(user_voca, payload, state, now)
    return {'stability_before': round(before, 2), 'stability_after': after}


# ──────────────────────────────────────────────────────────────
# 조회
# ──────────────────────────────────────────────────────────────

def list_rotten(user_id: UUID, limit: int = 50, cursor: Optional[int] = None) -> dict:
    """썩은 작물 보관소 목록 (기획 7.1).

    커서를 user_voca_id 로 잡은 이유는 계약서가 정수 커서를 쓰기 때문이다.
    rotten_at 정렬이 보기에는 더 자연스럽지만, 그러면 커서에 (시각, id) 쌍이 필요하다.
    id 오름차순은 페이지 사이에 새 부패가 끼어들어도 항목이 건너뛰이지 않는 장점이 있다.

    total 을 같이 주는 이유는 화면이 "썩은 작물 N개"를 먼저 말하기 때문이다.
    첫 페이지에서만 세면 될 것 같지만, 페이지를 넘기는 동안 헤더 숫자가 사라진다.
    """
    limit = max(1, min(int(limit or 50), 100))

    base = (
        db.session.query(UserVocaGame, UserVoca.word, UserVoca.voca_meanings)
        .join(UserVoca, UserVoca.id == UserVocaGame.user_voca_id)
        .filter(UserVocaGame.user_id == user_id,
                UserVocaGame.health_state == HealthState.ROTTEN)
    )
    if cursor:
        base = base.filter(UserVocaGame.user_voca_id > int(cursor))

    rows = base.order_by(UserVocaGame.user_voca_id.asc()).limit(limit + 1).all()

    total = (
        db.session.query(db.func.count(UserVocaGame.user_voca_id))
        .filter(UserVocaGame.user_id == user_id,
                UserVocaGame.health_state == HealthState.ROTTEN)
        .scalar()
    ) or 0

    has_more = len(rows) > limit
    rows = rows[:limit]

    items = []
    for game, word, meanings in rows:
        highest = game.highest_stage or VisualStage.UNPLANTED_SEED
        items.append({
            'user_voca_id': game.user_voca_id,
            'word': word or '',
            'meaning': first_meaning(meanings),
            'highest_stage': highest,
            'crop': CROP_KEY.get(highest, 'seed'),
            'rotten_at': localday.iso_utc(game.rotten_at) if game.rotten_at else None,
            # 진단을 못 끝낸 작물은 "이어서 하기"로 보여야 한다(7.2 다시 심기 미완료).
            # 이 값이 있으면 화면은 아이템 선택지를 다시 묻지 않는다.
            'pending_action': game.pending_action,
        })

    return {
        'items': items,
        'total': int(total),
        'next_cursor': items[-1]['user_voca_id'] if (has_more and items) else None,
    }


# ──────────────────────────────────────────────────────────────
# 선택지 A — 새심기 삽 (기획 7.2)
# ──────────────────────────────────────────────────────────────

@atomic
def reserve_replant(user_id: UUID, user_voca_ids, now: Optional[dt.datetime] = None) -> dict:
    """다시 심기 예약. 진단 학습을 시작할 수 있는 상태로 만든다.

    **삽은 이 시점에 차감한다.** 확정(진단 정답) 시점 차감이 계약서 문구에는 가깝지만,
    그렇게 하면 "예약만 걸어 둔 작물"이 삽을 논리적으로 붙잡은 채 남는다. 취소 창은
    10초뿐이라 그 예약을 풀 방법이 없고, 결국 보유 삽이 영원히 잠긴다.
    반대로 지금 차감하면
      · 두 번 차감될 여지가 없다 — 차감 지점이 이 함수 하나뿐이다.
      · 예약만 걸고 이탈해도 손해가 아니다 — pending_action 이 남아 다음 진입에서
        추가 차감 없이 진단을 이어가므로(7.2), 사용자가 받을 결과는 그대로 남는다.
      · 보유량이 곧 예약 가능 수라서 예약 잔량을 따로 세지 않아도 된다.
    확정은 재화가 아니라 **상태**로 한다 — complete_diagnosis 가 REPLANTED 이벤트를 남긴다.

    Raises:
        LookupError     — 농장 정보 없음
        ValueError      — 부패 상태가 아님 / 이미 다른 처리 예약 중
        PermissionError — 삽 부족
    """
    now = now or dt.datetime.utcnow()
    ids = _normalize_ids(user_voca_ids)
    games = _lock_games(user_id, ids)

    missing = [i for i in ids if i not in games]
    if missing:
        raise LookupError('농장에 없는 작물이 있어요.')

    for i in ids:
        game = games[i]
        if game.pending_action == PENDING_REPLANT:
            # 이미 예약된 것은 다시 차감하지 않는다 — 7.2 "추가 삽 차감 없이 진단을 이어감"
            continue
        if game.pending_action == PENDING_RECOVER:
            raise ValueError('영양 회복이 진행 중인 작물이 있어요.')
        if game.health_state != HealthState.ROTTEN:
            raise ValueError('썩은 작물만 다시 심을 수 있어요.')

    reserved = []
    for i in ids:
        game = games[i]
        if game.pending_action == PENDING_REPLANT:
            reserved.append(i)
            continue
        # 부족하면 PermissionError 가 올라오고 아래 커밋에 닿지 않는다 →
        # 일부만 차감된 채 끝나는 상태가 생기지 않는다.
        inventory.spend(user_id, FarmItem.SHOVEL, 1,
                        description='다시 심기 예약', user_voca_id=i)
        game.pending_action = PENDING_REPLANT
        game.pending_started_at = now
        game.updated_at = now
        events.log(user_id, FarmEvent.SHOVEL_SPENT, user_voca_id=i,
                   from_state=game.health_state, reason='REPLANT_RESERVED')
        reserved.append(i)

    db.session.commit()

    return {
        'reserved': reserved,
        'shovel_left': inventory.get_qty(user_id, FarmItem.SHOVEL),
        'cancel_until': localday.iso_utc(now + dt.timedelta(seconds=CANCEL_WINDOW_SECONDS)),
    }


@atomic
def cancel_replant(user_id: UUID, user_voca_ids,
                   now: Optional[dt.datetime] = None) -> dict:
    """예약 취소 — 첫 진단을 시작하기 전 10초 안에만 (기획 7.2 확인 문구 되돌리기).

    두 조건을 **모두** 본다. 시간만 보면 10초 안에 진단 한 문제를 풀어 버린 사용자가
    답안 결과는 챙기고 삽은 돌려받는다. 진단 시작 여부만 보면 화면을 열어 둔 채
    한참 뒤에 취소해 예약이 사실상 무기한이 된다.

    Raises:
        LookupError — 예약이 없음
        ValueError  — 취소 창을 지났거나 이미 진단을 시작함
    """
    now = now or dt.datetime.utcnow()
    ids = _normalize_ids(user_voca_ids)
    games = _lock_games(user_id, ids)

    targets = []
    for i in ids:
        game = games.get(i)
        if game is None or game.pending_action != PENDING_REPLANT:
            raise LookupError('취소할 예약이 없어요.')
        started = game.pending_started_at
        if started is None or (now - started).total_seconds() > CANCEL_WINDOW_SECONDS:
            raise ValueError('취소할 수 있는 시간이 지났어요.')
        targets.append(game)

    # 진단을 이미 시작했는가 — 예약 이후에 쌓인 학습 로그가 있으면 시작한 것이다.
    earliest = min(g.pending_started_at for g in targets)
    started_ids = {
        row[0] for row in
        db.session.query(UserStudyLog.user_voca_id)
        .filter(UserStudyLog.user_id == user_id,
                UserStudyLog.user_voca_id.in_(ids),
                UserStudyLog.created_at >= earliest)
        .all()
    }
    if started_ids:
        raise ValueError('이미 진단을 시작한 작물이 있어요.')

    for game in targets:
        inventory.grant(user_id, FarmItem.SHOVEL, 1,
                        _cancel_reason(), description='다시 심기 취소 반환',
                        user_voca_id=game.user_voca_id)
        game.pending_action = None
        game.pending_started_at = None
        game.updated_at = now
        events.log(user_id, FarmEvent.SHOVEL_EARNED, user_voca_id=game.user_voca_id,
                   reason='REPLANT_CANCELED')

    db.session.commit()
    return {'canceled': [g.user_voca_id for g in targets],
            'shovel_left': inventory.get_qty(user_id, FarmItem.SHOVEL)}


def _cancel_reason():
    """취소 반환의 원장 사유.

    별도 사유를 만들지 않고 ADMIN_ADJUST 를 쓰면 운영 지표에서 보정과 섞인다.
    EVENT 를 쓰는 이유는 '운영이 정한 규칙에 따른 환급'이라는 뜻에 가장 가까워서다.
    """
    from app.models.models import FarmItemReason
    return FarmItemReason.EVENT


# ──────────────────────────────────────────────────────────────
# 선택지 B — 영양 회복제 (기획 7.3)
# ──────────────────────────────────────────────────────────────

@atomic
def recover_with_nutrient(user_id: UUID, user_voca_ids,
                          now: Optional[dt.datetime] = None) -> dict:
    """영양 회복제로 부패에서 벗어난다. 과거 성장 단계는 그대로 둔다.

    삽과 달리 **예약이 아니라 즉시 소비**다. 7.3 은 회복을 "아이템 1개로 단어 1개 회복"
    으로 정의하고 취소 절차를 두지 않았다. 대신 진단을 안 하면 유예 G 안에 다시 썩는다
    (_soften_fsrs_for_recover 가 다음 예정일을 지금으로 당긴다) — 아이템만 쓰고
    학습은 안 하는 길을 열어 두지 않기 위해서다.

    황금은 애초에 썩지 않으므로(10.3) 대상이 될 수 없고, 중복 선택은
    _normalize_ids 가 걸러 같은 작물에 두 개가 나가지 않는다.

    Raises:
        LookupError     — 농장 정보 없음
        ValueError      — 부패 상태가 아님 / 다시 심기 예약 중
        PermissionError — 회복제 부족
    """
    now = now or dt.datetime.utcnow()
    ids = _normalize_ids(user_voca_ids)
    games = _lock_games(user_id, ids)

    missing = [i for i in ids if i not in games]
    if missing:
        raise LookupError('농장에 없는 작물이 있어요.')

    for i in ids:
        game = games[i]
        if game.pending_action == PENDING_RECOVER:
            continue
        if game.pending_action == PENDING_REPLANT:
            raise ValueError('다시 심기가 진행 중인 작물이 있어요.')
        if game.health_state == HealthState.GOLDEN or game.visual_stage == VisualStage.GOLDEN:
            raise ValueError('황금 당근에는 사용할 수 없어요.')
        if game.health_state != HealthState.ROTTEN:
            raise ValueError('썩은 작물에만 사용할 수 있어요.')

    # 보유량을 먼저 확인한다. spend 는 한 개씩 부르므로 중간에 떨어지면 예외가 나고
    # 커밋에 닿지 않지만, 사용자에게는 "몇 개가 부족한지"를 미리 알려 주는 편이 낫다.
    held = inventory.get_qty(user_id, FarmItem.NUTRIENT)
    fresh_targets = [i for i in ids if games[i].pending_action != PENDING_RECOVER]
    if held < len(fresh_targets):
        raise PermissionError('영양 회복제가 부족해요.')

    vocas = {
        uv.id: uv for uv in
        db.session.query(UserVoca).filter(UserVoca.id.in_(fresh_targets)).all()
    }

    recovered = []
    for i in fresh_targets:
        game = games[i]
        user_voca = vocas.get(i)
        if user_voca is None:
            raise LookupError('단어 정보를 찾을 수 없어요.')

        inventory.spend(user_id, FarmItem.NUTRIENT, 1,
                        description='영양 회복제 사용', user_voca_id=i)
        moved = _soften_fsrs_for_recover(user_voca, now)

        from_state = game.health_state
        # 진단 전이라 아직 촉촉하지 않다. 목마름으로 두는 이유는 "지금 돌봐야 한다"는
        # 신호를 유지하기 위해서다 — 바로 FRESH 로 두면 진단이 선택 사항처럼 보인다.
        game.health_state = HealthState.THIRSTY
        game.health_changed_at = now
        game.pending_action = PENDING_RECOVER
        game.pending_started_at = now
        _apply_rot_schedule(game, now, moved['stability_after'], now)
        game.updated_at = now

        events.log(user_id, FarmEvent.RECOVERED, user_voca_id=i,
                   from_state=from_state, to_state=HealthState.THIRSTY,
                   reason='ITEM_NUTRIENT',
                   detail={'stability_before': moved['stability_before'],
                           'stability_after': moved['stability_after']})
        recovered.append(i)

    db.session.commit()
    return {
        'recovered': recovered + [i for i in ids if i not in fresh_targets],
        'nutrient_left': inventory.get_qty(user_id, FarmItem.NUTRIENT),
    }


# ──────────────────────────────────────────────────────────────
# 진단 완료 (기획 7.2 / 7.3 공통)
# ──────────────────────────────────────────────────────────────

@atomic
def complete_diagnosis(user_id: UUID, user_voca_id: int, was_correct: bool,
                       session_id=None, now: Optional[dt.datetime] = None) -> dict:
    """진단 학습 1문제의 결과를 받아 부패 처리를 마무리한다.

    **답안 저장(study/log → answer.on_answer) 뒤에** 부른다. 그래야 진단도 평범한
    학습 로그로 남고, FSRS 도 정상 경로로 갱신된다. 그 뒤 이 함수가 게임 레이어를
    최종 상태로 확정한다.

    판정을 pending_action 으로 하는 이유:
        answer.on_answer 은 정답이면 health_state 를 FRESH 로 되돌린다. 즉 이 함수가
        불릴 때 부패 표시는 이미 지워져 있을 수 있다. health_state 로 대상을 가리면
        진단 완료가 조용히 누락된다.

    오답이면 아무 상태도 확정하지 않고 예약을 유지한다 —
    7.2 "진단 오답 후 세션을 종료하면 다시 심기 미완료로 남기고 다음 진입에서 이어감".

    Raises:
        LookupError — 농장/단어 정보 없음
        ValueError  — 진단 대상이 아님
    """
    now = now or dt.datetime.utcnow()
    game = (
        db.session.query(UserVocaGame)
        .filter(UserVocaGame.user_id == user_id,
                UserVocaGame.user_voca_id == int(user_voca_id))
        .with_for_update()
        .first()
    )
    if game is None:
        raise LookupError('농장 정보를 찾을 수 없어요.')

    action = game.pending_action
    if action not in (PENDING_REPLANT, PENDING_RECOVER):
        raise ValueError('진단이 필요한 작물이 아니에요.')

    if not was_correct:
        events.log(user_id, FarmEvent.WATERING_INCOMPLETE, user_voca_id=game.user_voca_id,
                   from_state=game.health_state, reason='DIAGNOSIS_INCORRECT',
                   session_id=session_id)
        db.session.commit()
        return {'user_voca_id': game.user_voca_id, 'completed': False,
                'pending_action': action, 'stage': game.visual_stage,
                'health': game.health_state}

    user_voca = db.session.query(UserVoca).filter(UserVoca.id == game.user_voca_id).first()
    if user_voca is None:
        raise LookupError('단어 정보를 찾을 수 없어요.')

    from_stage = game.visual_stage or VisualStage.UNPLANTED_SEED
    from_health = game.health_state or HealthState.ROTTEN
    tz = localday.get_timezone(user_id)
    today = localday.local_day(now, tz)
    detail = None

    if action == PENDING_REPLANT:
        moved = _reset_fsrs_for_replant(user_voca, now)
        game.visual_stage = VisualStage.PLANTED_SEED
        # highest_stage 는 내리지 않는다(5.2). 다시 심어도 "여기까지 키웠다"는 사실은 남는다.
        if VisualStage.rank(game.highest_stage or '') < VisualStage.rank(VisualStage.PLANTED_SEED):
            game.highest_stage = VisualStage.PLANTED_SEED
        # 새싹 판정(5.1 조건 2·3)의 기준선을 지금으로 다시 잡는다. 옛 값을 두면
        # 이미 지난 날짜라 다시 심자마자 다음 정답에 새싹이 된다.
        game.first_planted_at = now
        game.planted_study_day = today
        game.first_due_at = moved['next_review']
        game.replant_count = (game.replant_count or 0) + 1
        stability = moved['stability_after']
        due_at = moved['next_review']
        detail = {'stability_before': moved['stability_before'],
                  'stability_after': moved['stability_after'],
                  'replant_count': game.replant_count}
        event_name = FarmEvent.REPLANTED
    else:
        # 회복은 단계를 그대로 둔다(7.3). 안정성은 아이템을 쓴 시점에 이미 75% 로
        # 낮춰 두었고, 방금 진단 답안이 그 위에서 다음 복습일을 계산했다.
        fsrs_state = growth.load_fsrs_state(user_voca)
        due_at = growth.parse_fsrs_due(fsrs_state)
        stability = growth._stability(fsrs_state)
        game.recovery_count = (game.recovery_count or 0) + 1
        detail = {'recovery_count': game.recovery_count}
        event_name = FarmEvent.RECOVERED

    game.health_state = HealthState.FRESH
    game.health_changed_at = now
    game.pending_action = None
    game.pending_started_at = None
    _apply_rot_schedule(game, due_at, stability, now)
    game.updated_at = now

    events.log(user_id, event_name, user_voca_id=game.user_voca_id,
               from_state=from_stage, to_state=game.visual_stage,
               reason='DIAGNOSIS_CORRECT', session_id=session_id, detail=detail)
    if from_health != HealthState.FRESH:
        events.log(user_id, FarmEvent.REVIEW_WATERED, user_voca_id=game.user_voca_id,
                   from_state=from_health, to_state=HealthState.FRESH,
                   reason='DIAGNOSIS_CORRECT', session_id=session_id)

    db.session.commit()

    return {
        'user_voca_id': game.user_voca_id,
        'completed': True,
        'action': action,
        'stage': game.visual_stage,
        'crop': CROP_KEY.get(game.visual_stage, 'seed'),
        'highest_stage': game.highest_stage,
        'health': game.health_state,
        'rot_due_at': localday.iso_utc(game.rot_due_at) if game.rot_due_at else None,
        'next_review_at': localday.iso_utc(due_at) if due_at else None,
    }


def pending_targets(user_id: UUID) -> List[dict]:
    """진단을 못 끝낸 작물 목록 (기획 7.2 '다시 심기 미완료').

    다음 진입에서 이어가려면 화면이 "무엇이 남았는지"를 알아야 한다.
    부패 목록과 따로 두는 이유는, 이쪽은 아이템 선택을 다시 묻지 않고
    바로 진단으로 들어가야 하기 때문이다.
    """
    rows = (
        db.session.query(UserVocaGame.user_voca_id, UserVocaGame.pending_action,
                         UserVocaGame.pending_started_at, UserVoca.word,
                         UserVoca.voca_meanings)
        .join(UserVoca, UserVoca.id == UserVocaGame.user_voca_id)
        .filter(UserVocaGame.user_id == user_id,
                UserVocaGame.pending_action.isnot(None))
        .order_by(UserVocaGame.pending_started_at.asc())
        .all()
    )
    return [{
        'user_voca_id': r[0],
        'pending_action': r[1],
        'started_at': localday.iso_utc(r[2]) if r[2] else None,
        'word': r[3] or '',
        'meaning': first_meaning(r[4]),
    } for r in rows]
