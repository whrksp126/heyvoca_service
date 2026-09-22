"""
사용자 DB(heyvoca_user)의 서점 단어장 예문을 admin(사전 DB) 최신 데이터로 재동기화하는 스크립트.

배경: migrate_user_book_examples.py 는 "비어 있는" user_voca_book_map.voca_examples만
admin 데이터로 채웠다. 그 이후 admin 쪽(admin_voca_book_map)은 scripts/normalize_book_examples.py
로 강조 태그 정규화 + 빈/미태깅 meaning 보정을 거쳤지만, 구매 시점에 이미 (결함이 있는 상태로)
복사돼 있던 user_voca_book_map/user_voca 예문은 그 개선분을 물려받지 못한다. 이 스크립트는
"비어 있음"보다 넓은 "결함" 기준으로 user 쪽 예문을 다시 admin 데이터로 덮어써 동기화한다.

"결함(defective)" 판정 기준 — 다음 중 하나라도 해당하면 그 user_voca_book_map 행을
admin_voca_book_map의 예문으로 통째로 교체한다:
  - 예문이 비어 있는데(voca_examples가 NULL/''/'[]'/'null') admin에 채울 데이터가 있음
  - 항목 중 meaning이 빈 문자열인 예문이 있음
  - 항목 중 <span class="target-word"> 같은 구식 강조 변형이 남아 있음
  - admin 쪽 해당 voca의 예문이 하나라도 한국어 강조 태그가 있는데, user 쪽 meaning은
    강조 태그가 없음
  - {"en","ko"} 레거시 키가 남아 있음

교체 후 user_voca.voca_examples 에도 app.routes.voca_indexs.merge_examples 로 합산한다
(migrate_user_book_examples.py 와 동일한 합산 방식).

주의: 사용자 DB와 사전 DB는 서로 다른 스키마라 cross-schema FK가 없다.
UserVocaBook.bookstore_id는 그냥 정수 컬럼이다(FK 아님) — 반드시 애플리케이션에서 조인해야 한다.
voca_id 매칭이 안 되면 word 텍스트로 폴백한다(migrate_user_book_examples.py와 동일).

사용법 (컨테이너 내부에서):
  docker exec -it heyvoca_back_local python3 scripts/sync_user_book_examples.py [옵션]

옵션:
  --apply          DB 변경을 커밋한다(기본: dry-run, 롤백만)
  --user-id UUID   그 사용자의 데이터만 처리
"""

import argparse
import json
import os
import re
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ──────────────────────────────────────────
# 순수 함수 (DB 접근 없음 — 단위 테스트 대상. 다른 scripts/*.py 와 동일 규칙 자체 복제)
# ──────────────────────────────────────────

SPAN_TARGET_WORD_RE = re.compile(r'<span[^>]*class="target-word"[^>]*>', re.IGNORECASE)
STRONG_TARGET_WORD_RE = re.compile(r'<strong[^>]*class="target-word"[^>]*>', re.IGNORECASE)


def example_has_target_tag(text):
    """text 안에 표준 강조 태그(<strong class="target-word">)가 있는지."""
    if not text:
        return False
    return bool(STRONG_TARGET_WORD_RE.search(str(text)))


def example_en_ko(ex):
    """예문 dict에서 (en, ko) 쌍을 뽑아낸다. {'en','ko'}·{'origin','meaning'} 두 형식 모두 허용."""
    if not isinstance(ex, dict):
        return '', ''
    en = ex.get('en')
    if en is None:
        en = ex.get('origin', '')
    ko = ex.get('ko')
    if ko is None:
        ko = ex.get('meaning', '')
    return (en or '').strip(), (ko or '').strip()


def convert_legacy_examples(raw_json_text):
    """voca_examples 원문(JSON 문자열)을 표준 {"origin","meaning"} 형식 리스트로 변환.

    반환: (converted_list, changed: bool)
    파싱 불가하면 ValueError를 던진다.
    """
    try:
        items = json.loads(raw_json_text) if raw_json_text else []
    except (TypeError, ValueError) as e:
        raise ValueError(f'JSON 파싱 실패: {e}') from e

    if not isinstance(items, list):
        raise ValueError('voca_examples가 JSON 배열이 아님')

    converted = []
    changed = False
    for item in items:
        if not isinstance(item, dict):
            changed = True
            continue
        en, ko = example_en_ko(item)
        if not en and not ko:
            changed = True
            continue
        new_item = {'origin': en, 'meaning': ko}
        if set(item.keys()) != {'origin', 'meaning'} or item.get('origin') != en or item.get('meaning') != ko:
            changed = True
        converted.append(new_item)

    return converted, changed


