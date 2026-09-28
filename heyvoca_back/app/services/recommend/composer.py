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
    rank_new, compute_priority, weighted_sample_without_replacement,
)
from app.utils.interleave import interleave_avoid_adjacent
from app.utils.example_tagging import example_has_target_tag, example_origin_text, example_meaning_text
from app.constants.question_types import (
    RECOMMENDABLE_QUESTION_TYPES, QUESTION_TYPE_TIER, TIER_QUESTION_TYPES, CROP_STAGE_MAX_TIER,
)
from app.services.recommend.stage import crop_stage as _crop_stage

# ──────────────────────────────────────────────
# 상수
# ──────────────────────────────────────────────

# 사용자 능력 평가 임계값 (recent_7d_total >= MIN_SAMPLES 일 때만 의미 있음)
_LEVEL_MIN_SAMPLES   = 20
_LEVEL_HIGH_RATE     = 0.85
_LEVEL_LOW_RATE      = 0.60

# 다양성: 같은 bucket이 연속해서 나오지 않게 인터리빙 적용

# bucket(= reason 라벨)별 사용자 표시용 문구.
# 2026-09 재설계: short/medium/long은 더 이상 개별 규칙으로 정렬되지 않고(단일
# priority 큐, ranking.compute_priority) 전부 "연습 간격(I)에 도달"이라는 같은 근거로
# 뽑히므로 문구도 하나로 통일한다.
_BUCKET_REASON: Dict[str, str] = {
    'lapse':   '방금 틀린 단어예요',
    'overdue': '복습 시점이 지났어요',
    'today':   '오늘 복습 예정이에요',
    'short':   '다시 볼 때가 됐어요',
    'medium':  '다시 볼 때가 됐어요',
    'long':    '다시 볼 때가 됐어요',
    'new':     '',          # 'new'는 프론트가 NEW 칩으로 별도 표시
}

# 지원 question_type 목록 — 단일 소스는 app/constants/question_types.py
# (그쪽에 /study/log 화이트리스트도 같이 정의돼 있어 새 유형 추가 시 두 곳이 어긋나지 않는다).
_ALL_QUESTION_TYPES = list(RECOMMENDABLE_QUESTION_TYPES)

# 유형 배정 가중치 (2026-09) — "리스트 순서대로 첫 지원 유형"이면 앞쪽 유형(multipleChoice)만
# 계속 뽑혀 뒤쪽 유형(특히 카드매칭류)이 사실상 노출되지 않는 문제가 있었다(약점이 없고
# avoid 회피 대상도 아닌 "오늘 처음 보는 단어"는 항상 순서 1번을 받았다). 이제 avoid를 뺀
# 지원 가능 유형 전체를 대상으로 가중치 비례 랜덤을 뽑는다.
# 가중치 근거: 사지선다 방향(단어→뜻 / 뜻→단어)을 주력으로 유지하되(각 25, 합 50/100),
# 듣기(15)도 꾸준히 섞이게 한다. fillInTheBlank(빈칸 채우기 한→영, 20)는 강조 태그가 있는
# 예문이 있는 단어에서만 후보가 되므로 실제 노출 빈도는 가중치보다 낮게 자연 감쇠한다.
# fillInTheBlankReverse는 프론트에서 드롭되어(2026-09) 추천 후보/가중치에서 제외했다
# (ALLOWED_QUESTION_TYPES에는 과거 로그 호환을 위해 남아 있음). cardMatch(10)/
# cardMatchListening(5)는 세트 단위 특성상 노출 체감이 더 크게 느껴져 낮게 유지한다. 합계 100.
#
# 2026-09 "출제형 문제 1단계" 추가분(sentenceArrangePartial/sentenceArrange/listenArrange/
# fillInTheBlankTyping) — 이 가중치 테이블은 full_recommend=False 경로(target_states로
# 암기상태를 좁힌 "빠른 복습" 등)에서만 쓰인다. full_recommend=True(AI 추천) 경로는
# _assign_tiered_question_type 의 tier 기반 배정으로 대체되어 이 가중치를 쓰지 않는다
# (README: 난이도 오르내리기 규칙은 계약 문서 SENTENCE_QUESTIONS_CONTRACT.md 참고).
# 새 4종은 puzzle 데이터가 있는 단어에서만 실제로 후보가 되므로(_item_can_use_question_type)
# 노출 빈도는 가중치보다 자연히 낮다 — 상대적으로 낮은 값으로 추가한다.
_QUESTION_TYPE_WEIGHTS: Dict[str, int] = {
    'multipleChoice':          25,
    'reverseMultipleChoice':   25,
    'multipleChoiceListening': 15,
    'fillInTheBlank':          20,
    'cardMatch':               10,
    'cardMatchListening':      5,
    'sentenceArrangePartial':  6,
    'sentenceArrange':         5,
    'listenArrange':           3,
    'fillInTheBlankTyping':    3,
}

