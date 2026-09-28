"""
tests/test_sentence_puzzle_payload.py — "출제형 문제 1단계"(sentenceArrangePartial/
sentenceArrange/listenArrange/fillInTheBlankTyping) 순수 함수 테스트.

DB 의존성 없음 — puzzle을 dict로 직접 구성해 app.services.sentence_puzzle /
app.services.fill_blank_typing / app.services.typing_guard 를 검증한다.
"""

from app.services.sentence_puzzle import (
    normalize_sentence_text, sentence_hash, puzzle_usable, build_arrange_payload,
)
from app.services.fill_blank_typing import build_typing_payload, _extract_blank
from app.services.typing_guard import edits1, blocked_typos_for


ORIGIN = 'I need to <strong class="target-word">check in</strong> for my flight online.'
MEANING = '비행기 온라인 <strong class="target-word">체크인</strong>을 해야 해요.'

PUZZLE = {
    'example_id':         27391,
    'tokens':             ['I', 'need', 'to', 'check', 'in', 'for', 'my', 'flight', 'online'],
    'target_idx':         [3, 4],
    'first_form':         'i',
    'alt_orders':         [['I', 'need', 'to', 'check', 'in', 'for', 'my', 'flight', 'online']],
    'distractors':        ['book', 'cancel'],
    'listen_distractors': ['look', 'out'],
    'skip_reason':        None,
}

SHORT_PUZZLE = {
    'example_id':         1,
    'tokens':             ['She', 'is', 'very', 'kind'],
    'target_idx':         [3],
    'first_form':         'she',
    'alt_orders':         [],
    'distractors':        ['nice', 'sweet'],
    'listen_distractors': ['mind', 'kine'],
    'skip_reason':        None,
}


# ──────────────────────────────────────────────
# normalize_sentence_text / sentence_hash
# ──────────────────────────────────────────────

class TestNormalizeAndHash:
    def test_strips_tags_lowercases_and_collapses_punct(self):
        assert normalize_sentence_text(ORIGIN) == 'i need to check in for my flight online'

    def test_same_text_same_hash(self):
        assert sentence_hash(ORIGIN) == sentence_hash(ORIGIN)

    def test_tag_variation_still_matches(self):
        # 강조 위치가 달라져도(태그 제거 후 평문이 같으면) 같은 해시 — 사용자 단어장에
        # 복사되며 강조 스타일이 미세하게 달라져도 매칭되게 하기 위함.
        other = 'I need to check in for my flight online.'
        assert sentence_hash(ORIGIN) == sentence_hash(other)

    def test_empty_text(self):
        assert normalize_sentence_text('') == ''
        assert normalize_sentence_text(None) == ''


# ──────────────────────────────────────────────
# puzzle_usable
# ──────────────────────────────────────────────

class TestPuzzleUsable:
    def test_usable_puzzle(self):
        assert puzzle_usable(PUZZLE) is True

    def test_none_puzzle(self):
        assert puzzle_usable(None) is False

    def test_skip_reason_blocks(self):
        skipped = dict(PUZZLE, skip_reason='too_short')
        assert puzzle_usable(skipped) is False

    def test_missing_tokens_blocks(self):
        broken = dict(PUZZLE, tokens=[])
        assert puzzle_usable(broken) is False


# ──────────────────────────────────────────────
# build_arrange_payload — partial / full / listen
# ──────────────────────────────────────────────

class TestBuildArrangePayloadPartial:
    def test_window_includes_target_and_is_3_to_5(self):
        payload = build_arrange_payload(PUZZLE, mode='partial', example_origin=ORIGIN, example_meaning=MEANING)
        assert payload is not None
        window = payload['accepted'][0]
        assert 3 <= len(window) <= 5
        assert 'check' in window and 'in' in window

    def test_prefix_suffix_reconstruct_full_sentence(self):
        payload = build_arrange_payload(PUZZLE, mode='partial', example_origin=ORIGIN, example_meaning=MEANING)
        window = payload['accepted'][0]
        rebuilt = ' '.join(filter(None, [payload['prefix'], ' '.join(window), payload['suffix']]))
        expected = ['i'] + PUZZLE['tokens'][1:]  # 첫 토큰만 first_form(소문자)로 치환
        assert rebuilt.split() == expected

    def test_ko_and_answer_text_present(self):
        payload = build_arrange_payload(PUZZLE, mode='partial', example_origin=ORIGIN, example_meaning=MEANING)
        assert payload['ko'] == MEANING
        assert payload['answer_text'] == ORIGIN

    def test_bank_contains_window_and_distractors(self):
        payload = build_arrange_payload(PUZZLE, mode='partial', example_origin=ORIGIN, example_meaning=MEANING)
        window = payload['accepted'][0]
        assert set(window).issubset(set(payload['bank']))
        assert len(payload['bank']) > len(window)  # 방해 조각 최소 1개 포함

    def test_short_sentence_window_capped_at_length(self):
        payload = build_arrange_payload(SHORT_PUZZLE, mode='partial', example_origin='She is very kind.', example_meaning='그녀는 매우 친절하다.')
        assert len(payload['accepted'][0]) <= len(SHORT_PUZZLE['tokens'])


