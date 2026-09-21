"""
tests/test_book_examples_scripts.py — scripts/fill_admin_book_examples.py의 순수 함수 단위 테스트.

예문 선택(어간 매칭)과 en/ko → origin/meaning 변환 로직을 검증한다. DB 의존성 없음.
"""

from scripts.fill_admin_book_examples import (
    clean_meaning,
    strip_suffix,
    extract_strong_text,
    stem_match,
    select_examples_for_row,
    example_en_ko,
    convert_legacy_examples,
    is_empty_examples_value,
)


# ──────────────────────────────────────────────
# clean_meaning / strip_suffix
# ──────────────────────────────────────────────

class TestCleanMeaning:
    def test_removes_whitespace_and_parens(self):
        assert clean_meaning('이루다 (달성)') == '이루다달성'

    def test_removes_punctuation(self):
        assert clean_meaning('포기하다, 버리다.') == '포기하다버리다'

    def test_none_returns_empty(self):
        assert clean_meaning(None) == ''


class TestStripSuffix:
    def test_strips_hada(self):
        assert strip_suffix('달성하다') == '달성'

    def test_strips_doeda(self):
        assert strip_suffix('완성되다') == '완성'

    def test_strips_jeogin_before_jeog(self):
        # '적인'이 '적'보다 먼저 검사되어야 함
        assert strip_suffix('긍정적인') == '긍정'

    def test_no_suffix_match_returns_original(self):
        assert strip_suffix('사과') == '사과'

    def test_does_not_strip_to_empty(self):
        # 접미가 전체 문자열이면(더 짧아질 게 없으면) 원본 유지
        assert strip_suffix('하다') == '하다'


# ──────────────────────────────────────────────
# extract_strong_text
# ──────────────────────────────────────────────

class TestExtractStrongText:
    def test_extracts_inner_text(self):
        ko = '그는 목표를 <strong class="target-word">달성했다</strong>.'
        assert extract_strong_text(ko) == '달성했다'

    def test_no_strong_tag_returns_empty(self):
        assert extract_strong_text('그는 목표를 달성했다.') == ''

    def test_empty_input_returns_empty(self):
        assert extract_strong_text('') == ''
        assert extract_strong_text(None) == ''

    def test_strips_nested_tags(self):
        ko = '<strong class="target-word"><em>달성</em>했다</strong>'
        assert extract_strong_text(ko) == '달성했다'


# ──────────────────────────────────────────────
# stem_match
# ──────────────────────────────────────────────

class TestStemMatch:
    def test_matches_when_stem_prefix_contained(self):
        # '달성하다' -> 어간 '달성' -> 태그 텍스트 '달성했다'에 '달성' 포함
        assert stem_match('달성하다', '달성했다') is True

    def test_matches_with_jeogin_suffix(self):
        assert stem_match('긍정적인', '긍정적으로') is True

    def test_no_match_for_unrelated_meaning(self):
        assert stem_match('포기하다', '달성했다') is False

    def test_empty_meaning_no_match(self):
        assert stem_match('', '달성했다') is False

    def test_empty_tag_text_no_match(self):
        assert stem_match('달성하다', '') is False

    def test_short_stem_under_two_chars_no_match(self):
        # 접미 제거 후 1글자만 남으면 매치하지 않음
        assert stem_match('한', '한다면') is False


# ──────────────────────────────────────────────
# select_examples_for_row
# ──────────────────────────────────────────────

class TestSelectExamplesForRow:
    def test_prioritizes_matched_examples(self):
        dict_examples = [
            (1, 'He gave up.', '그는 <strong class="target-word">포기했다</strong>.'),
            (2, 'He achieved his goal.', '그는 목표를 <strong class="target-word">달성했다</strong>.'),
            (3, 'She tried hard.', '그녀는 열심히 노력했다.'),
        ]
        row_meanings = ['달성하다']
        selected = select_examples_for_row(row_meanings, dict_examples, max_n=2)

        assert selected[0] == {
            'origin': 'He achieved his goal.',
            'meaning': '그는 목표를 <strong class="target-word">달성했다</strong>.',
        }
        assert len(selected) == 2

    def test_falls_back_to_id_order_when_no_match(self):
        dict_examples = [
            (2, 'Second example.', '두 번째 예문.'),
            (1, 'First example.', '첫 번째 예문.'),
        ]
        selected = select_examples_for_row(['상관없는뜻'], dict_examples, max_n=2)
        assert [s['origin'] for s in selected] == ['First example.', 'Second example.']

    def test_respects_max_n(self):
        dict_examples = [(i, f'en{i}', f'ko{i}') for i in range(1, 6)]
        selected = select_examples_for_row([], dict_examples, max_n=3)
        assert len(selected) == 3

    def test_excludes_fully_empty_examples(self):
        dict_examples = [
            (1, '', ''),
            (2, 'Valid example.', '유효한 예문.'),
        ]
        selected = select_examples_for_row([], dict_examples, max_n=3)
        assert len(selected) == 1
        assert selected[0]['origin'] == 'Valid example.'

    def test_no_dict_examples_returns_empty(self):
        assert select_examples_for_row(['뜻'], [], max_n=3) == []


