"""
state.py — parse/serialize/v1↔v2 라운드트립 테스트.
"""

import json
import pytest

from app.services.fsrs.state import (
    parse_user_voca_data,
    serialize_user_voca_data,
    is_v1,
    get_fsrs_state,
    get_sm2_state,
    set_fsrs_state,
    set_sm2_state,
    migrate_v1_to_v2,
    DEFAULT_SM2,
    DEFAULT_FSRS_NEW,
)


class TestParseUserVocaData:
    def test_none_returns_default_sm2(self):
        result = parse_user_voca_data(None)
        assert result == DEFAULT_SM2

    def test_empty_string_returns_default_sm2(self):
        result = parse_user_voca_data("")
        assert result == DEFAULT_SM2

    def test_broken_json_returns_default_sm2(self):
        result = parse_user_voca_data("{invalid json}")
        assert result == DEFAULT_SM2

    def test_valid_v1_json(self):
        v1 = {"ef": 2.1, "repetition": 3, "interval": 10, "nextReview": None,
               "lastStudyDate": None, "beforeScheduleCount": 0}
        raw = json.dumps(v1)
        result = parse_user_voca_data(raw)
        assert result == v1

    def test_valid_v2_json(self):
        v2 = {
            "schema_version": 2,
            "sm2": dict(DEFAULT_SM2),
            "fsrs": dict(DEFAULT_FSRS_NEW),
        }
        raw = json.dumps(v2)
        result = parse_user_voca_data(raw)
        assert result["schema_version"] == 2
        assert "fsrs" in result

    def test_non_dict_json_returns_default(self):
        result = parse_user_voca_data(json.dumps([1, 2, 3]))
        assert result == DEFAULT_SM2


class TestSerializeUserVocaData:
    def test_round_trip(self):
        payload = {"schema_version": 2, "sm2": dict(DEFAULT_SM2)}
        raw = serialize_user_voca_data(payload)
        assert isinstance(raw, str)
        assert json.loads(raw) == payload

    def test_ensure_ascii_false(self):
        payload = {"word": "안녕"}
        raw = serialize_user_voca_data(payload)
        assert "안녕" in raw


class TestIsV1:
    def test_v1_has_no_schema_version(self):
        assert is_v1({"ef": 2.5}) is True

    def test_v2_has_schema_version(self):
        assert is_v1({"schema_version": 2, "sm2": {}}) is False


class TestGetFsrsState:
    def test_v1_has_no_fsrs(self):
        payload = {"ef": 2.5, "repetition": 0, "interval": 0}
        assert get_fsrs_state(payload) is None

    def test_v2_has_fsrs(self):
        payload = {"schema_version": 2, "fsrs": {"state": "new"}}
        result = get_fsrs_state(payload)
        assert result["state"] == "new"


class TestGetSm2State:
    def test_v1_returns_self(self):
        payload = {"ef": 2.5, "repetition": 1, "interval": 3}
        result = get_sm2_state(payload)
        assert result["ef"] == 2.5
        assert result["repetition"] == 1

    def test_v2_returns_sm2_block(self):
        payload = {
            "schema_version": 2,
            "sm2": {"ef": 2.1, "repetition": 5},
            "fsrs": {"state": "review"},
        }
        result = get_sm2_state(payload)
        assert result["ef"] == 2.1

    def test_v2_missing_sm2_returns_none(self):
        payload = {"schema_version": 2, "fsrs": {"state": "review"}}
        result = get_sm2_state(payload)
        assert result is None


class TestSetFsrsState:
    def test_adds_fsrs_and_schema_version(self):
        payload = {"ef": 2.5}
        fsrs = {"state": "review", "stability": 5.0}
        result = set_fsrs_state(payload, fsrs)
        assert result["schema_version"] == 2
        assert result["fsrs"]["stability"] == 5.0
        # 원본 sm2 데이터는 보존
        assert result["ef"] == 2.5

    def test_overwrites_existing_fsrs(self):
        payload = {"schema_version": 2, "fsrs": {"state": "new"}}
        result = set_fsrs_state(payload, {"state": "review"})
        assert result["fsrs"]["state"] == "review"


class TestSetSm2State:
    def test_v1_converts_to_v2(self):
        payload = {"ef": 2.5, "repetition": 0}
        sm2_new = {"ef": 2.0, "repetition": 1, "interval": 3}
        result = set_sm2_state(payload, sm2_new)
        assert result["schema_version"] == 2
        assert result["sm2"]["ef"] == 2.0

    def test_v2_updates_sm2_block(self):
        payload = {
            "schema_version": 2,
            "sm2": {"ef": 2.5},
            "fsrs": {"state": "review"},
        }
        sm2_new = {"ef": 2.0}
        result = set_sm2_state(payload, sm2_new)
        assert result["sm2"]["ef"] == 2.0
        assert result["fsrs"]["state"] == "review"  # fsrs 보존


class TestMigrateV1ToV2:
    def test_v1_becomes_v2(self):
        v1 = {"ef": 2.5, "repetition": 0, "interval": 0,
               "nextReview": None, "lastStudyDate": None, "beforeScheduleCount": 0}
        result = migrate_v1_to_v2(v1)
        assert result["schema_version"] == 2
        assert "sm2" in result
        assert "fsrs" in result

    def test_already_v2_returned_as_is(self):
        v2 = {"schema_version": 2, "sm2": {}, "fsrs": {"state": "review"}}
        result = migrate_v1_to_v2(v2)
        assert result is v2  # 동일 객체 반환

    def test_fsrs_state_new_for_unlearned(self):
        v1 = {"ef": 2.5, "repetition": 0, "interval": 0,
               "nextReview": None, "lastStudyDate": None, "beforeScheduleCount": 0}
        result = migrate_v1_to_v2(v1)
        assert result["fsrs"]["state"] == "new"

    def test_fsrs_state_review_for_learned(self):
        v1 = {"ef": 2.1, "repetition": 5, "interval": 15,
               "nextReview": "2026-05-20", "lastStudyDate": "2026-05-05",
               "beforeScheduleCount": 0}
        result = migrate_v1_to_v2(v1)
        assert result["fsrs"]["state"] == "review"
        assert result["fsrs"]["stability"] == 15.0

    def test_round_trip_serialize(self):
        v1 = {"ef": 2.3, "repetition": 3, "interval": 7,
               "nextReview": None, "lastStudyDate": None, "beforeScheduleCount": 0}
        v2 = migrate_v1_to_v2(v1)
        raw = serialize_user_voca_data(v2)
        recovered = parse_user_voca_data(raw)
        assert recovered["schema_version"] == 2
        assert recovered["sm2"]["ef"] == 2.3
