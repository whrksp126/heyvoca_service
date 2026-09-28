"""한국어 뜻 -> 사전 단어 역방향 검색 (프로세스 메모리 역색인).

`GET /search/word-info?from=ko&q=<한국어>` (예문 단어 탭 팝업에서 뜻을 몰라 한국어로
검색할 때) 에서 쓴다. voca_meaning(뜻) 테이블은 en 13만 행/ja 5만 행 규모라 요청마다
LIKE 전체 스캔을 하면 무겁다 — 대신 "뜻 토큰 -> voca_id 목록" 역색인을 프로세스
메모리에 만들어 두고 그걸로 조회한다.

사전 버전이 바뀌면(admin '사전 동기화' 적용) 색인을 다시 만들어야 하지만, 매 요청마다
COUNT(*)로 변경 여부를 확인하는 것도 비용이 크므로(같은 이유) `_REVALIDATE_INTERVAL`
간격으로만 재확인한다 — 그 사이 창(기본 10분)에는 구 사전으로 검색될 수 있다.
gunicorn 워커마다 별도 프로세스이므로 색인도 워커별로 각자 만든다(요청 처리량 대비
색인 크기가 작아 워커 수만큼 중복 적재해도 무리 없다 — en 약 10만 개 문자열 키).
"""
import logging
import re
import time

from sqlalchemy import text

from app import db
from app.utils.dict_lang import dict_schema, get_dict_lang

_log = logging.getLogger(__name__)

_REVALIDATE_INTERVAL = 600  # 초 — 이 간격마다만 사전 변경 여부(행 수) 재확인

# lang -> {'checked_at', 'row_count', 'index': {token: [voca_id,...]}, 'bookstore_ids': set}
_CACHE = {}

# 흔한 조사·어미 — 길이 내림차순으로 시도(긴 것부터 떼야 '경우에는'을 '경우'로 제대로 줄인다).
# 완전한 형태소 분석이 아니라 대표 규칙만 커버한다.
_PARTICLES = tuple(sorted(set([
    '습니다', '합니다', '했어요', '해주세요', '있어요', '에서는', '에는',
    '해요', '이에요', '예요', '에서', '으로',
    '은', '는', '이', '가', '을', '를', '에', '로', '와', '과', '도', '만', '의', '해', '다', '요',
]), key=len, reverse=True))

_SPLIT_RE = re.compile(r'[,;/·]')


def _fetch_row_count(schema):
    return db.session.execute(
        text(f'SELECT COUNT(*) FROM {schema}.voca_meaning_map')
    ).scalar() or 0


def _fetch_pairs(schema):
    return db.session.execute(text(f"""
        SELECT vmm.voca_id, vm.meaning
        FROM {schema}.voca_meaning_map vmm
        JOIN {schema}.voca_meaning vm ON vm.id = vmm.meaning_id
    """)).fetchall()


def _fetch_bookstore_ids(schema):
    rows = db.session.execute(text(f"""
        SELECT DISTINCT voca_id FROM {schema}.admin_voca_book_map
    """)).fetchall()
    return {r[0] for r in rows}


def _normalize_tokens(meaning):
    """뜻 문자열 -> 색인 키 후보들. '경우; 사건' -> ['경우','사건'], 동사(~하다)는 어간도 추가."""
    out = []
    raw = (meaning or '').strip()
    if not raw:
        return out
    for part in _SPLIT_RE.split(raw):
        t = part.strip()
        if not t:
            continue
        # 괄호 설명 제거: "(특정한 상황의) 경우" -> "경우"도 별도 색인
        if ')' in t:
            after = t.rsplit(')', 1)[-1].strip()
            if after and after != t:
                out.append(after)
        out.append(t)
        if t.endswith('하다') and len(t) > 2:
            out.append(t[:-2])  # '이용하다' -> '이용'
    return out


def _build_index(lang):
    schema = dict_schema(lang)
    pairs = _fetch_pairs(schema)
    index = {}
    for voca_id, meaning in pairs:
        for token in _normalize_tokens(meaning):
            bucket = index.setdefault(token, [])
            if voca_id not in bucket:
                bucket.append(voca_id)
    bookstore_ids = _fetch_bookstore_ids(schema)
    return index, bookstore_ids


def _get_index(lang):
    now = time.monotonic()
    entry = _CACHE.get(lang)
    if entry is not None and (now - entry['checked_at']) < _REVALIDATE_INTERVAL:
        return entry

    schema = dict_schema(lang)
    try:
        row_count = _fetch_row_count(schema)
    except Exception:
        _log.exception('ko_reverse_lookup: row_count 조회 실패(lang=%s)', lang)
        return entry  # 기존 색인이라도 있으면 그거 사용

    if entry is not None and entry['row_count'] == row_count:
        entry['checked_at'] = now
        return entry

    try:
        index, bookstore_ids = _build_index(lang)
    except Exception:
        _log.exception('ko_reverse_lookup: 색인 생성 실패(lang=%s)', lang)
        return entry

    entry = {
        'checked_at': now,
        'row_count': row_count,
        'index': index,
        'bookstore_ids': bookstore_ids,
    }
    _CACHE[lang] = entry
    return entry


def ko_candidate_tokens(query):
    """조사·어미를 뗀 검색 후보 목록 — 원본/어절 우선, 그다음 조사 긴 것부터 뗀 후보.

    "계단을" -> ['계단을', '계단'], "경우에는" -> ['경우에는', '경우'],
    "이용해 주세요" -> ['이용해 주세요', '이용해', '주세요', ..., '이용', ...]
    """
    q = (query or '').strip()
    candidates = []
    seen = set()

    def add(c):
        c = (c or '').strip()
        if c and c not in seen:
            seen.add(c)
            candidates.append(c)

    if not q:
        return candidates

    add(q)
    tokens = q.split()
    for t in tokens:
        add(t)

    for base in [q] + tokens:
        for p in _PARTICLES:
            if base.endswith(p) and len(base) > len(p):
                add(base[:-len(p)])

    return candidates


def search_by_korean_meaning(query, lang=None, limit=3):
    """한국어 뜻(조사 포함 가능) -> voca_id 목록(최대 limit개).

    "가장 긴 매칭 우선" — `ko_candidate_tokens`가 만든 후보를 순서대로 보다가 색인에
    히트가 있는 첫 후보를 채택한다(더 짧게 깎은 후보까지 내려가지 않음).
    같은 후보 안에서는 서점 단어장에 포함된 단어를 우선, 그다음 voca_id 오름차순.
    """
    lang = lang or get_dict_lang()
    entry = _get_index(lang)
    if not entry:
        return []
    index = entry['index']
    bookstore_ids = entry['bookstore_ids']

    for cand in ko_candidate_tokens(query):
        ids = index.get(cand)
        if not ids:
            continue
        ranked = sorted(ids, key=lambda vid: (0 if vid in bookstore_ids else 1, vid))
        return ranked[:limit]

    return []
