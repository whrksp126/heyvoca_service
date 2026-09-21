"""
admin_voca_book_map.voca_examples(사전 DB의 서점 단어장 매핑 예문) 빈 값 채우기 + 형식 정규화 스크립트.

배경: bookstore.admin_voca_book_id → admin_voca_book_map 중 voca_examples가 비어 있는 행이
다수 존재한다. 사전 자체(voca_example ↔ voca_example_map)에는 예문이 있으므로 거기서
가져와 채운다. 또 과거형 {"en","ko"} 키와 표준 {"origin","meaning"} 키가 섞여 있어 표준으로
통일한다(앱 표준은 origin/meaning — app/routes/search.py 참고).

처리 단계 (A → B → C 순서로 실행):
  A. --generated로 준 JSON(신규 생성 예문)을 voca_example/voca_example_map에 삽입.
     같은 voca에 같은 exam_en이 이미 있으면 건너뜀. voca_id가 사전에 없으면 경고 후 건너뜀.
     (B 단계에서 방금 삽입한 예문도 후보로 쓸 수 있도록 A를 먼저 실행한다.)
  B. admin_voca_book_map 중 voca_examples가 NULL/''/'[]'/'null'인 행마다, 그 voca의 사전
     예문에서 최대 --max개를 골라 [{"origin": exam_en, "meaning": exam_ko}, ...]로 채운다.
     선택 우선순위: (1) 행의 voca_meanings와 exam_ko의 target-word 태그 텍스트가 어간
     수준으로 겹치는 예문, (2) 나머지는 example id 오름차순. 텍스트가 완전히 빈 예문은 제외.
     사전 예문이 하나도 없는 행은 개수만 집계하고 건너뜀.
  C. admin_voca_book_map.voca_examples 전체에서 {"en","ko"} 키 항목을 {"origin","meaning"}
     으로 변환한다(이미 origin/meaning이면 그대로, 둘 다 빈 항목은 제거). JSON 파싱 실패 행은
     경고 후 건너뜀.

--generated JSON 형식:
  [{"voca_id": 123, "word": "abandon", "examples": [{"origin": "...", "meaning": "..."}, ...]}, ...]

사용법 (컨테이너 내부에서):
  docker exec -it heyvoca_back_local python3 scripts/fill_admin_book_examples.py [옵션]

옵션:
  --dry-run              DB 변경 없이 집계 결과만 출력(롤백)
  --generated PATH       A 단계에 사용할 신규 예문 JSON 경로 (선택)
  --max N                B 단계에서 행마다 채울 최대 예문 수 (기본 3)
"""

import argparse
import json
import os
import re
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ──────────────────────────────────────────
# 순수 함수 (DB 접근 없음 — 단위 테스트 대상)
# ──────────────────────────────────────────

# 뜻 정제용: 공백·괄호류·구두점 제거
_CLEAN_RE = re.compile(r'[\s\(\)\[\]{}<>·,\.!?;:\'"“”‘’\-–—/~]')

# 길이가 긴 접미부터 검사해야 짧은 접미에 먼저 걸리지 않는다
# (예: '적인'을 '적'보다 먼저 봐야 '적인' 전체가 벗겨짐)
_SUFFIXES = ['스러운', '이다', '하다', '되다', '적인', '롭다', '답다', '된', '적', '의', '한']

_STRONG_RE = re.compile(
    r'<strong[^>]*class="target-word"[^>]*>(.*?)</strong>',
    re.IGNORECASE | re.DOTALL,
)
_TAG_RE = re.compile(r'<[^>]+>')


def clean_meaning(meaning):
    """뜻 문자열에서 공백·괄호류·구두점을 제거."""
    return _CLEAN_RE.sub('', meaning or '')


def strip_suffix(word):
    """어간 비교를 위해 흔한 한국어 뜻풀이 접미 하나를 벗긴다(있으면)."""
    for suf in _SUFFIXES:
        if word.endswith(suf) and len(word) > len(suf):
            return word[:-len(suf)]
    return word


def extract_strong_text(exam_ko):
    """exam_ko에서 <strong class="target-word">...</strong> 내부 텍스트(태그 제거)를 추출."""
    if not exam_ko:
        return ''
    m = _STRONG_RE.search(exam_ko)
    if not m:
        return ''
    return _TAG_RE.sub('', m.group(1))