# ──────────────────────────────────────────────
# 단일 priority 큐 선택 파라미터 (2026-09 재설계)
# ──────────────────────────────────────────────
#
# 옛 "연속 정답 3회 && 24h 이내 → 아는 단어 제외"(_extract_known_words) 규칙과 그로 인해
# 필요했던 "6b 빈 세션 리필"은 없앴다 — prod 실측상 활발한 사용자는 대부분의 후보가
# 이 규칙에 걸려 제외되고, 리필이 그 방금 푼 단어를 다시 뽑는 원인이었다. 지금은
# ranking.compute_priority의 elapsed/I 값이 방금 학습한 단어를 자연히 순위 맨 뒤로
# 미루므로(제외가 아니라 "뒤로 밀림") 별도 제외/리필 규칙이 필요 없다.

# priority 내림차순 상위 몇 배(* count) 범위 안에서 priority 가중 랜덤 샘플링할지.
# 매 세션 top-N이 고정 반복되는 걸 막으면서도 범위를 count의 배수로만 좁게 잡는다.
_PRIORITY_TOPN_MULTIPLIER = 2

# 이번 세션 후보 중 priority가 이 값 이상이면 "복습 시점 도달/경과"로 보고 신규 슬롯
# 결정의 '급함' 판정(urgent_count)에 센다 — 옛 lapse+overdue+today 합계에 대응.
_URGENT_PRIORITY_THRESHOLD = 1.0

# DONE 상태(급한 단어가 전혀 없음)에서 하루 신규 상한이 소진돼 있어도 세션당 최소
# 이만큼은 신규를 허용한다 — "급한 게 없는데 새 단어도 하나도 안 나온다"는 체감을 막는다.
_DONE_NEW_MIN_QUOTA   = 4
# DONE 신규 쿼터의 절대 상한 비율(사용자 레벨 가중치와 무관하게 항상 이 비율로 캡).
_DONE_NEW_QUOTA_RATIO = 0.3


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
# 신규(unplanted) 단어 슬롯 결정 — 사용자 상태 기반 동적
# ──────────────────────────────────────────────

def _new_word_weight(user_level: str) -> float:
    """사용자 레벨별 신규 단어 목표 비율(세션 count 대비)."""
    if user_level == 'high':
        return 0.55
    if user_level == 'low':
        return 0.10
    return 0.30  # mid


def _decide_new_quota(
    available_new: int,
    count: int,
    user_level: str,
    *,
    full_recommend: bool = False,
    new_allowance: Optional[int] = None,
    urgent_count: int = 0,
) -> int:
    """
    이번 세션에서 뽑을 신규(unplanted) 단어 수.

    옛 _decide_slot_quotas의 new bucket 처리를 그대로 축약했다 — bucket이 여러 개일
    필요가 없어졌으니(복습 대상은 이제 priority 큐 하나) new만 별도로 정한다.

    urgent_count: priority가 _URGENT_PRIORITY_THRESHOLD 이상인 후보 수(옛
    lapse+overdue+today 합계에 대응) — 0이면 "급한 게 전혀 없는 DONE 상태"로 보고
    하루 신규 상한이 소진돼 있어도 세션당 최소 _DONE_NEW_MIN_QUOTA개는 허용한다.
    """
    avail = max(0, available_new)

    if full_recommend and new_allowance is not None:
        if urgent_count == 0:
            avail = min(
                avail,
                max(new_allowance, _DONE_NEW_MIN_QUOTA),
                round(count * _DONE_NEW_QUOTA_RATIO),
            )
        else:
            avail = min(avail, max(0, new_allowance))

    target = round(count * _new_word_weight(user_level))
    return max(0, min(avail, target, count))


# ──────────────────────────────────────────────
# question_type 부여
# ──────────────────────────────────────────────

