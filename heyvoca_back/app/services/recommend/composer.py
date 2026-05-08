"""
recommend/composer.py — SessionComposer (Phase 2.2 고도화).

compose(pool, count, type_, *, user_stats=None) → dict

user_stats 구조:
  {
    "recent_7d_correct_rate": 0.85,   # 최근 7일 평균 정답률 (None이면 default)
    "recent_7d_total": 150,           # 7일 총 시도 수 (20 미만이면 default)
    "weakness_types": [               # 약점 question_type 리스트 (correct_rate < 0.6, samples >= 10)
        {"question_type": "multipleChoiceListening", "correct_rate": 0.42, "samples": 87},
    ],
    "today_seen": {                   # {user_voca_id: set(question_type 문자열)} — 오늘 본 단어/유형
        12345: {"multipleChoice"},
    },
  }

type_별 동작:
  'daily' / 'today':
    동적 비율(dynamic_ratio) 적용.
    long 버킷은 최소 5%(floor) 보장.
    약점 유형 우선 suggested_question_type 부여.
    하루 내 반복 시 avoid_question_types 기반 다른 유형 강제.
    최종 단계 인터리빙(음성/형태소 유사 단어 인접 회피).

  'test' / 'exam':
    단순 우선순위 정렬: overdue → today → short → medium → long → new.
    target_states 사전 필터(pool에서 이미 필터링 가정)로 top-N 선택.

  'quick':
    망각곡선 기반 단순 정렬: retrievability 오름차순 top-N.
"""

import math
import datetime as dt
import random
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any

from app.services.recommend.pool import CandidateItem
from app.services.recommend.ranking import (
    rank_overdue, rank_today, rank_long_interleave,
    rank_new, rank_short_medium,
)
from app.utils.interleave import interleave_avoid_adjacent, get_group_key

# ──────────────────────────────────────────────
# 상수
# ──────────────────────────────────────────────

# 기본 daily 비율 (소수)
COMPOSITION_DAILY: Dict[str, float] = {
    'overdue': 0.50,
    'today':   0.25,
    'new':     0.20,
    'long':    0.05,
}

# long 버킷 최소 비율 (최소 보장 하한선)
_LONG_FLOOR_RATIO = 0.05

# quick/test 등에서 사용할 bucket 우선순위 순서
_BUCKET_PRIORITY = ('overdue', 'today', 'short', 'medium', 'long', 'new')

# 약점 판정 임계값
_WEAKNESS_CORRECT_RATE_THRESHOLD = 0.60
_WEAKNESS_MIN_SAMPLES = 10

# 7일 정답률 동적 조정 최소 샘플
_DYNAMIC_MIN_TOTAL = 20
_DYNAMIC_HIGH_THRESHOLD = 0.90
_DYNAMIC_LOW_THRESHOLD  = 0.60

# bucket별 이유 문구 (사용자 표시용)
_BUCKET_REASON: Dict[str, str] = {
    'overdue': '복습 시점이 지났어요',
    'today':   '오늘 복습 예정이에요',
    'new':     '새 단어 도전!',
    'long':    '장기 기억 점검',
    'short':   '단기 기억 강화',
    'medium':  '중기 기억 강화',
}

# 지원 question_type 목록 (meanings/examples 유무 기준)
_ALL_QUESTION_TYPES = [
    'multipleChoice',
    'multipleChoiceListening',
    'fillInTheBlank',
    'cardMatch',
    'cardMatchListening',
]


# ──────────────────────────────────────────────
# 내부 헬퍼
# ──────────────────────────────────────────────

def _split_by_bucket(pool: List[CandidateItem]) -> Dict[str, List[CandidateItem]]:
    """pool을 bucket별로 분류."""
    buckets: Dict[str, List[CandidateItem]] = {b: [] for b in _BUCKET_PRIORITY}
    for item in pool:
        key = item.bucket if item.bucket in buckets else 'new'
        buckets[key].append(item)
    return buckets


