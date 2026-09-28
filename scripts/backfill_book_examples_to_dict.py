"""
admin_voca_book_map.voca_examples(JSON [{origin, meaning}]) 중 voca_example
테이블에 없는 문장을 사전(voca_example / voca_example_map)에 백필하는 스크립트.

배경: admin_voca_book_map.voca_examples 는 admin 서점 단어장 발행 시 생성된 예문
스냅샷(원문에 target-word 강조 태그 포함)으로, voca_example 테이블과는 별개로 관리돼
왔다. 이 중 voca_example 에 없는 문장(고유 기준 약 2,769개)은 voca_example_puzzle
(문장 조각 문제) 생성 대상에서 빠진다. 이 스크립트는 그 문장들을 voca_example 에
append(신규 INSERT)하고 voca_example_map 으로 연결한다.

문장 동일성 판정: app/services/sentence_puzzle.py 의 sentence_hash
(태그 제거 → 소문자 → 문장부호 제거 → 공백 정규화).

동작 개요:
  1. voca_example 전체를 읽어 sentence_hash -> id 맵을 만든다(정본).
  2. admin_voca_book_map 전체 행을 순회하며 voca_examples JSON 의 각 원소
     (origin, meaning)을 처리한다.
     - hash 가 기존 voca_example 에 있으면 그 id 를 쓴다.
     - 없으면 새 voca_example 을 만든다(exam_en=origin 원문 그대로 태그 포함,
       exam_ko=meaning). 같은 hash 가 여러 행에 나오면 한 번만 INSERT(먼저 나온
       origin/meaning 을 사용).
     - (voca_id, example_id) 연결이 voca_example_map 에 없으면 추가한다
       (새로 만든 example 이든 기존 example 이든 동일하게 적용).
  3. voca.id / 기존 voca_example.id 는 절대 건드리지 않는다(append-only).
     admin_voca_book_map.voca_examples JSON 은 이번에는 수정하지 않는다.

기본은 dry-run. --apply 를 줘야 실제 반영한다.

사용법(컨테이너 내부):
  docker exec -it heyvoca_back_local python3 scripts/backfill_book_examples_to_dict.py           # dry-run
  docker exec -it heyvoca_back_local python3 scripts/backfill_book_examples_to_dict.py --apply    # 실제 반영

--apply 시 새로 추가된 voca_example 을 {"id","en","ko"} 배열로 /tmp/new_examples.json 에
저장한다(en/ko 는 태그 포함 원문).
"""

import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db
from app.models.models import AdminVocaBookMap, VocaExample, VocaExampleMap
from app.services.sentence_puzzle import sentence_hash

TARGET_TAG_RE = re.compile(r'<strong[^>]*class="target-word"[^>]*>', re.IGNORECASE)

OUTPUT_PATH = '/tmp/new_examples.json'


def has_target_tag(text):
    return bool(text) and bool(TARGET_TAG_RE.search(text))


