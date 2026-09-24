"""뜻 품질 감사용 블라인드 표본 추출.

meanings.jsonl 에서 seed 고정으로 JLPT 있는 sense 60 + 없는 sense 60 을 뽑아
- audit/meaning_sample_blind.txt : 현재 뜻 없이 입력만 (감사자가 먼저 판정)
- audit/meaning_sample_key.jsonl : 현재 값(정답 대조용, 판정 전 열람 금지)
"""
import json
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from batch_common import AUDIT, ENTRIES, MEANINGS, load_manifest, base_path  # noqa: E402

SEED = 40
N_EACH = 60


def main():
    entries = {}
    with open(ENTRIES, encoding='utf-8') as f:
        for line in f:
            e = json.loads(line)
            entries[e['jmdict_id']] = e
    rows = [json.loads(l) for l in open(MEANINGS, encoding='utf-8')]
    man = load_manifest('meaning')['batches']

    jl = [r for r in rows if (entries.get(r['jmdict_id']) or {}).get('jlpt')]
    nj = [r for r in rows if r['jmdict_id'] in entries and not entries[r['jmdict_id']].get('jlpt')]
    rnd = random.Random(SEED)
    sample = rnd.sample(jl, N_EACH) + rnd.sample(nj, N_EACH)
    rnd.shuffle(sample)

    cache = {}

    def batch_line(no, jid):
        key = f'{no:04d}'
        if key not in cache:
            with open(base_path('meaning', no), encoding='utf-8') as f:
                cache[key] = f.read().split('\n')
        idx = man[key].index(jid)
        return cache[key][idx].split('\t')

    os.makedirs(AUDIT, exist_ok=True)
    blind, keys = [], []
    for i, r in enumerate(sample, 1):
        e = entries[r['jmdict_id']]
        cols = batch_line(r['batch'], r['jmdict_id'])
        sense = next(s for s in e['senses'] if s['sense_no'] == r['sense_no'])
        ex = '-'
        for s in cols[3].split('||'):
            no, rest = s.split(':', 1)
            if int(no) == r['sense_no']:
                pos_s, rest2 = rest.split(':', 1)
                gl = ','.join(sense['gloss'])
                if rest2.startswith(gl + ':'):
                    ex = rest2[len(gl) + 1:]
                elif ':' in rest2 and not rest2.startswith(gl):
                    ex = rest2.rsplit(':', 1)[1]
                break
        blind.append(
            f"[{i}] sense {r['sense_no']}/{len(e['senses'])}  {e['word']} 「{e['reading']}」 JLPT={e.get('jlpt') or '-'}\n"
            f"  pos: {','.join(sense['pos'])}\n"
            f"  gloss: {'; '.join(sense['gloss'])}\n"
            f"  예문: {ex}\n"
            f"  krdict: {cols[4]}\n")
        keys.append({'no': i, 'jmdict_id': r['jmdict_id'], 'sense_no': r['sense_no'],
                     'word': e['word'], 'reading': e['reading'], 'jlpt': e.get('jlpt'),
                     'jm_pos': sense['pos'], 'gloss': sense['gloss'], 'krdict': cols[4],
                     'batch': r['batch'], 'meanings': r['meanings']})
    with open(os.path.join(AUDIT, 'meaning_sample_blind.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(blind))
    with open(os.path.join(AUDIT, 'meaning_sample_key.jsonl'), 'w', encoding='utf-8') as f:
        for k in keys:
            f.write(json.dumps(k, ensure_ascii=False) + '\n')
    print(f'jlpt pool={len(jl)} nonjlpt pool={len(nj)} sampled={len(sample)}')


if __name__ == '__main__':
    main()