def _compute_dynamic_ratio(user_stats: Optional[Dict]) -> tuple:
    """
    7일 정답률 기반 동적 비율 계산.

    Returns:
        (ratio_dict, adjustment_label)
        ratio_dict: {'overdue':float, 'today':float, 'new':float, 'long':float}
        adjustment_label: 'default' | 'high_accuracy' | 'low_accuracy'
    """
    if not user_stats:
        return dict(COMPOSITION_DAILY), 'default'

    rate  = user_stats.get('recent_7d_correct_rate')
    total = user_stats.get('recent_7d_total', 0) or 0

    if rate is None or total < _DYNAMIC_MIN_TOTAL:
        return dict(COMPOSITION_DAILY), 'default'

    ratio = dict(COMPOSITION_DAILY)

    if rate >= _DYNAMIC_HIGH_THRESHOLD:
        # 잘 하고 있음 → 새 단어 더 보여주기
        ratio['new']     = min(ratio['new']     + 0.10, 1.0)
        ratio['overdue'] = max(ratio['overdue'] - 0.05, 0.0)
        ratio['today']   = max(ratio['today']   - 0.05, 0.0)
        label = 'high_accuracy'
    elif rate <= _DYNAMIC_LOW_THRESHOLD:
        # 어려워함 → 복습 강화
        ratio['new']     = max(ratio['new']     - 0.10, 0.0)
        ratio['overdue'] = min(ratio['overdue'] + 0.05, 1.0)
        ratio['today']   = min(ratio['today']   + 0.05, 1.0)
        label = 'low_accuracy'
    else:
        label = 'default'

    return ratio, label


def _build_today_seen(user_stats: Optional[Dict]) -> Dict[int, set]:
    """
    user_stats['today_seen']을 {user_voca_id: set(question_type)} 형태로 정규화.
    없거나 파싱 실패하면 빈 dict 반환.
    """
    if not user_stats:
        return {}
    seen_raw = user_stats.get('today_seen') or {}
    result: Dict[int, set] = {}
    try:
        for k, v in seen_raw.items():
            try:
                uid = int(k)
            except (TypeError, ValueError):
                continue
            result[uid] = set(v) if v else set()
    except (AttributeError, TypeError):
        pass
    return result


def _get_weakness_types(user_stats: Optional[Dict]) -> List[str]:
    """약점 question_type 목록 반환 (correct_rate < 0.6 and samples >= 10)."""
    if not user_stats:
        return []
    weakness = user_stats.get('weakness_types') or []
    result = []
    for w in weakness:
        try:
            if (w.get('correct_rate', 1.0) < _WEAKNESS_CORRECT_RATE_THRESHOLD
                    and w.get('samples', 0) >= _WEAKNESS_MIN_SAMPLES):
                result.append(w['question_type'])
        except (AttributeError, KeyError, TypeError):
            continue
    return result


def _item_can_use_question_type(item: CandidateItem, qtype: str) -> bool:
    """
    단어가 해당 question_type을 지원할 수 있는지 최소 검사.
    - Listening 유형: examples 필요 (발음 생성에 사용)
    - fillInTheBlank: meanings 필요
    - 그 외: meanings 또는 examples 중 하나만 있어도 OK
    """
    has_meanings = bool(item.meanings)
    has_examples = bool(item.examples)

    if qtype in ('multipleChoiceListening', 'cardMatchListening'):
        return has_meanings or has_examples  # TTS는 단어 자체로 생성 가능
    if qtype == 'fillInTheBlank':
        return has_meanings
    # multipleChoice, cardMatch: meanings 또는 examples
    return has_meanings or has_examples


def _assign_suggested_question_type(
    item: CandidateItem,
    weakness_types: List[str],
    avoid_types: Optional[set],
) -> Optional[str]:
    """
    단어에 suggested_question_type 결정.

    우선순위:
    1. 약점 유형 중 이 단어가 지원하고 avoid_types에 없는 첫 번째 유형
    2. avoid_types에 없는 아무 유형
    3. None (모든 유형이 회피 대상이거나 지원 불가)
    """
    avoid = avoid_types or set()

    # 1. 약점 유형 우선
    for wt in weakness_types:
        if wt not in avoid and _item_can_use_question_type(item, wt):
            return wt

    # 2. avoid 아닌 유형 중 지원 가능한 첫 번째
    for qt in _ALL_QUESTION_TYPES:
        if qt not in avoid and _item_can_use_question_type(item, qt):
            return qt

    # 3. 모든 유형 회피 대상 → avoid 무시하고 지원 가능한 첫 번째
    for qt in _ALL_QUESTION_TYPES:
        if _item_can_use_question_type(item, qt):
            return qt

    return None


