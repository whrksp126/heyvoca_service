#!/usr/bin/env python3
"""중복 통합 감사 (대소문자 + 완전동일 철자) — 읽기 전용.

LOWER(word) 기준 2행 이상인 모든 그룹을 대상으로:
  - 대표(rep) 선정: 고유명사=대문자형, 그 외=content(예문+단어장) 최다 → 소문자 → 최소 id
  - auto  : 비대표 뜻이 대표에 이미 있음(형식중복) → 판정 없이 병합
  - review: 비대표에 새 의미 가능성 → LLM/사람 판정 필요

산출물 (db/case_merge/):
  auto2.csv    : 판정 불필요 (voca_case_merge.py로 바로 실행)
  review.csv   : 판정 필요 (그룹별 변형/뜻/meaning_id 상세)

사용:
  ./heyvoca_back/.venv/bin/python scripts/voca_dup_audit.py
"""
import csv
import json
import os
import re
import sys
from collections import defaultdict, Counter
from pathlib import Path
from urllib.parse import unquote

import pymysql

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = PROJECT_ROOT / 'heyvoca_back' / '.env.local'
OUT_DIR = PROJECT_ROOT / 'db' / 'case_merge'

PROPER_HINT = re.compile(r'이름|인명|국가|나라|도시|대륙|족|아메리카|아프리카|유럽|아시아|반도|산맥|강')


def norm(s):
    return re.sub(r'[①-⑳0-9().·\-\s│|~/,;:\[\]]', '', s)


def db_connect():
    env = ENV_PATH.read_text()
    m = re.search(r'DATABASE_URL_DICT=mysql\+pymysql://([^:]+):([^@]+)@[^:]+:\d+/(\S+)', env)
    return pymysql.connect(
        host=os.environ.get('DB_HOST', '127.0.0.1'), port=int(os.environ.get('DB_PORT', 3310)),
        user=m.group(1), password=unquote(m.group(2)), database=m.group(3).strip(),
        charset='utf8mb4', cursorclass=pymysql.cursors.DictCursor)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    conn = db_connect(); cur = conn.cursor()

    cur.execute("""SELECT v.id, v.word FROM voca v WHERE LOWER(v.word) IN
        (SELECT w FROM (SELECT LOWER(word) w FROM voca GROUP BY LOWER(word) HAVING COUNT(*)>1) x)""")
    rows = cur.fetchall()
    by_lower = defaultdict(list)
    for r in rows:
        by_lower[r['word'].lower()].append((r['id'], r['word']))
    ids = [r['id'] for r in rows]; ph = ','.join(['%s'] * len(ids))

    # 뜻 (id 포함) / 예문수 / 단어장·서점 매핑수
    cur.execute(f"""SELECT mm.voca_id, m.id mid, m.meaning FROM voca_meaning_map mm
        JOIN voca_meaning m ON mm.meaning_id=m.id WHERE mm.voca_id IN ({ph})""", ids)
    meanings = defaultdict(list)   # voca_id -> [(mid, text)]
    for r in cur.fetchall():
        meanings[r['voca_id']].append((r['mid'], r['meaning']))

    def cmap(table):
        cur.execute(f"SELECT voca_id, COUNT(*) c FROM {table} WHERE voca_id IN ({ph}) GROUP BY voca_id", ids)
        return {r['voca_id']: r['c'] for r in cur.fetchall()}
    ex_n, book_n, admin_n = cmap('voca_example_map'), cmap('voca_book_map'), cmap('admin_voca_book_map')

    def content(vid):
        return ex_n.get(vid, 0) + book_n.get(vid, 0) + admin_n.get(vid, 0)

    auto_rows, review_rows = [], []
    stat = Counter()
    for lw, variants in sorted(by_lower.items()):
        texts_all = ' '.join(t for vid, _ in variants for _, t in meanings.get(vid, []))
        is_proper = any(w[0].isupper() and w[1:].islower() for _, w in variants) and PROPER_HINT.search(texts_all)

        # 대표 선정
        if is_proper:
            cand = [v for v in variants if v[1][0].isupper() and v[1][1:].islower()] or variants
        else:
            cand = variants
        rep = max(cand, key=lambda v: (content(v[0]), v[1].islower(), -v[0]))
        rep_id, rep_word = rep
        merge_ids = [vid for vid, _ in variants if vid != rep_id]

        rep_texts = {t for _, t in meanings.get(rep_id, [])}
        rep_norm = {norm(t) for t in rep_texts if norm(t)}
        rep_blob = ''.join(sorted(rep_norm))
        # 비대표의 뜻 중 대표에 없는 '새 후보'
        extras = []   # (mid, text)
        seen = set()
        for vid in merge_ids:
            for mid, t in meanings.get(vid, []):
                nt = norm(t)
                if not nt or nt in seen:
                    continue
                if nt in rep_norm or nt in rep_blob or any(nt in rr or rr in nt for rr in rep_norm):
                    continue
                seen.add(nt); extras.append((mid, t))

        base = {
            'lower': lw,
            'variants': ' | '.join(f'{w}#{vid}' for vid, w in variants),
            'is_proper': 'Y' if is_proper else '',
            'rep_word': rep_word, 'rep_voca_id': rep_id,
            'merge_voca_ids': ','.join(map(str, merge_ids)),
        }
        if not extras:
            stat['auto'] += 1
            auto_rows.append({**base, 'add_meaning_ids': ''})
        else:
            stat['review'] += 1
            review_rows.append({
                **base,
                'rep_meanings': ' / '.join(dict.fromkeys(rep_texts)),
                'extra_candidates': json.dumps(
                    [{'mid': mid, 'text': t} for mid, t in extras], ensure_ascii=False),
            })

    with open(OUT_DIR / 'auto2.csv', 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=['lower', 'variants', 'is_proper', 'rep_word',
                                          'rep_voca_id', 'merge_voca_ids', 'add_meaning_ids'])
        w.writeheader(); w.writerows(auto_rows)
    with open(OUT_DIR / 'review.csv', 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=['lower', 'variants', 'is_proper', 'rep_word',
                                          'rep_voca_id', 'merge_voca_ids', 'rep_meanings',
                                          'extra_candidates'])
        w.writeheader(); w.writerows(review_rows)

    print('=' * 46)
    print(f"통합 중복 그룹  : {len(by_lower):,}")
    print(f"  auto (판정불필요): {stat['auto']:,}  → auto2.csv")
    print(f"  review (판정필요): {stat['review']:,}  → review.csv")
    print('=' * 46)
    conn.close()


if __name__ == '__main__':
    main()
