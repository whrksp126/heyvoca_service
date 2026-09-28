"""
sentence_puzzle.py — 문장 조각 조립 문제(sentenceArrangePartial/sentenceArrange/
listenArrange) + 타이핑 빈칸(fillInTheBlankTyping) 공용 헬퍼.

정본 데이터: 사전 테이블 voca_example_puzzle(dict, models.VocaExamplePuzzle).
데이터는 scripts/import_example_puzzles.py 로 upsert된다. 계약 문서:
  heyvoca_service/docs/SENTENCE_QUESTIONS_CONTRACT.md

정규화 규칙(sentence_hash 계산의 단일 소스) — 데이터 생성 스크립트도 반드시 이 함수와
동일한 규칙을 써야 한다: 태그 제거 → 소문자 → 문장부호 제거 → 공백 하나로 축약.
사용자 단어장에 복사된 예문(원문 그대로 복사된 게 대부분)을 이 해시로 매칭해
puzzle을 찾는다 — voca_example.id로 직접 조인하지 않는 이유는 사용자 예문이
사전 example_id를 들고 있지 않기 때문(문자열 스냅샷).
"""

import hashlib
import random
import re
from typing import Dict, Iterable, List, Optional, Tuple

from app import db
from app.models.models import VocaExamplePuzzle

_TAG_RE = re.compile(r'<[^>]+>')
_PUNCT_RE = re.compile(r'[^\w\s]', re.UNICODE)
_WS_RE = re.compile(r'\s+')


def normalize_sentence_text(text: Optional[str]) -> str:
    """태그 제거 → 소문자 → 문장부호 제거 → 공백 하나로. sentence_hash 계산 전처리."""
    if not text:
        return ''
    s = _TAG_RE.sub('', str(text))
    s = s.lower()
    s = _PUNCT_RE.sub(' ', s)
    s = _WS_RE.sub(' ', s).strip()
    return s


def sentence_hash(text: Optional[str]) -> str:
    """정규화된 문장의 sha256 hex digest."""
    return hashlib.sha256(normalize_sentence_text(text).encode('utf-8')).hexdigest()


def load_puzzles_by_hashes(hashes: Iterable[str]) -> Dict[str, dict]:
    """sentence_hash 집합 → {sentence_hash: puzzle_dict} 배치 조회 (N+1 방지).

    같은 sentence_hash에 여러 example_id가 매칭될 수 있으나(중복 예문), 여기서는
    skip_reason이 없는 첫 행을 우선하고 없으면 가장 최근(updated_at) 행을 쓴다.
    """
    hashes = [h for h in set(hashes) if h]
    if not hashes:
        return {}
    rows = (
        db.session.query(VocaExamplePuzzle)
        .filter(VocaExamplePuzzle.sentence_hash.in_(hashes))
        .all()
    )
    result: Dict[str, dict] = {}
    for row in rows:
        h = row.sentence_hash
        existing = result.get(h)
        candidate = {
            'example_id':         row.example_id,
            'tokens':             row.tokens or [],
            'target_idx':         row.target_idx or [],
            'first_form':         row.first_form,
            'alt_orders':         row.alt_orders or [],
            'distractors':        row.distractors or [],
            'listen_distractors': row.listen_distractors or [],
            'skip_reason':        row.skip_reason,
        }
        if existing is None:
            result[h] = candidate
        elif existing.get('skip_reason') and not candidate.get('skip_reason'):
            result[h] = candidate
    return result


def puzzle_usable(puzzle: Optional[dict]) -> bool:
    """이 puzzle로 조립형 문제(sentenceArrangePartial/sentenceArrange/listenArrange)를
    출제할 수 있는지. skip_reason이 있거나 조각이 없으면 불가."""
    if not puzzle or puzzle.get('skip_reason'):
        return False
    tokens = puzzle.get('tokens') or []
    target_idx = puzzle.get('target_idx') or []
    return bool(tokens) and bool(target_idx)


def _first_form_case(tokens: List[str], first_form: Optional[str]) -> List[str]:
    """tokens[0]을 first_form(문장 중간 표기)로 치환한 사본 반환. 조각 뱅크 섞기 전
    "문장 맨 앞이라 대문자였을 뿐"인 조각이 힌트가 되지 않도록 하기 위함."""
    if not tokens:
        return tokens
    out = list(tokens)
    if first_form:
        out[0] = first_form
    return out


