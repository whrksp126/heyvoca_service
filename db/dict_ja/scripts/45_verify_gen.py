"""예문 생성(변형 B) 전량 패턴 탐지 — build/examples_generated.jsonl(35 적용 결과) 대상.

결과: audit/gen_patterns.md (건수 + 예시 최대 10건씩), audit/gen_patterns_all.json (전체 적중 목록)
표제어·JLPT·뜻목록은 원 배치 입력(batches/example_gen/batch_NNNN.txt + manifest)에서 읽는다. 배치 파일은 읽기만 한다.
한자 난이도는 상용한자표가 없어 sources/jlpt/n*.csv 어휘의 한자 집합으로 근사한다.
"""
import collections
import csv
import difflib
import json
import os
import random
import re
import statistics
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from batch_common import AUDIT, BATCHES, ENTRIES, EXAMPLES_GEN, ROOT, STRONG_OPEN, STRONG_CLOSE, load_manifest, strip_strong  # noqa: E402

SEED = 45
EX_N = 10
KANJI = re.compile(r'[㐀-䶿一-鿿豈-﫿]')
JA_CHARS = re.compile(r'[぀-ヿ一-鿿㐀-䶿ｦ-ﾟ]')
JA_QUOTES = re.compile(r'[「」・〜～『』]')
PUNCT_ALL = re.compile(r'[\s、。，．・！？!?「」『』（）()…〜～,.]')
STRONG_RE = re.compile(re.escape(STRONG_OPEN) + r'(.*?)' + re.escape(STRONG_CLOSE))
KO_PART_1 = set('을를이가은는에의와과도로만')
KO_PART_2 = ('에서', '으로', '에게', '까지', '부터', '처럼', '보다', '이나', '에는', '와의', '과의')
JA_PART = set('をがはにでのへとも')
LATIN = re.compile(r'[A-Za-z]{2,}')


def kata2hira(t):
    return ''.join(chr(ord(c) - 0x60) if 'ァ' <= c <= 'ヶ' else c for c in t)


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


def jlpt_kanji():
    """급수별 누적 한자 집합(N5 ⊂ N5+N4 ⊂ ...), 어휘 표기에서 추출."""
    per = {}
    for lv in ('n5', 'n4', 'n3', 'n2', 'n1'):
        s = set()
        for row in csv.DictReader(open(os.path.join(ROOT, 'sources', 'jlpt', f'{lv}.csv'), encoding='utf-8')):
            s |= set(KANJI.findall(row.get('kanji') or ''))
        per[lv.upper()] = s
    cum, acc = {}, set()
    for lv in ('N5', 'N4', 'N3', 'N2', 'N1'):
        acc |= per[lv]
        cum[lv] = set(acc)
    return cum


def meanings_of(senses, sno):
    for part in senses.split('|'):
        m = re.match(r'^\*?(\d+):(.*)$', part)
        if m and int(m.group(1)) == sno:
            return [re.sub(r'\(.*?\)', '', x).strip() for x in m.group(2).split('/') if x.strip()]
    return []


def span_reading(r):
    """strong 구간과 겹치는 토큰들의 읽기(히라가나)와 surface. 토큰 경계가 구간과 정확히 맞을 때만 반환."""
    plain = r['ja_plain']
    a = r['ja'].index(STRONG_OPEN)
    b = a + len(STRONG_RE.search(r['ja']).group(1))
    pos, surf, rd, exact_a, exact_b = 0, '', '', False, False
    for t in r['reading_tokens']:
        s = t[0]
        i = plain.find(s, pos)
        if i < 0:
            return None
        j = i + len(s)
        pos = j
        if j <= a or i >= b:
            continue
        exact_a |= i == a
        exact_b |= j == b
        surf += s
        rd += (t[1] + t[2]) if len(t) > 2 and t[1] else kata2hira(s)
    if not (exact_a and exact_b):
        return None
    return surf, rd


def style_of(ko):
    t = re.sub(r'[\s.!?。"\'」』)\]…~]+$', '', ko)
    if re.search(r'(습니다|습니까|니다|니까)$', t):
        return '합쇼체'
    if re.search(r'(요|죠)$', t):
        return '해요체'
    if re.search(r'(다|라|냐|자|까|군|네|지|니)$', t):
        return '평서/해라체'
    return '반말·기타'


def ed_ratio(x, y):
    return difflib.SequenceMatcher(None, x, y).ratio()


