#!/usr/bin/env python3
"""뜻별 품사 라벨링 배치 — voca_meaning.pos 를 Claude로 채운다.

각 단어(word)와 그 단어의 한국어 뜻 목록을 Claude에 문맥으로 주고,
뜻마다 UD 품사 태그(NOUN/VERB/ADJ/ADV…)를 1개씩 산출한다.
label_voca.py 의 spaCy(voca_label.pos)/WordNet(pos_wordnet)과 달리
'이 사전에 등재된 뜻' 기준의 품사라, 셋을 나란히 두면 교차검증이 된다.

- 재실행 안전: pos IS NULL 인 뜻만 처리하므로 중단 후 이어서 돌릴 수 있다.
- 기본은 Batch API(토큰 50% 할인, 비동기). --sync 로 즉시 처리도 가능.
- 단어 단위로 묶어 호출 → 한 단어의 뜻들을 한 문맥에서 판단.

사용법 (heyvoca_service/ 루트에서):
  ANTHROPIC_API_KEY=sk-... ./heyvoca_back/.venv/bin/python scripts/label_meaning_pos.py --dry-run --limit 20
  ANTHROPIC_API_KEY=sk-... ./heyvoca_back/.venv/bin/python scripts/label_meaning_pos.py --sync --limit 100
  ANTHROPIC_API_KEY=sk-... ./heyvoca_back/.venv/bin/python scripts/label_meaning_pos.py            # 전체, Batch API
"""
import argparse
import json
import os
import re
import sys
import time
from collections import defaultdict
from pathlib import Path
from urllib.parse import unquote

import pymysql

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = PROJECT_ROOT / 'heyvoca_back' / '.env.local'

MODEL = os.environ.get('POS_MODEL', 'claude-haiku-4-5')
WORDS_PER_REQUEST = 40          # 한 API 요청에 담을 단어 수
VALID_POS = {'NOUN', 'VERB', 'ADJ', 'ADV', 'PRON', 'DET', 'ADP',
             'CCONJ', 'SCONJ', 'NUM', 'INTJ', 'PART', 'AUX', 'PROPN', 'X'}

PROMPT_HEAD = (
    "다음은 영어 단어와 그 단어의 한국어 뜻 목록이다. 각 뜻(id)에 대해, "
    "그 뜻일 때 영어 단어의 품사를 Universal Dependencies 태그 1개로 판정하라.\n"
    "허용 태그: NOUN, VERB, ADJ, ADV, PRON, DET, ADP, CCONJ, SCONJ, NUM, INTJ, PART, AUX, PROPN, X\n"
    "한 단어라도 뜻마다 품사가 다를 수 있다(book: 책=NOUN, 예약하다=VERB). 뜻의 한국어를 근거로 판단하라.\n"
    "출력: 입력의 모든 id에 대해 JSON 배열만. 형식: [{\"id\":123,\"pos\":\"NOUN\"}, ...] 다른 텍스트 없이 JSON만.\n\n"
)


def log(m):
    print(m, flush=True)


def db_connect():
    env = ENV_PATH.read_text()
    m = re.search(r'DATABASE_URL_DICT=mysql\+pymysql://([^:]+):([^@]+)@[^:]+:\d+/(\S+)', env)
    if not m:
        sys.exit(f'DATABASE_URL_DICT를 {ENV_PATH}에서 찾지 못했습니다.')
    return pymysql.connect(
        host=os.environ.get('DB_HOST', '127.0.0.1'),
        port=int(os.environ.get('DB_PORT', 3310)),
        user=m.group(1), password=unquote(m.group(2)), database=m.group(3).strip(),
        charset='utf8mb4', cursorclass=pymysql.cursors.DictCursor,
    )


def fetch_pending(conn, limit=None):
    """pos IS NULL 인 뜻을 word 단위로 묶어 반환: [(word, [(id, meaning), ...]), ...]"""
    sql = (
        "SELECT v.id AS voca_id, v.word, vm.id AS meaning_id, vm.meaning "
        "FROM voca v "
        "JOIN voca_meaning_map mm ON mm.voca_id = v.id "
        "JOIN voca_meaning vm ON vm.id = mm.meaning_id "
        "WHERE vm.pos IS NULL AND vm.meaning IS NOT NULL AND vm.meaning <> '' "
        "ORDER BY v.id"
    )
    with conn.cursor() as cur:
        cur.execute(sql)
        rows = cur.fetchall()
    grouped = defaultdict(list)
    order = []
    for r in rows:
        key = (r['voca_id'], r['word'])
        if key not in grouped:
            order.append(key)
        grouped[key].append((r['meaning_id'], r['meaning']))
    words = [(w, grouped[(vid, w)]) for (vid, w) in order]
    if limit:
        words = words[:limit]
    return words


