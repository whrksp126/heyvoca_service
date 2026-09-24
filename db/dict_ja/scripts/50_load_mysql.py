#!/usr/bin/env python3
"""6단계: heyvoca_dict_ja 스키마 생성 + build/*.jsonl 적재.

컨테이너 heyvoca_dictja_work 안에서 실행 (cwd /work = db/dict_ja):

  # 스키마 생성(없으면) + 전체 재적재 + 검증
  docker exec -e MYSQL_PWD=... heyvoca_dictja_work \
      python3 scripts/50_load_mysql.py --schema-only --reset          # 스키마만 DROP 후 재생성
  docker exec -e MYSQL_PWD=... heyvoca_dictja_work \
      python3 scripts/50_load_mysql.py --truncate --verify [--allow-missing-meanings]
  docker exec -e MYSQL_PWD=... heyvoca_dictja_work \
      python3 scripts/50_load_mysql.py --verify-only                  # 적재 없이 검증만
  docker exec -e MYSQL_PWD=... heyvoca_dictja_work \
      python3 scripts/50_load_mysql.py --selftest                     # 인메모리 5항목 → *_selftest 스키마, 끝나면 DROP
  docker exec -e MYSQL_PWD=... heyvoca_dictja_work \
      python3 scripts/50_load_mysql.py --dump [path]                  # 적재 없이 현재 스키마를 dump(.sql.gz)+sha256
  (업로드는 scripts/51_dump_upload.sh — MinIO RW 키를 heyvoca_back_local 에서 읽어 --upload 로 넘긴다)

서점(JLPT 분권 단어장)은 scripts/60_make_jlpt_books.py 가 만든다. --reset 은 스키마를 DROP 하므로 서점도 사라지고,
--truncate 는 voca id 를 다시 매겨 서점 map 이 어긋날 수 있다 → 재적재할 때는 --with-books 를 붙여
적재 직후 60 --reset 을 자동 실행한다(검증·dump 보다 먼저).
--build-version 을 명시하면 dict_meta.build_version 을 그 값으로 기록한다(적재 없는 dump 에서도 적용 →
dump 파일명·index 버전이 이 값이 된다). 생략하면 적재 시 오늘 날짜, dump 는 DB 값.

--dump/--upload 는 --reset/--truncate 와 함께 주면 "적재 → 검증 → dump(→업로드)", 없이 주면 적재를 건너뛰고
현재 DB 를 그대로 dump 한다. 기본 dump 경로 build/heyvoca_dict_ja_v<build_version>.sql.gz
(build_version 은 DB dict_meta 값). mysqldump 가 없으면 apt-get install -y default-mysql-client 로 설치.

접속: --host(기본 host.docker.internal) --port(3310) --user(root),
      비밀번호는 --password-env 로 지정한 환경변수(기본 MYSQL_PWD)에서만 읽는다.

입력 (build/):
  entries.jsonl            필수. 10_build_entries.py 산출물
  meanings.jsonl           {jmdict_id, sense_no, meanings:[{meaning,pos}]}  (없으면 --allow-missing-meanings 필요)
  examples.jsonl           20_build_examples.py 산출물 (일본어 원문)
  examples_ko.jsonl        {jmdict_id, tatoeba_ja_id, sense_no, ko, rejected, reason}
                           → rejected 제외, ko 없는 Tatoeba 예문은 적재하지 않는다
  examples_generated.jsonl {jmdict_id, sense_no, ja, ja_plain, ko, reading_tokens}
  inactive_words.json      [{jmdict_id, word, reading, reason}] → 해당 voca.is_active=0 (삭제 대신 비활성)
  (examples*/meanings/inactive 파일이 없으면 경고 후 건너뜀)
  예문 sense_no 는 examples_ko 의 sense_no(LLM 판정)를 우선, 없으면 examples.jsonl 의 색인 sense_no.
  예문 reading_tokens 는 적재 시점에 scripts/reading_fix.py 로 표제어(강조) 구간 후리가나를 사전 읽기로
  고정한다(원본 jsonl 은 그대로). --no-reading-fix 로 끄고, --reading-fix-homo skip 이면 같은 표기의
  다른 항목 읽기(紅葉 こうよう↔もみじ)인 경우는 건드리지 않는다. --build-only 는 DB 없이 행만 만들어
  통계(교체 건수 등)를 출력한다. --verify 는 "표제어 구간 읽기 ≠ 사전 읽기" 예문 수와 판정 보류 사유를 낸다.

id 규칙 (결정론적 — 같은 입력이면 재적재해도 같은 id):
  voca.id    = jmdict_id 오름차순 1..N
  meaning.id = voca 순 → sense_no 순 → 뜻 순 1..M  (같은 voca 안 (meaning,pos) 중복은 1행, sense_no 는 첫 sense)
               앱이 meaning_id ASC 로 정렬하므로 대표 뜻(sense 1 의 첫 뜻)이 항상 먼저 온다.
  example.id = voca 순 → sense_no 오름차순(null=1 취급) → 검수 Tatoeba → 미검수 Tatoeba → generated
               → 파일 순 1..K  (대표 뜻 예문이 먼저, 같은 sense 안에서는 검수본 우선)
               항목당 상한은 두지 않는다(입력상 Tatoeba ≤3 + generated ≤2).
"""
import argparse
import datetime as dt
import gzip
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
from collections import OrderedDict, defaultdict

import pymysql

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import reading_fix  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
BUILD = os.path.join(ROOT, 'build')
SCHEMA_SQL = os.path.join(HERE, 'schema_dict_ja.sql')
SCHEMA_NAME_IN_SQL = 'heyvoca_dict_ja'
DEFAULT_SCHEMA = 'heyvoca_dict_ja'
SELFTEST_SCHEMA = 'heyvoca_dict_ja_selftest'
OBJECTSTORE_ENDPOINT = 'https://objectstore.ghmate.com'
OBJECTSTORE_BUCKET = 'heyvoca'
OBJECT_PREFIX = 'dict_ja'
INDEX_KEY = f'{OBJECT_PREFIX}/index.json'
PROTECTED_SCHEMAS = {'heyvoca_dict', 'heyvoca_user', 'mysql', 'sys',
                     'information_schema', 'performance_schema'}

# 영한 voca.level(0~10 난이도)에 맞춘 임시 규칙. 없음 → '10'
JLPT_TO_LEVEL = {'N5': '1', 'N4': '3', 'N3': '5', 'N2': '7', 'N1': '9'}
LEVEL_NO_JLPT = '10'

UD_POS = {'NOUN', 'VERB', 'ADJ', 'ADV', 'PRON', 'DET', 'ADP', 'CCONJ', 'SCONJ',
          'NUM', 'INTJ', 'PART', 'AUX', 'PROPN', 'X'}
STRONG = 'class="target-word"'

# 적재 대상 테이블(자식 → 부모 순: TRUNCATE 순서)
DATA_TABLES = ['voca_example_ja', 'voca_example_map', 'voca_example',
               'voca_meaning_ja', 'voca_meaning_map', 'voca_meaning',
               'voca_ja', 'voca']


def log(*a):
    print(f'[{time.strftime("%H:%M:%S")}]', *a, flush=True)


def warn(*a):
    print(f'[{time.strftime("%H:%M:%S")}] WARN', *a, flush=True)


def jdump(v):
    return None if v is None else json.dumps(v, ensure_ascii=False, separators=(',', ':'))


# ---------------------------------------------------------------- 입력

def read_jsonl(path, required=False):
    if not os.path.exists(path):
        if required:
            sys.exit(f'필수 입력 없음: {path}')
        warn(f'입력 없음 — 건너뜀: {os.path.relpath(path, ROOT)}')
        return None
    out = []
    with open(path, encoding='utf-8') as f:
        for i, line in enumerate(f, 1):
            line = line.strip()
            if line:
                try:
                    out.append(json.loads(line))
                except json.JSONDecodeError as e:
                    sys.exit(f'{path}:{i} JSON 파싱 실패: {e}')
    log(f'읽음 {os.path.relpath(path, ROOT)}: {len(out):,}행')
    return out


