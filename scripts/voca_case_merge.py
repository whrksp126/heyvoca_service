#!/usr/bin/env python3
"""대소문자 중복 병합 실행 — 병합 계획 CSV대로 대표 단어로 통합 (기본 dry-run).

입력 CSV 컬럼:
  rep_voca_id      대표로 남길 voca.id
  merge_voca_ids   대표로 흡수 후 삭제할 voca.id 목록 (콤마)
  add_meaning_ids  (선택) 대표에 추가할 뜻 id (Phase B에서 새 의미 보존용). 없으면 빈칸.

동작 (그룹별, 단일 트랜잭션):
  1. 비대표의 매핑을 대표로 이관
       - voca_book_map / voca_example_map : PK 복합 → UPDATE IGNORE (충돌은 CASCADE로 정리)
       - admin_voca_book_map (FK ON DELETE CASCADE): 대표가 이미 없는 book만 이관, 충돌 행은 선삭제
       - voca_label (PK=voca_id, FK ON DELETE CASCADE): 대표에 label이 없고 비대표에 있으면
         (freq_zipf 있는 것 우선/값 큰 것 우선/voca_id 작은 것 순으로) 하나만 이관, 나머지는
         voca 삭제 시 CASCADE로 자동 삭제됨
  2. (Phase B) add_meaning_ids → 대표에 뜻 매핑 추가 (INSERT IGNORE)
  3. 비대표 voca 삭제 → 남은 매핑은 CASCADE 자동 삭제
  4. 고아 뜻/예문 정리 (연결 0인 것만)
  5. 댕글링 검사 (voca_id가 존재하지 않는 voca를 가리키는 행이 0인지 확인)

참고: heyvoca_dict에서 voca.id를 참조하는 테이블은 information_schema로 전수 확인함
(2026-09-04 기준) — voca_book_map, voca_example_map, voca_meaning_map,
admin_voca_book_map, voca_label 5개 전부 FK ON DELETE CASCADE 걸려있어 비대표 삭제 시
매핑행 자체가 댕글링으로 남지는 않는다. 다만 voca_label은 PK가 voca_id 1개뿐이라(1:1)
CASCADE로 그냥 지워지면 대표에 없던 freq_zipf 등 정보가 통째로 유실되므로 삭제 전에
이관이 필요하다.

사용:
  ./heyvoca_back/.venv/bin/python scripts/voca_case_merge.py db/case_merge/auto_merge.csv --dry-run
  ./heyvoca_back/.venv/bin/python scripts/voca_case_merge.py db/case_merge/auto_merge.csv --apply  # 반영
"""
import argparse
import csv
import os
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse

import pymysql

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = PROJECT_ROOT / 'heyvoca_back' / '.env.local'


def log(m):
    print(m, flush=True)


