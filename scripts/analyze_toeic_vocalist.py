#!/usr/bin/env python3
"""토익 단어장(dummy_vocalist) 적재 사전 조사 — docs/toeic_vocalist_import_plan.md의 근거 수치를 재현한다.

읽기 전용이다. DB에 아무것도 쓰지 않으므로 언제든 돌려도 안전하다.
계획서의 표에 적힌 숫자가 의심되거나, DB/소스가 바뀐 뒤 재검증할 때 사용한다.

사용법 (heyvoca_service/ 루트에서):
  ./heyvoca_back/.venv/bin/python scripts/analyze_toeic_vocalist.py
  ./heyvoca_back/.venv/bin/python scripts/analyze_toeic_vocalist.py --src ~/Downloads/dummy_vocalist
  ./heyvoca_back/.venv/bin/python scripts/analyze_toeic_vocalist.py --section db     # DB 현황만
  ./heyvoca_back/.venv/bin/python scripts/analyze_toeic_vocalist.py --section source # JSON 분석만
  ./heyvoca_back/.venv/bin/python scripts/analyze_toeic_vocalist.py --section diff   # 대조/적재예상만

섹션:
  db      현재 DB 규모, admin_voca_book_map 저장 형태, 재활용 가능 컬럼 조사
  source  JSON 구조/통계/스키마 오염
  diff    DB와 대조 + 적재 예상 수치
"""
import argparse
import collections
import glob
import json
import os
import re
import sys
import unicodedata
from pathlib import Path
from urllib.parse import unquote

import pymysql

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = PROJECT_ROOT / 'heyvoca_back' / '.env.local'
DEFAULT_SRC = '~/Downloads/dummy_vocalist'

# JSON pos → UD 태그. phr/빈값은 판정 불가라 NULL.
POS_MAP = {'n': 'NOUN', 'v': 'VERB', 'adj': 'ADJ', 'adv': 'ADV',
           'prep': 'ADP', 'conj': 'CCONJ', 'phr': None, '': None}

# meaning dict에 품사가 직접 키로 박힌 오염 케이스에서 찾아볼 키
INLINE_POS_KEYS = ('n', 'v', 'adj', 'adv', 'prep', 'conj')


def log(m=''):
    print(m, flush=True)


def h1(t):
    log()
    log('=' * 72)
    log(f'  {t}')
    log('=' * 72)


def h2(t):
    log()
    log(f'--- {t}')


def db_connect():
    """.env.local의 DATABASE_URL_DICT에서 계정을 읽어 로컬 dict DB에 붙는다."""
    if not ENV_PATH.exists():
        sys.exit(f'{ENV_PATH} 가 없습니다.')
    m = re.search(r'DATABASE_URL_DICT=mysql\+pymysql://([^:]+):([^@]+)@[^:]+:\d+/(\S+)',
                  ENV_PATH.read_text())
    if not m:
        sys.exit(f'DATABASE_URL_DICT를 {ENV_PATH}에서 찾지 못했습니다.')
    return pymysql.connect(
        host=os.environ.get('DB_HOST', '127.0.0.1'),
        port=int(os.environ.get('DB_PORT', 3310)),
        user=m.group(1), password=unquote(m.group(2)), database=m.group(3).strip(),
        charset='utf8mb4', cursorclass=pymysql.cursors.DictCursor,
    )


# ──────────────────────────────────────────────────────────
# 소스 JSON 정규화 — 적재 스크립트도 같은 규칙을 써야 한다
# ──────────────────────────────────────────────────────────

def book_name(filename):
    """day_1_토익_기초_단어장.json → ('토익 기초 단어장 (day 1)', 1)

    macOS에서 glob이 돌려주는 파일명은 한글이 NFD(자모 분리)라서
    NFC 정규화 없이는 '_단어장$' 정규식에 매칭되지 않는다. 빼먹으면 120개 전부 스킵된다.
    """
    b = unicodedata.normalize('NFC', os.path.basename(filename))
    if b.endswith('.json'):
        b = b[:-5]
    m = re.match(r'^day_(\d+)_(.+)_단어장$', b)
    if not m:
        return None, None
    day, mid = int(m.group(1)), m.group(2)
    return f"{mid.replace('_', ' ')} 단어장 (day {day})", day


