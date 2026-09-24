"""학습·통계 응답에 일본어 공통 필드를 얹는 배치 헬퍼 — INTEGRATION_SPEC 4절.

사용자 데이터(UserVoca)만 들고 있는 학습/추천/홈/농장 응답에 사전 확장 정보
(`reading`/`romaji`/`jlpt`, 예문 `reading_tokens`)를 voca_id 로 한 번에 붙인다.

- 사전 라우팅은 g.dict_lang 기준이므로 **ja 모드 요청에서만** 사전을 읽는다
  (en 모드에서 VocaJa 를 조회하면 heyvoca_dict 에 테이블이 없어 오류).
- 스칼라 컬럼만 조회해 identity map 과 무관.
- 실패는 비치명 — 빈 결과로 폴백해 응답 자체는 그대로 나간다.

`app/utils/word_payload.py`(단어 객체 공통 직렬화)가 생기면 그쪽으로 합칠 수 있다.
"""
import logging
from typing import Iterable, Optional

from app import db
from app.models.models import VocaJa, VocaExample, VocaExampleMap, VocaExampleJa
from app.services.tts.normalize import normalize_text
from app.utils.dict_lang import get_dict_lang

_log = logging.getLogger(__name__)


def _squash(text) -> str:
    """예문 매칭 키: 태그 제거 + 정규화 + 공백 제거."""
    return normalize_text(text or '').replace(' ', '')


def _ids(voca_ids: Iterable[Optional[int]]) -> list:
    return sorted({int(v) for v in voca_ids if v})


def load_ja_word_info(voca_ids: Iterable[Optional[int]]) -> dict:
    """{voca_id: {'reading','romaji','jlpt'}} — ja 모드가 아니면 {}."""
    ids = _ids(voca_ids)
    if not ids or get_dict_lang() != 'ja':
        return {}
    try:
        rows = db.session.query(
            VocaJa.voca_id, VocaJa.reading, VocaJa.romaji, VocaJa.jlpt,
        ).filter(VocaJa.voca_id.in_(ids)).all()
    except Exception:
        _log.warning('voca_ja 조회 실패(필드 없이 응답)', exc_info=True)
        return {}
    return {r[0]: {'reading': r[1], 'romaji': r[2], 'jlpt': r[3]} for r in rows}


def load_ja_example_tokens(voca_ids: Iterable[Optional[int]]) -> dict:
    """{voca_id: {squashed_origin: reading_tokens}} — ja 모드가 아니면 {}."""
    ids = _ids(voca_ids)
    if not ids or get_dict_lang() != 'ja':
        return {}
    try:
        rows = (
            db.session.query(VocaExampleMap.voca_id, VocaExample.exam_en, VocaExampleJa.reading_tokens)
            .join(VocaExample, VocaExample.id == VocaExampleMap.example_id)
            .join(VocaExampleJa, VocaExampleJa.example_id == VocaExample.id)
            .filter(VocaExampleMap.voca_id.in_(ids))
            .all()
        )
    except Exception:
        _log.warning('voca_example_ja 조회 실패(reading_tokens 없이 응답)', exc_info=True)
        return {}
    out: dict = {}
    for vid, exam, tokens in rows:
        if tokens:
            out.setdefault(vid, {})[_squash(exam)] = tokens
    return out


def word_fields(lang: str, voca_id, info: dict) -> dict:
    """단어 객체에 합칠 공통 필드. en → {'language':'en'}, ja → reading/romaji/jlpt/pronunciation 포함."""
    if lang != 'ja':
        return {'language': lang or 'en'}
    ji = info.get(voca_id) or {}
    reading = ji.get('reading')
    return {
        'language':      'ja',
        'reading':       reading,
        'romaji':        ji.get('romaji'),
        'jlpt':          ji.get('jlpt'),
        'pronunciation': reading,   # 규격: ja 에서 pronunciation == reading
    }


def examples_with_tokens(lang: str, voca_id, examples, token_map: dict):
    """ja 예문에 reading_tokens 를 붙인 새 리스트. 이미 있으면 유지, 매칭 실패면 생략.

    예문 원문 키는 'origin'(표준) 또는 구 'en'.
    """
    if lang != 'ja' or not isinstance(examples, list):
        return examples
    by_text = token_map.get(voca_id) or {}
    out = []
    for ex in examples:
        if isinstance(ex, dict) and not ex.get('reading_tokens'):
            tokens = by_text.get(_squash(ex.get('origin') or ex.get('en')))
            if tokens:
                ex = dict(ex, reading_tokens=tokens)
        out.append(ex)
    return out
