"""
voca_example_puzzle(사전, dict schema) upsert 스크립트.

입력 JSON 형식(리스트 또는 {"items": [...]}):
  [
    {
      "id": 12345,                        # voca_example.id
      "en": "He <strong class=\"target-word\">abandoned</strong> the plan.",
      "ko": "그는 계획을 <strong class=\"target-word\">포기했다</strong>.",
      "tokens": ["He", "abandoned", "the", "plan"],
      "target": [1],
      "first": "he",
      "alt_orders": [["He", "abandoned", "the", "plan"]],
      "distractors": ["rejected", "canceled"],
      "listen_distractors": ["adopted", "followed"],
      "skip": null                        # 있으면 출제 불가 사유(문자열)
    },
    ...
  ]

en/ko는 sentence_hash 계산(en)과 참고용으로만 쓰고 DB에는 저장하지 않는다
(voca_example.exam_en/exam_ko이 정본 — 이 테이블은 파생 데이터만 갖는다).

동작:
  1. 기본은 dry-run — 입력 건수/skip 건수/example_id 존재 여부만 집계해 보여준다.
  2. --apply 를 줘야 실제로 upsert(있으면 갱신, 없으면 삽입)한다.
  3. example_id가 voca_example에 없는 행은 건너뛰고 경고만 남긴다(사전이 그 사이
     갱신돼 example_id가 사라졌을 수 있음).

사용법 (컨테이너 내부에서):
  docker exec -it heyvoca_back_local python3 scripts/import_example_puzzles.py <json_path>              # dry-run
  docker exec -it heyvoca_back_local python3 scripts/import_example_puzzles.py <json_path> --apply       # 실제 반영
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db
from app.models.models import VocaExample, VocaExamplePuzzle
from app.services.sentence_puzzle import sentence_hash


def load_items(json_path):
    with open(json_path, encoding='utf-8') as f:
        data = json.load(f)
    items = data.get('items') if isinstance(data, dict) else data
    if items is None:
        raise ValueError(f"입력 형식을 인식할 수 없습니다(list 또는 {{'items':[...]}} 필요): {json_path}")
    return items


def build_row(item: dict, valid_example_ids: set):
    """입력 원소 → (row_dict, error) 튜플. error가 있으면 row_dict는 None."""
    example_id = item.get('id')
    if example_id is None:
        return None, '"id" 없음'
    try:
        example_id = int(example_id)
    except (TypeError, ValueError):
        return None, f'"id" 정수 변환 실패: {item.get("id")!r}'
    if example_id not in valid_example_ids:
        return None, f'example_id={example_id} 가 voca_example에 없음'

    tokens = item.get('tokens')
    target = item.get('target')
    if not isinstance(tokens, list) or not tokens:
        return None, f'example_id={example_id}: tokens 비어있음/형식 오류'
    if not isinstance(target, list) or not target:
        return None, f'example_id={example_id}: target 비어있음/형식 오류'

    row = {
        'example_id':         example_id,
        'sentence_hash':      sentence_hash(item.get('en') or ''),
        'tokens':             tokens,
        'target_idx':         target,
        'first_form':         item.get('first'),
        'alt_orders':         item.get('alt_orders') or [],
        'distractors':        item.get('distractors') or [],
        'listen_distractors': item.get('listen_distractors') or [],
        'skip_reason':        item.get('skip') or None,
    }
    return row, None


def main():
    parser = argparse.ArgumentParser(description='voca_example_puzzle upsert (dry-run 기본)')
    parser.add_argument('json_path', help='puzzle 데이터 JSON 경로(컨테이너 내부 경로)')
    parser.add_argument('--apply', action='store_true', help='실제로 DB에 반영(기본은 dry-run)')
    parser.add_argument('--batch-size', type=int, default=500, help='commit 배치 크기(기본 500)')
    args = parser.parse_args()

    items = load_items(args.json_path)
    print(f'입력 항목 수: {len(items)}')

    app = create_app()
    with app.app_context():
        valid_example_ids = {
            row[0] for row in db.session.query(VocaExample.id).all()
        }
        print(f'사전 voca_example 존재 건수: {len(valid_example_ids)}')

        rows = []
        errors = []
        skipped_flag_count = 0
        for item in items:
            row, err = build_row(item, valid_example_ids)
            if err:
                errors.append(err)
                continue
            if row['skip_reason']:
                skipped_flag_count += 1
            rows.append(row)

        print(f'upsert 대상: {len(rows)}건 (그중 skip_reason 있음: {skipped_flag_count}건)')
        print(f'건너뜀(오류): {len(errors)}건')
        for e in errors[:20]:
            print(f'  - {e}')
        if len(errors) > 20:
            print(f'  ... 외 {len(errors) - 20}건')

        if not args.apply:
            print('[dry-run] DB 변경 없이 종료합니다. 실제 반영하려면 --apply를 붙이세요.')
            return

        existing_ids = {
            row[0] for row in db.session.query(VocaExamplePuzzle.example_id)
            .filter(VocaExamplePuzzle.example_id.in_([r['example_id'] for r in rows]))
            .all()
        } if rows else set()

        inserted = 0
        updated = 0
        try:
            for i in range(0, len(rows), args.batch_size):
                chunk = rows[i:i + args.batch_size]
                for row in chunk:
                    if row['example_id'] in existing_ids:
                        db.session.query(VocaExamplePuzzle).filter(
                            VocaExamplePuzzle.example_id == row['example_id']
                        ).update({
                            'sentence_hash':      row['sentence_hash'],
                            'tokens':             row['tokens'],
                            'target_idx':         row['target_idx'],
                            'first_form':         row['first_form'],
                            'alt_orders':         row['alt_orders'],
                            'distractors':        row['distractors'],
                            'listen_distractors': row['listen_distractors'],
                            'skip_reason':        row['skip_reason'],
                        })
                        updated += 1
                    else:
                        db.session.add(VocaExamplePuzzle(**row))
                        inserted += 1
                db.session.commit()
                print(f'  {min(i + args.batch_size, len(rows))}/{len(rows)} 처리 완료')
        except Exception:
            db.session.rollback()
            raise

        print(f'완료 — 삽입 {inserted}건, 갱신 {updated}건')


if __name__ == '__main__':
    main()
