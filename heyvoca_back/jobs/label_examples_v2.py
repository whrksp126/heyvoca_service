"""
예문 라벨 v2(cefr/score/grammar) 전량 계산 — 이슈 #16.

정본: heyvoca_service/docs/LEVEL_AND_MEANING_CONTRACT.md §1, 규칙: app/services/example_label.py

  --lang en : heyvoca_dict.voca_example_meta 의 sentence_hash·cefr·score·grammar·label_ver 를 채우고
              호환용 level(1~3)을 cefr 로 다시 채운다(cefr 1–2→1, 3–4→2, 5–6→3).
              meta 행이 없는 예문(강조 태그 없음 등)은 건너뛴다(기존 build_example_meta 와 같은 자격).
  --lang ja : heyvoca_dict_ja.voca_example_ja_meta 를 upsert 한다(없으면 행 생성).

멱등 — 같은 사전이면 몇 번 돌려도 결과가 같다(항상 다시 계산해 덮어씀). --only-missing 이면
label_ver 가 비어 있는(v2 미적용) 행만 처리한다(새로 생성·import 한 예문 보충용).
라벨을 바꾼 뒤에는 사전을 발행해야 다른 환경에 퍼진다(.claude/rules/db-migration.md "사전 데이터만 갱신").

사용법(컨테이너 안):
  docker exec heyvoca_back_local python3 jobs/label_examples_v2.py --lang en            # dry-run(분포만)
  docker exec heyvoca_back_local python3 jobs/label_examples_v2.py --lang en --apply
  docker exec heyvoca_back_local python3 jobs/label_examples_v2.py --lang ja --apply --samples /tmp/label_samples_ja.jsonl
"""

import argparse
import json
import os
import random
import re
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db
from app.models.models import (
    Voca, VocaExample, VocaExampleMeta, VocaLabel, VocaJa, VocaExampleJa, VocaExampleJaMeta,
)
from app.services import example_label as L
from app.services.sentence_puzzle import normalize_sentence_text, sentence_hash
from app.services.skill_level import cefr_name
from app.utils.dict_lang import use_dict_lang

_TAG_RE = re.compile(r'<[^>]+>')
_TARGET_INNER_RE = re.compile(r'<strong[^>]*class="target-word"[^>]*>(.*?)</strong\s*>', re.I | re.S)
_BATCH = 1000


def _plain_and_target(exam: str):
    m = _TARGET_INNER_RE.search(exam or '')
    plain = _TAG_RE.sub('', exam or '')
    if not m:
        return plain, '', (None, None)
    target = _TAG_RE.sub('', m.group(1))
    idx = plain.find(target) if target else -1
    return plain, target, ((idx, idx + len(target)) if idx >= 0 else (None, None))


def _print_dist(results):
    c = Counter(r['cefr'] for r in results)
    total = sum(c.values()) or 1
    print('구간 분포:', ', '.join(f"{cefr_name(k)} {c.get(k, 0)} ({c.get(k, 0) * 100 / total:.1f}%)" for k in range(1, 7)))
    g = Counter(t for r in results for t in r['grammar'])
    print('문법 태그 상위:', g.most_common(16))


def _write_samples(results, path, per_band=30, seed=16):
    rng = random.Random(seed)
    with open(path, 'w', encoding='utf-8') as f:
        for band in range(1, 7):
            rows = [r for r in results if r['cefr'] == band]
            for r in rng.sample(rows, min(per_band, len(rows))):
                f.write(json.dumps({'cefr': cefr_name(band), 'score': r['score'], 'grammar': r['grammar'],
                                    'sentence': r['_sentence'], 'translation': r['_ko']},
                                   ensure_ascii=False) + '\n')
    print(f'표본 저장: {path}')


def run_en(apply, only_missing, samples):
    from sqlalchemy import func
    from app.utils.example_tagging import _get_spacy
    nlp = _get_spacy()
    if nlp is None:
        raise SystemExit('spaCy(en_core_web_sm)를 불러오지 못했습니다.')

    rank_lookup, zipf_lookup = {}, {}
    for w, cefr, zipf in (db.session.query(func.lower(Voca.word), VocaLabel.cefr, VocaLabel.freq_zipf)
                          .join(VocaLabel, VocaLabel.voca_id == Voca.id).all()):
        r = L.CEFR_RANK.get(cefr or '')
        if r and (w not in rank_lookup or r < rank_lookup[w]):
            rank_lookup[w] = r
        if zipf is not None and zipf > zipf_lookup.get(w, -1):
            zipf_lookup[w] = zipf
    print(f'단어 등급 {len(rank_lookup)}개 / zipf {len(zipf_lookup)}개')

    q = (db.session.query(VocaExample.id, VocaExample.exam_en, VocaExample.exam_ko)
         .join(VocaExampleMeta, VocaExampleMeta.example_id == VocaExample.id))
    if only_missing:
        q = q.filter(VocaExampleMeta.label_ver.is_(None))
    rows = q.all()
    print(f'대상 {len(rows)}건')

    prepped = [(eid, ko) + _plain_and_target(en) + (en,) for eid, en, ko in rows]
    results = []
    docs = nlp.pipe((p[2] for p in prepped), batch_size=256)
    for (eid, ko, plain, _target, span, en), doc in zip(prepped, docs):
        wc = len(normalize_sentence_text(en).split())
        lab = L.label_en(doc, span, wc, rank_lookup, zipf_lookup)
        lab.update(example_id=eid, sentence_hash=sentence_hash(en), _sentence=plain, _ko=_TAG_RE.sub('', ko or ''))
        results.append(lab)
    _print_dist(results)
    if samples:
        _write_samples(results, samples)
    if not apply:
        print('[dry-run] DB 변경 없음 — --apply 로 반영')
        return
    for i in range(0, len(results), _BATCH):
        chunk = [{'example_id': r['example_id'], 'sentence_hash': r['sentence_hash'], 'cefr': r['cefr'],
                  'score': r['score'], 'grammar': r['grammar'], 'label_ver': L.LABEL_VER,
                  'level': L.legacy_level(r['cefr'])} for r in results[i:i + _BATCH]]
        db.session.bulk_update_mappings(VocaExampleMeta, chunk)
        db.session.commit()
    print(f'반영 {len(results)}건')


