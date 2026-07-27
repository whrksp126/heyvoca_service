#!/usr/bin/env python3
"""대소문자 중복 병합 감사 — 그룹별 표기/뜻/매핑을 추출해 리포트만 생성 (읽기 전용).

DB를 변경하지 않는다. 산출물(CSV)을 LLM 통합/사람 검토에 넘긴 뒤
voca_case_merge.py가 실제 병합을 수행한다.

배경 (실측):
  - 중복 그룹 1,159개 (2,355 voca 행). 전부 소문자형이 존재.
  - 대문자형은 예문 0개, 사용자 보유 0개 (병합 시 예문 이관 불필요).
  - 뜻은 "형식만 다른 경우"(제독 vs ① 해군 대장 ② 제독)가 대부분이라
    문자열 비교로는 same/different 판별 불가 → LLM 판정 필요.

대표 표기 규칙:
  - 일반 단어  : 소문자형을 대표
  - 고유명사   : 대문자형을 대표 (heuristic 1차 분류 → LLM 확정)

산출물 (db/case_merge/):
  groups.csv      : 그룹별 두 표기의 뜻 나란히 (LLM 입력 + 사람 검토)
  summary.txt     : 규모 요약

사용법:
  cd heyvoca_service/
  ./heyvoca_back/.venv/bin/python scripts/voca_case_merge_audit.py
"""
import csv
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


def log(m):
    print(m, flush=True)


def db_connect():
    env = ENV_PATH.read_text()
    m = re.search(r'DATABASE_URL_DICT=mysql\+pymysql://([^:]+):([^@]+)@[^:]+:\d+/(\S+)', env)
    if not m:
        sys.exit(f'DATABASE_URL_DICT를 {ENV_PATH}에서 찾지 못했습니다.')
    return pymysql.connect(
        host=os.environ.get('DB_HOST', '127.0.0.1'),
        port=int(os.environ.get('DB_PORT', 3310)),
        user=m.group(1), password=unquote(m.group(2)), database=m.group(3).strip(),
        charset='utf8mb4', cursorclass=pymysql.cursors.DictCursor,
    )


def _norm(s):
    """뜻 비교용 정규화 — 번호/기호/공백 제거."""
    return re.sub(r'[①-⑳0-9().·\-\s│|~/]', '', s)


def classify_group(is_proper, rep_meanings, merge_meanings):
    """그룹 처리 방식 결정.

      auto        : 병합뜻이 대표에 이미 있음(형식중복) or 병합뜻 없음 → LLM 없이 자동 병합
      llm-proper  : 고유명사 → LLM이 대표 확정 + 유효 뜻만 정리
      llm-sense   : 병합뜻에 새 의미 가능성 → LLM이 보존/폐기 판정
    """
    if is_proper:
        return 'llm-proper'
    mrg = {_norm(x) for x in merge_meanings if _norm(x)}
    if not mrg:
        return 'auto'
    rep = {_norm(x) for x in rep_meanings if _norm(x)}
    rep_blob = ''.join(sorted(rep))
    new = [t for t in mrg
           if t not in rep and t not in rep_blob
           and not any(t in rr or rr in t for rr in rep)]
    return 'llm-sense' if new else 'auto'


