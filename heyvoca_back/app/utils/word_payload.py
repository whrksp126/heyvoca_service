"""단어 객체 공통 직렬화 — INTEGRATION_SPEC 4절 "단어 객체 공통 필드".

모든 단어 응답(사전 검색·서점·단어장·OCR·admin)에 같은 규칙으로 필드를 붙인다.

- `language`: 'en' | 'ja' (현재 요청 사전 언어, get_dict_lang())
- ja 에서만: `reading`(히라가나), `romaji`, `jlpt`('N5'..'N1'|None),
  `pronunciation` = reading
- 예문 객체 `{origin, meaning, reading_tokens?}` — reading_tokens 는 ja 예문에만

주의
- VocaJa / VocaExampleJa 는 heyvoca_dict_ja 에만 있는 테이블이다. 이 모듈의 조회 함수는
  현재 언어가 ja 가 아니면 쿼리를 아예 하지 않는다(빈 dict 반환).
- 조회는 전부 `id IN (...)` 일괄 조회(청크 1000)라 N+1 이 생기지 않는다.
"""
import json
import re

from app.utils.dict_lang import get_dict_lang

_CHUNK = 1000
_TAG_RE = re.compile(r'<[^>]+>')
_WS_RE = re.compile(r'\s+')


def current_lang():
    return get_dict_lang()


def is_ja(lang=None):
    return (lang or get_dict_lang()) == 'ja'


def _chunks(ids):
    ids = [i for i in ids if i is not None]
    for i in range(0, len(ids), _CHUNK):
        yield ids[i:i + _CHUNK]


def _unique_ints(values):
    out = []
    seen = set()
    for v in values or []:
        if v is None:
            continue
        try:
            iv = int(v)
        except (TypeError, ValueError):
            continue
        if iv not in seen:
            seen.add(iv)
            out.append(iv)
    return out


def _parse_json(value):
    if value is None:
        return None
    if isinstance(value, (list, dict)):
        return value
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return None


# ──────────────────────────────────────────────────────────
# 사전 일괄 조회 (ja 전용)
# ──────────────────────────────────────────────────────────

def load_ja_word_extras(voca_ids, lang=None):
    """voca_id 목록 → {voca_id: {'reading','romaji','jlpt'}}. ja 가 아니면 {}."""
    if not is_ja(lang):
        return {}
    ids = _unique_ints(voca_ids)
    if not ids:
        return {}
    from app import db
    from app.models.models import VocaJa
    result = {}
    for chunk in _chunks(ids):
        rows = (
            db.session.query(VocaJa.voca_id, VocaJa.reading, VocaJa.romaji, VocaJa.jlpt)
            .filter(VocaJa.voca_id.in_(chunk))
            .all()
        )
        for voca_id, reading, romaji, jlpt in rows:
            result[voca_id] = {'reading': reading, 'romaji': romaji, 'jlpt': jlpt}
    return result


def load_ja_example_tokens(example_ids, lang=None):
    """voca_example.id 목록 → {example_id: reading_tokens}. ja 가 아니면 {}."""
    if not is_ja(lang):
        return {}
    ids = _unique_ints(example_ids)
    if not ids:
        return {}
    from app import db
    from app.models.models import VocaExampleJa
    result = {}
    for chunk in _chunks(ids):
        rows = (
            db.session.query(VocaExampleJa.example_id, VocaExampleJa.reading_tokens)
            .filter(VocaExampleJa.example_id.in_(chunk))
            .all()
        )
        for example_id, tokens in rows:
            parsed = _parse_json(tokens)
            if parsed is not None:
                result[example_id] = parsed
    return result


def normalize_example_text(text):
    """예문 대조 키 — 강조 태그 제거 + 공백 제거."""
    if not text:
        return ''
    s = _TAG_RE.sub('', str(text))
    return _WS_RE.sub('', s)