def build_prompt(word_chunk):
    """word_chunk: [(word, [(id, meaning), ...]), ...] → prompt 문자열"""
    payload = [
        {'word': w, 'meanings': [{'id': mid, 'meaning': mean} for mid, mean in ms]}
        for w, ms in word_chunk
    ]
    return PROMPT_HEAD + json.dumps(payload, ensure_ascii=False, indent=2)


def parse_pos(text):
    """모델 응답 텍스트 → {meaning_id: POS} (허용 태그만)"""
    m = re.search(r'\[.*\]', text, re.DOTALL)
    if m:
        text = m.group(0)
    try:
        arr = json.loads(text)
    except Exception:
        return {}
    out = {}
    for item in arr:
        try:
            mid = int(item['id'])
            pos = str(item['pos']).strip().upper()
        except (KeyError, ValueError, TypeError):
            continue
        if pos in VALID_POS:
            out[mid] = pos
    return out


def apply_updates(conn, mapping):
    """{meaning_id: POS} → voca_meaning.pos UPDATE (pos IS NULL 인 것만)"""
    if not mapping:
        return 0
    with conn.cursor() as cur:
        cur.executemany(
            "UPDATE voca_meaning SET pos = %s WHERE id = %s AND pos IS NULL",
            [(pos, mid) for mid, pos in mapping.items()],
        )
    conn.commit()
    return len(mapping)


def chunks(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def run_sync(client, conn, word_groups):
    total = 0
    for ci, chunk in enumerate(chunks(word_groups, WORDS_PER_REQUEST)):
        prompt = build_prompt(chunk)
        resp = client.messages.create(
            model=MODEL, max_tokens=8192,
            messages=[{'role': 'user', 'content': prompt}],
        )
        text = next((b.text for b in resp.content if b.type == 'text'), '')
        mapping = parse_pos(text)
        n = apply_updates(conn, mapping)
        total += n
        log(f'  chunk {ci + 1}: {len(chunk)} words → {n} meanings tagged (누적 {total})')
    return total


def run_batch(client, conn, word_groups):
    from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
    from anthropic.types.messages.batch_create_params import Request

    requests = []
    for ci, chunk in enumerate(chunks(word_groups, WORDS_PER_REQUEST)):
        requests.append(Request(
            custom_id=f'chunk-{ci}',
            params=MessageCreateParamsNonStreaming(
                model=MODEL, max_tokens=8192,
                messages=[{'role': 'user', 'content': build_prompt(chunk)}],
            ),
        ))
    log(f'Batch 제출: {len(requests)}개 요청 (단어 {len(word_groups)}개)')
    batch = client.messages.batches.create(requests=requests)
    log(f'  batch id={batch.id} — 완료까지 대기 (보통 <1h, 최대 24h)')
    while True:
        b = client.messages.batches.retrieve(batch.id)
        if b.processing_status == 'ended':
            break
        log(f'  status={b.processing_status} … 60s 후 재확인')
        time.sleep(60)

    total = 0
    for result in client.messages.batches.results(batch.id):
        if result.result.type != 'succeeded':
            log(f'  [{result.custom_id}] {result.result.type} — skip')
            continue
        text = next((b.text for b in result.result.message.content if b.type == 'text'), '')
        total += apply_updates(conn, parse_pos(text))
    log(f'Batch 적용 완료: {total} meanings tagged')
    return total


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=None, help='처리할 단어 수 상한(테스트용)')
    ap.add_argument('--sync', action='store_true', help='Batch 대신 즉시 호출(할인 없음)')
    ap.add_argument('--dry-run', action='store_true', help='호출/갱신 없이 대상만 집계')
    args = ap.parse_args()

    conn = db_connect()
    word_groups = fetch_pending(conn, limit=args.limit)
    n_words = len(word_groups)
    n_meanings = sum(len(ms) for _, ms in word_groups)
    log(f'대상: 단어 {n_words}개 / 뜻 {n_meanings}개 (pos IS NULL)')

    if args.dry_run:
        for w, ms in word_groups[:10]:
            log(f'  {w}: {[m for _, m in ms]}')
        log('--dry-run: 종료(변경 없음)')
        return
    if n_words == 0:
        log('처리할 대상 없음.')
        return

    api_key = os.environ.get('ANTHROPIC_API_KEY')
    if not api_key:
        sys.exit('ANTHROPIC_API_KEY 환경변수가 필요합니다.')
    import anthropic
    client = anthropic.Anthropic(api_key=api_key)

    if args.sync:
        run_sync(client, conn, word_groups)
    else:
        run_batch(client, conn, word_groups)


if __name__ == '__main__':
    main()
