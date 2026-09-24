#!/usr/bin/env python3
"""생성 예문 재생성 배치 — 감사(audit/gen_regenerate_ids.json)로 골라낸 단어의 생성 예문 2개를 새로 만든다.

  python3 scripts/47_apply_regen.py --make     # batches/example_gen/batch_regen_0001.txt + build/example_gen_regen_manifest.json
  python3 scripts/47_apply_regen.py            # batch_regen_NNNN(_retryK)_out.txt → build/example_gen_overrides.jsonl
  python3 scripts/47_apply_regen.py --status   # 파일을 쓰지 않고 요약만

입력 형식은 원 example_gen 배치와 같은 5컬럼(`순번 표제어 읽기 JLPT 뜻목록`, 순번 새로 1..N),
순번→jmdict_id 는 build/example_gen_regen_manifest.json ({"batches": {"regen_0001": [jmdict_id, ...]}}).
출력(`순번|sense_no|일본어|한국어` 2줄 또는 `순번|X|사유` 1줄)은 35_apply_batches.py 의 example_gen 검증
(parse_out/v_gen — 형태소 경계 검사는 재생성분에 엄격 적용)을 그대로 받는다.
통과분은 example_gen_overrides.jsonl 에 {jmdict_id, seq(1·2), sense_no, ja, ko, fix_reason:"batch_regen_NNNN"}
2행(X 면 {jmdict_id, seq, rejected:true, reason} 2행)으로 쓴다. 매 실행마다 이 파일의 batch_regen_* 행을
통째로 다시 쓰고, 재생성이 통과한 단어의 다른 정정 행(ko_particle_split 등)은 뺀다(재생성본이 우선).
실패 단위는 batch_regen_NNNN_retryK.txt(K≤3, 원 순번 유지)로 다시 뽑고, 3회 후에도 실패하면
audit/manual_review_example_gen_regen.txt. 적용은 이후 `35_apply_batches.py --kind example_gen`.
"""
import argparse
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from batch_common import (AUDIT, BUILD, MAX_RETRY, atomic_write, kind_dir, load_entries,  # noqa: E402
                          load_meanings, meanings_complete)

REGEN_IDS = os.path.join(AUDIT, 'gen_regenerate_ids.json')
MANIFEST = os.path.join(BUILD, 'example_gen_regen_manifest.json')
OVERRIDES = os.path.join(BUILD, 'example_gen_overrides.jsonl')
MANUAL = os.path.join(AUDIT, 'manual_review_example_gen_regen.txt')
WARN = os.path.join(AUDIT, 'warn_example_gen_regen.txt')