def _item_can_use_question_type(item: CandidateItem, qtype: str) -> bool:
    has_meanings = bool(item.meanings)
    has_examples = bool(item.examples)
    if qtype in ('multipleChoiceListening', 'cardMatchListening'):
        return has_meanings or has_examples
    if qtype == 'fillInTheBlank':
        # 한→영 빈칸: 영어(origin/legacy en) 예문 중 강조 태그가 있는 게 하나라도 있어야 한다.
        return any(
            example_has_target_tag(example_origin_text(ex)) for ex in (item.examples or [])
        )
    if qtype == 'fillInTheBlankReverse':
        # 영→한 빈칸: 뜻이 있어야 하고, 한국어(meaning/legacy ko) 예문 중 강조 태그가 있는 게
        # 하나라도 있어야 한다.
        return has_meanings and any(
            example_has_target_tag(example_meaning_text(ex)) for ex in (item.examples or [])
        )
    if qtype == 'fillInTheBlankTyping':
        # fillInTheBlank(사지선다)와 요구 조건이 같다 — 강조 태그가 있는 영어 예문 필요.
        return any(
            example_has_target_tag(example_origin_text(ex)) for ex in (item.examples or [])
        )
    if qtype in ('sentenceArrangePartial', 'sentenceArrange', 'listenArrange'):
        # 사전 테이블 voca_example_puzzle 매칭 결과(pool.py가 채운 example_puzzles)가
        # 하나라도 usable해야 한다. en 전용 — ja는 example_puzzles가 항상 비어 있다.
        from app.services.sentence_puzzle import puzzle_usable
        return any(puzzle_usable(p) for p in (item.example_puzzles or []))
    return has_meanings or has_examples


def _weighted_type_choice(candidates: List[str]) -> Optional[str]:
    """지원 가능 유형 후보에서 _QUESTION_TYPE_WEIGHTS 가중치 비례로 하나를 뽑는다.

    _ALL_QUESTION_TYPES 전체가 현재 가중치 풀에 있어 이 경로는 정상적으로는 타지 않지만,
    향후 가중치 없는 신규 유형이 추가될 경우를 대비한 안전망으로 남겨둔다 — 가중치 풀에
    없는 유형만 후보에 있으면 첫 번째를 그대로 쓴다("리스트 순서 우선" 폴백).
    """
    if not candidates:
        return None
    weighted = [qt for qt in candidates if _QUESTION_TYPE_WEIGHTS.get(qt, 0) > 0]
    if weighted:
        weights = [_QUESTION_TYPE_WEIGHTS[qt] for qt in weighted]
        return random.choices(weighted, weights=weights, k=1)[0]
    return candidates[0]


def _assign_suggested_question_type(
    item: CandidateItem,
    weakness_types: List[str],
    avoid_types: Optional[set],
) -> Optional[str]:
    """
    1. 약점 유형 우선 (이 단어가 지원하고 avoid에 없는 것)
    2. avoid를 뺀 지원 가능 유형 전체에서 가중 랜덤(_QUESTION_TYPE_WEIGHTS, _weighted_type_choice)
    3. 모든 유형이 회피 대상이면 avoid 무시하고 지원 가능한 유형 전체에서 다시 가중 랜덤
    """
    avoid = avoid_types or set()
    for wt in weakness_types:
        if wt not in avoid and _item_can_use_question_type(item, wt):
            return wt

    candidates = [qt for qt in _ALL_QUESTION_TYPES if qt not in avoid and _item_can_use_question_type(item, qt)]
    chosen = _weighted_type_choice(candidates)
    if chosen:
        return chosen

    # avoid를 전부 회피하면 후보가 하나도 안 남을 수 있다 — avoid 무시하고 다시 시도
    fallback_candidates = [qt for qt in _ALL_QUESTION_TYPES if _item_can_use_question_type(item, qt)]
    return _weighted_type_choice(fallback_candidates)


