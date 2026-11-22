"""일본어 fillInTheBlankTyping — answer_reading(히라가나 읽기) 산출 순수 함수 테스트."""
from app.services.fill_blank_typing import (
    build_typing_payload_ja, compute_answer_reading, to_hiragana,
)
from app.services.ja_fields import _squash


def _ex(origin, tokens=None):
    ex = {'origin': origin, 'meaning': '뜻'}
    if tokens is not None:
        ex['reading_tokens'] = tokens
    return ex


def test_okurigana_adjective_base_form():
    origin = 'ここに<strong class="target-word">鋭い</strong>痛みがあります。'
    tokens = [['ここ', None], ['に', None], ['鋭い', 'するど', 'い'], ['痛み', 'いた', 'み'],
              ['が', None], ['あり', None], ['ます', None], ['。', None]]
    p = build_typing_payload_ja('鋭い', [_ex(origin, tokens)])
    assert p['answer_text'] == '鋭い'
    assert p['answer_reading'] == 'するどい'
    assert '____' in p['blank_text']


def test_conjugated_verb_with_okurigana():
    origin = 'この服は<strong class="target-word">買っ</strong>たんだ。'
    tokens = [['この', None], ['服', 'ふく', ''], ['は', None], ['買っ', 'か', 'っ'],
              ['た', None], ['ん', None], ['だ', None], ['。', None]]
    p = build_typing_payload_ja('買う', [_ex(origin, tokens)])
    assert p['answer_reading'] == 'かっ'


def test_multi_token_blank_and_inner_kana():
    origin = '彼は通りを<strong class="target-word">行ったり来たり</strong>した。'
    tokens = [['彼', 'かれ', ''], ['は', None], ['通り', 'とお', 'り'], ['を', None],
              ['行ったり来たり', 'いったりきたり', ''], ['し', None], ['た', None], ['。', None]]
    p = build_typing_payload_ja('行ったり来たり', [_ex(origin, tokens)])
    assert p['answer_reading'] == 'いったりきたり'


def test_blank_spans_two_tokens():
    origin = '私は<strong class="target-word">食べた</strong>。'
    tokens = [['私', 'わたし', ''], ['は', None], ['食べ', 'た', 'べ'], ['た', None], ['。', None]]
    assert build_typing_payload_ja('食べる', [_ex(origin, tokens)])['answer_reading'] == 'たべた'


def test_katakana_word_is_hiragana():
    origin = 'この<strong class="target-word">ブランド</strong>は有名だ。'
    p = build_typing_payload_ja('ブランド', [_ex(origin)])
    assert p['answer_reading'] == 'ぶらんど'
    assert p['answer_text'] == 'ブランド'
    assert to_hiragana('コーヒー') == 'こーひー'


def test_token_reading_katakana_converted():
    origin = '<strong class="target-word">外国</strong>です。'
    tokens = [['外国', 'ガイコク', ''], ['です', None], ['。', None]]
    assert build_typing_payload_ja('外国', [_ex(origin, tokens)])['answer_reading'] == 'がいこく'


def test_alignment_failure_returns_none():
    origin = '私は<strong class="target-word">食べた</strong>。'
    bad = [['僕', 'ぼく', ''], ['は', None], ['食べ', 'た', 'べ'], ['た', None], ['。', None]]
    assert build_typing_payload_ja('食べる', [_ex(origin, bad)]) is None


def test_boundary_inside_kanji_token_returns_none():
    # 강조가 '行ったり来たり' 토큰의 일부(行っ)만 → 읽기 토큰을 쪼갤 수 없음
    r = compute_answer_reading('行っ', '', 'たり来たり', tokens=[['行ったり来たり', 'いったりきたり', '']])
    assert r is None


def test_fallback_to_word_reading_when_no_tokens():
    origin = '<strong class="target-word">明白</strong>だった。'
    assert build_typing_payload_ja('明白', [_ex(origin)]) is None
    p = build_typing_payload_ja('明白', [_ex(origin)], word_reading='めいはく')
    assert p['answer_reading'] == 'めいはく'


def test_fallback_not_used_for_conjugated_form():
    origin = '<strong class="target-word">買っ</strong>た。'
    assert build_typing_payload_ja('買う', [_ex(origin)], word_reading='かう') is None


def test_latin_in_blank_rejected():
    origin = 'この<strong class="target-word">Tシャツ</strong>は長持ちした。'
    tokens = [['この', None], ['T', None], ['シャツ', None], ['は', None]]
    assert build_typing_payload_ja('Tシャツ', [_ex(origin, tokens)]) is None


def test_token_map_lookup_and_next_example_tried():
    bad_origin = 'だめ<strong class="target-word">明白</strong>。'      # 토큰 없음 → 건너뜀
    good_origin = '何は<strong class="target-word">明白</strong>です。'
    tokens = [['何', 'なに', ''], ['は', None], ['明白', 'めいはく', ''], ['です', None], ['。', None]]
    tmap = {7: {_squash(good_origin): tokens}}
    p = build_typing_payload_ja('明白', [_ex(bad_origin), _ex(good_origin)], tmap, 7)
    assert p['answer_reading'] == 'めいはく'
    assert p['blank_text'].startswith('何は')
