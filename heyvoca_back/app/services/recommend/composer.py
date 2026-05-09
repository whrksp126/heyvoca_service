"""
recommend/composer.py — 추천 세션 구성 (단일 알고리즘).

compose(pool, count, *, selection='recommended', user_stats=None) → dict

빠른 복습과 테스트(추천 모드)는 동일한 추천 알고리즘을 사용한다.
차이는 입력 필터(단어장/암기상태) 뿐이며, 그 필터는 pool 단계에서 처리된다.

알고리즘은 사용자 풀 분포 + 학습 기록을 바탕으로 매번 동적으로 구성한다.
고정 비율은 사용하지 않는다.

selection='random' 인 경우는 추천 알고리즘을 거치지 않고 단순 랜덤 추출.

user_stats 구조:
  {
    "recent_7d_correct_rate": 0.85,            # 최근 7일 평균 정답률 (None이면 default)
    "recent_7d_total":        150,             # 7일 총 시도 수
    "weakness_types":         [...],           # 약점 question_type 리스트
    "today_seen":             {voca_id: [...]},# 오늘 본 단어/유형
    "recent_lapse_voca_ids":  {1, 2, 3},       # 최근 48시간 내 틀린 적 있는 user_voca_id
  }
"""

import random
import datetime as dt
from typing import List, Optional, Dict, Any, Set, Tuple

from app.services.recommend.pool import CandidateItem
from app.services.recommend.ranking import (
    rank_overdue, rank_today, rank_long_interleave,
    rank_new, rank_short_medium,
)
from app.utils.interleave import interleave_avoid_adjacent

# ──────────────────────────────────────────────
# 상수
# ──────────────────────────────────────────────

# bucket 우선순위 (망각 위험도 + 학습 가치 종합)
_BUCKET_PRIORITY: Tuple[str, ...] = (
    'lapse',    # 최근 틀림 — 즉시 재학습 (가상 bucket, runtime 분류)
    'overdue',  # 복습 시점 지남
    'today',    # 오늘 복습 예정
    'short',    # 단기 기억 강화
    'medium',   # 중기 기억 강화
    'new',      # 신규 도전
    'long',     # 장기 점검
)

# 사용자 능력 평가 임계값 (recent_7d_total >= MIN_SAMPLES 일 때만 의미 있음)
_LEVEL_MIN_SAMPLES   = 20
_LEVEL_HIGH_RATE     = 0.85
_LEVEL_LOW_RATE      = 0.60

# 다양성: 같은 bucket이 연속해서 나오지 않게 인터리빙 적용

# bucket별 사용자 표시용 reason 문구
_BUCKET_REASON: Dict[str, str] = {
    'lapse':   '방금 틀린 단어예요',
    'overdue': '복습 시점이 지났어요',
    'today':   '오늘 복습 예정이에요',
    'short':   '단기 기억 강화',
    'medium':  '중기 기억 강화',
    'new':     '',          # 'new'는 프론트가 NEW 칩으로 별도 표시
    'long':    '장기 기억 점검',
}

# 지원 question_type 목록
_ALL_QUESTION_TYPES = [
    'multipleChoice',
    'multipleChoiceListening',
    'fillInTheBlank',
    'cardMatch',
    'cardMatchListening',
]


# ──────────────────────────────────────────────
# 사용자 능력 평가
# ──────────────────────────────────────────────

def _evaluate_user_level(user_stats: Optional[Dict]) -> str:
    """
    'high' | 'mid' | 'low' — 최근 7일 정답률 기반.
    샘플이 부족하면 'mid'로 간주(기본 균형 정책).
    """
    if not user_stats:
        return 'mid'
    rate  = user_stats.get('recent_7d_correct_rate')
    total = user_stats.get('recent_7d_total', 0) or 0
    if rate is None or total < _LEVEL_MIN_SAMPLES:
        return 'mid'
    if rate >= _LEVEL_HIGH_RATE:
        return 'high'
    if rate <= _LEVEL_LOW_RATE:
        return 'low'
    return 'mid'


# ──────────────────────────────────────────────
# bucket 분류 + lapse 식별
# ──────────────────────────────────────────────