def norm_meanings(item):
    """오염 스키마를 흡수해 [(pos, text), ...]로 펼친다.

    처리하는 오염:
      - {'pos','text'}                      정상
      - {'pos_2','text_2'}, {'pos_3',...}   두/세 번째 뜻이 별도 키
      - {'pos','text','v':'쌓아 올리다'}     품사가 직접 키로 박힘
    """
    out = []
    for m in item.get('meanings', []):
        if m.get('text'):
            out.append((m.get('pos', ''), m['text']))
        for k in ('2', '3'):
            if m.get('text_' + k):
                out.append((m.get('pos_' + k, ''), m['text_' + k]))
        for pk in INLINE_POS_KEYS:
            if pk in m and m[pk]:
                out.append((pk, m[pk]))
    return out


def norm_examples(item):
    """[(origin, meaning), ...]로 정규화.

    한국어 키가 translation/meaning/text 3종으로 갈려 있는데,
    'text'는 예문이 아니라 숙어 뜻풀이({"origin":"meal preference","text":"선호하는 메뉴"})라 제외한다.
    """
    out = []
    for e in item.get('examples', []):
        ko = e.get('translation') or e.get('meaning')
        if ko is None:
            continue
        out.append((e.get('origin', ''), ko))
    return out


def join_pronunciation(p):
    """us, uk 순서 유지 + 빈값 제거 + 중복 제거 후 ', ' 조인.

    voca.pronunciation은 String(100) 단일 컬럼이고 기존 데이터도 콤마로 이형을 표기한다
    (interested → 'íntərəstid, -tərèst-'). us==uk를 그대로 조인하면 같은 값이 두 번 나온다.
    """
    seen, out = set(), []
    for key in ('us', 'uk'):
        v = (p or {}).get(key)
        v = v.strip() if isinstance(v, str) else ''
        if v and v not in seen:
            seen.add(v)
            out.append(v)
    return ', '.join(out) or None


def split_ko(text):
    """DB는 뜻을 낱개로 쪼개 저장하는데 JSON은 콤마로 묶여 있다('진열실, 전시실')."""
    return [p.strip() for p in re.split(r'[,;]', text) if p.strip()]


def is_phrase(word, items):
    """word_type 판정: pos=='phr' 또는 공백 포함 → phrase

    공백 있으나 pos=''인 복합명사(acid rain, climate change)도 phrase로 잡힌다.
    지금은 단어만 노출하므로 의도된 동작이다.
    하이픈 단어(part-time)는 공백이 없어 word로 남는다 — 이것도 의도된 동작.
    """
    if ' ' in word:
        return True
    return any(m.get('pos') == 'phr' for it in items for m in it.get('meanings', []))


strip_tags = lambda s: re.sub(r'<[^>]+>', '', s or '').strip()


def load_source(src):
    """{origin: [item,...]}, {파일명: [origin,...]} 반환"""
    files = sorted(glob.glob(os.path.join(os.path.expanduser(src), '*.json')))
    if not files:
        sys.exit(f'{src} 에 json 파일이 없습니다.')
    entries = collections.defaultdict(list)
    per_file = collections.OrderedDict()
    for f in files:
        key = unicodedata.normalize('NFC', os.path.basename(f))
        per_file[key] = []
        for it in json.load(open(f)):
            w = it['origin'].strip()
            entries[w].append(it)
            per_file[key].append(w)
    return entries, per_file


# ──────────────────────────────────────────────────────────
# 섹션 1: DB 현황
# ──────────────────────────────────────────────────────────

