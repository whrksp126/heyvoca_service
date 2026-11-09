"""온보딩 v2 수준 측정 재료 + 수준별 서점 단어장 추천 (이슈 #25).

- build_placement_pool()   GET /onboarding/placement-pool 응답의 bands
- recommend_books(theta)   GET /onboarding/recommend-books 응답

둘 다 english_dict(g.dict_lang='en') 아래에서만 부른다 — 사전 모델이 heyvoca_dict 로 간다.
무거운 후보 계산은 Redis 에 캐시하고(사전 교체 반영 지연 6시간 허용), 요청마다 섞기만 한다.
"""

import json
import logging
import random
import re
from statistics import median

from app import db, cache
from app.services import skill_level as SL

log = logging.getLogger(__name__)

PLACEMENT_BANDS = (1, 2, 3, 4, 5)          # A1~C1
PLACEMENT_PER_BAND = 12
PLACEMENT_DISTRACTORS = 3
_CANDIDATES_PER_BAND = 400                 # 빈도 상위 후보(뜻 필터 전)
_KEEP_PER_BAND = 150                       # 캐시에 남기는 후보 수(예문 있는 단어 우선)
_WORD_RE = re.compile(r'^[a-z]{3,12}$')    # 단어 1개, 소문자(고유명사 제외), 너무 짧은(of·so·me 같은 기능어)·긴 단어 제외
_TAG_RE = re.compile(r'<[^>]+>')
_VERIFIED_SOURCES = ('cefrj', 'octanove')  # 빈도 추정(freq-est)은 등급 신뢰도가 낮아 측정에서 뺀다

_POOL_CACHE_KEY = 'onboarding:placement_candidates:v2'
_BOOK_LEVEL_CACHE_KEY = 'onboarding:book_levels:v1'
_CACHE_TTL = 6 * 3600

CEFR_LABEL_KO = {
    'A1': '초등 수준', 'A2': '중학 수준', 'B1': '고등 수준',
    'B2': '대학 수준', 'C1': '고급 수준', 'C2': '원어민 수준',
}


def _plain(text):
    return _TAG_RE.sub('', text or '').strip()


def _cache_get(key):
    try:
        raw = cache.get(key)
        return json.loads(raw) if raw else None
    except Exception:
        return None


def _cache_set(key, value):
    try:
        cache.set(key, json.dumps(value, ensure_ascii=False), timeout=_CACHE_TTL)
    except Exception:
        log.warning('온보딩 캐시 저장 실패(무해): %s', key, exc_info=True)


# ── 수준 측정 재료 ───────────────────────────────────────────────────────

