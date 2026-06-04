"""
예문 강조(<strong class="target-word">) 태깅 공용 헬퍼.

admin(사전 단어/단어장) 과 voca_books(사용자 단어장) 양쪽에서 재사용한다.
키 중립: 영어 예문/한국어 예문을 en/ko 인자로 받는다.
호출부에서 origin/meaning 또는 exam_en/exam_ko 와 매핑한다.

처리 단계:
  1. spaCy(영어) / Kiwi(한국어) 로 단어(활용형 포함)를 찾아 태깅 (무료)
  2. 실패 시 regex / 문자열 검색 fallback (무료)
  3. 그래도 실패한 잔여분만 GPT 배치로 처리 (호출 최소화)
"""

import os
import re
import json

STRONG = '<strong class="target-word">'

_spacy_nlp = None
_kiwi_instance = None


def _get_spacy():
    global _spacy_nlp
    if _spacy_nlp is None:
        try:
            import spacy
            _spacy_nlp = spacy.load('en_core_web_sm')
        except Exception:
            _spacy_nlp = False
    return _spacy_nlp if _spacy_nlp is not False else None


def _get_kiwi():
    global _kiwi_instance
    if _kiwi_instance is None:
        try:
            from kiwipiepy import Kiwi
            _kiwi_instance = Kiwi()
        except Exception:
            _kiwi_instance = False
    return _kiwi_instance if _kiwi_instance is not False else None


def _tag_en(word, sentence):
    """영어 예문에서 단어(활용형 포함)에 strong 태그 삽입. 실패 시 None 반환."""
    if not word or not sentence:
        return sentence or ''
    nlp = _get_spacy()
    if nlp:
        try:
            doc = nlp(sentence)
            word_lower = word.lower()
            for token in doc:
                if token.lemma_.lower() == word_lower or token.text.lower() == word_lower:
                    s, e = token.idx, token.idx + len(token.text)
                    return sentence[:s] + f'<strong class="target-word">{sentence[s:e]}</strong>' + sentence[e:]
        except Exception:
            pass
    # regex fallback: word + common suffixes
    m = re.search(r'\b(' + re.escape(word) + r'\w*)\b', sentence, re.IGNORECASE)
    if m:
        return sentence[:m.start()] + f'<strong class="target-word">{m.group()}</strong>' + sentence[m.end():]
    return None


def _ko_roots(meaning):
    """한국어 뜻에서 검색할 어근 후보 목록 반환"""
    roots = [meaning]
    stripped = re.sub(r'(하다|이다|되다|지다|다)$', '', meaning).strip()
    if stripped and stripped != meaning:
        roots.insert(0, stripped)
    return roots


def _tag_ko(meanings, sentence):
    """한국어 예문에서 뜻 단어(활용형 포함)에 strong 태그 삽입. 실패 시 None 반환."""
    if not sentence or not meanings:
        return None
    kiwi = _get_kiwi()
    if kiwi:
        try:
            tokens = kiwi.tokenize(sentence)
            for meaning in meanings:
                root = re.sub(r'(하다|이다|되다|지다|다)$', '', meaning).strip()
                if not root or len(root) < 2:
                    continue
                for token in tokens:
                    if token.form == root:
                        start = token.start
                        end = start + token.len
                        while end < len(sentence) and sentence[end] not in ' .,!?;:\n':
                            end += 1
                        return sentence[:start] + f'<strong class="target-word">{sentence[start:end]}</strong>' + sentence[end:]
        except Exception:
            pass
    # 단순 문자열 검색 (GPT 호출 전 마지막 시도)
    for meaning in meanings:
        for root in _ko_roots(meaning):
            if len(root) >= 2 and root in sentence:
                idx = sentence.index(root)
                end = idx + len(root)
                while end < len(sentence) and sentence[end] not in ' .,!?;:\n':
                    end += 1
                return sentence[:idx] + f'<strong class="target-word">{sentence[idx:end]}</strong>' + sentence[end:]
    return None


def _tag_batch_gpt(items):
    """
    items: [{'word', 'meanings', 'en', 'ko'}, ...]
    Returns: [{'en', 'ko'}, ...] 같은 순서
    """
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key or not items:
        return [{'en': it['en'], 'ko': it['ko']} for it in items]
    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        input_data = [
            {'i': i, 'word': it['word'], 'meanings': it['meanings'],
             'en': it['en'], 'ko': it['ko']}
            for i, it in enumerate(items)
        ]
        prompt = (
            '다음 영어 단어와 예문 목록에서, 영어 예문에는 해당 단어(활용형 포함)에, '
            '한국어 예문에는 해당 단어의 한국어 뜻(활용형 포함)에 '
            '<strong class="target-word"> 태그를 정확히 1개 삽입해주세요.\n\n'
            + json.dumps(input_data, ensure_ascii=False, indent=2)
            + '\n\n출력: 인덱스 i 순서대로 JSON 배열만. 형식: [{"i":0,"en":"...","ko":"..."},...]\n다른 텍스트 없이 JSON만 출력.'
        )
        response = client.chat.completions.create(
            model='gpt-4o-mini',
            messages=[{'role': 'user', 'content': prompt}],
            temperature=0,
            max_tokens=8192,
        )
        text = response.choices[0].message.content.strip()
        m = re.search(r'\[.*\]', text, re.DOTALL)
        if m:
            text = m.group(0)
        raw = json.loads(text)
        indexed = {r['i']: r for r in raw}
        return [
            {'en': indexed[i]['en'], 'ko': indexed[i]['ko']}
            if i in indexed else {'en': items[i]['en'], 'ko': items[i]['ko']}
            for i in range(len(items))
        ]
    except Exception as e:
        print(f'[GPT tag error] {e}')
        return [{'en': it['en'], 'ko': it['ko']} for it in items]


def tag_example_pair(word, meanings, en, ko):
    """
    예문 한 쌍(en/ko)을 spaCy/Kiwi 1차 처리한다. GPT는 호출하지 않는다.

    Returns: (tagged_en, tagged_ko, need_gpt_en, need_gpt_ko)
      - tagged_*: 강조 적용된 문자열. 1차 처리 실패 시 원문 그대로.
      - need_gpt_*: 1차 처리 실패하여 GPT 보정이 필요한지 여부.
    이미 강조된(STRONG 포함) 예문은 그대로 두고 need_gpt=False.
    """
    en_orig = en or ''
    ko_orig = ko or ''

    if STRONG in en_orig:
        tagged_en = en_orig
    else:
        tagged_en = _tag_en(word, en_orig) if en_orig else en_orig

    if STRONG in ko_orig:
        tagged_ko = ko_orig
    else:
        tagged_ko = _tag_ko(meanings, ko_orig) if ko_orig else ko_orig

    need_gpt_en = tagged_en is None and bool(en_orig)
    need_gpt_ko = tagged_ko is None and bool(ko_orig)

    # 1차 실패 시 GPT 전까지는 원문 유지
    return (
        tagged_en if tagged_en is not None else en_orig,
        tagged_ko if tagged_ko is not None else ko_orig,
        need_gpt_en,
        need_gpt_ko,
    )
