"""
meaning_pos.py — 뜻 문자열에 섞인 품사 약어 파싱 + 뜻별 품사(pos) 조회. 단일 소스.

배경(2026-11-19 회의 QA): 서점 단어장 뜻이 "환불; v. 환불하다" 처럼 품사 약어가 텍스트에 섞여
그대로 보였다. 품사는 데이터(voca_meaning.pos, UD 태그)로 두고, 화면은 [동사]/[명사] 라벨로 그린다.

  1) split_meaning_pos(text)   — "환불; v. 환불하다" → [("환불", None), ("환불하다", "VERB")]
                                  "[명] 서류" → [("서류", "NOUN")]
  2) clean_meaning_list(list)  — 뜻 입력 리스트(문자열 또는 {meaning,pos}) → (텍스트 리스트, {텍스트: pos})
                                  사용자 단어 추가/수정·가져오기·어드민 편집이 모두 이걸 거친다.
  3) load_dict_meaning_pos / attach_meaning_pos — 사용자 단어장에 복사된 뜻 문자열에 사전 pos 를 붙인다
                                  (meaning_concept 의 concept 조회와 같은 방식: voca_id 배치 → 정규화 텍스트 매칭).

규칙(보수적으로 — 오탐이 더 나쁘다):
  - 약어는 **뜻 조각(';' 로 나눈 단위)의 맨 앞**에 있을 때만 인정한다. 본문 중간 "책임(감)" 은 그대로.
  - 영문 약어: n. v. vt. vi. a. adj. ad. adv. prep. pron. conj. int. interj. aux. det. num. (대소문자 무시)
  - 한글 표기: [명] (명) [동사] (형용사) … 한 글자 표기는 뒤에 공백이 있어야 한다("(대)뇌반구" 는 그대로).
  - 약어가 붙은 조각부터 새 뜻으로 나눈다. 약어 없는 조각은 앞 뜻에 그대로 붙어 남는다
    ("형식; 서식; v. 형성하다" → "형식; 서식" / "형성하다"[VERB]).
"""

import json
import re
from typing import Iterable, Optional

# UD 품사 태그(voca_meaning.ck_voca_meaning_pos 와 같은 집합)
VALID_POS = ('NOUN', 'VERB', 'ADJ', 'ADV', 'PRON', 'DET', 'ADP', 'CCONJ', 'SCONJ',
             'NUM', 'INTJ', 'PART', 'AUX', 'PROPN', 'X')

_EN_ABBR = {
    'n': 'NOUN', 'noun': 'NOUN',
    'v': 'VERB', 'vt': 'VERB', 'vi': 'VERB', 'verb': 'VERB',
    'a': 'ADJ', 'adj': 'ADJ',
    'ad': 'ADV', 'adv': 'ADV',
    'prep': 'ADP',
    'pron': 'PRON',
    'conj': 'CCONJ',
    'int': 'INTJ', 'interj': 'INTJ',
    'aux': 'AUX',
    'det': 'DET',
    'num': 'NUM',
}
_KO_ABBR = {
    '명': 'NOUN', '명사': 'NOUN',
    '동': 'VERB', '동사': 'VERB',
    '형': 'ADJ', '형용사': 'ADJ',
    '부': 'ADV', '부사': 'ADV',
    '대': 'PRON', '대명사': 'PRON',
    '전': 'ADP', '전치사': 'ADP',
    '접': 'CCONJ', '접속사': 'CCONJ',
    '감': 'INTJ', '감탄사': 'INTJ',
    '조동사': 'AUX', '한정사': 'DET', '수사': 'NUM',
}

# "v. 환불하다" / "adj.대안의" — 약어 뒤가 영문자면(a.m. 등) 약어로 보지 않는다.
_EN_RE = re.compile(r'^(' + '|'.join(sorted(_EN_ABBR, key=len, reverse=True)) + r')\.(?![A-Za-z])\s*', re.I)
# "[명사] 서류" "(형용사)느긋한" — 두 글자 이상 정식 이름은 공백 없어도 인정
_KO_FULL_RE = re.compile(r'^[\[(（〔【]\s*(' + '|'.join(k for k in _KO_ABBR if len(k) >= 2) + r')\s*[\])）〕】]\s*')
# "[명] 서류" "(부) 시간제로" — 한 글자 표기는 뒤에 공백 필수("(대)뇌반구" 오탐 방지)
_KO_ONE_RE = re.compile(r'^[\[(（〔【]\s*(' + '|'.join(k for k in _KO_ABBR if len(k) == 1) + r')\s*[\])）〕】]\s+')


def _strip_marker(seg: str):
    """조각 맨 앞의 품사 표기 하나를 떼어 (나머지, pos|None) 반환."""
    s = seg.strip()
    for rx, table in ((_EN_RE, _EN_ABBR), (_KO_FULL_RE, _KO_ABBR), (_KO_ONE_RE, _KO_ABBR)):
        m = rx.match(s)
        if m:
            rest = s[m.end():].strip()
            if rest:
                return rest, table[m.group(1).lower() if table is _EN_ABBR else m.group(1)]
    return s, None


