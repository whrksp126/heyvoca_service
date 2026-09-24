"""예문 해석 블라인드 감사 대조: audit/example_sample_judge.txt vs example_sample_key.jsonl.

출력: 거부/수락 혼동행렬, sense_no 일치율, 나란히 보기(수동 품질 분류용) → audit/example_sample_compare.txt
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from batch_common import AUDIT  # noqa: E402


def main():
    keys = [json.loads(l) for l in open(os.path.join(AUDIT, 'example_sample_key.jsonl'), encoding='utf-8') if l.strip()]
    judge = {}
    for ln in open(os.path.join(AUDIT, 'example_sample_judge.txt'), encoding='utf-8').read().split('\n'):
        if ln:
            p = ln.split('|', 2)
            judge[int(p[0])] = (p[1], p[2])
    blind = {}
    for ln in open(os.path.join(AUDIT, 'example_sample_blind.txt'), encoding='utf-8').read().split('\n'):
        if ln:
            c = ln.split('\t')
            blind[int(c[0])] = c
    cm = {('X', 'X'): 0, ('X', 'O'): 0, ('O', 'X'): 0, ('O', 'O'): 0}
    sense_same = sense_tot = 0
    un = {'n': 0, 'agree': 0}
    out = []
    for k in keys:
        i = k['audit_no']
        ours = 'X' if k['sense_no'] == 'X' else 'O'
        js, jk = judge[i]
        mine = 'X' if js == 'X' else 'O'
        cm[(ours, mine)] += 1
        if k['span_method'] == 'unindexed':
            un['n'] += 1
            un['agree'] += ours == mine
        flag = ''
        if ours == mine == 'O':
            sense_tot += 1
            if js == k['sense_no']:
                sense_same += 1
            else:
                flag = 'SENSE'
        elif ours != mine:
            flag = 'REJ-DIFF'
        c = blind[i]
        out.append(f"#{i} [{flag}] {c[1]}({c[2]}) 뜻={c[3]} span={k['span_method']} b{k['batch']}:{k['seq']}\n"
                   f"  JA: {c[4]}\n  EN: {c[5]}\n  우리: {k['sense_no']}|{k['ko']}\n  감사: {js}|{jk}\n")
    open(os.path.join(AUDIT, 'example_sample_compare.txt'), 'w', encoding='utf-8').write('\n'.join(out))
    n = len(keys)
    print(f'표본 {n}')
    print(f"우리X·감사X {cm[('X','X')]} / 우리X·감사O {cm[('X','O')]} / 우리O·감사X {cm[('O','X')]} / 우리O·감사O {cm[('O','O')]}")
    print(f"거부/수락 일치율 {(cm[('X','X')] + cm[('O','O')]) / n:.1%}")
    nx = cm[('X', 'X')] + cm[('X', 'O')]
    no = cm[('O', 'X')] + cm[('O', 'O')]
    print(f"우리 거부 중 감사도 거부(정당 거부) {cm[('X','X')]}/{nx}; 우리 수락 중 감사가 거부 {cm[('O','X')]}/{no}")
    print(f'sense_no 일치(양쪽 수락) {sense_same}/{sense_tot} = {sense_same / max(sense_tot, 1):.1%}')
    print(f"unindexed 거부/수락 일치 {un['agree']}/{un['n']}")


if __name__ == '__main__':
    main()
