"""여러 TTS 클립을 mp3 한 개로 합친다 — 앱 '농장 산책하기' 네이티브 재생용(앱 1.1.5~).

앱은 슬라이드(단어 하나)를 클립 여러 개 + 무음 트랙으로 큐에 넣었는데, 그러면 잠금화면·알림 진행바가
클립마다 0→끝으로 따로 돈다. 슬라이드를 실제 파일 한 개로 만들어 진행바가 한 번에 흐르게 한다.

방식: 캐시된 클립 mp3 를 ffmpeg 로 같은 형식(PCM s16le mono 24kHz)으로 풀어 파이썬에서 무음과 이어 붙이고,
ffmpeg 로 다시 mp3 한 개로 인코딩한다. 샘플 수로 이어 붙이므로 클립별 시작·끝 시각이 정확하다
(앱이 이 시각으로 지금 읽는 줄을 웹에 알려 강조한다).

결과는 tts/combined/<sha256>.mp3 + 같은 이름 .json(길이·클립 시각)에 캐시한다. 해시 입력은 클립들의
object key(엔진·모델·voice·언어·정규화 텍스트 해시가 다 들어 있다) + 무음 길이 + 형식 버전이다.
"""
import hashlib
import json
import os
import subprocess
from concurrent.futures import ThreadPoolExecutor

from .base import TTSError

SAMPLE_RATE = 24000
BYTES_PER_SAMPLE = 2  # s16le mono
# 형식(샘플레이트·비트레이트·이어붙이기 규칙)을 바꾸면 올린다 — 예전 캐시와 키가 갈린다.
FORMAT_VERSION = 'v1-24k-mono-64k'
MAX_CLIPS = 60
MAX_GAP_MS = 5000
_FFMPEG_TIMEOUT = 30


class ClipMissingError(TTSError):
    """캐시에 없는 클립이 있다(앱이 /tts/resolve 로 만든 뒤 다시 요청한다)."""

    def __init__(self, missing):
        super().__init__(f'캐시에 없는 클립 {len(missing)}개')
        self.missing = missing


def combined_key_for(clip_keys, gap_ms: int, tail_ms: int, prefix: str = None) -> str:
    prefix = prefix or os.getenv('TTS_PREFIX', 'tts')
    payload = json.dumps(
        {'v': FORMAT_VERSION, 'clips': list(clip_keys), 'gap': gap_ms, 'tail': tail_ms},
        separators=(',', ':'), ensure_ascii=True,
    )
    digest = hashlib.sha256(payload.encode('utf-8')).hexdigest()
    return f'{prefix}/combined/{digest}.mp3'


def meta_key_for(combined_key: str) -> str:
    return combined_key[:-4] + '.json' if combined_key.endswith('.mp3') else combined_key + '.json'


def _run_ffmpeg(args, data: bytes) -> bytes:
    try:
        proc = subprocess.run(
            ['ffmpeg', '-hide_banner', '-loglevel', 'error', *args],
            input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=_FFMPEG_TIMEOUT,
        )
    except FileNotFoundError as e:
        raise TTSError('ffmpeg 가 설치되어 있지 않습니다') from e
    except subprocess.TimeoutExpired as e:
        raise TTSError('ffmpeg 시간 초과') from e
    if proc.returncode != 0:
        raise TTSError(f'ffmpeg 실패: {proc.stderr.decode("utf-8", "replace")[:300]}')
    return proc.stdout


def decode_to_pcm(mp3: bytes) -> bytes:
    return _run_ffmpeg(
        ['-i', 'pipe:0', '-f', 's16le', '-acodec', 'pcm_s16le', '-ac', '1', '-ar', str(SAMPLE_RATE), 'pipe:1'],
        mp3,
    )


def encode_pcm_to_mp3(pcm: bytes) -> bytes:
    # 파이프 출력이라도 ffmpeg 가 Xing 헤더 자리를 남기도록 -write_xing 1 — iOS AVPlayer 가 길이를
    # 첫 프레임 비트레이트로 어림하지 않고 정확히 읽는다(진행바 길이 = 실제 길이).
    return _run_ffmpeg(
        ['-f', 's16le', '-ar', str(SAMPLE_RATE), '-ac', '1', '-i', 'pipe:0',
         '-codec:a', 'libmp3lame', '-b:a', '64k', '-write_xing', '1', '-f', 'mp3', 'pipe:1'],
        pcm,
    )


def _silence(ms: int) -> bytes:
    return b'\x00' * (int(SAMPLE_RATE * ms / 1000) * BYTES_PER_SAMPLE)


def _ms(n_bytes: int) -> int:
    return int(round(n_bytes / BYTES_PER_SAMPLE * 1000 / SAMPLE_RATE))


def build_combined(clip_audio, gap_ms: int, tail_ms: int):
    """clip_audio: 클립 mp3 bytes 목록(순서대로). (mp3 bytes, meta dict) 반환."""
    pcm = bytearray()
    clips = []
    for i, mp3 in enumerate(clip_audio):
        if i > 0 and gap_ms > 0:
            pcm += _silence(gap_ms)
        start = _ms(len(pcm))
        pcm += decode_to_pcm(mp3)
        clips.append({'start_ms': start, 'end_ms': _ms(len(pcm))})
    if tail_ms > 0:
        pcm += _silence(tail_ms)
    duration_ms = _ms(len(pcm))
    return encode_pcm_to_mp3(bytes(pcm)), {'duration_ms': duration_ms, 'clips': clips, 'format': FORMAT_VERSION}


def ensure_combined(clip_keys, gap_ms: int, tail_ms: int, storage):
    """합친 mp3 가 캐시에 있으면 그대로, 없으면 만들어 올린다. (combined_key, meta, created) 반환.

    클립 중 캐시에 없는 것이 있으면 ClipMissingError(missing=[인덱스...]).
    """
    key = combined_key_for(clip_keys, gap_ms, tail_ms)
    mkey = meta_key_for(key)
    meta = storage.get_json(mkey)
    # meta 는 mp3 를 올린 뒤에 쓰므로 meta 가 있으면 mp3 도 있다(존재 확인은 list 기반 exists 와 동급).
    if meta and storage.exists(key):
        return key, meta, False

    with ThreadPoolExecutor(max_workers=4) as pool:
        audio = list(pool.map(storage.get_bytes, clip_keys))
    missing = [i for i, a in enumerate(audio) if not a]
    if missing:
        raise ClipMissingError(missing)

    data, meta = build_combined(audio, gap_ms, tail_ms)
    storage.put_audio(key, data, 'audio/mpeg', metadata={'kind': 'combined', 'clips': str(len(clip_keys))})
    storage.put_json(mkey, meta)
    return key, meta, True