def split_meaning_pos(text) -> list:
    """뜻 문자열 하나 → [(뜻, pos|None), ...]. 품사 표기가 없으면 [(원문 strip, None)]."""
    if not isinstance(text, str):
        return []
    raw = text.strip()
    if not raw:
        return []
    groups = []  # [[parts], pos]
    for seg in re.split(r'\s*;\s*', raw):
        if not seg:
            continue
        rest, pos = _strip_marker(seg)
        if pos or not groups:
            groups.append([[rest], pos])
        else:
            groups[-1][0].append(rest)
    out = []
    for parts, pos in groups:
        t = '; '.join(p for p in parts if p).strip()
        if t:
            out.append((t, pos))
    return out or [(raw, None)]


def clean_meaning_list(meanings: Iterable) -> tuple:
    """뜻 입력 리스트 → (정리된 텍스트 리스트, {텍스트: pos}).

    원소는 문자열 또는 {'meaning'|'text': ..., 'pos': ...}. 명시된 pos(유효 태그)가 약어보다 우선.
    빈 뜻은 버리고, 같은 텍스트는 처음 것만 남긴다(순서 유지).
    """
    texts, pos_map = [], {}
    for m in meanings or []:
        given = None
        if isinstance(m, dict):
            given = m.get('pos') if m.get('pos') in VALID_POS else None
            m = m.get('meaning', m.get('text'))
        for i, (t, p) in enumerate(split_meaning_pos(m)):
            if p is None and i == 0 and given:
                p = given   # 명시 pos 는 첫 조각(약어 없는 원래 뜻)에만
            if t in texts:
                if p and t not in pos_map:
                    pos_map[t] = p
                continue
            texts.append(t)
            if p:
                pos_map[t] = p
    return texts, pos_map


def clean_meanings(meanings: Iterable) -> list:
    """텍스트만 필요할 때 — clean_meaning_list 의 첫 값."""
    return clean_meaning_list(meanings)[0]


def has_pos_marker(text) -> bool:
    parts = split_meaning_pos(text)
    return any(p for _, p in parts)


# ──────────────────────────────────────────────
# 사용자 단어의 명시 pos 저장(user_voca.meaning_pos JSON {텍스트: pos})
# ──────────────────────────────────────────────

def load_pos_json(s) -> dict:
    if not s:
        return {}
    try:
        d = json.loads(s)
    except (TypeError, ValueError):
        return {}
    return {k: v for k, v in d.items() if isinstance(k, str) and v in VALID_POS} if isinstance(d, dict) else {}


def merge_pos_json(existing, new_map: dict):
    """기존 JSON 문자열 + 새 {텍스트: pos} → 합친 JSON 문자열(비면 None). 새 값이 우선."""
    cur = load_pos_json(existing)
    for k, v in (new_map or {}).items():
        if v in VALID_POS:
            cur[k] = v
    return json.dumps(cur, ensure_ascii=False) if cur else None


# ──────────────────────────────────────────────
# 사전 pos 배치 조회 → 사용자 뜻 문자열에 붙이기
# ──────────────────────────────────────────────

def load_dict_meaning_pos(voca_ids: Iterable[Optional[int]]) -> dict:
    """사전 voca_id 집합 → {voca_id: {normalize_meaning(뜻): pos}}. 1쿼리(청크). ja 는 {}."""
    from app import db
    from app.models.models import VocaMeaning, VocaMeaningMap
    from app.utils.dict_lang import get_dict_lang
    from app.services.meaning_concept import normalize_meaning
    if get_dict_lang() == 'ja':
        return {}
    ids = sorted({int(v) for v in voca_ids if v is not None})
    result = {}
    for i in range(0, len(ids), 1000):
        chunk = ids[i:i + 1000]
        rows = (
            db.session.query(VocaMeaningMap.voca_id, VocaMeaning.meaning, VocaMeaning.pos)
            .join(VocaMeaning, VocaMeaningMap.meaning_id == VocaMeaning.id)
            .filter(VocaMeaningMap.voca_id.in_(chunk), VocaMeaning.pos.isnot(None))
            .order_by(VocaMeaning.id)
            .all()
        )
        for voca_id, meaning, pos in rows:
            if pos == 'X':
                continue
            result.setdefault(voca_id, {}).setdefault(normalize_meaning(meaning or ''), pos)
    return result


def attach_meaning_pos(voca_id: Optional[int], meanings: Iterable, lookup: dict, explicit=None) -> list:
    """뜻 리스트와 같은 순서/길이의 pos 리스트(모르면 None).

    우선순위: 사용자 명시 pos(user_voca.meaning_pos) → 사전 같은 단어의 같은 뜻 pos.
    explicit 는 dict 또는 JSON 문자열.
    """
    from app.services.meaning_concept import normalize_meaning
    if isinstance(explicit, str) or explicit is None:
        explicit = load_pos_json(explicit)
    by_norm = lookup.get(voca_id, {}) if voca_id is not None else {}
    out = []
    for m in meanings or []:
        text = m.get('meaning') if isinstance(m, dict) else m
        if not isinstance(text, str) or not text:
            out.append(None)
            continue
        p = explicit.get(text) or by_norm.get(normalize_meaning(text))
        out.append(p)
    return out
