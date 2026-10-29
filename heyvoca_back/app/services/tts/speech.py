"""자리표시어(~, 〜, sb/sth, A/B)를 소리 내 읽을 문장으로 바꾼다.

Edge TTS 는 "~할 수 있는" 의 "~" 를 그냥 건너뛰어 "할 수 있는" 으로 읽는다. 사람이 읽듯
"무엇 무엇을 할 수 있는" 처럼 바꿔서 합성한다.

- 자리표시어가 없는 텍스트는 손대지 않고 그대로 돌려준다 — 캐시 키(sha256)가 바뀌면 이미
  만들어 둔 음성이 전부 다시 생성되기 때문이다.
- 1순위: 미리 만든 읽기표(app/data/tts_readings.json, {"ko": {원문: 읽기}, "en": ..., "ja": ...}).
  원문은 normalize_text 결과 기준. 문맥(누구/무엇/어떠어떠한)은 표가 더 정확하다.
- 2순위: 언어별 규칙 변환(사용자가 직접 쓴 뜻 등 표에 없는 문구).

결과에는 자리표시어가 남지 않으므로 to_speech_text 를 두 번 적용해도 결과가 같다(멱등).
service.object_key_for 가 이 성질에 기대어 모든 진입점의 키를 같은 함수로 맞춘다.
"""
import json
import logging
import os
import re

from .normalize import normalize_text

_READINGS_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    'data', 'tts_readings.json',
)


def _load_readings():
    try:
        with open(_READINGS_PATH, encoding='utf-8') as f:
            data = json.load(f)
        # 조회는 normalize_text 결과로 하므로 키도 같은 기준으로 맞춘다(전각 공백·연속 공백·태그).
        # 정규화 후 겹치는 키는 먼저 나온 쪽을 쓴다.
        out = {}
        for lang, table in data.items():
            if not isinstance(table, dict):
                continue
            norm = {}
            for src, reading in table.items():
                norm.setdefault(normalize_text(src), reading)
            out[lang] = norm
        return out
    except FileNotFoundError:
        return {}
    except Exception:
        logging.getLogger(__name__).warning('TTS 읽기표 로드 실패: %s', _READINGS_PATH, exc_info=True)
        return {}


_READINGS = _load_readings()

_TILDE = '~〜～'
_TILDE_RE = re.compile(f'[{_TILDE}]')
_WS_RE = re.compile(r'\s+')

# ── 한국어 ──────────────────────────────────────────────────────────────
_KO_HANGUL = '가-힣'
_KO_WORD_CHAR = re.compile(f'[{_KO_HANGUL}A-Za-z0-9]')
_KO_RANGE_RE = re.compile(rf'(?<=[0-9])\s*[{_TILDE}]\s*(?=[0-9])')

# 사람을 받는 조사 → "누구 누구"
_KO_PERSON_PARTICLES = ('에게서', '에게', '한테서', '한테', '께서', '께')
# '무엇'(받침 있음) 뒤에 붙는 조사. 받침 없는 쪽 형태는 받침 있는 쪽으로 바꾼다.
_KO_PARTICLES = (
    '에서부터', '에서', '으로서', '으로써', '으로', '로서', '로써', '로', '보다', '처럼',
    '까지', '부터', '만큼', '마저', '조차', '이랑', '랑', '하고는',
    '을', '를', '은', '는', '와', '과', '의', '에', '도', '만', '이나', '나',
)
_KO_PARTICLE_FIX = {'를': '을', '는': '은', '와': '과', '로': '으로', '로서': '으로서',
                    '로써': '으로써', '랑': '이랑', '나': '이나', '가': '이'}
# 서술격 조사 → "무엇 무엇" + 그 말
_KO_COPULA = ('이다', '이며', '이고', '이어서', '이라', '인', '일', '임')
# 용언(하다 계열) → "무엇 무엇을 " + 그 말
_KO_VERB_HEADS = ('하', '할', '한', '함', '해', '했', '합', '되', '될', '된', '됨', '돼', '됐')
_KO_PLACE = '무엇 무엇'
_KO_PERSON = '누구 누구'
# 한국어 문구 안의 단독 대문자 A/B: "A를 B로 여기다", "A와 B". 바로 뒤가 조사이거나 한글이 아닐 때만
# 자리표시어 후보로 본다("A형"·"B급" 의 A/B 는 제외).
_KO_AB_NEXT = '|'.join(sorted(set(_KO_PARTICLES + _KO_PERSON_PARTICLES + ('이', '가')), key=len, reverse=True))
_KO_AB_RE = re.compile(rf'(?<![A-Za-z0-9])[AB](?=(?:{_KO_AB_NEXT})|[^{_KO_HANGUL}A-Za-z0-9]|$)')


