"""
voca_meaning_concept(뜻-유사개념그룹 N:M 매핑 테이블) 시딩 스크립트.

입력 JSON 형식:
  {"concepts": [{"concept_id": 1, "meaning_ids": [32411, 44710, 89027], ...}, ...]}
(concept당 다른 부가 필드(meanings 등)가 있어도 무시하고 concept_id/meaning_ids만 사용)

동작:
  1. voca_meaning_concept 테이블 전체 삭제(TRUNCATE 성격의 전량 교체 — 판정 결과를
     통째로 다시 시딩하는 배치이므로 증분 upsert가 아니라 항상 풀 리로드다).
  2. JSON의 (meaning_id, concept_id) 쌍 중 존재하지 않는 meaning_id는 건너뛰고 건수 집계.
  3. 5,000행 단위로 SQLAlchemy Core bulk insert.
  4. 완료 후 총 삽입 행수 / distinct concept 수 / 스킵 건수 출력.

사전 데이터(voca/voca_meaning 등)는 전혀 건드리지 않는다 — voca_meaning_concept 하나만 대상.

사용법 (컨테이너 내부에서):
  docker exec -it heyvoca_back_local python3 scripts/seed_meaning_concepts.py <json_path> [옵션]

옵션:
  --batch-size N   bulk insert 배치 크기 (기본 5000)
  --dry-run        DB 변경 없이 집계 결과만 출력
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db
from app.models.models import VocaMeaning, VocaMeaningConcept


def load_concepts(json_path):
    with open(json_path, encoding='utf-8') as f:
        data = json.load(f)
    concepts = data.get('concepts') if isinstance(data, dict) else data
    if concepts is None:
        raise ValueError(f"'concepts' 키를 찾을 수 없습니다: {json_path}")
    return concepts


def build_rows(concepts, existing_meaning_ids):
    """concepts 리스트 → (rows, skipped_count, distinct_concept_count).

    rows: [{'meaning_id': int, 'concept_id': int}, ...] — 존재하는 meaning_id만, 중복 제거.
    """
    rows = []
    seen_pairs = set()
    skipped = 0
    concept_ids_used = set()

    for concept in concepts:
        concept_id = concept.get('concept_id')
        meaning_ids = concept.get('meaning_ids') or []
        if concept_id is None:
            continue
        for meaning_id in meaning_ids:
            if meaning_id not in existing_meaning_ids:
                skipped += 1
                continue
            pair = (meaning_id, concept_id)
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)
            concept_ids_used.add(concept_id)
            rows.append({'meaning_id': meaning_id, 'concept_id': concept_id})

    return rows, skipped, len(concept_ids_used)


def main():
    parser = argparse.ArgumentParser(description='voca_meaning_concept 시딩(전량 교체)')
    parser.add_argument('json_path', help='concept_groups JSON 경로 (컨테이너 내부 경로)')
    parser.add_argument('--batch-size', type=int, default=5000, help='bulk insert 배치 크기 (기본 5000)')
    parser.add_argument('--dry-run', action='store_true', help='DB 변경 없이 집계만 출력')
    args = parser.parse_args()

    concepts = load_concepts(args.json_path)
    print(f"입력 concept 그룹 수: {len(concepts)}")

    app = create_app()
    with app.app_context():
        # 존재하는 meaning_id 전체를 한 번에 로드 (N+1 방지)
        existing_meaning_ids = {
            row[0] for row in db.session.query(VocaMeaning.id).all()
        }
        print(f"사전 voca_meaning 존재 건수: {len(existing_meaning_ids)}")

        rows, skipped, concept_count = build_rows(concepts, existing_meaning_ids)
        print(f"삽입 대상 행 수(존재하는 meaning_id, 중복 제거 후): {len(rows)}")
        print(f"건너뜀(존재하지 않는 meaning_id): {skipped}")
        print(f"사용된 distinct concept_id 수: {concept_count}")

        if args.dry_run:
            print("[dry-run] DB 변경 없이 종료합니다.")
            return

        table = VocaMeaningConcept.__table__
        try:
            # 전량 교체: 기존 매핑을 모두 지우고 새로 채운다.
            deleted = db.session.execute(table.delete()).rowcount
            print(f"기존 행 삭제: {deleted}")

            batch_size = args.batch_size
            for i in range(0, len(rows), batch_size):
                chunk = rows[i:i + batch_size]
                db.session.execute(table.insert(), chunk)
                print(f"  {i + len(chunk)}/{len(rows)} 삽입 완료")

            db.session.commit()
        except Exception:
            db.session.rollback()
            raise

        total = db.session.query(VocaMeaningConcept).count()
        distinct_concepts = db.session.query(
            db.func.count(db.func.distinct(VocaMeaningConcept.concept_id))
        ).scalar()
        print(f"완료 — voca_meaning_concept 총 행수: {total}, distinct concept 수: {distinct_concepts}")


if __name__ == '__main__':
    main()