def section_db(cur):
    h1('1. 현재 DB 현황')

    h2('테이블 규모')
    for t in ['voca', 'voca_meaning', 'voca_example', 'voca_meaning_map', 'voca_example_map',
              'voca_book', 'voca_book_map', 'admin_voca_book', 'admin_voca_book_map',
              'bookstore', 'bookstore_category']:
        cur.execute(f'select count(*) n from {t}')
        log(f'  {t:24} {cur.fetchone()["n"]:>10,}')

    h2('서점이 참조하는 단어장 테이블 (voca_book vs admin_voca_book)')
    cur.execute('select count(*) n from bookstore where book_id is not null')
    log(f'  bookstore.book_id 채워짐            {cur.fetchone()["n"]:>4} / 60   ← 레거시')
    cur.execute('select count(*) n from bookstore where admin_voca_book_id is not null')
    log(f'  bookstore.admin_voca_book_id 채워짐 {cur.fetchone()["n"]:>4} / 60   ← 신규 단어장은 여기로')

    h2('admin_voca_book_map 저장 형태 (스냅샷 TEXT)')
    cur.execute('select voca_meanings, voca_examples from admin_voca_book_map')
    ms, es = collections.Counter(), collections.Counter()
    for r in cur.fetchall():
        for col, ctr in (('voca_meanings', ms), ('voca_examples', es)):
            try:
                v = json.loads(r[col] or '[]')
            except (TypeError, ValueError):
                ctr['parse_error'] += 1
                continue
            if not v:
                ctr['empty'] += 1
            elif isinstance(v[0], dict):
                ctr['dict:' + ','.join(sorted(v[0].keys()))] += 1
            else:
                ctr[type(v[0]).__name__] += 1
    log(f'  voca_meanings: {dict(ms)}')
    log(f'  voca_examples: {dict(es)}   ← en/ko(구) 와 origin/meaning(신) 혼재')

    h2('재활용 가능 컬럼 조사')
    cur.execute('select count(*) n from voca where is_active = 0')
    log(f'  voca.is_active = 0 인 행: {cur.fetchone()["n"]}  → 필터 코드도 없어 숙어 구분에 사용 불가')
    cur.execute('select level, count(*) n from admin_voca_book_map group by level order by n desc')
    log(f'  admin_voca_book_map.level 분포: {[(r["level"], r["n"]) for r in cur.fetchall()]}  → 사실상 미사용')
    cur.execute('select id, category, sort_order from bookstore_category order by sort_order')
    log(f'  bookstore_category: {[(r["category"], r["sort_order"]) for r in cur.fetchall()]}')
    log("                      → '토익' 없음. 신설 필요")

    h2('예문 강조 태그 실태 (프론트 빈칸채우기 출제 조건)')
    cur.execute('select count(*) n from voca_example')
    tot = cur.fetchone()['n']
    for col, label in (('exam_en', '영문'), ('exam_ko', '한국어')):
        cur.execute(f"select count(*) n from voca_example where {col} like '%<strong%'")
        log(f'  {label} 태그 보유: {cur.fetchone()["n"]:,} / {tot:,}')

    h2('발음 컬럼 관례')
    cur.execute('select count(*) n from voca where pronunciation is not null')
    log(f'  발음 보유: {cur.fetchone()["n"]:,} / 50,634')
    cur.execute("select count(*) n from voca where pronunciation like '%,%'")
    log(f'  콤마로 이형 표기: {cur.fetchone()["n"]:,}  → us/uk 조인 시 이 관례를 따른다')


# ──────────────────────────────────────────────────────────
# 섹션 2: 소스 JSON
# ──────────────────────────────────────────────────────────

