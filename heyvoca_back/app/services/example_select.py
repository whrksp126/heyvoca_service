"""
example_select.py — "매번 새 문장" 예문 선택 단일 소스 (2026-09-30).

정본: heyvoca_service/docs/FRESH_SENTENCE_CONTRACT.md §3

`choose_example(item, question_type, ctx)` 하나가 fillInTheBlank/fillInTheBlankTyping/
sentenceArrangePartial/sentenceArrange/listenArrange 5종 전부의 예문 후보(`item.example_pool`,
pool.py가 채움)에서 문제 유형에 맞는 예문 하나를 고른다. 기존에 흩어져 있던 세 선택
지점(프론트 랜덤, fill_blank_typing 첫 예문, sentence_puzzle 첫 usable 퍼즐)을 대체한다.

점수는 낮을수록 우선 선택된다:
  - 최근성: 이번 응답에서 이미 쓴 hash는 후보에서 제외. 최근 30일 내 본 문장은 벌점
    (최근에 볼수록 벌점 큼, 오래전일수록 작음). 한 번도 안 본 문장이 항상 최우선(0점).
  - 수준 적합: |example.level - target_level| 에 비례한 벌점. meta 없는 예문(사용자 직접
    입력)은 target_level과 같다고 보아 벌점 0.
  - 아는 단어 비율: meta.words 중 아는 단어 비율이 높을수록 가점(감점). words가 비면 중립.
  - 동점은 무작위.

한 단어가 한 응답에서 여러 문제 유형으로 나가도(plant question_payloads) 서로 다른 문장이
나오는 이유는 `ctx.used_hashes`가 응답 전체에서 공유·누적되기 때문이다 — 호출부가 같은
SelectionContext를 계속 재사용해야 한다.
"""

import datetime as dt
import random
from dataclasses import dataclass, field
from typing import Optional

from app.utils.example_tagging import example_has_target_tag
from app.services.sentence_puzzle import puzzle_usable

# 예문 후보에 요구되는 자격(계약 §3-1).
_TEXT_TYPES = ('fillInTheBlank', 'fillInTheBlankTyping')
_ARRANGE_TYPES = ('sentenceArrangePartial', 'sentenceArrange', 'listenArrange')

RECENCY_WINDOW_DAYS = 30
# 벌점 가중치 — 최근성이 가장 크게, 수준 적합이 다음, 아는 단어 비율이 보조 신호.
_RECENCY_WEIGHT = 100.0
_LEVEL_WEIGHT = 20.0
_KNOWN_WEIGHT = 5.0

# 작물 단계(crop_stage) → 목표 예문 수준(1~3). sprout는 1~2 중 매 호출마다 무작위로
# 흔들어 다양성을 준다(계약 §3-2 "sprout → 1~2").
_STAGE_TARGET_LEVEL = {
    'unlearned': 1,
    'seed':      1,
    'leaf':      2,
    'carrot':    3,
}


@dataclass
class SelectionContext:
    """한 API 응답(요청) 동안 공유되는 선택 컨텍스트.

    같은 응답 안에서 여러 단어/여러 문제 유형에 대해 choose_example()을 반복 호출할 때
    이 객체 하나를 계속 넘겨야 한다 — used_hashes가 그 안에서 누적된다.
    """
    recent_seen:   dict = field(default_factory=dict)   # {user_voca_id: {hash: datetime}}
    known_words:   set = field(default_factory=set)      # {lowercase lemma, ...}
    user_level_id: Optional[int] = None                  # User.level_id (1~4), None이면 보정 없음
    now:           dt.datetime = field(default_factory=dt.datetime.utcnow)
    used_hashes:   set = field(default_factory=set)       # 이번 응답에서 이미 선택된 hash
    rng:           Optional[random.Random] = None
    # 새 씨앗 심기(mode=plant) 전용 — 쉬운 예문(짧고 수준 1, 희귀어 적음)을 우선 고른다.
    easy:          bool = False


