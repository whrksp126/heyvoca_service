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
from app.models.models import (
    UserVocaBook, UserVocaBookMap, UserVoca, UserStudyLog,
    VocaExampleMap, VocaExample, VocaExampleMeta,
)
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
    # examples와 순서/길이가 같은 리스트 — 각 원소는 voca_example_puzzle 매칭 결과(dict) 또는
    # None(매칭 안 됨/조립형 4종 출제 불가). 2026-09 "출제형 문제 1단계", en 전용(ja는 항상 []).
    example_puzzles:   list = field(default_factory=list)
    # "매번 새 문장"(2026-09-30, FRESH_SENTENCE_CONTRACT.md §2) — 문장형 문제(fillInTheBlank*,
    # sentenceArrange*, listenArrange) 후보 예문 풀. 사용자 복사본(examples) ∪ 사전 예문
    # (voca_example_map → voca_example, target 태그+한국어 있는 것만), sentence_hash로 중복
    # 제거(사용자 복사본 우선). 각 원소: {'origin','meaning','hash','puzzle','meta','source'}.
    # en 전용(ja는 항상 []). app/services/example_select.py 가 이 필드를 선택 후보로 쓴다.
    example_pool:      list = field(default_factory=list)
    # 자동 출제 tier 진행 상태 — UserVoca.tier_target/tier_shown/tier_correct 정본을 그대로
    # 담는다(2026-09 2차 보완). {'tier_target':int,'tier_shown':int,'was_correct':bool} 또는
    # 기록이 없으면 None. composer._compute_target_tier가 다음 tier_target 계산에 쓴다.
    tier_state:        Optional[dict] = None


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
    ).filter(
        UserVocaBook.user_id == user_id, UserVocaBook.language == lang,
        # 글자 밭(app/routes/script.py)은 복습·추천 풀에서 완전히 분리한다 — 학습은
        # /script/session이 따로 담당하고, 여기 섞이면 일반 단어 추천에 글자가 낀다.
        UserVocaBook.book_kind != 'script',
    )

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

            # 자동 출제 tier 진행 상태 — UserVoca 컬럼이 정본(2026-09 2차 보완).
            tier_state = None
            if uv.tier_target is not None:
                tier_state = {
                    'tier_target': uv.tier_target,
                    'tier_shown':  uv.tier_shown,
                    'was_correct': bool(uv.tier_correct),
                }

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
                tier_state=tier_state,
            ))

    # 유사 뜻(concept) 배치 조회 — voca_id 집합을 한 번에 모아 단일 쿼리로 조회(N+1 방지).
    from app.services.meaning_concept import load_dict_meaning_concepts, attach_concept_ids, normalized_meanings_for_word
    concept_lookup = load_dict_meaning_concepts(r['voca_id'] for r in raw_items)

    # 예문 조각 조립 문제(voca_example_puzzle) 배치 조회 — en 전용(2026-09 "출제형 문제
    # 1단계" 범위). 후보 풀의 모든 예문 origin 텍스트를 정규화·해시해 한 번에 조회한다.
    #
    # "매번 새 문장"(2026-09-30, FRESH_SENTENCE_CONTRACT.md §2) — 같은 배치에서 사전
    # 예문(voca_example_map → voca_example)도 voca_id 집합으로 한 번에 조회해 사용자
    # 복사본과 합친 후보 풀(example_pool)을 만든다. puzzle 조회 대상 hash 집합도 사전
    # 예문분까지 넓혀 한 쿼리로 같이 처리한다(N+1 방지).
    puzzle_lookup: dict = {}
    dict_examples_by_voca_id: dict = {}
    meta_by_hash: dict = {}
    if lang == 'en':
        from app.services.sentence_puzzle import sentence_hash, load_puzzles_by_hashes
        from app.utils.example_tagging import example_origin_text, example_has_target_tag

        voca_ids_all = sorted({r['voca_id'] for r in raw_items if r['voca_id'] is not None})

        # 사전 예문 배치 조회 — voca_example_map ⋈ voca_example, target 태그 있고
        # 한국어가 비어 있지 않은 것만 후보로 남긴다(계약 §2).
        dict_example_rows = []
        if voca_ids_all:
            dict_example_rows = (
                db.session.query(VocaExampleMap.voca_id, VocaExample.id,
                                  VocaExample.exam_en, VocaExample.exam_ko)
                .join(VocaExample, VocaExampleMap.example_id == VocaExample.id)
                .filter(VocaExampleMap.voca_id.in_(voca_ids_all))
                .all()
            )

        dict_example_hash_by_id: dict = {}
        for voca_id, example_id, exam_en, exam_ko in dict_example_rows:
            if not exam_en or not exam_ko or not example_has_target_tag(exam_en):
                continue
            h = sentence_hash(exam_en)
            dict_example_hash_by_id[example_id] = h
            dict_examples_by_voca_id.setdefault(voca_id, []).append({
                'origin': exam_en, 'meaning': exam_ko, 'hash': h,
                'source': 'dict', 'example_id': example_id,
            })

        # voca_example_meta 배치 조회 — 위에서 살아남은 사전 예문의 example_id만.
        meta_by_example_id: dict = {}
        if dict_example_hash_by_id:
            meta_rows = (
                db.session.query(VocaExampleMeta)
                .filter(VocaExampleMeta.example_id.in_(dict_example_hash_by_id.keys()))
                .all()
            )
            for row in meta_rows:
                meta_by_example_id[row.example_id] = {
                    'level': row.level, 'words': row.words or [],
                    # plant(새 씨앗 심기) 쉬운 예문 우선 선택용(example_select)
                    'word_count': row.word_count, 'rare_count': row.rare_count,
                }
        for example_id, h in dict_example_hash_by_id.items():
            meta = meta_by_example_id.get(example_id)
            if meta is not None:
                meta_by_hash[h] = meta

        all_hashes = set(dict_example_hash_by_id.values())
        for r in raw_items:
            for ex in r['examples'] or []:
                origin = example_origin_text(ex)
                if origin:
                    all_hashes.add(sentence_hash(origin))
        puzzle_lookup = load_puzzles_by_hashes(all_hashes)

    items: list[CandidateItem] = []
    for r in raw_items:
        meaning_concepts, concept_ids = attach_concept_ids(r['voca_id'], r['meanings'], concept_lookup)
        example_puzzles = []
        example_pool: list = []
        if lang == 'en':
            from app.services.sentence_puzzle import sentence_hash
            from app.utils.example_tagging import example_origin_text, example_meaning_text

            for ex in r['examples'] or []:
                origin = example_origin_text(ex)
                example_puzzles.append(puzzle_lookup.get(sentence_hash(origin)) if origin else None)

            pool_by_hash: dict = {}
            for ex in r['examples'] or []:
                origin = example_origin_text(ex)
                if not origin:
                    continue
                h = sentence_hash(origin)
                if h in pool_by_hash:
                    continue
                pool_by_hash[h] = {
                    'origin':  origin,
                    'meaning': example_meaning_text(ex),
                    'hash':    h,
                    'source':  'user',
                    'puzzle':  puzzle_lookup.get(h),
                    'meta':    meta_by_hash.get(h),
                }
            for dex in dict_examples_by_voca_id.get(r['voca_id'], []):
                h = dex['hash']
                if h in pool_by_hash:
                    continue  # 사용자가 고친 문장 보존 — 사용자 복사본 우선
                pool_by_hash[h] = {
                    'origin':  dex['origin'],
                    'meaning': dex['meaning'],
                    'hash':    h,
                    'source':  'dict',
                    'puzzle':  puzzle_lookup.get(h),
                    'meta':    meta_by_hash.get(h),
                }
            example_pool = list(pool_by_hash.values())

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
            example_puzzles=example_puzzles,
            example_pool=example_pool,
            tier_state=r['tier_state'],
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


