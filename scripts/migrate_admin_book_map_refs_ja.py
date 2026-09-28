"""
admin_voca_book_map(사전 DB, heyvoca_dict_ja)의 voca_meanings/voca_examples JSON 텍스트
컬럼을 참조 테이블(admin_voca_book_map_meaning / admin_voca_book_map_example)로 이관하는
1회성 스크립트 — scripts/migrate_admin_book_map_refs.py(en)의 ja 버전.

배경: 2026-09 구조 개편(en, 1cc2960) — 서점 단어장은 더 이상 뜻/예문을 텍스트로 복사해
갖지 않고, 사전(voca_meaning/voca_example)의 ID + 순서(ord)만 참조한다. 2026-09-29에
같은 구조를 ja(heyvoca_dict_ja)로 확장한다(admin_voca_book_map_meaning/_example 테이블을
ja schema에도 추가 — db/dict_ja/scripts/schema_dict_ja.sql, .claude/rules/db-migration.md).
기존 JSON 컬럼(voca_meanings/voca_examples)은 en과 마찬가지로 롤백 대비로 지우지 않는다.

en 스크립트와의 차이
  - g.dict_lang='ja'로 고정해야 __bind_key__='dict' 쿼리가 heyvoca_dict_ja로 라우팅된다
    (app/__init__.py RoutingSession — schema_translate_map, app/utils/dict_lang.py).
  - en은 `sentence_puzzle.normalize_sentence_text`(영어 소문자화+공백 정규화)를 쓰지만,
    ja는 공백이 의미 단위가 아니라 전각/반각 공백·구두점(、。！？「」『』・…()「」 등)을
    전부 제거하는 `normalize_ja_text`로 비교한다(exact match를 우선 시도하고, 실패하면
    normalize_ja_text로 재시도).
  - 예문을 새로 만들 때(사전에 없어 VocaExample을 새로 생성) en에는 없는 1:1 확장 테이블
    `voca_example_ja`(reading_tokens 등)도 같이 만든다. admin JSON에 이미 reading_tokens가
    박혀 있으므로(60_make_jlpt_books.py) 그대로 옮긴다 — 안 만들면 이관 후
    app/services/admin_book_refs.load_admin_book_texts가 reading_tokens를 못 찾는다
    (voca_example_ja join 기반이라).

매칭 규칙(요약, en과 동일한 원칙)
  - 뜻: 그 voca_id의 voca_meaning_map 후보 중 완전일치(strip) 우선, 실패하면
    normalize_ja_text 일치. 둘 다 실패하면 새 VocaMeaning 생성(pos는 voca_label.pos가
    있으면 채우고 없으면 NULL — 2026-09-29 기준 heyvoca_dict_ja.voca_label은 비어 있어
    항상 NULL).
  - 예문: voca_example_map 후보 중 origin 완전일치 우선, 실패하면 normalize_ja_text 일치.
    둘 다 실패하면 새 VocaExample + VocaExampleJa(source='generated') 생성.
    매칭은 됐지만 원문(강조 태그 등)이 다르면 사전 텍스트는 바꾸지 않고 건수·표본만 보고.
  - 한 admin_voca_book_map 행 안에서 같은 meaning_id/example_id가 중복 매칭되면 두 번째부터
    dup_skipped로 집계(en과 동일).

멱등성: 이미 admin_voca_book_map_meaning/_example에 링크가 있는 map_id는 건너뛴다.

사용법 (컨테이너 내부 — scripts/는 docker-compose.local.yml에 ./scripts:/app/scripts:ro로
마운트되어 있어 heyvoca_back/scripts/보다 이 경로에 둬야 컨테이너 안에서 보인다):
  docker exec heyvoca_back_local python3 scripts/migrate_admin_book_map_refs_ja.py            # dry-run
  docker exec heyvoca_back_local python3 scripts/migrate_admin_book_map_refs_ja.py --apply     # 실제 커밋
  --book-id ID   특정 admin_voca_book만 처리(검증용)
  --limit N      앞에서부터 N개 map 행만 처리(검증용)
  --sample N     텍스트 차이/매칭 실패 표본 출력 개수(기본 10)
"""

import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_TAG_RE = re.compile(r'<[^>]+>')
_JA_STRIP_RE = re.compile(
    r'[\s　.,!?;:：；、。！？·・…"\'“”‘’「」『』（）()\[\]【】\-—―~〜]+'
)


def strip_or_empty(s):
    return (s or '').strip() if isinstance(s, str) else ''


def normalize_ja_text(raw):
    """태그 제거 → 공백/구두점(전각 포함) 전부 제거. 일본어/한국어 둘 다 공백이 의미
    단위가 아니라서 en의 '공백 하나로 정규화' 대신 '전부 제거'로 비교한다."""
    if not raw:
        return ''
    s = _TAG_RE.sub('', str(raw))
    s = _JA_STRIP_RE.sub('', s)
    return s


def find_match(text, candidates, used_ids, key_fn=strip_or_empty):
    """candidates: list[[id, raw_text]]. 완전일치(strip) 우선, 실패하면 normalize_ja_text 일치.
    반환: (match_id, matched_raw_text, method) | (None, None, None)."""
    txt = strip_or_empty(text)
    for cid, ctext in candidates:
        if cid not in used_ids and strip_or_empty(ctext) == txt:
            return cid, ctext, 'exact'
    norm = normalize_ja_text(text)
    if norm:
        for cid, ctext in candidates:
            if cid not in used_ids and normalize_ja_text(ctext) == norm:
                return cid, ctext, 'normalized'
    return None, None, None


