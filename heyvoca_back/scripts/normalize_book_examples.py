"""
admin_voca_book_map.voca_examples(사전 DB의 서점 단어장 매핑 예문) 강조 태그 정규화 +
빈/미태깅 meaning 보정 스크립트.

배경: fill_admin_book_examples.py(en/ko → origin/meaning 키 정규화)와 별개로, 강조 마크업이
헤이보카 표준(<strong class="target-word">)이 아닌 변형(<span class="target-word">, 중첩
<span><strong>…</strong></span>, <b class="target-word">, <em class="target-word"> 등)으로
남아 있는 행이 있다. 프론트가 빈칸 채우기(fillInTheBlank/fillInTheBlankReverse) 출제 가능
여부를 이 표준 태그 존재로만 판정하므로(app/utils/example_tagging.py TARGET_WORD_RE), 변형
태그는 사실상 "태그 없음"과 동일하게 취급돼 출제 후보에서 빠진다.

처리 단계 (행마다 순서대로):
  1. 예문 항목의 en/ko(레거시) → origin/meaning 키로 정규화.
  2. origin/meaning 각각의 강조 마크업을 표준 형식으로 정규화
     (app/routes/voca_books._normalize_target_word 재사용 + 중첩 strong 접기).
  3. meaning 이 비어 있으면, 같은 voca_id의 사전 예문(voca_example ↔ voca_example_map)에서
     태그·공백·대소문자를 무시하고 exam_en 과 origin 이 완전히 일치하는 행을 찾아 그
     exam_en/exam_ko(둘 다 이미 표준 태그가 붙어 있음)로 origin/meaning을 통째로 교체한다.
     일치하는 사전 예문이 없으면 손대지 않고 보고 대상에 남긴다.
  4. meaning 이 있는데 표준 태그가 없으면, 3과 같은 방식으로 사전 예문을 찾아 태그된
     exam_ko 를 쓴다. 사전에 일치하는 예문이 없으면 app/utils/example_tagging.tag_example_pair
     (Kiwi, 오프라인)로 한 번 더 시도한다. 그래도 실패하면(need_gpt_ko) 손대지 않고 보고
     대상에 남긴다 — GPT 호출은 하지 않는다.
  5. 바뀐 행만 DB에 쓴다. 완전히 빈 항목(origin/meaning 모두 빈 문자열)은 제거한다.

voca_examples 가 NULL/''/'[]'/'null' 인 행(예문 자체가 없는 행)은 이 스크립트의 대상이
아니다 — 그건 fill_admin_book_examples.py 의 B단계 몫이다.

사용법 (컨테이너 내부에서):
  docker exec -it heyvoca_back_local python3 scripts/normalize_book_examples.py [옵션]

옵션:
  --apply       DB 변경을 커밋한다. 기본은 dry-run(집계만 출력하고 롤백).
  --verbose     수동 처리가 필요한 잔여 항목의 전/후 원문을 모두 출력.
"""

import argparse
import json
import os
import re
import sys
from collections import defaultdict
from html import unescape as html_unescape

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.routes.voca_books import _normalize_target_word  # noqa: E402
from app.utils.example_tagging import example_has_target_tag  # noqa: E402


# ──────────────────────────────────────────
# 순수 함수 (DB 접근 없음 — 단위 테스트 대상)
# ──────────────────────────────────────────

_TAG_RE = re.compile(r'<[^>]+>')
_WS_RE = re.compile(r'\s+')

# <strong class="target-word"><strong class="target-word">X</strong></strong> 같은 이중
# strong(원래 <span class="target-word"><strong class="target-word">…</strong></span> 등
# 중첩 강조가 _normalize_target_word를 거치며 이중으로 감싸지는 경우)을 안쪽 하나로 접는다.
# 중첩이 여러 겹이어도 안정될 때까지 반복 적용한다.
_NESTED_STRONG_RE = re.compile(
    r'<strong class="target-word">(<strong class="target-word">.*?</strong>)</strong>',
    re.IGNORECASE | re.DOTALL,
)