def is_empty_examples_value(raw_value):
    """voca_examples 컬럼 값이 '예문 없음'으로 취급되는 값인지."""
    return raw_value is None or raw_value in ('', '[]', 'null')


def normalize_admin_examples(raw_json_text):
    """admin_voca_book_map.voca_examples를 표준 origin/meaning 리스트로 정규화(실패 시 빈 리스트)."""
    if is_empty_examples_value(raw_json_text):
        return []
    try:
        converted, _changed = convert_legacy_examples(raw_json_text)
    except ValueError:
        return []
    return converted


def is_defective_user_examples(user_raw_json_text, admin_examples):
    """user_voca_book_map.voca_examples 가 admin 데이터로 교체해야 할 '결함' 상태인지 판정.

    admin_examples: normalize_admin_examples()를 거친 표준 origin/meaning 리스트
                    (이 voca_id/word 에 대응하는 admin_voca_book_map 예문).
    """
    if is_empty_examples_value(user_raw_json_text):
        # 비어 있는데 admin에 채울 데이터가 있으면 결함(빈 데이터)으로 본다.
        return bool(admin_examples)

    try:
        items = json.loads(user_raw_json_text)
    except (TypeError, ValueError):
        return True
    if not isinstance(items, list) or not items:
        return True

    # admin 쪽에 이 voca의 한국어 강조 태그가 있는 예문이 하나라도 있으면, user 쪽 meaning도
    # 태그가 있어야 정상 — 없으면 결함으로 본다.
    admin_has_tagged_ko = any(
        example_has_target_tag(a.get('meaning', '')) for a in (admin_examples or [])
    )

    for ex in items:
        if not isinstance(ex, dict):
            return True
        if 'en' in ex or 'ko' in ex:
            return True
        origin = ex.get('origin') or ''
        meaning = ex.get('meaning') or ''
        if not meaning.strip():
            return True
        if SPAN_TARGET_WORD_RE.search(origin) or SPAN_TARGET_WORD_RE.search(meaning):
            return True
        if admin_has_tagged_ko and not example_has_target_tag(meaning):
            return True

    return False


# ──────────────────────────────────────────
# DB 처리 (main 안에서만 사용)
# ──────────────────────────────────────────

def _build_admin_lookup(db, Bookstore, AdminVocaBookMap, Voca, bookstore_ids):
    """bookstore_id → admin_voca_book_map을 voca_id/word 기준 dict로 구성."""
    bookstore_to_admin_book = {}
    if bookstore_ids:
        rows = (
            db.session.query(Bookstore.id, Bookstore.admin_voca_book_id)
            .filter(Bookstore.id.in_(bookstore_ids))
            .all()
        )
        bookstore_to_admin_book = {bs_id: admin_book_id for bs_id, admin_book_id in rows}

    admin_book_ids = {v for v in bookstore_to_admin_book.values() if v is not None}

    admin_by_voca_id = defaultdict(dict)       # admin_book_id -> {voca_id: examples}
    admin_by_word = defaultdict(dict)          # admin_book_id -> {word: examples}
    admin_voca_id_by_word = defaultdict(dict)  # admin_book_id -> {word: voca_id}

    if admin_book_ids:
        rows = (
            db.session.query(AdminVocaBookMap, Voca)
            .join(Voca, AdminVocaBookMap.voca_id == Voca.id)
            .filter(AdminVocaBookMap.book_id.in_(admin_book_ids))
            .all()
        )
        for bm, v in rows:
            examples = normalize_admin_examples(bm.voca_examples)
            if not examples:
                continue
            admin_by_voca_id[bm.book_id][v.id] = examples
            admin_by_word[bm.book_id][v.word] = examples
            admin_voca_id_by_word[bm.book_id][v.word] = v.id

    return bookstore_to_admin_book, admin_by_voca_id, admin_by_word, admin_voca_id_by_word


