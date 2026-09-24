"""예문 해석(변형 A) 전량 패턴 탐지 — build/examples_ko.jsonl(35 적용 결과: 오버레이·재번역 반영) 대상.

결과: audit/example_patterns.md (건수 + 예시 최대 10건씩), audit/example_patterns_all.json (전체 적중 목록)
원문·뜻목록은 원 배치 입력(batches/example/batch_NNNN.txt)에서 읽는다. 35_apply_batches.py --kind example 뒤에 실행.
배치 파일은 읽기만 한다.
"""
import collections
import json
import os
import random
import re
import statistics
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from batch_common import AUDIT, BATCHES, EXAMPLES, EXAMPLES_KO, STRONG_OPEN, STRONG_CLOSE, load_manifest, strip_strong  # noqa: E402

JA_CHARS = re.compile(r'[぀-ヿ一-鿿㐀-䶿ｦ-ﾟ]')
JA_QUOTES = re.compile(r'[「」・]')   # 한국어 표기로 바꿔야 하는 것(44 가 "" / · 로 정정)
JA_BRACKETS = re.compile(r'[『』〜～…？！（）]')   # 그 밖의 일본식 부호(『』 작품명·… 는 허용 대상 포함)
LATIN = re.compile(r'[A-Za-z]{2,}')
PARTICLE_TAIL = set('을를이가은는에의와과도로만')
PUNCT = re.compile(r'[.,!?。、，．！？「」"\'()\[\]…·:;~]')
STRONG_RE = re.compile(re.escape(STRONG_OPEN) + r'(.*?)' + re.escape(STRONG_CLOSE))
SEED = 43
EX_N = 10


def style_of(ko):
    t = re.sub(r'[\s.!?。"\'」』)\]…~]+$', '', strip_strong(ko))
    if not t:
        return '기타'
    if re.search(r'(습니다|습니까|ㅂ니다|입니다|니다|니까)$', t):
        return '합쇼체'
    if re.search(r'(요|죠|세요)$', t):
        return '해요체'
    if re.search(r'(다|라|냐|자|까|군|네|지|니)$', t):
        return '평서/해라체'
    return '반말(해체)·기타'