def example_en_ko(ex):
    """예문 dict에서 (en, ko) 쌍을 뽑아낸다. {'en','ko'}·{'origin','meaning'} 두 형식 모두 허용.

    (fill_admin_book_examples.py / migrate_user_book_examples.py 와 동일 규칙 — 실행 방식이
    달라도 안전하도록 자체 복제.)
    """
    if not isinstance(ex, dict):
        return '', ''
    en = ex.get('en')
    if en is None:
        en = ex.get('origin', '')
    ko = ex.get('ko')
    if ko is None:
        ko = ex.get('meaning', '')
    return (en or '').strip(), (ko or '').strip()


def is_empty_examples_value(raw_value):
    """voca_examples 컬럼 값이 '예문 없음'으로 취급되는 값인지."""
    return raw_value is None or raw_value in ('', '[]', 'null')


def collapse_nested_strong(text):
    """이중/다중으로 감싸진 표준 strong 태그를 가장 안쪽 하나로 접는다."""
    if not text:
        return text or ''
    prev = None
    s = text
    while prev != s:
        prev = s
        s = _NESTED_STRONG_RE.sub(lambda m: m.group(1), s)
    return s


def normalize_target_word_markup(text):
    """강조 마크업 변형(span/b/em/markdown/cloze 등)을 표준 <strong class="target-word">로
    정규화하고, 중첩으로 인해 이중 strong이 된 경우를 접어서 반환한다."""
    return collapse_nested_strong(_normalize_target_word(text))


def canon_text(text):
    """태그 제거 + HTML 엔티티 디코딩 + 공백 정규화 + 소문자화 — 사전 예문과의 완전 일치
    비교(캐노니컬 매치)용."""
    stripped = _TAG_RE.sub('', text or '')
    stripped = html_unescape(stripped)
    return _WS_RE.sub(' ', stripped).strip().lower()


def process_example(ex, dict_lookup, tag_ko_fn=None):
    """예문 dict 하나를 표준화한다.

    dict_lookup: {canon_text(exam_en): (exam_en, exam_ko), ...} — 이 예문이 속한 voca_id의
                 사전 예문 캐노니컬 매치 테이블(둘 다 이미 표준 태그가 붙어 있음).
    tag_ko_fn:   (origin, meaning) -> tagged_meaning|None. 사전 매치가 없을 때 마지막으로
                 시도하는 오프라인 한국어 태거(app.utils.example_tagging.tag_example_pair 래퍼).
                 None이면 이 단계는 건너뛴다(순수 테스트에서 주입 없이도 동작).

    반환: (new_ex: {'origin','meaning'} | None, changed: bool, status: str)
      new_ex가 None이면 dict가 아닌 항목이라 버려야 함을 뜻한다.
      status: 'ok' | 'empty_no_match' | 'untagged_no_match'
    """
    if not isinstance(ex, dict):
        return None, True, 'dropped_non_dict'

    origin_raw, meaning_raw = example_en_ko(ex)
    origin = normalize_target_word_markup(origin_raw)
    meaning = normalize_target_word_markup(meaning_raw)

    status = 'ok'
    if not meaning.strip():
        match = dict_lookup.get(canon_text(origin)) if origin else None
        if match:
            origin, meaning = match
        else:
            status = 'empty_no_match'
    elif not example_has_target_tag(meaning):
        match = dict_lookup.get(canon_text(origin)) if origin else None
        if match and example_has_target_tag(match[1]):
            meaning = match[1]
        else:
            tagged = tag_ko_fn(origin, meaning) if tag_ko_fn else None
            if tagged and example_has_target_tag(tagged):
                meaning = tagged
            else:
                status = 'untagged_no_match'

    new_ex = {'origin': origin, 'meaning': meaning}
    is_legacy_keys = ('en' in ex or 'ko' in ex)
    changed = (
        origin != origin_raw
        or meaning != meaning_raw
        or is_legacy_keys
        or set(ex.keys()) != {'origin', 'meaning'}
    )
    return new_ex, changed, status


