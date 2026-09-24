import logging

from flask import request, jsonify
from sqlalchemy import func
from app.routes import ocr_bp
from app import db
from app.models.models import Voca, VocaMeaningMap, VocaMeaning, VocaExampleMap, VocaExample
from app.utils.jwt_utils import jwt_required
from app.utils.dict_lang import get_dict_lang
from app.utils.word_payload import load_ja_word_extras, load_ja_example_tokens, apply_word_fields

# 일본어 OCR 후보 추출 — 줄 텍스트를 n-gram 으로 잘라 voca.word IN (...) 으로 찾는다.
# LIKE '%..%' 전체 스캔 대신 인덱스(voca.word) 조회로 끝내기 위함.
JA_NGRAM_MIN = 2
JA_NGRAM_MAX = 6
JA_MAX_CANDIDATES = 200
JA_MAX_NGRAMS = 5000   # IN 목록 상한(입력 300줄 × 줄당 n-gram 폭주 방지)


def _ja_ngrams(line):
    """줄 텍스트 → 길이 2~6 부분 문자열(공백 제거, 등장 순, 중복 제거)."""
    t = ''.join(line.split())
    out = []
    seen = set()
    n = len(t)
    for i in range(n):
        for L in range(JA_NGRAM_MIN, JA_NGRAM_MAX + 1):
            if i + L > n:
                break
            g = t[i:i + L]
            if g not in seen:
                seen.add(g)
                out.append(g)
    return out


def _ja_match_vocas(texts):
    """일본어 OCR 줄 목록 → 매칭 Voca 목록(정확 일치 우선, 그다음 줄 안에 포함된 사전 단어).

    1) 줄 전체가 voca.word 와 정확히 일치하면 그 단어
    2) 아니면 줄을 2~6자 n-gram 으로 잘라 voca.word IN 조회 — 길이 긴 후보 우선, 최대 200개
    """
    # utf8mb4_unicode_ci 는 탁점·반탁점/가나 크기를 무시한다(パン = バン, ます = マス) —
    # DB 에서 넓게 받은 뒤 파이썬에서 표기가 정확히 같은 것만 남긴다.
    text_set = set(texts)
    exact_rows = [v for v in db.session.query(Voca).filter(Voca.word.in_(texts)).all() if v.word in text_set]
    exact_words = {v.word for v in exact_rows}
    result = list(exact_rows)
    seen_ids = {v.id for v in exact_rows}

    grams = []
    gram_seen = set()
    for t in texts:
        if t in exact_words:
            continue
        for g in _ja_ngrams(t):
            if g not in gram_seen:
                gram_seen.add(g)
                grams.append(g)
            if len(grams) >= JA_MAX_NGRAMS:
                break
        if len(grams) >= JA_MAX_NGRAMS:
            break

    if grams and len(result) < JA_MAX_CANDIDATES:
        # 긴 단어(더 구체적인 매칭) 우선. 같은 표기의 동형이의어는 id 순.
        cand = (db.session.query(Voca)
                .filter(Voca.word.in_(grams))
                .order_by(func.char_length(Voca.word).desc(), Voca.id.asc())
                .limit(JA_MAX_CANDIDATES * 2)
                .all())
        gram_set = set(grams)
        for v in cand:
            if v.id in seen_ids or v.word not in gram_set:
                continue
            seen_ids.add(v.id)
            result.append(v)
            if len(result) >= JA_MAX_CANDIDATES:
                break
    return result

