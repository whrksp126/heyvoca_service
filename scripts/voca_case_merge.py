#!/usr/bin/env python3
"""대소문자 중복 병합 실행 — 병합 계획 CSV대로 대표 단어로 통합 (기본 dry-run).

입력 CSV 컬럼:
  rep_voca_id      대표로 남길 voca.id
  merge_voca_ids   대표로 흡수 후 삭제할 voca.id 목록 (콤마)
  add_meaning_ids  (선택) 대표에 추가할 뜻 id (Phase B에서 새 의미 보존용). 없으면 빈칸.

동작 (그룹별, 단일 트랜잭션):
  1. 비대표의 매핑을 대표로 이관
       - voca_book_map / voca_example_map : PK 복합 → UPDATE IGNORE (충돌은 CASCADE로 정리)
       - admin_voca_book_map (FK NO ACTION): 대표가 이미 없는 book만 이관, 충돌 행은 선삭제
  2. (Phase B) add_meaning_ids → 대표에 뜻 매핑 추가 (INSERT IGNORE)
  3. 비대표 voca 삭제 → 남은 매핑은 CASCADE 자동 삭제
  4. 고아 뜻/예문 정리 (연결 0인 것만)

사용:
  ./heyvoca_back/.venv/bin/python scripts/voca_case_merge.py db/case_merge/auto_merge.csv          # dry-run
  ./heyvoca_back/.venv/bin/python scripts/voca_case_merge.py db/case_merge/auto_merge.csv --apply  # 반영
"""
import argparse
import csv
import os
import re
import sys
from pathlib import Path
from urllib.parse import unquote

import pymysql

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = PROJECT_ROOT / 'heyvoca_back' / '.env.local'


def log(m):
    print(m, flush=True)


def db_connect():
    env = ENV_PATH.read_text()
    m = re.search(r'DATABASE_URL_DICT=mysql\+pymysql://([^:]+):([^@]+)@[^:]+:\d+/(\S+)', env)
    if not m:
        sys.exit('DATABASE_URL_DICT를 찾지 못했습니다.')
    return pymysql.connect(
        host=os.environ.get('DB_HOST', '127.0.0.1'),
        port=int(os.environ.get('DB_PORT', 3310)),
        user=m.group(1), password=unquote(m.group(2)), database=m.group(3).strip(),
        charset='utf8mb4', cursorclass=pymysql.cursors.DictCursor,
    )


def load_plan(path):
    plan = []
    for r in csv.DictReader(open(path, encoding='utf-8-sig')):
        rep = int(r['rep_voca_id'])
        merges = [int(x) for x in r['merge_voca_ids'].split(',') if x.strip()]
        adds = [int(x) for x in (r.get('add_meaning_ids') or '').split(',') if x.strip()]
        if merges:
            plan.append((rep, merges, adds))
    return plan


def merge_one(cur, rep, merges, adds):
    """그룹 1개 병합. 반환: (이관 book, 이관 admin, 이관 example, 추가 meaning)."""
    ph = ','.join(['%s'] * len(merges))

    # 1a. voca_book_map / voca_example_map — 복합 PK, CASCADE. 충돌은 IGNORE로 스킵.
    cur.execute(f'UPDATE IGNORE voca_book_map SET voca_id=%s WHERE voca_id IN ({ph})', [rep, *merges])
    moved_book = cur.rowcount
    cur.execute(f'UPDATE IGNORE voca_example_map SET voca_id=%s WHERE voca_id IN ({ph})', [rep, *merges])
    moved_ex = cur.rowcount

    # 1b. admin_voca_book_map — FK NO ACTION, (voca_id,book_id) 유니크 없음.
    #     대표가 아직 없는 book만 이관 → 남은(충돌) 행은 선삭제(안 그러면 voca 삭제 시 FK 위반).
    cur.execute(f"""
        UPDATE admin_voca_book_map a
        LEFT JOIN admin_voca_book_map b ON b.voca_id=%s AND b.book_id=a.book_id
        SET a.voca_id=%s
        WHERE a.voca_id IN ({ph}) AND b.id IS NULL
    """, [rep, rep, *merges])
    moved_admin = cur.rowcount
    cur.execute(f'DELETE FROM admin_voca_book_map WHERE voca_id IN ({ph})', merges)

    # 2. 새 의미 보존 (Phase B)
    added = 0
    for mid in adds:
        cur.execute('INSERT IGNORE INTO voca_meaning_map (voca_id, meaning_id) VALUES (%s,%s)', (rep, mid))
        added += cur.rowcount

    # 3. 비대표 voca 삭제 (남은 voca_book_map/voca_meaning_map/voca_example_map는 CASCADE)
    cur.execute(f'DELETE FROM voca WHERE id IN ({ph})', merges)

    return moved_book, moved_admin, moved_ex, added


def counts(cur):
    out = {}
    for t in ('voca', 'voca_meaning', 'voca_example'):
        cur.execute(f'SELECT COUNT(*) c FROM {t}')
        out[t] = cur.fetchone()['c']
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('plan_csv')
    ap.add_argument('--apply', action='store_true')
    args = ap.parse_args()

    plan = load_plan(args.plan_csv)
    n_rep = len(plan)
    n_del = sum(len(m) for _, m, _ in plan)
    n_add = sum(len(a) for _, _, a in plan)
    log(f'계획: 대표 {n_rep:,}그룹 / 삭제 {n_del:,}개 / 새의미 추가 {n_add:,}')

    conn = db_connect()
    cur = conn.cursor()
    before = counts(cur)

    if not args.apply:
        # dry-run: 이관 매핑 규모만 집계 (변경 없음)
        all_merge = [x for _, m, _ in plan for x in m]
        ph = ','.join(['%s'] * len(all_merge))
        for tbl, label in (('voca_book_map', '단어장'), ('admin_voca_book_map', '서점'),
                           ('voca_example_map', '예문')):
            cur.execute(f'SELECT COUNT(*) c FROM {tbl} WHERE voca_id IN ({ph})', all_merge)
            log(f'  이관 대상 {label} 매핑: {cur.fetchone()["c"]:,}')
        log('\n[dry-run] 변경 없음. --apply 로 반영.')
        conn.close()
        return

    log('\n[apply] 병합 시작...')
    tb = ta = te = tadd = 0
    try:
        for rep, merges, adds in plan:
            b, a, e, ad = merge_one(cur, rep, merges, adds)
            tb += b; ta += a; te += e; tadd += ad
        log(f'  이관: 단어장 {tb:,} / 서점 {ta:,} / 예문 {te:,}, 새의미 추가 {tadd:,}')
        log(f'  voca 삭제: {n_del:,}')

        # 4. 고아 정리
        cur.execute("""DELETE vm FROM voca_meaning vm
            LEFT JOIN voca_meaning_map mm ON vm.id=mm.meaning_id WHERE mm.meaning_id IS NULL""")
        log(f'  고아 뜻 삭제: {cur.rowcount:,}')
        cur.execute("""DELETE ve FROM voca_example ve
            LEFT JOIN voca_example_map em ON ve.id=em.example_id WHERE em.example_id IS NULL""")
        log(f'  고아 예문 삭제: {cur.rowcount:,}')
        conn.commit()
        log('  커밋 완료.')
    except Exception:
        conn.rollback()
        log('  ! 오류 → 롤백. DB 변경 없음.')
        raise

    after = counts(cur)
    log('\n[결과]')
    for t in before:
        log(f'  {t:<14} {before[t]:>7,} → {after[t]:>7,}  ({after[t]-before[t]:+,})')
    conn.close()


if __name__ == '__main__':
    main()
