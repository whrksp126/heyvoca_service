"""실서비스 노출용 엄선 TTS voice 카탈로그(Edge 신경망).

음성 설정 화면에서 사용자가 고를 수 있는 언어별 voice 목록 + 기본값 + 화이트리스트.
voice는 캐시 object key에 들어가므로 임의 확장은 캐시 파편화를 유발 → 엄선만 허용한다.
"""

# 언어별 엄선 voice. label은 사용자 노출용 한국어.
CURATED_VOICES = {
    'en': [
        {'voice': 'en-US-AriaNeural', 'label': '에이리아 (미국·여)', 'gender': 'F'},
        {'voice': 'en-US-GuyNeural', 'label': '가이 (미국·남)', 'gender': 'M'},
        {'voice': 'en-GB-SoniaNeural', 'label': '소니아 (영국·여)', 'gender': 'F'},
        {'voice': 'en-GB-RyanNeural', 'label': '라이언 (영국·남)', 'gender': 'M'},
        {'voice': 'en-AU-NatashaNeural', 'label': '나타샤 (호주·여)', 'gender': 'F'},
    ],
    'ko': [
        {'voice': 'ko-KR-SunHiNeural', 'label': '선희 (여)', 'gender': 'F'},
        {'voice': 'ko-KR-InJoonNeural', 'label': '인준 (남)', 'gender': 'M'},
        {'voice': 'ko-KR-HyunsuMultilingualNeural', 'label': '현수 (남)', 'gender': 'M'},
    ],
    # 일본어: Edge 무료 엔드포인트가 제공하는 ja 신경망은 Nanami/Keita 2개뿐이다
    # (2026-09 edge_tts.list_voices 확인). Aoi/Daichi 등 Azure 전용 voice 는
    # NoAudioReceived 로 실패해 매번 gTTS 폴백이 되므로 목록에 넣지 않는다.
    'ja': [
        {'voice': 'ja-JP-NanamiNeural', 'label': '나나미 (여)', 'gender': 'F'},
        {'voice': 'ja-JP-KeitaNeural', 'label': '케이타 (남)', 'gender': 'M'},
    ],
}

# 언어별 기본 voice(사용자 미설정 시). EdgeTTSProvider._DEFAULT_VOICES와 일치.
DEFAULT_VOICE = {
    'en': 'en-US-AriaNeural',
    'ko': 'ko-KR-SunHiNeural',
    'ja': 'ja-JP-NanamiNeural',
}

# 미리듣기 샘플 텍스트(언어별 고정). voice별로 한 번 생성·캐싱된다.
SAMPLE_TEXT = {
    'en': 'Hello! This is a sample of my voice.',
    'ko': '안녕하세요! 제 목소리 샘플이에요.',
    'ja': 'こんにちは。これは私の声のサンプルです。',
}

_VALID = {lang: {v['voice'] for v in vs} for lang, vs in CURATED_VOICES.items()}


def is_valid_voice(language, voice):
    """엄선 화이트리스트에 있는 voice인지."""
    return bool(voice) and voice in _VALID.get(language, set())


def resolve_voice(language, voice):
    """화이트리스트에 있으면 그대로, 아니면 언어 기본 voice로 대체(안전)."""
    if is_valid_voice(language, voice):
        return voice
    return DEFAULT_VOICE.get(language)
