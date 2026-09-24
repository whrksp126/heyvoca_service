"""3단계: LLM 한국어화 배치 생성.

  python3 scripts/30_make_batches.py --kind meaning [--limit N]
  python3 scripts/30_make_batches.py --kind example [--limit N] [--jlpt-first] [--partial-meanings]
  python3 scripts/30_make_batches.py --kind example_gen [--limit N] [--jlpt-first] [--fill-senses]

규격은 BATCH_FORMAT.md. 멱등: 기존 batch_NNNN.txt 는 절대 다시 쓰지 않고(특히 _out.txt 가
있는 배치), manifest.json 에 없는 새 항목만 다음 번호로 추가한다. --limit 은 이번 실행에서
만들 배치 수 상한.
"""
import argparse
import json
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from batch_common import (  # noqa: E402
    BATCH_SIZE, EXAMPLES, EXAMPLES_KO, KRDICT_REV, NEED_GEN, atomic_write, base_path, clean,
    iter_jsonl, jlpt_rank, kind_dir, list_batches, load_entries, load_manifest, load_meanings,
    meanings_complete, save_manifest, sense_list_str, strip_strong)

KR_MAX = 6
KR_DEF_MAX = 40


def kata2hira(t):
    return ''.join(chr(ord(c) - 0x60) if 'ァ' <= c <= 'ヶ' else c for c in (t or ''))


def load_examples():
    by = defaultdict(list)
    for r in iter_jsonl(EXAMPLES):
        if r.get('selected', True):
            by[r['jmdict_id']].append(r)
    return by


# ---------------------------------------------------------------- krdict 후보

def kr_candidates(e, krdict):
    kanji = [f['text'] for f in e.get('kanji_forms') or []]
    kana = [f['text'] for f in e.get('kana_forms') or []]
    primary = ([e['word']] if e['word'] not in kana or not kanji else []) + kanji
    if not kanji:
        primary = [e['word']] + kana
    primary = list(dict.fromkeys(primary))
    secondary = [k for k in dict.fromkeys(kana + [e.get('reading')]) if k and k not in primary]
    rd = kata2hira(e.get('reading'))

    def collect(keys, tier):
        out = []
        for k in keys:
            for r in krdict.get(k, []):
                rr = kata2hira(r.get('reading'))
                rscore = 0 if rr and rr == rd else (1 if not rr else 2)
                out.append(((tier, rscore), r))
        return out

    hits = collect(primary, 0)
    # 가나 표기 조회는 동음이의어가 섞이므로, 가나 표제(uk)이거나 한자 표기 조회가 비었을 때만
    if e.get('uk') or not hits:
        hits += collect(secondary, 1)
    hits.sort(key=lambda x: x[0])
    seen, out = set(), []
    for _, r in hits:
        w = clean(r.get('ko_word')).replace(';', ',').replace('(', '').replace(')', '')
        if not w:
            continue
        pos = clean(r.get('ko_pos')) or '미상'
        key = (w, pos)
        if key in seen:
            continue
        seen.add(key)
        d = clean(r.get('ko_def')).replace(';', ',').replace('|', '/')
        if len(d) > KR_DEF_MAX:
            d = d[:KR_DEF_MAX - 1] + '…'
        out.append(f'{w}({pos}):{d}')
        if len(out) >= KR_MAX:
            break
    return ';'.join(out) if out else '-'


# ---------------------------------------------------------------- 줄 생성

def meaning_line(seq, e, exs, krdict):
    by_sense = {}
    free = None
    for x in exs:
        if x.get('sense_no') is not None:
            by_sense.setdefault(x['sense_no'], x)
        elif free is None:
            free = x
    parts = []
    for i, s in enumerate(e['senses']):
        p = f"{s['sense_no']}:{','.join(s['pos'])}:{clean(','.join(s['gloss']))}"
        ex = by_sense.get(s['sense_no'])
        # sense 가 확정 안 된 예문은 첫 sense 에만 붙인다(다른 sense 에 붙이면 오해 유발)
        if ex is None and i == 0:
            ex = free or (next(iter(by_sense.values())) if len(e['senses']) == 1 and by_sense else None)
        if ex is not None:
            p += ':' + clean(ex.get('ja_plain') or strip_strong(ex['ja']))
        parts.append(p.replace('||', '|'))
    cols = [str(seq), e['word'], e.get('reading') or e['word'], '||'.join(parts), kr_candidates(e, krdict)]
    return '\t'.join(cols)


