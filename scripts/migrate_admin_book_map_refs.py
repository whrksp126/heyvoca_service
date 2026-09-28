"""
admin_voca_book_map(사전 DB, heyvoca_dict)의 voca_meanings/voca_examples JSON 텍스트
컬럼을 새 참조 테이블(admin_voca_book_map_meaning / admin_voca_book_map_example)로
이관하는 1회성 스크립트.

배경: 2026-09 구조 개편 — 서점 단어장은 더 이상 뜻/예문을 텍스트로 복사해 갖지 않고,
사전(voca_meaning/voca_example)의 ID + 순서(ord)만 참조한다. 조회 시 사전과 join해
지금과 같은 응답 모양({'meanings': [str,...], 'examples': [{'origin','meaning'},...]})을
만든다. 기존 JSON 컬럼(voca_meanings/voca_examples)은 롤백 대비로 지우지 않는다.

매칭 규칙
  - 뜻: 그 voca_id의 voca_meaning_map 후보 중 텍스트(strip → 바깥쪽 큰따옴표 한 겹 제거 →
    다시 strip 후 완전일치) 매칭. 큰따옴표 제거는 원본 admin JSON에 `"매출"`처럼 따옴표가
    통째로 섞여 들어간 행이 있어서다(2026-09 로컬 이관 때 13건 발견 — 따옴표 때문에 이미
    사전에 있는 `매출`과 매칭 실패해 중복 생성됐던 걸 정정). 매칭 후보 텍스트 쪽에는 원래도
    따옴표가 없으므로 strip만 한다. 없으면 새 VocaMeaning을 만들어 voca_meaning_map으로
    연결한다(pos는 voca_label.pos가 있으면 채우고 없으면 NULL).
  - 알려진 오염 문자열(_CORRUPTED_MEANING_TEXTS — UI 에러 메시지가 실수로 "뜻"으로 저장된
    행, 2026-09 로컬 이관에서 voca_id=762/word=revenue에 2건 발견)은 뜻 목록에서 완전히
    건너뛴다(생성도 매칭도 하지 않음).
  - 예문: 그 voca_id의 voca_example_map 후보 중
    app.services.sentence_puzzle.normalize_sentence_text(정규화: 태그 제거 → 소문자 →
    문장부호 제거 → 공백 1개)가 같은 것을 매칭. 없으면 새 VocaExample을 만들어 연결한다.
    매칭은 됐지만 원문(강조 태그 위치 등)이 다르면 사전 텍스트는 바꾸지 않고
    건수와 표본만 보고한다 — 어느 쪽이 맞는지는 다음 단계에서 사람이 판단한다.
  - 한 admin_voca_book_map 행 안에서 같은 뜻/예문이 같은 meaning_id/example_id로
    중복 매칭되면(원문 중복) PK(map_id, meaning_id)/(map_id, example_id) 충돌을 피하기
    위해 두 번째부터는 건너뛰고 dup_skipped로 집계한다(표시 순서상 중복 항목 1개 소실 —
    이미 화면에도 중복 텍스트로 보이던 행이라 영향 미미, 통계로 건수 보고).
  - g.dict_lang='ja'인 admin_voca_book_map 행은 heyvoca_dict_ja라는 별도 schema에 있어
    이 스크립트가 접근하는 heyvoca_dict(en)에는 없다 — 이번 스크립트는 en만 다룬다.

멱등성: 이미 admin_voca_book_map_meaning/_example에 링크가 있는 map_id는 건너뛴다
(재실행 안전 — 부분 --apply 후 이어서 실행 가능).

사용법 (컨테이너 내부):
  docker exec heyvoca_back_local python3 scripts/migrate_admin_book_map_refs.py            # dry-run(기본)
  docker exec heyvoca_back_local python3 scripts/migrate_admin_book_map_refs.py --apply     # 실제 커밋
  --book-id ID   특정 admin_voca_book만 처리(검증용)
  --limit N      앞에서부터 N개 map 행만 처리(검증용)
  --sample N     텍스트 차이 표본 출력 개수(기본 10)
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def strip_or_empty(s):
    return (s or '').strip() if isinstance(s, str) else ''


def normalize_meaning_text(raw):
    """뜻 텍스트 정규화: strip → 바깥쪽 큰따옴표 한 겹 제거 → 다시 strip.

    원본 admin_voca_book_map.voca_meanings JSON에 `"매출"`처럼 값 전체가 따옴표로
    감싸인 항목이 섞여 있던 사례(2026-09 로컬 이관에서 13건 발견) 대응.
    """
    txt = strip_or_empty(raw)
    if len(txt) >= 2 and txt[0] == '"' and txt[-1] == '"':
        txt = txt[1:-1].strip()
    return txt


# UI 에러 메시지가 실수로 admin_voca_book_map.voca_meanings에 "뜻"으로 저장된 사례.
# 2026-09 로컬 이관에서 voca_id=762(word=revenue)에 2건 발견 — 뜻 목록에서 완전히 건너뛴다.
_CORRUPTED_MEANING_TEXTS = {
    '사전이 변경이 되어',
    '단어장에서 해당 단어를 학습하실 수 없습니다. 양해해 주시기 바랍니다.',
}


def main():
    parser = argparse.ArgumentParser(
        description='admin_voca_book_map JSON → 참조 테이블(meaning_id/example_id) 이관'
    )
    parser.add_argument('--apply', action='store_true', help='실제로 DB에 커밋(기본은 dry-run)')
    parser.add_argument('--book-id', type=int, default=None, help='특정 admin_voca_book만 처리')
    parser.add_argument('--limit', type=int, default=None, help='앞에서부터 N개 map 행만 처리')
    parser.add_argument('--sample', type=int, default=10, help='텍스트 차이 표본 출력 개수')
    args = parser.parse_args()

    from app import create_app, db
    from app.models.models import (
        AdminVocaBookMap, AdminVocaBookMapMeaning, AdminVocaBookMapExample,
        VocaLabel, VocaMeaning, VocaMeaningMap, VocaExample, VocaExampleMap,
    )
    from app.services.sentence_puzzle import normalize_sentence_text

    app = create_app()
    with app.app_context():
        q = AdminVocaBookMap.query
        if args.book_id:
            q = q.filter_by(book_id=args.book_id)
        q = q.order_by(AdminVocaBookMap.id.asc())
        if args.limit:
            q = q.limit(args.limit)
        rows = q.all()

        already = {mid for (mid,) in db.session.query(AdminVocaBookMapMeaning.map_id).distinct()}
        already |= {mid for (mid,) in db.session.query(AdminVocaBookMapExample.map_id).distinct()}

        stats = {
            'rows_total': len(rows),
            'rows_processed': 0,
            'rows_skipped_existing': 0,
            'meanings_matched': 0,
            'meanings_created': 0,
            'meanings_created_with_pos': 0,
            'meanings_dup_skipped': 0,
            'meanings_corrupted_skipped': 0,
            'examples_matched': 0,
            'examples_text_diff': 0,
            'examples_created': 0,
            'examples_dup_skipped': 0,
        }
        text_diff_samples = []

        meaning_cache = {}   # voca_id -> list[[meaning_id, text]]  (mutable list so appends are visible)
        example_cache = {}   # voca_id -> list[[example_id, exam_en, norm]]
        label_cache = {}     # voca_id -> pos or None
        dry_id_seq = 0       # dry-run 전용 음수 placeholder id 생성기(생성 뜻/예문마다 유일)

        def next_dry_id():
            nonlocal dry_id_seq
            dry_id_seq -= 1
            return dry_id_seq

        for m in rows:
            if m.id in already:
                stats['rows_skipped_existing'] += 1
                continue
            stats['rows_processed'] += 1
            voca_id = m.voca_id
            if voca_id is None:
                continue

            # ── 뜻 ──
            try:
                meanings = json.loads(m.voca_meanings) if m.voca_meanings else []
            except Exception:
                meanings = []
            if not isinstance(meanings, list):
                meanings = []

            if voca_id not in meaning_cache:
                cand = (
                    db.session.query(VocaMeaningMap.meaning_id, VocaMeaning.meaning)
                    .join(VocaMeaning, VocaMeaning.id == VocaMeaningMap.meaning_id)
                    .filter(VocaMeaningMap.voca_id == voca_id)
                    .all()
                )
                meaning_cache[voca_id] = [[mid, text] for mid, text in cand]

            used_meaning_ids = set()
            meaning_links = []
            ordv = 0
            for raw in meanings:
                txt = normalize_meaning_text(raw)
                if not txt:
                    continue
                if txt in _CORRUPTED_MEANING_TEXTS:
                    stats['meanings_corrupted_skipped'] += 1
                    continue
                match_id = None
                for mid, mtext in meaning_cache[voca_id]:
                    if mid not in used_meaning_ids and strip_or_empty(mtext) == txt:
                        match_id = mid
                        break

                if match_id is None:
                    if voca_id not in label_cache:
                        lbl = VocaLabel.query.get(voca_id)
                        label_cache[voca_id] = lbl.pos if lbl else None
                    pos_val = label_cache[voca_id]
                    if args.apply:
                        vm = VocaMeaning(meaning=txt, pos=pos_val)
                        db.session.add(vm)
                        db.session.flush()
                        match_id = vm.id
                        db.session.add(VocaMeaningMap(voca_id=voca_id, meaning_id=match_id))
                        meaning_cache[voca_id].append([match_id, txt])
                    else:
                        match_id = next_dry_id()
                    stats['meanings_created'] += 1
                    if pos_val:
                        stats['meanings_created_with_pos'] += 1
                else:
                    stats['meanings_matched'] += 1

                if match_id in used_meaning_ids:
                    stats['meanings_dup_skipped'] += 1
                    continue
                used_meaning_ids.add(match_id)
                meaning_links.append((match_id, ordv))
                ordv += 1

            if args.apply:
                for mid, ov in meaning_links:
                    db.session.add(AdminVocaBookMapMeaning(map_id=m.id, meaning_id=mid, ord=ov))

            # ── 예문 ──
            try:
                examples = json.loads(m.voca_examples) if m.voca_examples else []
            except Exception:
                examples = []
            if not isinstance(examples, list):
                examples = []

            if voca_id not in example_cache:
                cand = (
                    db.session.query(VocaExampleMap.example_id, VocaExample.exam_en)
                    .join(VocaExample, VocaExample.id == VocaExampleMap.example_id)
                    .filter(VocaExampleMap.voca_id == voca_id)
                    .all()
                )
                example_cache[voca_id] = [
                    [eid, en, normalize_sentence_text(en)] for eid, en in cand
                ]

            used_example_ids = set()
            example_links = []
            ordv = 0
            for ex in examples:
                if not isinstance(ex, dict):
                    continue
                origin = strip_or_empty(ex.get('origin', ex.get('en')))
                meaning_txt = strip_or_empty(ex.get('meaning', ex.get('ko')))
                if not origin and not meaning_txt:
                    continue
                norm = normalize_sentence_text(origin)

                match_id = None
                match_dict_origin = None
                for eid, en, enorm in example_cache[voca_id]:
                    if eid not in used_example_ids and enorm == norm:
                        match_id = eid
                        match_dict_origin = en
                        break

                if match_id is None:
                    if args.apply:
                        ve = VocaExample(exam_en=origin or None, exam_ko=meaning_txt or None)
                        db.session.add(ve)
                        db.session.flush()
                        match_id = ve.id
                        db.session.add(VocaExampleMap(voca_id=voca_id, example_id=match_id))
                        example_cache[voca_id].append([match_id, origin, norm])
                    else:
                        match_id = next_dry_id()
                    stats['examples_created'] += 1
                else:
                    stats['examples_matched'] += 1
                    if (match_dict_origin or '').strip() != origin:
                        stats['examples_text_diff'] += 1
                        if len(text_diff_samples) < args.sample:
                            text_diff_samples.append({
                                'map_id': m.id, 'voca_id': voca_id,
                                'admin_origin': origin, 'dict_origin': match_dict_origin,
                            })

                if match_id in used_example_ids:
                    stats['examples_dup_skipped'] += 1
                    continue
                used_example_ids.add(match_id)
                example_links.append((match_id, ordv))
                ordv += 1

            if args.apply:
                for eid, ov in example_links:
                    db.session.add(AdminVocaBookMapExample(map_id=m.id, example_id=eid, ord=ov))
                if stats['rows_processed'] % 500 == 0:
                    db.session.flush()

        print(json.dumps(stats, indent=2, ensure_ascii=False))
        if text_diff_samples:
            print('\n예문 텍스트 차이 표본:')
            for s in text_diff_samples:
                print(json.dumps(s, ensure_ascii=False))

        if args.apply:
            db.session.commit()
            print('\n커밋 완료.')
        else:
            db.session.rollback()
            print('\n[dry-run] DB 변경 없이 롤백했습니다.')


if __name__ == '__main__':
    main()