# OCR에서 추출한 단어 리스트를 받는 API
@ocr_bp.route('/words', methods=['POST'])
@jwt_required
def receive_words():
    try:
        data = request.get_json()
        
        words = data.get('words')
        if words is None:
            return jsonify({
                'code': 400,
                'message': 'words 필드가 없습니다.'
            })

        # DoS 방지 — 배열 타입/개수 상한(OCR 한 화면 단어 수는 실사용상 수십 개라 300은 충분한 여유)
        # + 단어 길이 상한(Voca.word 컬럼과 정합). 초과 시 거부.
        MAX_OCR_WORDS = 300
        MAX_WORD_LEN = 255
        if not isinstance(words, list):
            return jsonify({'code': 400, 'message': 'words는 배열이어야 합니다.'})
        if len(words) > MAX_OCR_WORDS:
            return jsonify({
                'code': 400,
                'message': f'단어는 최대 {MAX_OCR_WORDS}개까지 처리할 수 있습니다.'
            })

        # 사전 언어: 현재 학습 언어(인증 사용자 learning_lang). ja 는 소문자화하지 않는다.
        lang = get_dict_lang()

        # 전처리: text 소문자화(en, 문자열만) + 추출. 과도하게 긴 값은 제외.
        word_texts = []
        for word in words:
            if isinstance(word, dict) and isinstance(word.get('text'), str):
                t = word['text'].strip() if lang == 'ja' else word['text'].lower()
                word['text'] = t
                if t and len(t) <= MAX_WORD_LEN:
                    word_texts.append(t)

        if not word_texts:
            return jsonify({
                'code': 400,
                'message': '유효한 text 필드가 없습니다.'
            })
        
        # voca 테이블에서 일치하는 단어 조회 (meanings, examples 포함)
        if lang == 'ja':
            matched_vocas = _ja_match_vocas(word_texts)
        else:
            matched_vocas = db.session.query(Voca).filter(Voca.word.in_(word_texts)).all()

        # 뜻·예문·(ja)읽기/JLPT·후리가나를 voca_id IN 으로 일괄 조회 (단어당 쿼리 N+1 제거)
        voca_ids = [v.id for v in matched_vocas]
        extras = load_ja_word_extras(voca_ids, lang)
        meanings_by_voca = {}
        examples_by_voca = {}
        if voca_ids:
            for voca_id, meaning in (db.session.query(VocaMeaningMap.voca_id, VocaMeaning)
                                     .join(VocaMeaning, VocaMeaningMap.meaning_id == VocaMeaning.id)
                                     .filter(VocaMeaningMap.voca_id.in_(voca_ids))
                                     .all()):
                meanings_by_voca.setdefault(voca_id, []).append({
                    'id': meaning.id,
                    'meaning': meaning.meaning
                })
            example_rows = (db.session.query(VocaExampleMap.voca_id, VocaExample)
                            .join(VocaExample, VocaExampleMap.example_id == VocaExample.id)
                            .filter(VocaExampleMap.voca_id.in_(voca_ids))
                            .all())
            tokens_map = load_ja_example_tokens([ex.id for _, ex in example_rows], lang)
            for voca_id, example in example_rows:
                ex = {
                    'id': example.id,
                    'exam_en': example.exam_en,
                    'exam_ko': example.exam_ko,
                }
                if lang == 'ja':
                    # 공통 예문 키(origin/meaning) + 후리가나 — 기존 exam_en/exam_ko 는 호환용 유지
                    ex['origin'] = example.exam_en
                    ex['meaning'] = example.exam_ko
                    if example.id in tokens_map:
                        ex['reading_tokens'] = tokens_map[example.id]
                examples_by_voca.setdefault(voca_id, []).append(ex)

        # 결과 데이터 구성 (매칭 순서 유지 — ja 는 정확 일치 → 긴 후보 순)
        matched_words = []
        for voca in matched_vocas:
            matched_words.append(apply_word_fields({
                'id': voca.id,
                'vocaId': voca.id,
                'word': voca.word,
                'pronunciation': voca.pronunciation,
                'meanings': meanings_by_voca.get(voca.id, []),
                'examples': examples_by_voca.get(voca.id, [])
            }, voca.id, extras, lang))
        
        return jsonify({
            'code': 200,
            'status': 'success',
            'data': {
                'total_words': len(word_texts),
                'matched_count': len(matched_words),
                'matched_words': matched_words
            }
        })
        
    except Exception as e:
        logging.getLogger(__name__).error('receive_words 오류', exc_info=True)
        return jsonify({
            'code': 500,
            'message': '서버 오류가 발생했습니다.'
        })

