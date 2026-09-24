"""예문 해석(변형 A) 정정 오버레이 생성 → build/example_overrides.jsonl + 재번역 배치 준비

  python3 scripts/44_build_example_overrides.py [--dry-run] [--show all|particle|none]

배치 원본(batches/example/*_out.txt)은 건드리지 않는다. 35 의 run('example') 으로 **오버레이 적용 전**
레코드를 다시 읽어(멱등) 아래 결정론적 규칙을 적용하고, 바뀐 (jmdict_id, tatoeba_ja_id) 만 오버레이 행으로 쓴다.
적용은 `35_apply_batches.py --kind example` 이 한다. 감사 근거는 audit/example_patterns.md (43_verify_examples.py).

결정론적 규칙(적용 순서)
- quote    해석의 「」 → 한국어 큰따옴표 "" (원문이 『』만 쓰면 『』 로 맞춤 — 작품명 유지). 」「 사이 공백,
           글자 바로 뒤의 여는 따옴표 앞 공백 보강. 곡선 따옴표 “”‘’ → "" ''.
- nakaguro 가타카나 중점 ・ → ·, 연속 ・・・ → ...
- particle 강조가 조사(을/를/이/가/은/는/의/에/에서/로/으로/와/과/도)로 끝나고 그 앞부분이 이 항목의 명사 뜻
           (meanings.jsonl, NOUN/PRON/PROPN/NUM)과 같을 때만 조사를 태그 밖으로 뺀다.
- copula   강조가 서술격(다/이다/였다/이었다)으로 끝나고 앞부분이 명사 뜻이면 분리(`키다` → `키`+`다`).
           particle·copula 공통 제외: 강조 전체가 그 자체로 뜻인 경우, `-적(으로|이|이다)`, PARTICLE_SKIP 표
           (원문 に/で/の 부사·연체 용법의 굳은 말 — 실제로·단숨에·대부분의 등, 개략도 같은 합성어).
           MANUAL_SPLIT 표는 뜻 문자열과 어형이 달라 자동 일치가 안 되는 감사 지목 건(여정을·고결함을).
- period   해석 끝 문장부호 누락 → 원문 끝 부호에 맞춰 보강(。→. / か。→? / ？→? / ！→!),
           원문이 」』 로 끝나면 생략, 해석이 이미 부호(. ! ? … " ' ~ ) ♪ 등)로 끝나면 유지.

재번역 배치: 규칙으로 못 고치는 것(다문장 일부 번역, 오역, 감사 지목 개별 사례 — FIX 표)을
batches/example/batch_fix_0001.txt(원 7컬럼 형식, 순번 새로 부여)로 쓰고 키를 build/example_fix_manifest.json 에
둔다. 이미 `_out.txt` 가 있으면 입력을 다시 쓰지 않는다. 35 는 fix 출력을 오버레이보다 우선 적용한다.
"""
import argparse
import collections
import importlib.util
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from batch_common import (  # noqa: E402
    BUILD, MEANINGS, STRONG_CLOSE, STRONG_OPEN, atomic_write, kind_dir, load_manifest, strip_strong)

OUT = os.path.join(BUILD, 'example_overrides.jsonl')
FIX_MANIFEST = os.path.join(BUILD, 'example_fix_manifest.json')
FIX_NAME = 'fix_0001'

STRONG_RE = re.compile(re.escape(STRONG_OPEN) + r'(.*?)' + re.escape(STRONG_CLOSE))
NOUN_POS = {'NOUN', 'PRON', 'PROPN', 'NUM'}
PARTICLES = ['에서', '으로', '을', '를', '이', '가', '은', '는', '의', '에', '로', '와', '과', '도']
COPULAS = ['이었다', '였다', '이다', '다']
JEOK = re.compile(r'적(으로|이|이다)$')
# 원문 に/で/の 부사·연체 용법이 한국어에서 굳은 말로 옮겨진 것(조사 포함 강조가 자연스러움) + 합성어 오탐
PARTICLE_SKIP = {
    '실제로', '평소에', '끝에', '공짜로', '뒤에서', '합동으로', '과잉으로', '일괄로', '단숨에', '자유자재로',
    '진심으로', '엉망으로', '제각각으로', '이구동성으로', '일직선으로', '일변도로', '극도로', '대량으로', '식으로',
    '비밀로', '한편으로', '으뜸으로', '세로로', '길이로',
    '대부분의', '개개의', '임의의', '남의',
    '개략도',   # 概略 "개략도 형태로" — 개략도(概略圖) 합성어, 조사 도 아님
}
# 뜻 문자열과 어형이 달라 자동 일치가 안 되지만 감사에서 조사 삼킴으로 확인한 것(강조 텍스트 → (어간, 조사))
MANUAL_SPLIT = {'여정을': ('여정', '을'), '고결함을': ('고결함', '을')}
END_OK = re.compile(r'[.!?…"\'~)♪」』”’]$')

