"""예문 생성(변형 B) 품질 감사용 블라인드 표본 추출.

build/examples_generated.jsonl(35 적용 결과) 에 두 예문이 모두 있는 단어 중 seed 고정으로
JLPT 있는 단어 30 + 없는 단어 70 = 100단어(200문장)를 뽑아
- audit/gen_sample_blind.txt : 입력 5컬럼만(순번 1..100 재부여) — 감사자가 먼저 심사 기준을 적는다
- audit/gen_sample_key.jsonl : 생성 결과(심사 기준 작성 전 열람 금지)
입력 줄(표제어·읽기·JLPT·뜻목록)은 batches/example_gen/batch_NNNN.txt + manifest 에서 읽는다. 배치 파일은 읽기만 한다.
"""
import collections
import json
import os
import random
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from batch_common import AUDIT, BATCHES, EXAMPLES_GEN, load_manifest  # noqa: E402

SEED = 45
N_JLPT, N_NONE = 30, 70


def load_inputs():
    d = os.path.join(BATCHES, 'example_gen')
    man = load_manifest('example_gen')['batches']
    inp = {}
    for fn in sorted(os.listdir(d)):
        m = re.match(r'^batch_(\d{4})\.txt$', fn)
        if not m or m.group(1) not in man:
            continue
        keys = man[m.group(1)]
        for l in open(os.path.join(d, fn), encoding='utf-8').read().split('\n'):
            if l.strip():
                c = l.split('\t')
                inp[keys[int(c[0]) - 1]] = c
    return inp


def main():
    inp = load_inputs()
    by = collections.defaultdict(list)
    for l in open(EXAMPLES_GEN, encoding='utf-8'):
        if l.strip():
            r = json.loads(l)
            by[r['jmdict_id']].append(r)
    ids = sorted(j for j, rs in by.items() if len(rs) == 2 and j in inp)
    jl = [j for j in ids if inp[j][3] != '-']
    no = [j for j in ids if inp[j][3] == '-']
    rnd = random.Random(SEED)
    sample = rnd.sample(jl, N_JLPT) + rnd.sample(no, N_NONE)
    rnd.shuffle(sample)
    blind, keys = [], []
    for i, j in enumerate(sample, 1):
        c = list(inp[j])
        c[0] = str(i)
        blind.append('\t'.join(c))
        for r in sorted(by[j], key=lambda x: x['seq']):
            keys.append(json.dumps({'audit_no': i, 'jmdict_id': j, 'word': c[1], 'jlpt': c[3], 'senses': c[4],
                                    'seq': r['seq'], 'sense_no': r['sense_no'], 'ja': r['ja'], 'ko': r['ko'],
                                    'batch': r.get('batch')}, ensure_ascii=False))
    os.makedirs(AUDIT, exist_ok=True)
    open(os.path.join(AUDIT, 'gen_sample_blind.txt'), 'w', encoding='utf-8').write('\n'.join(blind) + '\n')
    open(os.path.join(AUDIT, 'gen_sample_key.jsonl'), 'w', encoding='utf-8').write('\n'.join(keys) + '\n')
    print(f'생성 완료 단어 {len(ids)} (JLPT {len(jl)} / 없음 {len(no)}), 표본 {len(sample)}단어 {len(keys)}문장')


if __name__ == '__main__':
    main()
