"""글자 밭(히라가나/가타카나/알파벳) 문자 데이터 — 서버 사본.

정본은 프론트 정적 JSON(`heyvoca_front/src/data/script/{hiragana,katakana,alphabet}.json`)
이다. 서버는 UserVoca(word=글자, meanings=[한글 발음(+로마자/영문명)]) 생성에 필요한
최소 필드만 `app/constants/script_chars.json` 에 사본으로 둔다 — 클라이언트 body로
글자 목록을 받지 않는 이유는, 사용자가 임의의 글자/뜻을 주입해 학습장에 심을 수 있게
되기 때문이다(신뢰 경계는 항상 서버).

프론트 정본이 바뀌면(글자 추가/오타 수정 등) 이 JSON도 같이 갱신해야 한다 — 자동 동기화는
없다(빈도가 낮고, 바뀌면 기존 사용자 UserVoca.word는 소급 갱신되지 않으므로 사본 쪽 변경은
신중해야 한다).
"""

import json
import os
from functools import lru_cache

_DATA_PATH = os.path.join(os.path.dirname(__file__), '..', 'constants', 'script_chars.json')

# script → 사전 언어. UserVoca.dict_lang / UserVocaBook.language 에 그대로 쓴다.
SCRIPT_LANG = {
    'hiragana': 'ja',
    'katakana': 'ja',
    'alphabet': 'en',
}

SCRIPT_CHOICES = tuple(SCRIPT_LANG.keys())

BOOK_NAME = {
    'hiragana': '히라가나',
    'katakana': '가타카나',
    'alphabet': '알파벳',
}


@lru_cache(maxsize=1)
def _load() -> dict:
    with open(_DATA_PATH, encoding='utf-8') as f:
        return json.load(f)


def get_chars(script: str) -> list:
    """script → [{char, romaji, hangul} | {char, lower, name_hangul, sound_hangul}, ...] (정본 순서)."""
    return list(_load().get(script) or [])


def meaning_for(script: str, entry: dict) -> str:
    """글자 1개의 UserVoca.voca_meanings[0] 문자열 — '한글 발음(+로마자/영문 표기)'."""
    if script == 'alphabet':
        name = entry.get('name_hangul') or ''
        sound = entry.get('sound_hangul') or ''
        if name and sound:
            return f'{name}({sound})'
        return name or sound or (entry.get('char') or '')
    hangul = entry.get('hangul') or ''
    romaji = entry.get('romaji') or ''
    if hangul and romaji:
        return f'{hangul}({romaji})'
    return hangul or romaji or (entry.get('char') or '')
