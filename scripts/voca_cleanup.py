#!/usr/bin/env python3
"""단어 데이터 정리 — voca_audit.py가 만든 최종 목록대로 삭제/교정을 실행.

기본은 dry-run(변경 없음). 실제 반영은 --apply 필요.
로컬 heyvoca_dict에서만 실행하고, 이후 dict_publish.py로 발행한다.
(prod에서 직접 실행 금지 — 다음 dict_sync 때 옛 dump가 덮어씀)

입력: db/cleanup/delete_final.csv, db/cleanup/fix_final.csv

실행 순서 (FK 규칙 때문에 순서가 중요):
  1. 교정  — UPDATE voca SET word = fixed_word   (충돌 시 삭제로 전환)
  2. admin_voca_book_map 선삭제 — 이 FK만 ON DELETE NO ACTION이라 안 지우면 DELETE가 거부됨
  3. voca 삭제 — voca_book_map / voca_meaning_map / voca_example_map 은 CASCADE 자동 삭제
  4. 고아 뜻/예문 정리 — 남은 연결이 0인 것만 (뜻은 여러 단어가 공유하므로 필수 조건)

사용법:
  ./heyvoca_back/.venv/bin/python scripts/voca_cleanup.py           # dry-run
  ./heyvoca_back/.venv/bin/python scripts/voca_cleanup.py --apply   # 실제 반영
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
IN_DIR = PROJECT_ROOT / 'db' / 'cleanup'


def log(msg):
    print(msg, flush=True)


def db_connect():
    env = ENV_PATH.read_text()
    m = re.search(r'DATABASE_URL_DICT=mysql\+pymysql://([^:]+):([^@]+)@[^:]+:\d+/(\S+)', env)
    if not m:
        sys.exit(f'DATABASE_URL_DICT를 {ENV_PATH}에서 찾지 못했습니다.')
    user, pw, db = m.group(1), unquote(m.group(2)), m.group(3).strip()
    return pymysql.connect(
        host=os.environ.get('DB_HOST', '127.0.0.1'),
        port=int(os.environ.get('DB_PORT', 3310)),
        user=user, password=pw, database=db,
        charset='utf8mb4', cursorclass=pymysql.cursors.DictCursor,
    )


def read_csv(name):
    path = IN_DIR / name
    if not path.exists():
        sys.exit(f'{path} 가 없습니다. 먼저 voca_audit.py를 실행하세요.')
    return list(csv.DictReader(open(path, encoding='utf-8-sig')))


def counts(cur):
    out = {}
    for t in ('voca', 'voca_meaning', 'voca_example',
              'voca_meaning_map', 'voca_example_map', 'voca_book_map', 'admin_voca_book_map'):
        cur.execute(f'SELECT COUNT(*) AS c FROM {t}')
        out[t] = cur.fetchone()['c']
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true', help='실제 DB에 반영 (없으면 dry-run)')
    args = ap.parse_args()

    delete_rows = read_csv('delete_final.csv')
    fix_rows = read_csv('fix_final.csv')
    delete_ids = [int(r['voca_id']) for r in delete_rows]
    log(f'삭제 대상 {len(delete_ids)}개 / 교정 대상 {len(fix_rows)}개')

    conn = db_connect()
    cur = conn.cursor()
    before = counts(cur)

    ph = ','.join(['%s'] * len(delete_ids))

    # --- 영향 범위 계산 (dry-run에서도 동일하게 보여줌) ---
    cur.execute(f'SELECT COUNT(*) AS c FROM voca_meaning_map WHERE voca_id IN ({ph})', delete_ids)
    mm_hit = cur.fetchone()['c']
    cur.execute(f'SELECT COUNT(*) AS c FROM voca_example_map WHERE voca_id IN ({ph})', delete_ids)
    em_hit = cur.fetchone()['c']
    cur.execute(f'SELECT COUNT(*) AS c FROM voca_book_map WHERE voca_id IN ({ph})', delete_ids)
    bm_hit = cur.fetchone()['c']
    cur.execute(f'SELECT COUNT(*) AS c FROM admin_voca_book_map WHERE voca_id IN ({ph})', delete_ids)
    abm_hit = cur.fetchone()['c']

    # 교정 충돌 검사 — 하이픈 뗀 결과가 이미 존재하면 교정 대신 삭제해야 중복이 안 생김
    fix_apply, fix_collide = [], []
    for r in fix_rows:
        cur.execute('SELECT id FROM voca WHERE word = %s AND id <> %s',
                    (r['fixed_word'], int(r['voca_id'])))
        (fix_collide if cur.fetchone() else fix_apply).append(r)

    log('\n[영향 범위]')
    log(f'  삭제로 함께 지워질 매핑 — 뜻 {mm_hit} / 예문 {em_hit} / 단어장 {bm_hit} (CASCADE)')
    log(f'  admin_voca_book_map 선삭제 대상: {abm_hit}건'
        + ('  ← 선삭제 안 하면 DELETE 거부됨' if abm_hit else '  (없음)'))
    log(f'  교정 적용: {len(fix_apply)}건 / 충돌로 삭제 전환: {len(fix_collide)}건')
    for r in fix_collide:
        log(f'    ! {r["word"]} → {r["fixed_word"]} 는 이미 존재 → 삭제로 전환')

    if not args.apply:
        log('\n[dry-run] 변경 없음. 실제 반영하려면 --apply 를 붙이세요.')
        conn.close()
        return

    # --- 실제 반영 (단일 트랜잭션) ---
    log('\n[apply] 반영 시작...')
    try:
        # 1. 교정
        for r in fix_apply:
            cur.execute('UPDATE voca SET word = %s WHERE id = %s',
                        (r['fixed_word'], int(r['voca_id'])))
        log(f'  1) 교정 완료: {len(fix_apply)}건')

        # 충돌난 교정 대상은 삭제 목록에 합류
        all_delete = delete_ids + [int(r['voca_id']) for r in fix_collide]
        ph2 = ','.join(['%s'] * len(all_delete))

        # 2. admin 매핑 선삭제 (이 FK만 NO ACTION)
        cur.execute(f'DELETE FROM admin_voca_book_map WHERE voca_id IN ({ph2})', all_delete)
        log(f'  2) admin_voca_book_map 선삭제: {cur.rowcount}건')

        # 3. voca 삭제 (나머지 매핑은 CASCADE)
        cur.execute(f'DELETE FROM voca WHERE id IN ({ph2})', all_delete)
        log(f'  3) voca 삭제: {cur.rowcount}건')

        # 4. 고아 정리 — 어떤 단어와도 연결되지 않은 뜻/예문만
        cur.execute("""
            DELETE vm FROM voca_meaning vm
            LEFT JOIN voca_meaning_map vmm ON vm.id = vmm.meaning_id
            WHERE vmm.meaning_id IS NULL
        """)
        log(f'  4) 고아 뜻 삭제: {cur.rowcount}건')
        cur.execute("""
            DELETE ve FROM voca_example ve
            LEFT JOIN voca_example_map vem ON ve.id = vem.example_id
            WHERE vem.example_id IS NULL
        """)
        log(f'     고아 예문 삭제: {cur.rowcount}건')

        conn.commit()
        log('  커밋 완료.')
    except Exception:
        conn.rollback()
        log('  ! 오류 발생 → 롤백했습니다. DB는 변경되지 않았습니다.')
        raise

    # --- before/after ---
    after = counts(cur)
    log('\n[결과]')
    for t in before:
        d = after[t] - before[t]
        log(f'  {t:<22} {before[t]:>7,} → {after[t]:>7,}  ({d:+,})')
    conn.close()


if __name__ == '__main__':
    main()
