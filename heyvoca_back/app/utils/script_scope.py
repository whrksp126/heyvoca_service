"""'글자 밭'(히라가나/가타카나/알파벳) 단어장 제외 공용 헬퍼 (2026-09).

글자는 UserVoca/UserVocaGame/FSRS를 일반 단어와 완전히 같은 경로로 쓴다(농장 성장·XP
포함) — 다만 **복습·농장 표시는 분리**한다(사용자 결정). 글자 UserVoca는 오직
`UserVocaBook.book_kind == 'script'` 인 단어장(사용자당 스크립트별 1권, `script_key`로
구분)에만 매핑되므로, "지금 이 user_voca_id가 글자인가"는 UserVocaBookMap을 거쳐
UserVocaBook.book_kind로 판별한다(UserVoca/UserVocaGame 자체에는 book 정보가 없다).

이 모듈은 **읽기 전용 조회**에서만 쓴다 — 글자 자체의 학습(FSRS 반영, 게임 훅)은
그대로 `/study/log`를 타야 하므로 거기서는 제외하지 않는다.
"""

from app import db
from app.models.models import UserVocaBook, UserVocaBookMap

BOOK_KIND_SCRIPT = 'script'
BOOK_KIND_NORMAL = 'normal'


def script_user_voca_ids_subquery(user_id):
    """이 사용자의 글자 단어장(book_kind='script')에 매핑된 user_voca_id 집합(select).

    농장/추천/통계 등 '단어' 집계 쿼리에 `.filter(~UserVocaGame.user_voca_id.in_(subq))`
    (또는 `UserVoca.id.notin_(subq)`) 형태로 덧붙여 쓴다. `.subquery()`가 아니라
    `.selectable`(SQLAlchemy 1.4 `Select`)을 돌려준다 — `.subquery()`를 그대로
    `.in_()`에 넘기면 "Coercing Subquery object into a select()" 경고가 매 쿼리마다 난다.
    """
    return (
        db.session.query(UserVocaBookMap.user_voca_id)
        .join(UserVocaBook, UserVocaBook.id == UserVocaBookMap.user_voca_book_id)
        .filter(UserVocaBook.user_id == user_id, UserVocaBook.book_kind == BOOK_KIND_SCRIPT)
        .selectable
    )
