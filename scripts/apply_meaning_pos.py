#!/usr/bin/env python3
"""검수 완료된 id<TAB>POS 배치를 voca_meaning에 적용한다."""
import argparse
import os
from pathlib import Path
from urllib.parse import unquote, urlparse

import pymysql


VALID = {
    'NOUN', 'VERB', 'ADJ', 'ADV', 'PRON', 'DET', 'ADP', 'CCONJ',
    'SCONJ', 'NUM', 'INTJ', 'PART', 'AUX', 'PROPN', 'X',
}


def connect():
    url = os.environ.get('DATABASE_URL_DICT')
    if not url:
        raise RuntimeError('DATABASE_URL_DICT 환경변수가 없습니다.')
    parsed = urlparse(url)
    return pymysql.connect(
        host=parsed.hostname or 'mysql', port=parsed.port or 3306,
        user=unquote(parsed.username or ''), password=unquote(parsed.password or ''),
        database=parsed.path.lstrip('/'), charset='utf8mb4',
        cursorclass=pymysql.cursors.DictCursor,
    )


def load(path):
    pairs = []
    seen = set()
    for number, raw in enumerate(Path(path).read_text(encoding='utf-8').splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        fields = line.split('\t')
        if len(fields) != 2:
            raise ValueError(f'{path}:{number}: id<TAB>POS 형식이 아닙니다.')
        meaning_id, pos = int(fields[0]), fields[1].strip().upper()
        if meaning_id in seen:
            raise ValueError(f'{path}:{number}: 중복 id {meaning_id}')
        if pos not in VALID:
            raise ValueError(f'{path}:{number}: 허용되지 않은 품사 {pos}')
        seen.add(meaning_id)
        pairs.append((meaning_id, pos))
    if not pairs:
        raise ValueError('적용할 행이 없습니다.')
    return pairs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('tsv')
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--dry-run', action='store_true')
    mode.add_argument('--apply', action='store_true')
    args = parser.parse_args()

    pairs = load(args.tsv)
    ids = [meaning_id for meaning_id, _ in pairs]
    conn = connect()
    try:
        with conn.cursor() as cur:
            placeholders = ','.join(['%s'] * len(ids))
            cur.execute(
                f'SELECT id, pos FROM voca_meaning WHERE id IN ({placeholders})', ids)
            current = {row['id']: row['pos'] for row in cur.fetchall()}
            missing = set(ids) - set(current)
            if missing:
                raise RuntimeError(f'DB에 없는 id: {sorted(missing)[:10]}')
            conflicts = [i for i, p in pairs if current[i] not in (None, p)]
            if conflicts:
                raise RuntimeError(f'이미 다른 품사로 태깅된 id: {conflicts[:10]}')

            pending = [(p, i) for i, p in pairs if current[i] is None]
            print(f'검증 완료: 입력 {len(pairs)} / 신규 {len(pending)} / 동일 {len(pairs)-len(pending)}')
            if args.dry_run:
                print('[dry-run] 변경 없음.')
                return
            cur.executemany(
                'UPDATE voca_meaning SET pos=%s WHERE id=%s AND pos IS NULL', pending)
        conn.commit()
        print(f'적용 완료: {len(pending)}행')
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == '__main__':
    main()
