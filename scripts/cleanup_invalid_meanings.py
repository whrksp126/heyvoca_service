#!/usr/bin/env python3
"""앱 오류 문구·placeholder 뜻을 제거하고 빈 단어를 정리한다."""
import argparse
import os
import re
from urllib.parse import unquote, urlparse

import pymysql

ERROR = re.compile(r'^사전이 변경이 되어$|^단어장에서 해당 단어를 학습하실 수 없습니다\. 양해해 주시기 바랍니다\.$')
PLACEHOLDER = re.compile(r'^(?:\?|\.|[ㅁㅇㅋㅎ]+)$')

def clean_text(value): return (value or '').strip().strip('"').strip()

def connect():
    p=urlparse(os.environ['DATABASE_URL_DICT'])
    return pymysql.connect(host=p.hostname,port=p.port or 3306,user=unquote(p.username or ''),
        password=unquote(p.password or ''),database=p.path.lstrip('/'),charset='utf8mb4',
        cursorclass=pymysql.cursors.DictCursor,autocommit=False)

def main():
    ap=argparse.ArgumentParser();mode=ap.add_mutually_exclusive_group(required=True)
    mode.add_argument('--dry-run',action='store_true');mode.add_argument('--apply-meanings-only',action='store_true');args=ap.parse_args()
    conn=connect()
    try:
        with conn.cursor() as cur:
            cur.execute('SELECT id,meaning FROM voca_meaning')
            bad=[r['id'] for r in cur.fetchall() if ERROR.match(clean_text(r['meaning'])) or PLACEHOLDER.match(clean_text(r['meaning']))]
            ph=','.join(['%s']*len(bad))
            cur.execute(f'SELECT DISTINCT voca_id FROM voca_meaning_map WHERE meaning_id IN ({ph})',bad)
            affected_voca=[r['voca_id'] for r in cur.fetchall()]
            vph=','.join(['%s']*len(affected_voca))
            cur.execute(f'SELECT DISTINCT book_id FROM voca_book_map WHERE voca_id IN ({vph})',affected_voca)
            affected_books={r['book_id'] for r in cur.fetchall()}
            cur.execute(f'''SELECT COUNT(*) n FROM voca v WHERE v.id IN ({vph})
                AND NOT EXISTS (SELECT 1 FROM voca_meaning_map mm WHERE mm.voca_id=v.id AND mm.meaning_id NOT IN ({ph}))
                AND NOT EXISTS (SELECT 1 FROM voca_example_map em WHERE em.voca_id=v.id)''',affected_voca+bad)
            empty_words=cur.fetchone()['n']
            print(f'preflight: bad_meanings={len(bad)} affected_voca={len(affected_voca)} empty_words={empty_words} affected_books={len(affected_books)}')
            if args.dry_run:print('[dry-run] 변경 없음.');return
            cur.execute(f'DELETE FROM voca_meaning_map WHERE meaning_id IN ({ph})',bad)
            cur.execute(f'DELETE FROM voca_meaning WHERE id IN ({ph})',bad)
            print(f'applied: bad_meanings={len(bad)} deleted_words=0 (empty words retained for separate review)')
        conn.commit()
    except Exception:conn.rollback();raise
    finally:conn.close()
if __name__=='__main__':main()
