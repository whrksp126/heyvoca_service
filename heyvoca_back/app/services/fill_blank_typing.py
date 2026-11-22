"""
fill_blank_typing.py — fillInTheBlankTyping(타이핑 빈칸) payload 빌더.

fillInTheBlank(사지선다)와 같은 예문을 쓰되 타이핑으로 정답을 받는다. 정답은
활용형(blankFill, 예문 속 강조 태그 안의 실제 표기)이고, 기본형(item.word)은
"형태 안내용"으로만 같이 내려준다(정답 판정은 blankFill 기준, 기본형 입력은 오답).

2026-09-30 "매번 새 문장"(FRESH_SENTENCE_CONTRACT.md) — 영어(en)는 예문 선택이
app/services/example_select.py::choose_example로 옮겨갔다(app/routes/study.py가
호출). `build_typing_payload_for_example`이 선택된 예문 1개로 payload만 만든다.
`build_typing_payload(word, examples)`(예문 목록에서 첫 태그 있는 것을 직접 고름)는
일본어(ja, 이 계약 범위 밖 — 기존 동작 그대로) 경로와 기존 테스트 호환을 위해 유지한다.
"""

import re
import unicodedata
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


def build_typing_payload_for_example(base_word: str, example: dict) -> Optional[dict]:
    """example(example_select.choose_example가 고른 {'origin','meaning',...}) 1개로
    payload를 만든다. 태그가 없으면(호출부가 이미 자격 검증을 했어야 하지만 방어적으로)
    None(=이 유형 출제 불가).

    Returns: build_typing_payload와 동일한 모양의 dict 또는 None.
    """
    if not example:
        return None
    origin = example.get('origin') if isinstance(example, dict) else example_origin_text(example)
    blank_text, blank_fill = _extract_blank(origin)
    if not blank_fill:
        return None
    meaning = example.get('meaning') if isinstance(example, dict) else example_meaning_text(example)
    return {
        'blank_text':    blank_text,
        'answer_text':   blank_fill,
        'base_form':     base_word,
        'ko':            meaning,
        'blocked_typos': blocked_typos_for(blank_fill),
    }


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


# ─────────────────────────────────────────────────────────────────────────────
# 일본어(ja) — 정답을 "빈칸의 히라가나 읽기"로 채점한다(WaniKani·Bunpro 방식).
# 예문 강조 표기가 한자(鋭い)여도 사용자는 히라가나(するどい)로 쓰므로, 서버가 빈칸 구간의
# 읽기를 payload.answer_reading 으로 내려주고 프론트가 양쪽을 히라가나로 접어 비교한다.
#
# reading_tokens 형식: [[surface, reading|null(, okurigana)], ...]
#   - reading null  : surface 가 이미 가나/기호(읽기 불필요)
#   - reading 있음  : 토큰 전체 읽기 = reading + okurigana  (okurigana 는 활용 어미 가나로,
#                     reading 에는 포함되지 않는다. 예 ["鋭い","するど","い"] → するどい,
#                     ["買っ","か","っ"] → かっ, ["行ったり来たり","いったりきたり",""] → 그대로)
# ─────────────────────────────────────────────────────────────────────────────

_HIRA_EXTRA = {'ー', 'ゝ', 'ゞ'}


def to_hiragana(text: str) -> str:
    """가타카나 → 히라가나(ー·기타는 그대로)."""
    out = []
    for ch in text or '':
        o = ord(ch)
        if 0x30A1 <= o <= 0x30F6 or o in (0x30FD, 0x30FE):
            out.append(chr(o - 0x60))
        else:
            out.append(ch)
    return ''.join(out)


def _is_all_kana(text: str) -> bool:
    """히라가나(가타카나 포함 입력은 먼저 to_hiragana) + 장음표 ー 만으로 이뤄졌는가."""
    if not text:
        return False
    return all(0x3041 <= ord(c) <= 0x3096 or c in _HIRA_EXTRA for c in text)


def _squash_ja(text: str) -> str:
    """태그·공백 제거 + NFC. (ja_fields._squash 와 같은 키 — 순환 import 피하려 여기 둔다.)"""
    t = re.sub(r'<[^>]+>', '', text or '')
    t = unicodedata.normalize('NFC', t)
    return re.sub(r'\s+', '', t)


def _token_pieces(tokens) -> Optional[list]:
    """reading_tokens → [(surface, full_reading|None, okurigana)]. 형식이 이상하면 None."""
    if not isinstance(tokens, list) or not tokens:
        return None
    pieces = []
    for t in tokens:
        if not isinstance(t, (list, tuple)) or not t or not isinstance(t[0], str):
            return None
        surface = unicodedata.normalize('NFC', t[0])
        reading = t[1] if len(t) > 1 and isinstance(t[1], str) and t[1] else None
        oku = t[2] if len(t) > 2 and isinstance(t[2], str) else ''
        if reading is not None:
            if oku and not surface.endswith(oku):
                return None   # okurigana 가 표기 끝과 안 맞으면 신뢰 불가
            pieces.append((surface, reading + oku, oku))
        else:
            pieces.append((surface, None, ''))
    return pieces


