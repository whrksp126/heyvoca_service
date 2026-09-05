#!/usr/bin/env python3
"""TOEIC canonical JSON 120개를 관리자 단어장/서점으로 가져온다.

전역 voca는 재사용하고, 단어장별 뜻·예문은 admin_voca_book_map에 보존한다.
영어 품사/발음/notes는 canonical JSON에만 보존하고 이번 import에서 제외한다.
"""
import argparse
import json
import os
import re
import sys
import unicodedata
from collections import OrderedDict, defaultdict
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote, urlparse

import pymysql

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


SOURCE = '해커스 토익 기초 보카'
CATEGORY = 'TOEIC'
USERNAME = '관리자'
SERIES = {
    '토익 기초': {'main': '#5CD97C', 'sub': '#5CD97C4d', 'background': '#EFFFEE'},
    '핵심 빈출': {'main': '#FFB85C', 'sub': '#FFB85C4d', 'background': '#FFF7EF'},
    '800점 완성': {'main': '#6B8AFF', 'sub': '#6B8AFF4d', 'background': '#EFF2FF'},
    '900점 완성': {'main': '#FF70D4', 'sub': '#FF70D44d', 'background': '#FFEEFA'},
}


def norm_word(value):
    value = unicodedata.normalize('NFKD', (value or '').strip()).casefold()
    return ''.join(c for c in value if not unicodedata.combining(c))


def clean_example(value):
    return re.sub(r'</?strong(?:\s+[^>]*)?>', '', value or '', flags=re.I).strip()


def split_meanings(item):
    out = []
    for meaning in item.get('meanings') or []:
        text = meaning.get('text') if isinstance(meaning, dict) else str(meaning)
        for part in re.split(r'[,，]', text or ''):
            part = part.strip()
            if part and part not in out:
                out.append(part)
    return out


def normalize_examples(word, meanings, item):
    # GPT는 호출하지 않고 로컬 규칙만 사용한다.
    from app.utils.example_tagging import tag_example_pair

    out = []
    seen = set()
    for raw in item.get('examples') or []:
        en = str(raw.get('origin', raw.get('en', '')) or '').strip()
        ko = str(raw.get('meaning', raw.get('ko', '')) or '').strip()
        if not en and not ko:
            continue
        en, ko, _, _ = tag_example_pair(word, meanings, en, ko)
        pair = (en, ko)
        if pair not in seen:
            out.append({'origin': en, 'meaning': ko})
            seen.add(pair)
    return out


def parse_file(path):
    normalized = unicodedata.normalize('NFC', path.stem).replace('_', ' ')
    match = re.fullmatch(r'day (\d+) (.+) 단어장', normalized, flags=re.I)
    if not match:
        raise ValueError(f'알 수 없는 파일명: {path.name}')
    day = int(match.group(1))
    series = match.group(2).strip()
    if series not in SERIES:
        raise ValueError(f'알 수 없는 시리즈: {series} ({path.name})')
    return day, series, f'Day {day:02d} {series}'


def load_books(source_dir):
    books = []
    for path in Path(source_dir).glob('*.json'):
        day, series, title = parse_file(path)
        raw = json.loads(path.read_text(encoding='utf-8'))
        words = OrderedDict()
        for item in raw:
            word = str(item.get('origin') or '').strip()
            if not word:
                raise ValueError(f'{path.name}: origin이 빈 항목')
            if len(word) > 255:
                raise ValueError(f'{path.name}: word 255자 초과: {word}')
            key = norm_word(word)
            target = words.setdefault(key, {'word': word, 'meanings': [], 'examples': []})
            for meaning in split_meanings(item):
                if len(meaning) > 255:
                    raise ValueError(f'{path.name}: meaning 255자 초과: {meaning}')
                if meaning not in target['meanings']:
                    target['meanings'].append(meaning)
            for example in normalize_examples(word, target['meanings'], item):
                pair = (example['origin'], example['meaning'])
                if pair not in {(e['origin'], e['meaning']) for e in target['examples']}:
                    target['examples'].append(example)
        books.append({
            'path': path, 'day': day, 'series': series, 'title': title,
            'words': list(words.values()),
        })
    books.sort(key=lambda b: (list(SERIES).index(b['series']), b['day']))
    if len(books) != 120:
        raise ValueError(f'파일은 120개여야 합니다: {len(books)}')
    if len({b['title'] for b in books}) != 120:
        raise ValueError('생성된 단어장 이름이 중복됩니다.')
    return books


def connect():
    url = os.environ.get('DATABASE_URL_DICT')
    if not url:
        raise RuntimeError('DATABASE_URL_DICT 환경변수가 없습니다.')
    parsed = urlparse(url)
    return pymysql.connect(
        host=parsed.hostname or 'mysql', port=parsed.port or 3306,
        user=unquote(parsed.username or ''), password=unquote(parsed.password or ''),
        database=parsed.path.lstrip('/'), charset='utf8mb4',
        cursorclass=pymysql.cursors.DictCursor, autocommit=False,
    )


def current_state(cur):
    cur.execute('SELECT id, word FROM voca')
    vocas = {norm_word(r['word']): r for r in cur.fetchall()}
    cur.execute('SELECT id, meaning FROM voca_meaning ORDER BY id')
    meaning_ids = {}
    for row in cur.fetchall():
        meaning_ids.setdefault(row['meaning'].strip(), row['id'])
    return vocas, meaning_ids