def main():
    parser = argparse.ArgumentParser(
        description='admin_voca_book_map 예문 → voca_example/voca_example_map 백필 (dry-run 기본)'
    )
    parser.add_argument('--apply', action='store_true', help='실제로 DB에 반영(기본은 dry-run)')
    parser.add_argument('--batch-size', type=int, default=500, help='commit 배치 크기(기본 500)')
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        print('voca_example 로딩 중...')
        existing_examples = db.session.query(VocaExample.id, VocaExample.exam_en).all()
        hash_to_id = {}
        for ex_id, exam_en in existing_examples:
            h = sentence_hash(exam_en)
            if h and h not in hash_to_id:
                hash_to_id[h] = ex_id
        print(f'기존 voca_example: {len(existing_examples)}건, 고유 hash: {len(hash_to_id)}건')

        print('voca_example_map 로딩 중...')
        existing_links = set(
            db.session.query(VocaExampleMap.voca_id, VocaExampleMap.example_id).all()
        )
        print(f'기존 연결: {len(existing_links)}건')

        rows = AdminVocaBookMap.query.filter(AdminVocaBookMap.voca_examples.isnot(None)).all()
        print(f'admin_voca_book_map 대상 행: {len(rows)}건')

        # 새로 추가할 voca_example: hash -> {'exam_en':..., 'exam_ko':...}
        new_examples = {}
        # 연결 후보: (voca_id, hash) 리스트 (순서 보존, 중복 허용 — 나중에 dedupe)
        link_candidates = []

        bad_rows = 0
        no_tag_count = 0
        total_items = 0

        for row in rows:
            if row.voca_id is None:
                bad_rows += 1
                continue
            try:
                items = json.loads(row.voca_examples)
            except Exception:
                bad_rows += 1
                continue
            if not isinstance(items, list):
                bad_rows += 1
                continue
            for item in items:
                if not isinstance(item, dict):
                    continue
                origin = item.get('origin')
                meaning = item.get('meaning')
                if not origin:
                    continue
                total_items += 1
                h = sentence_hash(origin)
                if not h:
                    continue
                if h not in hash_to_id and h not in new_examples:
                    new_examples[h] = {'exam_en': origin, 'exam_ko': meaning}
                    if not has_target_tag(origin):
                        no_tag_count += 1
                link_candidates.append((row.voca_id, h))

        print(f'JSON 파싱 실패/voca_id 없음 행: {bad_rows}건')
        print(f'예문 항목 총합: {total_items}건')
        print(f'voca_example에 없어 새로 추가할 고유 문장: {len(new_examples)}건')
        print(f'  (그중 target-word 강조 태그 없음: {no_tag_count}건)')

        if not args.apply:
            would_link = 0
            for voca_id, h in link_candidates:
                ex_id = hash_to_id.get(h)
                if ex_id is None:
                    would_link += 1  # 신규 example -> 무조건 신규 연결
                elif (voca_id, ex_id) not in existing_links:
                    would_link += 1
            print(f'[dry-run] 새로 생길 연결(voca_example_map) 예상: {would_link}건')
            print('[dry-run] DB 변경 없이 종료합니다. 실제 반영하려면 --apply를 붙이세요.')
            return

        inserted_examples = []  # [{'id','en','ko'}]
        new_links = 0
        try:
            # 1) 새 voca_example insert
            hash_items = list(new_examples.items())
            for i in range(0, len(hash_items), args.batch_size):
                chunk = hash_items[i:i + args.batch_size]
                objs = []
                for h, data in chunk:
                    obj = VocaExample(exam_en=data['exam_en'], exam_ko=data['exam_ko'])
                    db.session.add(obj)
                    objs.append((h, obj))
                db.session.flush()  # id 확보
                for h, obj in objs:
                    hash_to_id[h] = obj.id
                    inserted_examples.append({'id': obj.id, 'en': obj.exam_en, 'ko': obj.exam_ko})
                db.session.commit()
                print(f'  voca_example 삽입 {min(i + args.batch_size, len(hash_items))}/{len(hash_items)}')

            print(f'voca_example 신규 삽입 완료: {len(inserted_examples)}건')

            # 2) voca_example_map 연결 추가
            seen_this_run = set()
            link_objs = []
            for voca_id, h in link_candidates:
                ex_id = hash_to_id.get(h)
                if ex_id is None:
                    continue  # 이론상 발생 안 함(1단계에서 전부 채움)
                key = (voca_id, ex_id)
                if key in existing_links or key in seen_this_run:
                    continue
                seen_this_run.add(key)
                link_objs.append(key)

            for i in range(0, len(link_objs), args.batch_size):
                chunk = link_objs[i:i + args.batch_size]
                for voca_id, ex_id in chunk:
                    db.session.add(VocaExampleMap(voca_id=voca_id, example_id=ex_id))
                    new_links += 1
                db.session.commit()
                print(f'  voca_example_map 삽입 {min(i + args.batch_size, len(link_objs))}/{len(link_objs)}')

        except Exception:
            db.session.rollback()
            raise

        print(f'완료 — 새 voca_example {len(inserted_examples)}건, 새 voca_example_map 연결 {new_links}건')
        print(f'  (target-word 강조 태그 없는 새 예문: {no_tag_count}건)')

        with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
            json.dump(inserted_examples, f, ensure_ascii=False, indent=2)
        print(f'새 예문 목록 저장: {OUTPUT_PATH}')


if __name__ == '__main__':
    main()
