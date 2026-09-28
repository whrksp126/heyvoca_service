"""
fill_blank_typing.py — fillInTheBlankTyping(타이핑 빈칸) payload 빌더.

fillInTheBlank(사지선다)와 같은 예문을 쓰되 타이핑으로 정답을 받는다. 정답은
활용형(blankFill, 예문 속 강조 태그 안의 실제 표기)이고, 기본형(item.word)은
"형태 안내용"으로만 같이 내려준다(정답 판정은 blankFill 기준, 기본형 입력은 오답).
"""

import re
from typing import Optional

from app.utils.example_tagging import example_origin_text, example_meaning_text
from app.services.typing_guard import blocked_typos_for

_TARGET_PAIR_RE = re.compile(
    r'<strong[^>]*class="target-word"[^>]*>(.*?)</strong\s*>', re.IGNORECASE | re.DOTALL
)


def _extract_blank(origin_html: str):
    """origin_html에서 첫 강조 태그를 찾아 (blank_text, blank_fill) 반환.

    blank_text: 태그를 '____'로 치환한 평문(HTML 태그 제거).
    blank_fill: 태그 안의 원문 표기(활용형). 못 찾으면 (None, None).
    """
    m = _TARGET_PAIR_RE.search(origin_html or '')
    if not m:
        return None, None
    blank_fill = re.sub(r'<[^>]+>', '', m.group(1)).strip()
    if not blank_fill:
        return None, None
    blank_text = origin_html[:m.start()] + '____' + origin_html[m.end():]
    blank_text = re.sub(r'<[^>]+>', '', blank_text).strip()
    return blank_text, blank_fill


def build_typing_payload(base_word: str, examples: list) -> Optional[dict]:
    """examples(item.examples, origin/meaning 또는 legacy en/ko) 중 강조 태그가 있는 첫
    예문으로 payload를 만든다. 없으면 None(=이 유형 출제 불가, 호출부가 걸러야 함).

    Returns:
      {
        'blank_text': str,     # 빈칸 표시용 평문("____" 포함)
        'answer_text': blank_fill,  # 정답(활용형)
        'base_form': base_word,     # 기본형(형태 안내용, 정답 아님)
        'ko': str,                  # 한국어 예문(강조 유지) — 프론트가 하이라이트에 사용
        'blocked_typos': [str, ...],
      }
    """
    for ex in examples or []:
        origin = example_origin_text(ex)
        blank_text, blank_fill = _extract_blank(origin)
        if not blank_fill:
            continue
        meaning = example_meaning_text(ex)
        return {
            'blank_text':    blank_text,
            'answer_text':   blank_fill,
            'base_form':     base_word,
            'ko':            meaning,
            'blocked_typos': blocked_typos_for(blank_fill),
        }
    return None
