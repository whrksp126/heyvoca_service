"""
meaning_concept.py — "유사 뜻(같은 개념) 그룹" 관련 단일 소스.

배경: 객관식 문제에서 정답과 오답의 뜻이 같거나 매우 비슷하면(achieve '이루다' /
attain '이루다') 사용자가 억울하게 틀린다. 뜻(voca_meaning 행)과 그룹(concept_id)은
N:M 매핑 테이블(voca_meaning_concept)로 연결된다 — 뜻 하나가 여러 판정 그룹에
속할 수 있다(전이적 합치기로 인한 거대 그룹 생성을 막기 위해 1:1 컬럼 대신 N:M 채택).
"두 단어가 겹친다"는 같은 concept_id를 하나라도 공유하면(한 홉만 인정) 성립한다.

이 모듈은
  1) 뜻 문자열 정규화(normalize_meaning) — 표기 차이를 흡수해 문자열 비교용 폴백에 사용
  2) 단어 단위 concept_id 집계 / 두 단어의 "뜻 겹침" 판정
  3) 사전 voca_id 집합 → 뜻별 concept_id 목록 배치 조회(N+1 방지)
를 제공한다. 정규화 규칙은 데이터 시딩 스크립트와 반드시 동일해야 한다(정본 규칙).
"""

import re
import unicodedata
from typing import Iterable, Optional

from app import db
from app.models.models import VocaMeaning, VocaMeaningMap, VocaMeaningConcept

_PAREN = re.compile(r'\([^)]*\)|\[[^\]]*\]|（[^）]*）')

# 조사 목록 — '~을', '…에게' 처럼 물결/말줄임표 뒤가 조사인 토큰만 통째로 제거한다.
_PARTICLES = (
    '을', '를', '이', '가', '에', '에게', '의', '으로', '로', '와', '과', '에서',
    '부터', '까지', '도', '은', '는', '한테', '처럼', '보다', '에도', '이라고',
    '라고', '에게서', '으로부터', '로부터', '과의', '와의', '에의', '으로서',
    '로서', '으로써', '로써',
)
_TILDE_TOK = re.compile(
    r'(?:^|(?<=\s))(?:~|…|\.\.\.)(' + '|'.join(sorted(_PARTICLES, key=len, reverse=True)) + r')(?=\s|$)'
)
_PUNCT = re.compile(r'[.,;:!?\'"‘’“”·/\-–—ㆍ]')


def normalize_meaning(s: str) -> str:
    """뜻 문자열 정규화 — 표기 차이를 흡수해 동일/유사 뜻 비교에 쓴다.

    순서: NFKC 정규화+lower → 괄호 그룹 제거 → '~을'처럼 조사가 붙은 물결/말줄임
    토큰 제거(그 외 물결/말줄임은 문자만 지우고 뒤 내용은 유지) → 구두점 제거
    → 공백 전부 제거. 결과가 비면 원문 strip 반환.
    """
    o = s
    s = unicodedata.normalize('NFKC', s or '').strip().lower()
    s = _PAREN.sub(' ', s)
    s = _TILDE_TOK.sub(' ', s)                        # '~을' '…에게' 같은 조사 플레이스홀더 토큰 제거
    s = s.replace('~', ' ').replace('…', ' ')          # 남은 물결/말줄임은 지우고 뒤 내용은 유지
    s = _PUNCT.sub(' ', s)
    s = re.sub(r'\s+', '', s)
    return s or (o or '').strip()


def concept_ids_for_word(meaning_concepts: Iterable[Iterable[int]]) -> list:
    """meaning_concepts(뜻과 같은 순서/길이의 concept_id 리스트의 리스트)에서 distinct 전체를 추출."""
    ids = []
    for group in meaning_concepts or []:
        for cid in group or []:
            if cid is not None and cid not in ids:
                ids.append(cid)
    return ids


def normalized_meanings_for_word(meanings: Iterable) -> list:
    """뜻 문자열(또는 {'meaning':...} 객체) 리스트 → 정규화된 문자열 distinct 리스트.

    concept_id가 없는 단어(사용자 직접 생성 등)에 대한 뜻 겹침 판정 폴백에 쓴다.
    """
    norms = []
    for m in meanings or []:
        text = m.get('meaning') if isinstance(m, dict) else m
        if not text:
            continue
        n = normalize_meaning(text)
        if n and n not in norms:
            norms.append(n)
    return norms


def words_overlap(a_concepts, a_norms, b_concepts, b_norms) -> bool:
    """두 단어가 뜻이 겹치는지 판정.

    concept_id 교집합이 있으면 겹침. concept_id가 없는(사전 미연결/사용자 생성) 경우는
    정규화된 뜻 문자열 교집합으로 폴백한다.
    """
    if a_concepts and b_concepts and (set(a_concepts) & set(b_concepts)):
        return True
    if a_norms and b_norms and (set(a_norms) & set(b_norms)):
        return True
    return False


