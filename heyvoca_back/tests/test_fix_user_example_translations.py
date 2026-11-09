"""이슈 #24 — 사용자 예문 복사본 해석 정정 스크립트의 순수 함수."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'scripts'))
import fix_user_example_translations as F  # noqa: E402

T, E = F.T, F.E
EN = f"The store's holiday {T}offering{E} included discounts on winter clothes."
OLD = f'그 가게의 연휴 {T}제공된 것{E}에는 겨울옷 할인이 포함됐어요.'
NEW = F.FIXES[EN]


def test_replaces_old_translation_both_key_styles():
    raw = json.dumps([{'origin': EN, 'meaning': OLD},
                      {'en': 'The store&#39;s holiday offering included discounts on winter clothes.', 'ko': OLD},
                      {'origin': 'Other.', 'meaning': '다른 제공된 것'}], ensure_ascii=False)
    out, n = F.fix_examples(raw)
    items = json.loads(out)
    assert n == 2
    assert items[0]['meaning'] == NEW and items[1]['ko'] == NEW
    assert items[2]['meaning'] == '다른 제공된 것'      # 다른 문장은 그대로


def test_idempotent_and_keeps_user_edits():
    raw = json.dumps([{'origin': EN, 'meaning': NEW}], ensure_ascii=False)
    assert F.fix_examples(raw) == (None, 0)
    edited = json.dumps([{'origin': EN, 'meaning': '내가 고친 해석 제공된 것 아님'.replace('제공된 것', '')}], ensure_ascii=False)
    assert F.fix_examples(edited) == (None, 0)
    assert F.fix_examples(None) == (None, 0)
    assert F.fix_examples('not json 제공된 것') == (None, 0)
