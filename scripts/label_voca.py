#!/usr/bin/env python3
"""단어 라벨링 배치 — voca_label 테이블을 채운다.

외부 표준 데이터로 각 단어에 난이도(CEFR)/빈도/품사/원형/다의어수를 붙인다.
전부 로컬·오프라인 처리이며 소스는 무료·상업 사용 가능:

  CEFR-J (TUFS, A1~B2)      db/refdata/cefrj_wordlist_ver1.6.csv
  Octanove (CC BY-SA, C1/C2) db/refdata/octanove-vocabulary-profile-c1c2-1.0.csv
  wordfreq / spaCy / WordNet  pip 패키지

CEFR는 워드리스트 매칭이 26%뿐이라(리스트가 8,827개, 사전은 5만 개),
나머지는 빈도로 추정한다. CEFR 등급별 평균 Zipf가 A1 5.01 → C2 2.81로
단조 감소하므로 빈도로 등급을 매겨도 난이도 순서가 유지된다.
어느 쪽으로 채웠는지는 cefr_source로 구분한다.

사용법:
  ./heyvoca_back/.venv/bin/python scripts/label_voca.py             # 실행
  ./heyvoca_back/.venv/bin/python scripts/label_voca.py --dry-run   # 미리보기
"""
import argparse
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

CEFR_ORDER = {'A1': 1, 'A2': 2, 'B1': 3, 'B2': 4, 'C1': 5, 'C2': 6}

# 빈도(Zipf) → CEFR 추정 경계.
# 실측한 등급별 평균 Zipf(A1 5.01 / A2 4.48 / B1 4.11 / B2 3.69 / C1 3.25 / C2 2.81)의
# 중간값을 경계로 잡았다.
FREQ_BANDS = [(4.75, 'A1'), (4.30, 'A2'), (3.90, 'B1'), (3.47, 'B2'), (3.03, 'C1')]

# WordNet 품사 → spaCy 표기로 통일
WN_POS = {'n': 'NOUN', 'v': 'VERB', 'a': 'ADJ', 's': 'ADJ', 'r': 'ADV'}


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


def load_cefr():
    """{소문자 headword: (등급, 출처)}. 같은 단어가 여러 등급이면 더 쉬운 쪽을 채택
    (학습자가 그 단어를 처음 만나는 수준이 실질 난이도이므로)."""
    out = {}
    for name, src in (('cefrj_wordlist_ver1.6.csv', 'cefrj'),
                      ('octanove-vocabulary-profile-c1c2-1.0.csv', 'octanove')):
        path = REF_DIR / name
        if not path.exists():
            sys.exit(f'{path} 없음 — 참조 데이터를 먼저 받으세요.')
        for row in csv.DictReader(open(path, encoding='utf-8')):
            w = (row['headword'] or '').strip().lower()
            lv = (row.get('CEFR') or '').strip()
            if not w or lv not in CEFR_ORDER:
                continue
            if w not in out or CEFR_ORDER[lv] < CEFR_ORDER[out[w][0]]:
                out[w] = (lv, src)
    return out


def zipf_of(word):
    """단어의 Zipf 빈도. 다단어 표현('clinical trial')은 wordfreq가 0을 주므로
    구성 단어 중 가장 희귀한 값을 쓴다 — 표현의 난이도는 가장 어려운 단어가 좌우한다."""
    w = word.strip().lower()
    z = zipf_frequency(w, 'en')
    if z > 0:
        return round(z, 2)
    parts = [p for p in re.split(r"[\s\-']+", w) if p]
    zs = [zipf_frequency(p, 'en') for p in parts]
    zs = [z for z in zs if z > 0]
    return round(min(zs), 2) if zs else None


def head_lemma_pos(toks, fallback):
    """원형과 품사. 다단어 표현('clinical trial')은 첫 토큰만 보면 안 된다.

    원형: 토큰별 원형을 이어붙인다 ('Intensive Care Unit' → 'intensive care unit').
    품사: 표현의 핵(head)을 따른다.
      - 'go home', 'sign up' 처럼 동사로 시작하면 동사구 → VERB
      - 그 외 영어 명사구는 마지막 단어가 핵 → 'clinical trial' = trial(NOUN)
    """
    if not toks:
        return fallback, None
    lemma = ' '.join(t.lemma_.lower() for t in toks if t.lemma_) or fallback

    if len(toks) == 1:
        pos = toks[0].pos_
    elif toks[0].pos_ in ('VERB', 'AUX'):
        pos = 'VERB'                 # 동사구: go home / sign up
    else:
        pos = toks[-1].pos_          # 명사구: 마지막 단어가 핵
    return lemma, (pos if pos not in ('X', 'SPACE') else None)


