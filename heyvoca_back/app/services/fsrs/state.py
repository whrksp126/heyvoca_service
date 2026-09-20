"""
UserVoca.data 컬럼 스키마 직렬화/역직렬화.

현재 schema (v3): FSRS 전용
  {
    "schema_version": 3,
    "fsrs": { state, difficulty, stability, retrievability,
              elapsed_days, scheduled_days, reps, lapses,
              last_review, next_review, params_version },
    "mastery": { recent, streak, last_studied_at }   # 선택 필드, 없으면 안전 기본값 (get_mastery 참조)
  }

레거시 호환 (read-time fallback only):
  v1: SM2-only flat dict — `parse_user_voca_data` + `migrate_v1_to_v2` 가 v3 로 변환
  v2: {schema_version:2, sm2:{...}, fsrs:{...}} — `set_fsrs_state` 호출 시 sm2 블록 제거 + v3 로 승격

DB 정규화는 `jobs/migrate_user_voca_to_v3.py` 가 담당 (entrypoint 에서 idempotent 실행).
새 row 는 모두 v3 로만 작성됨 (`set_fsrs_state` 거치므로 자동 보장).

mastery 블록 (비정규화, 2026-09 추가 — 홈 추천 "약함 점수" 용):
  recent           최근 5회 정오답 bool 리스트, 최신이 맨 앞(index 0). 최대 5개.
  streak           recent 리스트 맨 앞부터 연속 True 개수 (오답 나오면 끊김). recent 파생값이라
                    별도로 어긋날(drift) 일이 없음 — recent만 정본으로 두고 streak은 항상
                    그 자리에서 다시 계산한다(get_mastery에서 저장된 값 대신 항상 재계산).
  last_studied_at  이 단어를 마지막으로 학습한 시각 (ISO8601 UTC, "...Z" 접미사 — fsrs.last_review와
                    동일 포맷, core.py:212 참조).
  마이그레이션 없이 UserVoca.data JSON에만 저장 — 필드가 없는 기존 행은 get_mastery()가
  안전 기본값(recent=[], streak=0, last_studied_at=None)을 반환한다.
"""

import json
from typing import Optional

DEFAULT_FSRS_NEW = {
    "state": "new",
    "difficulty": 0.0,
    "stability": 0.0,
    "retrievability": 0.0,
    "elapsed_days": 0,
    "scheduled_days": 0,
    "reps": 0,
    "lapses": 0,
    "last_review": None,
    "next_review": None,
    "params_version": "default-v1",
}

# mastery.recent 최대 길이 — "연속 정답 ≥3 && 24h 이내" 판정에는 3개면 충분하지만,
# 약함 점수(recent_acc)는 표본이 넉넉할수록 안정적이라 5로 둔다.
MASTERY_RECENT_MAX_LEN = 5

DEFAULT_MASTERY = {
    "recent": [],            # 최신이 맨 앞. bool 리스트, 최대 MASTERY_RECENT_MAX_LEN개
    "streak": 0,              # recent 맨 앞부터 연속 True 개수 (항상 recent에서 재계산됨)
    "last_studied_at": None,  # ISO8601 UTC "...Z" 또는 None(학습 이력 없음)
}


def parse_user_voca_data(raw: Optional[str]) -> dict:
    """
    UserVoca.data JSON 문자열 파싱.
    - raw가 None / 빈 문자열이면 v1 기본값(빈 dict) 반환
    - 깨진 JSON이면 빈 dict 반환
    - 정상 파싱이면 그대로 반환 (v1, v2, v3 모두 수용)
    """
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            return {}
        return parsed
    except (json.JSONDecodeError, ValueError):
        return {}


def serialize_user_voca_data(payload: dict) -> str:
    """dict → JSON 문자열 (ensure_ascii=False)."""
    return json.dumps(payload, ensure_ascii=False)


def is_v1(payload: dict) -> bool:
    """schema_version 키가 없으면 v1로 간주."""
    return "schema_version" not in payload


def get_fsrs_state(payload: dict) -> Optional[dict]:
    """payload에서 fsrs 블록 꺼내기. 없으면 None."""
    return payload.get("fsrs", None)


def set_fsrs_state(payload: dict, fsrs_state: dict) -> dict:
    """payload에 fsrs 블록 머지 + schema_version=3 설정."""
    result = dict(payload)
    result["fsrs"] = dict(fsrs_state)
    result["schema_version"] = 3
    # v2에서 올라온 경우 sm2 블록 제거
    result.pop("sm2", None)
    return result


def _leading_streak(recent: list) -> int:
    """recent(최신이 맨 앞인 bool 리스트) 맨 앞부터 연속 True 개수."""
    streak = 0
    for v in recent:
        if v:
            streak += 1
        else:
            break
    return streak


def get_mastery(payload: dict) -> dict:
    """
    payload에서 mastery 블록을 안전하게 꺼낸다.
    - 필드 자체가 없는 기존 행(백필 전) → DEFAULT_MASTERY 복사본
    - recent가 리스트가 아니거나 타입이 이상하면 빈 리스트로 폴백
    - streak는 저장된 값을 신뢰하지 않고 항상 recent로부터 재계산한다(정본은 recent).
    """
    raw = payload.get("mastery")
    if not isinstance(raw, dict):
        return dict(DEFAULT_MASTERY)

    recent_raw = raw.get("recent")
    if isinstance(recent_raw, list):
        recent = [bool(v) for v in recent_raw[:MASTERY_RECENT_MAX_LEN]]
    else:
        recent = []

    last_studied_at = raw.get("last_studied_at")
    if last_studied_at is not None and not isinstance(last_studied_at, str):
        last_studied_at = None

    return {
        "recent": recent,
        "streak": _leading_streak(recent),
        "last_studied_at": last_studied_at,
    }


def set_mastery(payload: dict, was_correct: bool, studied_at_iso: str) -> dict:
    """
    payload에 mastery 블록을 갱신해 반환한다 (원본 payload는 변경하지 않음).

    새 답안 결과를 recent 맨 앞에 넣고 MASTERY_RECENT_MAX_LEN개로 잘라낸 뒤,
    streak를 그 recent로부터 다시 계산한다.
    """
    prev = get_mastery(payload)
    new_recent = ([bool(was_correct)] + list(prev["recent"]))[:MASTERY_RECENT_MAX_LEN]

    result = dict(payload)
    result["mastery"] = {
        "recent": new_recent,
        "streak": _leading_streak(new_recent),
        "last_studied_at": studied_at_iso,
    }
    return result


def migrate_v1_to_v2(payload: dict) -> dict:
    """
    v1(SM2-only) payload를 받아 fsrs 블록을 채워 v3로 반환.
    내부적으로 converter.sm2_to_fsrs() 호출.
    이미 v2/v3이면 그대로 반환.

    함수명은 하위호환을 위해 유지하지만 실제로는 v3 payload를 반환한다.
    """
    if not is_v1(payload):
        return payload

    from app.services.fsrs.converter import sm2_to_fsrs

    sm2_data = dict(payload)
    fsrs_state = sm2_to_fsrs(sm2_data)

    result = {
        "schema_version": 3,
        "fsrs": fsrs_state,
    }
    return result
