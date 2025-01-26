from flask import render_template, redirect, url_for, request, session, jsonify, send_file, send_from_directory
from app import db
from app.routes import tts_bp

from flask_login import current_user, login_required, login_user, logout_user

import json
from gtts import gTTS
import os
import uuid
import io


@tts_bp.route('/')
def tts():
    return render_template('tts_test.html')



# @tts_bp.route('/output', methods=['POST'])
@tts_bp.route('/output', methods=['GET'])
def tts_output():
    text = request.args.get('text')
    language = request.args.get('language')
    
    if not text:
        return jsonify({"error": "단어를 입력해주세요"}), 400
    
    # TTS 생성
    tts = gTTS(text=text, lang=language)
    
    # 저장 안하고 스트림으로 바로 보내장
    mp3_fp = io.BytesIO()
    tts.write_to_fp(mp3_fp)  # Use write_to_fp instead of save
    mp3_fp.seek(0)  # Go to the start of the BytesIO object

    return send_file(mp3_fp, mimetype="audio/mp3", as_attachment=False, download_name="output.mp3")