class TestBuildArrangePayloadFull:
    def test_short_sentence_uses_all_tokens_no_prefix(self):
        payload = build_arrange_payload(SHORT_PUZZLE, mode='full', example_origin='She is very kind.', example_meaning='그녀는 매우 친절하다.')
        assert payload['prefix'] == ''
        assert payload['suffix'] == ''
        assert len(payload['accepted'][0]) == len(SHORT_PUZZLE['tokens'])

    def test_long_sentence_caps_window_at_7_centered_on_target(self):
        # 9토큰 문장, target=[3,4](check in) — 창이 target을 중심으로 잡혀 앞뒤 모두
        # 고정 텍스트(prefix/suffix)가 생길 수 있다(2026-09 2차 보완: 상한을 항상 지키기
        # 위해 뒤쪽 우선이 아니라 target 중심 윈도우로 변경).
        payload = build_arrange_payload(PUZZLE, mode='full', example_origin=ORIGIN, example_meaning=MEANING)
        window = payload['accepted'][0]
        assert len(window) <= 7
        assert payload['prefix'] != ''
        assert payload['suffix'] != ''
        assert 'check' in window and 'in' in window

    def test_full_sentence_window_never_exceeds_cap_regardless_of_target_position(self):
        # target이 문장 맨 앞쪽에 있어도(예전 tail 앵커였으면 창이 7을 넘었을 케이스)
        # 항상 7 이하로 잡혀야 한다.
        front_puzzle = dict(PUZZLE, target_idx=[0])
        payload = build_arrange_payload(front_puzzle, mode='full', example_origin=ORIGIN, example_meaning=MEANING)
        assert len(payload['accepted'][0]) <= 7

    def test_alt_orders_mapped_when_prefix_matches(self):
        payload = build_arrange_payload(PUZZLE, mode='full', example_origin=ORIGIN, example_meaning=MEANING)
        # PUZZLE의 alt_orders는 원문과 동일 — 매핑돼도 accepted에 중복 추가되지 않는다
        assert len(payload['accepted']) == 1


class TestBuildArrangePayloadListen:
    def test_ignores_alt_orders(self):
        payload = build_arrange_payload(PUZZLE, mode='listen', example_origin=ORIGIN, example_meaning=MEANING)
        assert len(payload['accepted']) == 1  # 원문 어순만 정답

    def test_uses_listen_distractors_not_meaning_distractors(self):
        payload = build_arrange_payload(PUZZLE, mode='listen', example_origin=ORIGIN, example_meaning=MEANING)
        window = payload['accepted'][0]
        extra = set(payload['bank']) - set(window)
        assert extra.issubset(set(PUZZLE['listen_distractors']))
        assert not extra.intersection(set(PUZZLE['distractors']) - set(PUZZLE['listen_distractors']))

    def test_unusable_puzzle_returns_none(self):
        skipped = dict(PUZZLE, skip_reason='bad')
        assert build_arrange_payload(skipped, mode='full') is None


# ──────────────────────────────────────────────
# fillInTheBlankTyping — build_typing_payload / _extract_blank
# ──────────────────────────────────────────────

class TestFillInTheBlankTyping:
    def test_extract_blank_finds_tag(self):
        blank_text, blank_fill = _extract_blank(ORIGIN)
        assert blank_fill == 'check in'
        assert '____' in blank_text
        assert 'strong' not in blank_text

    def test_no_tag_returns_none(self):
        blank_text, blank_fill = _extract_blank('I need to check in for my flight online.')
        assert blank_fill is None

    def test_build_payload_happy_path(self):
        examples = [{'origin': ORIGIN, 'meaning': MEANING}]
        payload = build_typing_payload('check in', examples)
        assert payload['answer_text'] == 'check in'
        assert payload['base_form'] == 'check in'
        assert '____' in payload['blank_text']

    def test_build_payload_skips_untagged_examples(self):
        examples = [
            {'origin': 'plain sentence with no tag.', 'meaning': '태그 없는 문장.'},
            {'origin': ORIGIN, 'meaning': MEANING},
        ]
        payload = build_typing_payload('check in', examples)
        assert payload is not None
        assert payload['answer_text'] == 'check in'

    def test_build_payload_none_when_no_tagged_example(self):
        examples = [{'origin': 'plain sentence.', 'meaning': '태그 없음.'}]
        assert build_typing_payload('word', examples) is None


# ──────────────────────────────────────────────
# typing_guard — edits1 / blocked_typos_for
# ──────────────────────────────────────────────

class TestTypingGuard:
    def test_edits1_contains_substitution_transposition_insertion_deletion(self):
        variants = edits1('cat')
        assert 'bat' in variants   # 치환
        assert 'cta' in variants   # 인접 전치
        assert 'cats' in variants  # 삽입
        assert 'at' in variants    # 삭제

    def test_blocked_typos_uses_provided_word_set(self):
        # bat(치환 c→b) / cot(치환 a→o) / car(치환 t→r) 모두 'cat'과 편집거리 1
        word_set = {'cat', 'bat', 'cot', 'car'}
        blocked = blocked_typos_for('cat', word_set=word_set)
        assert set(blocked) == {'bat', 'cot', 'car'}
        assert 'cat' not in blocked  # 정답 자신 제외

    def test_blocked_typos_empty_for_non_alpha_answer(self):
        assert blocked_typos_for('check in', word_set={'check', 'chick'}) == []

    def test_blocked_typos_empty_when_no_dictionary_overlap(self):
        assert blocked_typos_for('zzzzzzzzzz', word_set={'cat', 'bat'}) == []
