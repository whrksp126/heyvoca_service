"""
sentence_meaning.py — 문장 뜻 맞추기(sentenceTranslate) payload 생성 (이슈 #16).

정본: heyvoca_service/docs/LEVEL_AND_MEANING_CONTRACT.md §3

외국어(영어·일본어) 예문을 보여 주고, 한국어 번역 어절 조각을 순서대로 눌러 맞추게 한다.
  - 정답 조각: 한국어 번역을 어절(공백) 단위로 자른 것(문장부호 제거). 2~8어절 예문만.
  - 방해 조각 2~4개: 비슷한 수준(score ±15 우선)의 다른 예문 번역 어절. 정답 어절과 같은 글자이거나
    같은 어간(끝 조사 뗀 형태가 같거나 앞 두 글자가 같은 것)이면 제외 — 방해 조각이 정답 자리에
    들어가도 말이 되는 경우를 막는다(accepted 는 정답 어절로만 이뤄지므로 방해 조각은 항상 오답).
  - accepted: 원래 순서 + 마지막 어절(서술어) 앞의 '조사로 끝나는 성분'끼리만 자리를 바꾼 순서(최대 6개).
"""

import itertools
import random
import re
from typing import List, Optional, Sequence

_TAG_RE = re.compile(r'<[^>]+>')
_TARGET_RE = re.compile(r'<strong[^>]*class="target-word"[^>]*>(.*?)</strong\s*>', re.I | re.S)
_PUNCT_RE = re.compile(r'[^\w\s]', re.UNICODE)
_WS_RE = re.compile(r'\s+')

MIN_TILES, MAX_TILES = 2, 8
MAX_ACCEPTED = 6
_LEVEL_BAND = 15

# 어간 비교용 끝 조사(긴 것부터). '의' 는 관형격이라 성분 이동 판정(_MOVABLE)에서는 뺀다.
_JOSA = sorted(['에서는', '에게서', '으로는', '에서', '에게', '한테', '께서', '으로', '부터', '까지', '처럼',
                '보다', '이랑', '은', '는', '이', '가', '을', '를', '에', '로', '와', '과', '도', '만', '의', '랑'],
               key=len, reverse=True)
_MOVABLE = tuple(j for j in _JOSA if j != '의')


def plain_text(text: Optional[str]) -> str:
    return _WS_RE.sub(' ', _TAG_RE.sub('', text or '')).strip()


def ko_tiles(meaning: Optional[str]) -> List[str]:
    s = _PUNCT_RE.sub(' ', _TAG_RE.sub('', meaning or ''))
    return [w for w in _WS_RE.sub(' ', s).strip().split(' ') if w]


def meaning_usable(ex: dict) -> bool:
    if not ex or not plain_text(ex.get('origin')):
        return False
    n = len(ko_tiles(ex.get('meaning')))
    return MIN_TILES <= n <= MAX_TILES


def _stem(w: str) -> str:
    for j in _JOSA:
        if w.endswith(j) and len(w) > len(j):
            return w[:-len(j)]
    return w


def _conflicts(d: str, answer: Sequence[str]) -> bool:
    sd = _stem(d)
    for a in answer:
        sa = _stem(a)
        if d == a or sd == sa:
            return True
        if len(sd) >= 2 and len(sa) >= 2 and sd[:2] == sa[:2]:
            return True
        if len(sd) == 1 and len(sa) == 1 and sd == sa:
            return True
    return False


def accepted_orders(tiles: List[str]) -> List[List[str]]:
    """원래 순서 + 서술어 앞 조사 성분끼리 자리 바꾼 순서들."""
    orders = [list(tiles)]
    if len(tiles) < 3:
        return orders
    body, pred = tiles[:-1], tiles[-1]
    # 성분 = 조사로 끝나는 어절에서 끊은 연속 구간. 마지막 조사 성분 뒤 나머지(부사 등)는 고정.
    chunks, cur = [], []
    for w in body:
        cur.append(w)
        if w.endswith(_MOVABLE) and len(w) > 1:
            chunks.append(cur)
            cur = []
    tail = cur
    if len(chunks) < 2:
        return orders
    for perm in itertools.permutations(chunks):
        seq = [w for c in perm for w in c] + tail + [pred]
        if seq not in orders:
            orders.append(seq)
        if len(orders) >= MAX_ACCEPTED:
            break
    return orders


def pick_distractors(answer: List[str], pool: Sequence[tuple], score: Optional[int],
                     k: int, rng=None) -> List[str]:
    """pool: [(score|None, 번역문), ...] — 비슷한 수준을 먼저, 모자라면 나머지에서."""
    rng = rng or random
    near, far = [], []
    for s, text in pool:
        (near if (score is None or s is None or abs(s - score) <= _LEVEL_BAND) else far).append(text)
    out: List[str] = []
    for group in (near, far):
        cands = [w for t in group for w in ko_tiles(t)]
        rng.shuffle(cands)
        for w in cands:
            if len(out) >= k:
                return out
            if w in out or _conflicts(w, answer) or any(_stem(w) == _stem(o) for o in out):
                continue
            out.append(w)
    return out


def build_meaning_payload(ex: dict, *, lang: str, distractor_pool: Sequence[tuple],
                          rng=None) -> Optional[dict]:
    """example_pool 원소(ex) → 계약 §3 payload. 쓸 수 없으면 None."""
    if not meaning_usable(ex):
        return None
    rng = rng or random
    tiles = ko_tiles(ex.get('meaning'))
    meta = ex.get('meta') or {}
    score = meta.get('score')
    k = rng.choice([2, 3, 3, 4])
    distractors = pick_distractors(tiles, distractor_pool, score, k, rng)
    bank = tiles + distractors
    rng.shuffle(bank)
    origin = ex.get('origin') or ''
    payload = {
        'type':          'sentenceTranslate',
        'lang':          lang,
        'sentence':      plain_text(origin),
        'sentence_html': _TARGET_RE.sub(lambda m: '<b>' + _TAG_RE.sub('', m.group(1)) + '</b>', origin)
                         if _TARGET_RE.search(origin) else None,
        'example_hash':  ex.get('hash'),
        'tiles':         [{'id': f't{i}', 'text': t} for i, t in enumerate(bank)],
        'accepted':      accepted_orders(tiles),
        'translation':   plain_text(ex.get('meaning')),
        'cefr':          meta.get('cefr'),
        'score':         score,
    }
    if payload['sentence_html'] is not None:
        payload['sentence_html'] = _TAG_RE.sub(lambda m: m.group(0) if m.group(0) in ('<b>', '</b>') else '',
                                               payload['sentence_html'])
    if lang == 'ja' and ex.get('reading_tokens'):
        payload['reading_tokens'] = ex['reading_tokens']
    return payload
