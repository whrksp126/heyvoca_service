"""
typing_guard.py — fillInTheBlankTyping(타이핑 빈칸) 전용 "오타 허용 여부" 판정 데이터.

정답(활용형, blankFill)과 편집거리 1(치환·인접 전치·삽입·삭제)인 문자열 중, 사전에
실제로 존재하는 **다른** 단어만 `blocked_typos`로 내려준다. 프론트는 사용자 입력이
정답과 편집거리 1이면서 이 목록에 있으면 "오타 허용"하지 않고 오답 처리한다
(반대로 목록에 없으면 오타로 보고 정답 처리 + typo:true를 /study/log에 실어 보낸다).

사전 단어 집합은 프로세스 메모리에 1회 캐시한다(dict 발행은 하루 몇 번 수준이라
런타임 중 갱신을 안 해도 실용상 문제없음 — 컨테이너 재시작 시 자연 갱신).
"""

from typing import List, Set

from app import db
from app.models.models import Voca

_WORD_SET_CACHE: Set[str] = None  # type: ignore[assignment]

_ALPHABET = 'abcdefghijklmnopqrstuvwxyz'


def _load_word_set() -> Set[str]:
    global _WORD_SET_CACHE
    if _WORD_SET_CACHE is None:
        rows = db.session.query(Voca.word).filter(Voca.word.isnot(None)).all()
        _WORD_SET_CACHE = {
            (w or '').strip().lower()
            for (w,) in rows
            if w and w.strip().isalpha()
        }
    return _WORD_SET_CACHE


def reset_word_set_cache() -> None:
    """테스트/수동 갱신용. 사전 발행 직후 필요하면 호출한다(현재 자동 훅 없음)."""
    global _WORD_SET_CACHE
    _WORD_SET_CACHE = None


def edits1(word: str) -> Set[str]:
    """word와 편집거리 1인 모든 문자열(삭제·인접 전치·치환·삽입) — Norvig spell-corrector 방식."""
    splits = [(word[:i], word[i:]) for i in range(len(word) + 1)]
    deletes    = [L + R[1:] for L, R in splits if R]
    transposes = [L + R[1] + R[0] + R[2:] for L, R in splits if len(R) > 1]
    replaces   = [L + c + R[1:] for L, R in splits if R for c in _ALPHABET]
    inserts    = [L + c + R for L, R in splits for c in _ALPHABET]
    return set(deletes) | set(transposes) | set(replaces) | set(inserts)


def blocked_typos_for(answer: str, *, word_set: Set[str] = None) -> List[str]:
    """정답 문자열의 편집거리 1 사전 단어 목록(정답 자신 제외). 알파벳 단어가 아니면 [].

    word_set을 넘기면 DB 캐시를 건너뛴다(순수 함수 테스트/스크립트용).
    """
    ans = (answer or '').strip().lower()
    if not ans or not ans.isalpha():
        return []
    ws = word_set if word_set is not None else _load_word_set()
    candidates = edits1(ans) & ws
    candidates.discard(ans)
    return sorted(candidates)