def example_line(seq, e, x, meanings):
    star = x.get('sense_no')
    cols = [str(seq), e['word'], e.get('reading') or e['word'],
            sense_list_str(e['jmdict_id'], meanings, star=star),
            clean(x['ja']), clean(x.get('en')) or '-', clean(x.get('ko_ref')) or '-']
    return '\t'.join(cols)


def gen_line(seq, e, meanings):
    cols = [str(seq), e['word'], e.get('reading') or e['word'], e.get('jlpt') or '-',
            sense_list_str(e['jmdict_id'], meanings)]
    return '\t'.join(cols)


# ---------------------------------------------------------------- 공통 기록

def write_batches(kind, groups, limit, man):
    """groups: [(lines_fn(start_seq) 대신) [(key, line_builder), ...]] 그룹 단위로 배치를 채운다.
    그룹은 쪼개지 않는다(같은 항목 예문 인접). 반환: 만든 배치 수, 넣은 단위 수."""
    os.makedirs(kind_dir(kind), exist_ok=True)
    size = BATCH_SIZE[kind]
    existing = list_batches(kind)
    no = (max(existing) if existing else 0)
    made = units = 0
    cur_keys, cur_lines = [], []

    def flush():
        nonlocal no, made, cur_keys, cur_lines
        if not cur_keys:
            return
        no += 1
        p = base_path(kind, no)
        if os.path.exists(p):
            sys.exit(f'refuse to overwrite {p}')
        atomic_write(p, '\n'.join(cur_lines))
        man['batches'][f'{no:04d}'] = cur_keys
        save_manifest(kind, man)
        made += 1
        cur_keys, cur_lines = [], []

    for grp in groups:
        if cur_keys and len(cur_keys) + len(grp) > size:
            flush()
            if limit and made >= limit:
                return made, units
        for key, build in grp:
            seq = len(cur_keys) + 1
            cur_keys.append(key)
            cur_lines.append(build(seq))
            units += 1
    if not limit or made < limit:
        flush()
    else:
        units -= len(cur_keys)
    return made, units


def done_keys(man):
    out = set()
    for keys in man['batches'].values():
        for k in keys:
            out.add(tuple(k) if isinstance(k, list) else k)
    return out


def order(ents, jlpt_first):
    if jlpt_first:
        return sorted(ents, key=lambda e: (jlpt_rank(e), e['jmdict_id']))
    return sorted(ents, key=lambda e: e['jmdict_id'])


# ---------------------------------------------------------------- kind 별

def make_meaning(args):
    man = load_manifest('meaning')
    done = done_keys(man)
    entries = load_entries()
    exs = load_examples()
    with open(KRDICT_REV, encoding='utf-8') as f:
        krdict = json.load(f)
    todo = order([e for e in entries.values() if e['jmdict_id'] not in done], True)
    groups = [[(e['jmdict_id'], (lambda s, e=e: meaning_line(s, e, exs.get(e['jmdict_id'], []), krdict)))]
              for e in todo]
    made, units = write_batches('meaning', groups, args.limit, man)
    stale = len(done - set(entries))
    print(f'meaning: 신규 배치 {made}개 / 단어 {units} (미배치 잔여 {len(todo) - units}, '
          f'기존 배치 중 현 entries 에 없는 id {stale})')