def _assign_restricted_question_type(
    item: CandidateItem,
    allowed_types: List[str],
    weakness_types: List[str],
    avoid_types: Optional[set],
) -> Optional[str]:
    """`question_types` 쿼리 파라미터로 유형을 특정 집합으로 좁힌 경우의 배정
    (2026-09 — "설정 시트에서 유형을 직접 고르면 그 유형만 나와야 한다").

    1. allowed_types 중 이 단어가 실제로 쓸 수 있는 것만 후보로 좁힌다.
    2. 후보가 하나도 없으면 None을 반환한다(2026-09 버그 수정 — 예전엔 여기서 기존
       전체 유형 가중치 배정(_assign_suggested_question_type)으로 완전 폴백해 사용자가
       고르지 않은 유형(사지선다 등)이 섞여 나왔다. compose()가 이제 allowed_types를
       하나도 못 쓰는 단어를 후보 풀 단계에서 이미 걸러내므로 이 분기는 정상 경로에서는
       도달하지 않는다 — 도달하더라도 선택 밖 유형을 배정하지 않는 안전망).
    3. 후보가 있으면: 약점 유형 우선(후보 안에서) → avoid 뺀 후보 가중 랜덤
       (_QUESTION_TYPE_WEIGHTS) → avoid 전부 회피 시 무시하고 후보 전체로 다시.
    """
    avoid = avoid_types or set()
    candidates = [qt for qt in allowed_types if _item_can_use_question_type(item, qt)]
    if not candidates:
        return None

    for wt in weakness_types:
        if wt in candidates and wt not in avoid:
            return wt

    not_avoided = [qt for qt in candidates if qt not in avoid]
    chosen = _weighted_type_choice(not_avoided)
    if chosen:
        return chosen

    # avoid를 전부 회피하면 후보가 하나도 안 남을 수 있다 — avoid 무시하고 다시 시도
    return _weighted_type_choice(candidates)


# ──────────────────────────────────────────────
# 난이도(tier) 기반 유형 배정 — AI 추천(full_recommend=True) 전용 (2026-09)
# ──────────────────────────────────────────────
#
# 계약/규칙 정본: heyvoca_service/docs/SENTENCE_QUESTIONS_CONTRACT.md
#
# item.tier_state: {'tier_target': int, 'tier_shown': int|None, 'was_correct': bool} 또는
# None(기록 없음). 정본은 UserVoca.tier_target/tier_shown/tier_correct 컬럼(사용자 DB) —
# pool.py가 매 요청 로드 시 그대로 담아준다. 2026-09 2차 보완: 예전에는 최근 7일
# UserStudyLog 윈도우에서 근사했는데, FSRS 간격상 상급 단어(carrot 등)는 복습 주기가
# 7일을 훌쩍 넘겨 "항상 처음 보는 단어"로 리셋되고 tier가 사실상 오르지 않는 버그가
# 있었다. UserVoca 컬럼은 로그 조회 없이 매번 최신값을 준다.

_TIER_EASIER_PROB = 0.30  # "정해진 난이도"보다 쉬운 tier에서 뽑을 확률


def _max_tier_for_item(item: CandidateItem) -> int:
    return CROP_STAGE_MAX_TIER.get(_crop_stage(item.fsrs_state), 1)


def _compute_target_tier(tier_state: Optional[dict], max_tier: int) -> int:
    """단어별 "정해진 난이도" 계산.

    - 기록이 없으면(처음) max_tier-1(최소 1).
    - 마지막 결과가 정답이고 보여준 tier == 정해진 tier면 +1.
    - 정답이지만 더 쉬운 tier를 보여줬으면 유지.
    - 오답이면 -1.
    - [1, max_tier]로 자른다(작물 단계가 승격되면 이전 세션의 target이 max_tier를 넘던
      값도 여기서 자연히 다시 잘린다).
    """
    if not tier_state or tier_state.get('tier_target') is None:
        return max(1, max_tier - 1)
    last_target = tier_state['tier_target']
    last_shown = tier_state.get('tier_shown')
    if last_shown is None:
        last_shown = last_target
    if tier_state.get('was_correct'):
        target = last_target + 1 if last_shown >= last_target else last_target
    else:
        target = last_target - 1
    return max(1, min(target, max_tier))


def _pick_shown_tier(target_tier: int) -> int:
    """70%는 target_tier 그대로, 30%는 그보다 쉬운 tier에서 균등 무작위."""
    if target_tier > 1 and random.random() < _TIER_EASIER_PROB:
        return random.randint(1, target_tier - 1)
    return target_tier