def load_inputs(args):
    return dict(
        entries=read_jsonl(os.path.join(BUILD, 'entries.jsonl'), required=True),
        meanings=read_jsonl(os.path.join(BUILD, 'meanings.jsonl')),
        examples=read_jsonl(os.path.join(BUILD, 'examples.jsonl')),
        examples_ko=read_jsonl(os.path.join(BUILD, 'examples_ko.jsonl')),
        examples_generated=read_jsonl(os.path.join(BUILD, 'examples_generated.jsonl')),
        inactive=read_json(os.path.join(BUILD, 'inactive_words.json')),
    )


def read_json(path):
    if not os.path.exists(path):
        warn(f'입력 없음 — 건너뜀: {os.path.relpath(path, ROOT)}')
        return None
    with open(path, encoding='utf-8') as f:
        v = json.load(f)
    log(f'읽음 {os.path.relpath(path, ROOT)}: {len(v):,}건')
    return v


def source_versions():
    """dict_meta.source_versions (varchar 255 이내 JSON)."""
    sv = {}
    tag = os.path.join(ROOT, 'sources', 'jmdict', 'RELEASE_TAG')
    if os.path.exists(tag):
        sv['jmdict'] = open(tag).read().strip()
    for key, rel in (('tatoeba', 'sources/tatoeba/jpn_indices.csv'),
                     ('kanjium', 'sources/kanjium/accents.txt'),
                     ('jlpt', 'sources/jlpt/n5.csv')):
        p = os.path.join(ROOT, rel)
        if os.path.exists(p):
            sv[key] = dt.date.fromtimestamp(os.path.getmtime(p)).isoformat()
    s = jdump(sv)
    return s[:255]


# ---------------------------------------------------------------- 행 구성

class Rows:
    def __init__(self):
        self.voca, self.voca_ja = [], []
        self.meaning, self.meaning_map, self.meaning_ja = [], [], []
        self.example, self.example_map, self.example_ja = [], [], []
        self.stats = defaultdict(int)


def build_rows(data, allow_missing_meanings=False, reading_fix_on=True, reading_fix_homo='fix'):
    """입력 dict → 테이블별 행 리스트. DB 와 무관(순수 함수)."""
    R = Rows()
    st = R.stats
    entries = sorted(data['entries'], key=lambda e: e['jmdict_id'])
    ids = [e['jmdict_id'] for e in entries]
    if len(ids) != len(set(ids)):
        sys.exit('entries 에 jmdict_id 중복')
    inactive = {}
    for w in data.get('inactive') or []:
        inactive[w['jmdict_id']] = w
    ent_by_id = {e['jmdict_id']: e for e in entries}
    for jid, w in inactive.items():
        e = ent_by_id.get(jid)
        if e is None:
            sys.exit(f'inactive_words: entries 에 없는 jmdict_id={jid} ({w.get("word")})')
        if w.get('word') and w['word'] != e['word']:
            warn(f'inactive_words: jmdict_id={jid} word 불일치 {w["word"]!r} ≠ entries {e["word"]!r} (id 기준으로 적용)')
    vid_of = {}
    sense_of = {}  # (jmdict_id, sense_no) → sense
    for i, e in enumerate(entries, 1):
        jid = e['jmdict_id']
        vid_of[jid] = i
        for s in e.get('senses') or []:
            sense_of[(jid, s['sense_no'])] = s
        jlpt = e.get('jlpt')
        if jlpt is not None and jlpt not in JLPT_TO_LEVEL:
            sys.exit(f'알 수 없는 jlpt {jlpt!r} (jmdict_id={jid})')
        for k, lim in (('word', 255), ('reading', 100), ('romaji', 100), ('accent', 50)):
            if e.get(k) and len(e[k]) > lim:
                sys.exit(f'{k} 길이 {len(e[k])} > {lim} (jmdict_id={jid})')
        active = 0 if jid in inactive else 1
        st['voca_inactive'] += 1 - active
        R.voca.append((i, e['word'], e['reading'], None,
                       JLPT_TO_LEVEL.get(jlpt, LEVEL_NO_JLPT), active))
        R.voca_ja.append((i, jid, e['reading'], e.get('romaji'),
                          jdump(e.get('kanji_forms')), jdump(e.get('kana_forms')),
                          jlpt, e.get('freq_rank'), e.get('accent'),
                          int(bool(e.get('uk'))), int(bool(e.get('common'))),
                          jdump(e.get('flags'))))

    # ---- 뜻
    if data.get('meanings') is None:
        if not allow_missing_meanings:
            sys.exit('build/meanings.jsonl 없음 — 뜻 없이 적재하려면 --allow-missing-meanings')
    else:
        per_voca = defaultdict(list)  # vid → [(sense_no, [meanings])]
        bad = []
        for m in data['meanings']:
            jid, sno = m['jmdict_id'], m['sense_no']
            if jid not in vid_of:
                st['meaning_skip_unknown_entry'] += 1
                continue
            if (jid, sno) not in sense_of:
                st['meaning_skip_unknown_sense'] += 1
                continue
            for mm in m.get('meanings') or []:
                text = (mm.get('meaning') or '').strip()
                pos = mm.get('pos')
                if not text:
                    st['meaning_skip_empty'] += 1
                    continue
                if pos is not None and pos not in UD_POS:
                    bad.append(f'jmdict_id={jid} sense={sno} pos={pos!r}')
                if len(text) > 255:
                    bad.append(f'jmdict_id={jid} sense={sno} 뜻 길이 {len(text)}>255')
            per_voca[vid_of[jid]].append((sno, m.get('meanings') or [], jid))
        if bad:
            sys.exit('뜻 입력 오류 %d건 (앞 10건):\n  ' % len(bad) + '\n  '.join(bad[:10]))
        mid = 0
        for vid in sorted(per_voca):
            seen = OrderedDict()  # (meaning,pos) → meaning_id
            for sno, mlist, jid in sorted(per_voca[vid], key=lambda t: t[0]):
                sense = sense_of[(jid, sno)]
                for mm in mlist:
                    text = (mm.get('meaning') or '').strip()
                    if not text:
                        continue
                    key = (text, mm.get('pos'))
                    if key in seen:
                        st['meaning_dedup_same_voca'] += 1
                        continue
                    mid += 1
                    seen[key] = mid
                    R.meaning.append((mid, text, mm.get('pos')))
                    R.meaning_map.append((vid, mid))
                    R.meaning_ja.append((mid, sno, '; '.join(sense.get('gloss') or []) or None,
                                         jdump(sense.get('pos'))))

    # ---- 예문
    per_voca_ex = defaultdict(list)
    rf_index = reading_fix.build_index(entries) if reading_fix_on else None

    def fix_tokens(jid, ja, toks, source):
        """표제어 구간 후리가나 고정(reading_fix). 교체·보류만 stat 으로 센다."""
        if not reading_fix_on or not toks:
            return toks
        new, status = reading_fix.fix_example(ent_by_id[jid], ja, toks, rf_index, homo=reading_fix_homo)
        if status.startswith(('fixed', 'skip')):
            st[f'reading_fix_{source}_{status}'] += 1
        return new

    exs = data.get('examples')
    if exs is not None:
        ko_map = None
        if data.get('examples_ko') is None:
            warn('examples_ko.jsonl 없음 → Tatoeba 예문은 한국어 해석이 없어 전부 적재하지 않음')
            st['example_skip_no_ko_file'] += len(exs)
        else:
            ko_map = {(k['jmdict_id'], k['tatoeba_ja_id']): k for k in data['examples_ko']}
            ex_keys = {(x['jmdict_id'], x['tatoeba_ja_id']) for x in exs}
            st['example_ko_without_source'] += sum(1 for key in ko_map if key not in ex_keys)
            for x in exs:
                if x['jmdict_id'] not in vid_of:
                    st['example_skip_unknown_entry'] += 1
                    continue
                k = ko_map.get((x['jmdict_id'], x['tatoeba_ja_id']))
                if k is not None and k.get('rejected'):
                    st['example_skip_rejected'] += 1
                    continue
                if k is None or not (k.get('ko') or '').strip():
                    st['example_skip_no_ko'] += 1
                    continue
                # sense_no: LLM 판정(examples_ko) 우선, 없으면 Tatoeba 색인 값
                sno = k.get('sense_no')
                if sno is None:
                    sno = x.get('sense_no')
                    st['example_sense_from_index'] += 1
                elif x.get('sense_no') is not None and x['sense_no'] != sno:
                    st['example_sense_llm_override'] += 1
                per_voca_ex[vid_of[x['jmdict_id']]].append(dict(
                    ja=x['ja'], ko=k['ko'].strip(), sense_no=sno,
                    reading_tokens=fix_tokens(x['jmdict_id'], x['ja'], x.get('reading_tokens'), 'tatoeba'),
                    source='tatoeba',
                    tatoeba_ja_id=x.get('tatoeba_ja_id'), tatoeba_en_id=x.get('tatoeba_en_id'),
                    verified=bool(x.get('verified')), span_method=x.get('span_method')))
    gens = data.get('examples_generated')
    if gens is not None:
        for g in gens:
            if g['jmdict_id'] not in vid_of:
                st['generated_skip_unknown_entry'] += 1
                continue
            if not (g.get('ko') or '').strip() or not (g.get('ja') or '').strip():
                st['generated_skip_empty'] += 1
                continue
            per_voca_ex[vid_of[g['jmdict_id']]].append(dict(
                ja=g['ja'], ko=g['ko'].strip(), sense_no=g.get('sense_no'),
                reading_tokens=fix_tokens(g['jmdict_id'], g['ja'], g.get('reading_tokens'), 'generated'),
                source='generated',
                tatoeba_ja_id=None, tatoeba_en_id=None, verified=False,
                span_method='generated'))
    eid = 0
    for vid in sorted(per_voca_ex):
        # (sense_no — null 은 1 취급, 검수 tatoeba 0 / 미검수 tatoeba 1 / generated 2). 나머지는 파일 순(안정 정렬)
        lst = sorted(per_voca_ex[vid], key=example_sort_key)
        st['example_max_per_voca'] = max(st['example_max_per_voca'], len(lst))
        for x in lst:
            eid += 1
            R.example.append((eid, x['ja'], x['ko']))
            R.example_map.append((vid, eid))
            R.example_ja.append((eid, x['sense_no'], jdump(x['reading_tokens']), x['source'],
                                 x['tatoeba_ja_id'], x['tatoeba_en_id'], int(x['verified']),
                                 x['span_method']))
            st[f'example_{x["source"]}'] += 1
    return R