def main():
    d = os.path.join(BATCHES, 'example')
    man = load_manifest('example')['batches']
    meta = {}
    for l in open(EXAMPLES, encoding='utf-8'):
        e = json.loads(l)
        meta[(e['jmdict_id'], e['tatoeba_ja_id'])] = e
    # 입력 원문·뜻목록은 원 배치 입력에서, 해석은 35 적용 결과(오버레이·재번역 반영)에서 읽는다
    where = {}
    for fn in sorted(os.listdir(d)):
        mm = re.match(r'^batch_(\d{4})\.txt$', fn)
        if not mm or mm.group(1) not in man:
            continue
        no = mm.group(1)
        for l in open(os.path.join(d, fn), encoding='utf-8').read().split('\n'):
            if l:
                c = l.split('\t')
                seq = int(c[0])
                where[tuple(man[no][seq - 1])] = (no, seq, c)
    recs = []
    for e in (json.loads(l) for l in open(EXAMPLES_KO, encoding='utf-8') if l.strip()):
        jid, tid = e['jmdict_id'], e['tatoeba_ja_id']
        if (jid, tid) not in where:
            continue
        no, seq, c = where[(jid, tid)]
        m = meta.get((jid, tid), {})
        star = re.findall(r'(?:^|\|)\*(\d+):', c[3])
        recs.append({'batch': no, 'seq': seq, 'jid': jid, 'tid': tid, 'word': c[1], 'senses': c[3],
                     'ja': c[4], 'en': c[5],
                     'sense': 'X' if e['rejected'] else str(e['sense_no']),
                     'ko': (e['reason'] if e['rejected'] else e['ko']).strip(), 'fix': e.get('fix'),
                     'star': int(star[0]) if star else None, 'span': m.get('span_method'),
                     'verified': m.get('verified')})
    done = sorted({r['batch'] for r in recs})
    rnd = random.Random(SEED)
    hits = collections.OrderedDict()

    def add(key, r, note=''):
        hits.setdefault(key, []).append(dict(r, note=note))

    acc = [r for r in recs if r['sense'] != 'X']
    rej = [r for r in recs if r['sense'] == 'X']
    # 1. 배치별 거부율
    per = collections.defaultdict(lambda: [0, 0])
    for r in recs:
        per[r['batch']][0] += 1
        per[r['batch']][1] += r['sense'] == 'X'
    rates = {b: x / n for b, (n, x) in per.items()}
    reasons = collections.Counter(r['ko'] for r in rej)
    span_rej = collections.Counter((r['span'], r['sense'] == 'X') for r in recs)
    # 2. 길이 비율
    ratios = []
    for r in acc:
        ja = re.sub(r'\s', '', strip_strong(r['ja']))
        ko = re.sub(r'\s', '', strip_strong(r['ko']))
        if ja:
            ratios.append((len(ko) / len(ja), r))
    vals = [x for x, _ in ratios]
    med = statistics.median(vals)
    for x, r in ratios:
        if x < 0.45 or x > 2.2:
            add('길이 비율 이상치 (ko/ja <0.45 또는 >2.2, 공백 제외)', r, f'{x:.2f}')
    for r in acc:
        ko = strip_strong(r['ko'])
        ja_p = strip_strong(r['ja'])
        nja = len([x for x in re.split(r'[。！？!?]+|」\s*「|』\s*『', ja_p) if re.sub(r'[\s」』）)・…]', '', x)])
        nko = len([x for x in re.split(r'[.!?。]+|"\s*"|」\s*「', ko) if re.sub(r'[\s"\'」』)…·]', '', x)])
        lr = len(re.sub(r'\s', '', ko)) / max(len(re.sub(r'\s', '', ja_p)), 1)
        if nja >= 2 and nko < nja and lr < 0.75:
            add('다문장 원문 중 일부만 번역 의심(문장 수 ko<ja, 길이비<0.75)', r, f'ja{nja}/ko{nko} {lr:.2f}')
        if JA_CHARS.search(ko):
            add('해석에 일본어 문자(가나·한자) 잔존', r, ''.join(sorted(set(JA_CHARS.findall(ko)))))
        if JA_QUOTES.search(ko):
            add('해석에 「」 또는 가타카나 중점 ・ 잔존', r, ''.join(sorted(set(JA_QUOTES.findall(ko)))))
        if JA_BRACKETS.search(ko):
            add('해석에 기타 일본식 부호(『』〜…？！（）) 잔존', r, ''.join(sorted(set(JA_BRACKETS.findall(ko)))))
        lat = LATIN.findall(ko)
        if lat:
            ja_lat = set(w.lower() for w in LATIN.findall(r['ja']))
            new = [w for w in lat if w.lower() not in ja_lat]
            if new:
                add('해석에 영어 잔존(원문에 없는 라틴 2자+)', r, ','.join(new))
        mm = STRONG_RE.search(r['ko'])
        if mm:
            inner = mm.group(1).strip()
            if PUNCT.search(inner):
                add('강조 안 구두점/따옴표', r, inner)
            if len(inner) > 1 and inner[-1] in PARTICLE_TAIL:
                add('강조 안이 조사 음절로 끝남(을를이가은는에의와과도로만)', r, inner)
            if ' ' in inner and len(inner.split()) >= 3:
                add('강조가 3어절 이상', r, inner)
        if not re.search(r'[.!?。…"」』”’\'~)♪]$', r['ko'].strip()):
            add('해석 끝 문장부호 없음', r)
        if r['star'] is not None and r['sense'].isdigit() and int(r['sense']) != r['star']:
            add('* 힌트를 뒤집음', r, f"*{r['star']}→{r['sense']}")
    # 3. 같은 표제어 해석 완전 동일
    by = collections.defaultdict(list)
    for r in acc:
        by[(r['jid'], strip_strong(r['ko']).strip())].append(r)
    for (jid, ko), rs in by.items():
        if len(rs) > 1:
            for r in rs:
                add('같은 표제어에서 해석 완전 동일(중복)', r, f'{len(rs)}건, 원문 동일={len(set(x["ja"] for x in rs)) == 1}')
    styles = collections.Counter(style_of(r['ko']) for r in acc)
    star_total = sum(1 for r in acc if r['star'] is not None)

    L = ['# 예문 해석(변형 A) 패턴 탐지', '',
         f'대상: `build/examples_ko.jsonl` {len(done)}개 배치, {len(recs)}줄 (정정 반영 {sum(1 for r in recs if r["fix"])}줄) (수락 {len(acc)}, 거부 {len(rej)}, 거부율 {len(rej) / len(recs):.2%})', '',
         '## 1. 거부율 분포', '']
    rs_sorted = sorted(rates.items(), key=lambda x: -x[1])
    q = sorted(rates.values())
    L.append(f'배치별 거부율: 최소 {q[0]:.1%} / 중앙 {statistics.median(q):.1%} / 최대 {q[-1]:.1%}')
    L.append('')
    L.append('거부 10건 이상 배치:')
    for b, (n, x) in sorted(per.items()):
        if x >= 10:
            L.append(f'- batch_{b}: {x}/{n} ({x / n:.1%})')
    L += ['', 'span_method별 거부율:']
    for sm in sorted(set(k[0] for k in span_rej), key=str):
        t = span_rej[(sm, True)] + span_rej[(sm, False)]
        L.append(f'- {sm}: {span_rej[(sm, True)]}/{t} ({span_rej[(sm, True)] / t:.1%})')
    L += ['', '## 2. 거부 사유 집합', '']
    for k, v in reasons.most_common():
        L.append(f'- `{k}` {v}')
    L += ['', '## 3. 해석 문체', '']
    for k, v in styles.most_common():
        L.append(f'- {k}: {v} ({v / len(acc):.1%})')
    L += ['', f'길이 비율(ko/ja, 공백 제외) 중앙값 {med:.2f}', '',
          f'`*` 힌트 있는 수락 줄 {star_total}건 중 뒤집음 {len(hits.get("* 힌트를 뒤집음", []))}건 '
          f'({len(hits.get("* 힌트를 뒤집음", [])) / max(star_total, 1):.1%})', '',
          '## 4. 패턴별 적중 (예시 최대 10건, seed 고정 무작위)', '']
    for key, rs in hits.items():
        L.append(f'### {key} — {len(rs)}건')
        L.append('')
        for r in (rnd.sample(rs, EX_N) if len(rs) > EX_N else rs):
            L.append(f"- b{r['batch']}:{r['seq']} **{r['word']}** [{r['note']}] sense={r['sense']} ({r['senses']})  ")
            L.append(f"  JA: {strip_strong(r['ja'])} / KO: {r['ko'].replace(STRONG_OPEN, '[').replace(STRONG_CLOSE, ']')}")
        L.append('')
    open(os.path.join(AUDIT, 'example_patterns.md'), 'w', encoding='utf-8').write('\n'.join(L) + '\n')
    json.dump({k: [{x: r[x] for x in ('batch', 'seq', 'word', 'sense', 'ko', 'note')} for r in v] for k, v in hits.items()},
              open(os.path.join(AUDIT, 'example_patterns_all.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print(f'배치 {len(done)}, 줄 {len(recs)}, 거부 {len(rej)}')
    for k, v in hits.items():
        print(f'{len(v):6d}  {k}')


if __name__ == '__main__':
    main()
