#!/usr/bin/env python3
"""단어 데이터 감사 — 삭제/교정 후보를 분류해 리포트만 생성 (읽기 전용).

DB를 변경하지 않는다. 산출물(CSV)을 사람이 검토한 뒤 voca_cleanup.py가 실제 정리를 수행한다.

분류:
  - trash   : 명백한 쓰레기 → 삭제 (한글 / '+' / page마커 / 꼬리하이픈-중복)
  - fix     : 꼬리하이픈인데 원형이 DB에 없음 → 하이픈 제거 교정 (삭제하면 단어 소실)
  - keep    : 규칙에 걸렸으나 보존 (공백 표현 등)

꼬리하이픈은 세 갈래로 분해된다:
  1) 원형이 이미 DB에 존재       → trash (지워도 손실 0)
  2) 원형 없음 + Wiktionary 있음  → fix   (하이픈 떼서 살림)
  3) 원형 없음 + Wiktionary 없음  → llm_review (LLM 배치 판정 대상)

사용법:
  cd heyvoca_service/
  ./heyvoca_back/.venv/bin/python scripts/voca_audit.py
  ./heyvoca_back/.venv/bin/python scripts/voca_audit.py --no-wiktionary   # API 호출 생략
"""
import argparse
import csv
import os
import re
import sys
import time
from collections import Counter
from pathlib import Path
from urllib.parse import unquote

import pymysql
import requests

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = PROJECT_ROOT / 'heyvoca_back' / '.env.local'
OUT_DIR = PROJECT_ROOT / 'db' / 'cleanup'

WIKTIONARY_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en/{}'
WIKTIONARY_DELAY = 0.2  # 초 — 공개 무료 API 예의상 간격


def log(msg):
    print(msg, flush=True)


def db_connect():
    """로컬 docker MySQL(heyvoca_dict)에 접속. 접속 정보는 .env.local에서 읽는다."""
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


# ---------- 분류 규칙 ----------

RE_HANGUL = re.compile(r'[가-힣]')
RE_PAGE = re.compile(r'^page\s?\d+$', re.IGNORECASE)

# 접사(prefix) — 'ex-', 're-' 처럼 꼬리하이픈으로 표기된 접두사.
# Wiktionary는 'ex'/'re'/'pre'를 독립 단어로도 수록하므로 API로는 구분이 안 된다.
# 단어장 학습 항목이 아니므로 삭제 대상(사용자 확인 완료).
AFFIXES = {
    'a', 'anti', 'auto', 'bi', 'co', 'de', 'dis', 'en', 'ex', 'extra', 'fore',
    'hyper', 'il', 'im', 'in', 'inter', 'ir', 'micro', 'mid', 'mis', 'mono',
    'multi', 'non', 'over', 'post', 'pre', 'pro', 're', 'semi', 'sub', 'super',
    'tele', 'trans', 'tri', 'un', 'under', 'uni',
}


def classify(word):
    """단어 하나를 보고 사유를 반환. 정상이면 None.

    공백 표현(clinical trial)과 중간 하이픈(e-commerce)은 규칙에 걸리지 않는다.
    """
    w = word.strip()
    if RE_HANGUL.search(w):
        return 'hangul'          # 한글 섞임
    if '+' in w:
        return 'plus'            # acro+phobia
    if RE_PAGE.match(w):
        return 'page'            # page60
    if w.endswith('-'):
        return 'tail_hyphen'     # abandon- / re- / -----22----
    return None


