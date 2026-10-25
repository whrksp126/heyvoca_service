"""
sentence_meaning.py — 문장 뜻 맞추기(sentenceTranslate) payload 생성 (이슈 #16).

정본: heyvoca_service/docs/LEVEL_AND_MEANING_CONTRACT.md §3

외국어(영어·일본어) 예문을 보여 주고, 한국어 번역 어절 조각을 순서대로 눌러 맞추게 한다.
  - 정답 조각: 한국어 번역을 어절(공백) 단위로 자른 것(문장부호 제거). 2~12어절 예문.
    맞출 부분이 8어절 또는 자리 바꿀 수 있는 성분 묶음 4개를 넘으면 앞쪽 묶음부터 미리 채워(`prefix`,
    트레이 앞에 고정 표시) 뒤쪽만 남긴다 — 한국어는 서술어가 끝에 오므로 뜻의 핵심이 뒤에 남는다.
  - 방해 조각 2~4개: 비슷한 수준(score ±15 우선)의 다른 예문 번역 어절. 정답 어절과 같은 글자이거나
    같은 어간(끝 조사 뗀 형태가 같거나 앞 두 글자가 같은 것)이면 제외 — 방해 조각이 정답 자리에
    들어가도 말이 되는 경우를 막는다(accepted 는 정답 어절로만 이뤄지므로 방해 조각은 항상 오답).
  - accepted: 원래 순서 + 서술어 앞 '성분 묶음'끼리 자리를 바꾼 모든 순서(QA 3차 2026-10-25, 최대 4! = 24개).
    한국어는 서술어만 끝에 있으면 성분 순서가 자유롭다. 묶음 규칙(chunk_tiles):
      · 관형어(-의, 관형형 -는/-은/-던/-ㄹ/-을 …)는 꾸미는 다음 어절과 한 묶음.
      · 조사 없는 명사 + 의존명사/후치 어절(동안·때·후·전·중·수·것·앞·위·사이·처럼 …)은 한 묶음.
      · 조사로 끝나는 어절, 시간 후치 어절(…동안), 독립 부사(보통·오늘·함께 …)에서 묶음이 끝난다.
      · 서술어(마지막 묶음, -고 있다·-어 보다 같은 보조용언 포함)는 끝 고정.
      · 연결 어미(-고·-서·-면·-지만 …)로 끝나는 어절까지는 종속절이라 원래 순서로 고정.
    판정은 서버가 accepted 를 전부 만들어 보내는 방식 — 구버전 클라이언트도 그대로 맞게 채점된다.
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
MAX_TILES_PREFILL = 12   # 이보다 길면 미리 채워도 너무 길어 쓰지 않는다
MAX_MOVABLE = 4         # 자리 바꿀 수 있는 묶음 상한(넘으면 앞 묶음을 prefix 로) → accepted ≤ 4! = 24
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
    return MIN_TILES <= n <= MAX_TILES_PREFILL


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


# ── 성분 묶음 (QA 3차 2026-10-25) ──
_HANGUL0 = 0xAC00
# 관형형으로 보는 '-는/-은/-을' 앞 글자(동사·형용사 어간 끝·시제 선어말).
_ADN_NEUN = set('하되있없않았었였겠')
_ADN_EUN = set('좋작많높같깊넓낮짧적싫찮옳굵얇늦젊맑밝붉검하되있없않았었였겠')
_ADN_EUL = _ADN_EUN | set('먹읽찾받입앉잃')
# '-ㄴ/-ㄹ' 받침 관형형의 어간 끝(받침 뺀 글자): 한·된·간·온·본·준·산·선·난·잔·탄·진·낸·쓴·큰·할·될·갈 …
_ADN_BASE = set('하되가오보주사서나자타지내쓰크')
_TIME_POST = {'동안', '때', '후', '전', '중', '뒤', '내내', '이후', '이전', '무렵', '도중', '만큼', '처럼',
              '대신', '쯤', '즈음', '때문', '덕분', '뿐'}
_BIND_POST = {'수', '것', '거', '줄', '적', '데', '바', '채', '척', '듯', '리', '앞', '위', '아래', '밖', '옆',
              '사이', '근처', '속', '쪽'}
_POST = _TIME_POST | _BIND_POST
_ADVERBS = {'오늘', '내일', '어제', '매일', '매주', '매년', '요즘', '항상', '자주', '가끔', '보통', '늘', '이미',
            '벌써', '아직', '곧', '지금', '이제', '다시', '또', '함께', '같이', '모두', '결국', '먼저', '갑자기',
            '천천히', '빨리', '열심히', '일찍', '늦게', '주로', '원래', '계속', '오래', '그냥', '아까'}
_CONNECTIVE = ('면서', '니까', '지만', '는데', '은데', '도록', '려고', '다가', '어도', '아도', '해도', '라도',
               '자마자', '거나', '든지', '듯이', '고', '서', '면', '며', '데', '러')
_AUX_PREV = ('고', '게', '지', '아', '어', '여', '해', '워', '줘', '봐', '둬')
_AUX_HEAD = ('있', '없', '않', '못하', '못했', '버리', '버렸', '주', '줬', '보', '봤', '싶', '하', '했', '한',
             '할', '해', '되', '됐', '된', '될', '놓', '두', '뒀', '가', '갔', '오', '왔', '계', '말')


def _final(ch: str) -> int:
    """한글 음절의 받침 번호(0 = 없음, 4 = ㄴ, 8 = ㄹ). 한글이 아니면 -1."""
    o = ord(ch) - _HANGUL0
    return o % 28 if 0 <= o < 11172 else -1


def _base(ch: str) -> str:
    o = ord(ch) - _HANGUL0
    return chr(_HANGUL0 + o - o % 28) if 0 <= o < 11172 else ch


def _has_josa(w: str) -> bool:
    return len(w) > 1 and w.endswith(_MOVABLE)


def _nl_final(w: str) -> bool:
    """ㄴ/ㄹ 받침으로 끝나는가(관형형 후보: -는/-은/-을/-ㄴ/-ㄹ)."""
    return bool(w) and _final(w[-1]) in (4, 8)


def _adnominal(w: str) -> bool:
    """뒤 명사를 꾸미는 관형어인가(-의 / 관형형 어미)."""
    if len(w) < 2:
        return False
    last, pre = w[-1], w[-2]
    if last == '의' or last == '던':
        return True
    if last == '는':
        return pre in _ADN_NEUN
    if last == '은':
        return pre in _ADN_EUN
    if last == '을':
        return pre in _ADN_EUL
    if last in ('를', '란', '만', '엔'):
        return False
    return _final(last) in (4, 8) and _base(last) in _ADN_BASE


def _is_post(w: Optional[str]) -> bool:
    return bool(w) and w not in ('안', '못') and (w in _POST or _stem(w) in _POST)


def _link(w: str, nxt: str, cur_len: int, next_is_last: bool) -> str:
    """w 와 다음 어절의 관계: 'bind'(같은 묶음) | 'end'(묶음 끝) | 'clause'(종속절 끝 — 앞을 고정)."""
    if next_is_last and nxt.startswith(_AUX_HEAD) and w.endswith(_AUX_PREV) and not _has_josa(w):
        return 'bind'                                   # 보조용언: 먹고 있다 / 해야 한다 / 먹지 않았다
    if _is_post(nxt) and (not _has_josa(w) or _nl_final(w)):
        return 'bind'                                   # 정전 동안 / 먹을 수 / 떠난 후
    if _adnominal(w):
        return 'bind'                                   # 엘리베이터의 키패드가 / 작동하는 기계
    if cur_len >= 2 and (w in _TIME_POST or _stem(w) in _TIME_POST):
        return 'end'                                    # [정전 동안] — 시간 후치 어절이 묶음을 닫는다
    if _has_josa(w) or w in _ADVERBS:
        return 'end'
    if len(w) > 1 and w.endswith(_CONNECTIVE):
        return 'clause'
    return 'bind'                                       # 조사 없는 명사·부사는 다음 어절에 붙는다


def chunk_tiles(tiles: List[str]):
    """어절 → (fixed 묶음들, movable 묶음들, 서술어 묶음). fixed 는 앞쪽 종속절(원래 순서 고정)."""
    chunks: List[List[str]] = []
    fixed_n = 0
    cur: List[str] = []
    n = len(tiles)
    for i, w in enumerate(tiles):
        cur.append(w)
        if i == n - 1:
            break
        kind = _link(w, tiles[i + 1], len(cur), i + 1 == n - 1)
        if kind == 'bind':
            continue
        chunks.append(cur)
        cur = []
        if kind == 'clause':
            fixed_n = len(chunks)
    pred = cur
    return chunks[:fixed_n], chunks[fixed_n:], pred


def split_prefix(all_tiles: List[str]):
    """미리 채울 앞부분(head)과 맞출 부분(tiles). 묶음 경계에서만 자른다.
    맞출 부분이 MAX_TILES 어절 이하이고 자리 바꿀 묶음이 MAX_MOVABLE 개 이하가 될 때까지 앞 묶음을 뗀다."""
    fixed, movable, pred = chunk_tiles(all_tiles)
    lead = [(c, True) for c in fixed] + [(c, False) for c in movable]
    head: List[str] = []
    while lead:
        rest_tiles = sum(len(c) for c, _ in lead) + len(pred)
        n_mov = sum(1 for _, f in lead if not f)
        if rest_tiles <= MAX_TILES and n_mov <= MAX_MOVABLE:
            break
        c, _ = lead.pop(0)
        head += c
    return head, all_tiles[len(head):]


def accepted_orders(tiles: List[str]) -> List[List[str]]:
    """원래 순서 + 서술어 앞 성분 묶음끼리 자리를 바꾼 모든 순서(원래 순서가 맨 앞)."""
    orders = [list(tiles)]
    fixed, movable, pred = chunk_tiles(tiles)
    if len(movable) < 2:
        return orders
    head = [w for c in fixed for w in c]
    if len(movable) > MAX_MOVABLE:          # split_prefix 를 거치면 오지 않는다 — 앞 묶음은 고정
        head += [w for c in movable[:-MAX_MOVABLE] for w in c]
        movable = movable[-MAX_MOVABLE:]
    for perm in itertools.permutations(movable):
        seq = head + [w for c in perm for w in c] + pred
        if seq not in orders:
            orders.append(seq)
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
    all_tiles = ko_tiles(ex.get('meaning'))
    head, tiles = split_prefix(all_tiles)
    if len(tiles) < MIN_TILES:
        return None
    meta = ex.get('meta') or {}
    score = meta.get('score')
    k = rng.choice([2, 3, 3, 4])
    distractors = pick_distractors(all_tiles, distractor_pool, score, k, rng)
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
        'prefix':        ' '.join(head),   # 미리 채운 앞부분(없으면 ''). 채점은 tiles/accepted 부분만.
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