def make_example(args):
    man = load_manifest('example')
    done = done_keys(man)
    entries = load_entries()
    meanings = load_meanings()
    exs = load_examples()
    ents, skipped_ent, skipped_ex = [], 0, 0
    for jid, xs in exs.items():
        e = entries.get(jid)
        if e is None:
            continue
        new = [x for x in xs if (jid, x['tatoeba_ja_id']) not in done]
        if not new:
            continue
        ok = (jid in meanings) if args.partial_meanings else meanings_complete(e, meanings)
        if not ok:
            skipped_ent += 1
            skipped_ex += len(new)
            continue
        ents.append((e, new))
    ents_sorted = order([e for e, _ in ents], args.jlpt_first)
    new_by = {e['jmdict_id']: n for e, n in ents}
    groups = []
    for e in ents_sorted:
        groups.append([([e['jmdict_id'], x['tatoeba_ja_id']],
                        (lambda s, e=e, x=x: example_line(s, e, x, meanings)))
                       for x in new_by[e['jmdict_id']]])
    made, units = write_batches('example', groups, args.limit, man)
    print(f'example: 신규 배치 {made}개 / 예문 {units} '
          f'(뜻 미완료로 건너뜀: 항목 {skipped_ent}, 예문 {skipped_ex})')


def make_example_gen(args):
    man = load_manifest('example_gen')
    done = done_keys(man)
    entries = load_entries()
    meanings = load_meanings()
    with open(NEED_GEN, encoding='utf-8') as f:
        targets = [j for j in json.load(f) if j in entries]
    n_need = len(targets)
    n_fill = n_fill_pending = 0
    if args.fill_senses:
        applied = defaultdict(list)
        for r in iter_jsonl(EXAMPLES_KO):
            applied[r['jmdict_id']].append(r)
        tset = set(targets)
        for jid, xs in load_examples().items():
            if jid in tset or jid not in entries:
                continue
            got = {r['tatoeba_ja_id'] for r in applied.get(jid, [])}
            if any(x['tatoeba_ja_id'] not in got for x in xs):
                n_fill_pending += 1          # 예문 해석이 아직 안 끝남 → 판단 보류
                continue
            if not any(not r['rejected'] and r['sense_no'] == 1 for r in applied[jid]):
                targets.append(jid)
                n_fill += 1
    todo, skipped = [], 0
    for jid in dict.fromkeys(targets):
        if jid in done:
            continue
        e = entries[jid]
        if not meanings_complete(e, meanings):
            skipped += 1
            continue
        todo.append(e)
    todo = order(todo, args.jlpt_first)
    groups = [[(e['jmdict_id'], (lambda s, e=e: gen_line(s, e, meanings)))] for e in todo]
    made, units = write_batches('example_gen', groups, args.limit, man)
    extra = f', sense1 보충 {n_fill} (예문 해석 미완료로 보류 {n_fill_pending})' if args.fill_senses else ''
    print(f'example_gen: 신규 배치 {made}개 / 단어 {units} (need_generation {n_need}{extra}, '
          f'뜻 미완료로 건너뜀 {skipped})')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--kind', required=True, choices=['meaning', 'example', 'example_gen'])
    ap.add_argument('--limit', type=int, default=0, help='이번 실행에서 만들 배치 수 상한(0=전부)')
    ap.add_argument('--jlpt-first', action='store_true', help='JLPT N5→N1 항목을 앞 배치에(meaning 은 항상)')
    ap.add_argument('--require-meanings', action='store_true', default=True,
                    help='(기본) 모든 sense 의 뜻이 build/meanings.jsonl 에 있는 항목만')
    ap.add_argument('--partial-meanings', action='store_true',
                    help='example: sense 일부만 뜻이 있어도 포함(수동검수로 빠진 sense 가 있는 항목용)')
    ap.add_argument('--fill-senses', action='store_true',
                    help='example_gen: 예문 해석 적용 후 sense 1 예문이 0개인 항목도 생성 대상에')
    args = ap.parse_args()
    {'meaning': make_meaning, 'example': make_example, 'example_gen': make_example_gen}[args.kind](args)


if __name__ == '__main__':
    main()
