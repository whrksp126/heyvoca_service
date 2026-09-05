# -*- coding: utf-8 -*-
"""서브에이전트가 만든 번역/강조 TSV 를 DB 반영 전에 검증한다.

되돌리기 어려운 UPDATE 이므로, 형식이 조금이라도 어긋난 줄은 반영하지 않고 걸러낸다.
"""
import glob, os, re, sys

OPEN, CLOSE = '<strong class="target-word">', '</strong>'
RE_TAG = re.compile(r'<[^>]*>')

def load_src(pat, id_col=0):
    src = {}
    for f in sorted(glob.glob(pat)):
        for ln in open(f, encoding='utf-8'):
            ln = ln.rstrip('\n')
            if not ln.strip(): continue
            c = ln.split('\t')
            src[c[0]] = c
    return src

def check(kind, src, out_pat):
    ok, bad = [], []
    seen = set()
    for f in sorted(glob.glob(out_pat)):
        for n, ln in enumerate(open(f, encoding='utf-8'), 1):
            ln = ln.rstrip('\n')
            if not ln.strip(): continue
            c = ln.split('\t')
            loc = '%s:%d' % (os.path.basename(f), n)
            if len(c) != 2:
                bad.append((loc, '컬럼수 %d' % len(c))); continue
            _id, ko = c
            if _id not in src:
                bad.append((loc, 'id %s 원본에 없음' % _id)); continue
            if _id in seen:
                bad.append((loc, 'id %s 중복' % _id)); continue
            seen.add(_id)
            no = ko.count(OPEN); nc = ko.count(CLOSE)
            if no == 0:
                bad.append((loc, 'id %s 강조 없음' % _id)); continue
            if no != nc:
                bad.append((loc, 'id %s 태그 불균형 %d/%d' % (_id, no, nc))); continue
            # 허용된 태그 외의 마크업이 섞이면 화면에 raw 로 노출된다 (이번 사고의 원인).
            leftover = RE_TAG.sub('', ko.replace(OPEN, '').replace(CLOSE, ''))
            if '<' in leftover or '>' in leftover or RE_TAG.search(ko.replace(OPEN,'').replace(CLOSE,'')):
                bad.append((loc, 'id %s 다른 태그 혼입' % _id)); continue
            # 영어 원문의 강조 개수와 맞는지
            en = src[_id][2]
            if en.count(OPEN) != no:
                bad.append((loc, 'id %s 강조개수 en=%d ko=%d' % (_id, en.count(OPEN), no))); continue
            ok.append((_id, ko))
    missing = sorted(set(src) - seen, key=int)
    print('[%s] 원본 %d / 통과 %d / 탈락 %d / 누락 %d'
          % (kind, len(src), len(ok), len(bad), len(missing)))
    for loc, why in bad[:15]: print('   탈락 %s — %s' % (loc, why))
    if missing[:15]: print('   누락 id: %s' % ' '.join(missing[:15]))
    return ok, bad, missing

B = load_src('B_batch*')
C = load_src('C_batch*')
bok, _, bmiss = check('B 번역', B, 'B_out*.tsv')
cok, _, cmiss = check('C 강조', C, 'C_out*.tsv')
with open('APPLY.tsv', 'w', encoding='utf-8') as w:
    for _id, ko in bok + cok:
        w.write('%s\t%s\n' % (_id, ko))
print('\n반영 대상 %d건 → APPLY.tsv' % (len(bok) + len(cok)))
