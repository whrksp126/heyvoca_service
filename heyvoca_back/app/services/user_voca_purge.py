"""
user_voca_purge.py — 어느 단어장에도 남지 않은 사용자 단어(UserVoca) 정리 공용 규칙.

단어장 통째 삭제(user_voca_book.delete_user_voca_book, voca_books.delete_voca_book),
단어장에서 단어 빼기(voca_indexs.delete_voca_index_book), 단어 관리 모드 일괄 삭제
(voca_books.delete_vocas_from_book)가 모두 같은 규칙을 쓴다:

  - 다른 단어장 매핑(user_voca_book_map)이 남아 있으면 단어는 그대로 둔다(매핑만 빠진다).
  - 하나도 없으면 FK 자식(user_voca_game) → 단어별 문장 노출 기록(user_example_seen) →
    UserVoca 순으로 지운다. UserVoca.data 에 FSRS 상태가 들어 있으므로 이것으로 그 단어의
    학습 상태가 사용자에게서 사라진다.

user_study_log·farm_event_log·user_farm_item_log·content_report 는 지우지 않는다.
날짜별 학습량·연속 학습·오늘 새 씨앗 수가 이 로그를 세므로, 지우면 이미 지나간 하루의
기록이 바뀐다. 이 행들은 user_voca 를 FK 로 묶지 않아(파티션·감사 로그) 단어를 되살리지 않는다.

호출 규약: begin_user_tx(user_id) 로 연 트랜잭션 안에서, 매핑 삭제를 flush 한 **뒤** 부른다.
커밋은 호출부가 한다. 커밋 뒤에는 invalidate_user_word_caches(user_id) 로 추천 풀 캐시를
비운다 — 비우지 않으면 30초 동안 지운 단어가 '새 씨앗 심기'·추천 학습에 그대로 나온다.
"""

from app.models.models import db, UserVoca, UserVocaBookMap, UserVocaGame, UserExampleSeen


def purge_orphan_user_vocas(user_id, user_voca_ids) -> int:
    """user_voca_ids 중 어느 단어장 매핑도 남지 않은 단어를 지우고 지운 수를 돌려준다."""
    ids = {int(i) for i in (user_voca_ids or []) if i is not None}
    if not ids:
        return 0

    still_mapped = {
        row[0] for row in db.session.query(UserVocaBookMap.user_voca_id)
        .filter(UserVocaBookMap.user_voca_id.in_(ids))
        .distinct()
        .all()
    }
    # 다른 사용자의 단어 id 가 섞여 들어와도 지우지 않도록 소유자로 한 번 더 거른다.
    orphan_ids = [
        row[0] for row in db.session.query(UserVoca.id)
        .filter(UserVoca.id.in_(ids - still_mapped), UserVoca.user_id == user_id)
        .all()
    ]
    if not orphan_ids:
        return 0

    # 농장 게임 행(user_voca_game)이 user_voca_id 를 FK 로 참조한다(cascade 없음).
    # 먼저 지우지 않으면 학습(심기)까지 한 단어의 UserVoca 삭제가 IntegrityError(1451)로 통째로 실패한다.
    db.session.query(UserVocaGame).filter(
        UserVocaGame.user_voca_id.in_(orphan_ids),
        UserVocaGame.user_id == user_id,
    ).delete(synchronize_session=False)
    db.session.query(UserExampleSeen).filter(
        UserExampleSeen.user_voca_id.in_(orphan_ids),
        UserExampleSeen.user_id == user_id,
    ).delete(synchronize_session=False)
    db.session.query(UserVoca).filter(
        UserVoca.id.in_(orphan_ids),
        UserVoca.user_id == user_id,
    ).delete(synchronize_session=False)
    return len(orphan_ids)


def invalidate_user_word_caches(user_id) -> None:
    """단어·단어장 구성이 바뀐 뒤(커밋 후) 부른다. 실패해도 조용히 넘어간다(TTL 30초 자연 만료)."""
    try:
        from app.services.recommend.pool import invalidate_pool_cache
        invalidate_pool_cache(user_id)
    except Exception:
        pass