def stem_match(meaning, tag_text):
    """meaning의 어간이 tag_text(태그 내부 텍스트) 안에 포함되는지 판정.
    정확도보다 재현율을 우선하는 단순 판정 — 앞 2글자 이상이 부분 일치하면 매치로 본다."""
    if not meaning or not tag_text:
        return False
    stem = strip_suffix(clean_meaning(meaning))
    if len(stem) < 2:
        return False
    return stem[:2] in tag_text


def select_examples_for_row(row_meanings, dict_examples, max_n):
    """행에 채워 넣을 예문을 고른다.

    row_meanings: 그 admin_voca_book_map 행의 voca_meanings(list[str])
    dict_examples: [(example_id, exam_en, exam_ko), ...] — 그 voca의 사전 예문 전체
    반환: 최대 max_n개, [{"origin": exam_en, "meaning": exam_ko}, ...] (example id 순 우선순위 적용)
    """
    usable = [
        (eid, en, ko) for eid, en, ko in dict_examples
        if (en or '').strip() or (ko or '').strip()
    ]
    usable.sort(key=lambda t: t[0])

    matched = []
    rest = []
    for eid, en, ko in usable:
        tag_text = extract_strong_text(ko)
        is_match = bool(tag_text) and any(stem_match(m, tag_text) for m in row_meanings)
        (matched if is_match else rest).append((eid, en, ko))

    selected = (matched + rest)[:max_n]
    return [{'origin': en or '', 'meaning': ko or ''} for _eid, en, ko in selected]


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
    파싱 불가(JSON 오류이거나 리스트가 아님)면 ValueError를 던진다 — 호출부에서 경고 후 skip.
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
    """admin_voca_book_map.voca_examples 컬럼 값이 '예문 없음'으로 취급되는 값인지."""
    return raw_value is None or raw_value in ('', '[]', 'null')


# ──────────────────────────────────────────
# DB 처리 (main 안에서만 사용)
# ──────────────────────────────────────────

def _run_step_a(db, Voca, VocaExample, VocaExampleMap, generated_items):
    """A. --generated JSON을 voca_example/voca_example_map에 삽입."""
    inserted = 0
    if not generated_items:
        return inserted

    wanted_ids = {it.get('voca_id') for it in generated_items if it.get('voca_id') is not None}
    existing_voca_ids = {
        row[0] for row in db.session.query(Voca.id).filter(Voca.id.in_(wanted_ids)).all()
    } if wanted_ids else set()

    existing_exam_en_by_voca = defaultdict(set)
    if existing_voca_ids:
        rows = (
            db.session.query(VocaExampleMap.voca_id, VocaExample.exam_en)
            .join(VocaExample, VocaExampleMap.example_id == VocaExample.id)
            .filter(VocaExampleMap.voca_id.in_(existing_voca_ids))
            .all()
        )
        for voca_id, exam_en in rows:
            existing_exam_en_by_voca[voca_id].add((exam_en or '').strip())

    for item in generated_items:
        voca_id = item.get('voca_id')
        word = item.get('word', '')
        if voca_id not in existing_voca_ids:
            print(f'[경고][A] voca_id={voca_id}({word}) — 사전(voca)에 없어 건너뜁니다.')
            continue

        for ex in item.get('examples') or []:
            origin, meaning = example_en_ko(ex)
            if not origin and not meaning:
                continue
            if origin in existing_exam_en_by_voca[voca_id]:
                continue
            ve = VocaExample(exam_en=origin or None, exam_ko=meaning or None)
            db.session.add(ve)
            db.session.flush()
            db.session.add(VocaExampleMap(voca_id=voca_id, example_id=ve.id))
            existing_exam_en_by_voca[voca_id].add(origin)
            inserted += 1

    return inserted