def load_ja_voca_example_tokens(voca_ids, lang=None):
    """voca_id 목록 → {voca_id: {normalize_example_text(origin): reading_tokens}}. ja 가 아니면 {}.

    사용자 단어장에 복사 저장된 예문(origin 문자열)에 사전 후리가나를 붙일 때 쓴다.
    """
    if not is_ja(lang):
        return {}
    ids = _unique_ints(voca_ids)
    if not ids:
        return {}
    from app import db
    from app.models.models import VocaExampleMap, VocaExample, VocaExampleJa
    result = {}
    for chunk in _chunks(ids):
        rows = (
            db.session.query(VocaExampleMap.voca_id, VocaExample.exam_en, VocaExampleJa.reading_tokens)
            .join(VocaExample, VocaExample.id == VocaExampleMap.example_id)
            .join(VocaExampleJa, VocaExampleJa.example_id == VocaExample.id)
            .filter(VocaExampleMap.voca_id.in_(chunk))
            .all()
        )
        for voca_id, exam_en, tokens in rows:
            parsed = _parse_json(tokens)
            key = normalize_example_text(exam_en)
            if parsed is None or not key:
                continue
            result.setdefault(voca_id, {}).setdefault(key, parsed)
    return result


# ──────────────────────────────────────────────────────────
# 필드 부착
# ──────────────────────────────────────────────────────────

def word_lang_fields(voca_id=None, extras=None, lang=None, fallback_pronunciation=None):
    """단어 객체에 덧붙일 공통 필드 dict.

    en: {'language': 'en'}
    ja: {'language': 'ja', 'reading', 'romaji', 'jlpt', 'pronunciation'(=reading)}
        사전 미연결(voca_id 없음/확장행 없음) 단어는 reading/romaji/jlpt 가 None 이고
        pronunciation 은 fallback_pronunciation 을 유지한다.
    """
    lang = lang or get_dict_lang()
    fields = {'language': lang}
    if lang != 'ja':
        return fields
    info = (extras or {}).get(voca_id) if voca_id is not None else None
    reading = (info or {}).get('reading')
    fields['reading'] = reading
    fields['romaji'] = (info or {}).get('romaji')
    fields['jlpt'] = (info or {}).get('jlpt')
    fields['pronunciation'] = reading if reading else fallback_pronunciation
    return fields


def apply_word_fields(obj, voca_id=None, extras=None, lang=None):
    """단어 dict(in-place)에 공통 필드를 붙인다. 기존 pronunciation 은 ja 에서만 reading 으로 대체."""
    fields = word_lang_fields(voca_id, extras, lang, fallback_pronunciation=obj.get('pronunciation'))
    if 'pronunciation' in fields and 'pronunciation' not in obj and fields['pronunciation'] is None:
        fields.pop('pronunciation')
    obj.update(fields)
    return obj


def serialize_example(example_id, origin, meaning, tokens_map=None, lang=None, include_id=True):
    """사전 예문 1건 → {id?, origin, meaning, reading_tokens?}."""
    ex = {}
    if include_id:
        ex['id'] = example_id
    ex['origin'] = origin
    ex['meaning'] = meaning
    if is_ja(lang):
        tokens = (tokens_map or {}).get(example_id)
        if tokens is not None:
            ex['reading_tokens'] = tokens
    return ex


def serialize_voca(voca, meanings=None, examples=None, extras=None, lang=None, **extra_fields):
    """사전 Voca → 공통 단어 객체.

    기본 필드: word, pronunciation, meanings, examples, vocaId(+호출 측 extra_fields)
    공통 필드: language (+ja: reading, romaji, jlpt, pronunciation=reading)
    extras 를 안 주면 ja 일 때 단건 조회한다(목록은 load_ja_word_extras 로 미리 모아 넘길 것).
    """
    lang = lang or get_dict_lang()
    if extras is None and lang == 'ja':
        extras = load_ja_word_extras([voca.id], lang)
    obj = {
        'word': voca.word,
        'pronunciation': voca.pronunciation,
        'meanings': list(meanings or []),
        'examples': list(examples or []),
        'vocaId': voca.id,
    }
    obj.update(extra_fields)
    return apply_word_fields(obj, voca.id, extras, lang)


def enrich_user_examples(examples, voca_id, voca_tokens, lang=None):
    """사용자 단어장에 저장된 예문 리스트에 reading_tokens 를 채운다(ja, 없는 것만).

    저장본에 이미 reading_tokens 가 있으면(서점 복사본) 그대로 둔다. 원본 리스트를 바꾸지 않고 새 리스트 반환.
    """
    if not is_ja(lang) or not examples:
        return examples
    by_text = (voca_tokens or {}).get(voca_id) or {}
    if not by_text:
        return examples
    out = []
    for ex in examples:
        if isinstance(ex, dict) and 'reading_tokens' not in ex:
            tokens = by_text.get(normalize_example_text(ex.get('origin')))
            if tokens is not None:
                ex = dict(ex)
                ex['reading_tokens'] = tokens
        out.append(ex)
    return out