def _apply_intra_day_and_weakness(
    items: List[CandidateItem],
    today_seen: Dict[int, set],
    weakness_types: List[str],
) -> List[Dict[str, Any]]:
    """
    선택된 아이템 리스트에 대해:
      1. today_seen 기반 avoid_question_types 결정
      2. 약점 유형 우선 + avoid 회피하여 suggested_question_type 부여
      3. reason 문구 부여

    Returns:
        List of enriched dict (CandidateItem 속성 + suggested_question_type + reason)
    """
    result = []
    for item in items:
        avoid = today_seen.get(item.user_voca_id, set())
        suggested = _assign_suggested_question_type(item, weakness_types, avoid)
        reason = _BUCKET_REASON.get(item.bucket, '')
        result.append({
            '_item': item,
            'suggested_question_type': suggested,
            'reason': reason,
        })
    return result


# ──────────────────────────────────────────────
# 구성 함수
# ──────────────────────────────────────────────

def _compose_daily(
    pool: List[CandidateItem],
    count: int,
    ratio: Dict[str, float],
) -> dict:
    """
    daily/today 타입: 동적 비율로 구성.

    단계:
      1. 각 bucket 목표 개수 계산.
         long은 최소 floor=ceil(count*LONG_FLOOR_RATIO)개 보장.
      2. 가용 개수가 목표보다 적으면 실제 가용 개수로 조정.
      3. 부족분(남은 슬롯)은 인접 카테고리 순으로 채움.
      4. 최종 리스트 조합 후 반환 (인터리빙은 compose()에서).
    """
    now = dt.datetime.utcnow()
    buckets = _split_by_bucket(pool)

    # 각 bucket 정렬
    ranked = {
        'overdue': rank_overdue(buckets['overdue'], now),
        'today':   rank_today(buckets['today'], now),
        'new':     rank_new(buckets['new']),
        'long':    rank_long_interleave(buckets['long']),
        'short':   rank_short_medium(buckets['short']),
        'medium':  rank_short_medium(buckets['medium']),
    }

    # long 최소 보장 개수
    long_floor = max(1, math.ceil(count * _LONG_FLOOR_RATIO))

    # 목표 개수 계산
    targets = {
        'overdue': int(count * ratio['overdue']),
        'today':   int(count * ratio['today']),
        'new':     int(count * ratio['new']),
        'long':    max(long_floor, int(count * ratio['long'])),
    }

    # 실제 가용 개수로 클램프
    actual = {k: min(len(ranked[k]), targets[k]) for k in targets}

    # long 부족분 보충 (stability 30~60 사이 medium 상위에서)
    long_shortage = long_floor - actual['long']
    if long_shortage > 0:
        # medium에서 안정성 높은 순으로 보충
        medium_ranked = ranked['medium']
        available_medium = len(medium_ranked) - actual.get('medium', 0)
        if available_medium > 0:
            fill = min(long_shortage, available_medium)
            # medium의 뒷부분(stability 높은 것)을 long 대용으로 쓰는 게 자연스러움
            # rank_short_medium는 retrievability 오름차순이므로
            # stability 높은 순으로 뒤집어서 앞에서 fill개 선택
            medium_by_stability = sorted(
                medium_ranked, key=lambda it: float(it.fsrs_state.get('stability') or 0.0), reverse=True
            )
            # 이미 actual에 들어간 medium 제외 후 상위 fill개
            already_selected_medium = actual.get('medium', 0)
            extra_medium = medium_by_stability[:fill]
            # long 슬롯에 편입 — 실제로는 ranked['long']에 추가하는 대신
            # actual['long']을 늘리고 ranked['long']에 append
            ranked['long'] = ranked['long'] + extra_medium
            actual['long'] = min(len(ranked['long']), long_floor + fill)

    # 부족분 계산 (long 제외 — 이미 floor 적용)
    shortage = {k: targets[k] - actual[k] for k in ('overdue', 'today', 'new')}

    # overdue 부족 → today 잉여에서
    today_surplus = len(ranked['today']) - actual['today']
    if shortage['overdue'] > 0 and today_surplus > 0:
        fill = min(shortage['overdue'], today_surplus)
        actual['today'] += fill
        shortage['overdue'] -= fill

    # new 부족 → short 잉여에서
    short_surplus = len(ranked['short'])  # short는 daily 할당 없음, 전체가 잉여
    if shortage['new'] > 0 and short_surplus > 0:
        fill = min(shortage['new'], short_surplus)
        actual.setdefault('short', 0)
        actual['short'] = fill
        shortage['new'] -= fill
    else:
        actual.setdefault('short', 0)

    # 남은 슬롯 계산
    used = sum(actual.values())
    remaining = count - used

    # 남은 슬롯을 medium → short → today 잉여 순으로 채움
    if remaining > 0:
        for bucket_key in ('medium', 'short', 'today', 'long', 'overdue', 'new'):
            avail = len(ranked.get(bucket_key, [])) - actual.get(bucket_key, 0)
            if avail > 0 and remaining > 0:
                fill = min(avail, remaining)
                actual[bucket_key] = actual.get(bucket_key, 0) + fill
                remaining -= fill
            if remaining == 0:
                break

    # 선택
    selected_by_bucket: Dict[str, List[CandidateItem]] = {}
    for bucket_key, n in actual.items():
        if n > 0:
            selected_by_bucket[bucket_key] = ranked.get(bucket_key, [])[:n]

    # 최종 아이템 리스트 (bucket 순서로 flatten, 이후 인터리빙 적용)
    items: List[CandidateItem] = []
    for bucket_key in _BUCKET_PRIORITY:
        items.extend(selected_by_bucket.get(bucket_key, []))

    composition = {k: len(v) for k, v in selected_by_bucket.items() if v}

    return {'composition': composition, 'items': items}


