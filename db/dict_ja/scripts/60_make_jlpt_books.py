#!/usr/bin/env python3
"""7단계: heyvoca_dict_ja 에 JLPT 급수별 분권 서점 단어장 생성.

컨테이너 heyvoca_dictja_work 안에서 실행 (cwd /work = db/dict_ja):

  docker exec -e MYSQL_PWD=... heyvoca_dictja_work python3 scripts/60_make_jlpt_books.py          # 생성(멱등)
  docker exec -e MYSQL_PWD=... heyvoca_dictja_work python3 scripts/60_make_jlpt_books.py --reset  # 4테이블 비우고 재생성
  docker exec -e MYSQL_PWD=... heyvoca_dictja_work python3 scripts/60_make_jlpt_books.py --verify-only

대상: voca_ja.jlpt 가 있고 voca.is_active=1 인 항목. 급수 N5→N1, 급수 안에서는 jmdict_id 순.
분권(--split):
  even   (기본) 권수 = max(1, round(n/300)), 권 크기를 고르게(차이 ≤1) → 모든 권이 300 내외.
  greedy 300개씩 자르고 마지막 권이 150 미만이면 앞 권에 합침(꼬리 권이 최대 449 까지 커질 수 있음).
책 이름: 'JLPT N5 단어 1권' … (급수당 1권이면 'JLPT N5 단어').

건드리는 테이블은 bookstore_category / admin_voca_book / admin_voca_book_map / bookstore 4개뿐.
id 는 결정론적: category 1, admin_voca_book·bookstore = 급수·권 순 1..B, map = 권 순 → jmdict_id 순 1..M.
  admin_voca_book  : language='일본어', source='JLPT', category='JLPT', username='heyvoca'
  admin_voca_book_map.voca_meanings = 뜻 문자열 배열(voca_meaning.id 순, 중복 제거)
  admin_voca_book_map.voca_examples = [{origin: exam_en, meaning: exam_ko, reading_tokens}] (example.id 순 최대 3,
                                      예문 없는 단어도 제외하지 않고 [])
  bookstore        : downloads 0, category 'JLPT', gem 10(영한 모델 기본값), hide 'N',
                     color = 영한 서점 팔레트(테마 토큰 5색) 순환
멱등: 4테이블이 비어 있으면 생성, 이미 있으면 계획과 비교해 같으면 변경 없음, 다르면 --reset 요구.
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
from collections import OrderedDict, defaultdict

import pymysql

DEFAULT_SCHEMA = 'heyvoca_dict_ja'
PROTECTED_SCHEMAS = {'heyvoca_dict', 'heyvoca_user', 'mysql', 'sys',
                     'information_schema', 'performance_schema'}

LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1']
BOOK_SIZE = 300
MIN_TAIL = 150
MAX_EXAMPLES = 3

CATEGORY = 'JLPT'
CATEGORY_SORT = 0
LANGUAGE = '일본어'
SOURCE = 'JLPT'
USERNAME = 'heyvoca'
GEM_DEFAULT = 10  # heyvoca_back models.Bookstore.gem default=10 (DB 컬럼엔 default 없음)

# 영한 heyvoca_dict.bookstore 에 실제로 쓰인 테마 토큰 팔레트(id 순 첫 등장 순서)
PALETTE = [
    {'main': 'var(--primary-main-500)', 'sub': 'var(--primary-main-200)', 'background': 'var(--primary-main-100)'},
    {'main': 'var(--secondary-purple-500)', 'sub': 'var(--secondary-purple-200)',
     'background': 'var(--secondary-purple-100)'},
    {'main': 'var(--secondary-blue-500)', 'sub': 'var(--secondary-blue-200)', 'background': 'var(--secondary-blue-100)'},
    {'main': 'var(--secondary-mint-500)', 'sub': 'var(--secondary-mint-200)', 'background': 'var(--secondary-mint-100)'},
    {'main': 'var(--secondary-yellow-500)', 'sub': 'var(--secondary-yellow-200)',
     'background': 'var(--secondary-yellow-100)'},
]

BOOK_TABLES = ['bookstore', 'admin_voca_book_map', 'admin_voca_book', 'bookstore_category']  # 자식 → 부모


def log(*a):
    print('[60]', *a, flush=True)


def jdump(v):
    return json.dumps(v, ensure_ascii=False)


def guard(schema):
    if schema in PROTECTED_SCHEMAS or not re.fullmatch(r'heyvoca_dict_ja\w*', schema):
        sys.exit(f'거부: {schema} 는 이 스크립트가 만질 수 있는 스키마가 아님 (heyvoca_dict_ja* 만)')


def connect(args):
    pw = os.environ.get(args.password_env)
    if pw is None:
        sys.exit(f'환경변수 {args.password_env} 에 비밀번호가 없음')
    return pymysql.connect(host=args.host, port=args.port, user=args.user, password=pw,
                           database=args.schema, charset='utf8mb4', autocommit=False)


# ---------------------------------------------------------------- 계획

def split_sizes(n, mode):
    if n <= 0:
        return []
    if mode == 'greedy':
        sizes = [BOOK_SIZE] * (n // BOOK_SIZE)
        tail = n % BOOK_SIZE
        if tail:
            if sizes and tail < MIN_TAIL:
                sizes[-1] += tail
            else:
                sizes.append(tail)
        return sizes
    k = max(1, round(n / BOOK_SIZE))
    base, extra = divmod(n, k)
    return [base + (1 if i < extra else 0) for i in range(k)]


def fetch(cur):
    cur.execute('''SELECT v.id, j.jlpt, j.jmdict_id FROM voca v JOIN voca_ja j ON j.voca_id = v.id
                   WHERE j.jlpt IS NOT NULL AND v.is_active = 1 ORDER BY j.jmdict_id''')
    words = defaultdict(list)
    for vid, jlpt, jid in cur.fetchall():
        words[jlpt].append(vid)
    cur.execute('''SELECT mm.voca_id, m.meaning FROM voca_meaning_map mm JOIN voca_meaning m ON m.id = mm.meaning_id
                   JOIN voca_ja j ON j.voca_id = mm.voca_id WHERE j.jlpt IS NOT NULL ORDER BY mm.voca_id, m.id''')
    meanings = defaultdict(list)
    for vid, meaning in cur.fetchall():
        if meaning not in meanings[vid]:
            meanings[vid].append(meaning)
    cur.execute('''SELECT em.voca_id, e.exam_en, e.exam_ko, x.reading_tokens
                   FROM voca_example_map em JOIN voca_example e ON e.id = em.example_id
                   LEFT JOIN voca_example_ja x ON x.example_id = e.id
                   JOIN voca_ja j ON j.voca_id = em.voca_id WHERE j.jlpt IS NOT NULL ORDER BY em.voca_id, e.id''')
    examples = defaultdict(list)
    for vid, ja, ko, toks in cur.fetchall():
        if len(examples[vid]) >= MAX_EXAMPLES:
            continue
        examples[vid].append(OrderedDict(origin=ja, meaning=ko,
                                         reading_tokens=json.loads(toks) if toks else None))
    return words, meanings, examples


def plan(cur, split):
    words, meanings, examples = fetch(cur)
    books, maps = [], []
    for lv in LEVELS:
        vids = words.get(lv, [])
        sizes = split_sizes(len(vids), split)
        pos = 0
        for i, size in enumerate(sizes, 1):
            book_id = len(books) + 1
            name = f'JLPT {lv} 단어' if len(sizes) == 1 else f'JLPT {lv} 단어 {i}권'
            chunk = vids[pos:pos + size]
            pos += size
            books.append(OrderedDict(id=book_id, level=lv, vol=i, name=name, word_count=len(chunk),
                                     color=PALETTE[(book_id - 1) % len(PALETTE)]))
            for vid in chunk:
                if not meanings.get(vid):
                    sys.exit(f'voca {vid} 에 뜻이 없음 — 적재 상태 확인 필요')
                maps.append((len(maps) + 1, vid, book_id, jdump(meanings[vid]), jdump(examples.get(vid, []))))
    return books, maps


def existing(cur):
    cur.execute('SELECT id, book_nm, word_count FROM admin_voca_book ORDER BY id')
    b = [tuple(r) for r in cur.fetchall()]
    cur.execute('SELECT id, voca_id, book_id, voca_meanings, voca_examples FROM admin_voca_book_map ORDER BY id')
    m = [tuple(r) for r in cur.fetchall()]
    cur.execute('SELECT id, name, category, category_id, color, admin_voca_book_id FROM bookstore ORDER BY id')
    s = [tuple(r) for r in cur.fetchall()]
    cur.execute('SELECT id, category, sort_order FROM bookstore_category ORDER BY id')
    c = [tuple(r) for r in cur.fetchall()]
    return b, m, s, c


def planned_view(books, maps):
    b = [(x['id'], x['name'], x['word_count']) for x in books]
    s = [(x['id'], x['name'], CATEGORY, 1, jdump(x['color']), x['id']) for x in books]
    c = [(1, CATEGORY, CATEGORY_SORT)]
    return b, list(maps), s, c


# ---------------------------------------------------------------- 쓰기

def reset(conn):
    with conn.cursor() as cur:
        cur.execute('SET FOREIGN_KEY_CHECKS=0')
        for t in BOOK_TABLES:
            cur.execute(f'TRUNCATE TABLE `{t}`')
        cur.execute('SET FOREIGN_KEY_CHECKS=1')
    conn.commit()
    log('서점 4테이블 TRUNCATE:', ', '.join(BOOK_TABLES))


def write(conn, books, maps):
    # 영한 서점 시각과 같은 KST 기준(컨테이너 TZ 는 UTC)
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).replace(microsecond=0, tzinfo=None)
    try:
        with conn.cursor() as cur:
            cur.execute('INSERT INTO bookstore_category (id, category, sort_order, created_at) VALUES (1,%s,%s,%s)',
                        (CATEGORY, CATEGORY_SORT, now))
            cur.executemany('''INSERT INTO admin_voca_book (id, book_nm, language, source, category, username,
                                   word_count, updated_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)''',
                            [(b['id'], b['name'], LANGUAGE, SOURCE, CATEGORY, USERNAME, b['word_count'], now)
                             for b in books])
            for i in range(0, len(maps), 2000):
                cur.executemany('''INSERT INTO admin_voca_book_map (id, voca_id, book_id, level, voca_meanings,
                                       voca_examples) VALUES (%s,%s,%s,NULL,%s,%s)''', maps[i:i + 2000])
            cur.executemany('''INSERT INTO bookstore (id, name, downloads, category, category_id, color, gem, hide,
                                   level_id, book_id, admin_voca_book_id, created_at, updated_at)
                               VALUES (%s,%s,0,%s,1,%s,%s,'N',NULL,NULL,%s,%s,%s)''',
                            [(b['id'], b['name'], CATEGORY, jdump(b['color']), GEM_DEFAULT, b['id'], now, now)
                             for b in books])
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    log(f'생성: category 1 / admin_voca_book {len(books)} / map {len(maps):,} / bookstore {len(books)}')


# ---------------------------------------------------------------- 검증

def verify(conn):
    bad = 0
    with conn.cursor() as cur:
        cur.execute('''SELECT b.id, b.book_nm, b.word_count, COUNT(m.id) FROM admin_voca_book b
                       LEFT JOIN admin_voca_book_map m ON m.book_id = b.id GROUP BY b.id ORDER BY b.id''')
        rows = cur.fetchall()
        per = OrderedDict()
        log('권 구성:')
        for bid, name, wc, n in rows:
            flag = '' if wc == n else f'  ← word_count {wc} ≠ map {n}'
            bad += bool(flag)
            print(f'  #{bid:>2} {name:<18} {n:>4}{flag}')
            lv = name.split()[1]
            per.setdefault(lv, [0, 0, []])
            per[lv][0] += 1
            per[lv][1] += n
            per[lv][2].append(n)
        log('급수별:')
        for lv, (nb, nw, sizes) in per.items():
            print(f'  {lv}: {nb}권 / {nw:,}단어  ({", ".join(map(str, sizes))})')

        cur.execute('''SELECT COUNT(*) FROM voca v JOIN voca_ja j ON j.voca_id = v.id
                       WHERE j.jlpt IS NOT NULL AND v.is_active = 1''')
        target = cur.fetchone()[0]
        cur.execute('SELECT COUNT(*), COUNT(DISTINCT voca_id) FROM admin_voca_book_map')
        nmap, ndist = cur.fetchone()
        cur.execute('''SELECT COUNT(*) FROM admin_voca_book_map m JOIN voca_ja j ON j.voca_id = m.voca_id
                       JOIN admin_voca_book b ON b.id = m.book_id
                       WHERE b.book_nm NOT LIKE CONCAT('JLPT ', j.jlpt, ' %%')''')
        wrong_lv = cur.fetchone()[0]
        cur.execute('SELECT voca_meanings, voca_examples FROM admin_voca_book_map')
        parse_err = no_meaning = null_ex = empty_ex = over3 = key_bad = no_toks = n_ex = 0
        for vm, ve in cur.fetchall():
            try:
                m = json.loads(vm)
                e = json.loads(ve) if ve is not None else None
            except (TypeError, ValueError):
                parse_err += 1
                continue
            if not (isinstance(m, list) and m and all(isinstance(x, str) and x for x in m)) or len(set(m)) != len(m):
                no_meaning += 1
            if e is None or not isinstance(e, list):
                null_ex += 1
                continue
            if not e:
                empty_ex += 1
            if len(e) > MAX_EXAMPLES:
                over3 += 1
            for x in e:
                n_ex += 1
                if not isinstance(x, dict) or set(x) != {'origin', 'meaning', 'reading_tokens'} \
                        or not x['origin'] or not x['meaning']:
                    key_bad += 1
                elif not isinstance(x['reading_tokens'], list) or not x['reading_tokens']:
                    no_toks += 1
        cur.execute('''SELECT COUNT(*) FROM bookstore s LEFT JOIN admin_voca_book b ON b.id = s.admin_voca_book_id
                       WHERE b.id IS NULL OR s.name <> b.book_nm OR s.category_id IS NULL''')
        store_bad = cur.fetchone()[0]
        cur.execute('SELECT color FROM bookstore')
        color_bad = 0
        for (c,) in cur.fetchall():
            try:
                color_bad += set(json.loads(c)) != {'main', 'sub', 'background'}
            except ValueError:
                color_bad += 1
        cur.execute('SELECT COUNT(*) FROM bookstore')
        nstore = cur.fetchone()[0]

    checks = [
        ('대상 voca(JLPT·활성)', target, None),
        ('map 행 / 고유 voca', f'{nmap:,} / {ndist:,}', nmap == ndist == target),
        ('급수 불일치 map 행', wrong_lv, wrong_lv == 0),
        ('JSON 파싱 실패', parse_err, parse_err == 0),
        ('뜻 배열 비었거나 중복', no_meaning, no_meaning == 0),
        ('voca_examples NULL/비배열(예문 필드 없는 map 행)', null_ex, null_ex == 0),
        ('예문 빈 배열(예문 없는 단어, 제외하지 않음)', empty_ex, None),
        ('예문 3개 초과', over3, over3 == 0),
        ('예문 수 합계', f'{n_ex:,}', None),
        ('예문 키 불일치(origin/meaning/reading_tokens)', key_bad, key_bad == 0),
        ('reading_tokens 없음', no_toks, no_toks == 0),
        ('bookstore 행 / 연결 오류', f'{nstore} / {store_bad}', store_bad == 0 and nstore == len(rows)),
        ('color JSON 오류', color_bad, color_bad == 0),
    ]
    log('검증:')
    for name, val, ok in checks:
        mark = '  ' if ok is None else ('OK' if ok else 'NG')
        bad += ok is False
        print(f'  [{mark}] {name}: {val}')
    if bad:
        sys.exit(f'검증 실패 {bad}건')
    log('검증 통과')


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--host', default='host.docker.internal')
    ap.add_argument('--port', type=int, default=3310)
    ap.add_argument('--user', default='root')
    ap.add_argument('--password-env', default='MYSQL_PWD')
    ap.add_argument('--schema', default=DEFAULT_SCHEMA)
    ap.add_argument('--reset', action='store_true', help='서점 4테이블만 비우고 재생성')
    ap.add_argument('--split', choices=['even', 'greedy'], default='even')
    ap.add_argument('--verify-only', action='store_true')
    args = ap.parse_args()
    guard(args.schema)

    conn = connect(args)
    try:
        if args.verify_only:
            return verify(conn)
        with conn.cursor() as cur:
            books, maps = plan(cur, args.split)
            if not books:
                sys.exit('JLPT 대상 voca 가 없음 — 50_load_mysql.py 적재 먼저')
            cur_state = existing(cur)
        if args.reset:
            reset(conn)
        elif any(cur_state):
            if list(map(list, cur_state)) == list(map(list, planned_view(books, maps))):
                log('이미 계획과 동일 — 변경 없음')
                return verify(conn)
            sys.exit('서점 테이블에 계획과 다른 데이터가 있음 — 재생성하려면 --reset')
        write(conn, books, maps)
        verify(conn)
    finally:
        conn.close()


if __name__ == '__main__':
    main()