def build_selection_context(user_id, user_voca_ids, *, user_level_id=None, lang='en',
                             now=None, rng=None, easy=False) -> SelectionContext:
    """pool.py의 배치 조회 두 개를 묶어 SelectionContext를 만드는 편의 함수.

    study.py 등 호출부는 세션 구성(compose) 직후, 실제로 뽑힌 user_voca_id들만으로
    이걸 한 번 호출해 재사용하면 된다(전체 풀이 아니라 이번 응답에 나갈 단어만).
    """
    from app.services.recommend.pool import load_recent_example_hashes, load_known_words

    recent_seen = load_recent_example_hashes(user_id, user_voca_ids, window_days=RECENCY_WINDOW_DAYS)
    known_words = load_known_words(user_id, lang=lang)
    return SelectionContext(
        recent_seen=recent_seen,
        known_words=known_words,
        user_level_id=user_level_id,
        now=now or dt.datetime.utcnow(),
        rng=rng,
        easy=easy,
    )


def _target_level_for_item(item, user_level_id: Optional[int]) -> int:
    """작물 단계 + User.level_id 보정 → 목표 예문 수준(1~3)."""
    from app.services.recommend.stage import crop_stage

    stage = crop_stage(item.fsrs_state)
    if stage == 'sprout':
        rng = random.Random()
        target = rng.choice([1, 2])
    else:
        target = _STAGE_TARGET_LEVEL.get(stage, 1)

    if user_level_id == 1:
        target = max(1, target - 1)
    elif user_level_id == 4:
        target = min(3, target + 1)
    return target


def _eligible(ex: dict, question_type: str) -> bool:
    if question_type in _TEXT_TYPES:
        return example_has_target_tag(ex.get('origin')) and bool((ex.get('meaning') or '').strip())
    if question_type in _ARRANGE_TYPES:
        return puzzle_usable(ex.get('puzzle'))
    return False


def _recency_penalty(last_seen: Optional[dt.datetime], now: dt.datetime) -> float:
    """최근에 볼수록 큰 벌점, 오래전일수록 작은 벌점(둘 다 0보다 큼). 한 번도 안 봤으면 0."""
    if last_seen is None:
        return 0.0
    days_ago = (now - last_seen).total_seconds() / 86400.0
    days_ago = max(0.0, min(days_ago, RECENCY_WINDOW_DAYS))
    recency_factor = (RECENCY_WINDOW_DAYS - days_ago) / RECENCY_WINDOW_DAYS  # 0(오래전)~1(방금)
    # 0.01 바닥을 둬 "30일 전에 본 것"도 "한 번도 안 본 것"(0점)보다는 항상 벌점이 크게 유지된다.
    return _RECENCY_WEIGHT * (0.01 + recency_factor * 0.99)


def _known_word_ratio(words: list, known_words: set) -> Optional[float]:
    if not words:
        return None
    known = sum(1 for w in words if (w or '').strip().lower() in known_words)
    return known / len(words)


def _score(ex: dict, item, question_type: str, ctx: SelectionContext, target_level: int) -> float:
    score = 0.0

    recent_for_word = ctx.recent_seen.get(item.user_voca_id) or {}
    score += _recency_penalty(recent_for_word.get(ex.get('hash')), ctx.now)

    meta = ex.get('meta') or {}
    level = meta.get('level', target_level)
    score += abs(level - target_level) * _LEVEL_WEIGHT

    ratio = _known_word_ratio(meta.get('words') or [], ctx.known_words)
    if ratio is not None:
        score -= ratio * _KNOWN_WEIGHT

    return score


