"""
UserVoca.data 컬럼 스키마 v2 직렬화/역직렬화.

스키마 v1 (기존 SM2-only):
  {ef, repetition, interval, nextReview, lastStudyDate, beforeScheduleCount}

스키마 v2 (SM2 + FSRS 공존, Phase 1.2~1.4):
  {
    "schema_version": 2,
    "sm2":  { ef, repetition, interval, nextReview, lastStudyDate, beforeScheduleCount },
    "fsrs": { state, difficulty, stability, retrievability,
              elapsed_days, scheduled_days, reps, lapses,
              last_review, next_review, params_version }
  }

Phase 1.4에서 SM2 블록 제거, schema_version=3 예정.
"""

import json
from datetime import datetime
from typing import Optional

DEFAULT_SM2 = {
    "ef": 2.5,
    "repetition": 0,
    "interval": 0,
    "nextReview": None,
    "lastStudyDate": None,
    "beforeScheduleCount": 0,
}

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
    - raw가 None / 빈 문자열이면 v1 기본값 반환
    - 깨진 JSON이면 v1 기본값 반환
    - 정상 파싱이면 그대로 반환 (v1 또는 v2)
    """
    if not raw:
        return dict(DEFAULT_SM2)
    try:
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            return dict(DEFAULT_SM2)
        return parsed
    except (json.JSONDecodeError, ValueError):
        return dict(DEFAULT_SM2)


def serialize_user_voca_data(payload: dict) -> str:
    """dict → JSON 문자열 (ensure_ascii=False)."""
    return json.dumps(payload, ensure_ascii=False)


def is_v1(payload: dict) -> bool:
    """schema_version 키가 없으면 v1로 간주."""
    return "schema_version" not in payload


def get_fsrs_state(payload: dict) -> Optional[dict]:
    """payload에서 fsrs 블록 꺼내기. 없으면 None."""
    return payload.get("fsrs", None)


def get_sm2_state(payload: dict) -> Optional[dict]:
    """
    payload에서 sm2 블록 꺼내기.
    v1이면 payload 자체가 sm2 데이터이므로 그대로 반환.
    v2이면 payload["sm2"] 반환. 없으면 None.
    """
    if is_v1(payload):
        return dict(payload)
    return payload.get("sm2", None)


def set_fsrs_state(payload: dict, fsrs_state: dict) -> dict:
    """payload에 fsrs 블록 머지 + schema_version=2 설정."""
    result = dict(payload)
    result["fsrs"] = dict(fsrs_state)
    result["schema_version"] = 2
    return result


def set_sm2_state(payload: dict, sm2_state: dict) -> dict:
    """
    payload에 sm2 블록 머지.
    v1이면 payload를 v2 구조로 전환하며 sm2 블록에 넣는다.
    """
    if is_v1(payload):
        # v1 payload를 v2로 올리면서 sm2 블록 덮어쓰기
        result = {
            "schema_version": 2,
            "sm2": dict(sm2_state),
        }
        # 기존 fsrs 블록 보존
        if "fsrs" in payload:
            result["fsrs"] = payload["fsrs"]
        return result
    else:
        result = dict(payload)
        result["sm2"] = dict(sm2_state)
        return result


def migrate_v1_to_v2(payload: dict) -> dict:
    """
    v1(SM2-only) payload를 받아 fsrs 블록을 채워 v2로 반환.
    내부적으로 converter.sm2_to_fsrs() 호출.
    이미 v2면 그대로 반환.
    """
    if not is_v1(payload):
        return payload

    from app.services.fsrs.converter import sm2_to_fsrs

    sm2_data = dict(payload)
    fsrs_state = sm2_to_fsrs(sm2_data)

    result = {
        "schema_version": 2,
        "sm2": sm2_data,
        "fsrs": fsrs_state,
    }
    return result