def example_sort_key(d):
    rank = 2 if d['source'] == 'generated' else (0 if d['verified'] else 1)
    return (1 if d['sense_no'] is None else d['sense_no'], rank)


# ---------------------------------------------------------------- DB

def connect(args, db=None):
    pw = os.environ.get(args.password_env)
    if pw is None:
        sys.exit(f'환경변수 {args.password_env} 에 비밀번호가 없음 (예: docker exec -e {args.password_env}=...)')
    return pymysql.connect(host=args.host, port=args.port, user=args.user, password=pw,
                           database=db, charset='utf8mb4', autocommit=False,
                           local_infile=False)


def guard(schema):
    if schema in PROTECTED_SCHEMAS or not re.fullmatch(r'heyvoca_dict_ja\w*', schema):
        sys.exit(f'거부: {schema} 는 이 스크립트가 만질 수 있는 스키마가 아님 (heyvoca_dict_ja* 만)')


def schema_statements(schema):
    sql = open(SCHEMA_SQL, encoding='utf-8').read()
    sql = '\n'.join(l for l in sql.splitlines() if not l.lstrip().startswith('--'))
    sql = sql.replace(f'`{SCHEMA_NAME_IN_SQL}`', f'`{schema}`')
    return [s.strip() for s in sql.split(';\n') if s.strip().rstrip(';').strip()]


def create_schema(args, schema, reset=False):
    guard(schema)
    conn = connect(args)
    with conn.cursor() as cur:
        if reset:
            log(f'DROP DATABASE {schema}')
            cur.execute(f'DROP DATABASE IF EXISTS `{schema}`')
        for s in schema_statements(schema):
            cur.execute(s.rstrip(';'))
    conn.commit()
    with conn.cursor() as cur:
        cur.execute('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=%s', (schema,))
        n = cur.fetchone()[0]
    conn.close()
    log(f'스키마 {schema} 준비 — 테이블 {n}개')


def insert_many(cur, table, cols, rows, chunk=2000):
    if not rows:
        return
    sql = f'INSERT INTO `{table}` ({",".join(f"`{c}`" for c in cols)}) VALUES ({",".join(["%s"] * len(cols))})'
    for i in range(0, len(rows), chunk):
        cur.executemany(sql, rows[i:i + chunk])
    log(f'  {table}: {len(rows):,}행')


def load(args, schema, R, truncate=False, meta=None):
    guard(schema)
    conn = connect(args, schema)
    t0 = time.time()
    try:
        with conn.cursor() as cur:
            cur.execute('SELECT COUNT(*) FROM voca')
            existing = cur.fetchone()[0]
            if existing and not truncate:
                sys.exit(f'{schema}.voca 에 이미 {existing:,}행 — 재적재는 --truncate')
            if truncate:
                cur.execute('SET FOREIGN_KEY_CHECKS=0')
                for t in DATA_TABLES:
                    cur.execute(f'TRUNCATE TABLE `{t}`')
                cur.execute('SET FOREIGN_KEY_CHECKS=1')
                log('기존 데이터 TRUNCATE')
            log('적재 시작')
            insert_many(cur, 'voca', ['id', 'word', 'pronunciation', 'verb_forms', 'level', 'is_active'], R.voca)
            insert_many(cur, 'voca_ja', ['voca_id', 'jmdict_id', 'reading', 'romaji', 'kanji_forms', 'kana_forms',
                                         'jlpt', 'freq_rank', 'accent', 'uk', 'common', 'flags'], R.voca_ja)
            insert_many(cur, 'voca_meaning', ['id', 'meaning', 'pos'], R.meaning)
            insert_many(cur, 'voca_meaning_map', ['voca_id', 'meaning_id'], R.meaning_map)
            insert_many(cur, 'voca_meaning_ja', ['meaning_id', 'sense_no', 'en_gloss', 'jmdict_pos'], R.meaning_ja)
            insert_many(cur, 'voca_example', ['id', 'exam_en', 'exam_ko'], R.example)
            insert_many(cur, 'voca_example_map', ['voca_id', 'example_id'], R.example_map)
            insert_many(cur, 'voca_example_ja', ['example_id', 'sense_no', 'reading_tokens', 'source',
                                                 'tatoeba_ja_id', 'tatoeba_en_id', 'verified', 'span_method'],
                        R.example_ja)
            now = dt.datetime.now().replace(microsecond=0)
            for k, v in (meta or {}).items():
                cur.execute('REPLACE INTO dict_meta (`key`,`value`,updated_at) VALUES (%s,%s,%s)', (k, v, now))
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        conn.close()
    log(f'적재 완료 ({time.time() - t0:.1f}s) — voca {len(R.voca):,} / meaning {len(R.meaning):,} / '
        f'example {len(R.example):,}')
    for k in sorted(R.stats):
        log(f'  stat {k}: {R.stats[k]:,}')