def estimate_cefr(zipf):
    """빈도로 CEFR 등급 추정. 빈도를 모르면(코퍼스에 없음) 가장 희귀한 C2로 본다."""
    if zipf is None:
        return 'C2'
    for threshold, level in FREQ_BANDS:
        if zipf >= threshold:
            return level
    return 'C2'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true', help='DB에 쓰지 않고 통계만 출력')
    args = ap.parse_args()

    log('참조 데이터 로딩...')
    cefr_map = load_cefr()
    log(f'  CEFR 표제어 {len(cefr_map):,}개')
    nlp = spacy.load('en_core_web_sm', disable=['ner', 'parser'])

    conn = db_connect()
    with conn.cursor() as c:
        c.execute('SELECT id, word FROM voca')
        vocas = c.fetchall()
    log(f'  voca {len(vocas):,}개\n')

    log('라벨 계산 중...')
    rows = []
    stat = Counter()
    words = [v['word'] for v in vocas]

    for v, doc in zip(vocas, nlp.pipe(words, batch_size=1000)):
        word = v['word'].strip()
        lower = word.lower()
        toks = [t for t in doc if not t.is_space]

        lemma, pos = head_lemma_pos(toks, lower)

        # WordNet — 품사 교차검증 + 다의어 개수
        syns = wn.synsets(lemma.replace(' ', '_')) or wn.synsets(lower.replace(' ', '_'))
        pos_wn = WN_POS.get(syns[0].pos()) if syns else None
        sense_count = len(syns) or None

        zipf = zipf_of(word)

        # CEFR — 원문 → 소문자 → 원형 순으로 워드리스트 조회, 없으면 빈도로 추정
        hit = cefr_map.get(word) or cefr_map.get(lower) or cefr_map.get(lemma)
        if hit:
            cefr, source = hit
            stat['verified'] += 1
        elif zipf is None:
            # 코퍼스에도 없는 단어(heterozygously, notochord…). 극희귀어로 보되
            # 빈도 근거가 없다는 걸 source에 남겨 추후 분석/제외가 가능하게 한다.
            cefr, source = 'C2', 'no-freq'
            stat['no_freq'] += 1
        else:
            cefr, source = estimate_cefr(zipf), 'freq-est'
            stat['estimated'] += 1

        stat[f'cefr_{cefr}'] += 1
        if pos:
            stat['has_pos'] += 1
        if zipf is not None:
            stat['has_zipf'] += 1
        if pos and pos_wn and pos != pos_wn:
            stat['pos_mismatch'] += 1   # spaCy와 WordNet 품사 불일치 → 참고용

        rows.append((v['id'], cefr, source, zipf, pos, pos_wn, lemma, sense_count))

    # ---------- 리포트 ----------
    total = len(rows)
    log('\n' + '=' * 52)
    log(f'  라벨링 결과 ({total:,}개)')
    log('=' * 52)
    log(f'  CEFR 워드리스트 검증  {stat["verified"]:>6,}  ({stat["verified"]/total*100:4.1f}%)')
    log(f'  CEFR 빈도 추정        {stat["estimated"]:>6,}  ({stat["estimated"]/total*100:4.1f}%)')
    log(f'  CEFR 빈도근거 없음    {stat["no_freq"]:>6,}  ({stat["no_freq"]/total*100:4.1f}%)  극희귀어')
    log(f'  빈도(zipf) 확보       {stat["has_zipf"]:>6,}  ({stat["has_zipf"]/total*100:4.1f}%)')
    log(f'  품사 확보             {stat["has_pos"]:>6,}  ({stat["has_pos"]/total*100:4.1f}%)')
    log(f'  품사 불일치(spaCy≠WN) {stat["pos_mismatch"]:>6,}  (참고)')
    log('-' * 52)
    log('  CEFR 등급 분포:')
    for lv in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'):
        n = stat[f'cefr_{lv}']
        log(f'    {lv}  {n:>6,}  {"█" * int(n / 300)}')
    log('=' * 52)

    if args.dry_run:
        log('\n[dry-run] DB에 쓰지 않았습니다.')
        conn.close()
        return

    log('\nvoca_label 저장 중...')
    with conn.cursor() as c:
        # updated_at은 모델에서 Python default라 raw SQL 경로에선 직접 넣어야 한다.
        c.executemany("""
            INSERT INTO voca_label
                (voca_id, cefr, cefr_source, freq_zipf, pos, pos_wordnet, lemma,
                 sense_count, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
            ON DUPLICATE KEY UPDATE
                cefr=VALUES(cefr), cefr_source=VALUES(cefr_source),
                freq_zipf=VALUES(freq_zipf), pos=VALUES(pos),
                pos_wordnet=VALUES(pos_wordnet), lemma=VALUES(lemma),
                sense_count=VALUES(sense_count), updated_at=NOW()
        """, rows)
        conn.commit()
        c.execute('SELECT COUNT(*) AS c FROM voca_label')
        log(f'  완료 — voca_label {c.fetchone()["c"]:,}행')
    conn.close()


if __name__ == '__main__':
    main()