# ──────────────────────────────────────────────
# "매번 새 문장" 선택 컨텍스트 조회 (2026-09-30, FRESH_SENTENCE_CONTRACT.md §2)
#
# 아래 두 함수는 pool 캐시(TTL 30초)에 넣지 않고 매 요청 신선하게 조회한다 —
# 최근 학습 기록/아는 단어 집합은 study/log 직후 즉시 달라져야 하는 값이라
# 30초 캐시에 얹으면 "방금 배운 단어인데 여전히 모르는 단어로 취급" 같은
# 짧은 지연 불일치가 생긴다. 호출 비용은 세션에 실제로 뽑힌 단어 수(<=50)
# 기준이라 요청당 1~2쿼리로 가볍다.
# ──────────────────────────────────────────────

def load_recent_example_hashes(user_id, user_voca_ids, window_days: int = 30) -> dict:
    """최근 window_days일 내 각 user_voca_id가 실제로 본 문장 hash → 마지막으로 본 시각.

    Returns:
        {user_voca_id: {sentence_hash: datetime(마지막으로 본 시각)}}
    사용자·단어 소유 검증은 호출부가 이미 pool 단계에서 했다고 가정(추가 필터 없음).
    """
    if isinstance(user_id, str):
        user_id = UUID(user_id)
    ids = sorted({int(v) for v in (user_voca_ids or []) if v is not None})
    if not ids:
        return {}

    from sqlalchemy import func
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=window_days)

    rows = (
        db.session.query(
            UserStudyLog.user_voca_id,
            UserStudyLog.example_hash,
            func.max(UserStudyLog.created_at),
        )
        .filter(
            UserStudyLog.user_id == user_id,
            UserStudyLog.user_voca_id.in_(ids),
            UserStudyLog.example_hash.isnot(None),
            UserStudyLog.created_at >= cutoff,
        )
        .group_by(UserStudyLog.user_voca_id, UserStudyLog.example_hash)
        .all()
    )
    result: dict = {}
    for user_voca_id, example_hash, last_seen in rows:
        result.setdefault(user_voca_id, {})[example_hash] = last_seen

    # POST /study/example-seen 가벼운 노출 기록(오답이라 /study/log 가 없는 문장 등)을 합친다.
    from app.models.models import UserExampleSeen
    seen_rows = (
        db.session.query(
            UserExampleSeen.user_voca_id,
            UserExampleSeen.example_hash,
            func.max(UserExampleSeen.seen_at),
        )
        .filter(
            UserExampleSeen.user_id == user_id,
            UserExampleSeen.user_voca_id.in_(ids),
            UserExampleSeen.seen_at >= cutoff,
        )
        .group_by(UserExampleSeen.user_voca_id, UserExampleSeen.example_hash)
        .all()
    )
    for user_voca_id, example_hash, last_seen in seen_rows:
        cur = result.setdefault(user_voca_id, {})
        if example_hash not in cur or cur[example_hash] < last_seen:
            cur[example_hash] = last_seen
    return result


