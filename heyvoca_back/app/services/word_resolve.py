"""영어 토큰(활용형/구두점 포함 가능) -> Voca 매칭 공용 리졸버.

원래 `app/routes/search.py`의 예문 단어 탭 팝업(`/word-info`)에서만 쓰이던 로직이었으나,
`app/routes/tts.py`의 사전 실재 검증(`_exists_in_dict`)도 정확 일치만 보고 활용형
("scheduled", "desks" 등)을 사전에 없는 것으로 오판하는 문제가 있어 이 모듈로 분리해
두 라우트에서 공유한다(route-to-route import 방지).

순서: 1) 정제 후 정확 일치(소문자 기준) 2) 원본 케이싱 그대로 정확 일치(고유명사 대비)
3) spaCy lemma 정확 일치 4) 접미사 제거 fallback.

일본어 사전(g.dict_lang == 'ja')에서는 영어 lemma/접미사 규칙을 쓰지 않는다 —
표기(voca.word) 정확 일치 → 읽기(voca_ja.reading) 정확 일치만 본다(resolve_word_info_ja).
"""

import string

from sqlalchemy import func, case

from app.models.models import db, Voca, VocaJa
from app.utils.example_tagging import _get_spacy
from app.utils.dict_lang import get_dict_lang

_WORD_INFO_STRIP_CHARS = string.punctuation + string.whitespace + '“”‘’—–…'
# 일본어 문장부호·괄호·전각 공백 (ja 토큰 정제용). 장음 기호 'ー'는 단어의 일부라 제외.
_JA_STRIP_CHARS = _WORD_INFO_STRIP_CHARS + '。、，．・「」『』【】〔〕（）［］｛｝〈〉《》！？：；〜～　'


def clean_word_token(raw_word):
    """예문에서 탭한 원시 토큰의 앞뒤 구두점/따옴표/공백을 제거한다.

    내부의 하이픈/어포스트로피는 보존한다("mother-in-law", "don't" 등이 그대로 남음) —
    strip()은 문자열 양 끝만 제거하므로 안전하다.
    """
    if not raw_word:
        return ''
    return str(raw_word).strip().strip(_WORD_INFO_STRIP_CHARS)


def lookup_voca_exact(word):
    """word와 대소문자 무시 정확히 일치하는 Voca 1건(가장 작은 id 우선)."""
    if not word:
        return None
    return (
        db.session.query(Voca)
        .filter(func.lower(Voca.word) == word.lower())
        .order_by(Voca.id.asc())
        .first()
    )


def word_info_suffix_candidates(word):
    """정확 일치/lemma 매치 모두 실패했을 때 시도할 값싼 접미사 제거 후보들.

    시도 순서(첫 DB 히트가 채택됨): s, es, ed, d, ing(+ing→e, 겹자음+ing→단자음), ies→y.
    """
    candidates = []

    def add(candidate):
        if candidate and candidate != word and candidate not in candidates:
            candidates.append(candidate)

    if word.endswith('s') and len(word) > 1:
        add(word[:-1])
    if word.endswith('es') and len(word) > 2:
        add(word[:-2])
    if word.endswith('ed') and len(word) > 2:
        add(word[:-2])
    if word.endswith('d') and len(word) > 1:
        add(word[:-1])
    if word.endswith('ing') and len(word) > 3:
        stem = word[:-3]
        add(stem)               # walking -> walk
        add(stem + 'e')         # hoping -> hope
        # 겹자음(running -> runn-, stopping -> stopp-) + ing -> 단자음(run, stop)
        if len(stem) >= 2 and stem[-1] == stem[-2] and stem[-1].isalpha():
            add(stem[:-1])
    if word.endswith('ies') and len(word) > 3:
        add(word[:-3] + 'y')    # cities -> city

    return candidates


def lookup_voca_ja(word):
    """일본어 사전: 표기 정확 일치(가장 작은 id) → 없으면 읽기 정확 일치(JLPT 있는 항목 우선)."""
    if not word:
        return None
    # utf8mb4_unicode_ci 는 탁점·가나 크기 차이를 무시한다(パン = バン). DB 에서 후보를 받고
    # 표기가 정확히 같은 것을 우선, 없으면 collation 일치 첫 후보.
    rows = (
        db.session.query(Voca)
        .filter(Voca.word == word)
        .order_by(Voca.id.asc())
        .limit(20)
        .all()
    )
    if rows:
        return next((v for v in rows if v.word == word), rows[0])
    rows = (
        db.session.query(Voca, VocaJa.reading)
        .join(VocaJa, VocaJa.voca_id == Voca.id)
        .filter(VocaJa.reading == word)
        .order_by(case((VocaJa.jlpt.is_(None), 1), else_=0), Voca.id.asc())
        .limit(20)
        .all()
    )
    if rows:
        return next((v for v, r in rows if r == word), rows[0][0])
    return None


def resolve_word_info_ja(raw_word):
    """일본어 토큰 -> Voca. 소문자화·lemma·접미사 규칙 없이 정확 일치만."""
    if not raw_word:
        return None
    cleaned = str(raw_word).strip().strip(_JA_STRIP_CHARS)
    if not cleaned:
        return None
    return lookup_voca_ja(cleaned)


def resolve_word_info(raw_word):
    """탭한 원시 토큰(raw_word) -> 매칭된 Voca 인스턴스, 없으면 None.

    순서: 1) 정제 후 정확 일치(소문자 기준) 2) 원본 케이싱 그대로 정확 일치(고유명사 대비)
    3) spaCy lemma 정확 일치 4) 접미사 제거 fallback.
    현재 사전이 ja 면 resolve_word_info_ja(정확 일치만)로 위임한다.
    """
    if get_dict_lang() == 'ja':
        return resolve_word_info_ja(raw_word)

    cleaned = clean_word_token(raw_word)
    if not cleaned:
        return None

    cleaned_lower = cleaned.lower()

    voca = lookup_voca_exact(cleaned_lower)
    if voca:
        return voca

    if cleaned != cleaned_lower:
        voca = lookup_voca_exact(cleaned)
        if voca:
            return voca

    nlp = _get_spacy()
    if nlp:
        try:
            doc = nlp(cleaned_lower)
            if len(doc) > 0:
                lemma = (doc[0].lemma_ or '').strip()
                if lemma and lemma != cleaned_lower:
                    voca = lookup_voca_exact(lemma)
                    if voca:
                        return voca
        except Exception:
            pass

    for candidate in word_info_suffix_candidates(cleaned_lower):
        voca = lookup_voca_exact(candidate)
        if voca:
            return voca

    return None
