"""텍스트 정규화 + 캐시 object key 생성.

캐시 키는 동일 텍스트가 항상 같은 객체를 가리키도록 정규화 후 sha256으로 만든다.
정규화: HTML 태그 제거 → 유니코드 NFC → 공백 collapse/trim.
(예문은 강조 태그가 포함될 수 있어 프론트가 strip 후 보내더라도 서버에서 한 번 더 방어.)
"""
import re
import hashlib
import unicodedata

_TAG_RE = re.compile(r'<[^>]+>')
_WS_RE = re.compile(r'\s+')
_KEY_SAFE_RE = re.compile(r'[^A-Za-z0-9._-]')


def strip_html(text: str) -> str:
    return _TAG_RE.sub(' ', text or '')


def normalize_text(text: str) -> str:
    t = strip_html(text or '')
    t = unicodedata.normalize('NFC', t)
    t = _WS_RE.sub(' ', t).strip()
    return t


def text_hash(norm_text: str) -> str:
    return hashlib.sha256(norm_text.encode('utf-8')).hexdigest()


def _safe(seg: str) -> str:
    """object key 세그먼트에 안전한 문자만 남긴다(슬래시/특수문자 차단)."""
    return _KEY_SAFE_RE.sub('_', seg or '')


def build_object_key(prefix: str, provider: str, model: str, voice: str,
                     language: str, norm_text: str) -> str:
    """tts/{provider}/{model}/{voice}/{language}/{h[:2]}/{h}.mp3

    provider/model/voice/language를 경로로 분리 → 모델·보이스 교체 시 충돌 없음.
    h[:2] 샤딩으로 단일 prefix 객체 폭주 방지.
    """
    h = text_hash(norm_text)
    return (
        f"{_safe(prefix)}/{_safe(provider)}/{_safe(model)}/{_safe(voice)}/"
        f"{_safe(language)}/{h[:2]}/{h}.mp3"
    )