def _split_pool(
    pool: List[CandidateItem],
    lapse_ids: Set[int],
) -> Dict[str, List[CandidateItem]]:
    """
    pool을 bucket별로 분류.
    lapse_ids에 포함된 단어는 원래 bucket과 무관하게 'lapse'로 재분류
    (단, new는 학습 이력이 없으므로 lapse가 될 수 없음).
    """
    buckets: Dict[str, List[CandidateItem]] = {b: [] for b in _BUCKET_PRIORITY}
    for item in pool:
        # new 단어는 학습 이력이 없으므로 lapse 대상이 아님
        if item.bucket != 'new' and item.user_voca_id in lapse_ids:
            buckets['lapse'].append(item)
            continue
        key = item.bucket if item.bucket in buckets else 'new'
        buckets[key].append(item)
    return buckets


def _rank_bucket(name: str, items: List[CandidateItem], now: dt.datetime) -> List[CandidateItem]:
    """bucket별 정렬 함수 디스패치."""
    if name == 'lapse':
        # 최근 틀린 단어는 retrievability 낮은 순(망각 임박) 우선
        return rank_short_medium(items)
    if name == 'overdue':
        return rank_overdue(items, now)
    if name == 'today':
        return rank_today(items, now)
    if name == 'short' or name == 'medium':
        return rank_short_medium(items)
    if name == 'long':
        return rank_long_interleave(items)
    if name == 'new':
        return rank_new(items)
    return list(items)


# ──────────────────────────────────────────────
# 슬롯 분배 — 사용자 상태 기반 동적
# ──────────────────────────────────────────────

def _decide_slot_quotas(
    available: Dict[str, int],
    count: int,
    user_level: str,
) -> Dict[str, int]:
    """
    풀 분포(available)와 사용자 능력(user_level)을 보고
    각 bucket에서 뽑을 단어 수를 결정한다.

    원칙:
      1. 위급 망각 위험 단어(lapse + overdue + today)는 가용한 만큼 우선 채운다.
         단, count의 100%까지 채울 수 있음.
      2. 위급분으로 count가 다 차면 거기서 끝 (새 단어 추가 안 함).
      3. 부족분이 있으면 사용자 능력에 따라 분배:
         - high: 새 단어 적극 + 단기/중기 균형
         - low : 단기/중기 강화 + 새 단어 자제
         - mid : 균형
      4. 그래도 부족하면 long 등에서 보충.
    """
    quotas: Dict[str, int] = {b: 0 for b in _BUCKET_PRIORITY}
    remaining = count

    # ── 1. 위급 망각 위험 ──
    for b in ('lapse', 'overdue', 'today'):
        take = min(available.get(b, 0), remaining)
        quotas[b] = take
        remaining -= take
        if remaining == 0:
            return quotas

    # ── 2. 사용자 능력 기반 분배 ──
    # 부족분을 (new, short, medium) 중심으로 능력별 가중치로 나눔
    if user_level == 'high':
        weights = {'new': 0.55, 'short': 0.25, 'medium': 0.20}
    elif user_level == 'low':
        weights = {'new': 0.10, 'short': 0.55, 'medium': 0.35}
    else:  # mid
        weights = {'new': 0.30, 'short': 0.40, 'medium': 0.30}

    # 각 카테고리 가용분만큼 가중치대로 할당
    # 풀에 없는 카테고리는 자동으로 0이 되고 부족분은 다른 곳에서 보충됨
    raw_alloc: Dict[str, int] = {}
    for b, w in weights.items():
        target = round(remaining * w)
        raw_alloc[b] = min(available.get(b, 0), target)

    # 반올림 오차 보정 — 합이 remaining과 다를 수 있으므로 우선순위 순 재분배
    allocated = sum(raw_alloc.values())
    delta = remaining - allocated
    if delta != 0:
        # delta가 양수면 부족 → 추가, 음수면 초과 → 차감
        # 풀에 여유가 있는 bucket부터 weight 큰 순으로 처리
        order = sorted(weights.items(), key=lambda x: -x[1])
        for b, _ in order:
            if delta == 0:
                break
            slack = available.get(b, 0) - raw_alloc[b] if delta > 0 else raw_alloc[b]
            if slack <= 0:
                continue
            change = min(abs(delta), slack)
            raw_alloc[b] += change if delta > 0 else -change
            delta -= change if delta > 0 else -change

    for b, n in raw_alloc.items():
        quotas[b] = n
        remaining -= n
    if remaining < 0:
        remaining = 0

    # ── 3. 그래도 부족하면 long, 그다음 medium/short/new 순으로 보충 ──
    if remaining > 0:
        for b in ('long', 'medium', 'short', 'new', 'today', 'overdue'):
            slack = available.get(b, 0) - quotas[b]
            if slack <= 0:
                continue
            take = min(slack, remaining)
            quotas[b] += take
            remaining -= take
            if remaining == 0:
                break

    return quotas


