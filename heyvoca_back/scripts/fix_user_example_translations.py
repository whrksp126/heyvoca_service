"""사용자 DB 예문 복사본의 해석을 사전 정정분으로 바꾼다 (일회성, 이슈 #24).

배경
  사전 heyvoca_dict.voca_example 103202~103207(offering) 의 exam_ko 가 뜻 '제공된 것'을 기계적으로
  끼워 넣어 어색해서 고쳤다(.wt/qa24_dict_fix.sql). 사용자가 검색·추가로 단어를 담을 때 예문이
  JSON 으로 복사되므로(user_voca.voca_examples, user_voca_book_map.voca_examples — 키 origin/meaning,
  레거시 en/ko) 그 복사본도 같은 영어 문장이면 새 해석으로 맞춘다.

판정
  예문 항목의 영어(origin|en)를 태그 제거·공백 정규화·소문자화한 값이 아래 FIXES 의 영어와 같고,
  해석(meaning|ko)이 새 해석과 다르면 새 해석으로 바꾼다. 같으면 그대로(멱등).
  사용자가 직접 고친 해석까지 덮지 않도록, 바꾸기 전 해석에 OLD_MARK('제공된 것')가 있을 때만 바꾼다.

실행 (stdin 방식)
  docker exec -i -w /app heyvoca_back_<env> python3 - [--apply] < heyvoca_back/scripts/fix_user_example_translations.py
  기본 dry-run(롤백). --apply 일 때만 커밋.
"""

import html
import json
import re
import sys

T = '<strong class="target-word">'
E = '</strong>'
OLD_MARK = '제공된 것'

# 영어 원문(사전 exam_en 그대로) → 새 해석(사전 exam_ko 와 동일)
FIXES = {
    f'She accepted the {T}offering{E} gladly.':
        f'그녀는 그 {T}선물{E}을 기쁘게 받았어요.',
    f'The temple received a small {T}offering{E}.':
        f'그 사원은 작은 {T}제물{E}을 받았어요.',
    f"The store's holiday {T}offering{E} included discounts on winter clothes.":
        f'그 가게의 연휴 {T}특가 상품{E}에는 겨울옷 할인이 포함됐어요.',
    f'He brought a small {T}offering{E} to apologize for the fight.':
        f'그는 싸움을 사과하려고 작은 {T}화해의 선물{E}을 가져왔어요.',
    f'During the ceremony, each family placed their {T}offering{E} on the altar while the priest quietly watched.':
        f'의식 동안, 각 가족은 사제가 조용히 지켜보는 가운데 제단에 자신들의 {T}제물{E}을 올렸어요.',
    f'Although the {T}offering{E} was modest, the villagers believed it would bring good fortune for the coming harvest season.':
        f'그 {T}제물{E}은 소박했지만, 마을 사람들은 그것이 다가올 수확철에 행운을 가져다줄 거라고 믿었어요.',
}

_TAG = re.compile(r'<[^>]+>')


def norm(text):
    return re.sub(r'\s+', ' ', html.unescape(_TAG.sub('', text or ''))).strip().lower()


_BY_NORM = {norm(en): ko for en, ko in FIXES.items()}


def fix_examples(raw):
    """voca_examples JSON 문자열 → (새 JSON 문자열 | None(변경 없음), 바꾼 항목 수)."""
    if not raw or OLD_MARK not in raw:
        return None, 0
    try:
        items = json.loads(raw)
    except (TypeError, ValueError):
        return None, 0
    if not isinstance(items, list):
        return None, 0
    changed = 0
    for it in items:
        if not isinstance(it, dict):
            continue
        en_key = 'origin' if 'origin' in it else ('en' if 'en' in it else None)
        ko_key = 'meaning' if 'meaning' in it else ('ko' if 'ko' in it else None)
        if en_key is None or ko_key is None:
            continue
        new_ko = _BY_NORM.get(norm(it.get(en_key)))
        cur = it.get(ko_key) or ''
        if new_ko and cur != new_ko and OLD_MARK in cur:
            it[ko_key] = new_ko
            changed += 1
    if not changed:
        return None, 0
    return json.dumps(items, ensure_ascii=False), changed


def main():
    apply = '--apply' in sys.argv[1:]
    from run import app
    from app import db
    from app.models.models import UserVoca, UserVocaBookMap

    with app.app_context():
        total_rows = total_items = 0
        for model, label in ((UserVoca, 'user_voca'), (UserVocaBookMap, 'user_voca_book_map')):
            rows = (db.session.query(model)
                    .filter(model.voca_examples.like(f'%{OLD_MARK}%'),
                            model.voca_examples.like('%offering%')).all())
            n_rows = n_items = 0
            for row in rows:
                new_raw, n = fix_examples(row.voca_examples)
                if new_raw is None:
                    continue
                row.voca_examples = new_raw
                n_rows += 1
                n_items += n
            print(f'  {label}: 후보 {len(rows)}행 → 수정 {n_rows}행 / 예문 {n_items}개')
            total_rows += n_rows
            total_items += n_items
        if apply:
            db.session.commit()
        else:
            db.session.rollback()
        print(f'[{"APPLY" if apply else "DRY-RUN"}] 수정 {total_rows}행, 예문 {total_items}개'
              + ('' if apply else ' (반영 안 함, --apply 로 실행)'))


if __name__ == '__main__':
    main()
