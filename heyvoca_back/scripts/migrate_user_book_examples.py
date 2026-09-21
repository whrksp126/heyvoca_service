"""
사용자 DB(heyvoca_user)의 서점 단어장 예문 백필 + 형식 정규화 스크립트.

배경: 구매 시 admin_voca_book_map을 복사해서 만드는 user_voca_book_map/user_voca도
admin 쪽과 같은 문제(voca_examples 비어 있음 + en/ko·origin/meaning 형식 혼재)를
그대로 물려받았다. 사전 DB(heyvoca_dict)는 읽기만 하고, 쓰기는 사용자 DB에만 한다.

처리 단계:
  1. en/ko → origin/meaning 형식 정규화를 user_voca_book_map.voca_examples /
     user_voca.voca_examples 전체(--user-id 지정 시 그 사용자 것만)에 먼저 적용한다.
     merge_examples의 중복 판정 키가 origin/meaning이므로 합산(3단계)보다 반드시 먼저 해야 한다.
  2. bookstore_id가 있는 user_voca_book → bookstore.admin_voca_book_id → admin_voca_book_map을
     voca_id 기준/word 기준 dict로 구성(예문은 origin/meaning으로 정규화).
  3. 그 책의 user_voca_book_map 중 voca_examples가 비어 있고 admin에 예문이 있으면(voca_id
     우선, 없으면 word) 채우고, user_voca.voca_examples에도 merge_examples로 합산한다.
     user_voca.voca_id가 없고 admin map에 voca_id가 있으면 그것도 채운다.

주의: 사용자 DB와 사전 DB는 서로 다른 스키마라 cross-schema FK가 없다.
UserVocaBook.bookstore_id는 그냥 정수 컬럼이다(FK 아님) — 반드시 애플리케이션에서 조인해야 한다.

사용법 (컨테이너 내부에서):
  docker exec -it heyvoca_back_local python3 scripts/migrate_user_book_examples.py [옵션]

옵션:
  --dry-run          DB 변경 없이 집계 결과만 출력(롤백)
  --user-id UUID     그 사용자의 데이터만 처리
"""

import argparse
import json
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ──────────────────────────────────────────
# 순수 함수 (fill_admin_book_examples.py와 동일 규칙 — 실행 방식이 달라도 안전하도록 자체 복제)
# ──────────────────────────────────────────

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
    파싱 불가하면 ValueError를 던진다 — 호출부에서 경고 후 skip.
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


# ──────────────────────────────────────────
# DB 처리 (main 안에서만 사용)
# ──────────────────────────────────────────

def _convert_legacy_formats(db, UserVocaBookMap, UserVocaBook, UserVoca, user_id):
    """1단계: user_voca_book_map / user_voca의 voca_examples를 en/ko → origin/meaning으로 정규화."""
    map_query = UserVocaBookMap.query.filter(UserVocaBookMap.voca_examples.isnot(None))
    voca_query = UserVoca.query.filter(UserVoca.voca_examples.isnot(None))

    if user_id:
        map_query = map_query.join(
            UserVocaBook, UserVocaBookMap.user_voca_book_id == UserVocaBook.id
        ).filter(UserVocaBook.user_id == user_id)
        voca_query = voca_query.filter(UserVoca.user_id == user_id)

    converted_map = 0
    warned = 0
    for m in map_query.all():
        try:
            converted, changed = convert_legacy_examples(m.voca_examples)
        except ValueError as e:
            print(f'[경고] user_voca_book_map.id={m.id} voca_examples 파싱 실패: {e}, 건너뜁니다.')
            warned += 1
            continue
        if changed:
            m.voca_examples = json.dumps(converted, ensure_ascii=False) if converted else '[]'
            converted_map += 1

    converted_voca = 0
    for uv in voca_query.all():
        try:
            converted, changed = convert_legacy_examples(uv.voca_examples)
        except ValueError as e:
            print(f'[경고] user_voca.id={uv.id} voca_examples 파싱 실패: {e}, 건너뜁니다.')
            warned += 1
            continue
        if changed:
            uv.voca_examples = json.dumps(converted, ensure_ascii=False) if converted else '[]'
            converted_voca += 1

    return converted_map, converted_voca, warned


def _build_admin_lookup(db, Bookstore, AdminVocaBookMap, Voca, bookstore_ids):
    """2단계: bookstore_id → admin_voca_book_map을 voca_id/word 기준 dict로 구성."""
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