def _run_step_b(db, AdminVocaBookMap, VocaExample, VocaExampleMap, max_n):
    """B. voca_examples가 비어 있는 admin_voca_book_map 행을 사전 예문으로 채운다."""
    from sqlalchemy import or_

    rows = AdminVocaBookMap.query.filter(
        or_(
            AdminVocaBookMap.voca_examples.is_(None),
            AdminVocaBookMap.voca_examples.in_(['', '[]', 'null']),
        )
    ).all()

    voca_ids = {r.voca_id for r in rows if r.voca_id is not None}
    dict_examples_by_voca = defaultdict(list)
    if voca_ids:
        q = (
            db.session.query(VocaExampleMap.voca_id, VocaExample.id, VocaExample.exam_en, VocaExample.exam_ko)
            .join(VocaExample, VocaExampleMap.example_id == VocaExample.id)
            .filter(VocaExampleMap.voca_id.in_(voca_ids))
        )
        for voca_id, eid, en, ko in q:
            dict_examples_by_voca[voca_id].append((eid, en, ko))

    filled = 0
    skipped_no_dict_example = 0

    for row in rows:
        try:
            row_meanings = json.loads(row.voca_meanings) if row.voca_meanings else []
            if not isinstance(row_meanings, list):
                row_meanings = []
        except (TypeError, ValueError):
            row_meanings = []

        dict_examples = dict_examples_by_voca.get(row.voca_id, [])
        selected = select_examples_for_row(row_meanings, dict_examples, max_n)

        if not selected:
            skipped_no_dict_example += 1
            continue

        row.voca_examples = json.dumps(selected, ensure_ascii=False)
        filled += 1

    return filled, skipped_no_dict_example


def _run_step_c(db, AdminVocaBookMap):
    """C. admin_voca_book_map.voca_examples 전체를 표준 {origin,meaning} 형식으로 정규화."""
    converted_count = 0
    warned_count = 0

    rows = AdminVocaBookMap.query.filter(AdminVocaBookMap.voca_examples.isnot(None)).all()
    for row in rows:
        try:
            converted, changed = convert_legacy_examples(row.voca_examples)
        except ValueError as e:
            print(f'[경고][C] admin_voca_book_map.id={row.id} — {e}, 건너뜁니다.')
            warned_count += 1
            continue

        if changed:
            row.voca_examples = json.dumps(converted, ensure_ascii=False) if converted else '[]'
            converted_count += 1

    return converted_count, warned_count


def main():
    parser = argparse.ArgumentParser(description='admin_voca_book_map.voca_examples 채우기 + 형식 정규화')
    parser.add_argument('--dry-run', action='store_true', help='DB 변경 없이 집계 결과만 출력(롤백)')
    parser.add_argument('--generated', default=None, help='A 단계에 사용할 신규 예문 JSON 경로')
    parser.add_argument('--max', type=int, default=3, help='B 단계에서 행마다 채울 최대 예문 수 (기본 3)')
    args = parser.parse_args()

    generated_items = []
    if args.generated:
        with open(args.generated, encoding='utf-8') as f:
            generated_items = json.load(f)
        if not isinstance(generated_items, list):
            raise ValueError('--generated JSON은 배열이어야 합니다.')
        print(f'--generated 입력 항목 수: {len(generated_items)}')

    from app import create_app, db
    from app.models.models import Voca, VocaExample, VocaExampleMap, AdminVocaBookMap

    app = create_app()
    with app.app_context():
        inserted_a = _run_step_a(db, Voca, VocaExample, VocaExampleMap, generated_items)
        print(f'[A] voca_example 신규 삽입 수: {inserted_a}')

        filled_b, skipped_b = _run_step_b(db, AdminVocaBookMap, VocaExample, VocaExampleMap, args.max)
        print(f'[B] 채운 행 수: {filled_b} / 사전 예문 없어 건너뛴 행 수: {skipped_b}')

        converted_c, warned_c = _run_step_c(db, AdminVocaBookMap)
        print(f'[C] en/ko → origin/meaning 변환 행 수: {converted_c} (파싱 실패 경고 {warned_c}건)')

        db.session.flush()
        from sqlalchemy import or_
        remaining_empty = AdminVocaBookMap.query.filter(
            or_(
                AdminVocaBookMap.voca_examples.is_(None),
                AdminVocaBookMap.voca_examples.in_(['', '[]', 'null']),
            )
        ).count()
        print(f'최종 예문 없는 행 수: {remaining_empty}')

        if args.dry_run:
            db.session.rollback()
            print('[dry-run] DB 변경 없이 롤백했습니다.')
        else:
            db.session.commit()
            print('DB 변경을 커밋했습니다.')


if __name__ == '__main__':
    main()