def preflight(cur, books):
    cur.execute('SELECT COUNT(*) n FROM admin_voca_book WHERE source=%s', (SOURCE,))
    existing_books = cur.fetchone()['n']
    cur.execute('SELECT COUNT(*) n FROM bookstore WHERE category=%s', (CATEGORY,))
    existing_store = cur.fetchone()['n']
    if existing_books or existing_store:
        raise RuntimeError(
            f'기존 TOEIC import 결과가 있습니다: books={existing_books}, store={existing_store}')

    vocas, meaning_ids = current_state(cur)
    unique_words = {norm_word(w['word']) for b in books for w in b['words']}
    new_words = unique_words - set(vocas)
    map_rows = sum(len(b['words']) for b in books)
    return {
        'books': len(books), 'map_rows': map_rows,
        'unique_words': len(unique_words),
        'existing_words': len(unique_words) - len(new_words),
        'new_words': len(new_words),
        'vocas': vocas, 'meaning_ids': meaning_ids,
    }


def insert_all(cur, books, state):
    vocas = state['vocas']
    meaning_ids = state['meaning_ids']
    example_ids = defaultdict(dict)
    mapped_meanings = defaultdict(set)
    mapped_examples = defaultdict(set)

    cur.execute('SELECT voca_id, meaning_id FROM voca_meaning_map')
    for row in cur.fetchall(): mapped_meanings[row['voca_id']].add(row['meaning_id'])
    cur.execute(
        '''SELECT em.voca_id,e.id,e.exam_en,e.exam_ko FROM voca_example_map em
           JOIN voca_example e ON e.id=em.example_id''')
    for row in cur.fetchall():
        mapped_examples[row['voca_id']].add(row['id'])
        pair = (clean_example(row['exam_en']), clean_example(row['exam_ko']))
        example_ids[row['voca_id']].setdefault(pair, row['id'])

    cur.execute('SELECT id FROM bookstore_category WHERE category=%s LIMIT 1', (CATEGORY,))
    row = cur.fetchone()
    if row:
        category_id = row['id']
    else:
        cur.execute(
            'INSERT INTO bookstore_category (category,sort_order,created_at) VALUES (%s,%s,NOW())',
            (CATEGORY, 150))
        category_id = cur.lastrowid

    created_words = created_meanings = created_examples = 0
    for book in books:
        cur.execute(
            '''INSERT INTO admin_voca_book
               (book_nm,language,source,category,username,word_count,updated_at)
               VALUES (%s,'영어',%s,%s,%s,%s,NOW())''',
            (book['title'], SOURCE, CATEGORY, USERNAME, len(book['words'])))
        book_id = cur.lastrowid

        for item in book['words']:
            key = norm_word(item['word'])
            voca = vocas.get(key)
            if voca:
                voca_id = voca['id']
            else:
                cur.execute(
                    'INSERT INTO voca (word,pronunciation,verb_forms,level,is_active) '
                    'VALUES (%s,NULL,NULL,NULL,1)', (item['word'],))
                voca_id = cur.lastrowid
                vocas[key] = {'id': voca_id, 'word': item['word']}
                created_words += 1

            for meaning in item['meanings']:
                meaning_id = meaning_ids.get(meaning)
                if meaning_id is None:
                    cur.execute('INSERT INTO voca_meaning (meaning,pos) VALUES (%s,NULL)', (meaning,))
                    meaning_id = cur.lastrowid
                    meaning_ids[meaning] = meaning_id
                    created_meanings += 1
                if meaning_id not in mapped_meanings[voca_id]:
                    cur.execute(
                        'INSERT INTO voca_meaning_map (voca_id,meaning_id) VALUES (%s,%s)',
                        (voca_id, meaning_id))
                    mapped_meanings[voca_id].add(meaning_id)

            book_examples = []
            for ex in item['examples']:
                pair = (clean_example(ex['origin']), clean_example(ex['meaning']))
                example_id = example_ids[voca_id].get(pair)
                if example_id is None:
                    cur.execute(
                        'INSERT INTO voca_example (exam_en,exam_ko) VALUES (%s,%s)',
                        (ex['origin'], ex['meaning']))
                    example_id = cur.lastrowid
                    example_ids[voca_id][pair] = example_id
                    created_examples += 1
                if example_id not in mapped_examples[voca_id]:
                    cur.execute(
                        'INSERT INTO voca_example_map (voca_id,example_id) VALUES (%s,%s)',
                        (voca_id, example_id))
                    mapped_examples[voca_id].add(example_id)
                book_examples.append(ex)

            cur.execute(
                '''INSERT INTO admin_voca_book_map
                   (voca_id,book_id,level,voca_meanings,voca_examples)
                   VALUES (%s,%s,NULL,%s,%s)''',
                (voca_id, book_id,
                 json.dumps(item['meanings'], ensure_ascii=False),
                 json.dumps(book_examples, ensure_ascii=False)))

        color = json.dumps(SERIES[book['series']], ensure_ascii=False)
        cur.execute(
            '''INSERT INTO bookstore
               (name,downloads,category,category_id,color,gem,hide,level_id,
                book_id,admin_voca_book_id,created_at,updated_at)
               VALUES (%s,0,%s,%s,%s,10,'N',NULL,NULL,%s,NOW(),NULL)''',
            (book['title'], CATEGORY, category_id, color, book_id))

    return created_words, created_meanings, created_examples


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('source_dir')
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--dry-run', action='store_true')
    mode.add_argument('--apply', action='store_true')
    args = parser.parse_args()

    books = load_books(args.source_dir)
    conn = connect()
    try:
        with conn.cursor() as cur:
            state = preflight(cur, books)
            print(
                f"검증 완료: books={state['books']} maps={state['map_rows']} "
                f"unique_words={state['unique_words']} existing={state['existing_words']} "
                f"new={state['new_words']}")
            if args.dry_run:
                print('[dry-run] 변경 없음.')
                return
            created = insert_all(cur, books, state)
        conn.commit()
        print(
            f'적용 완료: new_words={created[0]} '
            f'new_meanings={created[1]} new_examples={created[2]}')
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == '__main__':
    main()