class UserWordEnricher:
    """사용자 단어(UserVoca) 목록 응답용 — voca_id 들을 한 번에 모아 사전 조회 후 필드를 붙인다.

    사용:
        enr = UserWordEnricher(uv.voca_id for uv in user_vocas)
        item.update(enr.fields(uv.voca_id))
        item['examples'] = enr.examples(uv.voca_id, examples)
    en 에서는 쿼리 0회, fields() 는 {'language': 'en'} 만 준다.
    """

    def __init__(self, voca_ids, lang=None):
        self.lang = lang or get_dict_lang()
        ids = _unique_ints(voca_ids)
        self.extras = load_ja_word_extras(ids, self.lang)
        self.voca_tokens = load_ja_voca_example_tokens(ids, self.lang)

    def fields(self, voca_id):
        f = word_lang_fields(voca_id, self.extras, self.lang)
        if self.lang == 'ja' and f.get('pronunciation') is None:
            f.pop('pronunciation', None)
        return f

    def examples(self, voca_id, examples):
        return enrich_user_examples(examples, voca_id, self.voca_tokens, self.lang)


# ──────────────────────────────────────────────────────────
# 요청 payload 의 사전 id 검증
# ──────────────────────────────────────────────────────────

def payload_voca_id(item):
    """단어 payload 의 사전 id — `vocaId` → `dictionaryId` → `voca_id` 순. 정수 아니면 None."""
    if not isinstance(item, dict):
        return None
    for key in ('vocaId', 'dictionaryId', 'voca_id'):
        v = item.get(key)
        if v is None or v == '':
            continue
        try:
            return int(v)
        except (TypeError, ValueError):
            return None
    return None


def validate_dict_voca_ids(pairs, lang=None):
    """[(origin, voca_id), ...] → {voca_id: True} 중 현재 언어 사전에 실제 있고 단어가 맞는 것만.

    voca.id 는 언어별 사전마다 따로 매겨지므로(en 12번 ≠ ja 12번) 클라이언트가 보낸 id 를
    그대로 믿으면 다른 사전 단어에 연결된다. 현재 언어 사전에서 id 로 찾아
    표기(en 은 대소문자 무시) 또는 ja 읽기가 origin 과 같을 때만 유효로 본다.
    반환: 유효한 (origin, voca_id) 집합.
    """
    lang = lang or get_dict_lang()
    wanted = [(o, v) for o, v in pairs if o and v is not None]
    if not wanted:
        return set()
    from app import db
    from app.models.models import Voca
    ids = _unique_ints(v for _, v in wanted)
    words = {}
    for chunk in _chunks(ids):
        for vid, word in db.session.query(Voca.id, Voca.word).filter(Voca.id.in_(chunk)).all():
            words[vid] = word
    readings = {}
    if lang == 'ja':
        readings = {k: v.get('reading') for k, v in load_ja_word_extras(list(words.keys()), lang).items()}
    valid = set()
    for origin, vid in wanted:
        word = words.get(vid)
        if word is None:
            continue
        o = str(origin).strip()
        if lang == 'ja':
            ok = (o == word) or (readings.get(vid) and o == readings.get(vid))
        else:
            ok = o.lower() == (word or '').lower()
        if ok:
            valid.add((origin, vid))
    return valid


def check_payload_language(payload_lang, lang=None):
    """payload 의 `language` 검증. 없으면 통과(None), 서버 현재 언어와 다르면 오류 메시지 반환.

    단어장·단어의 언어는 항상 서버(current_user.learning_lang)가 정한다 — payload 값은 쓰지 않는다.
    """
    if payload_lang is None or payload_lang == '':
        return None
    lang = lang or get_dict_lang()
    v = str(payload_lang).strip().lower()
    if v != lang:
        return f'현재 학습 언어({lang})와 요청 언어({payload_lang})가 달라요. 앱을 새로고침해 주세요.'
    return None