def process_row(raw_json_text, dict_lookup, tag_ko_fn=None):
    """voca_examples 원문(JSON 문자열) 하나를 통째로 처리한다.

    반환: (new_items: list[dict], row_changed: bool, leftovers: list[dict])
      leftovers: [{'index', 'before', 'after', 'status'}, ...] — status가 'ok'가 아닌 항목.
    파싱 불가(JSON 오류이거나 리스트가 아님)면 ValueError를 던진다 — 호출부에서 경고 후 skip.
    """
    if is_empty_examples_value(raw_json_text):
        return [], False, []

    try:
        items = json.loads(raw_json_text)
    except (TypeError, ValueError) as e:
        raise ValueError(f'JSON 파싱 실패: {e}') from e
    if not isinstance(items, list):
        raise ValueError('voca_examples가 JSON 배열이 아님')

    new_items = []
    row_changed = False
    leftovers = []

    for idx, ex in enumerate(items):
        new_ex, changed, status = process_example(ex, dict_lookup, tag_ko_fn)
        if new_ex is None:
            row_changed = True
            continue
        if not new_ex['origin'] and not new_ex['meaning']:
            row_changed = True
            continue
        if changed:
            row_changed = True
        if status != 'ok':
            leftovers.append({'index': idx, 'before': ex, 'after': new_ex, 'status': status})
        new_items.append(new_ex)

    return new_items, row_changed, leftovers


def build_dict_lookup_by_voca(dict_example_rows):
    """(voca_id, exam_en, exam_ko) 튜플 시퀀스로부터 voca_id별 캐노니컬 매치 테이블을 만든다.

    같은 voca_id 안에서 canon(exam_en)이 중복되면 먼저 나온 것을 우선한다(id 오름차순으로
    정렬해 넣는 게 호출부 책임).
    """
    lookup = defaultdict(dict)
    for voca_id, en, ko in dict_example_rows:
        key = canon_text(en)
        if not key:
            continue
        if key not in lookup[voca_id]:
            lookup[voca_id][key] = (en or '', ko or '')
    return lookup


# ──────────────────────────────────────────
# DB 처리 (main 안에서만 사용)
# ──────────────────────────────────────────

def _make_tag_ko_fn(word, row_meanings):
    """app.utils.example_tagging.tag_example_pair 를 (origin, meaning) -> tagged|None 형태로
    감싼다. GPT 호출은 하지 않는다 — need_gpt_ko 가 서면 None을 돌려줘 호출부가 잔여로 남긴다."""
    from app.utils.example_tagging import tag_example_pair

    def _fn(origin, meaning):
        try:
            _tagged_en, tagged_ko, _need_gpt_en, need_gpt_ko = tag_example_pair(
                word, row_meanings, origin, meaning,
            )
        except Exception:
            return None
        if need_gpt_ko:
            return None
        return tagged_ko

    return _fn


