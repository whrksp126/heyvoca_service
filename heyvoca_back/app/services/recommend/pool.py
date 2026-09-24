"""
recommend/pool.py — 추천 후보 단어 풀 빌드.

build_candidate_pool(user_id, book_ids):
  - UserVocaBook → UserVocaBookMap → UserVoca 를 joinedload 한 번으로 로드
  - v1 UserVoca.data는 즉석에서 v2 변환 (런타임 only, DB 미변경)
  - 동일 UserVoca가 여러 단어장에 걸쳐 있으면 중복 제거 (최초 book 기준 유지)
  - 각 단어를 bucket 분류: 'new' | 'overdue' | 'today' | 'short' | 'medium' | 'long'
  - 학습 언어 한정: UserVocaBook.language == lang 이고 UserVoca.dict_lang == lang 인 단어만
    (lang 기본 = 요청의 g.dict_lang). 오답 보기도 이 풀에서 뽑으므로 자연히 같은 언어로 한정된다.
  - Redis 캐싱: TTL 30초, 키 = recommend:pool:{user_id}:{lang}:{book_hash}
"""

import json
import hashlib
import datetime as dt
from dataclasses import dataclass, field
from typing import Optional
from uuid import UUID

from app import db, cache
from app.models.models import UserVocaBook, UserVocaBookMap, UserVoca
from app.utils.dict_lang import get_dict_lang, normalize_lang
from sqlalchemy.orm import joinedload

# bucket 분류 임계값 — fsrs/thresholds.py 가 단일 소스.
# 예전에는 study.py 의 값을 손으로 복사해 뒀는데, 한쪽만 조정되면 추천이 고르는 구간과
# 화면이 보여 주는 구간이 어긋난다(그 파일 주석 참고).
from app.services.fsrs.thresholds import (
    STABILITY_SHORT as _STABILITY_SHORT,
    STABILITY_MEDIUM as _STABILITY_MEDIUM,
)


@dataclass
class CandidateItem:
    user_voca_id:      int
    user_voca_book_id: Optional[UUID]
    word:              str
    meanings:          list
    examples:          list
    fsrs_state:        dict   # v2 FSRS state (runtime)
    bucket:            str    # 'new'|'overdue'|'today'|'short'|'medium'|'long'
    word_length:       int
    mastery:           dict = field(default_factory=dict)  # {recent, streak, last_studied_at} — get_mastery() 결과
    voca_id:           Optional[int] = None  # 사전(dict schema) voca.id — 사용자 직접 생성 단어는 None
    # meanings와 순서/길이가 같은 concept_id 리스트의 리스트: [[int, ...], ...] (meanings 자체는 문자열 그대로 유지)
    meaning_concepts:  list = field(default_factory=list)
    # 단어 단위 distinct concept_id (오답 제외 판정용)
    concept_ids:       list = field(default_factory=list)
    # 정규화된 뜻 문자열(concept_id가 없을 때 오답 제외 판정 폴백용)
    normalized_meanings: list = field(default_factory=list)
    # 단어 언어('en'|'ja') — UserVoca.dict_lang
    dict_lang:         str = 'en'


def _classify_bucket(fsrs_state: dict, today: dt.date) -> str:
    """FSRS state + 오늘 날짜 → bucket 문자열."""
    state_str = (fsrs_state.get("state") or "new").lower()
    if state_str in ("new", "") or not fsrs_state.get("next_review"):
        return "new"

    next_review_raw = fsrs_state.get("next_review")
    try:
        from app.services.study_day import logical_date
        next_review_dt = dt.datetime.fromisoformat(
            str(next_review_raw).replace("Z", "+00:00")
        ).replace(tzinfo=None)
        # next_review도 today와 동일한 logical 기준으로 변환 (UTC date 직접 비교 시 경계 skew)
        next_review_date = logical_date(next_review_dt)
    except (ValueError, AttributeError):
        return "new"

    if next_review_date < today:
        return "overdue"
    if next_review_date == today:
        return "today"

    # 미래 → stability 기준 세분화
    s = float(fsrs_state.get("stability") or 0.0)
    if s < _STABILITY_SHORT:
        return "short"
    elif s < _STABILITY_MEDIUM:
        return "medium"
    return "long"