def _fill_user_maps(db, UserVocaBookMap, UserVoca, merge_examples, user_voca_books,
                     bookstore_to_admin_book, admin_by_voca_id, admin_by_word, admin_voca_id_by_word):
    """3단계: user_voca_book_map 채우기 + user_voca 합산."""
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

    filled_map_count = 0
    updated_uservoca_ids = set()

    for ub in user_voca_books:
        admin_book_id = bookstore_to_admin_book.get(ub.bookstore_id)
        if not admin_book_id:
            continue
        by_voca_id = admin_by_voca_id.get(admin_book_id, {})
        by_word = admin_by_word.get(admin_book_id, {})
        voca_id_by_word = admin_voca_id_by_word.get(admin_book_id, {})

        for m, uv in maps_by_book.get(ub.id, []):
            if not is_empty_examples_value(m.voca_examples):
                continue
            if uv is None:
                continue

            examples = None
            if uv.voca_id and uv.voca_id in by_voca_id:
                examples = by_voca_id[uv.voca_id]
            elif uv.word and uv.word in by_word:
                examples = by_word[uv.word]

            if not examples:
                continue

            m.voca_examples = json.dumps(examples, ensure_ascii=False)
            uv.voca_examples = merge_examples(uv.voca_examples, examples)
            filled_map_count += 1
            updated_uservoca_ids.add(uv.id)

            if not uv.voca_id:
                candidate = voca_id_by_word.get(uv.word) if uv.word else None
                if candidate:
                    uv.voca_id = candidate

    return filled_map_count, updated_uservoca_ids


def main():
    parser = argparse.ArgumentParser(description='사용자 DB 서점 단어장 voca_examples 백필 + 형식 정규화')
    parser.add_argument('--dry-run', action='store_true', help='DB 변경 없이 집계 결과만 출력(롤백)')
    parser.add_argument('--user-id', default=None, help='그 사용자의 데이터만 처리 (UUID)')
    args = parser.parse_args()

    from uuid import UUID as UUIDType
    from app import create_app, db
    from app.models.models import UserVocaBook, UserVocaBookMap, UserVoca, Bookstore, AdminVocaBookMap, Voca
    from app.routes.voca_indexs import merge_examples
    from sqlalchemy import or_

    user_id = None
    if args.user_id:
        try:
            user_id = UUIDType(args.user_id)
        except ValueError:
            print(f'잘못된 --user-id: {args.user_id}', file=sys.stderr)
            sys.exit(1)

    app = create_app()
    with app.app_context():
        # 1단계: en/ko → origin/meaning 정규화 (merge_examples보다 반드시 먼저)
        converted_map, converted_voca, warned = _convert_legacy_formats(
            db, UserVocaBookMap, UserVocaBook, UserVoca, user_id
        )
        print(f'en/ko → origin/meaning 변환 행 수: map {converted_map} / user_voca {converted_voca} (경고 {warned}건)')

        # 2단계: bookstore 단어장 admin 예문 dict 구성
        ub_query = UserVocaBook.query.filter(UserVocaBook.bookstore_id.isnot(None))
        if user_id:
            ub_query = ub_query.filter(UserVocaBook.user_id == user_id)
        user_voca_books = ub_query.all()

        bookstore_ids = {ub.bookstore_id for ub in user_voca_books}
        (bookstore_to_admin_book, admin_by_voca_id,
         admin_by_word, admin_voca_id_by_word) = _build_admin_lookup(
            db, Bookstore, AdminVocaBookMap, Voca, bookstore_ids
        )

        # 3단계: 채우기 + 합산
        filled_map_count, updated_uservoca_ids = _fill_user_maps(
            db, UserVocaBookMap, UserVoca, merge_examples, user_voca_books,
            bookstore_to_admin_book, admin_by_voca_id, admin_by_word, admin_voca_id_by_word,
        )
        print(f'채운 user_voca_book_map 수: {filled_map_count}')
        print(f'갱신한 user_voca 수: {len(updated_uservoca_ids)}')

        db.session.flush()
        book_ids = [ub.id for ub in user_voca_books]
        remaining_empty = 0
        if book_ids:
            remaining_empty = UserVocaBookMap.query.filter(
                UserVocaBookMap.user_voca_book_id.in_(book_ids)
            ).filter(
                or_(
                    UserVocaBookMap.voca_examples.is_(None),
                    UserVocaBookMap.voca_examples.in_(['', '[]', 'null']),
                )
            ).count()
        print(f'남은 빈 map 수(서점 책 기준): {remaining_empty}')

        if args.dry_run:
            db.session.rollback()
            print('[dry-run] DB 변경 없이 롤백했습니다.')
        else:
            db.session.commit()
            print('DB 변경을 커밋했습니다.')


if __name__ == '__main__':
    main()
