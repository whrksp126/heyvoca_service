"""영어 토큰(활용형/구두점 포함 가능) -> Voca 매칭 공용 리졸버.

원래 `app/routes/search.py`의 예문 단어 탭 팝업(`/word-info`)에서만 쓰이던 로직이었으나,
`app/routes/tts.py`의 사전 실재 검증(`_exists_in_dict`)도 정확 일치만 보고 활용형
("scheduled", "desks" 등)을 사전에 없는 것으로 오판하는 문제가 있어 이 모듈로 분리해
두 라우트에서 공유한다(route-to-route import 방지).

순서: 1) 정제 후 정확 일치(소문자 기준) 2) 원본 케이싱 그대로 정확 일치(고유명사 대비)
3) spaCy lemma 정확 일치 4) 접미사 제거 fallback.

일본어 사전(g.dict_lang == 'ja')에서는 영어 lemma/접미사 규칙 대신 표기(voca.word)
정확 일치 → 읽기(voca_ja.reading) 정확 일치 → 규칙 기반 역활용(ja_deinflect_candidates)
순으로 찾는다(resolve_word_info_ja).
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


# ──────────────────────────────────────────────────────────
# 일본어 활용형 → 기본형 역활용(deinflection) — 외부 형태소 분석기 없이 규칙 기반.
#
# DB 존재 여부를 보지 않고 "형태만으로" 가능한 기본형 후보들을 만든다 — 호출 측이
# 후보를 순서대로 사전에서 조회해 첫 히트를 채택한다(규칙이 틀린 후보는 그냥 사전에
# 없어서 무시됨). 대표 활용(정중형/て・た형/부정형/たい/수동・가능/사역/조건형/의지형/
# い형용사/な형용사・です)만 커버하며 완전한 형태소 분석을 대체하지 않는다.
# ──────────────────────────────────────────────────────────

# い단 → う단 (5단동사 ます어간 → 기본형: 使い+ます → 使う)
_I_TO_U = {'い': 'う', 'き': 'く', 'ぎ': 'ぐ', 'し': 'す', 'ち': 'つ',
           'に': 'ぬ', 'び': 'ぶ', 'み': 'む', 'り': 'る'}
# あ단 → う단 (5단동사 부정형/사역/수동 어간 → 기본형: 使わ+ない → 使う)
_A_TO_U = {'か': 'く', 'が': 'ぐ', 'さ': 'す', 'た': 'つ', 'な': 'ぬ',
           'ば': 'ぶ', 'ま': 'む', 'ら': 'る', 'わ': 'う'}
# え단 → う단 (5단동사 가능형/조건형 어간 → 기본형: 使え+る/使え+ば → 使う)
_E_TO_U = {'え': 'う', 'け': 'く', 'げ': 'ぐ', 'せ': 'す', 'て': 'つ',
           'ね': 'ぬ', 'べ': 'ぶ', 'め': 'む', 'れ': 'る'}
# お단 → う단 (5단동사 의지형 어간 → 기본형: 使お+う → 使う)
_O_TO_U = {'お': 'う', 'こ': 'く', 'ご': 'ぐ', 'そ': 'す', 'と': 'つ',
           'の': 'ぬ', 'ぼ': 'ぶ', 'も': 'む', 'ろ': 'る'}

# て/た(で/だ)형의 음편(音便) — 어미 2글자 → 5단동사 기본형 어미 후보들
_TE_TA_GODAN = {
    'って': ('う', 'つ', 'る'), 'った': ('う', 'つ', 'る'),
    'んで': ('む', 'ぬ', 'ぶ'), 'んだ': ('む', 'ぬ', 'ぶ'),
    'いて': ('く',), 'いた': ('く',),
    'いで': ('ぐ',), 'いだ': ('ぐ',),
    'して': ('す',), 'した': ('す',),
}
# 行く/いく 예외 — く행인데도 いて/いた가 아니라 って/った를 쓴다
_IKU_STEM_CHARS = ('行', 'い')


def ja_deinflect_candidates(word):
    """일본어 활용형(word) → 사전 기본형 후보 목록(우선순위 순, 중복 제거).

    DB 조회 없이 문자열 규칙만으로 후보를 만든다. 정확한 활용형 분류(5단/1단/불규칙)를
    가리지 않고 가능한 모든 해석을 후보로 던지므로, 실제 사전에 없는 후보는 호출 측
    조회에서 자연히 걸러진다.
    """
    if not word:
        return []
    w = word
    candidates = []
    seen = set()

    def add(c):
        if c and c != w and c not in seen:
            seen.add(c)
            candidates.append(c)

    # ── い형용사: く/くて/かった/くない/さ (제일 먼저 — って/った 규칙과 어미가 겹쳐
    #    かった 등을 동사로 잘못 해석하는 후보보다 우선 순위를 앞에 둔다) ──
    for suf in ('くなかった', 'かった', 'くない', 'くて', 'く'):
        if w.endswith(suf) and len(w) > len(suf):
            add(w[:-len(suf)] + 'い')
    if w.endswith('さ') and len(w) > 1:
        add(w[:-1] + 'い')  # 高さ -> 高い (명사화, 참고용 낮은 우선도)

    # ── な형용사/명사 + です・だ・な・に (copula) ──
    for suf in ('ではありませんでした', 'ではありません', 'じゃなかった', 'じゃない',
                'でした', 'だった', 'です', 'だ', 'な', 'に'):
        if w.endswith(suf) and len(w) > len(suf):
            stem = w[:-len(suf)]
            add(stem)
            add(stem + 'だ')

    # ── たい(희망) ──
    if w.endswith('たい') and len(w) > 2:
        stem = w[:-2]
        add(stem + 'る')  # 1단동사(食べたい -> 食べる)
        if stem.endswith('し'):
            add(stem[:-1] + 'する')
        if stem and stem[-1] in _I_TO_U:
            add(stem[:-1] + _I_TO_U[stem[-1]])  # 5단동사(飲みたい -> 飲む)

    # ── 정중형: ませんでした/ました/ません/ます ──
    for suf in ('ませんでした', 'ました', 'ません', 'ます'):
        if w.endswith(suf) and len(w) > len(suf):
            stem = w[:-len(suf)]
            if stem.endswith('し'):
                add(stem[:-1] + 'する')  # します -> する
            if stem.endswith('き'):
                add(stem[:-1] + 'くる')  # きます -> くる(来る, 가나 표기)
            add(stem + 'る')  # 1단동사
            if stem and stem[-1] in _I_TO_U:
                add(stem[:-1] + _I_TO_U[stem[-1]])  # 5단동사
            break  # 가장 긴 접미사만(ませんでした가 ません에도 매치되는 것 방지)

    # ── て/た(で/だ)형 — 5단동사 음편 ──
    for suf, u_rows in _TE_TA_GODAN.items():
        if w.endswith(suf) and len(w) > 2:
            stem = w[:-2]
            # 行く/いく 예외를 먼저 시도 — 行って는 行く(예외)/行う(정규) 둘 다 형태상
            # 가능하지만(둘 다 う행 5단동사 음편과 같아짐) 실사용 빈도상 行く를 우선한다.
            if stem and stem[-1] in _IKU_STEM_CHARS and suf in ('って', 'った'):
                add(stem + 'く')  # 行って/行った -> 行く
            for u in u_rows:
                add(stem + u)
            break
    for suf in ('て', 'た', 'で', 'だ'):
        if w.endswith(suf) and len(w) > 1:
            add(w[:-1] + 'る')  # 1단동사(食べて -> 食べる)

    # ── ない/なかった(부정형) ──
    for suf in ('なかった', 'ない'):
        if w.endswith(suf) and len(w) > len(suf):
            stem = w[:-len(suf)]
            if stem.endswith('し'):
                add(stem[:-1] + 'する')
            if stem.endswith('こ'):
                add(stem[:-1] + 'くる')  # こない -> くる(来る, 가나 표기)
            add(stem + 'る')  # 1단동사
            if stem and stem[-1] in _A_TO_U:
                add(stem[:-1] + _A_TO_U[stem[-1]])  # 5단동사(買わない -> 買う)
            break

    # ── られる/れる(수동・가능・존경), させる/せる(사역) ──
    if w.endswith('られる') and len(w) > 3:
        add(w[:-3] + 'る')  # 1단동사(食べられる -> 食べる)
    if w.endswith('させる') and len(w) > 3:
        add(w[:-3] + 'る')  # 1단동사(食べさせる -> 食べる)
    for suf in ('れる', 'せる'):
        if w.endswith(suf) and len(w) > 2:
            stem = w[:-2]
            if stem and stem[-1] in _A_TO_U:
                add(stem[:-1] + _A_TO_U[stem[-1]])  # 5단동사(話される/書かせる -> 話す/書く)

    # ── ば(조건형) ──
    if w.endswith('れば') and len(w) > 2:
        add(w[:-2] + 'る')  # 1단동사(食べれば -> 食べる)
    if w.endswith('ば') and len(w) > 1:
        stem = w[:-1]
        if stem and stem[-1] in _E_TO_U:
            add(stem[:-1] + _E_TO_U[stem[-1]])  # 5단동사(話せば -> 話す)

    # ── よう/おう(의지형) ──
    if w.endswith('よう') and len(w) > 2:
        add(w[:-2] + 'る')  # 1단동사(食べよう -> 食べる)
    if w.endswith('う') and len(w) > 1 and w[-2] in _O_TO_U:
        add(w[:-2] + _O_TO_U[w[-2]])  # 5단동사(話そう -> 話す)

    return candidates


def lookup_voca_ja_deinflected(cleaned):
    """정제된 일본어 토큰 → (Voca, 실제 사전에 있던 표기) 튜플. 없으면 (None, None).

    정확 일치를 먼저 보고, 실패하면 `ja_deinflect_candidates`가 만든 활용형 후보를
    순서대로 조회해 첫 히트를 채택한다.
    """
    if not cleaned:
        return None, None
    voca = lookup_voca_ja(cleaned)
    if voca:
        return voca, cleaned
    for candidate in ja_deinflect_candidates(cleaned):
        voca = lookup_voca_ja(candidate)
        if voca:
            return voca, candidate
    return None, None


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
    """일본어 토큰 -> Voca. 정확 일치 우선, 실패 시 활용형 역활용 후보로 재시도."""
    if not raw_word:
        return None
    cleaned = str(raw_word).strip().strip(_JA_STRIP_CHARS)
    if not cleaned:
        return None
    voca, _matched = lookup_voca_ja_deinflected(cleaned)
    return voca


def resolve_word_info_detailed(raw_word):
    """`/word-info` 응답용 — (Voca, matched_form, base_form) 반환. 못 찾으면 (None, None, None).

    matched_form: 정제된(구두점 등 제거) 원래 탭 표기.
    base_form: 최종 매칭된 사전 표기(voca.word) — ja 활용형이면 기본형, en 은 lemma/접미사
    보정이 적용된 표기. matched_form == base_form 이면 활용형이 아니라 원래부터 사전형.
    """
    lang = get_dict_lang()
    if lang == 'ja':
        cleaned = str(raw_word).strip().strip(_JA_STRIP_CHARS) if raw_word else ''
        if not cleaned:
            return None, None, None
        voca, _matched = lookup_voca_ja_deinflected(cleaned)
        if not voca:
            return None, None, None
        return voca, cleaned, voca.word

    cleaned = clean_word_token(raw_word)
    if not cleaned:
        return None, None, None
    voca = resolve_word_info(raw_word)
    if not voca:
        return None, None, None
    return voca, cleaned, voca.word


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
