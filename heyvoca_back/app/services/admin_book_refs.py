"""서점 단어장(admin_voca_book_map) 뜻/예문 조회 헬퍼 — 2026-09 구조 개편.

admin_voca_book_map은 더 이상 뜻/예문 텍스트를 직접 갖지 않는다(voca_meanings/voca_examples
컬럼은 롤백 대비로만 남아 있고 더는 쓰지 않는다). 대신 admin_voca_book_map_meaning/
admin_voca_book_map_example이 사전의 voca_meaning.id/voca_example.id + 순서(ord)만
참조한다. 이 모듈은 map_id 목록을 받아 지금까지의 응답 모양
({'meanings': [str,...], 'examples': [{'origin','meaning','reading_tokens'?}, ...]})을
그대로 만들어 준다.

2026-09-29부터 en(heyvoca_dict)·ja(heyvoca_dict_ja) 둘 다 지원한다. 참조 테이블
(AdminVocaBookMapMeaning/Example)은 `__bind_key__='dict'` 공용 모델이라 RoutingSession이
g.dict_lang에 따라 알아서 heyvoca_dict/heyvoca_dict_ja로 보낸다(app/__init__.py) — ja 스키마에도
같은 이름의 테이블을 얹어 두면(db/dict_ja/scripts/schema_dict_ja.sql) 이 함수 코드는 그대로
재사용된다. ja는 voca_example.id로 voca_example_ja.reading_tokens를 추가 조회해 예문에 붙인다
(word_payload.load_ja_example_tokens) — 예전 raw JSON(voca_examples)에 reading_tokens가
이미 박혀 있던 것과 응답 모양을 맞추기 위함.

안전장치(2026-09-28 추가): 코드 배포 후 실제 이관 스크립트(scripts/migrate_admin_book_map_refs.py
--apply)가 아직 안 돌아간 환경(dev/prod 배포 직후 한동안)에서는 admin_voca_book_map_meaning/
_example이 통째로 비어 있다. 그 상태에서도 서점·온보딩 API가 깨지지 않도록, 뜻/예문 참조가
"하나도" 없는 map_id는 admin_voca_book_map.voca_meanings/voca_examples raw JSON 컬럼으로
폴백한다(ja raw JSON은 reading_tokens가 이미 포함돼 있어 그대로 통과). 폴백이 실제로 쓰이면
(=이관 전) 요약 1줄을 warning으로 남긴다(행마다 찍지 않음).

정본: scripts/migrate_admin_book_map_refs.py (JSON → 참조 테이블 이관 스크립트, en/ja 공용).
"""
import json
import logging

from app import db
from app.models.models import (
    AdminVocaBookMap,
    AdminVocaBookMapMeaning,
    AdminVocaBookMapExample,
    VocaMeaning,
    VocaExample,
)

logger = logging.getLogger(__name__)


def load_admin_book_texts(map_ids, lang=None):
    """map_id 목록 → {map_id: {'meanings': [str,...], 'examples': [{'origin','meaning'}, ...]}}.

    N+1 방지 — map_id 전체를 IN 절 2번(뜻/예문)으로 한 번에 조회한다. 뜻/예문 참조가 전혀 없는
    map_id는 raw JSON 컬럼으로 폴백한다(_fallback_to_raw_json 참고).
    lang: 생략하면 g.dict_lang(RoutingSession이 이미 이 값 기준으로 en/ja 엔진을 골랐다).
          'ja'면 예문에 voca_example_ja.reading_tokens를 추가로 붙인다.
    """
    from app.utils.dict_lang import get_dict_lang
    lang = lang or get_dict_lang()

    map_ids = sorted({mid for mid in map_ids if mid is not None})
    result = {mid: {'meanings': [], 'examples': []} for mid in map_ids}
    if not map_ids:
        return result

    meaning_rows = (
        db.session.query(AdminVocaBookMapMeaning.map_id, VocaMeaning.meaning)
        .join(VocaMeaning, VocaMeaning.id == AdminVocaBookMapMeaning.meaning_id)
        .filter(AdminVocaBookMapMeaning.map_id.in_(map_ids))
        .order_by(AdminVocaBookMapMeaning.map_id, AdminVocaBookMapMeaning.ord)
        .all()
    )
    have_meaning_refs = set()
    for mid, meaning in meaning_rows:
        result[mid]['meanings'].append(meaning)
        have_meaning_refs.add(mid)

    example_rows = (
        db.session.query(
            AdminVocaBookMapExample.map_id, VocaExample.id, VocaExample.exam_en, VocaExample.exam_ko,
        )
        .join(VocaExample, VocaExample.id == AdminVocaBookMapExample.example_id)
        .filter(AdminVocaBookMapExample.map_id.in_(map_ids))
        .order_by(AdminVocaBookMapExample.map_id, AdminVocaBookMapExample.ord)
        .all()
    )
    have_example_refs = set()
    example_ids = [eid for _, eid, _, _ in example_rows]
    tokens_map = {}
    if lang == 'ja' and example_ids:
        from app.utils.word_payload import load_ja_example_tokens
        tokens_map = load_ja_example_tokens(example_ids, lang)
    for mid, eid, en, ko in example_rows:
        item = {'origin': en or '', 'meaning': ko or ''}
        if eid in tokens_map:
            item['reading_tokens'] = tokens_map[eid]
        result[mid]['examples'].append(item)
        have_example_refs.add(mid)

    # 뜻·예문 참조가 하나도 없는 map만 폴백 대상(부분적으로 뜻만 있고 예문이 진짜 0개인 정상
    # 행까지 잘못 건드리지 않기 위해 "둘 다 없음"을 기준으로 삼는다).
    fallback_ids = [mid for mid in map_ids if mid not in have_meaning_refs and mid not in have_example_refs]
    if fallback_ids:
        _fallback_to_raw_json(fallback_ids, result)

    return result


def _fallback_to_raw_json(map_ids, result):
    """참조 테이블에 아무 링크도 없는 map_id들을 admin_voca_book_map.voca_meanings/
    voca_examples raw JSON으로 채운다. 요약 1줄만 warning으로 남긴다."""
    rows = (
        db.session.query(AdminVocaBookMap.id, AdminVocaBookMap.voca_meanings, AdminVocaBookMap.voca_examples)
        .filter(AdminVocaBookMap.id.in_(map_ids))
        .all()
    )
    filled = 0
    for mid, raw_meanings, raw_examples in rows:
        try:
            meanings = json.loads(raw_meanings) if raw_meanings else []
        except Exception:
            meanings = []
        try:
            examples = json.loads(raw_examples) if raw_examples else []
        except Exception:
            examples = []
        if meanings or examples:
            filled += 1
        result[mid]['meanings'] = meanings if isinstance(meanings, list) else []
        result[mid]['examples'] = examples if isinstance(examples, list) else []

    logger.warning(
        'load_admin_book_texts: %d개 map_id에 admin_voca_book_map_meaning/_example 링크가 '
        '없어 raw JSON 컬럼으로 폴백했다(migrate_admin_book_map_refs.py --apply 미실행 추정). '
        '샘플 map_id=%s',
        len(map_ids), map_ids[:10],
    )


def load_admin_book_texts_for_maps(maps):
    """AdminVocaBookMap 인스턴스 리스트 버전(.id 추출 후 load_admin_book_texts 위임)."""
    return load_admin_book_texts([m.id for m in maps])
