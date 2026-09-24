"""블라인드 감사 판정(audit/meaning_sample_judge.txt)과 현재 값(key) 대조표 출력.

자동 지표: 대표 뜻(첫 뜻) 품사 일치, 뜻 단위 품사 일치(같은 문자열 짝), 문자열 겹침.
의미 일치(동일/유사/불일치) 분류는 사람이 대조표를 보고 수동으로 한다.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from batch_common import AUDIT  # noqa: E402


def norm(s):
    return s.replace(' ', '').lstrip('~…')


def main():
    judge = {}
    with open(os.path.join(AUDIT, 'meaning_sample_judge.txt'), encoding='utf-8') as f:
        for line in f:
            line = line.rstrip('\n')
            if not line:
                continue
            no, sn, body = line.split('|', 2)
            judge[int(no)] = [tuple(x.rsplit('=', 1)) for x in body.split(';')]
    keys = [json.loads(l) for l in open(os.path.join(AUDIT, 'meaning_sample_key.jsonl'), encoding='utf-8')]

    rep_pos = pos_any = str_eq = str_overlap = 0
    pair_n = pair_pos = 0
    out = []
    for k in keys:
        ours = [(m['meaning'], m['pos']) for m in k['meanings']]
        mine = judge[k['no']]
        rp = ours[0][1] == mine[0][1]
        rep_pos += rp
        pos_any += bool({p for _, p in ours} & {p for _, p in mine})
        so = {norm(m) for m, _ in ours}
        sm = {norm(m) for m, _ in mine}
        eq = norm(ours[0][0]) == norm(mine[0][0])
        str_eq += eq
        ov = bool(so & sm)
        str_overlap += ov
        dm = {norm(m): p for m, p in mine}
        for m, p in ours:
            if norm(m) in dm:
                pair_n += 1
                pair_pos += dm[norm(m)] == p
        flag = ('' if rp else 'P') + ('' if ov else 'M')
        out.append(f"{k['no']:>3} {flag:<2} {k['word']}#{k['sense_no']} [{','.join(k['jm_pos'])}] "
                   f"{'; '.join(k['gloss'])[:60]}\n     ours : {';'.join(f'{m}={p}' for m, p in ours)}\n"
                   f"     judge: {';'.join(f'{m}={p}' for m, p in mine)}")
    n = len(keys)
    print('\n'.join(out))
    print(f'\n표본 {n} sense')
    print(f'대표 뜻 품사 일치: {rep_pos}/{n} = {rep_pos/n:.1%}')
    print(f'품사 집합 교집합 있음: {pos_any}/{n} = {pos_any/n:.1%}')
    print(f'같은 문자열 뜻 쌍의 품사 일치: {pair_pos}/{pair_n} = {pair_pos/max(pair_n,1):.1%}')
    print(f'대표 뜻 문자열 동일(공백무시): {str_eq}/{n} = {str_eq/n:.1%}')
    print(f'뜻 문자열 하나라도 겹침: {str_overlap}/{n} = {str_overlap/n:.1%}')


if __name__ == '__main__':
    main()
