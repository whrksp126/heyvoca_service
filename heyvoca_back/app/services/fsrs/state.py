"""
UserVoca.data 컬럼 스키마 직렬화/역직렬화.

현재 schema (v3): FSRS 전용
  {
    "schema_version": 3,
    "fsrs": { state, difficulty, stability, retrievability,
              elapsed_days, scheduled_days, reps, lapses,
              last_review, next_review, params_version }
  }

레거시 호환 (read-time fallback only):
  v1: SM2-only flat dict — `parse_user_voca_data` + `migrate_v1_to_v2` 가 v3 로 변환
  v2: {schema_version:2, sm2:{...}, fsrs:{...}} — `set_fsrs_state` 호출 시 sm2 블록 제거 + v3 로 승격

DB 정규화는 `jobs/migrate_user_voca_to_v3.py` 가 담당 (entrypoint 에서 idempotent 실행).
새 row 는 모두 v3 로만 작성됨 (`set_fsrs_state` 거치므로 자동 보장).
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
