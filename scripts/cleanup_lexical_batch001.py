#!/usr/bin/env python3
"""사전 표제어·뜻 오염 1차 정리. --dry-run/--apply 명시 필수."""
import argparse
import os
from urllib.parse import unquote, urlparse

import pymysql


MERGES = {
    17858: (34594, 'multicellur', 'multicellular'),
    36916: (35587, 'selfcentered', 'self-centered'),
    36922: (50419, 'selfindulgence', 'self-indulgence'),
    38439: (20899, 'customizeise', 'customize'),
    41165: (39398, 'pentup', 'pent-up'),
    41337: (9327, 'sterilizeise', 'sterilize'),
    48484: (48574, 'astible', 'astilbe'),
}
RENAMES = {
    17799: ('crossstitch', 'cross-stitch', ['십자수']),
    28374: ('forwardlooking', 'forward-looking', ['미래 지향적인']),
    34638: ('welloff', 'well-off', ['부유한', '형편이 좋은']),
    34639: ('toandfro', 'to and fro', ['이리저리', '왔다 갔다']),
    35266: ('dutybound', 'duty-bound', ['의무에 얇매인']),
    36920: ('selfpity', 'self-pity', ['자기 연민']),
    41168: ('illadvised', 'ill-advised', ['경솔한', '현명하지 못한']),
    41169: ('dukeout', 'duke it out', ['끝장을 보기 위해 싸우다']),
    41175: ('rinkydink', 'rinky-dink', ['보잘것없는', '싸구려의']),
    41333: ('illfounded', 'ill-founded', ['근거 없는']),
}
DELETE = {
    43006: 'autoerogenous', 43012: 'apraxis', 48471: 'weedwacker',
    48483: 'pulmonalia', 48487: 'caryopteris', 48491: 'rurient', 49726: 'rebu',
}
ERROR_PARTS = (
    '사전이 변경이 되어',
    '단어장에서 해당 단어를 학습하실 수 없습니다. 양해해 주시기 바랍니다.',
)


def connect():
    p = urlparse(os.environ['DATABASE_URL_DICT'])
    return pymysql.connect(
        host=p.hostname, port=p.port or 3306, user=unquote(p.username or ''),
        password=unquote(p.password or ''), database=p.path.lstrip('/'),
        charset='utf8mb4', cursorclass=pymysql.cursors.DictCursor, autocommit=False)


def expect_word(cur, voca_id, expected):
    cur.execute('SELECT word FROM voca WHERE id=%s', (voca_id,))
    row = cur.fetchone()
    if not row or row['word'] != expected:
        raise RuntimeError(f'voca {voca_id}: 기대={expected}, 실제={row}')


def ensure_meaning(cur, text):
    cur.execute('SELECT id FROM voca_meaning WHERE meaning=%s ORDER BY id LIMIT 1', (text,))
    row = cur.fetchone()
    if row:
        return row['id']
    cur.execute('INSERT INTO voca_meaning (meaning,pos) VALUES (%s,NULL)', (text,))
    return cur.lastrowid


def main():
    ap = argparse.ArgumentParser()
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument('--dry-run', action='store_true')
    mode.add_argument('--apply', action='store_true')
    args = ap.parse_args()
    conn = connect()
    try:
        with conn.cursor() as cur:
            for old_id, (new_id, old_word, new_word) in MERGES.items():
                expect_word(cur, old_id, old_word); expect_word(cur, new_id, new_word)
            for vid, (old_word, new_word, _) in RENAMES.items():
                expect_word(cur, vid, old_word)
                cur.execute('SELECT id FROM voca WHERE word=%s AND id<>%s', (new_word, vid))
                if cur.fetchone(): raise RuntimeError(f'교정 표기가 이미 존재: {new_word}')
            for vid, word in DELETE.items(): expect_word(cur, vid, word)
            expect_word(cur, 39251, 'deferrable')
            print(f'preflight: merge={len(MERGES)} rename={len(RENAMES)} delete={len(DELETE)} error_only=1')
            if args.dry_run:
                print('[dry-run] 변경 없음.'); return

            affected_books = set()
            for old_id, (new_id, _, _) in MERGES.items():
                cur.execute('SELECT book_id FROM voca_book_map WHERE voca_id=%s', (old_id,))
                affected_books.update(r['book_id'] for r in cur.fetchall())
                cur.execute(
                    'INSERT IGNORE INTO voca_book_map (voca_id,book_id) '
                    'SELECT %s,book_id FROM voca_book_map WHERE voca_id=%s', (new_id, old_id))
                # 관리자 조인은 대상 중복이 없을 때만 이관. 중복이면 오염 행만 제거.
                cur.execute(
                    '''UPDATE admin_voca_book_map a
                       LEFT JOIN admin_voca_book_map b ON b.book_id=a.book_id AND b.voca_id=%s
                       SET a.voca_id=%s WHERE a.voca_id=%s AND b.id IS NULL''',
                    (new_id, new_id, old_id))
                cur.execute('DELETE FROM admin_voca_book_map WHERE voca_id=%s', (old_id,))
                cur.execute('DELETE FROM voca WHERE id=%s', (old_id,))

            for vid, (_, new_word, new_meanings) in RENAMES.items():
                cur.execute('SELECT book_id FROM voca_book_map WHERE voca_id=%s', (vid,))
                affected_books.update(r['book_id'] for r in cur.fetchall())
                cur.execute('UPDATE voca SET word=%s WHERE id=%s', (new_word, vid))
                cur.execute('UPDATE voca_label SET lemma=%s WHERE voca_id=%s', (new_word.casefold(), vid))
                cur.execute('DELETE FROM voca_meaning_map WHERE voca_id=%s', (vid,))
                for text in new_meanings:
                    mid = ensure_meaning(cur, text)
                    cur.execute('INSERT IGNORE INTO voca_meaning_map (voca_id,meaning_id) VALUES (%s,%s)', (vid, mid))

            # deferrable의 정상 뜻은 유지하고 오류 뜻만 제거.
            cur.execute(
                '''DELETE mm FROM voca_meaning_map mm JOIN voca_meaning m ON m.id=mm.meaning_id
                   WHERE mm.voca_id=39251 AND m.meaning IN (%s,%s)''', ERROR_PARTS)

            for vid in DELETE:
                cur.execute('SELECT book_id FROM voca_book_map WHERE voca_id=%s', (vid,))
                affected_books.update(r['book_id'] for r in cur.fetchall())
                cur.execute('DELETE FROM voca WHERE id=%s', (vid,))

            cur.execute('''DELETE m FROM voca_meaning m LEFT JOIN voca_meaning_map mm ON mm.meaning_id=m.id
                           WHERE mm.meaning_id IS NULL''')
            removed_meanings = cur.rowcount
            cur.execute('''DELETE e FROM voca_example e LEFT JOIN voca_example_map em ON em.example_id=e.id
                           WHERE em.example_id IS NULL''')
            removed_examples = cur.rowcount
            for book_id in affected_books:
                cur.execute(
                    'UPDATE voca_book SET word_count=(SELECT COUNT(*) FROM voca_book_map WHERE book_id=%s) WHERE id=%s',
                    (book_id, book_id))
            print(f'applied: affected_books={len(affected_books)} orphan_meanings={removed_meanings} orphan_examples={removed_examples}')
        conn.commit()
    except Exception:
        conn.rollback(); raise
    finally:
        conn.close()


if __name__ == '__main__': main()
