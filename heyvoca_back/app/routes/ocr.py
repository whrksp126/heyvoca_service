from flask import request, jsonify
from app.routes import ocr_bp
from app import db
from app.models.models import Voca, VocaMeaningMap, VocaMeaning, VocaExampleMap, VocaExample
from app.utils.jwt_utils import jwt_required

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
        
        # 전처리: words[].text를 전부 소문자로 변경
        for word in words:
            if isinstance(word, dict) and 'text' in word:
                word['text'] = word['text'].lower()
        
        # words[].text 추출
        word_texts = [word.get('text') for word in words if isinstance(word, dict) and word.get('text')]
        
        if not word_texts:
            return jsonify({
                'code': 400,
                'message': '유효한 text 필드가 없습니다.'
            })
        
        # voca 테이블에서 일치하는 단어 조회 (meanings, examples 포함)
        matched_vocas = db.session.query(Voca).filter(Voca.word.in_(word_texts)).all()
        
        # 결과 데이터 구성
        matched_words = []
        for voca in matched_vocas:
            # voca_meanings 조회
            meanings_data = []
            meaning_maps = db.session.query(VocaMeaningMap, VocaMeaning)\
                .join(VocaMeaning, VocaMeaningMap.meaning_id == VocaMeaning.id)\
                .filter(VocaMeaningMap.voca_id == voca.id)\
                .all()
            
            for meaning_map, meaning in meaning_maps:
                meanings_data.append({
                    'id': meaning.id,
                    'meaning': meaning.meaning
                })
            
            # voca_examples 조회
            examples_data = []
            example_maps = db.session.query(VocaExampleMap, VocaExample)\
                .join(VocaExample, VocaExampleMap.example_id == VocaExample.id)\
                .filter(VocaExampleMap.voca_id == voca.id)\
                .all()
            
            for example_map, example in example_maps:
                examples_data.append({
                    'id': example.id,
                    'exam_en': example.exam_en,
                    'exam_ko': example.exam_ko
                })
            
            matched_words.append({
                'id': voca.id,
                'word': voca.word,
                'pronunciation': voca.pronunciation,
                'meanings': meanings_data,
                'examples': examples_data
            })
        
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
        return jsonify({
            'code': 500,
            'message': f'서버 오류가 발생했습니다: {str(e)}'
        })