def _pick_type_at_tier(
    item: CandidateItem, tier: int, weakness_types: List[str], avoid: set,
) -> Optional[str]:
    """tier 안에서 이 단어가 지원하는 유형 중 하나를 고른다.
    약점 유형 우선 → avoid를 뺀 후보 중 균등 무작위(같은 tier 안에서는 가중치를 두지
    않아 자연히 유형이 번갈아 나온다) → avoid 무시 폴백.
    """
    candidates = [qt for qt in TIER_QUESTION_TYPES.get(tier, ()) if _item_can_use_question_type(item, qt)]
    if not candidates:
        return None
    for wt in weakness_types:
        if wt in candidates and wt not in avoid:
            return wt
    not_avoided = [qt for qt in candidates if qt not in avoid]
    return random.choice(not_avoided or candidates)


def _assign_tiered_question_type(
    item: CandidateItem,
    weakness_types: List[str],
    avoid_types: Optional[set],
) -> Tuple[Optional[str], int, Optional[int]]:
    """반환: (suggested_question_type, tier_target, tier_shown).

    해당 단어가 shown_tier의 어떤 유형도 못 쓰면(예: puzzle 데이터 없음) 가장 가까운
    낮은 tier로 내려가며 재시도한다("해당 단어가 그 유형을 못 쓰면 가장 가까운 낮은
    난이도로"). tier 1까지도 못 쓰면(이례적 — meanings/examples가 전혀 없는 단어)
    None을 반환한다.
    """
    avoid = avoid_types or set()
    max_tier = _max_tier_for_item(item)
    target_tier = _compute_target_tier(item.tier_state, max_tier)
    shown_tier = _pick_shown_tier(target_tier)

    tier = shown_tier
    chosen = None
    while tier >= 1:
        chosen = _pick_type_at_tier(item, tier, weakness_types, avoid)
        if chosen:
            break
        tier -= 1

    if chosen is None:
        # avoid를 전부 회피하면 후보가 하나도 안 남을 수 있다 — avoid 무시하고 다시 시도
        tier = shown_tier
        while tier >= 1:
            chosen = _pick_type_at_tier(item, tier, weakness_types, set())
            if chosen:
                break
            tier -= 1

    return chosen, target_tier, (tier if chosen else None)