def verify_checks():
    return OrderedDict([
        ('voca_without_meaning', 'SELECT COUNT(*) FROM voca v WHERE NOT EXISTS (SELECT 1 FROM voca_meaning_map m WHERE m.voca_id=v.id)'),
        ('voca_without_example', 'SELECT COUNT(*) FROM voca v WHERE NOT EXISTS (SELECT 1 FROM voca_example_map m WHERE m.voca_id=v.id)'),
        ('voca_without_example_active', 'SELECT COUNT(*) FROM voca v WHERE v.is_active=1 AND NOT EXISTS (SELECT 1 FROM voca_example_map m WHERE m.voca_id=v.id)'),
        ('voca_inactive', 'SELECT COUNT(*) FROM voca WHERE is_active=0 OR is_active IS NULL'),
        # 뜻 순서: 같은 voca 안에서 meaning.id 가 커지는데 sense_no 가 작아지는 쌍(0 이어야 대표 뜻이 먼저)
        ('meaning_order_violation', '''SELECT COUNT(DISTINCT a.voca_id) FROM voca_meaning_map a
            JOIN voca_meaning_map b ON b.voca_id=a.voca_id AND b.meaning_id>a.meaning_id
            JOIN voca_meaning_ja ja ON ja.meaning_id=a.meaning_id
            JOIN voca_meaning_ja jb ON jb.meaning_id=b.meaning_id WHERE jb.sense_no<ja.sense_no'''),
        # 예문 순서: 같은 voca 안에서 id 가 커지는데 정렬 키 (COALESCE(sense_no,1), 검수0/미검수1/generated2)
        # 가 작아지는 쌍이 있는 voca 수 (build_rows 의 example_sort_key 와 같은 규칙)
        ('example_order_violation', '''SELECT COUNT(DISTINCT a.voca_id) FROM voca_example_map a
            JOIN voca_example_map b ON b.voca_id=a.voca_id AND b.example_id>a.example_id
            JOIN voca_example_ja ja ON ja.example_id=a.example_id
            JOIN voca_example_ja jb ON jb.example_id=b.example_id
            WHERE (COALESCE(jb.sense_no,1), CASE WHEN jb.source='generated' THEN 2 WHEN jb.verified=1 THEN 0 ELSE 1 END)
                < (COALESCE(ja.sense_no,1), CASE WHEN ja.source='generated' THEN 2 WHEN ja.verified=1 THEN 0 ELSE 1 END)'''),
        ('example_no_strong_ja', f"SELECT COUNT(*) FROM voca_example WHERE exam_en IS NULL OR exam_en NOT LIKE '%{STRONG}%'"),
        ('example_no_strong_ko', f"SELECT COUNT(*) FROM voca_example WHERE exam_ko IS NULL OR exam_ko NOT LIKE '%{STRONG}%'"),
        # 고아(매핑 없는 본 테이블 행 / 1:1 확장 누락)
        ('orphan_meaning_unmapped', 'SELECT COUNT(*) FROM voca_meaning x WHERE NOT EXISTS (SELECT 1 FROM voca_meaning_map m WHERE m.meaning_id=x.id)'),
        ('orphan_example_unmapped', 'SELECT COUNT(*) FROM voca_example x WHERE NOT EXISTS (SELECT 1 FROM voca_example_map m WHERE m.example_id=x.id)'),
        ('meaning_shared_across_voca', 'SELECT COUNT(*) FROM (SELECT meaning_id FROM voca_meaning_map GROUP BY meaning_id HAVING COUNT(*)>1) t'),
        ('example_shared_across_voca', 'SELECT COUNT(*) FROM (SELECT example_id FROM voca_example_map GROUP BY example_id HAVING COUNT(*)>1) t'),
        ('voca_missing_voca_ja', 'SELECT COUNT(*) FROM voca v LEFT JOIN voca_ja j ON j.voca_id=v.id WHERE j.voca_id IS NULL'),
        ('meaning_missing_meaning_ja', 'SELECT COUNT(*) FROM voca_meaning x LEFT JOIN voca_meaning_ja j ON j.meaning_id=x.id WHERE j.meaning_id IS NULL'),
        ('example_missing_example_ja', 'SELECT COUNT(*) FROM voca_example x LEFT JOIN voca_example_ja j ON j.example_id=x.id WHERE j.example_id IS NULL'),
        # FK 가 막지만, FOREIGN_KEY_CHECKS=0 구간이 있으므로 명시 검사
        ('fk_orphan_meaning_map', 'SELECT COUNT(*) FROM voca_meaning_map m LEFT JOIN voca v ON v.id=m.voca_id LEFT JOIN voca_meaning x ON x.id=m.meaning_id WHERE v.id IS NULL OR x.id IS NULL'),
        ('fk_orphan_example_map', 'SELECT COUNT(*) FROM voca_example_map m LEFT JOIN voca v ON v.id=m.voca_id LEFT JOIN voca_example x ON x.id=m.example_id WHERE v.id IS NULL OR x.id IS NULL'),
        ('fk_orphan_voca_ja', 'SELECT COUNT(*) FROM voca_ja j LEFT JOIN voca v ON v.id=j.voca_id WHERE v.id IS NULL'),
        ('fk_orphan_meaning_ja', 'SELECT COUNT(*) FROM voca_meaning_ja j LEFT JOIN voca_meaning x ON x.id=j.meaning_id WHERE x.id IS NULL'),
        ('fk_orphan_example_ja', 'SELECT COUNT(*) FROM voca_example_ja j LEFT JOIN voca_example x ON x.id=j.example_id WHERE x.id IS NULL'),
    ])


def verify_headword_reading(cur):
    """예문의 표제어(강조) 구간 읽기가 사전 읽기와 다른 예문 수. reading_fix 가 지금 다시 고칠 것이
    남아 있으면(fixed_*) 불일치로 센다 — 적재 시 고정했다면 0 (--reading-fix-homo skip 이면 동형어 건은
    skip:동형표기 로 보류). 판단할 수 없는 건(skip:*)은 사유별로 따로 출력."""
    cur.execute('SELECT voca_id, jmdict_id, reading, kanji_forms, kana_forms FROM voca_ja')
    ents = {}
    for vid, jid, reading, kf, kn in cur.fetchall():
        ents[vid] = dict(jmdict_id=jid, reading=reading, kanji_forms=json.loads(kf) if kf else [],
                         kana_forms=json.loads(kn) if kn else [])
    index = reading_fix.build_index(ents.values())
    cur.execute('''SELECT m.voca_id, e.exam_en, j.reading_tokens, j.source FROM voca_example_map m
                   JOIN voca_example e ON e.id=m.example_id JOIN voca_example_ja j ON j.example_id=e.id''')
    mism, held = defaultdict(int), defaultdict(int)
    samples = []
    for vid, ja, toks, source in cur.fetchall():
        toks = json.loads(toks) if toks else None
        _, status = reading_fix.fix_example(ents[vid], ja, toks, index)
        if status.startswith('fixed'):
            mism[source] += 1
            if len(samples) < 5:
                samples.append(f'{ja}')
        elif status.startswith('skip'):
            held[f'{source}:{status[5:]}'] += 1
    n = sum(mism.values())
    print(f'  headword_reading_mismatch    {n:>9,}' +
          (' (' + ', '.join(f'{k}={v:,}' for k, v in sorted(mism.items())) + ')' if n else ''))
    for s_ in samples:
        print(f'      예) {s_}')
    print('  표제어 읽기 판정 보류(잔여):', ', '.join(f'{k}={v:,}' for k, v in sorted(held.items())) or '없음')
    return {'headword_reading_mismatch': n, 'headword_reading_held': sum(held.values())}