def _compose_quick(pool: List[CandidateItem], count: int) -> dict:
    """
    quick 타입: retrievability 오름차순 (망각 위험 순) top-N.
    new 단어는 가장 낮은 retrievability(0)이므로 자연스럽게 섞임.
    """
    sorted_pool = sorted(
        pool,
        key=lambda it: float(it.fsrs_state.get("retrievability") or 0.0)
    )
    selected = sorted_pool[:count]
    composition: Dict[str, int] = {}
    for item in selected:
        composition[item.bucket] = composition.get(item.bucket, 0) + 1
    return {'composition': composition, 'items': selected}


def _compose_test_exam(pool: List[CandidateItem], count: int) -> dict:
    """
    test/exam 타입: bucket 우선순위 순 정렬 후 top-N.
    overdue → today → short → medium → long → new
    """
    now = dt.datetime.utcnow()
    buckets = _split_by_bucket(pool)
    ranked = {
        'overdue': rank_overdue(buckets['overdue'], now),
        'today':   rank_today(buckets['today'], now),
        'short':   rank_short_medium(buckets['short']),
        'medium':  rank_short_medium(buckets['medium']),
        'long':    rank_long_interleave(buckets['long']),
        'new':     rank_new(buckets['new']),
    }

    ordered: List[CandidateItem] = []
    for bucket_key in _BUCKET_PRIORITY:
        ordered.extend(ranked.get(bucket_key, []))

    selected = ordered[:count]
    composition: Dict[str, int] = {}
    for item in selected:
        composition[item.bucket] = composition.get(item.bucket, 0) + 1
    return {'composition': composition, 'items': selected}


# ──────────────────────────────────────────────
# 공개 인터페이스
# ──────────────────────────────────────────────