# ──────────────────────────────────────────────
# example_en_ko
# ──────────────────────────────────────────────

class TestExampleEnKo:
    def test_reads_en_ko_keys(self):
        assert example_en_ko({'en': 'Hello.', 'ko': '안녕.'}) == ('Hello.', '안녕.')

    def test_reads_origin_meaning_keys(self):
        assert example_en_ko({'origin': 'Hello.', 'meaning': '안녕.'}) == ('Hello.', '안녕.')

    def test_missing_keys_return_empty_strings(self):
        assert example_en_ko({}) == ('', '')

    def test_non_dict_returns_empty_strings(self):
        assert example_en_ko('not a dict') == ('', '')

    def test_strips_whitespace(self):
        assert example_en_ko({'en': '  Hi.  ', 'ko': '  안녕  '}) == ('Hi.', '안녕')


# ──────────────────────────────────────────────
# convert_legacy_examples
# ──────────────────────────────────────────────

class TestConvertLegacyExamples:
    def test_converts_en_ko_to_origin_meaning(self):
        raw = '[{"en": "Hello.", "ko": "안녕."}]'
        converted, changed = convert_legacy_examples(raw)
        assert converted == [{'origin': 'Hello.', 'meaning': '안녕.'}]
        assert changed is True

    def test_already_standard_format_unchanged(self):
        raw = '[{"origin": "Hello.", "meaning": "안녕."}]'
        converted, changed = convert_legacy_examples(raw)
        assert converted == [{'origin': 'Hello.', 'meaning': '안녕.'}]
        assert changed is False

    def test_removes_fully_empty_items(self):
        raw = '[{"en": "Hello.", "ko": "안녕."}, {"en": "", "ko": ""}]'
        converted, changed = convert_legacy_examples(raw)
        assert converted == [{'origin': 'Hello.', 'meaning': '안녕.'}]
        assert changed is True

    def test_empty_string_input_returns_empty_list(self):
        converted, changed = convert_legacy_examples('')
        assert converted == []
        assert changed is False

    def test_none_input_returns_empty_list(self):
        converted, changed = convert_legacy_examples(None)
        assert converted == []
        assert changed is False

    def test_invalid_json_raises_value_error(self):
        try:
            convert_legacy_examples('not json')
            assert False, 'ValueError가 발생해야 함'
        except ValueError:
            pass

    def test_non_list_json_raises_value_error(self):
        try:
            convert_legacy_examples('{"en": "Hello."}')
            assert False, 'ValueError가 발생해야 함'
        except ValueError:
            pass

    def test_mixed_format_list_converted_consistently(self):
        raw = '[{"en": "A.", "ko": "가."}, {"origin": "B.", "meaning": "나."}]'
        converted, changed = convert_legacy_examples(raw)
        assert converted == [
            {'origin': 'A.', 'meaning': '가.'},
            {'origin': 'B.', 'meaning': '나.'},
        ]
        assert changed is True


# ──────────────────────────────────────────────
# is_empty_examples_value
# ──────────────────────────────────────────────

class TestIsEmptyExamplesValue:
    def test_none_is_empty(self):
        assert is_empty_examples_value(None) is True

    def test_empty_string_is_empty(self):
        assert is_empty_examples_value('') is True

    def test_empty_array_string_is_empty(self):
        assert is_empty_examples_value('[]') is True

    def test_literal_null_string_is_empty(self):
        assert is_empty_examples_value('null') is True

    def test_non_empty_json_is_not_empty(self):
        assert is_empty_examples_value('[{"origin": "A.", "meaning": "가."}]') is False