def load_dict_meaning_concepts(voca_ids: Iterable[Optional[int]]) -> dict:
    """사전 voca_id 집합 → {voca_id: {normalize_meaning(meaning): [concept_id, ...]}} 배치 조회.

    한 번의 쿼리(outer join)로 N+1을 피한다. voca_meaning_concept는 N:M 매핑이라
    뜻 하나가 여러 concept_id에 속할 수 있다 — 값은 항상 리스트(매핑이 없으면 빈 리스트).
    호출 측은 이 맵을 이용해 사용자 단어에 복사 저장된 뜻 문자열(voca_meanings JSON)을
    정규화해 매칭시켜 concept_id 목록을 채운다.
    (UserVoca/UserVocaBookMap에는 meaning_id가 저장돼 있지 않아 voca_id 기준으로 찾는다.)

    일본어 사전(g.dict_lang == 'ja')은 voca_meaning_concept 가 비어 있으므로 쿼리 없이 {} —
    호출 측은 정규화 뜻 문자열 폴백으로 겹침을 판정한다.
    """
    from app.utils.dict_lang import get_dict_lang
    if get_dict_lang() == 'ja':
        return {}
    ids = sorted({int(v) for v in voca_ids if v is not None})
    if not ids:
        return {}
    rows = (
        db.session.query(VocaMeaningMap.voca_id, VocaMeaning.meaning, VocaMeaningConcept.concept_id)
        .join(VocaMeaning, VocaMeaningMap.meaning_id == VocaMeaning.id)
        .outerjoin(VocaMeaningConcept, VocaMeaningConcept.meaning_id == VocaMeaning.id)
        .filter(VocaMeaningMap.voca_id.in_(ids))
        .all()
    )
    result = {}
    for voca_id, meaning, concept_id in rows:
        norm = normalize_meaning(meaning or '')
        cids = result.setdefault(voca_id, {}).setdefault(norm, [])
        if concept_id is not None and concept_id not in cids:
            cids.append(concept_id)
    return result


def attach_concept_ids(voca_id: Optional[int], meanings: Iterable[str], concept_lookup: dict) -> tuple:
    """단어 하나의 뜻 문자열 리스트 + 배치 조회 결과 → (meaning_concepts, concept_ids).

    meanings: ["이루다", "달성하다", ...] 형태(사용자 단어장에 복사 저장된 문자열 리스트) — 그대로 유지.
    concept_lookup: load_dict_meaning_concepts()의 반환값.

    클라이언트 호환을 위해 meanings 자체는 절대 변형하지 않는다(문자열 배열 그대로 노출).
    concept 정보는 meanings와 같은 순서/길이의 별도 배열로만 내려준다.

    반환:
      meaning_concepts: [[int, ...], ...] — meanings와 순서/길이가 동일한 concept_id 리스트의 리스트
                         (매핑 없는 뜻은 빈 리스트)
      concept_ids:       단어 단위 distinct concept_id 리스트 (사전 미연결 단어는 [])
    """
    norm_map = concept_lookup.get(voca_id, {}) if voca_id is not None else {}
    meaning_concepts = []
    concept_ids = []
    for m in meanings or []:
        cids = list(norm_map.get(normalize_meaning(m), [])) if m else []
        meaning_concepts.append(cids)
        for cid in cids:
            if cid not in concept_ids:
                concept_ids.append(cid)
    return meaning_concepts, concept_ids


# ──────────────────────────────────────────────
# 빈칸 직접 입력용 "비슷한 뜻 단어" (near_synonyms)
# ──────────────────────────────────────────────

_TARGET_STRONG = re.compile(
    r'<strong\b[^>]*\bclass\s*=\s*["\'][^"\']*\btarget-word\b[^"\']*["\'][^>]*>(.*?)</strong>',
    re.I | re.S,
)
_ANY_TAG = re.compile(r'<[^>]*>')
_LOOSE_DROP = re.compile(r"[\s\-.'’]")


def _highlight_norms(ko_html: str) -> list:
    """한국어 번역의 강조 어절(target-word) 텍스트 → 정규화 문자열 리스트."""
    hs = []
    for inner in _TARGET_STRONG.findall(ko_html or ''):
        h = normalize_meaning(_ANY_TAG.sub('', inner))
        if h:
            hs.append(h)
    return hs


def _common_prefix_len(a: str, b: str) -> int:
    n = 0
    for x, y in zip(a, b):
        if x != y:
            break
        n += 1
    return n