def _enrich_items(
    items_with_bucket: List[Tuple[CandidateItem, str]],
    today_seen: Dict[int, set],
    weakness_types: List[str],
    *,
    full_recommend: bool = False,
    allowed_types: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """
    각 아이템에 suggested_question_type, reason을 부여한다.
    items_with_bucket: [(item, original_bucket), ...] — original_bucket은 reason 결정용

    우선순위:
      1. allowed_types(=`/study/recommend?question_types=` 지정, 2026-09)가 있으면
         tier 로직을 완전히 건너뛰고 _assign_restricted_question_type을 쓴다 —
         "설정 시트에서 유형을 직접 고르면 그 유형만 나와야 한다". tier_target/
         tier_shown은 항상 None(UserVoca의 tier 상태를 건드리지 않음).
      2. full_recommend=True(AI 추천)면 tier 기반 배정(_assign_tiered_question_type,
         단어별 tier 상태는 item.tier_state — pool.py가 UserVoca 컬럼에서 로드)을 쓰고
         결과 항목에 tier_target/tier_shown을 함께 채운다.
      3. 그 외(암기상태를 좁힌 "빠른 복습" 등)는 기존 가중치 배정을 그대로 쓰고
         tier_target/tier_shown은 None으로 둔다.
    """
    result = []
    for item, src_bucket in items_with_bucket:
        avoid = today_seen.get(item.user_voca_id, set())
        tier_target = None
        tier_shown = None
        if allowed_types:
            suggested = _assign_restricted_question_type(item, allowed_types, weakness_types, avoid)
        elif full_recommend:
            suggested, tier_target, tier_shown = _assign_tiered_question_type(
                item, weakness_types, avoid,
            )
        else:
            suggested = _assign_suggested_question_type(item, weakness_types, avoid)
        reason = _BUCKET_REASON.get(src_bucket, '')
        result.append({
            '_item': item,
            'src_bucket': src_bucket,                # lapse 재분류 반영
            'suggested_question_type': suggested,
            'reason': reason,
            'tier_target': tier_target,
            'tier_shown': tier_shown,
        })
    return result


# ──────────────────────────────────────────────
# 추천 / 랜덤 본체
# ──────────────────────────────────────────────

def _compose_recommend(
    pool: List[CandidateItem],
    count: int,
    user_stats: Optional[Dict],
    full_recommend: bool = False,
    new_allowance: Optional[int] = None,
    allowed_types: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    단일 priority 큐 기반 추천 (2026-09 재설계).

    학습 이력이 있는 모든 단어(bucket != 'new')를 ranking.compute_priority 하나로
    줄세운다 — "맞힌 단어는 뒤로, 틀린 단어는 앞으로"가 bucket 경계 없이 전체에서
    성립한다. 신규(unplanted) 단어만 별도로 관리(_decide_new_quota)한다.
    FSRS 스케줄 계산 자체(ratings/scheduler)는 그대로이며 여기서 바꾸는 건 순서뿐이다.
    """
    now = dt.datetime.utcnow()
    lapse_ids: Set[int] = set(user_stats.get('recent_lapse_voca_ids') or set()) if user_stats else set()
    today_seen: Dict[int, set] = _normalize_today_seen(user_stats)
    weakness_types = _extract_weakness_types(user_stats)
    user_level = _evaluate_user_level(user_stats)

    new_items  = [it for it in pool if it.bucket == 'new']
    rest_items = [it for it in pool if it.bucket != 'new']

    # 1. 단일 priority 산정 — 최근 틀린 단어(lapse_ids)는 큰 가산으로 항상 최상단.
    priority_by_id: Dict[int, float] = {
        it.user_voca_id: compute_priority(it, now, is_lapse=it.user_voca_id in lapse_ids)
        for it in rest_items
    }
    rest_sorted = sorted(rest_items, key=lambda it: priority_by_id[it.user_voca_id], reverse=True)

    # '급함'(복습 시점 도달/경과) 후보 수 — 옛 lapse+overdue+today 합계에 대응,
    # 신규 슬롯 결정(DONE 상태 판정)에만 쓰인다.
    urgent_count = sum(1 for p in priority_by_id.values() if p >= _URGENT_PRIORITY_THRESHOLD)

    # 2. 신규 단어 슬롯
    new_quota = _decide_new_quota(
        len(new_items), count, user_level,
        full_recommend=full_recommend, new_allowance=new_allowance, urgent_count=urgent_count,
    )
    new_ranked = rank_new(new_items)
    selected_new = new_ranked[:new_quota]

    # 3. 나머지는 priority 큐에서 — 상위 _PRIORITY_TOPN_MULTIPLIER*count 범위 안에서
    # priority 가중 랜덤 샘플링(top-N 고정 반복 방지).
    need_from_rest = max(0, count - len(selected_new))
    topn = rest_sorted[:min(len(rest_sorted), _PRIORITY_TOPN_MULTIPLIER * count)]
    selected_rest = weighted_sample_without_replacement(
        topn, now, need_from_rest,
        weight_fn=lambda it, _now: priority_by_id[it.user_voca_id],
    )

    selected: List[CandidateItem] = list(selected_new) + list(selected_rest)

    # 4. 상호 보충 — 한쪽이 부족하면 다른 쪽에서 채운다. "아는 단어 제외" 규칙이 없어져
    # 후보가 방금 학습한 단어뿐이어도(priority가 낮을 뿐 제외되지 않음) 여기 보충은
    # 순수히 "요청 count에 못 미치는 pool 크기" 케이스만 대응한다.
    if len(selected) < count:
        selected_ids = {it.user_voca_id for it in selected}
        extra_new = [it for it in new_ranked if it.user_voca_id not in selected_ids]
        selected += extra_new[:count - len(selected)]
    if len(selected) < count:
        selected_ids = {it.user_voca_id for it in selected}
        extra_rest = [it for it in rest_sorted if it.user_voca_id not in selected_ids]
        selected += extra_rest[:count - len(selected)]

    # 5. reason/구성 라벨 — item.bucket을 그대로 쓰되, 최근 틀린 단어는 'lapse'로 재분류
    # (옛 _split_pool과 동일 의미 — new는 학습 이력이 없어 lapse 대상이 아니다).
    def _reason_bucket(it: CandidateItem) -> str:
        if it.bucket != 'new' and it.user_voca_id in lapse_ids:
            return 'lapse'
        return it.bucket

    selected_with_bucket: List[Tuple[CandidateItem, str]] = [
        (it, _reason_bucket(it)) for it in selected
    ]

    # 6. 인터리빙 (음성/형태소 유사 단어 인접 회피)
    items_only = [it for it, _ in selected_with_bucket]
    interleaved = interleave_avoid_adjacent(items_only, lambda it: it.word)
    # 인터리빙 후 src_bucket 매핑 복원
    bucket_by_id = {it.user_voca_id: src for it, src in selected_with_bucket}
    final_with_bucket = [(it, bucket_by_id[it.user_voca_id]) for it in interleaved]

    # 7. enrich (suggested_question_type, reason)
    enriched = _enrich_items(
        final_with_bucket, today_seen, weakness_types,
        full_recommend=full_recommend, allowed_types=allowed_types,
    )

    composition: Dict[str, int] = {}
    for _, b in selected_with_bucket:
        composition[b] = composition.get(b, 0) + 1

    return {
        'composition': composition,
        'items': interleaved,
        'enriched_items': enriched,
        'user_level': user_level,
    }


def _compose_random(
    pool: List[CandidateItem], count: int, allowed_types: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    추천 알고리즘을 거치지 않는 단순 랜덤 추출.

    allowed_types(`question_types` 쿼리 파라미터)가 있으면 그 유형 안에서 배정한다
    (2026-09) — random 선택 모드에서도 "직접 고른 유형만" 규칙은 동일하게 지킨다.
    """
    shuffled = list(pool)
    random.shuffle(shuffled)
    selected = shuffled[:count]
    enriched = [
        {
            '_item': it, 'src_bucket': it.bucket,
            'suggested_question_type': (
                _assign_restricted_question_type(it, allowed_types, [], set()) if allowed_types else None
            ),
            'reason': '', 'tier_target': None, 'tier_shown': None,
        }
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
    full_recommend: bool = False,
    new_allowance: Optional[int] = None,
    allowed_types: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    pool에서 count개를 골라 세션을 구성해 반환한다.

    Args:
        pool:          CandidateItem 리스트 (build_candidate_pool 반환값)
        count:         선택할 단어 수 (1~50)
        selection:     'recommended' | 'random'
        user_stats:    사용자 통계 dict (recent_7d_correct_rate, weakness_types,
                       today_seen, recent_lapse_voca_ids 등)
        allowed_types: (선택) `/study/recommend?question_types=` 로 지정된 문제 유형
                       목록(2026-09). 있으면 tier 로직을 완전히 건너뛰고 이 유형들
                       중 각 단어가 쓸 수 있는 것으로만 배정한다(여러 개면 기존
                       가중치·연속 회피 로직 재사용). 이 경로에서는 tier_target/
                       tier_shown이 항상 None — UserVoca의 tier 상태를 건드리지 않는다.
                       하나도 못 쓰는 단어는 아예 이번 세션 후보에서 제외한다(2026-09
                       수정 — 예전엔 전체 유형 가중치로 폴백해 선택하지 않은 유형이
                       섞여 나오는 버그가 있었다).

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

    if allowed_types:
        # 버그 수정(2026-09): "설정 시트에서 유형을 직접 고르면 그 유형만 나와야 한다"를
        # 배정(enrich) 단계가 아니라 후보 선정 단계에서부터 보장한다. allowed_types 중
        # 단 하나도 못 쓰는 단어(예: puzzle 데이터 없는 단어에 "문장 만들기"만 지정)는
        # 아예 이번 세션 후보에서 뺀다 — _assign_restricted_question_type의 "완전 폴백"
        # (전체 유형 가중치 배정, 사지선다 포함)에 맡기지 않는다. 프론트는
        # word.suggestedQuestionType과 정확히 같은 유형에만 서버 question_payload를 쓸 수
        # 있어(출제형 4종), 완전 폴백으로 배정된 다른 유형은 결국 프론트에서 다시
        # multipleChoice로 떨어져 "선택하지 않은 유형이 나온다"는 버그로 이어졌다.
        pool = [it for it in pool if any(_item_can_use_question_type(it, qt) for qt in allowed_types)]
        if not pool:
            return {
                'composition':    {},
                'items':          [],
                'enriched_items': [],
                'user_level':     'mid',
            }

    if selection == 'random':
        return _compose_random(pool, count, allowed_types=allowed_types)
    return _compose_recommend(pool, count, user_stats, full_recommend, new_allowance, allowed_types=allowed_types)