def _reading_from_tokens(tokens, prefix_html: str, blank_fill: str, suffix_html: str) -> Optional[str]:
    """reading_tokens 에서 빈칸 구간(prefix 길이 ~ +len(blank_fill))의 읽기를 이어 붙인다.
    토큰 합이 예문 평문과 다르거나, 경계가 읽기를 가진 토큰 한가운데를 가르면 None."""
    pieces = _token_pieces(tokens)
    if not pieces:
        return None
    pre, blank, suf = _squash_ja(prefix_html), _squash_ja(blank_fill), _squash_ja(suffix_html)
    if not blank:
        return None
    if ''.join(p[0] for p in pieces) != pre + blank + suf:
        return None
    bs, be = len(pre), len(pre) + len(blank)
    out, pos = [], 0
    for surface, full, oku in pieces:
        s, e = pos, pos + len(surface)
        pos = e
        if e <= bs or s >= be:
            continue
        a, b = max(s, bs) - s, min(e, be) - s     # 토큰 안에서 겹치는 [a, b)
        if full is None:                          # 가나/기호 토큰: 글자 단위로 잘라도 안전
            out.append(surface[a:b])
        elif a == 0 and b == len(surface):
            out.append(full)
        elif oku and a == 0 and b >= len(surface) - len(oku):
            # 한자 머리 전체 + 어미 앞부분(blank 가 어미 중간에서 끝남)
            out.append(full[:len(full) - (len(surface) - b)])
        elif oku and b == len(surface) and a >= len(surface) - len(oku):
            # 어미 뒷부분만(blank 가 어미 중간에서 시작)
            out.append(surface[a:b])
        else:
            return None
    return ''.join(out) or None


def compute_answer_reading(blank_fill: str, prefix_html: str, suffix_html: str,
                           tokens=None, base_word: str = None, word_reading: str = None) -> Optional[str]:
    """빈칸 정답(blank_fill, 활용형 그대로)의 히라가나 읽기. 못 구하면 None.

    1) blank_fill 이 이미 전부 가나 → 히라가나화
    2) reading_tokens 정렬 → 구간 읽기 이어 붙이기
    3) 폴백: blank_fill == 기본형이면 VocaJa.reading
    결과는 항상 전부 히라가나(+ー)여야 한다(라틴·숫자·한자가 남으면 그 경로는 버림)."""
    direct = to_hiragana(unicodedata.normalize('NFC', blank_fill))
    if _is_all_kana(direct):
        return direct
    if tokens:
        r = _reading_from_tokens(tokens, prefix_html, blank_fill, suffix_html)
        if r:
            r = to_hiragana(r)
            if _is_all_kana(r):
                return r
    if base_word and word_reading and blank_fill == base_word:
        r = to_hiragana(unicodedata.normalize('NFC', word_reading))
        if _is_all_kana(r):
            return r
    return None


def build_typing_payload_ja(base_word: str, examples: list, token_map: dict = None,
                            voca_id=None, word_reading: str = None) -> Optional[dict]:
    """일본어 직접 입력 payload. build_typing_payload 모양 + 'answer_reading'(히라가나).

    token_map: ja_fields.load_ja_example_tokens 결과({voca_id: {squashed origin: tokens}}).
    예문에 이미 reading_tokens 가 있으면 그것을 우선한다. 읽기를 못 구한 예문은 건너뛰고
    다음 예문을 시도하며, 모두 실패하면 None(=이 유형 출제 불가)."""
    by_text = (token_map or {}).get(voca_id) or {}
    for ex in examples or []:
        origin = example_origin_text(ex)
        m = _TARGET_PAIR_RE.search(origin or '')
        blank_text, blank_fill = _extract_blank(origin)
        if not blank_fill:
            continue
        tokens = (ex.get('reading_tokens') if isinstance(ex, dict) else None) or by_text.get(_squash_ja(origin))
        reading = compute_answer_reading(
            blank_fill, origin[:m.start()], origin[m.end():],
            tokens=tokens, base_word=base_word, word_reading=word_reading,
        )
        if not reading:
            continue
        return {
            'blank_text':     blank_text,
            'answer_text':    blank_fill,
            'answer_reading': reading,
            'base_form':      base_word,
            'ko':             example_meaning_text(ex),
            'blocked_typos':  [],   # 영어 철자 근접 단어 차단은 일본어에 무의미(DB 조회도 생략)
        }
    return None
