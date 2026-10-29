"""TTS 자리표시어 읽기 변환(app/services/tts/speech.py) 테스트.

규칙 변환은 읽기표를 비운 상태(no_table)로 검증하고, 읽기표 우선 순위와 캐시 키 불변은 따로 본다.
"""
import pytest

from app.services.tts import speech
from app.services.tts import service as tts_service
from app.services.tts.normalize import build_object_key


@pytest.fixture
def no_table(monkeypatch):
    monkeypatch.setattr(speech, '_READINGS', {})


@pytest.mark.parametrize('src,expected', [
    ('~할 수 있는', '무엇 무엇을 할 수 있는'),
    ('~에게 감사하다', '누구 누구에게 감사하다'),
    ('~을 초래하다', '무엇 무엇을 초래하다'),
    ('~를 초래하다', '무엇 무엇을 초래하다'),
    ('8~12주', '8에서 12주'),
    ('반드시 ~하게 하다', '반드시 무엇 무엇을 하게 하다'),
    ('~로 여기다', '무엇 무엇으로 여기다'),
    ('~와 함께', '무엇 무엇과 함께'),
    ('~가 되다', '무엇 무엇이 되다'),
    ('~인 척하다', '무엇 무엇인 척하다'),
    ('~에 대한', '무엇 무엇에 대한'),
    ('~에 대해, ~을 알다', '무엇 무엇에 대해, 무엇 무엇을 알다'),
    ('지나치게 ~', '지나치게 무엇 무엇'),
    ('〜한테 말하다', '누구 누구한테 말하다'),
    ('A를 B로 여기다', '무엇을 무엇으로 여기다'),
    ('A와 B를 구별하다', '무엇과 무엇을 구별하다'),
    ('A와 B', '무엇과 무엇'),
    ('A가 B에게 주다', '무엇이 무엇에게 주다'),
    ('~을 A로 바꾸다', '무엇 무엇을 무엇으로 바꾸다'),
    ('정말 좋아~', '정말 좋아'),
])
def test_ko_rules(no_table, src, expected):
    assert speech.to_speech_text(src, 'ko') == expected


@pytest.mark.parametrize('src,expected', [
    ('blame A on B', 'blame something on something else'),
    ('prefer A to B', 'prefer something to something else'),
    ('give sb sth', 'give somebody something'),
    ("take sb's word for it", "take somebody's word for it"),
    ('remind sb/sth of', 'remind somebody or something of'),
    ('make up one\'s mind', "make up one's mind"),
    ('as ~ as possible', 'as something as possible'),
    ('A as well as B', 'something as well as something else'),
])
def test_en_rules(no_table, src, expected):
    assert speech.to_speech_text(src, 'en') == expected


def test_ja_rules(no_table):
    assert speech.to_speech_text('〜について', 'ja') == 'なになにについて'
    assert speech.to_speech_text('～によって', 'ja') == 'なになにによって'


@pytest.mark.parametrize('src,lang', [
    ('할 수 있는', 'ko'),
    ('감사하다', 'ko'),
    ('A cat sat on the mat.', 'en'),          # 문장 첫 관사 A 는 자리표시어가 아니다
    ('Plan B was better.', 'en'),
    ('apple', 'en'),
    ('日本語を勉強する', 'ja'),
    # A·B 중 한쪽만 있으면 일반 문구다(둘 다 있거나 ~ 와 함께일 때만 자리표시어).
    ('비타민 B를 먹다', 'ko'),
    ('A형 간염', 'ko'),
    ('B급 영화', 'ko'),
    ('플랜 B로 가다', 'ko'),
    ('A형과 B형', 'ko'),                       # 뒤가 조사가 아닌 한글이면 후보가 아니다
    ('vitamin B', 'en'),
    ('plan B', 'en'),
    ('grade A', 'en'),
])
def test_unchanged_without_placeholder(no_table, src, lang):
    assert speech.to_speech_text(src, lang) is src


def test_idempotent(no_table):
    for src, lang in [('~할 수 있는', 'ko'), ('A를 B로 여기다', 'ko'),
                      ('blame A on B', 'en'), ('give sb sth', 'en'), ('〜について', 'ja')]:
        once = speech.to_speech_text(src, lang)
        assert speech.to_speech_text(once, lang) == once