def _sync_user_maps(db, UserVocaBookMap, UserVoca, merge_examples, user_voca_books,
                     bookstore_to_admin_book, admin_by_voca_id, admin_by_word, admin_voca_id_by_word):
    """user_voca_book_map 중 '결함' 상태인 행을 admin 예문으로 교체 + user_voca 합산."""
    book_ids = [ub.id for ub in user_voca_books]
    maps_by_book = defaultdict(list)
    if book_ids:
        rows = (
            db.session.query(UserVocaBookMap, UserVoca)
            .outerjoin(UserVoca, UserVocaBookMap.user_voca_id == UserVoca.id)
            .filter(UserVocaBookMap.user_voca_book_id.in_(book_ids))
            .all()
        )
        for m, uv in rows:
            maps_by_book[m.user_voca_book_id].append((m, uv))

    synced_map_count = 0
    updated_uservoca_ids = set()
    no_admin_match_count = 0

    for ub in user_voca_books:
        admin_book_id = bookstore_to_admin_book.get(ub.bookstore_id)
        if not admin_book_id:
            continue
        by_voca_id = admin_by_voca_id.get(admin_book_id, {})
        by_word = admin_by_word.get(admin_book_id, {})
        voca_id_by_word = admin_voca_id_by_word.get(admin_book_id, {})

        for m, uv in maps_by_book.get(ub.id, []):
            if uv is None:
                continue

            admin_examples = None
            if uv.voca_id and uv.voca_id in by_voca_id:
                admin_examples = by_voca_id[uv.voca_id]
            elif uv.word and uv.word in by_word:
                admin_examples = by_word[uv.word]

            if not is_defective_user_examples(m.voca_examples, admin_examples):
                continue
            if not admin_examples:
                no_admin_match_count += 1
                continue

            m.voca_examples = json.dumps(admin_examples, ensure_ascii=False)
            uv.voca_examples = merge_examples(uv.voca_examples, admin_examples)
            synced_map_count += 1
            updated_uservoca_ids.add(uv.id)

            if not uv.voca_id:
                candidate = voca_id_by_word.get(uv.word) if uv.word else None
                if candidate:
                    uv.voca_id = candidate

    return synced_map_count, updated_uservoca_ids, no_admin_match_count


def main():
    parser = argparse.ArgumentParser(description='사용자 DB 서점 단어장 voca_examples를 admin 데이터로 재동기화')
    parser.add_argument('--apply', action='store_true', help='DB 변경을 커밋한다(기본: dry-run, 롤백만)')
    parser.add_argument('--user-id', default=None, help='그 사용자의 데이터만 처리 (UUID)')
    args = parser.parse_args()

    from uuid import UUID as UUIDType
    from app import create_app, db
    from app.models.models import UserVocaBook, UserVocaBookMap, UserVoca, Bookstore, AdminVocaBookMap, Voca
    from app.routes.voca_indexs import merge_examples

    user_id = None
    if args.user_id:
        try:
            user_id = UUIDType(args.user_id)
        except ValueError:
            print(f'잘못된 --user-id: {args.user_id}', file=sys.stderr)
            sys.exit(1)

    app = create_app()
    with app.app_context():
        ub_query = UserVocaBook.query.filter(UserVocaBook.bookstore_id.isnot(None))
        if user_id:
            ub_query = ub_query.filter(UserVocaBook.user_id == user_id)
        user_voca_books = ub_query.all()
        print(f'대상 서점 단어장(user_voca_book) 수: {len(user_voca_books)}')

        bookstore_ids = {ub.bookstore_id for ub in user_voca_books}
        (bookstore_to_admin_book, admin_by_voca_id,
         admin_by_word, admin_voca_id_by_word) = _build_admin_lookup(
            db, Bookstore, AdminVocaBookMap, Voca, bookstore_ids
        )

        synced_map_count, updated_uservoca_ids, no_admin_match_count = _sync_user_maps(
            db, UserVocaBookMap, UserVoca, merge_examples, user_voca_books,
            bookstore_to_admin_book, admin_by_voca_id, admin_by_word, admin_voca_id_by_word,
        )
        print(f'재동기화한 user_voca_book_map 수: {synced_map_count}')
        print(f'갱신한 user_voca 수: {len(updated_uservoca_ids)}')
        print(f'결함이지만 admin 매치 없어 건너뛴 행 수: {no_admin_match_count}')

        if args.apply:
            db.session.commit()
            print('DB 변경을 커밋했습니다.')
        else:
            db.session.rollback()
            print('[dry-run] DB 변경 없이 롤백했습니다. --apply 를 주면 반영됩니다.')


if __name__ == '__main__':
    main()
