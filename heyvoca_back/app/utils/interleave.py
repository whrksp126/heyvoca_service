"""
utils/interleave.py — 음성/형태소 유사 단어 인접 회피 인터리빙.

Phase 2.2: 임베딩 없이 단순 휴리스틱 사용.

그룹화 기준 (OR 조건):
  1. 첫 3글자 동일 (길이 >= 4인 단어)
  2. 길이 차이 ±2 이내 + 첫 글자 동일 + 길이 >= 4

인터리빙 알고리즘:
  - 각 아이템에 group_key 부여
  - 같은 group_key 단어가 연속되지 않도록 재배치
  - 연속 배치가 불가피하면 그냥 넣음 (완전한 인터리빙 보장 X, 최선)
"""

from typing import List, TypeVar, Optional

T = TypeVar("T")


def _group_key(word: str) -> Optional[str]:
    """
    단어 → 그룹 키.
    길이 < 4 이면 None (그룹화 안 함, 인접 허용).
    """
    w = word.lower().strip()
    if len(w) < 4:
        return None
    return w[:3]


def _morpheme_group_key(word: str) -> Optional[str]:
    """
    보조 그룹 키: 첫 글자 + 길이 버킷.
    길이 차이 ±2 이내 + 첫 글자 같은 단어를 같은 그룹으로 묶기 위한 근사.
    길이를 2 단위 버킷으로 묶음 (예: len 5,6 → 버킷 2; len 7,8 → 버킷 3).
    """
    w = word.lower().strip()
    if len(w) < 4:
        return None
    length_bucket = len(w) // 2
    return f"{w[0]}:{length_bucket}"


def get_group_key(word: str) -> str:
    """
    최종 그룹 키 결정.
    prefix 3글자 키가 있으면 우선 사용.
    없으면 형태소 버킷 키.
    None이면 단어 자체를 고유 키로 사용 (그룹 없음).
    """
    pk = _group_key(word)
    if pk is not None:
        return f"prefix:{pk}"
    mk = _morpheme_group_key(word)
    if mk is not None:
        return f"morph:{mk}"
    return f"solo:{word}"


def interleave_avoid_adjacent(items: list, get_word) -> list:
    """
    items를 재배치하여 같은 그룹의 단어가 인접하지 않도록 함.

    Args:
        items:    재배치할 객체 리스트
        get_word: 각 아이템에서 단어(str)를 가져오는 callable (예: lambda it: it.word)

    Returns:
        재배치된 리스트 (원본 items 불변, 새 리스트 반환)

    알고리즘:
      1. 각 아이템에 group_key 부여
      2. 순서대로 배치하되, 직전 아이템과 group_key가 같으면
         "충돌 없는 첫 번째 후보"와 스왑
      3. 스왑 후보가 없으면 그냥 배치 (최선)
    """
    if not items:
        return []

    result = list(items)
    n = len(result)

    for i in range(1, n):
        prev_key = get_group_key(get_word(result[i - 1]))
        curr_key = get_group_key(get_word(result[i]))

        if prev_key == curr_key:
            # 현재 위치에서 뒤쪽으로 충돌 없는 첫 번째 후보와 스왑
            swapped = False
            for j in range(i + 1, n):
                cand_key = get_group_key(get_word(result[j]))
                if cand_key != prev_key:
                    result[i], result[j] = result[j], result[i]
                    swapped = True
                    break
            # swapped=False면 그냥 유지 (불가피한 인접)

    return result