def main():
    parser = argparse.ArgumentParser(
        description='admin_voca_book_map(ja) JSON → 참조 테이블(meaning_id/example_id) 이관'
    )
    parser.add_argument('--apply', action='store_true', help='실제로 DB에 커밋(기본은 dry-run)')
    parser.add_argument('--book-id', type=int, default=None, help='특정 admin_voca_book만 처리')
    parser.add_argument('--limit', type=int, default=None, help='앞에서부터 N개 map 행만 처리')
    parser.add_argument('--sample', type=int, default=10, help='텍스트 차이/매칭 실패 표본 개수')
    args = parser.parse_args()

    from app import create_app, db
    from app.utils.dict_lang import set_dict_lang
    from app.models.models import (
        AdminVocaBookMap, AdminVocaBookMapMeaning, AdminVocaBookMapExample,
        VocaLabel, VocaMeaning, VocaMeaningMap, VocaExample, VocaExampleMap, VocaExampleJa,
    )

    app = create_app()
    with app.app_context():
        set_dict_lang('ja')  # __bind_key__='dict' 쿼리를 heyvoca_dict_ja로 라우팅(RoutingSession)

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
            'meanings_matched_exact': 0,
            'meanings_matched_normalized': 0,
            'meanings_created': 0,
            'meanings_created_with_pos': 0,
            'meanings_dup_skipped': 0,
            'examples_matched_exact': 0,
            'examples_matched_normalized': 0,
            'examples_text_diff': 0,
            'examples_created': 0,
            'examples_dup_skipped': 0,
        }
        text_diff_samples = []
        created_meaning_samples = []
        created_example_samples = []

        meaning_cache = {}   # voca_id -> list[[meaning_id, text]]
        example_cache = {}   # voca_id -> list[[example_id, exam_en]]
        label_cache = {}     # voca_id -> pos or None
        dry_id_seq = 0

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
                txt = strip_or_empty(raw)
                if not txt:
                    continue

                match_id, _matched_text, method = find_match(txt, meaning_cache[voca_id], used_meaning_ids)

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
                    if len(created_meaning_samples) < args.sample:
                        created_meaning_samples.append({'map_id': m.id, 'voca_id': voca_id, 'text': txt})
                elif method == 'exact':
                    stats['meanings_matched_exact'] += 1
                else:
                    stats['meanings_matched_normalized'] += 1

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
                example_cache[voca_id] = [[eid, en] for eid, en in cand]

            used_example_ids = set()
            example_links = []
            ordv = 0
            for ex in examples:
                if not isinstance(ex, dict):
                    continue
                origin = strip_or_empty(ex.get('origin', ex.get('en')))
                meaning_txt = strip_or_empty(ex.get('meaning', ex.get('ko')))
                reading_tokens = ex.get('reading_tokens')
                if not origin and not meaning_txt:
                    continue

                match_id, matched_origin, method = find_match(origin, example_cache[voca_id], used_example_ids)

                if match_id is None:
                    if args.apply:
                        ve = VocaExample(exam_en=origin or None, exam_ko=meaning_txt or None)
                        db.session.add(ve)
                        db.session.flush()
                        match_id = ve.id
                        db.session.add(VocaExampleMap(voca_id=voca_id, example_id=match_id))
                        # ja 확장 테이블 — 없으면 admin_book_refs.load_admin_book_texts가
                        # reading_tokens를 못 붙인다(voca_example_ja join 기반).
                        db.session.add(VocaExampleJa(
                            example_id=match_id, source='generated',
                            reading_tokens=reading_tokens if isinstance(reading_tokens, list) else None,
                        ))
                        example_cache[voca_id].append([match_id, origin])
                    else:
                        match_id = next_dry_id()
                    stats['examples_created'] += 1
                    if len(created_example_samples) < args.sample:
                        created_example_samples.append({'map_id': m.id, 'voca_id': voca_id, 'origin': origin})
                else:
                    if method == 'exact':
                        stats['examples_matched_exact'] += 1
                    else:
                        stats['examples_matched_normalized'] += 1
                    if (matched_origin or '').strip() != origin:
                        stats['examples_text_diff'] += 1
                        if len(text_diff_samples) < args.sample:
                            text_diff_samples.append({
                                'map_id': m.id, 'voca_id': voca_id,
                                'admin_origin': origin, 'dict_origin': matched_origin,
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
        if created_meaning_samples:
            print('\n사전에 없어 새로 만든 뜻 표본:')
            for s in created_meaning_samples:
                print(json.dumps(s, ensure_ascii=False))
        if created_example_samples:
            print('\n사전에 없어 새로 만든 예문 표본:')
            for s in created_example_samples:
                print(json.dumps(s, ensure_ascii=False))

        if args.apply:
            db.session.commit()
            print('\n커밋 완료.')
        else:
            db.session.rollback()
            print('\n[dry-run] DB 변경 없이 롤백했습니다.')


if __name__ == '__main__':
    main()