def compose(
    pool: List[CandidateItem],
    count: int,
    type_: str = 'daily',
    *,
    user_stats: Optional[Dict] = None,
) -> dict:
    """
    pool에서 count개를 골라 세션 구성 반환.

    Args:
        pool:       CandidateItem 리스트 (build_candidate_pool 반환값)
        count:      선택할 단어 수 (1~50)
        type_:      'daily'|'today'|'test'|'exam'|'quick'
        user_stats: 사용자 통계 dict (Phase 2.2 신규, None이면 기본 동작)
          {
            "recent_7d_correct_rate": float | None,
            "recent_7d_total": int,
            "weakness_types": [{"question_type": str, "correct_rate": float, "samples": int}],
            "today_seen": {user_voca_id: [question_type, ...]},
          }

    Returns:
        {
          'composition': {'overdue': 8, 'today': 5, 'new': 4, 'long': 3},
          'composition_strategy': {
            'base': 'daily',
            'dynamic_adjustment': 'default' | 'high_accuracy' | 'low_accuracy',
            'weakness_types': ['multipleChoiceListening'],
          },
          'items': [CandidateItem, ...],         # 기존 호환
          'enriched_items': [                    # Phase 2.2 신규
            {
              '_item': CandidateItem,
              'suggested_question_type': str | None,
              'reason': str,
            }, ...
          ],
        }

    동작 예시 (daily, count=20, pool에 overdue=5, today=8, new=10, long=2, short=5):
      목표: overdue=10, today=5, new=4, long=1
      실제 가용: overdue=5(부족5), today=8, new=10(초과), long=2
      overdue 부족(5) → today 잉여(3)에서 3 보충 → overdue_from_today=3
      → 최종: overdue=5, today=8, new=4, long=2, 남은=1 → medium에서
      총합: 20개
    """
    count = max(1, count)

    if not pool:
        return {
            'composition': {},
            'composition_strategy': {
                'base': type_,
                'dynamic_adjustment': 'default',
                'weakness_types': [],
            },
            'items': [],
            'enriched_items': [],
        }

    # ── 1. 동적 비율 계산 ──
    if type_ in ('daily', 'today'):
        ratio, dynamic_adjustment = _compute_dynamic_ratio(user_stats)
    else:
        ratio, dynamic_adjustment = dict(COMPOSITION_DAILY), 'default'

    # ── 2. 약점 유형 목록 ──
    weakness_types = _get_weakness_types(user_stats)

    # ── 3. 오늘 본 단어/유형 ──
    today_seen = _build_today_seen(user_stats)

    # ── 4. 세션 구성 ──
    if type_ in ('daily', 'today'):
        raw = _compose_daily(pool, count, ratio)
    elif type_ in ('test', 'exam'):
        raw = _compose_test_exam(pool, count)
    elif type_ == 'quick':
        raw = _compose_quick(pool, count)
    else:
        # 알 수 없는 타입은 daily로 폴백
        raw = _compose_daily(pool, count, ratio)

    selected_items: List[CandidateItem] = raw['items']
    composition: Dict[str, int] = raw['composition']

    # ── 5. 인터리빙 (음성/형태소 유사 단어 인접 회피) ──
    #    daily/today만 적용 (test/exam/quick은 우선순위 정렬을 해치지 않기 위해 스킵)
    if type_ in ('daily', 'today', 'quick') or type_ not in ('test', 'exam'):
        selected_items = interleave_avoid_adjacent(
            selected_items, lambda it: it.word
        )

    # ── 6. 하루 내 반복 강화 + 약점 유형 우선 suggested_question_type 부여 ──
    enriched = _apply_intra_day_and_weakness(
        selected_items, today_seen, weakness_types
    )

    composition_strategy = {
        'base': 'daily' if type_ in ('daily', 'today') else type_,
        'dynamic_adjustment': dynamic_adjustment,
        'weakness_types': weakness_types,
    }

    return {
        'composition': composition,
        'composition_strategy': composition_strategy,
        'items': selected_items,          # 기존 호환 유지 (CandidateItem 리스트)
        'enriched_items': enriched,       # Phase 2.2 신규
    }