def main():
    inp = load_inputs()
    ent = {}
    for l in open(ENTRIES, encoding='utf-8'):
        e = json.loads(l)
        ent[e['jmdict_id']] = e
    recs = []
    for l in open(EXAMPLES_GEN, encoding='utf-8'):
        if not l.strip():
            continue
        r = json.loads(l)
        c = inp.get(r['jmdict_id'])
        if not c:
            continue
        r['word'], r['reading'], r['jlpt'], r['senses'] = c[1], c[2], c[3], c[4]
        r['ko_plain'] = strip_strong(r['ko'])
        r['ja_in'] = STRONG_RE.search(r['ja']).group(1)
        r['ko_in'] = STRONG_RE.search(r['ko']).group(1)
        recs.append(r)
    by = collections.defaultdict(list)
    for r in recs:
        by[r['jmdict_id']].append(r)
    words = {j: sorted(rs, key=lambda x: x['seq']) for j, rs in by.items() if len(rs) == 2}
    kset = jlpt_kanji()
    rnd = random.Random(SEED)
    hits = collections.OrderedDict()
    stats = {}

    def add(key, r, note=''):
        hits.setdefault(key, []).append(dict(r, note=note))

    # 1. 같은 단어 두 예문 유사도
    sims = []
    for j, (x, y) in words.items():
        s = ed_ratio(x['ja_plain'], y['ja_plain'])
        sims.append(s)
        if s >= 0.75:
            add('같은 단어 두 예문 사실상 동일(유사도≥0.75)', x, f'{s:.2f} / 2: {y["ja_plain"]}')
        elif s >= 0.6:
            add('같은 단어 두 예문 유사(0.6≤유사도<0.75)', x, f'{s:.2f} / 2: {y["ja_plain"]}')
        if x['ko_plain'] == y['ko_plain']:
            add('같은 단어 두 예문 한국어 동일', x)
    stats['sim'] = sims
    # 2. 길이 분포
    lens = collections.defaultdict(list)
    for r in recs:
        n = len(PUNCT_ALL.sub('', r['ja_plain']))
        lv = r['jlpt'] if r['jlpt'] != '-' else '없음'
        lens[lv].append(n)
    # 3~. 문장 단위 검사
    starts = 0
    both_start = 0
    endings = collections.Counter()
    openers = collections.Counter()
    wa_desu = 0
    sense_non1 = 0
    rd_checked = rd_bad = 0
    ko_mismatch = 0
    styles = collections.Counter()
    for r in recs:
        ja, ko, ji, ki = r['ja_plain'], r['ko_plain'], r['ja_in'], r['ko_in']
        if not re.search(r'[。！？!?」]$', ja):
            add('일본어 문장 끝 부호 누락', r)
        if not re.search(r'[.!?。…"\'”]$', ko.strip()):
            add('한국어 문장 끝 부호 누락', r)
        if JA_CHARS.search(ko):
            add('한국어에 일본어 문자(가나·한자) 잔존', r, ''.join(sorted(set(JA_CHARS.findall(ko)))))
        if JA_QUOTES.search(ko):
            add('한국어에 「」·『』·〜 잔존', r, ''.join(sorted(set(JA_QUOTES.findall(ko)))))
        lat = [w for w in LATIN.findall(ko) if w.lower() not in ja.lower()]
        if lat:
            add('한국어에 영어 잔존(일본어에 없는 라틴 2자+)', r, ','.join(lat))
        # 한국어 강조 조사 삼킴: 뜻 명사 + 조사
        means = meanings_of(r['senses'], r['sense_no'])
        kin = ki.strip()
        swallowed = False
        for m in means:
            if not m:
                continue
            for p in KO_PART_2:
                if kin == m + p:
                    swallowed = True
            if len(kin) == len(m) + 1 and kin.startswith(m) and kin[-1] in KO_PART_1:
                swallowed = True
        if swallowed:
            add('한국어 강조 안 조사 삼킴(뜻 명사+조사)', r, kin)
        elif len(kin) > 1 and kin[-1] in KO_PART_1 and not re.search(r'(했|었|았|됐|였)$', kin):
            add('한국어 강조가 조사 음절로 끝남(참고: 오탐 많음)', r, kin)
        if re.search(r'[.,!?"\'()]', kin):
            add('한국어 강조 안 구두점', r, kin)
        if len(kin.split()) >= 3:
            add('한국어 강조 3어절 이상', r, kin)
        # 일본어 강조 조사 포함
        if ji and ji[-1] in JA_PART and not r['word'].endswith(ji[-1]) and not r['reading'].endswith(ji[-1]):
            e = ent.get(r['jmdict_id'], {})
            forms = [f['text'] for f in e.get('kanji_forms', []) + e.get('kana_forms', [])]
            if not any(f.endswith(ji[-1]) for f in forms):
                add('일본어 강조가 조사로 끝남(조사 삼킴 의심)', r, ji)
        # 강조 대응(휴리스틱): 뜻 단어 앞 2글자가 한국어 강조에 없음
        keys = [re.sub(r'[^가-힣A-Za-z0-9]', '', m)[:2] for m in means]
        keys = [k for k in keys if k]
        if keys and not any(k in kin.replace(' ', '') for k in keys):
            ko_mismatch += 1
            add('한국어 강조가 뜻목록 해당 sense 단어와 불일치(휴리스틱, 오탐 다수)', r, f'{kin} ↔ {"/".join(means)}')
        # 표제어 문장 첫머리
        if r['ja'].startswith(STRONG_OPEN):
            starts += 1
        # 문형
        endings[re.sub(r'.*?((?:でした|です|ました|ます|ている|ていた|てしまった|た|だ|る|い|う|く|す|つ|ぬ|ぶ|む|ぐ|か))[。！？!?]$', r'\1', ja) if re.search(r'[。！？]$', ja) else '(부호 없음)'] += 1
        mo = re.match(r'^(彼女は|彼は|私は|この|その|あの|父は|母は|兄は|姉は|弟は|妹は|祖母は|祖父は|先生は|田中さんは|山田さんは)', ja)
        openers[mo.group(1) if mo else '(기타)'] += 1
        if re.match(r'^[^、。]*は[^、。]*(です|だ)。$', ja):
            wa_desu += 1
        if r['sense_no'] != 1:
            sense_non1 += 1
        # 표제어 재등장(깨진 문장 의심)
        e = ent.get(r['jmdict_id'], {})
        if len(r['word']) >= 2 and ja.count(r['word']) >= 2:
            add('표제어가 한 문장에 2회 이상(깨진 문장 의심)', r)
        # 표제어 읽기 토큰 불일치(표기가 표제어와 정확히 같고 한자 포함일 때)
        if KANJI.search(ji):
            sr = span_reading(r)
            if sr and sr[0] == ji and ji in {f['text'] for f in e.get('kanji_forms', [])} | {r['word']}:
                rd_checked += 1
                kanas = {kata2hira(k['text']) for k in e.get('kana_forms', [])} | {kata2hira(r['reading'])}
                if sr[1] not in kanas:
                    rd_bad += 1
                    add('표제어 읽기 토큰이 사전 읽기와 다름(후리가나 오표기)', r, f'{sr[1]} ≠ {"/".join(sorted(kanas))}')
        # 복합어 일부 강조: 강조 앞뒤가 한자, 또는 형태소 토큰이 강조 경계를 가로지름
        a = r['ja'].index(STRONG_OPEN)
        b = a + len(ji)
        adj = (a > 0 and KANJI.search(ja[a - 1])) or (b < len(ja) and KANJI.search(ja[b]))
        cut = False
        pos = 0
        for t in r['reading_tokens']:
            i = ja.find(t[0], pos)
            if i < 0:
                break
            j = i + len(t[0])
            pos = j
            if (i < a < j) or (i < b < j):
                cut = True
        if cut:
            add('형태소 토큰이 강조 경계를 가로지름(더 큰 단어의 일부만 강조)', r, ji)
        elif adj:
            add('강조 앞뒤가 한자(복합어 구성, 대부분 정상)', r, ji)
        styles[style_of(ko)] += 1
        # 한자 난이도
        if r['jlpt'] in ('N5', 'N4'):
            ks = set(KANJI.findall(ja)) - set(KANJI.findall(r['word']))
            hard = sorted(ks - kset['N3'])
            if hard:
                add(f'{r["jlpt"]} 예문에 N3 초과 한자(JLPT 어휘 한자 근사)', r, ''.join(hard))
        ks = set(KANJI.findall(ja)) - set(KANJI.findall(r['word']))
        out = sorted(ks - kset['N1'])
        if out:
            add('JLPT 어휘 전체에 없는 한자(상용 외 근사, 표제어 한자 제외)', r, ''.join(out))
    both = sum(1 for x, y in words.values() if x['ja'].startswith(STRONG_OPEN) and y['ja'].startswith(STRONG_OPEN))
    # 전량 한국어/일본어 동일
    ko_grp = collections.defaultdict(set)
    ja_grp = collections.defaultdict(set)
    for r in recs:
        ko_grp[r['ko_plain'].strip()].add(r['jmdict_id'])
        ja_grp[r['ja_plain']].add(r['jmdict_id'])
    for r in recs:
        n = len(ko_grp[r['ko_plain'].strip()])
        if n > 1:
            add('다른 단어와 한국어 해석 완전 동일', r, f'{n}단어')
        n = len(ja_grp[r['ja_plain']])
        if n > 1:
            add('다른 단어와 일본어 문장 완전 동일', r, f'{n}단어')
    # 문장 틀(표제어 자리 X) 공유
    skel = collections.defaultdict(set)
    for r in recs:
        skel[STRONG_RE.sub('X', r['ja'])].add(r['jmdict_id'])
    big = sorted(((len(v), k) for k, v in skel.items() if len(v) >= 3), reverse=True)

    N = len(recs)
    L = ['# 예문 생성(변형 B) 전량 패턴 탐지', '',
         f'대상: `build/examples_generated.jsonl` {N}문장 / {len(words)}단어 (배치 {len({r.get("batch") for r in recs})}개)', '',
         '## 1. 요약 지표', '',
         f'- 같은 단어 두 예문 유사도(difflib ratio): 중앙 {statistics.median(sims):.2f}, ≥0.75 {sum(s >= 0.75 for s in sims)}단어 ({sum(s >= 0.75 for s in sims) / len(sims):.1%}), ≥0.6 {sum(s >= 0.6 for s in sims)}단어',
         f'- 표제어가 문장 첫머리: {starts}/{N} ({starts / N:.1%}), 두 예문 모두 첫머리 {both}단어 ({both / len(words):.1%})',
         f'- 「〜は〜です/だ。」 단문형: {wa_desu}/{N} ({wa_desu / N:.1%})',
         f'- sense_no≠1: {sense_non1}/{N} ({sense_non1 / N:.1%})',
         f'- 표제어 읽기 토큰 검사 {rd_checked}건 중 사전 읽기와 불일치 {rd_bad}건 ({rd_bad / max(rd_checked, 1):.1%})',
         f'- 다른 단어와 한국어 완전 동일: {len(hits.get("다른 단어와 한국어 해석 완전 동일", []))}문장, 일본어 완전 동일: {len(hits.get("다른 단어와 일본어 문장 완전 동일", []))}문장',
         '', '## 2. 길이 분포(구두점·공백 제외 일본어 글자 수)', '', '| 급수 | 문장 | 최소 | 25% | 중앙 | 75% | 최대 | 평균 |', '|---|---|---|---|---|---|---|---|']
    for lv in ('N5', 'N4', 'N3', 'N2', 'N1', '없음'):
        v = sorted(lens.get(lv, []))
        if v:
            q = statistics.quantiles(v, n=4) if len(v) > 1 else [v[0]] * 3
            L.append(f'| {lv} | {len(v)} | {v[0]} | {q[0]:.0f} | {q[1]:.0f} | {q[2]:.0f} | {v[-1]} | {statistics.mean(v):.1f} |')
    L += ['', '## 3a. 한국어 문체', '']
    for k, v in styles.most_common():
        L.append(f'- {k}: {v} ({v / N:.1%})')
    L += ['', '## 3. 일본어 문장 끝 형태(상위 15)', '']
    for k, v in endings.most_common(15):
        L.append(f'- `{k}。` {v} ({v / N:.1%})')
    L += ['', '## 4. 문두 패턴', '']
    for k, v in openers.most_common(15):
        L.append(f'- `{k}` {v} ({v / N:.1%})')
    L += ['', '## 5. 문장 틀 공유(표제어 자리만 다른 동일 문장, 3단어 이상)', '']
    for n, k in big[:20]:
        L.append(f'- {n}단어: `{k}`')
    L += ['', '## 6. 패턴별 적중 (예시 최대 10건, seed 고정 무작위)', '']
    for key, rs in hits.items():
        L.append(f'### {key} — {len(rs)}건')
        L.append('')
        for r in (rnd.sample(rs, EX_N) if len(rs) > EX_N else rs):
            L.append(f"- b{r.get('batch')} {r['jmdict_id']}:{r['seq']} **{r['word']}**({r['jlpt']}) [{r['note']}] s{r['sense_no']} ({r['senses']})  ")
            L.append(f"  JA: {r['ja'].replace(STRONG_OPEN, '[').replace(STRONG_CLOSE, ']')} / KO: {r['ko'].replace(STRONG_OPEN, '[').replace(STRONG_CLOSE, ']')}")
        L.append('')
    open(os.path.join(AUDIT, 'gen_patterns.md'), 'w', encoding='utf-8').write('\n'.join(L) + '\n')
    json.dump({k: [{x: r.get(x) for x in ('jmdict_id', 'seq', 'word', 'jlpt', 'sense_no', 'ja_plain', 'ko', 'note')} for r in v] for k, v in hits.items()},
              open(os.path.join(AUDIT, 'gen_patterns_all.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print(f'문장 {N}, 단어 {len(words)}')
    for k, v in hits.items():
        print(f'{len(v):6d}  {k}')


if __name__ == '__main__':
    main()