def _ko_after(rest: str):
    """~ 바로 뒤에 붙은 말(rest)을 보고 (자리표시어 읽기, rest 에서 바꿔 쓸 길이, 바꿔 쓸 말)."""
    if not rest or not _KO_WORD_CHAR.match(rest[0]):
        return _KO_PLACE, 0, ''
    for p in _KO_PERSON_PARTICLES:
        if rest.startswith(p):
            return _KO_PERSON, 0, ''
    for c in _KO_COPULA:
        if rest.startswith(c):
            return _KO_PLACE, 0, ''
    # '이'/'가' 는 '이다'·'가다' 와 겹쳐 서술격을 먼저 본 뒤에 조사로 본다.
    if rest[0] in '이가':
        return _KO_PLACE, 1, '이'
    for p in _KO_PARTICLES:
        if rest.startswith(p):
            return _KO_PLACE, len(p), _KO_PARTICLE_FIX.get(p, p)
    if rest.startswith(_KO_VERB_HEADS):
        return _KO_PLACE + ('이 ' if rest[0] in '되될된됨돼됐' else '을 '), 0, ''
    return _KO_PLACE + ' ', 0, ''


def _ko_rules(text: str) -> str:
    t = _KO_RANGE_RE.sub('에서 ', text)
    out = []
    i = 0
    while i < len(t):
        ch = t[i]
        if ch not in _TILDE:
            out.append(ch)
            i += 1
            continue
        prev = t[i - 1] if i > 0 else ''
        nxt = t[i + 1] if i + 1 < len(t) else ''
        if prev and _KO_WORD_CHAR.match(prev):
            # "월~금" 같은 범위는 '에서', 단어 끝에 붙은 "좋아~" 는 말끝 늘임표라 읽지 않는다.
            if nxt and _KO_WORD_CHAR.match(nxt):
                out.append('에서 ')
            i += 1
            continue
        reading, consumed, replacement = _ko_after(t[i + 1:])
        out.append(reading + replacement)
        i += 1 + consumed
    return ''.join(out)


def _ko_ab(text: str) -> str:
    parts = _KO_AB_RE.split(text)
    out = [parts[0]]
    for seg in parts[1:]:
        for p in sorted(_KO_PARTICLE_FIX, key=len, reverse=True):
            if seg.startswith(p):
                seg = _KO_PARTICLE_FIX[p] + seg[len(p):]
                break
        out.append('무엇' + seg)
    return ''.join(out)


def _ko_has_ab(text: str) -> bool:
    # "비타민 B를", "플랜 B로" 처럼 한쪽만 있는 A/B 는 일반 문구다. A·B 가 둘 다 있거나 ~ 와 함께
    # 쓰였을 때만 자리표시어로 본다.
    found = set(m.group() for m in _KO_AB_RE.finditer(text))
    return bool(found) and (found == {'A', 'B'} or bool(_TILDE_RE.search(text)))


def _ko_has(text: str) -> bool:
    return bool(_TILDE_RE.search(text) or _ko_has_ab(text))


def _ko(text: str) -> str:
    t = _ko_ab(text) if _ko_has_ab(text) else text
    return _ko_rules(t) if _TILDE_RE.search(t) else t


# ── 영어 ────────────────────────────────────────────────────────────────
_EN_SB_RE = re.compile(r'\bsb\b')
_EN_STH_RE = re.compile(r'\bsth\b')
_EN_A_RE = re.compile(r'(?<![\w\'])A(?![\w\'])')
_EN_B_RE = re.compile(r'(?<![\w\'])B(?![\w\'])')
_EN_OR_RE = re.compile(r'\b(somebody|something)\s*/\s*(somebody|something)\b')


def _en_has_ab(text: str) -> bool:
    # 문장 첫머리 관사 "A" 와 헷갈리지 않도록 A·B 가 둘 다 단독으로 있는 구만 자리표시어로 본다.
    return ' ' in text and bool(_EN_A_RE.search(text)) and bool(_EN_B_RE.search(text))


def _en_has(text: str) -> bool:
    return bool(_TILDE_RE.search(text) or _EN_SB_RE.search(text)
                or _EN_STH_RE.search(text) or _en_has_ab(text))


def _en(text: str) -> str:
    t = text
    if _en_has_ab(t):
        t = _EN_A_RE.sub('something', t)
        t = _EN_B_RE.sub('something else', t)
    t = _EN_SB_RE.sub('somebody', t)
    t = _EN_STH_RE.sub('something', t)
    t = _TILDE_RE.sub(' something ', t)
    t = _EN_OR_RE.sub(r'\1 or \2', t)
    return t


# ── 일본어 ──────────────────────────────────────────────────────────────
def _ja_has(text: str) -> bool:
    return bool(_TILDE_RE.search(text))


def _ja(text: str) -> str:
    return _TILDE_RE.sub('なになに', text)


_RULES = {
    'ko': (_ko_has, _ko),
    'en': (_en_has, _en),
    'ja': (_ja_has, _ja),
}


def has_placeholder(norm_text: str, language: str) -> bool:
    rule = _RULES.get(language)
    return bool(norm_text) and rule is not None and rule[0](norm_text)


def to_speech_text(norm_text: str, language: str) -> str:
    """정규화된 텍스트 → 합성할 읽기. 자리표시어가 없으면 입력을 그대로 돌려준다."""
    if not has_placeholder(norm_text, language):
        return norm_text
    table = _READINGS.get(language) or {}
    reading = table.get(norm_text)
    if not reading:
        reading = _RULES[language][1](norm_text)
    reading = _WS_RE.sub(' ', reading).strip()
    reading = re.sub(r'\s+([,.!?;:)\]、。])', r'\1', reading)
    return reading or norm_text