def verify(args, schema, samples=5):
    guard(schema)
    conn = connect(args, schema)
    res = {}
    with conn.cursor() as cur:
        def one(sql):
            cur.execute(sql)
            return cur.fetchone()[0]
        print(f'\n=== verify {schema} ===')
        for t in ['voca', 'voca_ja', 'voca_meaning', 'voca_meaning_map', 'voca_meaning_ja',
                  'voca_example', 'voca_example_map', 'voca_example_ja']:
            res[t] = one(f'SELECT COUNT(*) FROM `{t}`')
            print(f'  {t:<18} {res[t]:>9,}')
        checks = verify_checks()
        print('  --')
        for k, sql in checks.items():
            res[k] = one(sql)
            print(f'  {k:<28} {res[k]:>9,}')
        cur.execute('SELECT level, COUNT(*) FROM voca GROUP BY level ORDER BY CAST(level AS UNSIGNED)')
        print('  level 분포:', ', '.join(f'{l}={n:,}' for l, n in cur.fetchall()))
        cur.execute('SELECT source, verified, COUNT(*) FROM voca_example_ja GROUP BY source, verified ORDER BY source, verified DESC')
        print('  예문 source/verified:', ', '.join(f'{s}{"(v)" if v else ""}={n:,}' for s, v, n in cur.fetchall()))
        cur.execute('''SELECT n, COUNT(*) FROM (SELECT voca_id, COUNT(*) n FROM voca_example_map GROUP BY voca_id) t
                       GROUP BY n ORDER BY n''')
        print('  voca 당 예문 수 분포:', ', '.join(f'{n}개={c:,}' for n, c in cur.fetchall()))
        cur.execute('''SELECT MAX(n) FROM (SELECT m.voca_id, j.source, COUNT(*) n FROM voca_example_map m
                       JOIN voca_example_ja j ON j.example_id=m.example_id GROUP BY m.voca_id, j.source) t''')
        print('  voca·source 당 최대 예문 수:', cur.fetchone()[0])
        cur.execute('SELECT `key`, `value` FROM dict_meta ORDER BY `key`')
        print('  dict_meta:', dict(cur.fetchall()))
        res.update(verify_headword_reading(cur))

        # 표본: 예문·뜻이 있는 voca 를 우선, 결정론적(id 균등 간격)
        cur.execute('''SELECT v.id FROM voca v
                       ORDER BY (EXISTS(SELECT 1 FROM voca_meaning_map m WHERE m.voca_id=v.id)
                               + EXISTS(SELECT 1 FROM voca_example_map e WHERE e.voca_id=v.id)) DESC, v.id''')
        vids = [r[0] for r in cur.fetchall()]
        if vids and samples:
            step = max(1, len(vids) // samples)
            pick = vids[::step][:samples]
            print(f'  -- 표본 {len(pick)}건')
            for vid in pick:
                cur.execute('''SELECT v.id, v.word, v.pronunciation, v.level, j.jmdict_id, j.romaji, j.jlpt, j.accent, j.uk,
                                      v.is_active
                               FROM voca v JOIN voca_ja j ON j.voca_id=v.id WHERE v.id=%s''', (vid,))
                r = cur.fetchone()
                print(f'  [{r[0]}] {r[1]}【{r[2]}】 level={r[3]} jmdict={r[4]} romaji={r[5]} jlpt={r[6]} accent={r[7]} '
                      f'uk={r[8]} active={r[9]}')
                cur.execute('''SELECT m.meaning, m.pos, mj.sense_no, mj.en_gloss FROM voca_meaning_map mm
                               JOIN voca_meaning m ON m.id=mm.meaning_id
                               LEFT JOIN voca_meaning_ja mj ON mj.meaning_id=m.id
                               WHERE mm.voca_id=%s ORDER BY m.id''', (vid,))
                for m in cur.fetchall():
                    print(f'      뜻 s{m[2]} {m[1]} {m[0]}   (en: {m[3]})')
                cur.execute('''SELECT e.exam_en, e.exam_ko, CONCAT(ej.source, IF(ej.verified, '(v)', '')), ej.sense_no,
                                      ej.tatoeba_ja_id FROM voca_example_map em
                               JOIN voca_example e ON e.id=em.example_id
                               LEFT JOIN voca_example_ja ej ON ej.example_id=e.id
                               WHERE em.voca_id=%s ORDER BY e.id''', (vid,))
                for e in cur.fetchall():
                    print(f'      예 [{e[2]} s{e[3]} #{e[4]}] {e[0]}\n         → {e[1]}')
    conn.close()
    return res


# ---------------------------------------------------------------- 서점 / 버전

def run_books(args):
    """60_make_jlpt_books.py --reset 을 같은 접속 인자로 실행(비밀번호는 환경변수 그대로 상속)."""
    cmd = [sys.executable, os.path.join(HERE, '60_make_jlpt_books.py'), '--reset',
           '--host', args.host, '--port', str(args.port), '--user', args.user,
           '--password-env', args.password_env, '--schema', args.schema]
    log('서점 재생성: 60_make_jlpt_books.py --reset')
    r = subprocess.run(cmd)
    if r.returncode != 0:
        sys.exit(f'60_make_jlpt_books.py 실패 (exit {r.returncode})')


def set_build_version(args, schema, version):
    guard(schema)
    conn = connect(args, schema)
    with conn.cursor() as cur:
        cur.execute('REPLACE INTO dict_meta (`key`,`value`,updated_at) VALUES (%s,%s,%s)',
                    ('build_version', version, dt.datetime.now().replace(microsecond=0)))
    conn.commit()
    conn.close()
    log(f'dict_meta.build_version = {version}')


# ---------------------------------------------------------------- dump / upload

def table_counts(args, schema):
    conn = connect(args, schema)
    with conn.cursor() as cur:
        out = OrderedDict()
        for t in ['voca', 'voca_meaning', 'voca_example']:
            cur.execute(f'SELECT COUNT(*) FROM `{t}`')
            out[t] = cur.fetchone()[0]
        cur.execute('SELECT COUNT(*) FROM voca WHERE is_active=0 OR is_active IS NULL')
        out['voca_inactive'] = cur.fetchone()[0]
        cur.execute("SELECT `value` FROM dict_meta WHERE `key`='build_version'")
        r = cur.fetchone()
    conn.close()
    return out, (r[0] if r else None)


def ensure_mysqldump():
    exe = shutil.which('mysqldump') or shutil.which('mariadb-dump')
    if exe:
        return exe
    log('mysqldump 없음 → apt-get install -y default-mysql-client')
    env = dict(os.environ, DEBIAN_FRONTEND='noninteractive')
    for cmd in (['apt-get', 'update', '-qq'],
                ['apt-get', 'install', '-y', '-qq', '--no-install-recommends', 'default-mysql-client']):
        r = subprocess.run(cmd, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        if r.returncode != 0:
            sys.exit(f'{" ".join(cmd)} 실패: {r.stderr.decode(errors="replace")[-500:]}')
    exe = shutil.which('mysqldump') or shutil.which('mariadb-dump')
    if not exe:
        sys.exit('default-mysql-client 설치 후에도 mysqldump 없음')
    return exe


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def dump(args, schema, path=None):
    """mysqldump → (MariaDB sandbox 줄 제거) → gzip(mtime=0, 결정론) → sha256. 반환 dict."""
    guard(schema)
    counts, bver = table_counts(args, schema)
    bver = bver or args.build_version
    path = path or os.path.join(BUILD, f'heyvoca_dict_ja_v{bver}.sql.gz')
    exe = ensure_mysqldump()
    ver = subprocess.run([exe, '--version'], capture_output=True, text=True).stdout.strip()
    log(f'dump {schema} → {os.path.relpath(path, ROOT) if path.startswith(ROOT) else path}  ({ver})')
    # 비밀번호는 명령줄이 아니라 MYSQL_PWD 환경변수로만 전달
    env = dict(os.environ, MYSQL_PWD=os.environ[args.password_env])
    cmd = [exe, '--no-tablespaces', '--single-transaction', '--quick', '--skip-lock-tables',
           '--skip-comments', '--default-character-set=utf8mb4',
           f'--host={args.host}', f'--port={args.port}', f'--user={args.user}', schema]
    tmp = path + '.part'
    t0 = time.time()
    raw = hashlib.sha256()
    raw_size = 0
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
    with open(tmp, 'wb') as fo, gzip.GzipFile(filename='', mode='wb', fileobj=fo, mtime=0, compresslevel=9) as gz:
        first = True
        for line in proc.stdout:
            # MariaDB 11.x mariadb-dump 는 첫 줄에 `/*M!999999\- enable the sandbox mode */` 를 넣는데,
            # MySQL 8 클라이언트는 이 줄에서 import 가 실패한다 → 제거
            if first:
                first = False
                if line.startswith(b'/*M!999999'):
                    continue
            raw.update(line)
            raw_size += len(line)
            gz.write(line)
    err = proc.stderr.read().decode(errors='replace')
    if proc.wait() != 0:
        os.remove(tmp)
        sys.exit(f'mysqldump 실패: {err.strip()[-1000:]}')
    os.replace(tmp, path)
    res = dict(path=path, file=os.path.basename(path), version=bver, sha256=sha256_file(path),
               sql_sha256=raw.hexdigest(), size=os.path.getsize(path), sql_size=raw_size, counts=counts)
    log(f'dump 완료 ({time.time() - t0:.1f}s) sql {raw_size:,}B → gz {res["size"]:,}B')
    print(f'sha256  {res["sha256"]}  {res["file"]}')
    print(f'sha256(sql, 압축 해제본)  {res["sql_sha256"]}')
    print(f'counts  {json.dumps(counts, ensure_ascii=False)}')
    return res


def s3_client():
    import boto3  # 컨테이너에 pip install -q boto3 (51_dump_upload.sh 가 처리)
    from botocore.config import Config
    key, sec = os.environ.get('MINIO_DICT_RW_KEY'), os.environ.get('MINIO_DICT_RW_SECRET')
    if not key or not sec:
        sys.exit('MINIO_DICT_RW_KEY / MINIO_DICT_RW_SECRET 환경변수 없음 (scripts/51_dump_upload.sh 로 실행)')
    return boto3.client('s3', endpoint_url=os.environ.get('OBJECTSTORE_ENDPOINT', OBJECTSTORE_ENDPOINT),
                        aws_access_key_id=key, aws_secret_access_key=sec, region_name='us-east-1',
                        config=Config(signature_version='s3v4', s3={'addressing_style': 'path'},
                                      # boto3 1.36+ 기본 CRC 체크섬 헤더 — 구버전 MinIO 호환 위해 필요할 때만
                                      request_checksum_calculation='when_required',
                                      response_checksum_validation='when_required'))


def upload(res, dry_run=False):
    """dump 파일 → s3://heyvoca/dict_ja/<file>, 그 다음 dict_ja/index.json 갱신(latest=이 버전).
    순서: 객체 PUT → HEAD 로 크기 확인 → index PUT. 같은 version 항목이 있으면 교체한다."""
    bucket = os.environ.get('MINIO_BUCKET', OBJECTSTORE_BUCKET)
    key = f'{OBJECT_PREFIX}/{res["file"]}'
    entry = OrderedDict(version=res['version'], key=key, sha256=res['sha256'], size=res['size'],
                        counts=res['counts'],
                        created_at=dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat())
    if dry_run:
        print(f'[dry-run] PUT s3://{bucket}/{key}  ({res["size"]:,}B, application/gzip)')
        print(f'[dry-run] PUT s3://{bucket}/{INDEX_KEY}  latest={res["version"]}, 새 항목:')
        print('  ' + json.dumps(entry, ensure_ascii=False))
        print('[dry-run] 네트워크 호출 없음')
        return entry
    cli = s3_client()
    try:
        body = cli.get_object(Bucket=bucket, Key=INDEX_KEY)['Body'].read()
        index = json.loads(body)
    except cli.exceptions.NoSuchKey:
        index = {'latest': None, 'versions': []}
    log(f'PUT s3://{bucket}/{key}')
    cli.upload_file(res['path'], bucket, key, ExtraArgs={
        'ContentType': 'application/gzip', 'Metadata': {'sha256': res['sha256'], 'version': res['version']}})
    try:
        head = cli.head_object(Bucket=bucket, Key=key)
        if head['ContentLength'] != res['size']:
            sys.exit(f'업로드 크기 불일치: {head["ContentLength"]} ≠ {res["size"]} — index 는 갱신하지 않음')
    except Exception as e:  # RW 키에 HEAD 권한이 없는 경우(403) — 업로드 자체는 성공했으므로 경고만
        warn(f'HEAD 로 크기 검증 불가({type(e).__name__}) — MinIO 정책에 dict_ja/* GetObject/ListBucket 추가 권장')
    versions = [v for v in index.get('versions', []) if v.get('version') != res['version']]
    if len(versions) != len(index.get('versions', [])):
        warn(f'index 에 같은 version {res["version"]} 이 있어 교체')
    versions.insert(0, entry)
    versions.sort(key=lambda v: v['version'], reverse=True)
    index = OrderedDict(latest=versions[0]['version'], versions=versions)
    data = json.dumps(index, ensure_ascii=False, indent=1).encode('utf-8')
    cli.put_object(Bucket=bucket, Key=INDEX_KEY, Body=data, ContentType='application/json',
                   CacheControl='no-cache')
    log(f'index 갱신 s3://{bucket}/{INDEX_KEY} latest={index["latest"]} (버전 {len(versions)}개)')
    return entry


# ---------------------------------------------------------------- selftest

def selftest_data():
    """5항목 인메모리 데이터. 입력 순서를 일부러 섞어 id 결정론·중복·제외 경로를 모두 태운다."""
    def ent(jid, word, reading, jlpt, senses, uk=False):
        return dict(jmdict_id=jid, word=word, reading=reading, romaji='r' + str(jid), uk=uk,
                    kanji_forms=[] if uk else [dict(text=word, tags=[], common=True)],
                    kana_forms=[dict(text=reading, tags=[], common=True, appliesToKanji=['*'])],
                    jlpt=jlpt, accent='0', common=True, level=None, flags=['selftest'],
                    senses=[dict(sense_no=i + 1, pos=p, misc=[], field=[], gloss=g, info=None)
                            for i, (p, g) in enumerate(senses)])
    S = '<strong class="target-word">{}</strong>'
    entries = [
        ent(300, '食べる', 'たべる', 'N5', [(['v1', 'vt'], ['to eat']), (['v1', 'vt'], ['to live on'])]),
        ent(100, '本', 'ほん', 'N5', [(['n'], ['book'])]),
        ent(500, 'やっぱり', 'やっぱり', None, [(['adv'], ['as expected'])], uk=True),
        ent(200, '学校', 'がっこう', 'N4', [(['n'], ['school'])]),
        ent(400, '難解', 'なんかい', 'N1', [(['adj-na'], ['difficult'])]),
    ]
    meanings = [
        dict(jmdict_id=300, sense_no=1, meanings=[dict(meaning='먹다', pos='VERB')]),
        dict(jmdict_id=300, sense_no=2, meanings=[dict(meaning='먹다', pos='VERB'),        # 중복 → 1행
                                                  dict(meaning='생계를 꾸리다', pos='VERB')]),
        dict(jmdict_id=100, sense_no=1, meanings=[dict(meaning='책', pos='NOUN')]),
        dict(jmdict_id=200, sense_no=1, meanings=[dict(meaning='학교', pos='NOUN')]),
        dict(jmdict_id=400, sense_no=1, meanings=[dict(meaning='난해하다', pos='ADJ')]),
        dict(jmdict_id=999, sense_no=1, meanings=[dict(meaning='없는 항목', pos='NOUN')]),  # 미수록 → 무시
        # 500(やっぱり) 은 뜻 없음 → voca_without_meaning 1
    ]
    examples = [
        dict(jmdict_id=100, sense_no=None, ja=f'{S.format("本")}を読む。', tatoeba_ja_id=11, tatoeba_en_id=91,
             reading_tokens=[['本', 'ほん'], ['を', None], ['読む', 'よむ']], verified=True, span_method='headword'),
        dict(jmdict_id=100, sense_no=None, ja=f'{S.format("本")}がある。', tatoeba_ja_id=12, tatoeba_en_id=92,
             reading_tokens=[['本', 'ほん']], verified=False, span_method='surface'),       # rejected
        dict(jmdict_id=200, sense_no=1, ja=f'{S.format("学校")}へ行く。', tatoeba_ja_id=21, tatoeba_en_id=None,
             reading_tokens=[['学校', 'がっこう']], verified=True, span_method='headword'),
        dict(jmdict_id=300, sense_no=None, ja=f'パンを{S.format("食べる")}。', tatoeba_ja_id=31, tatoeba_en_id=93,
             reading_tokens=[['パン', None], ['食べる', 'たべる']], verified=True, span_method='lemma'),  # ko 없음
    ]
    examples_ko = [
        dict(jmdict_id=100, tatoeba_ja_id=11, sense_no=1, ko=f'{S.format("책")}을 읽다.', rejected=False, reason=None),
        dict(jmdict_id=100, tatoeba_ja_id=12, sense_no=1, ko=f'{S.format("책")}이 있다.', rejected=True, reason='test'),
        dict(jmdict_id=200, tatoeba_ja_id=21, sense_no=1, ko=f'{S.format("학교")}에 가다.', rejected=False, reason=None),
    ]
    examples_generated = [
        dict(jmdict_id=300, sense_no=1, ja=f'ご飯を{S.format("食べる")}。', ja_plain='ご飯を食べる。',
             ko=f'밥을 {S.format("먹다")}.', reading_tokens=[['ご飯', 'ごはん'], ['食べる', 'たべる']]),
        dict(jmdict_id=100, sense_no=1, ja=f'{S.format("本")}を買う。', ja_plain='本を買う。',
             ko=f'{S.format("책")}을 사다.', reading_tokens=[['本', 'ほん'], ['買う', 'かう']]),
        # 표제어 구간 후리가나 고정: 学|校 두 토큰 + 틀린 읽기 → [学校, がっこう, ''] 한 토큰
        dict(jmdict_id=200, sense_no=1, ja=f'新しい{S.format("学校")}だ。', ja_plain='新しい学校だ。',
             ko=f'새 {S.format("학교")}다.', reading_tokens=[['新しい', 'あたら', 'しい'], ['学', 'まな', ''],
                                                          ['校', 'こう', ''], ['だ', None], ['。', None]]),
    ]
    # 本 에 미검수 Tatoeba 를 먼저 둬서 verified 우선 정렬을 확인
    examples.insert(0, dict(jmdict_id=100, sense_no=1, ja=f'{S.format("本")}だ。', tatoeba_ja_id=10, tatoeba_en_id=None,
                            reading_tokens=[['本', 'ほん']], verified=False, span_method='unindexed'))
    examples_ko.append(dict(jmdict_id=100, tatoeba_ja_id=10, sense_no=None, ko=f'{S.format("책")}이다.',
                            rejected=False, reason=None))   # sense_no 없음 → 색인 값(1)
    # 本: sense null(양쪽 모두) 검수본 → sense 1 취급, 파일 순으로 #11 뒤·미검수 #10 앞
    examples.append(dict(jmdict_id=100, sense_no=None, ja=f'{S.format("本")}です。', tatoeba_ja_id=13, tatoeba_en_id=None,
                         reading_tokens=[['本', 'ほん']], verified=True, span_method='headword'))
    examples_ko.append(dict(jmdict_id=100, tatoeba_ja_id=13, sense_no=None, ko=f'{S.format("책")}입니다.',
                            rejected=False, reason=None))
    # 食べる: sense 2 검수 tatoeba 가 있어도 sense 1 generated 가 먼저
    examples.append(dict(jmdict_id=300, sense_no=1, ja=f'霞を{S.format("食べる")}。', tatoeba_ja_id=32, tatoeba_en_id=None,
                         reading_tokens=[['霞', 'かすみ']], verified=True, span_method='headword'))
    examples_ko.append(dict(jmdict_id=300, tatoeba_ja_id=32, sense_no=2, ko=f'이슬만 {S.format("먹고 살다")}.',
                            rejected=False, reason=None))   # LLM 판정 sense 2 가 색인 1 을 이김
    inactive = [dict(jmdict_id=400, word='難解', reading='なんかい', reason='selftest')]
    return dict(entries=entries, meanings=meanings, examples=examples, examples_ko=examples_ko,
                examples_generated=examples_generated, inactive=inactive)


def selftest(args):
    schema = SELFTEST_SCHEMA
    fails = []

    def expect(name, got, want):
        ok = got == want
        print(f'  {"OK  " if ok else "FAIL"} {name}: {got!r}' + ('' if ok else f' (기대 {want!r})'))
        if not ok:
            fails.append(name)

    R = build_rows(selftest_data())
    # 결정론: 두 번 빌드해도 같은 행
    expect('build 결정론', build_rows(selftest_data()).__dict__ == R.__dict__, True)
    try:
        create_schema(args, schema, reset=True)
        load(args, schema, R, meta={'build_version': 'selftest', 'source_versions': source_versions()})
        # 재적재 가드 + --truncate 재적재
        load(args, schema, build_rows(selftest_data()), truncate=True,
             meta={'build_version': 'selftest', 'source_versions': source_versions()})
        res = verify(args, schema, samples=5)
        print('\n=== selftest 기대값 ===')
        expect('voca', res['voca'], 5)
        expect('voca_ja', res['voca_ja'], 5)
        expect('voca_meaning (食べる 먹다 중복 1행)', res['voca_meaning'], 5)
        expect('voca_meaning_ja', res['voca_meaning_ja'], 5)
        expect('voca_example (rejected·ko없음 제외, generated 3 포함)', res['voca_example'], 8)
        expect('voca_example_ja', res['voca_example_ja'], 8)
        expect('headword_reading_mismatch (적재 시 고정)', res['headword_reading_mismatch'], 0)
        expect('voca_inactive (難解)', res['voca_inactive'], 1)
        expect('voca_without_meaning (やっぱり)', res['voca_without_meaning'], 1)
        expect('voca_without_example (難解, やっぱり)', res['voca_without_example'], 2)
        for k in ('example_no_strong_ja', 'example_no_strong_ko', 'orphan_meaning_unmapped',
                  'orphan_example_unmapped', 'meaning_shared_across_voca', 'voca_missing_voca_ja',
                  'meaning_missing_meaning_ja', 'example_missing_example_ja', 'fk_orphan_meaning_map',
                  'fk_orphan_example_map', 'fk_orphan_voca_ja', 'fk_orphan_meaning_ja', 'fk_orphan_example_ja',
                  'meaning_order_violation', 'example_order_violation'):
            expect(k, res[k], 0)
        conn = connect(args, schema)
        with conn.cursor() as cur:
            cur.execute('SELECT v.id, j.jmdict_id, v.level FROM voca v JOIN voca_ja j ON j.voca_id=v.id ORDER BY v.id')
            expect('voca.id = jmdict_id 순 / level 매핑', cur.fetchall(),
                   ((1, 100, '1'), (2, 200, '3'), (3, 300, '1'), (4, 400, '9'), (5, 500, '10')))
            cur.execute('''SELECT m.meaning, mj.sense_no, mj.en_gloss, mj.jmdict_pos FROM voca_meaning_map mm
                           JOIN voca_meaning m ON m.id=mm.meaning_id JOIN voca_meaning_ja mj ON mj.meaning_id=m.id
                           WHERE mm.voca_id=3 ORDER BY m.id''')
            rows = cur.fetchall()
            expect('食べる 뜻/sense', [(r[0], r[1], r[2]) for r in rows],
                   [('먹다', 1, 'to eat'), ('생계를 꾸리다', 2, 'to live on')])
            expect('jmdict_pos JSON', json.loads(rows[0][3]), ['v1', 'vt'])
            cur.execute('''SELECT ej.source, ej.tatoeba_ja_id, ej.sense_no, ej.verified FROM voca_example_map em
                           JOIN voca_example_ja ej ON ej.example_id=em.example_id WHERE em.voca_id=1 ORDER BY ej.example_id''')
            expect('本 예문 순서(s1: 검수 #11·검수 null→1 #13 → 미검수 #10 → generated), rejected 제외', cur.fetchall(),
                   (('tatoeba', 11, 1, 1), ('tatoeba', 13, None, 1), ('tatoeba', 10, 1, 0), ('generated', None, 1, 0)))
            cur.execute('''SELECT ej.source, ej.tatoeba_ja_id, ej.sense_no FROM voca_example_map em
                           JOIN voca_example_ja ej ON ej.example_id=em.example_id WHERE em.voca_id=3 ORDER BY ej.example_id''')
            expect('食べる 예문 순서(s1 generated → s2 검수 tatoeba)', cur.fetchall(),
                   (('generated', None, 1), ('tatoeba', 32, 2)))
            # 검사 SQL 이 위반을 실제로 잡는지: 食べる 두 예문 sense 를 뒤바꿨다가 되돌린다
            cur.execute('''UPDATE voca_example_ja ej JOIN voca_example_map em ON em.example_id=ej.example_id
                           SET ej.sense_no=3-ej.sense_no WHERE em.voca_id=3''')
            cur.execute(dict(verify_checks())['example_order_violation'])
            expect('example_order_violation 검출(의도적 위반)', cur.fetchone()[0], 1)
            conn.rollback()
            cur.execute('SELECT jmdict_id FROM voca v JOIN voca_ja j ON j.voca_id=v.id WHERE v.is_active=0')
            expect('is_active=0 대상', cur.fetchall(), ((400,),))
            cur.execute('SELECT reading_tokens FROM voca_example_ja WHERE example_id=1')  # 本 verified(#11)
            expect('reading_tokens JSON', json.loads(cur.fetchone()[0]), [['本', 'ほん'], ['を', None], ['読む', 'よむ']])
            cur.execute('''SELECT ej.reading_tokens FROM voca_example_map em JOIN voca_example_ja ej
                           ON ej.example_id=em.example_id WHERE em.voca_id=2 AND ej.source='generated' ''')
            expect('학교 generated 후리가나 고정', json.loads(cur.fetchone()[0]),
                   [['新しい', 'あたら', 'しい'], ['学校', 'がっこう', ''], ['だ', None], ['。', None]])
            cur.execute("SELECT kanji_forms, kana_forms, uk FROM voca_ja WHERE jmdict_id=500")
            kf, kn, uk = cur.fetchone()
            expect('uk 항목 kanji_forms/uk', (json.loads(kf), uk), ([], 1))
            cur.execute('SELECT version_num FROM alembic_version')
            expect('alembic stamp', cur.fetchall(), (('6efb3b1f9711',),))
        conn.close()
        if args.selftest_dump:
            d = os.path.join('/tmp', 'dictja_selftest')
            os.makedirs(d, exist_ok=True)
            r1 = dump(args, schema, os.path.join(d, 'a.sql.gz'))
            r2 = dump(args, schema, os.path.join(d, 'b.sql.gz'))
            expect('dump 결정론(sha256 동일)', r1['sha256'], r2['sha256'])
            with gzip.open(r1['path'], 'rb') as f:
                head = f.read(4096)
            expect('dump 첫 줄 sandbox 없음', head.startswith(b'/*M!999999'), False)
            expect('dump 에 CREATE TABLE voca 포함', b'CREATE TABLE `voca`' in gzip.open(r1['path']).read(), True)
            upload(r1, dry_run=True)
            shutil.rmtree(d, ignore_errors=True)
    finally:
        conn = connect(args)
        with conn.cursor() as cur:
            cur.execute(f'DROP DATABASE IF EXISTS `{schema}`')
        conn.commit()
        conn.close()
        log(f'selftest 스키마 {schema} DROP')
    if fails:
        sys.exit(f'selftest 실패 {len(fails)}건: {fails}')
    log('selftest 전부 통과')


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--host', default='host.docker.internal')
    ap.add_argument('--port', type=int, default=3310)
    ap.add_argument('--user', default='root')
    ap.add_argument('--password-env', default='MYSQL_PWD', help='비밀번호를 담은 환경변수 이름')
    ap.add_argument('--schema', default=DEFAULT_SCHEMA, help='대상 스키마 (heyvoca_dict_ja* 만 허용)')
    ap.add_argument('--reset', action='store_true', help='스키마 DROP 후 재생성')
    ap.add_argument('--schema-only', action='store_true', help='스키마만 생성하고 종료')
    ap.add_argument('--truncate', action='store_true', help='기존 데이터 비우고 전체 재적재')
    ap.add_argument('--allow-missing-meanings', action='store_true')
    ap.add_argument('--no-reading-fix', action='store_true', help='표제어 구간 후리가나 고정(reading_fix) 끄기')
    ap.add_argument('--reading-fix-homo', choices=['fix', 'skip'], default='fix',
                    help='현재 읽기가 같은 표기 다른 항목의 읽기일 때: fix=사전 읽기로 교체(기본), skip=보류')
    ap.add_argument('--build-only', action='store_true', help='DB 없이 입력 → 행 생성까지만 하고 통계 출력')
    ap.add_argument('--verify', action='store_true', help='적재 후 검증')
    ap.add_argument('--verify-only', action='store_true', help='적재 없이 검증만')
    ap.add_argument('--build-version', default=None, help='생략 시 적재는 오늘 날짜(YYYYMMDD), dump 는 DB 값')
    ap.add_argument('--with-books', action='store_true',
                    help='적재 직후 scripts/60_make_jlpt_books.py --reset 실행(서점 재생성)')
    ap.add_argument('--selftest', action='store_true')
    ap.add_argument('--selftest-dump', action='store_true', help='--selftest 에 dump 결정론·dry-run 업로드 검사 추가')
    ap.add_argument('--dump', nargs='?', const='', default=None, metavar='PATH',
                    help='dump(.sql.gz)+sha256. PATH 생략 시 build/heyvoca_dict_ja_v<build_version>.sql.gz')
    ap.add_argument('--upload', action='store_true', help='dump 를 objectstore dict_ja/ 에 올리고 index.json 갱신 (--dump 포함)')
    ap.add_argument('--dry-run', action='store_true', help='--upload 를 네트워크 호출 없이 계획만 출력')
    args = ap.parse_args()
    guard(args.schema)
    want_dump = args.dump is not None or args.upload
    explicit_version = args.build_version
    args.build_version = args.build_version or dt.date.today().strftime('%Y%m%d')

    if args.selftest:
        return selftest(args)
    if args.build_only:
        R = build_rows(load_inputs(args), allow_missing_meanings=args.allow_missing_meanings,
                       reading_fix_on=not args.no_reading_fix, reading_fix_homo=args.reading_fix_homo)
        log(f'build-only: voca {len(R.voca):,} · meaning {len(R.meaning):,} · example {len(R.example):,}')
        for k in sorted(R.stats):
            log(f'  stat {k}: {R.stats[k]:,}')
        return
    if args.verify_only:
        verify(args, args.schema)
        return
    if want_dump and not (args.reset or args.truncate):
        log('--reset/--truncate 없음 → 적재 건너뛰고 현재 DB 를 dump')
        if args.with_books:
            run_books(args)
        if explicit_version:
            set_build_version(args, args.schema, explicit_version)
        res = dump(args, args.schema, args.dump or None)
        if args.upload:
            upload(res, dry_run=args.dry_run)
        return
    create_schema(args, args.schema, reset=args.reset)
    if args.schema_only:
        return
    data = load_inputs(args)
    R = build_rows(data, allow_missing_meanings=args.allow_missing_meanings,
                   reading_fix_on=not args.no_reading_fix, reading_fix_homo=args.reading_fix_homo)
    load(args, args.schema, R, truncate=args.truncate or args.reset,
         meta={'build_version': args.build_version, 'source_versions': source_versions()})
    if args.with_books:
        run_books(args)
    elif args.reset or args.truncate:
        warn('서점(JLPT 분권) 미재생성 — 재적재 후 scripts/60_make_jlpt_books.py --reset 실행 필요(또는 --with-books)')
    if args.verify:
        verify(args, args.schema)
    if want_dump:
        res = dump(args, args.schema, args.dump or None)
        if args.upload:
            upload(res, dry_run=args.dry_run)


if __name__ == '__main__':
    main()