def section_source(entries, per_file):
    h1('2. 소스 JSON 분석')

    total = sum(len(v) for v in per_file.values())
    h2('규모')
    log(f'  파일 {len(per_file)}개 / 총 엔트리 {total:,} / 고유 단어 {len(entries):,}'
        f' (파일 간 중복 {total - len(entries):,})')

    cat = collections.Counter()
    for fn, ws in per_file.items():
        m = re.match(r'^day_\d+_(.+)\.json$', fn)
        if m:
            cat[m.group(1)] += len(ws)
    log(f'  카테고리별: {dict(cat)}')

    h2('단어장명 변환 검증')
    bad = [fn for fn in per_file if book_name(fn)[0] is None]
    log(f'  패턴 불일치: {bad if bad else "없음"}')
    for fn in list(per_file)[:2]:
        log(f'    {fn} → "{book_name(fn)[0]}"')

    h2('필드 보유율')
    n_pron = n_ex = n_notes = n_multi = 0
    pos = collections.Counter()
    for w, items in entries.items():
        for it in items:
            if it.get('pronunciations'):
                n_pron += 1
            if it.get('examples'):
                n_ex += 1
            if it.get('notes'):
                n_notes += 1
            if len(it.get('meanings', [])) > 1:
                n_multi += 1
            for p, _ in norm_meanings(it):
                pos[p] += 1
    log(f'  발음 {n_pron:,} / 예문 {n_ex:,} / notes {n_notes:,} (버림) / 뜻2개이상 {n_multi:,}')
    log(f'  pos 분포: {dict(pos.most_common())}')

    h2('스키마 오염 (적재 전 정규화 필수)')
    inline = pos2 = pos3 = 0
    ex_keys = collections.Counter()
    for w, items in entries.items():
        for it in items:
            for m in it.get('meanings', []):
                if any(k in m and m[k] for k in INLINE_POS_KEYS):
                    inline += 1
                if m.get('text_2'):
                    pos2 += 1
                if m.get('text_3'):
                    pos3 += 1
            for e in it.get('examples', []):
                ex_keys[tuple(sorted(e.keys()))] += 1
    log(f'  meaning에 품사키 직접 박힘: {inline}')
    log(f'  pos_2/text_2: {pos2}   pos_3/text_3: {pos3}')
    for k, c in ex_keys.most_common():
        note = '  ← 예문 아님, 제외' if 'text' in k else ''
        log(f'  example 키 {k}: {c}{note}')

    h2('발음 us/uk 분포 (조인 규칙 근거)')
    eq = ne = only_us = only_uk = 0
    for w, items in entries.items():
        for it in items:
            p = it.get('pronunciations') or {}
            u, k = (p.get('us') or '').strip(), (p.get('uk') or '').strip()
            if u and k:
                eq += (u == k)
                ne += (u != k)
            elif u:
                only_us += 1
            elif k:
                only_uk += 1
    log(f'  us==uk {eq} / us!=uk {ne} / us만 {only_us} / uk만 {only_uk}')
    log(f'  → us!=uk {ne}건은 콤마 조인해 두 발음을 모두 보존한다')

    h2('예문 강조 태그 (프론트 빈칸채우기 출제 조건)')
    en_y = en_n = ko_y = ko_n = 0
    for w, items in entries.items():
        for it in items:
            for origin, meaning in norm_examples(it):
                en_y += '<strong' in origin
                en_n += '<strong' not in origin
                ko_y += '<strong' in meaning
                ko_n += '<strong' not in meaning
    log(f'  영문   태그 O {en_y} / X {en_n}   ← X는 빈칸채우기 출제 불가')
    log(f'  한국어 태그 O {ko_y} / X {ko_n}   ← DB 기존 데이터는 28,464/28,477이 태그 보유')
    log('  → 한국어 강조 태깅은 후속 작업(apply_emphasis)으로 분리. GPT 비용 판단 필요')


# ──────────────────────────────────────────────────────────
# 섹션 3: DB 대조 + 적재 예상
# ──────────────────────────────────────────────────────────