def _build_candidates() -> dict:
    """{band(str): [W, ...]} — W 는 distractor_sentences 를 뺀 응답 항목."""
    from app.models.models import (Voca, VocaLabel, VocaMeaning, VocaMeaningMap,
                                   VocaExample, VocaExampleMap, VocaExampleMeta)

    by_band = {}
    for rank in PLACEMENT_BANDS:
        rows = (
            db.session.query(Voca.id, Voca.word)
            .join(VocaLabel, VocaLabel.voca_id == Voca.id)
            .filter(VocaLabel.cefr == SL.cefr_name(rank),
                    VocaLabel.cefr_source.in_(_VERIFIED_SOURCES),
                    db.or_(Voca.is_active.is_(None), Voca.is_active.is_(True)))
            .order_by(VocaLabel.freq_zipf.desc())
            .limit(_CANDIDATES_PER_BAND * 2)
            .all()
        )
        seen = set()
        picked = []
        for vid, word in rows:
            w = (word or '').strip()
            if not _WORD_RE.match(w) or w in seen:
                continue
            seen.add(w)
            picked.append((vid, w))
            if len(picked) >= _CANDIDATES_PER_BAND:
                break
        by_band[rank] = picked

    all_ids = [vid for picked in by_band.values() for vid, _ in picked]
    if not all_ids:
        return {}

    meanings = {}
    for vid, meaning in (
        db.session.query(VocaMeaningMap.voca_id, VocaMeaning.meaning)
        .join(VocaMeaning, VocaMeaning.id == VocaMeaningMap.meaning_id)
        .filter(VocaMeaningMap.voca_id.in_(all_ids))
        .order_by(VocaMeaningMap.voca_id, VocaMeaning.id)
        .all()
    ):
        m = (meaning or '').strip()
        if m and m not in meanings.setdefault(vid, []):
            meanings[vid].append(m)

    words_by_id = {vid: w for picked in by_band.values() for vid, w in picked}
    best_example = {}
    for vid, origin, meaning, score, wc in (
        db.session.query(VocaExampleMap.voca_id, VocaExample.exam_en, VocaExample.exam_ko,
                         VocaExampleMeta.score, VocaExampleMeta.word_count)
        .join(VocaExample, VocaExample.id == VocaExampleMap.example_id)
        .join(VocaExampleMeta, VocaExampleMeta.example_id == VocaExample.id)
        .filter(VocaExampleMap.voca_id.in_(all_ids),
                VocaExample.exam_en.isnot(None), VocaExample.exam_ko.isnot(None),
                VocaExampleMeta.score.isnot(None))
        .all()
    ):
        if not _plain(meaning) or not _plain(origin):
            continue
        word = words_by_id.get(vid)
        # 단어 원형이 문장에 그대로 들어간 예문만(활용형·복수형 제외)
        if not word or not re.search(r'\b' + re.escape(word) + r'\b', _plain(origin), re.IGNORECASE):
            continue
        key = (int(score), int(wc or 99))
        cur = best_example.get(vid)
        if cur is None or key < cur[0]:
            best_example[vid] = (key, {'origin': origin, 'meaning': meaning, 'score': int(score)})

    out = {}
    for rank, picked in by_band.items():
        with_ex, without_ex = [], []
        for vid, w in picked:
            ms = meanings.get(vid) or []
            if not ms:
                continue
            ex = best_example.get(vid)
            item = {'voca_id': vid, 'origin': w, 'meanings': ms[:3], 'cefr_rank': rank,
                    'example': ex[1] if ex else None}
            (with_ex if ex else without_ex).append(item)
        out[str(rank)] = (with_ex + without_ex)[:_KEEP_PER_BAND]
    return out


def placement_candidates() -> dict:
    cached = _cache_get(_POOL_CACHE_KEY)
    if cached:
        return cached
    data = _build_candidates()
    if data:
        _cache_set(_POOL_CACHE_KEY, data)
    return data


def build_placement_pool(rng=None) -> dict:
    """{band: [W x 12]} — 호출마다 섞는다. W.distractor_sentences 는 같은 밴드 다른 단어의 예문."""
    rng = rng or random.SystemRandom()
    bands = {}
    for band, items in placement_candidates().items():
        chosen = rng.sample(items, min(PLACEMENT_PER_BAND, len(items)))
        example_pool = [it for it in items if it.get('example')]
        out = []
        for it in chosen:
            others = [e for e in example_pool if e['voca_id'] != it['voca_id']]
            picks = rng.sample(others, min(PLACEMENT_DISTRACTORS, len(others))) if it.get('example') else []
            out.append({**it, 'distractor_sentences': [
                {'origin': p['example']['origin'], 'meaning': p['example']['meaning']} for p in picks
            ]})
        bands[band] = out
    return bands


def placement_tts_texts() -> set:
    """게스트 TTS 생성 화이트리스트에 더할 텍스트(정규화 전) — 측정 후보 단어와 예문."""
    texts = set()
    for items in (placement_candidates() or {}).values():
        for it in items:
            texts.add(it['origin'])
            if it.get('example'):
                texts.add(it['example']['origin'])
    return texts


# ── 수준별 단어장 추천 ────────────────────────────────────────────────────