def load_known_words(user_id, lang: str = 'en') -> set:
    """이 사용자의 학습 언어별 UserVoca 중 한 번 이상 학습한(FSRS reps >= 1) 단어의
    원형(소문자) 집합.

    voca_example_meta.words가 이미 목표 단어 구간·기능어·아주 흔한 단어를 뺀
    원형 리스트라, 여기서는 별도 lemmatize 없이 UserVoca.word를 그대로 소문자화한다
    (사전 표제어 자체가 활용형이 아닌 원형이므로 words와 형태가 맞는다).
    """
    if isinstance(user_id, str):
        user_id = UUID(user_id)
    lang = normalize_lang(lang) or 'en'

    from app.services.fsrs.state import parse_user_voca_data, is_v1, migrate_v1_to_v2, get_fsrs_state

    rows = (
        db.session.query(UserVoca.word, UserVoca.data)
        .filter(UserVoca.user_id == user_id, UserVoca.dict_lang == lang)
        .all()
    )
    known: set = set()
    for word, data in rows:
        if not word:
            continue
        payload = parse_user_voca_data(data)
        if is_v1(payload):
            payload = migrate_v1_to_v2(payload)
        fsrs = get_fsrs_state(payload) or {}
        if int(fsrs.get('reps') or 0) >= 1:
            known.add(word.strip().lower())
    return known