# ── plant(쉬운 예문 우선) ───────────────────────────────────────────────
# 난이도 = 단어 수 + 3*희귀어 수 + 5*(level-1). 낮을수록 쉽다. 아래 상한 이하가 '쉬운 후보군'이고,
# 한 후보도 없으면 가장 쉬운 몇 개로 완화한다. 후보군 안에서는 점수 근사치(_EASY_JITTER) 이내를
# 전부 같은 후보로 보고 무작위로 뽑아 매번 같은 문장으로 고정되지 않게 한다.
_EASY_MAX_WORDS_TEXT = 9      # 빈칸/빈칸 입력
_EASY_MAX_WORDS_ARRANGE = 8   # 조각 조립(조각 수) — build_arrange_payload full 모드가 통째로 내는 상한과 같다
_EASY_MAX_RARE = 1
_EASY_JITTER = 3.0
_EASY_FALLBACK_K = 3


def _word_count(ex: dict, question_type: str) -> int:
    if question_type in _ARRANGE_TYPES:
        toks = (ex.get('puzzle') or {}).get('tokens') or []
        if toks:
            return len(toks)
    meta = ex.get('meta') or {}
    if meta.get('word_count'):
        return int(meta['word_count'])
    from app.services.sentence_puzzle import normalize_sentence_text
    return len(normalize_sentence_text(ex.get('origin')).split())


def _difficulty(ex: dict, question_type: str) -> float:
    meta = ex.get('meta') or {}
    level = meta.get('level') or 1
    rare = meta.get('rare_count') or 0
    return _word_count(ex, question_type) + 3 * rare + 5 * (level - 1)


def _is_easy(ex: dict, question_type: str) -> bool:
    meta = ex.get('meta') or {}
    limit = _EASY_MAX_WORDS_ARRANGE if question_type in _ARRANGE_TYPES else _EASY_MAX_WORDS_TEXT
    if _word_count(ex, question_type) > limit:
        return False
    if (meta.get('rare_count') or 0) > _EASY_MAX_RARE:
        return False
    return (meta.get('level') or 1) <= 1


def _easy_subset(candidates: list, question_type: str) -> list:
    easy = [ex for ex in candidates if _is_easy(ex, question_type)]
    if easy:
        return easy
    ranked = sorted(candidates, key=lambda ex: _difficulty(ex, question_type))
    return ranked[:_EASY_FALLBACK_K]


def choose_example(item, question_type: str, ctx: SelectionContext) -> Optional[dict]:
    """item.example_pool에서 question_type에 맞는 예문 하나를 고른다.

    반환값은 example_pool의 원소 그대로({'origin','meaning','hash','puzzle','meta','source'}).
    후보가 없으면(자격 있는 예문이 하나도 없거나 전부 이번 응답에서 이미 씀) None.
    선택 성공 시 ctx.used_hashes에 그 hash를 더한다(다음 호출이 같은 문장을 다시 고르지
    않도록 — 같은 단어의 다른 문제 유형뿐 아니라 이번 응답 전체에 적용).
    """
    pool = item.example_pool or []
    candidates = [ex for ex in pool if _eligible(ex, question_type) and ex.get('hash') not in ctx.used_hashes]
    if ctx.easy and question_type in _ARRANGE_TYPES:
        # plant 문장 만들기: 신규 단어이므로 사용자 보유 단어장 복사본이 아니라 우리 사전의
        # 쉬운 예문(+조각 데이터가 있는 것)만. 없으면 후보 없음 → payload 생략.
        candidates = [ex for ex in candidates if ex.get('source') == 'dict']
    if not candidates:
        return None

    if ctx.easy:
        candidates = _easy_subset(candidates, question_type)
        target_level = 1
    else:
        target_level = _target_level_for_item(item, ctx.user_level_id)
    scored = [(_score(ex, item, question_type, ctx, target_level), ex) for ex in candidates]
    min_score = min(s for s, _ in scored)
    tol = _EASY_JITTER if ctx.easy else 1e-9
    best = [ex for s, ex in scored if s - min_score < tol]

    rng = ctx.rng or random
    chosen = rng.choice(best)
    ctx.used_hashes.add(chosen.get('hash'))
    return chosen