# 재번역 대상: (원 batch, 원 순번, 사유, 뜻목록 * 힌트 제거 여부)
FIX = [
    # 다문장 원문 중 일부만 번역(43 탐지 22건 중 오탐 제외: おはようございます·肉·しもべ·値(訳注)·リンス·実戦)
    ('0008', 86, '부분번역', False),    # 足
    ('0033', 50, '부분번역', False),    # 基本
    ('0037', 40, '부분번역', False),    # 幸い
    ('0040', 76, '부분번역', False),    # 臭い
    ('0050', 18, '부분번역', False),    # 皮
    ('0060', 87, '부분번역', False),    # シャッター
    ('0060', 117, '부분번역', False),   # スマート
    ('0070', 58, '부분번역', False),    # 主語
    ('0092', 59, '부분번역', False),    # くらい
    ('0135', 62, '부분번역', False),    # でしょう
    ('0135', 76, '부분번역', False),    # とすると
    ('0172', 13, '부분번역(무의미 원문)', False),   # 騎馬 — 둘째 문장 무의미, 거부가 맞음
    ('0196', 48, '부분번역', False),    # なおかつ
    ('0203', 14, '부분번역', False),    # 接点
    ('0256', 20, '부분번역', False),    # 多め
    ('0256', 23, '부분번역', False),    # 短め
    # 오역
    ('0141', 47, '오역(* 힌트 오류: 석고→깁스)', True),   # ギプス
    ('0072', 131, '오역(주어)', False),                   # 推定
    # 감사 지목 개별 사례
    ('0177', 13, '서술부 통째 강조', False),     # 欠かす 없어서는 안 됩니다
    ('0201', 18, '과잉 거부(속담)', False),      # 瀬
    ('0234', 103, 'sense 판정(육로)', False),     # 陸路
    ('0253', 4, 'sense 판정(신간)', False),       # 新書
]


def load_35():
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), '35_apply_batches.py')
    spec = importlib.util.spec_from_file_location('apply35', p)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


# ---------------------------------------------------------------- 규칙

def fix_quotes(ko, ja_plain):
    if '「' not in ko and '」' not in ko and not re.search('[“”‘’]', ko):
        return ko
    ko = ko.replace('“', '"').replace('”', '"').replace('‘', "'").replace('’', "'")
    if '「' in ko or '」' in ko:
        title = '『' in ja_plain and '「' not in ja_plain
        op, cl = ('『', '』') if title else ('"', '"')
        ko = re.sub(r'」\s*「', cl + ' ' + op, ko)
        out = []
        for i, ch in enumerate(ko):
            if ch == '「':
                prev = ''.join(out)
                if prev and not prev[-1].isspace() and prev[-1] not in '("\'『' and not prev.endswith(STRONG_OPEN) \
                        and not (op == '"' and prev.endswith('" ')):
                    out.append(' ')
                out.append(op)
            elif ch == '」':
                out.append(cl)
            else:
                out.append(ch)
        ko = ''.join(out)
    return ko


def fix_nakaguro(ko):
    if '・' not in ko:
        return ko
    ko = re.sub(r'・{2,}', '...', ko)
    return ko.replace('・', '·')


def fix_particle(ko, nouns, all_means):
    """반환 (새 ko, 태그 or None, 설명)."""
    m = STRONG_RE.search(ko)
    if not m:
        return ko, None, ''
    inner = m.group(1)
    if inner in MANUAL_SPLIT:
        stem, p = MANUAL_SPLIT[inner]
        return (ko[:m.start()] + STRONG_OPEN + stem + STRONG_CLOSE + p + ko[m.end():], 'particle',
                f'{inner} → [{stem}]{p} (수동)')
    if inner in all_means or inner in PARTICLE_SKIP or JEOK.search(inner):
        return ko, None, ''
    for tag, cands in (('particle', PARTICLES), ('copula', COPULAS)):
        for p in cands:
            stem = inner[:-len(p)]
            if inner.endswith(p) and stem and stem in nouns:
                new = ko[:m.start()] + STRONG_OPEN + stem + STRONG_CLOSE + p + ko[m.end():]
                return new, tag, f'{inner} → [{stem}]{p}'
    return ko, None, ''


def fix_period(ko, ja_plain):
    """반환 (새 ko, 추가 부호 or None, 원문 끝 문자(보강 불가 시))."""
    s = ko.rstrip()
    if END_OK.search(s):
        return ko, None, None
    ja = ja_plain.rstrip()
    last = ja[-1:] if ja else ''
    if last in '」』':
        return ko, None, None
    if last == '。':
        p = '?' if ja.endswith('か。') else '.'
    elif last in '？?':
        p = '?'
    elif last in '！!':
        p = '!'
    else:
        return ko, None, last or '(빈 원문)'
    return s + p, p, None


# ---------------------------------------------------------------- 재번역 배치