def test_table_first(monkeypatch):
    monkeypatch.setattr(speech, '_READINGS', {'ko': {'~의 탓으로 돌리다': '누구 누구의 탓으로 돌리다'}})
    assert speech.to_speech_text('~의 탓으로 돌리다', 'ko') == '누구 누구의 탓으로 돌리다'
    # 표에 없으면 규칙
    assert speech.to_speech_text('~의 일부', 'ko') == '무엇 무엇의 일부'


def test_table_keys_normalized(monkeypatch, tmp_path):
    # 원문 키에 전각 공백(U+3000)·연속 공백이 있어도 정규화된 입력과 매칭된다
    path = tmp_path / 'r.json'
    path.write_text('{"ko": {"① 얻다\u3000②  ~하게 되다": "일 얻다 이 무엇 무엇을 하게 되다"}}', encoding='utf-8')
    monkeypatch.setattr(speech, '_READINGS_PATH', str(path))
    monkeypatch.setattr(speech, '_READINGS', speech._load_readings())
    assert speech.to_speech_text('① 얻다 ② ~하게 되다', 'ko') == '일 얻다 이 무엇 무엇을 하게 되다'


class _P:
    name = 'edge'
    model = 'm'

    def voice_for(self, language):
        return 'v'


def test_object_key_unchanged_for_plain_text():
    # 자리표시어 없는 텍스트는 기존(정규화 원문) 키와 같아야 한다 — 전체 TTS 재생성 방지.
    p = _P()
    assert tts_service.object_key_for(p, 'ko', '감사하다') == \
        build_object_key('tts', 'edge', 'm', 'v', 'ko', '감사하다')


def test_object_key_uses_reading(no_table):
    p = _P()
    assert tts_service.object_key_for(p, 'ko', '~할 수 있는') == \
        tts_service.object_key_for(p, 'ko', '무엇 무엇을 할 수 있는')


# ── 스펠링 채우기(spellingFill) 자격 — 같은 이슈(#21) 백엔드 작업이라 여기 함께 둔다 ──
from app.services.recommend.pool import CandidateItem
from app.services.recommend.composer import _item_can_use_question_type, spelling_answer
from app.constants.question_types import (
    ALLOWED_QUESTION_TYPES, RECOMMENDABLE_QUESTION_TYPES, TIER_QUESTION_TYPES,
)


def _item(word, lang='en', reading=None, meanings=('뜻',)):
    return CandidateItem(
        user_voca_id=1, user_voca_book_id=None, word=word, meanings=list(meanings), examples=[],
        fsrs_state={}, bucket='new', word_length=len(word), dict_lang=lang, reading=reading,
    )


def test_spelling_fill_registered():
    assert 'spellingFill' in RECOMMENDABLE_QUESTION_TYPES
    assert 'spellingFill' in ALLOWED_QUESTION_TYPES
    assert 'spellingFill' in TIER_QUESTION_TYPES[4] and 'spellingFill' in TIER_QUESTION_TYPES[5]


@pytest.mark.parametrize('item,ok', [
    (_item('apple'), True),
    (_item('go'), True),
    (_item('a'), False),               # 2글자 미만
    (_item('a '), False),              # 공백 제외 1글자
    (_item('apple', meanings=()), False),  # 뜻 없음
    (_item('食べる', 'ja', reading='たべる'), True),
    (_item('食べる', 'ja'), False),    # 읽기 없음
    (_item('すし', 'ja'), True),       # 가나 단어는 단어 자체가 읽기
    (_item('木', 'ja', reading='き'), False),
])
def test_spelling_fill_eligibility(item, ok):
    assert _item_can_use_question_type(item, 'spellingFill') is ok


def test_spelling_answer():
    assert spelling_answer(_item('食べる', 'ja', reading='たべる')) == 'たべる'
    assert spelling_answer(_item('check in')) == 'check in'


def test_hint_used_rating_is_hard():
    # /study/log: 힌트를 쓰고 맞히면 typo 경로(Hard)로 넘긴다 — derive_rating 계약 확인.
    from app.services.fsrs.ratings import derive_rating
    assert derive_rating(True, typo=True) == 2
    assert derive_rating(True) == 3
    assert derive_rating(False, typo=True) == 1