def _run_normalize(db, AdminVocaBookMap, VocaExampleMap, VocaExample, Voca):
    rows = AdminVocaBookMap.query.filter(AdminVocaBookMap.voca_examples.isnot(None)).all()

    voca_ids = {r.voca_id for r in rows if r.voca_id is not None}

    dict_example_rows = []
    if voca_ids:
        q = (
            db.session.query(VocaExampleMap.voca_id, VocaExample.id, VocaExample.exam_en, VocaExample.exam_ko)
            .join(VocaExample, VocaExampleMap.example_id == VocaExample.id)
            .filter(VocaExampleMap.voca_id.in_(voca_ids))
            .order_by(VocaExample.id.asc())
        )
        dict_example_rows = [(voca_id, en, ko) for voca_id, _eid, en, ko in q]
    dict_lookup_all = build_dict_lookup_by_voca(dict_example_rows)

    word_by_voca_id = {}
    if voca_ids:
        word_by_voca_id = dict(
            db.session.query(Voca.id, Voca.word).filter(Voca.id.in_(voca_ids)).all()
        )

    scanned_rows = 0
    changed_rows = 0
    parse_warned = 0
    still_empty_meaning = 0
    still_untagged_ko = 0
    leftover_report = []

    for row in rows:
        scanned_rows += 1
        try:
            row_meanings = json.loads(row.voca_meanings) if row.voca_meanings else []
            if not isinstance(row_meanings, list):
                row_meanings = []
        except (TypeError, ValueError):
            row_meanings = []

        dict_lookup = dict_lookup_all.get(row.voca_id, {})
        word = word_by_voca_id.get(row.voca_id, '') or ''
        tag_ko_fn = _make_tag_ko_fn(word, row_meanings)

        try:
            new_items, row_changed, leftovers = process_row(row.voca_examples, dict_lookup, tag_ko_fn)
        except ValueError as e:
            print(f'[경고] admin_voca_book_map.id={row.id} — {e}, 건너뜁니다.')
            parse_warned += 1
            continue

        for lo in leftovers:
            if lo['status'] == 'empty_no_match':
                still_empty_meaning += 1
            elif lo['status'] == 'untagged_no_match':
                still_untagged_ko += 1
            leftover_report.append({
                'row_id': row.id, 'voca_id': row.voca_id, 'word': word, **lo,
            })

        if row_changed:
            changed_rows += 1
            row.voca_examples = json.dumps(new_items, ensure_ascii=False) if new_items else '[]'

    return {
        'scanned_rows': scanned_rows,
        'changed_rows': changed_rows,
        'parse_warned': parse_warned,
        'still_empty_meaning': still_empty_meaning,
        'still_untagged_ko': still_untagged_ko,
        'leftovers': leftover_report,
    }


def main():
    parser = argparse.ArgumentParser(
        description='admin_voca_book_map.voca_examples 강조 태그 정규화 + 빈/미태깅 meaning 보정'
    )
    parser.add_argument('--apply', action='store_true', help='DB 변경을 커밋한다(기본: dry-run, 롤백만)')
    parser.add_argument('--verbose', action='store_true', help='수동 처리가 필요한 잔여 항목의 전/후 원문 출력')
    args = parser.parse_args()

    from app import create_app, db
    from app.models.models import AdminVocaBookMap, VocaExampleMap, VocaExample, Voca

    app = create_app()
    with app.app_context():
        result = _run_normalize(db, AdminVocaBookMap, VocaExampleMap, VocaExample, Voca)

        print(f"스캔한 행 수: {result['scanned_rows']}")
        print(f"변경된 행 수: {result['changed_rows']}")
        print(f"JSON 파싱 실패로 건너뛴 행 수: {result['parse_warned']}")
        print(f"남은 빈 meaning(사전 캐노니컬 매치 실패, 수동 번역 필요): {result['still_empty_meaning']}건")
        print(f"남은 미태깅 한국어(사전/Kiwi 실패, 수동 태깅 필요): {result['still_untagged_ko']}건")

        leftovers = result['leftovers']
        if leftovers and args.verbose:
            print('\n[수동 처리 필요 잔여 항목]')
            for lo in leftovers:
                print(
                    f"  - admin_voca_book_map.id={lo['row_id']} voca_id={lo['voca_id']} "
                    f"word={lo['word']} status={lo['status']}"
                )
                print(f"    before: {lo['before']}")
                print(f"    after : {lo['after']}")

        if args.apply:
            db.session.commit()
            print('DB 변경을 커밋했습니다.')
        else:
            db.session.rollback()
            print('[dry-run] DB 변경 없이 롤백했습니다. --apply 를 주면 반영됩니다.')


if __name__ == '__main__':
    main()
