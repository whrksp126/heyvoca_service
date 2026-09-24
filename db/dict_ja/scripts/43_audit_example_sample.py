"""예문 해석(변형 A) 품질 감사용 블라인드 표본 추출.

현재 존재하는 batches/example/batch_NNNN_out.txt 만 대상으로 seed 고정으로
거부(X) 20줄 + 수락 100줄(그중 span_method=unindexed 20줄 이상)을 뽑아
- audit/example_sample_blind.txt : 입력 7컬럼만(순번은 1..120 재부여, 감사자가 먼저 판정)
- audit/example_sample_key.jsonl : 현재 출력(정답 대조용, 판정 전 열람 금지)
"""
import json
import os
import random
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from batch_common import AUDIT, BATCHES, EXAMPLES, load_manifest  # noqa: E402

SEED = 43
N_REJ, N_UNIDX, N_ACC = 20, 20, 100


def load_done():
    d = os.path.join(BATCHES, 'example')
    out = []
    for fn in sorted(os.listdir(d)):
        m = re.match(r'^batch_(\d{4})_out\.txt$', fn)
        if m:
            out.append(m.group(1))
    return d, out


def main():
    d, done = load_done()
    man = load_manifest('example')['batches']
    meta = {}
    for l in open(EXAMPLES, encoding='utf-8'):
        e = json.loads(l)
        meta[(e['jmdict_id'], e['tatoeba_ja_id'])] = (e.get('span_method'), e.get('verified'))
    rej, acc_u, acc_o = [], [], []
    for no in done:
        inp = open(os.path.join(d, f'batch_{no}.txt'), encoding='utf-8').read().split('\n')
        inp = {int(l.split('\t')[0]): l for l in inp if l}
        for ln in open(os.path.join(d, f'batch_{no}_out.txt'), encoding='utf-8').read().split('\n'):
            p = ln.split('|', 2)
            if len(p) != 3 or not p[0].strip().isdigit():
                continue
            seq = int(p[0])
            if seq not in inp:
                continue
            jid, tid = man[no][seq - 1]
            sm, ver = meta.get((jid, tid), (None, None))
            rec = {'batch': no, 'seq': seq, 'jmdict_id': jid, 'tatoeba_ja_id': tid,
                   'span_method': sm, 'verified': ver, 'sense_no': p[1].strip(),
                   'ko': p[2].strip(), 'input': inp[seq]}
            if rec['sense_no'] == 'X':
                rej.append(rec)
            elif sm == 'unindexed':
                acc_u.append(rec)
            else:
                acc_o.append(rec)
    rnd = random.Random(SEED)
    s_rej = rnd.sample(rej, N_REJ)
    s_u = rnd.sample(acc_u, N_UNIDX)
    s_o = rnd.sample(acc_u + acc_o, N_ACC - N_UNIDX + 40)
    s_o = [r for r in s_o if r not in s_u][:N_ACC - N_UNIDX]
    sample = s_rej + s_u + s_o
    rnd.shuffle(sample)
    os.makedirs(AUDIT, exist_ok=True)
    blind, keys = [], []
    for i, r in enumerate(sample, 1):
        cols = r['input'].split('\t')
        cols[0] = str(i)
        blind.append('\t'.join(cols))
        k = dict(r, audit_no=i)
        k.pop('input')
        keys.append(json.dumps(k, ensure_ascii=False))
    open(os.path.join(AUDIT, 'example_sample_blind.txt'), 'w', encoding='utf-8').write('\n'.join(blind))
    open(os.path.join(AUDIT, 'example_sample_key.jsonl'), 'w', encoding='utf-8').write('\n'.join(keys) + '\n')
    nu = sum(1 for r in sample if r['span_method'] == 'unindexed' and r['sense_no'] != 'X')
    print(f'완료 배치 {len(done)}개, 거부 {len(rej)} / 수락 unindexed {len(acc_u)} / 수락 기타 {len(acc_o)}')
    print(f'표본 {len(sample)} (거부 {len(s_rej)}, 수락 {len(s_u) + len(s_o)} 중 unindexed {nu})')


if __name__ == '__main__':
    main()