def context_meaning_indexes(meanings: Iterable, ko_html: str) -> list:
    """"이 문장에서 쓰인 뜻"의 인덱스 목록 — 예문 한국어 번역의 강조 어절과 맞는 뜻만 고른다.

    강조가 없으면 []. 판정(뜻 n, 강조 h는 모두 normalize_meaning 결과):
      - n 이 h 에 포함, 또는 (len(h) >= 2 이고 h 가 n 에 포함)
      - 공통 접두 길이 >= 2 (공정한 / 공정하게)
      - n 이 '다'로 끝나고 길이 >= 2 이며 h 가 어간 n[:-1] 로 시작 (막다 / 막았다)
    meanings 원소는 문자열 또는 {'meaning': ...} 모두 허용.
    """
    hs = _highlight_norms(ko_html)
    if not hs:
        return []
    result = []
    for i, m in enumerate(meanings or []):
        text = m.get('meaning') if isinstance(m, dict) else m
        if not text:
            continue
        n = normalize_meaning(text)
        if not n:
            continue
        for h in hs:
            if (n in h
                    or (len(h) >= 2 and h in n)
                    or _common_prefix_len(n, h) >= 2
                    or (n.endswith('다') and len(n) >= 2 and h.startswith(n[:-1]))):
                result.append(i)
                break
    return result


def loose_word_key(word: str) -> str:
    """영어 단어 느슨한 비교 키 — 소문자 + 공백/하이픈/마침표/아포스트로피 제거."""
    return _LOOSE_DROP.sub('', (word or '').lower())


def rank_near_synonyms(same_meaning_words: Iterable, concept_hits: Iterable,
                       exclude: Iterable = (), limit: int = 120) -> list:
    """DB 없는 정렬·정리 헬퍼.

    same_meaning_words: 같은 한국어 뜻을 가진 단어 목록
    concept_hits: (word, concept_id) 쌍 목록(개념 그룹 한 홉)
    정렬: 같은 뜻 단어 먼저 → 공유 concept 개수 많은 순 → 알파벳순.
    정리: strip, 대소문자 무시 중복 제거(처음 본 표기 유지), exclude 와 느슨한 키가 같으면 제외.
    """
    banned = {loose_word_key(e) for e in (exclude or ()) if e}
    banned.discard('')
    same_keys = set()
    cids = {}       # lower → set(concept_id)
    display = {}    # lower → 원문 표기
    for w in same_meaning_words or []:
        w = (w or '').strip()
        if not w:
            continue
        k = w.lower()
        display.setdefault(k, w)
        same_keys.add(k)
    for w, cid in concept_hits or []:
        w = (w or '').strip()
        if not w:
            continue
        k = w.lower()
        display.setdefault(k, w)
        cids.setdefault(k, set()).add(cid)
    keys = [k for k in display if loose_word_key(k) and loose_word_key(k) not in banned]
    keys.sort(key=lambda k: (0 if k in same_keys else 1, -len(cids.get(k, ())), k))
    return [display[k] for k in keys[:max(0, int(limit))]]


def near_synonym_words(voca_id: Optional[int], meanings: Iterable, meaning_concepts,
                       ko_html: str, *, exclude: Iterable = (), limit: int = 120) -> list:
    """빈칸 직접 입력에서 "뜻은 비슷하지만 다른 단어"로 볼 사전 단어 기본형 목록.

    이 문장에서 쓰인 뜻(context_meaning_indexes)으로 먼저 좁힌 뒤, 그 뜻과 같은 한국어 뜻을
    가진 단어 + 그 뜻의 concept 그룹을 한 홉 공유하는 단어를 모은다. 좁힐 수 없으면 [](정밀도 우선).
    일본어 사전/사전 미연결(voca_id None)이면 쿼리 없이 [].
    """
    from app.utils.dict_lang import get_dict_lang
    from app.models.models import Voca
    if voca_id is None or get_dict_lang() == 'ja':
        return []
    meanings = list(meanings or [])
    idx = context_meaning_indexes(meanings, ko_html)
    if not idx:
        return []
    ctx_meanings = []
    for i in idx:
        m = meanings[i]
        text = m.get('meaning') if isinstance(m, dict) else m
        if text:
            ctx_meanings.append(text)
    mc = meaning_concepts if isinstance(meaning_concepts, (list, tuple)) and len(meaning_concepts) == len(meanings) else []
    ctx_cids = set()
    for i in idx:
        if i < len(mc):
            for cid in mc[i] or []:
                if cid is not None:
                    ctx_cids.add(cid)

    same_words = []
    if ctx_meanings:
        rows = (
            db.session.query(Voca.word)
            .join(VocaMeaningMap, VocaMeaningMap.voca_id == Voca.id)
            .join(VocaMeaning, VocaMeaning.id == VocaMeaningMap.meaning_id)
            .filter(VocaMeaning.meaning.in_(ctx_meanings), Voca.id != voca_id)
            .distinct()
            .all()
        )
        same_words = [r[0] for r in rows]
    hits = []
    if ctx_cids:
        rows = (
            db.session.query(Voca.word, VocaMeaningConcept.concept_id)
            .join(VocaMeaningMap, VocaMeaningMap.voca_id == Voca.id)
            .join(VocaMeaningConcept, VocaMeaningConcept.meaning_id == VocaMeaningMap.meaning_id)
            .filter(VocaMeaningConcept.concept_id.in_(ctx_cids), Voca.id != voca_id)
            .distinct()
            .all()
        )
        hits = [(r[0], r[1]) for r in rows]
    return rank_near_synonyms(same_words, hits, exclude=exclude, limit=limit)
