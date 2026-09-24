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