def _book_levels() -> list:
    """서점(영어, 숨김 제외) 단어장별 난이도 — [{bookstore_id, name, category, color, gem,
    word_count, score, cefr, sample_words}]. 난이도 = 단어 CEFR 대표 점수(RANK_CENTER)의 중앙값."""
    cached = _cache_get(_BOOK_LEVEL_CACHE_KEY)
    if cached is not None:
        return cached

    from app.models.models import Bookstore, AdminVocaBookMap, Voca, VocaLabel

    books = (
        db.session.query(Bookstore)
        .filter(Bookstore.hide != 'Y', Bookstore.admin_voca_book_id.isnot(None))
        .all()
    )
    admin_ids = [b.admin_voca_book_id for b in books]
    if not admin_ids:
        return []
    rows = (
        db.session.query(AdminVocaBookMap.book_id, AdminVocaBookMap.id, Voca.word, VocaLabel.cefr)
        .join(Voca, Voca.id == AdminVocaBookMap.voca_id)
        .outerjoin(VocaLabel, VocaLabel.voca_id == Voca.id)
        .filter(AdminVocaBookMap.book_id.in_(admin_ids))
        .order_by(AdminVocaBookMap.book_id, AdminVocaBookMap.id)
        .all()
    )
    per_book = {}
    for book_id, _map_id, word, cefr in rows:
        d = per_book.setdefault(book_id, {'scores': [], 'words': [], 'count': 0})
        d['count'] += 1
        if len(d['words']) < 6 and word and word not in d['words']:
            d['words'].append(word)
        if cefr in SL.CEFR_NAMES:
            d['scores'].append(SL.RANK_CENTER[SL.CEFR_NAMES.index(cefr) + 1])

    out = []
    for b in books:
        d = per_book.get(b.admin_voca_book_id)
        if not d or not d['scores'] or d['count'] < 10:
            continue
        score = float(median(d['scores']))
        try:
            color = json.loads(b.color) if b.color else None
        except (TypeError, ValueError):
            color = None
        out.append({
            'bookstore_id': b.id,
            'name': (b.name or '').split('\t')[0].strip(),
            'category': b.category,
            'color': color,
            'gem': int(b.gem or 0),
            'word_count': d['count'],
            'sample_words': d['words'],
            'score': round(score, 1),
            'cefr': SL.cefr_name(SL.score_to_cefr(score)),
        })
    _cache_set(_BOOK_LEVEL_CACHE_KEY, out)
    return out


def recommend_books(theta: float, count: int = 3) -> dict:
    """θ 이하(약간 쉬운) 단어장을 가까운 순으로 우선, 서로 다른 category 로 count 권."""
    books = _book_levels()
    easier = sorted((b for b in books if b['score'] <= theta), key=lambda b: (theta - b['score'], b['bookstore_id']))
    harder = sorted((b for b in books if b['score'] > theta), key=lambda b: (b['score'] - theta, b['bookstore_id']))
    ordered = easier + harder

    picked, cats = [], set()
    for b in ordered:                       # 1차: 카테고리 겹치지 않게
        if b['category'] not in cats:
            picked.append(b)
            cats.add(b['category'])
        if len(picked) >= count:
            break
    if len(picked) < count:                 # 2차: 카테고리가 모자라면 겹쳐도 채운다
        for b in ordered:
            if b not in picked:
                picked.append(b)
            if len(picked) >= count:
                break

    cefr = SL.cefr_name(SL.score_to_cefr(theta))
    return {
        'level': {'cefr': cefr, 'label': CEFR_LABEL_KO[cefr], 'theta': round(float(theta), 1)},
        'books': [{k: b[k] for k in ('bookstore_id', 'name', 'category', 'color', 'word_count',
                                     'sample_words', 'gem', 'cefr')} for b in picked],
    }


def theta_to_level_id(theta: float) -> int:
    """θ → User.level_id(1 초등 / 2 중등 / 3 고등 / 4 대학생). 구간 하한: A2 20 / B1 35 / B2 55."""
    if theta < 20:
        return 1
    if theta < 35:
        return 2
    if theta < 55:
        return 3
    return 4