# ──────────────────────────────────────────────
# question_type 부여
# ──────────────────────────────────────────────

def _item_can_use_question_type(item: CandidateItem, qtype: str) -> bool:
    has_meanings = bool(item.meanings)
    has_examples = bool(item.examples)
    if qtype in ('multipleChoiceListening', 'cardMatchListening'):
        return has_meanings or has_examples
    if qtype == 'fillInTheBlank':
        return has_meanings
    return has_meanings or has_examples


def _assign_suggested_question_type(
    item: CandidateItem,
    weakness_types: List[str],
    avoid_types: Optional[set],
) -> Optional[str]:
    """
    1. 약점 유형 우선 (이 단어가 지원하고 avoid에 없는 것)
    2. avoid에 없는 일반 유형
    3. 모든 유형이 회피 대상이면 avoid 무시하고 지원 가능한 첫 번째
    """
    avoid = avoid_types or set()
    for wt in weakness_types:
        if wt not in avoid and _item_can_use_question_type(item, wt):
            return wt
    for qt in _ALL_QUESTION_TYPES:
        if qt not in avoid and _item_can_use_question_type(item, qt):
            return qt
    for qt in _ALL_QUESTION_TYPES:
        if _item_can_use_question_type(item, qt):
            return qt
    return None


def _enrich_items(
    items_with_bucket: List[Tuple[CandidateItem, str]],
    today_seen: Dict[int, set],
    weakness_types: List[str],
) -> List[Dict[str, Any]]:
    """
    각 아이템에 suggested_question_type, reason을 부여한다.
    items_with_bucket: [(item, original_bucket), ...] — original_bucket은 reason 결정용
    """
    result = []
    for item, src_bucket in items_with_bucket:
        avoid = today_seen.get(item.user_voca_id, set())
        suggested = _assign_suggested_question_type(item, weakness_types, avoid)
        reason = _BUCKET_REASON.get(src_bucket, '')
        result.append({
            '_item': item,
            'src_bucket': src_bucket,                # lapse 재분류 반영
            'suggested_question_type': suggested,
            'reason': reason,
        })
    return result


# ──────────────────────────────────────────────
# 추천 / 랜덤 본체
# ──────────────────────────────────────────────