def load_mod(fname, name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def paths(name, k):
    stem = f'batch_{name}' + (f'_retry{k}' if k else '')
    d = kind_dir('example_gen')
    return os.path.join(d, stem + '.txt'), os.path.join(d, stem + '_out.txt')


def load_manifest():
    if not os.path.exists(MANIFEST):
        return {}
    with open(MANIFEST, encoding='utf-8') as f:
        return json.load(f).get('batches', {})


# ---------------------------------------------------------------- 배치 생성

def make(name='regen_0001'):
    man = load_manifest()
    inp = paths(name, 0)[0]
    if name in man or os.path.exists(inp):
        print(f'batch_{name} 이미 있음 — 다시 쓰지 않음 (manifest {name in man}, 파일 {os.path.exists(inp)})')
        return
    with open(REGEN_IDS, encoding='utf-8') as f:
        ids = list(dict.fromkeys(json.load(f)))
    entries, meanings = load_entries(), load_meanings()
    m30 = load_mod('30_make_batches.py', 'make_batches30')
    lines, keys, skipped = [], [], []
    for jid in ids:
        e = entries.get(jid)
        if e is None or not meanings_complete(e, meanings):
            skipped.append(jid)
            continue
        keys.append(jid)
        lines.append(m30.gen_line(len(keys), e, meanings))
    atomic_write(inp, '\n'.join(lines))
    man[name] = keys
    atomic_write(MANIFEST, json.dumps({'kind': 'example_gen_regen', 'batches': man}, ensure_ascii=False, indent=1))
    print(f'batch_{name}.txt {len(keys)}단어 → {os.path.relpath(inp)} · manifest {os.path.relpath(MANIFEST)}'
          + (f' · 건너뜀(항목/뜻 없음) {skipped}' if skipped else ''))


# ---------------------------------------------------------------- 적용

def process(a35, name, keys, create):
    """반환 dict: ok{seq: [예문] 또는 []}, reasons{seq: X사유}, pending, manual[(seq, 표제어, 사유)], errs, warns, fails, created"""
    res = {'ok': {}, 'pending': 0, 'manual': [], 'errs': [], 'warns': [], 'fails': [], 'created': []}
    units = a35.read_input(paths(name, 0)[0])
    fail = {}
    for k in range(0, MAX_RETRY + 1):
        inp, out = paths(name, k)
        if k and not os.path.exists(inp):
            if not create:
                res['pending'] += len(units)
                return res
            atomic_write(inp, '\n'.join(units[s][0] for s in sorted(units)))
            res['created'].append(os.path.basename(inp))
        cur = a35.read_input(inp)
        units = {s: units[s] for s in units if s in cur}
        if not os.path.exists(out):
            res['pending'] += len(units)
            return res
        tag = f'batch_{name}' + (f'_retry{k}' if k else '')
        ok, fail, errs, warns = a35.parse_out('example_gen', out, units, {'keys': keys, 'regen': True})
        res['errs'] += [f'{tag} {x}' for x in errs]
        res['warns'] += [f'{tag}\t{x}' for x in warns]
        res['fails'] += [f'{tag}\t{q}\t{units[q][1][1]}\t{r}' for q, r in sorted(fail.items())]
        for s, v in ok.items():
            res['ok'][s] = (v, [w for w in warns if w.startswith(f'{s}\t') and '거부(X)' in w])
        if not fail:
            return res
        units = {s: units[s] for s in fail}
    for s, reason in fail.items():
        res['manual'].append((s, units[s][1][1], reason))
    return res


def apply(write=True):
    man = load_manifest()
    if not man:
        sys.exit('build/example_gen_regen_manifest.json 없음 — 먼저 --make')
    a35 = load_mod('35_apply_batches.py', 'apply_batches35')
    new_rows, done_ids, manual, errs, warns, fails, created = [], set(), [], [], [], [], []
    tot = {'units': 0, 'ok': 0, 'x': 0, 'pending': 0, 'manual': 0}
    for name in sorted(man):
        keys = man[name]
        if not os.path.exists(paths(name, 0)[0]):
            errs.append(f'batch_{name} 입력 파일 없음')
            continue
        r = process(a35, name, keys, create=write)
        tot['units'] += len(keys)
        tot['pending'] += r['pending']
        tot['manual'] += len(r['manual'])
        errs += r['errs']
        warns += r['warns']
        fails += r['fails']
        created += r['created']
        manual += [f'batch_{name}\t{s}\t{keys[s - 1]}\t{w}\t{reason}' for s, w, reason in r['manual']]
        for s, (v, xw) in sorted(r['ok'].items()):
            jid = keys[s - 1]
            done_ids.add(jid)
            if not v:                        # 순번|X|사유 → 기존 생성 예문 2개 제거
                reason = xw[0].split('거부(X): ', 1)[1] if xw else '거부'
                for seq in (1, 2):
                    new_rows.append({'jmdict_id': jid, 'seq': seq, 'rejected': True, 'reason': reason,
                                     'fix_reason': f'batch_{name}'})
                tot['x'] += 1
                continue
            for seq, x in enumerate(v, 1):
                new_rows.append({'jmdict_id': jid, 'seq': seq, 'sense_no': x['sense_no'], 'ja': x['ja'],
                                 'ko': x['ko'], 'fix_reason': f'batch_{name}'})
            tot['ok'] += 1
    print(f'regen: 단어 {tot["units"]} · 통과 {tot["ok"]} · 거부(X) {tot["x"]} · 대기 {tot["pending"]} · '
          f'수동검수 {tot["manual"]} · 형식오류줄 {len(errs)} · 검증 실패(시도별) {len(fails)}')
    if not write:
        return
    # 오버레이 재작성: 기존 batch_regen_* 행 제거, 재생성이 끝난 단어의 다른 정정 행도 제거(재생성본 우선)
    keep, dropped = [], []
    if os.path.exists(OVERRIDES):
        with open(OVERRIDES, encoding='utf-8') as f:
            for line in f:
                if not line.strip():
                    continue
                o = json.loads(line)
                if str(o.get('fix_reason', '')).startswith('batch_regen_'):
                    continue
                if o.get('jmdict_id') in done_ids:
                    dropped.append(f'{o.get("jmdict_id")}:{o.get("seq")}({o.get("fix_reason")})')
                    continue
                keep.append(line.rstrip('\n'))
    rows = keep + [json.dumps(r, ensure_ascii=False) for r in new_rows]
    atomic_write(OVERRIDES, ''.join(x + '\n' for x in rows))
    print(f'  → {os.path.relpath(OVERRIDES)} {len(rows)}행 (재생성 {len(new_rows)} · 기존 정정 유지 {len(keep)}'
          + (f' · 재생성으로 대체돼 뺀 행 {dropped}' if dropped else '') + ')')
    for p, body in ((MANUAL, manual and 'batch\t순번\tjmdict_id\t표제어\t사유\n' + '\n'.join(manual) + '\n'),
                    (WARN, (warns or errs or fails) and '\n'.join(
                        ['# 검증 실패(시도별, 재시도/수동검수로 감)'] + fails + ['# 형식 오류'] + errs +
                        ['# 경고'] + warns) + '\n')):
        if body:
            atomic_write(p, body)
        elif os.path.exists(p):
            os.remove(p)
    if created:
        print(f'  재시도 파일 생성: {", ".join(created)}')
    if new_rows:
        print('  다음: python3 scripts/35_apply_batches.py --kind example_gen  (오버레이 적용)')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--make', action='store_true')
    ap.add_argument('--status', action='store_true')
    a = ap.parse_args()
    if a.make:
        make()
    else:
        apply(write=not a.status)


if __name__ == '__main__':
    main()