def build_fix_batch(man, dry):
    d = kind_dir('example')
    inp = os.path.join(d, f'batch_{FIX_NAME}.txt')
    out = os.path.join(d, f'batch_{FIX_NAME}_out.txt')
    lines, keys = [], []
    for no, seq, _, drop_star in FIX:
        src = os.path.join(d, f'batch_{no}.txt')
        cols = None
        with open(src, encoding='utf-8') as f:
            for ln in f.read().split('\n'):
                if ln and ln.split('\t', 1)[0] == str(seq):
                    cols = ln.split('\t')
                    break
        if cols is None:
            sys.exit(f'FIX 대상 없음: batch_{no}:{seq}')
        if drop_star:
            cols[3] = cols[3].replace('*', '')
        keys.append(man[no][seq - 1])
        cols[0] = str(len(keys))
        lines.append('\t'.join(cols))
    text = '\n'.join(lines)
    print(f'재번역 배치 batches/example/batch_{FIX_NAME}.txt {len(lines)}줄')
    for (no, seq, why, _), ln in zip(FIX, lines):
        c = ln.split('\t')
        print(f'  {c[0]:>2} ← b{no}:{seq} {c[1]} [{why}]')
    if dry:
        return
    if os.path.exists(out):
        print(f'  (이미 {os.path.basename(out)} 있음 — 입력·키 다시 쓰지 않음)')
        return
    atomic_write(inp, text)
    atomic_write(FIX_MANIFEST, json.dumps({'kind': 'example_fix', 'batches': {FIX_NAME: keys}},
                                          ensure_ascii=False, indent=1))


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true', help='파일을 쓰지 않고 변경 내역만 출력')
    ap.add_argument('--show', choices=['all', 'particle', 'none'], default='particle',
                    help='변경 목록 출력 범위(기본: 조사·서술격 이동 전부)')
    args = ap.parse_args()
    m35 = load_35()
    records = m35.run('example', write=False)[0]   # 오버레이·재번역 적용 전 원본
    units = m35.example_units()
    man = load_manifest('example')['batches']
    nouns, all_means = collections.defaultdict(set), collections.defaultdict(set)
    with open(MEANINGS, encoding='utf-8') as f:
        for line in f:
            r = json.loads(line)
            for x in r['meanings']:
                mm = x['meaning'].strip().lstrip('~-').strip()
                all_means[r['jmdict_id']].add(mm)
                if x['pos'] in NOUN_POS:
                    nouns[r['jmdict_id']].add(mm)
    rows, tags_n, unfixed, bad = [], collections.Counter(), [], []
    shown = collections.defaultdict(list)
    for r in records:
        if r['rejected']:
            continue
        key = (r['jmdict_id'], r['tatoeba_ja_id'])
        cols = units.get(key)
        if cols is None:
            continue
        ja_plain = strip_strong(cols[4])
        ko, tags, notes = r['ko'], [], []
        k2 = fix_quotes(ko, ja_plain)
        if k2 != ko:
            tags.append('quote')
            ko = k2
        k2 = fix_nakaguro(ko)
        if k2 != ko:
            tags.append('nakaguro')
            ko = k2
        k2, t, note = fix_particle(ko, nouns[r['jmdict_id']], all_means[r['jmdict_id']])
        if t:
            tags.append(t)
            notes.append(note)
            ko = k2
        k2, p, miss = fix_period(ko, ja_plain)
        if p:
            tags.append('period' if p == '.' else f'period{p}')
            ko = k2
        elif miss:
            unfixed.append(f'b{r["batch"]:04d} {cols[1]} 원문끝={miss}: {strip_strong(ko)}')
        if not tags:
            continue
        reason = m35.check_ko(ko)
        if reason:
            bad.append(f'{key} {reason}: {ko}')
            continue
        tags_n.update(tags)
        rows.append({'jmdict_id': key[0], 'tatoeba_ja_id': key[1], 'sense_no': r['sense_no'], 'ko': ko,
                     'rejected': False, 'reason': None, 'fix_reason': ','.join(tags)})
        head = f'b{r["batch"]:04d} {cols[1]}'
        if notes and args.show != 'none':
            shown[t].append(f'{head}\t{notes[0]}\t| {strip_strong(ko)}')
        elif args.show == 'all':
            shown['기타(' + ','.join(tags) + ')'].append(f'{head}\t{strip_strong(r["ko"])}\t→ {strip_strong(ko)}')
    for k in sorted(shown):
        print(f'## {k} ({len(shown[k])})')
        for x in shown[k]:
            print('  ' + x)
    if not args.dry_run:
        atomic_write(OUT, ''.join(json.dumps(x, ensure_ascii=False) + '\n' for x in rows))
    print(f'오버레이 {len(rows)}행' + ('' if args.dry_run else f' → {os.path.relpath(OUT)}'))
    for t, n in tags_n.most_common():
        print(f'  {t}: {n}')
    if unfixed:
        print(f'끝 부호 보강 불가 {len(unfixed)}건:')
        for x in unfixed:
            print('  ' + x)
    if bad:
        print(f'검증 실패로 제외 {len(bad)}건:')
        for x in bad:
            print('  ' + x)
    build_fix_batch(man, args.dry_run)


if __name__ == '__main__':
    main()