def _compose_recommend(
    pool: List[CandidateItem],
    count: int,
    user_stats: Optional[Dict],
) -> Dict[str, Any]:
    """
    사용자 상태 기반 동적 추천.
    """
    now = dt.datetime.utcnow()
    lapse_ids: Set[int] = set(user_stats.get('recent_lapse_voca_ids') or set()) if user_stats else set()
    today_seen: Dict[int, set] = _normalize_today_seen(user_stats)
    weakness_types = _extract_weakness_types(user_stats)

    # 1. bucket 분류 (lapse 재분류 포함)
    buckets = _split_pool(pool, lapse_ids)

    # 2. bucket별 정렬
    ranked = {b: _rank_bucket(b, items, now) for b, items in buckets.items()}

    # 3. 가용 개수
    available = {b: len(ranked[b]) for b in _BUCKET_PRIORITY}

    # 4. 사용자 능력 평가
    user_level = _evaluate_user_level(user_stats)

    # 5. 슬롯 분배 결정
    quotas = _decide_slot_quotas(available, count, user_level)

    # 6. 선택 (각 bucket에서 quota만큼)
    selected_with_bucket: List[Tuple[CandidateItem, str]] = []
    for b in _BUCKET_PRIORITY:
        n = quotas.get(b, 0)
        if n > 0:
            for it in ranked[b][:n]:
                selected_with_bucket.append((it, b))

    # 7. 인터리빙 (음성/형태소 유사 단어 인접 회피)
    items_only = [it for it, _ in selected_with_bucket]
    interleaved = interleave_avoid_adjacent(items_only, lambda it: it.word)
    # 인터리빙 후 src_bucket 매핑 복원
    bucket_by_id = {it.user_voca_id: src for it, src in selected_with_bucket}
    final_with_bucket = [(it, bucket_by_id[it.user_voca_id]) for it in interleaved]

    # 8. enrich (suggested_question_type, reason)
    enriched = _enrich_items(final_with_bucket, today_seen, weakness_types)

    composition = {b: q for b, q in quotas.items() if q > 0}

    return {
        'composition': composition,
        'items': interleaved,
        'enriched_items': enriched,
        'user_level': user_level,
    }


def _compose_random(pool: List[CandidateItem], count: int) -> Dict[str, Any]:
    """
    추천 알고리즘을 거치지 않는 단순 랜덤 추출.
    """
    shuffled = list(pool)
    random.shuffle(shuffled)
    selected = shuffled[:count]
    enriched = [
        {'_item': it, 'src_bucket': it.bucket, 'suggested_question_type': None, 'reason': ''}
        for it in selected
    ]
    composition: Dict[str, int] = {}
    for it in selected:
        composition[it.bucket] = composition.get(it.bucket, 0) + 1
    return {
        'composition': composition,
        'items': selected,
        'enriched_items': enriched,
        'user_level': 'mid',
    }


# ──────────────────────────────────────────────
# user_stats 헬퍼
# ──────────────────────────────────────────────

def _normalize_today_seen(user_stats: Optional[Dict]) -> Dict[int, set]:
    if not user_stats:
        return {}
    raw = user_stats.get('today_seen') or {}
    result: Dict[int, set] = {}
    try:
        for k, v in raw.items():
            try:
                uid = int(k)
            except (TypeError, ValueError):
                continue
            result[uid] = set(v) if v else set()
    except (AttributeError, TypeError):
        pass
    return result


def _extract_weakness_types(user_stats: Optional[Dict]) -> List[str]:
    if not user_stats:
        return []
    weakness = user_stats.get('weakness_types') or []
    return [w['question_type'] for w in weakness if 'question_type' in w]


# ──────────────────────────────────────────────
# 공개 인터페이스
# ──────────────────────────────────────────────

def compose(
    pool: List[CandidateItem],
    count: int,
    *,
    selection: str = 'recommended',
    user_stats: Optional[Dict] = None,
) -> Dict[str, Any]:
    """
    pool에서 count개를 골라 세션을 구성해 반환한다.

    Args:
        pool:       CandidateItem 리스트 (build_candidate_pool 반환값)
        count:      선택할 단어 수 (1~50)
        selection:  'recommended' | 'random'
        user_stats: 사용자 통계 dict (recent_7d_correct_rate, weakness_types,
                    today_seen, recent_lapse_voca_ids 등)

    Returns:
        {
          'composition':    {bucket: count, ...},   # 선택된 단어의 bucket별 개수
          'items':          [CandidateItem, ...],   # 인터리빙된 최종 단어 리스트
          'enriched_items': [
            {'_item': CandidateItem,
             'suggested_question_type': str | None,
             'reason': str},
            ...
          ],
          'user_level':     'high' | 'mid' | 'low', # 동적 분배 결정에 쓰인 평가
        }
    """
    count = max(1, count)

    if not pool:
        return {
            'composition':    {},
            'items':          [],
            'enriched_items': [],
            'user_level':     'mid',
        }

    if selection == 'random':
        return _compose_random(pool, count)
    return _compose_recommend(pool, count, user_stats)