def looks_proper_noun(variants, meanings_by_id):
    """고유명사 1차 heuristic (LLM이 최종 확정).

    신호:
      - 대문자형만 존재하고 소문자형 표기가 첫 글자만 대문자 (Aaron, African)
      - 뜻에 '이름/인명/국가/도시/~족/~인' 등 고유명사 단서
    """
    proper_hint = re.compile(r'이름|인명|국가|나라|도시|대륙|~?족|아메리카|아프리카|유럽|아시아')
    for vid, w in variants:
        if w[0].isupper() and w[1:].islower():   # Aaron 꼴
            allm = ' '.join(meanings_by_id.get(vid, ()))
            if proper_hint.search(allm):
                return True
    return False


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    conn = db_connect()
    cur = conn.cursor()

    # 1) 중복 그룹의 모든 voca
    cur.execute("""
        SELECT v.id, v.word FROM voca v
        WHERE LOWER(v.word) IN (
            SELECT lw FROM (
                SELECT LOWER(word) lw FROM voca
                GROUP BY LOWER(word) HAVING COUNT(DISTINCT BINARY word) > 1
            ) x)
    """)
    rows = cur.fetchall()
    by_lower = defaultdict(list)
    for r in rows:
        by_lower[r['word'].lower()].append((r['id'], r['word']))
    ids = [r['id'] for r in rows]
    ph = ','.join(['%s'] * len(ids))

    # 2) 뜻 / 예문수 / 단어장 매핑수 / 서점 매핑수
    cur.execute(f"""SELECT mm.voca_id, m.meaning FROM voca_meaning_map mm
                    JOIN voca_meaning m ON mm.meaning_id=m.id WHERE mm.voca_id IN ({ph})""", ids)
    meanings = defaultdict(list)
    for r in cur.fetchall():
        meanings[r['voca_id']].append(r['meaning'])

    def count_map(table):
        cur.execute(f"SELECT voca_id, COUNT(*) c FROM {table} WHERE voca_id IN ({ph}) GROUP BY voca_id", ids)
        return {r['voca_id']: r['c'] for r in cur.fetchall()}

    ex_n = count_map('voca_example_map')
    book_n = count_map('voca_book_map')
    admin_n = count_map('admin_voca_book_map')

    # 3) 그룹별 리포트 행 생성
    out_rows = []
    stat = Counter()
    for lw, variants in sorted(by_lower.items()):
        lower_v = [(vid, w) for vid, w in variants if w == lw]
        other_v = [(vid, w) for vid, w in variants if w != lw]
        is_proper = looks_proper_noun(variants, meanings)

        # 대표: 고유명사=대문자형(첫 other), 일반=소문자형
        if is_proper and other_v:
            rep_id, rep_word = other_v[0]
            merge_ids = [vid for vid, _ in lower_v] + [vid for vid, _ in other_v[1:]]
            stat['proper_noun'] += 1
        else:
            rep_id, rep_word = (lower_v[0] if lower_v else variants[0])
            merge_ids = [vid for vid, w in variants if vid != rep_id]
            stat['general'] += 1

        rep_meanings = list(dict.fromkeys(meanings.get(rep_id, [])))
        merge_meanings = []
        for mid in merge_ids:
            merge_meanings += meanings.get(mid, [])
        merge_meanings = list(dict.fromkeys(merge_meanings))

        cls = classify_group(is_proper, rep_meanings, merge_meanings)
        stat[cls] += 1

        out_rows.append({
            'class': cls,
            'lower': lw,
            'variants': ' | '.join(w for _, w in variants),
            'rep_word': rep_word,
            'rep_voca_id': rep_id,
            'merge_voca_ids': ','.join(map(str, merge_ids)),
            'rep_meanings': ' / '.join(rep_meanings),
            'merge_meanings': ' / '.join(merge_meanings),
            'rep_examples': ex_n.get(rep_id, 0),
            'merge_examples': sum(ex_n.get(v, 0) for v in merge_ids),
            'merge_book_maps': sum(book_n.get(v, 0) + admin_n.get(v, 0) for v in merge_ids),
        })

    # 4) 저장 — 전체 + 자동/LLM 분리
    fields = ['class', 'lower', 'variants', 'rep_word', 'rep_voca_id',
              'merge_voca_ids', 'rep_meanings', 'merge_meanings',
              'rep_examples', 'merge_examples', 'merge_book_maps']

    def write_csv(name, rows):
        path = OUT_DIR / name
        with open(path, 'w', newline='', encoding='utf-8-sig') as f:
            w = csv.DictWriter(f, fieldnames=fields)
            w.writeheader()
            w.writerows(rows)
        return path

    write_csv('groups.csv', out_rows)
    write_csv('auto_merge.csv', [r for r in out_rows if r['class'] == 'auto'])
    write_csv('llm_review.csv', [r for r in out_rows if r['class'] != 'auto'])

    total_merge_ex = sum(r['merge_examples'] for r in out_rows)
    total_merge_book = sum(r['merge_book_maps'] for r in out_rows)
    summary = [
        '=' * 52,
        f"중복 그룹              : {len(out_rows):,}",
        f"  auto (자동 병합)     : {stat['auto']:,}  ← Phase A",
        f"  llm-sense (새의미 판정): {stat['llm-sense']:,}  ← Phase B",
        f"  llm-proper (고유명사) : {stat['llm-proper']:,}  ← Phase B",
        f"병합될 voca 행         : {sum(len(v)-1 for v in by_lower.values()):,}",
        '-' * 52,
        f"이관할 예문 매핑       : {total_merge_ex}",
        f"이관할 단어장 매핑     : {total_merge_book}",
        '=' * 52,
        "→ db/case_merge/{groups,auto_merge,llm_review}.csv",
    ]
    text = '\n'.join(summary)
    log('\n' + text)
    (OUT_DIR / 'summary.txt').write_text(text + '\n', encoding='utf-8')
    conn.close()


if __name__ == '__main__':
    main()