def check_wiktionary(word, session):
    """Wiktionary(dictionaryapi.dev)에 단어가 실재하는지. True/False/None(오류)."""
    try:
        r = session.get(WIKTIONARY_URL.format(requests.utils.quote(word)), timeout=10)
        if r.status_code == 200:
            return True
        if r.status_code == 404:
            return False
        return None
    except requests.RequestException:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--no-wiktionary', action='store_true',
                    help='Wiktionary API 호출 생략 (오프라인 분류만)')
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    conn = db_connect()

    with conn.cursor() as c:
        c.execute('SELECT id, word FROM voca')
        vocas = c.fetchall()
        # 원형 존재 여부 판정용 — 전체 단어 집합 (대소문자 무시: MySQL 기본 collation과 동일)
        all_words = {v['word'].strip().lower() for v in vocas}

        # 뜻/예문/단어장 소속 여부
        c.execute('SELECT DISTINCT voca_id FROM voca_meaning_map')
        has_meaning = {r['voca_id'] for r in c.fetchall()}
        c.execute('SELECT DISTINCT voca_id FROM admin_voca_book_map')
        in_admin_book = {r['voca_id'] for r in c.fetchall()}

    log(f'voca 전체: {len(vocas):,}개')

    # 1) 규칙 분류
    flagged = []
    for v in vocas:
        reason = classify(v['word'])
        if reason:
            flagged.append({**v, 'reason': reason})
    log(f'규칙에 걸린 후보: {len(flagged):,}개')

    # 2) 꼬리하이픈 분해 — 원형이 DB에 있으면 순수 중복(삭제), 없으면 교정 후보
    fix_candidates = []
    for f in flagged:
        if f['reason'] != 'tail_hyphen':
            continue
        stem = f['word'].strip().rstrip('-').strip()
        # 한글/기호 섞인 쓰레기(-----22----, q비율-)는 원형이 단어가 아님 → 교정 대상 아님
        if not stem or not re.fullmatch(r"[A-Za-z][A-Za-z'\- ]*", stem):
            f['reason'] = 'tail_hyphen_garbage'
            continue
        if stem.lower() in AFFIXES:
            f['reason'] = 'affix'             # re-, pre- 등 접두사 → 삭제
        elif stem.lower() in all_words:
            f['reason'] = 'tail_hyphen_dup'   # 원형 이미 존재 → 삭제해도 손실 0
        else:
            f['reason'] = 'tail_hyphen_orphan'  # 원형 없음 → 교정으로 살려야 함
            f['fixed_word'] = stem
            fix_candidates.append(f)

    log(f'  └ 꼬리하이픈 중 "원형 없음"(교정 후보): {len(fix_candidates)}개')

    # 3) 교정 후보만 Wiktionary 검증 (실재 단어면 교정, 아니면 LLM 판정)
    if not args.no_wiktionary and fix_candidates:
        log(f'Wiktionary 검증 시작 ({len(fix_candidates)}개)...')
        session = requests.Session()
        for i, f in enumerate(fix_candidates, 1):
            ok = check_wiktionary(f['fixed_word'], session)
            f['wiktionary'] = {True: 'found', False: 'not_found', None: 'error'}[ok]
            time.sleep(WIKTIONARY_DELAY)
            if i % 10 == 0:
                log(f'  {i}/{len(fix_candidates)}')
    else:
        for f in fix_candidates:
            f['wiktionary'] = 'skipped'

    # 4) 최종 분류 — 삭제 / 교정 / LLM판정
    delete_rows, fix_rows, llm_review = [], [], []
    for f in flagged:
        row = {
            'voca_id': f['id'],
            'word': f['word'],
            'reason': f['reason'],
            'has_meaning': f['id'] in has_meaning,
            'in_admin_book': f['id'] in in_admin_book,   # 🔴 NO ACTION FK — 선삭제 필요
            'fixed_word': f.get('fixed_word', ''),
            'wiktionary': f.get('wiktionary', ''),
        }
        if f['reason'] != 'tail_hyphen_orphan':
            delete_rows.append(row)          # 쓰레기/중복/접사 → 삭제
        elif f.get('wiktionary') == 'not_found':
            llm_review.append(row)           # 실재 불확실 → LLM 판정 (삭제 보류)
        else:
            fix_rows.append(row)             # 실재 단어 → 하이픈 제거 교정

    # 5) 리포트 출력
    def write_csv(name, rows):
        path = OUT_DIR / name
        with open(path, 'w', newline='', encoding='utf-8-sig') as fp:
            w = csv.DictWriter(fp, fieldnames=[
                'voca_id', 'word', 'reason', 'has_meaning',
                'in_admin_book', 'fixed_word', 'wiktionary'])
            w.writeheader()
            w.writerows(rows)
        log(f'  → {path.relative_to(PROJECT_ROOT)} ({len(rows)}행)')

    log('\n리포트 생성:')
    write_csv('report_delete.csv', delete_rows)
    write_csv('report_fix.csv', fix_rows)
    if llm_review:
        write_csv('report_llm_review.csv', llm_review)

    # 6) 요약
    reasons = Counter(r['reason'] for r in delete_rows)
    blocked = sum(1 for r in delete_rows if r['in_admin_book'])
    summary = [
        '=' * 46,
        f"voca 전체            : {len(vocas):,}",
        f"삭제 대상            : {len(delete_rows):,}",
        *[f"    - {k:<22}: {v}" for k, v in reasons.most_common()],
        f"교정 대상(하이픈 제거): {len(fix_rows):,}",
        f"LLM 판정 필요        : {len(llm_review):,}",
        '-' * 46,
        f"삭제 대상 중 서점 판매중: {blocked}  (>0이면 admin_voca_book_map 선삭제 필요)",
        '=' * 46,
    ]
    text = '\n'.join(summary)
    log('\n' + text)
    (OUT_DIR / 'summary.txt').write_text(text + '\n', encoding='utf-8')
    conn.close()


if __name__ == '__main__':
    main()