def _select_window(tokens: List[str], target_idx: List[int], size: int) -> Tuple[int, int]:
    """target_idx를 포함하는, 최대한 target을 가운데에 두는 [start, end) 윈도우 계산.

    2026-09 2차 보완: 예전에는 긴 문장(9토큰+)에서 sentenceArrange/listenArrange가
    "뒤쪽까지 최대한 포함"(앞부분만 prefix, suffix는 항상 빈 문자열)하는 방식을 썼는데,
    target이 문장 앞쪽에 있으면 윈도우가 target 포함을 위해 7보다 커질 수 있어 상한이
    깨졌다. 항상 target을 중심으로 창을 잡으면 필요할 때 접두부(prefix)·접미부
    (suffix) 양쪽을 다 고정 텍스트로 뺄 수 있어 창 크기(3~5/7)를 항상 지킬 수 있다
    (target 자체가 size보다 넓은 경우, 즉 목표 단어가 size개보다 많은 조각으로 이뤄진
    경우에만 예외적으로 확장한다 — 그 외에는 항상 size 그대로).
    """
    n = len(tokens)
    if not target_idx:
        t_start, t_end = 0, min(1, n)
    else:
        t_start, t_end = min(target_idx), max(target_idx) + 1

    size = max(size, t_end - t_start)  # target이 size보다 넓으면 그만큼만 확장
    size = min(size, n)

    extra = size - (t_end - t_start)
    start = t_start - extra // 2
    start = max(0, min(start, n - size))

    end = start + size
    # target이 윈도우를 벗어나면(드묾, 위 계산 오차 방지용 안전망) 확장
    if start > t_start:
        start = t_start
    if end < t_end:
        end = t_end
    return start, end


def _map_alt_orders_to_window(tokens: List[str], alt_orders: List[List[str]],
                               start: int, end: int) -> List[List[str]]:
    """alt_orders(전체 문장 재배열)를 윈도우 구간에 매핑한다.

    alt_order가 프리필된 접두부(tokens[:start])·접미부(tokens[end:])를 그대로 유지한
    채 윈도우 구간만 재배열한 경우에만 그 윈도우 슬라이스를 채택한다. 그렇지 않은
    (접두/접미부까지 바뀐) alt_order는 이 윈도우에 적용할 수 없어 건너뛴다.
    """
    mapped: List[List[str]] = []
    prefix, suffix = tokens[:start], tokens[end:]
    for order in alt_orders or []:
        if not isinstance(order, list) or len(order) != len(tokens):
            continue
        if order[:start] == prefix and order[end:] == suffix:
            window = order[start:end]
            if window not in mapped:
                mapped.append(window)
    return mapped


def _sample_distractors(pool: List[str], k: int, exclude: set) -> List[str]:
    candidates = [d for d in (pool or []) if d and d not in exclude]
    random.shuffle(candidates)
    return candidates[:k]


def build_arrange_payload(
    puzzle: dict,
    *,
    mode: str,          # 'partial' | 'full' | 'listen'
    example_origin: str = '',
    example_meaning: str = '',
) -> Optional[dict]:
    """sentenceArrangePartial(partial) / sentenceArrange(full) / listenArrange(listen)
    공통 조립 payload 빌더.

    Returns:
      {
        'bank':      [str, ...],           # 섞인 조각(윈도우 조각 + 방해 조각)
        'prefix':    str,                  # 윈도우 앞에 고정 표시할 텍스트(없으면 '')
        'suffix':    str,                  # 윈도우 뒤에 고정 표시할 텍스트(없으면 '')
        'accepted':  [[str, ...], ...],    # 정답으로 인정하는 윈도우 조각 시퀀스(들)
        'answer_text': str,                # 문장 전체(원문, 표시/하이라이트용)
        'ko':        str,                  # 한국어 해석(조립 프롬프트)
        'target_tokens_count': int,
      }
      puzzle이 사용 불가면 None.
    """
    if not puzzle_usable(puzzle):
        return None

    raw_tokens = puzzle.get('tokens') or []
    tokens = _first_form_case(raw_tokens, puzzle.get('first_form'))
    target_idx = puzzle.get('target_idx') or []
    n = len(tokens)

    if mode == 'partial':
        size = min(n, random.choice([3, 4, 5]))
        start, end = _select_window(tokens, target_idx, size)
        distractor_pool = puzzle.get('distractors') or []
        distractor_k = 1 if random.random() < 0.5 else 2
        alt_orders_full = puzzle.get('alt_orders') or []
    elif mode == 'full':
        if n <= 8:
            start, end = 0, n
        else:
            start, end = _select_window(tokens, target_idx, 7)
        distractor_pool = puzzle.get('distractors') or []
        distractor_k = random.choice([2, 3])
        alt_orders_full = puzzle.get('alt_orders') or []
    elif mode == 'listen':
        if n <= 8:
            start, end = 0, n
        else:
            start, end = _select_window(tokens, target_idx, 7)
        distractor_pool = puzzle.get('listen_distractors') or []
        distractor_k = random.choice([2, 3])
        alt_orders_full = []  # listenArrange는 원문 어순만 정답
    else:
        raise ValueError(f'알 수 없는 mode: {mode}')

    window_tokens = tokens[start:end]
    prefix = ' '.join(tokens[:start])
    suffix = ' '.join(tokens[end:])

    accepted = [window_tokens]
    if alt_orders_full:
        for mapped in _map_alt_orders_to_window(tokens, alt_orders_full, start, end):
            if mapped not in accepted:
                accepted.append(mapped)

    distractors = _sample_distractors(distractor_pool, distractor_k, exclude=set(window_tokens))
    bank = list(window_tokens) + distractors
    random.shuffle(bank)

    answer_text = example_origin or ' '.join(raw_tokens)

    return {
        'bank':                bank,
        'prefix':              prefix,
        'suffix':              suffix,
        'accepted':            accepted,
        'answer_text':         answer_text,
        'ko':                  example_meaning,
        'target_tokens_count': len(target_idx),
    }