def _ja_lexicon():
    lex = {}

    def put(form, rank, lemma):
        if form and (form not in lex or rank < lex[form][0]):
            lex[form] = (rank, lemma)

    rows = (db.session.query(Voca.word, VocaJa.reading, VocaJa.kanji_forms, VocaJa.kana_forms, VocaJa.jlpt,
                             VocaJa.common)
            .join(VocaJa, VocaJa.voca_id == Voca.id).all())
    for word, reading, kanji_forms, kana_forms, jlpt, common in rows:
        # JLPT 밖 단어: JMdict common 표시가 있으면 C1(5), 없으면 C2(6)
        rank = L.JLPT_RANK.get(jlpt or '') or (5 if common else 6)
        put(word, rank, word)
        for f in (kanji_forms or []):
            put((f or {}).get('text') if isinstance(f, dict) else f, rank, word)
        # 읽기(가나)는 동음이의어가 많아 가나 표층에만 쓰인다 — 같은 규칙(쉬운 쪽 우선)으로 넣는다.
        put(reading, rank, word)
        for f in (kana_forms or []):
            put((f or {}).get('text') if isinstance(f, dict) else f, rank, word)
    return lex


def run_ja(apply, only_missing, samples):
    lex = _ja_lexicon()
    print(f'일본어 표기 {len(lex)}개')
    q = (db.session.query(VocaExample.id, VocaExample.exam_en, VocaExample.exam_ko, VocaExampleJa.reading_tokens)
         .outerjoin(VocaExampleJa, VocaExampleJa.example_id == VocaExample.id))
    if only_missing:
        done = {r[0] for r in db.session.query(VocaExampleJaMeta.example_id).all()}
        rows = [r for r in q.all() if r[0] not in done]
    else:
        rows = q.all()
    print(f'대상 {len(rows)}건')
    results = []
    for eid, ja, ko, tokens in rows:
        plain, target, _span = _plain_and_target(ja)
        if not plain:
            continue
        if not tokens:
            tokens = [[ch] for ch in plain]   # 토큰 없는 예문(드묾) — 글자 단위 폴백
        lab = L.label_ja(tokens, target, lex)
        lab.update(example_id=eid, sentence_hash=sentence_hash(ja), _sentence=plain, _ko=_TAG_RE.sub('', ko or ''))
        results.append(lab)
    _print_dist(results)
    if samples:
        _write_samples(results, samples)
    if not apply:
        print('[dry-run] DB 변경 없음 — --apply 로 반영')
        return
    existing = {r[0] for r in db.session.query(VocaExampleJaMeta.example_id).all()}
    keys = ('example_id', 'sentence_hash', 'cefr', 'score', 'word_count', 'rare_count', 'words', 'grammar')
    for i in range(0, len(results), _BATCH):
        chunk = [dict({k: r[k] for k in keys}, label_ver=L.LABEL_VER) for r in results[i:i + _BATCH]]
        upd = [c for c in chunk if c['example_id'] in existing]
        ins = [c for c in chunk if c['example_id'] not in existing]
        if upd:
            db.session.bulk_update_mappings(VocaExampleJaMeta, upd)
        if ins:
            db.session.bulk_insert_mappings(VocaExampleJaMeta, ins)
        db.session.commit()
    print(f'반영 {len(results)}건')


def main():
    ap = argparse.ArgumentParser(description='예문 라벨 v2 계산(dry-run 기본)')
    ap.add_argument('--lang', choices=('en', 'ja'), required=True)
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--only-missing', action='store_true')
    ap.add_argument('--samples', default=None, help='구간별 무작위 표본 30개 jsonl 저장 경로')
    args = ap.parse_args()
    app = create_app()
    with app.app_context():
        if args.lang == 'en':
            run_en(args.apply, args.only_missing, args.samples)
        else:
            with app.test_request_context():
                with use_dict_lang('ja'):
                    run_ja(args.apply, args.only_missing, args.samples)


if __name__ == '__main__':
    main()