def _make_book_hash(book_ids_normalized: list) -> str:
    """정렬된 book_id 목록 → md5 hex digest."""
    joined = ",".join(sorted(str(b) for b in book_ids_normalized))
    return hashlib.md5(joined.encode()).hexdigest()


def _load_pool_raw(user_id: UUID, book_ids_filter: Optional[list], lang: str = 'en') -> list:
    """
    DB에서 후보 단어 로드.
    book_ids_filter가 None이면 사용자의 모든 단어장.
    """
    from app.services.fsrs.state import (
        parse_user_voca_data, get_fsrs_state, is_v1, migrate_v1_to_v2, get_mastery,
    )

    query = db.session.query(UserVocaBook).options(
        joinedload(UserVocaBook.voca_maps).joinedload(UserVocaBookMap.user_voca)
    ).filter(UserVocaBook.user_id == user_id, UserVocaBook.language == lang)

    if book_ids_filter:
        # UUID 타입 일치를 위해 UUID 객체로 변환 후 필터
        uuid_filters = []
        for bid in book_ids_filter:
            try:
                uuid_filters.append(UUID(str(bid)) if not isinstance(bid, UUID) else bid)
            except (ValueError, AttributeError):
                pass
        if uuid_filters:
            query = query.filter(UserVocaBook.id.in_(uuid_filters))

    voca_books = query.all()

    from app.services.study_day import logical_today
    today = logical_today()
    seen_voca_ids = set()
    raw_items: list[dict] = []

    for vb in voca_books:
        for vmap in vb.voca_maps:
            uv = vmap.user_voca
            if uv is None:
                continue
            if uv.id in seen_voca_ids:
                continue
            # 단어장 언어와 단어 사전 언어가 어긋난 행(이행 중 잔재 등)도 섞지 않는다
            if (uv.dict_lang or 'en') != lang:
                continue
            seen_voca_ids.add(uv.id)

            # FSRS state 로드 (v1이면 즉석 v2 변환)
            payload = parse_user_voca_data(uv.data)
            if is_v1(payload):
                payload = migrate_v1_to_v2(payload)
            fsrs_state = get_fsrs_state(payload) or {}
            # mastery는 이미 파싱해 둔 payload에서 꺼낸다 — 추가 쿼리 없음(get_mastery는
            # 필드가 없는 기존 행에도 안전 기본값을 반환한다).
            mastery = get_mastery(payload)

            # meanings / examples: UserVocaBookMap 우선, 없으면 UserVoca 직접
            try:
                meanings = json.loads(vmap.voca_meanings) if vmap.voca_meanings else []
            except (json.JSONDecodeError, TypeError):
                meanings = []
            try:
                examples = json.loads(vmap.voca_examples) if vmap.voca_examples else []
            except (json.JSONDecodeError, TypeError):
                examples = []

            # UserVoca 자체의 meanings/examples 폴백
            if not meanings and uv.voca_meanings:
                try:
                    meanings = json.loads(uv.voca_meanings)
                except (json.JSONDecodeError, TypeError):
                    meanings = []
            if not examples and uv.voca_examples:
                try:
                    examples = json.loads(uv.voca_examples)
                except (json.JSONDecodeError, TypeError):
                    examples = []

            word = uv.word or ""
            bucket = _classify_bucket(fsrs_state, today)

            raw_items.append(dict(
                user_voca_id=uv.id,
                user_voca_book_id=vb.id,
                word=word,
                meanings=meanings,
                examples=examples,
                fsrs_state=fsrs_state,
                bucket=bucket,
                # ja 는 띄어쓰기가 없어 '글자 수'를 그대로 쓴다(한자·가나 1자 = 1).
                word_length=len(word),
                mastery=mastery,
                voca_id=uv.voca_id,
            ))

    # 유사 뜻(concept) 배치 조회 — voca_id 집합을 한 번에 모아 단일 쿼리로 조회(N+1 방지).
    from app.services.meaning_concept import load_dict_meaning_concepts, attach_concept_ids, normalized_meanings_for_word
    concept_lookup = load_dict_meaning_concepts(r['voca_id'] for r in raw_items)

    items: list[CandidateItem] = []
    for r in raw_items:
        meaning_concepts, concept_ids = attach_concept_ids(r['voca_id'], r['meanings'], concept_lookup)
        items.append(CandidateItem(
            user_voca_id=r['user_voca_id'],
            user_voca_book_id=r['user_voca_book_id'],
            word=r['word'],
            meanings=r['meanings'],
            examples=r['examples'],
            fsrs_state=r['fsrs_state'],
            bucket=r['bucket'],
            word_length=r['word_length'],
            mastery=r['mastery'],
            voca_id=r['voca_id'],
            meaning_concepts=meaning_concepts,
            concept_ids=concept_ids,
            normalized_meanings=normalized_meanings_for_word(r['meanings']),
            dict_lang=lang,
        ))

    return items