def section_diff(cur, entries, per_file):
    h1('3. DB 대조 및 적재 예상')

    cur.execute('select id, word, pronunciation from voca')
    by_lower = collections.defaultdict(list)
    for r in cur.fetchall():
        by_lower[r['word'].strip().lower()].append(r)

    cur.execute('select vm.voca_id, m.id mid, m.meaning, m.pos '
                'from voca_meaning_map vm join voca_meaning m on m.id = vm.meaning_id')
    mv = collections.defaultdict(dict)
    for r in cur.fetchall():
        mv[r['voca_id']].setdefault(r['meaning'].strip(), r)

    cur.execute('select ve.voca_id, e.id eid, e.exam_en '
                'from voca_example_map ve join voca_example e on e.id = ve.example_id')
    ev = collections.defaultdict(dict)
    for r in cur.fetchall():
        ev[r['voca_id']].setdefault(strip_tags(r['exam_en']), r['eid'])

    h2('단어 매칭')
    exact = lower_only = miss = 0
    for w in entries:
        lw = w.strip().lower()
        rows = by_lower.get(lw)
        if not rows:
            miss += 1
        elif any(r['word'] == w for r in rows):
            exact += 1
        else:
            lower_only += 1
    log(f'  철자 완전일치 {exact:,} / 대소문자만 다름 {lower_only} / DB에 없음(신규) {miss:,}')

    dups = [w for w in entries if len(by_lower.get(w.strip().lower(), [])) > 1]
    log(f'  DB에 동일 철자가 2행 이상인 단어: {len(dups)}  → 행 선택 규칙 필요(계획서 §1.8)')

    h2('pos 대조 (기존 뜻은 덮어쓰지 않는다는 결정의 근거)')
    pos_ok = pos_bad = pos_null = 0
    bad_samples = []
    for w, items in entries.items():
        rows = by_lower.get(w.strip().lower())
        if not rows:
            continue
        vid = rows[0]['id']
        for it in items:
            for jpos, text in norm_meanings(it):
                want = POS_MAP.get(jpos)
                if want is None:
                    continue
                for part in split_ko(text):
                    hit = mv.get(vid, {}).get(part)
                    if not hit:
                        continue
                    if hit['pos'] is None:
                        pos_null += 1
                    elif hit['pos'] == want:
                        pos_ok += 1
                    else:
                        pos_bad += 1
                        if len(bad_samples) < 10:
                            bad_samples.append((w, part, f"DB:{hit['pos']}", f'JSON:{jpos}'))
    log(f'  일치 {pos_ok:,} / 불일치 {pos_bad} / DB가 NULL {pos_null}')
    for s in bad_samples:
        log(f'    {s}')
    log('  → 불일치 대부분 JSON이 틀린 쪽. 기존 pos 유지, 신규 뜻에만 JSON pos 적용')

    h2('적재 예상 수치')
    new_v = reuse_v = 0
    new_m = reuse_m = 0
    new_e = reuse_e = 0
    n_word = n_phrase = 0
    pron_backfill = 0
    for w, items in entries.items():
        rows = by_lower.get(w.strip().lower())
        vid = rows[0]['id'] if rows else None
        if rows:
            reuse_v += 1
            if not rows[0]['pronunciation'] and join_pronunciation(
                    next((it.get('pronunciations') for it in items if it.get('pronunciations')), None)):
                pron_backfill += 1
        else:
            new_v += 1
        if is_phrase(w, items):
            n_phrase += 1
        else:
            n_word += 1

        seen_m, seen_e = set(), set()
        for it in items:
            for _, text in norm_meanings(it):
                for part in split_ko(text):
                    if part in seen_m:
                        continue
                    seen_m.add(part)
                    if vid and part in mv.get(vid, {}):
                        reuse_m += 1
                    else:
                        new_m += 1
            for origin, meaning in norm_examples(it):
                k = strip_tags(origin)
                if k in seen_e:
                    continue
                seen_e.add(k)
                if vid and k in ev.get(vid, {}):
                    reuse_e += 1
                else:
                    new_e += 1

    map_rows = sum(len(set(ws)) for ws in per_file.values())
    log(f'  admin_voca_book       신규 {len(per_file)}')
    log(f'  admin_voca_book_map   신규 {map_rows:,}  (파일 내 중복 제거 후)')
    log(f'  voca                  재사용 {reuse_v:,} / 신규 {new_v:,}')
    log(f'    word_type            word {n_word:,} / phrase {n_phrase:,}')
    log(f'    pronunciation 백필   {pron_backfill}  (DB가 NULL인 경우만)')
    log(f'  voca_meaning          재사용 {reuse_m:,} / 신규 {new_m:,}')
    log(f'  voca_example          재사용 {reuse_e:,} / 신규 {new_e:,}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=DEFAULT_SRC, help=f'JSON 폴더 (기본 {DEFAULT_SRC})')
    ap.add_argument('--section', choices=['db', 'source', 'diff', 'all'], default='all')
    args = ap.parse_args()

    need_db = args.section in ('db', 'diff', 'all')
    need_src = args.section in ('source', 'diff', 'all')

    cur = db_connect().cursor() if need_db else None
    entries, per_file = load_source(args.src) if need_src else (None, None)

    if args.section in ('db', 'all'):
        section_db(cur)
    if args.section in ('source', 'all'):
        section_source(entries, per_file)
    if args.section in ('diff', 'all'):
        section_diff(cur, entries, per_file)
    log()


if __name__ == '__main__':
    main()