def db_connect():
    url = os.environ.get('DATABASE_URL_DICT')
    if not url:
        env = ENV_PATH.read_text()
        m = re.search(r'DATABASE_URL_DICT=(\S+)', env)
        url = m.group(1) if m else None
    if not url:
        sys.exit('DATABASE_URL_DICT를 찾지 못했습니다.')
    parsed = urlparse(url)
    return pymysql.connect(
        host=os.environ.get('DB_HOST', parsed.hostname or '127.0.0.1'),
        port=int(os.environ.get('DB_PORT', parsed.port or 3310)),
        user=unquote(parsed.username or ''),
        password=unquote(parsed.password or ''),
        database=parsed.path.lstrip('/'),
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


def validate_plan(cur, plan):
    """계획이 만들언질 때의 ID와 현재 DB가 같은지 검증한다."""
    reps = {rep for rep, _, _ in plan}
    merges = {vid for _, ids, _ in plan for vid in ids}
    meanings = {mid for _, _, ids in plan for mid in ids}
    if reps & merges:
        raise RuntimeError(f'대표/삭제 ID 충돌: {sorted(reps & merges)[:10]}')

    voca_ids = reps | merges
    ph = ','.join(['%s'] * len(voca_ids))
    cur.execute(f'SELECT id FROM voca WHERE id IN ({ph})', list(voca_ids))
    found = {r['id'] for r in cur.fetchall()}
    missing = voca_ids - found
    if missing:
        raise RuntimeError(f'현재 DB에 없는 voca ID {len(missing)}개: {sorted(missing)[:10]}')

    if meanings:
        ph = ','.join(['%s'] * len(meanings))
        cur.execute(f'SELECT id FROM voca_meaning WHERE id IN ({ph})', list(meanings))
        found = {r['id'] for r in cur.fetchall()}
        missing = meanings - found
        if missing:
            raise RuntimeError(f'현재 DB에 없는 meaning ID {len(missing)}개: {sorted(missing)[:10]}')


def pick_label_winner(rows):
    """대표에 label이 없을 때 비대표 중 이관할 하나를 고른다.
    기준: freq_zipf가 있는 것 우선 → 값이 큰 것(더 신뢰도 높은 빈도 표본) 우선
         → voca_id가 작은 것(더 먼저 만들어진 행) 우선. rows: [{'voca_id','freq_zipf'}, ...]"""
    def key(r):
        return (r['freq_zipf'] is None, -(r['freq_zipf'] or 0), r['voca_id'])
    return sorted(rows, key=key)[0]


def merge_one(cur, rep, merges, adds):
    """그룹 1개 병합. 반환: (이관 book, 이관 admin, 이관 example, 추가 meaning, 이관 label, 삭제(중복) label)."""
    ph = ','.join(['%s'] * len(merges))

    # 1a. voca_book_map / voca_example_map — 복합 PK, CASCADE. 충돌은 IGNORE로 스킵.
    cur.execute(f'UPDATE IGNORE voca_book_map SET voca_id=%s WHERE voca_id IN ({ph})', [rep, *merges])
    moved_book = cur.rowcount
    cur.execute(f'UPDATE IGNORE voca_example_map SET voca_id=%s WHERE voca_id IN ({ph})', [rep, *merges])
    moved_ex = cur.rowcount

    # 1b. admin_voca_book_map — (voca_id,book_id) 유니크 없음.
    #     대표가 아직 없는 book만 이관 → 남은(충돌) 행은 선삭제(정리 목적. FK는 CASCADE라 없어도 위반은 안 남).
    cur.execute(f"""
        UPDATE admin_voca_book_map a
        LEFT JOIN admin_voca_book_map b ON b.voca_id=%s AND b.book_id=a.book_id
        SET a.voca_id=%s
        WHERE a.voca_id IN ({ph}) AND b.id IS NULL
    """, [rep, rep, *merges])
    moved_admin = cur.rowcount
    cur.execute(f'DELETE FROM admin_voca_book_map WHERE voca_id IN ({ph})', merges)

    # 1c. voca_label — PK=voca_id(1:1), FK ON DELETE CASCADE.
    #     대표에 label이 없고 비대표 중 하나라도 있으면 그중 하나를 이관해서 freq_zipf 등 유실 방지.
    #     대표에 이미 있으면 비대표 label은 그대로 두고 3번에서 voca 삭제 시 CASCADE로 자동 삭제.
    cur.execute(f'SELECT voca_id, freq_zipf FROM voca_label WHERE voca_id IN (%s,{ph})', [rep, *merges])
    label_rows = cur.fetchall()
    rep_label = next((r for r in label_rows if r['voca_id'] == rep), None)
    merge_labels = [r for r in label_rows if r['voca_id'] != rep]
    moved_label = 0
    if rep_label is None and merge_labels:
        winner = pick_label_winner(merge_labels)
        cur.execute('UPDATE voca_label SET voca_id=%s WHERE voca_id=%s', (rep, winner['voca_id']))
        moved_label = cur.rowcount
    deleted_label = len(merge_labels) - moved_label  # 나머지는 3번 CASCADE로 삭제됨(별도 DELETE 불필요)

    # 2. 새 의미 보존 (Phase B)
    added = 0
    for mid in adds:
        cur.execute('INSERT IGNORE INTO voca_meaning_map (voca_id, meaning_id) VALUES (%s,%s)', (rep, mid))
        added += cur.rowcount

    # 3. 비대표 voca 삭제 (남은 voca_book_map/voca_meaning_map/voca_example_map/voca_label은 CASCADE)
    cur.execute(f'DELETE FROM voca WHERE id IN ({ph})', merges)

    return moved_book, moved_admin, moved_ex, added, moved_label, deleted_label


def counts(cur):
    out = {}
    for t in ('voca', 'voca_meaning', 'voca_example', 'voca_label'):
        cur.execute(f'SELECT COUNT(*) c FROM {t}')
        out[t] = cur.fetchone()['c']
    return out


# heyvoca_dict에서 voca.id를 참조하는(voca_id 컬럼을 가진) 테이블 전부.
# information_schema.KEY_COLUMN_USAGE로 전수 조회해 확정함(2026-09-04) — 아래 목록과
# 다른 컬럼이 새로 생기면 이 스크립트도 같이 손봐야 한다.
DICT_VOCA_ID_TABLES = (
    'voca_book_map', 'voca_example_map', 'voca_meaning_map',
    'admin_voca_book_map', 'voca_label',
)


def estimate_label_impact(cur, plan):
    """dry-run용: 실제 UPDATE 없이 label 이관/삭제(중복) 예상 건수를 계산."""
    all_ids = set()
    for rep, merges, _ in plan:
        all_ids.add(rep)
        all_ids.update(merges)
    ph = ','.join(['%s'] * len(all_ids))
    cur.execute(f'SELECT voca_id, freq_zipf FROM voca_label WHERE voca_id IN ({ph})', list(all_ids))
    labels = {r['voca_id']: r['freq_zipf'] for r in cur.fetchall()}

    moved = deleted = rescued_groups = 0
    for rep, merges, _ in plan:
        merge_ids = [vid for vid in merges if vid in labels]
        if not merge_ids:
            continue
        if rep in labels:
            deleted += len(merge_ids)
        else:
            moved += 1
            rescued_groups += 1
            deleted += len(merge_ids) - 1
    return moved, deleted, rescued_groups


def check_dangling(cur):
    """병합 후 voca_id가 존재하지 않는 voca를 가리키는 행이 있는지 확인."""
    log('\n[댕글링 검사] 존재하지 않는 voca_id를 참조하는 행')
    total = 0
    for t in DICT_VOCA_ID_TABLES:
        cur.execute(f'SELECT COUNT(*) c FROM {t} tt LEFT JOIN voca v ON v.id=tt.voca_id WHERE v.id IS NULL')
        c = cur.fetchone()['c']
        total += c
        log(f'  {t:<22} {c:,}건')
    if total:
        log(f'  ! 총 {total:,}건 댕글링 발견 — 확인 필요')
    else:
        log('  댕글링 없음 (정상)')
    return total


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('plan_csv', nargs='+')
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument('--dry-run', action='store_true')
    mode.add_argument('--apply', action='store_true')
    args = ap.parse_args()

    plan = []
    for path in args.plan_csv:
        plan.extend(load_plan(path))
    n_rep = len(plan)
    n_del = sum(len(m) for _, m, _ in plan)
    n_add = sum(len(a) for _, _, a in plan)
    log(f'계획: 대표 {n_rep:,}그룹 / 삭제 {n_del:,}개 / 새의미 추가 {n_add:,}')

    conn = db_connect()
    cur = conn.cursor()
    validate_plan(cur, plan)
    log('preflight: 모든 voca/meaning ID 일치')
    before = counts(cur)

    if args.dry_run:
        # dry-run: 이관 매핑 규모만 집계 (변경 없음)
        all_merge = [x for _, m, _ in plan for x in m]
        ph = ','.join(['%s'] * len(all_merge))
        for tbl, label in (('voca_book_map', '단어장'), ('admin_voca_book_map', '서점'),
                           ('voca_example_map', '예문')):
            cur.execute(f'SELECT COUNT(*) c FROM {tbl} WHERE voca_id IN ({ph})', all_merge)
            log(f'  이관 대상 {label} 매핑: {cur.fetchone()["c"]:,}')

        moved, deleted, rescued = estimate_label_impact(cur, plan)
        log(f'  label 이관(freq_zipf 등 보존): {moved:,}건 (유실 방지 그룹 {rescued:,}개)')
        log(f'  label 삭제(대표에 이미 있어 중복, voca 삭제 시 CASCADE): {deleted:,}건')

        log('\n[dry-run] 변경 없음. --apply 로 반영.')
        conn.close()
        return

    log('\n[apply] 병합 시작...')
    tb = ta = te = tadd = tl_moved = tl_deleted = 0
    try:
        for rep, merges, adds in plan:
            b, a, e, ad, lm, ld = merge_one(cur, rep, merges, adds)
            tb += b; ta += a; te += e; tadd += ad; tl_moved += lm; tl_deleted += ld
        log(f'  이관: 단어장 {tb:,} / 서점 {ta:,} / 예문 {te:,}, 새의미 추가 {tadd:,}')
        log(f'  label: 이관 {tl_moved:,} / 삭제(중복) {tl_deleted:,}')
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

    dangling = check_dangling(cur)
    conn.close()
    if dangling:
        sys.exit(1)


if __name__ == '__main__':
    main()