def build_candidate_pool(user_id, book_ids=None, lang=None) -> list:
    """
    사용자의 단어를 가져와 추천 후보 풀로 변환.

    Args:
        user_id:  UUID 또는 UUID 문자열
        book_ids: None / ['all'] → 전체 단어장
                  UUID 문자열 리스트 → 해당 단어장만
        lang:     'en'|'ja' — None 이면 요청의 학습 언어(get_dict_lang())

    Returns:
        CandidateItem 리스트
    """
    if isinstance(user_id, str):
        user_id = UUID(user_id)
    lang = normalize_lang(lang) or get_dict_lang()

    # book_ids 정규화: None / ['all'] → None(=전체)
    if not book_ids or book_ids == ['all'] or book_ids == 'all':
        book_ids_filter = None
        cache_book_part = "all"
    else:
        book_ids_filter = book_ids
        cache_book_part = _make_book_hash(book_ids)

    cache_key = f"recommend:pool:{user_id}:{lang}:{cache_book_part}"

    # Redis 캐시 조회
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    items = _load_pool_raw(user_id, book_ids_filter, lang)

    # 빈 풀은 캐싱하지 않는다. 온보딩 직후 migrate가 단어를 생성하기 전에 recommend가
    # 호출되면(레이스) 빈 결과가 30초간 캐시돼, 그 사이 AI 추천 테스트가
    # "출제 가능한 문제가 없어요"로 실패한다. 빈 결과를 캐시에서 제외하면 다음 호출
    # (단어 생성 후)이 곧바로 신선한 풀을 읽어 레이스 자체가 사라진다.
    if items:
        cache.set(cache_key, items, timeout=30)

    return items


def invalidate_pool_cache(user_id) -> None:
    """
    특정 사용자의 pool 캐시 무효화.
    Flask-Caching은 패턴 삭제를 직접 지원하지 않으므로
    Redis 클라이언트에서 SCAN + DEL 방식으로 처리.
    실패해도 조용히 무시 (캐시는 TTL 30초로 자연 만료).
    """
    try:
        # Flask-Caching RedisCache의 실제 클라이언트 속성은 _write_client(_client 아님).
        # 과거 _client로 접근해 AttributeError로 조용히 무효화가 no-op이 되던 버그가 있었다.
        redis_client = getattr(cache.cache, '_write_client', None) or cache.cache._read_client  # type: ignore[attr-defined]
        pattern = f"recommend:pool:{user_id}:*"
        # Flask-Caching의 key_prefix를 고려한 실제 키 탐색
        prefixed_pattern = f"{cache.cache.key_prefix}{pattern}"
        keys = list(redis_client.scan_iter(prefixed_pattern))
        if keys:
            redis_client.delete(*keys)
    except Exception:
        # 캐시 무효화 실패는 비치명적 — 자연 만료(30초)에 의존
        pass
