#!/usr/bin/env python3
"""라벨 매칭률 측정 (읽기 전용) — 스키마 확정 전에 실제 커버리지를 먼저 본다.

각 라벨 소스가 우리 사전(voca) 단어를 얼마나 덮는지 측정한다.
DB를 변경하지 않으며, voca_label 스키마를 정하기 위한 사전 조사용이다.

소스:
  CEFR   : CEFR-J(A1~B2) + Octanove(C1/C2)  — db/refdata/
  freq   : wordfreq (Zipf)
  POS    : spaCy + WordNet
  lemma  : spaCy

매칭 전략은 3단계로 올려가며 각 단계의 개선폭을 본다:
  1) 원문 그대로   2) 소문자화   3) 소문자 + lemma(원형)

사용법:
  ./heyvoca_back/.venv/bin/python scripts/label_coverage.py
"""
import csv
import os
import re
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import unquote

import pymysql
import spacy
from nltk.corpus import wordnet as wn
from wordfreq import zipf_frequency

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = PROJECT_ROOT / 'heyvoca_back' / '.env.local'
REF_DIR = PROJECT_ROOT / 'db' / 'refdata'


def log(m):
    print(m, flush=True)


def db_connect():
    env = ENV_PATH.read_text()
    m = re.search(r'DATABASE_URL_DICT=mysql\+pymysql://([^:]+):([^@]+)@[^:]+:\d+/(\S+)', env)
    user, pw, db = m.group(1), unquote(m.group(2)), m.group(3).strip()
    return pymysql.connect(
        host=os.environ.get('DB_HOST', '127.0.0.1'),
        port=int(os.environ.get('DB_PORT', 3310)),
        user=user, password=pw, database=db,
        charset='utf8mb4', cursorclass=pymysql.cursors.DictCursor,
    )


def load_cefr():
    """CEFR-J(A1~B2) + Octanove(C1/C2) → {소문자 headword: 등급}.

    같은 단어가 여러 등급/품사로 있으면 더 쉬운 등급을 채택한다
    (학습자가 처음 만나는 수준이 그 단어의 실질 난이도이므로).
    """
    order = {'A1': 1, 'A2': 2, 'B1': 3, 'B2': 4, 'C1': 5, 'C2': 6}
    cefr = {}

    def add(word, level):
        w = (word or '').strip().lower()
        if not w or level not in order:
            return
        if w not in cefr or order[level] < order[cefr[w]]:
            cefr[w] = level

    for name in ('cefrj_wordlist_ver1.6.csv', 'octanove-vocabulary-profile-c1c2-1.0.csv'):
        path = REF_DIR / name
        if not path.exists():
            sys.exit(f'{path} 없음')
        for row in csv.DictReader(open(path, encoding='utf-8')):
            add(row['headword'], (row.get('CEFR') or '').strip())
    return cefr


def main():
    log('참조 데이터 로딩...')
    cefr = load_cefr()
    log(f'  CEFR 표제어: {len(cefr):,}개 (CEFR-J A1~B2 + Octanove C1/C2)')

    nlp = spacy.load('en_core_web_sm', disable=['ner', 'parser'])

    conn = db_connect()
    with conn.cursor() as c:
        c.execute('SELECT id, word FROM voca')
        vocas = c.fetchall()
    conn.close()
    total = len(vocas)
    log(f'  voca 단어: {total:,}개\n')

    log('매칭 측정 중...')
    stat = Counter()
    cefr_dist = Counter()
    unmatched_samples = []

    # spaCy를 배치로 돌려 lemma/POS 확보 (단어 단위 입력)
    words = [v['word'] for v in vocas]
    docs = nlp.pipe(words, batch_size=1000)

    for word, doc in zip(words, docs):
        w = word.strip()
        lower = w.lower()
        tok = doc[0] if len(doc) else None
        lemma = tok.lemma_.lower() if tok else lower

        # --- CEFR: 3단계로 올려가며 매칭 ---
        if w in cefr:
            stat['cefr_exact'] += 1
            hit = cefr[w]
        elif lower in cefr:
            stat['cefr_lower'] += 1
            hit = cefr[lower]
        elif lemma in cefr:
            stat['cefr_lemma'] += 1
            hit = cefr[lemma]
        else:
            hit = None
            if len(unmatched_samples) < 25:
                unmatched_samples.append(w)
        if hit:
            stat['cefr_total'] += 1
            cefr_dist[hit] += 1

        # --- 빈도 (wordfreq) ---
        # 다단어 표현은 wordfreq가 0을 주므로 첫 단어 기준으로 대체 측정
        z = zipf_frequency(lower, 'en')
        if z > 0:
            stat['freq'] += 1

        # --- POS / lemma (spaCy) ---
        if tok and tok.pos_ not in ('X', 'SPACE'):
            stat['pos_spacy'] += 1
        if tok and tok.lemma_:
            stat['lemma'] += 1

        # --- POS / 뜻 우선순위 (WordNet) ---
        syns = wn.synsets(lemma.replace(' ', '_'))
        if syns:
            stat['wordnet'] += 1

    # ---------- 리포트 ----------
    def pct(n):
        return f'{n:>6,} / {total:,}  ({n/total*100:5.1f}%)'

    log('\n' + '=' * 58)
    log(f'{"라벨 매칭률 (voca " + f"{total:,}개 기준)":^54}')
    log('=' * 58)
    log(f'  CEFR 등급      {pct(stat["cefr_total"])}')
    log(f'      ├ 원문 일치  {stat["cefr_exact"]:>6,}')
    log(f'      ├ 소문자화   {stat["cefr_lower"]:>6,}')
    log(f'      └ lemma 매칭 {stat["cefr_lemma"]:>6,}   ← 원형 매칭으로 추가 확보')
    log(f'  사용빈도(zipf) {pct(stat["freq"])}')
    log(f'  품사 (spaCy)   {pct(stat["pos_spacy"])}')
    log(f'  원형 (lemma)   {pct(stat["lemma"])}')
    log(f'  WordNet(품사/뜻){pct(stat["wordnet"])}')
    log('=' * 58)

    log('\nCEFR 등급 분포:')
    for lv in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'):
        n = cefr_dist[lv]
        bar = '█' * int(n / 60) if n else ''
        log(f'  {lv}  {n:>6,}  {bar}')
    miss = total - stat['cefr_total']
    log(f'  미매칭 {miss:>6,}  ({miss/total*100:.1f}%)  ← LLM 보강 대상')

    log('\nCEFR 미매칭 샘플:')
    log('  ' + ', '.join(unmatched_samples[:20]))


if __name__ == '__main__':
    main()
