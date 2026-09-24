#!/usr/bin/env python3
"""표제어 구간 후리가나 고정 (적재 시점 보정 — 원본 jsonl 은 그대로).

unidic 형태소 읽기는 연탁(火山灰 かざんはい)·촉음(一局 いちきょく)·所(しょ/じょ)·동형이음
(紅葉 こうよう/もみじ, 音 おと/ね) 에서 사전 읽기와 어긋난다. 강조 구간(= 표제어 자리)만큼은
항목의 사전 읽기를 믿고 reading_tokens 를 고친다.

  - 정확 일치: 강조 텍스트 == 표제어 kanji_forms 중 하나 → 그 구간 토큰들을 하나로 합쳐
    split_okurigana(표기, 사전읽기) (20_build_examples 와 같은 송가나 규칙) 로 교체.
    표기 앞머리 가나(お兄さん 의 お, アメリカ人 의 アメリカ)는 읽기 앞부분과 같으면 [가나, null] 토큰으로 뗀다.
    현재 읽기가 같은 표기의 다른 항목 읽기(紅葉 こうよう↔もみじ)여도 사전 읽기로 교체하되 fixed_exact_homo 로 따로 센다.
  - 활용형: 강조 텍스트가 어떤 한자 표기의 한자부(어간, 끝 송가나 제외)로 시작 → 어간 구간 읽기만
    사전 읽기의 대응 부분(사전읽기 − 표기 송가나)으로 교체. 다음은 "애매"로 보고 건드리지 않는다:
    사전 읽기가 표기 송가나로 끝나지 않음 / 어간 안 가나(取り消す 의 り)가 어간 읽기에 제자리로 없음 /
    어간 끝이 토큰 중간인데 나머지가 히라가나가 아님 / カ変(来る) / 현재 어간 읽기가 같은 어간을 쓰는
    다른 항목의 읽기(断った: 断つ たつ ↔ 断る ことわる, 開けて: 開ける ひらける ↔ あける — index 필요).
  - 현재 읽기가 그 표기에 붙는 사전 읽기(appliesToKanji) 중 하나면 그대로 둔다(변경 최소).
  - 가나/가타카나 표제어, 강조 구간이 가나로 쓰인 경우는 대상 아님.

index = build_index(entries) 는 전 항목의 (표기 → 읽기), (어간 → 어간 읽기) 표. 없으면 동형어 판정을 생략한다.

reading_tokens 형식(20 과 동일): 한자 토큰 [surface, 한자부 읽기, 송가나], 기타 [surface, null].

  python3 scripts/reading_fix.py --test      # 단위 테스트
  python3 scripts/reading_fix.py --dry-run   # build/examples.jsonl · examples_generated.jsonl 적용 건수 집계
"""
import argparse
import importlib.util
import json
import os
import re
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
BUILD = os.path.join(ROOT, 'build')
STRONG_OPEN = '<strong class="target-word">'
STRONG_CLOSE = '</strong>'
HIRA_RE = re.compile(r'[ぁ-ゖー]+')
KANA_RE = re.compile(r'[ぁ-ヿ]')

_m20 = None


def m20():
    """20_build_examples 의 split_okurigana·KANJI_RE·half·kata2hira 를 그대로 쓴다(규칙 동일성)."""
    global _m20
    if _m20 is None:
        p = os.path.join(HERE, '20_build_examples.py')
        spec = importlib.util.spec_from_file_location('build_examples20', p)
        _m20 = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(_m20)
    return _m20


# ---------------------------------------------------------------- 항목 정보

def _texts(forms):
    out = []
    for f in forms or []:
        if isinstance(f, dict):
            out.append((f['text'], f.get('appliesToKanji') or []))
        else:
            out.append((f, ['*']))
    return out


def prep(entry):
    """항목 → {half(한자표기): [사전읽기(히라가나), ...대표 먼저]}. 캐시(entry['_rf'])."""
    if '_rf' in entry:
        return entry['_rf']
    m = m20()
    kana = _texts(entry.get('kana_forms'))
    primary = entry.get('reading')
    out = {}
    for kt, _ in _texts(entry.get('kanji_forms')):
        if not m.KANJI_RE.search(kt):
            continue
        rs = [t for t, app in kana if '*' in app or kt in app]
        rs.sort(key=lambda t: t != primary)
        rs = list(dict.fromkeys(m.kata2hira(t) for t in rs))
        if rs:
            out[m.half(kt)] = rs
    entry['_rf'] = out
    return out


def is_kahen(entry, form, reading):
    pos = {p for s in entry.get('senses') or [] for p in (s.get('pos') or [])}
    return 'vk' in pos or (form[-2:] in ('来る', '來る') and reading.endswith('くる'))


def _stem(form):
    okm = re.search(r'[ぁ-ゖー]+$', form)
    return (form[:okm.start()], okm.group(0)) if okm else (form, '')


def _stem_readings(okuri, rs):
    out = []
    for r in rs:
        if okuri:
            if r.endswith(okuri) and len(r) > len(okuri):
                out.append(r[:-len(okuri)])
        else:
            out.append(r)
    return out


def build_index(entries):
    """전 항목 → {'form': {표기: {읽기}}, 'stem': {어간: {어간 읽기}}} (동형어 판정용)."""
    form, stem = {}, {}
    for e in entries:
        for f, rs in prep(e).items():
            form.setdefault(f, set()).update(rs)
            st, ok = _stem(f)
            stem.setdefault(st, set()).update(_stem_readings(ok, rs))
    return {'form': form, 'stem': stem}


def make_tokens(surface, reading):
    """표층+읽기 → 토큰 목록. 앞머리 가나가 읽기 앞부분과 같으면 [가나, null] 로 떼고, 나머지는
    20 의 split_okurigana 규칙([표층, 한자부 읽기, 송가나])."""
    m = m20()
    p = re.match(r'[ぁ-ヿ]+', surface)
    if p and p.end() < len(surface):
        pre = p.group(0)
        hp = m.kata2hira(pre)
        if reading.startswith(hp) and len(reading) > len(hp):
            return [[pre, None], m.split_okurigana(surface[p.end():], reading[len(hp):])]
    return [m.split_okurigana(surface, reading)]


# ---------------------------------------------------------------- 토큰 도우미

def tok_reading(t):
    """토큰 1개의 가나 읽기. 한자인데 읽기 없음 → None."""
    m = m20()
    if len(t) >= 2 and t[1] is not None:
        return t[1] + (t[2] if len(t) > 2 and t[2] else '')
    if m.KANJI_RE.search(t[0]):
        return None
    return m.kata2hira(t[0])


def offsets(tokens):
    out, pos = [], 0
    for t in tokens:
        out.append((pos, pos + len(t[0])))
        pos += len(t[0])
    return out


def group_reading(tokens, i, j):
    rs = [tok_reading(t) for t in tokens[i:j + 1]]
    return None if any(r is None for r in rs) else ''.join(rs)


def locate(ja_plain, strong_text, start):
    """강조 시작 위치 후보(주어지면 그것만)."""
    if start is not None:
        return [start] if ja_plain[start:start + len(strong_text)] == strong_text else []
    out, k = [], ja_plain.find(strong_text)
    while k >= 0:
        out.append(k)
        k = ja_plain.find(strong_text, k + 1)
    return out


# ---------------------------------------------------------------- 본체

def analyze(entry, ja_plain, strong_text, reading_tokens, start=None, index=None, homo='fix'):
    """반환 (new_tokens, status). status:
    ok_exact / ok_conj           — 이미 사전 읽기와 일치(변경 없음)
    fixed_exact / fixed_conj     — 교체함 (fixed_exact_homo: 현재 읽기가 같은 표기 다른 항목의 읽기)
    na:<사유>                    — 대상 아님(가나 표제어, 강조가 가나 등)
    skip:<사유>                  — 대상이지만 애매해서 건드리지 않음(잔여)"""
    m = m20()
    if not reading_tokens or not strong_text:
        return reading_tokens, 'na:입력없음'
    forms = prep(entry)
    if not forms:
        return reading_tokens, 'na:가나표제어'
    strong = m.half(strong_text)
    if not m.KANJI_RE.search(strong):
        return reading_tokens, 'na:강조가나'
    toks = reading_tokens
    if ''.join(t[0] for t in toks) != ja_plain:
        return reading_tokens, 'skip:토큰≠원문'
    offs = offsets(toks)
    starts = {a: i for i, (a, _) in enumerate(offs)}
    ends = {b: i for i, (_, b) in enumerate(offs)}
    cands = locate(ja_plain, strong_text, start)
    if not cands:
        return reading_tokens, 'skip:강조위치'

    # 1) 정확 일치
    if strong in forms:
        rs = forms[strong]
        for a in cands:
            b = a + len(strong_text)
            if a in starts and b in ends:
                i, j = starts[a], ends[b]
                cur = group_reading(toks, i, j)
                if cur in rs:
                    return reading_tokens, 'ok_exact'
                new = [list(t) for t in toks[:i]] + make_tokens(strong_text, rs[0]) + \
                    [list(t) for t in toks[j + 1:]]
                if index is not None and cur in index['form'].get(strong, ()):
                    if homo == 'skip':
                        return reading_tokens, 'skip:동형표기'
                    return new, 'fixed_exact_homo'
                return new, 'fixed_exact'
        return reading_tokens, 'skip:경계불일치'

    # 2) 활용형 / 파생: 한자부(어간)로 시작
    best = None
    for f, rs in forms.items():
        stem, okuri = _stem(f)
        if not stem or not strong.startswith(stem) or len(strong) == len(f) and strong == f:
            continue
        if best is None or len(stem) > len(best[1]):
            best = (f, stem, okuri, rs)
    if best is None:
        return reading_tokens, 'na:표기불일치'
    f, stem, okuri, rs = best
    if is_kahen(entry, f, rs[0]):
        return reading_tokens, 'skip:カ変'
    stem_rs = _stem_readings(okuri, rs)
    if KANA_RE.search(stem):
        # 어간 안 가나(取り消す 의 り)는 어간 읽기 안에 그 자리대로 있어야 정렬이 확실하다
        pat = re.compile(''.join('.+' if m.KANJI_RE.match(ch) else re.escape(m.kata2hira(ch))
                                 for ch in stem).replace('.+.+', '.+').replace('.+.+', '.+') + '$')
        stem_rs = [sr for sr in stem_rs if pat.match(sr)]
    if not stem_rs:
        return reading_tokens, 'skip:어간읽기'
    for a in cands:
        if a not in starts:
            continue
        se = a + len(stem)
        i = starts[a]
        k = i
        while k < len(toks) and offs[k][1] < se:
            k += 1
        if k >= len(toks):
            continue
        end = offs[k][1]
        extra = ja_plain[se:end]
        if extra and not HIRA_RE.fullmatch(extra):
            return reading_tokens, 'skip:어간경계'
        cur = group_reading(toks, i, k)
        if cur is not None and any(cur == sr + extra for sr in stem_rs):
            return reading_tokens, 'ok_conj'
        if index is not None and cur is not None and cur.endswith(extra) and \
                cur[:len(cur) - len(extra)] in index['stem'].get(stem, ()):
            return reading_tokens, 'skip:동형어간'
        new = [list(t) for t in toks[:i]] + make_tokens(ja_plain[a:end], stem_rs[0] + extra) + \
            [list(t) for t in toks[k + 1:]]
        return new, 'fixed_conj'
    return reading_tokens, 'skip:경계불일치'


def fix_reading_tokens(entry, ja_plain, strong_text, reading_tokens, start=None, index=None, homo='fix'):
    """analyze 의 토큰만 돌려준다(변경 없으면 입력 그대로)."""
    return analyze(entry, ja_plain, strong_text, reading_tokens, start, index, homo)[0]


def split_strong(ja):
    """강조 포함 원문 → (ja_plain, strong_text, start). 태그가 없으면 (plain, None, None)."""
    a = ja.find(STRONG_OPEN)
    b = ja.find(STRONG_CLOSE)
    plain = ja.replace(STRONG_OPEN, '').replace(STRONG_CLOSE, '')
    if a < 0 or b < a:
        return plain, None, None
    return plain, ja[a + len(STRONG_OPEN):b], a


def fix_example(entry, ja, reading_tokens, index=None, homo='fix'):
    """강조 포함 원문 기준 편의 함수 → (new_tokens, status)."""
    plain, st, a = split_strong(ja)
    if st is None:
        return reading_tokens, 'na:강조없음'
    return analyze(entry, plain, st, reading_tokens, a, index, homo)


# ---------------------------------------------------------------- 테스트 / 집계

def _ent(word, reading, kanji, kana=None, pos=('n',)):
    return {'word': word, 'reading': reading,
            'kanji_forms': [{'text': k} for k in kanji],
            'kana_forms': [{'text': t, 'appliesToKanji': ['*']} for t in (kana or [reading])],
            'senses': [{'sense_no': 1, 'pos': list(pos)}]}


def selftest():
    cases = [
        ('火山灰 연탁', _ent('火山灰', 'かざんばい', ['火山灰']), '火山灰が降った。', '火山灰',
         [['火山', 'かざん', ''], ['灰', 'はい', ''], ['が', None], ['降っ', 'ふ', 'っ'], ['た', None], ['。', None]],
         [['火山灰', 'かざんばい', ''], ['が', None], ['降っ', 'ふ', 'っ'], ['た', None], ['。', None]], 'fixed_exact'),
        ('一局 촉음', _ent('一局', 'いっきょく', ['一局', '1局']), '碁を一局打った。', '一局',
         [['碁', 'ご', ''], ['を', None], ['一', 'いち', ''], ['局', 'きょく', ''], ['打っ', 'う', 'っ'], ['た', None], ['。', None]],
         [['碁', 'ご', ''], ['を', None], ['一局', 'いっきょく', ''], ['打っ', 'う', 'っ'], ['た', None], ['。', None]], 'fixed_exact'),
        ('製油所 じょ', _ent('製油所', 'せいゆじょ', ['製油所']), '製油所が止まった。', '製油所',
         [['製油', 'せいゆ', ''], ['所', 'しょ', ''], ['が', None], ['止まっ', 'と', 'まっ'], ['た', None], ['。', None]],
         [['製油所', 'せいゆじょ', ''], ['が', None], ['止まっ', 'と', 'まっ'], ['た', None], ['。', None]], 'fixed_exact'),
        ('紅葉 もみじ(사전 읽기 기준)', _ent('紅葉', 'もみじ', ['紅葉', '黄葉', '椛']), '山の紅葉が美しい。', '紅葉',
         [['山', 'やま', ''], ['の', None], ['紅葉', 'こうよう', ''], ['が', None], ['美しい', 'うつく', 'しい'], ['。', None]],
         [['山', 'やま', ''], ['の', None], ['紅葉', 'もみじ', ''], ['が', None], ['美しい', 'うつく', 'しい'], ['。', None]], 'fixed_exact'),
        ('怖かった 활용형', _ent('怖い', 'こわい', ['怖い', '恐い'], pos=('adj-i',)), '夜道が怖かった。', '怖かった',
         [['夜道', 'よみち', ''], ['が', None], ['怖かっ', 'おそ', 'かっ'], ['た', None], ['。', None]],
         [['夜道', 'よみち', ''], ['が', None], ['怖かっ', 'こわ', 'かっ'], ['た', None], ['。', None]], 'fixed_conj'),
        # 보조: 이미 맞으면 그대로 / カ変 제외 / 가나 표제어 제외 / 두 토큰 어간 활용
        ('怖かった 이미 일치', _ent('怖い', 'こわい', ['怖い'], pos=('adj-i',)), '夜道が怖かった。', '怖かった',
         [['夜道', 'よみち', ''], ['が', None], ['怖かっ', 'こわ', 'かっ'], ['た', None], ['。', None]], None, 'ok_conj'),
        ('来た カ変 제외', _ent('来る', 'くる', ['来る', '來る'], pos=('vk',)), '彼が来た。', '来た',
         [['彼', 'かれ', ''], ['が', None], ['来', 'き', ''], ['た', None], ['。', None]], None, 'skip:カ変'),
        ('가타카나 표제어', _ent('パン', 'パン', []), 'パンを食べた。', 'パン',
         [['パン', None], ['を', None], ['食べ', 'た', 'べ'], ['た', None], ['。', None]], None, 'na:가나표제어'),
        ('勉強した 파생(する)', _ent('勉強', 'べんきょう', ['勉強']), '毎日勉強した。', '勉強した',
         [['毎日', 'まいにち', ''], ['勉', 'つとむ', ''], ['強', 'きょう', ''], ['し', None], ['た', None], ['。', None]],
         [['毎日', 'まいにち', ''], ['勉強', 'べんきょう', ''], ['し', None], ['た', None], ['。', None]], 'fixed_conj'),
        ('取り消した 어간 가나', _ent('取り消す', 'とりけす', ['取り消す', '取消す'], pos=('v5s',)), '予約を取り消した。', '取り消した',
         [['予約', 'よやく', ''], ['を', None], ['取り', 'しゅ', 'り'], ['消し', 'しょう', 'し'], ['た', None], ['。', None]],
         [['予約', 'よやく', ''], ['を', None], ['取り消し', 'とりけし', ''], ['た', None], ['。', None]], 'fixed_conj'),
        ('お兄さん 앞머리 가나 분리', _ent('お兄さん', 'おにいさん', ['お兄さん']), '私のお兄さんだ。', 'お兄さん',
         [['私', 'わたし', ''], ['の', None], ['お', None], ['兄', 'あに', ''], ['さん', None], ['だ', None], ['。', None]],
         [['私', 'わたし', ''], ['の', None], ['お', None], ['兄さん', 'にい', 'さん'], ['だ', None], ['。', None]], 'fixed_exact'),
        ('断った 동형 어간(断る) 제외', _ent('断つ', 'たつ', ['断つ'], pos=('v5t',)), '誘いを断った。', '断った',
         [['誘い', 'さそ', 'い'], ['を', None], ['断っ', 'ことわ', 'っ'], ['た', None], ['。', None]], None, 'skip:동형어간'),
    ]
    idx = build_index([_ent('断る', 'ことわる', ['断る'], pos=('v5r',)), _ent('断つ', 'たつ', ['断つ'], pos=('v5t',)),
                       _ent('紅葉', 'こうよう', ['紅葉']), _ent('紅葉', 'もみじ', ['紅葉'])])
    cases[3] = cases[3][:-1] + ('fixed_exact_homo',)
    fails = 0
    for name, e, plain, st, toks, want, want_status in cases:
        got, status = analyze(e, plain, st, toks, index=idx)
        exp = want if want is not None else toks
        ok = got == exp and status == want_status
        # 멱등: 고친 결과를 다시 넣으면 ok_* 로 변경 없음
        if ok and status.startswith('fixed'):
            again, s2 = analyze(e, plain, st, got, index=idx)
            ok = again == got and s2.startswith('ok')
        print(f'  {"OK  " if ok else "FAIL"} {name}: {status}' + ('' if ok else f'\n       got {got}\n       exp {exp}'))
        fails += not ok
    if fails:
        sys.exit(f'reading_fix 테스트 실패 {fails}건')
    print(f'reading_fix 테스트 {len(cases)}건 통과')


def dry_run():
    ents = {}
    with open(os.path.join(BUILD, 'entries.jsonl'), encoding='utf-8') as f:
        for line in f:
            e = json.loads(line)
            ents[e['jmdict_id']] = e
    idx = build_index(ents.values())
    ko = {}
    p = os.path.join(BUILD, 'examples_ko.jsonl')
    if os.path.exists(p):
        with open(p, encoding='utf-8') as f:
            for line in f:
                k = json.loads(line)
                ko[(k['jmdict_id'], k['tatoeba_ja_id'])] = k
    for label, fn in (('Tatoeba', 'examples.jsonl'), ('생성', 'examples_generated.jsonl')):
        c_all, c_load = Counter(), Counter()
        samples = []
        with open(os.path.join(BUILD, fn), encoding='utf-8') as f:
            for line in f:
                x = json.loads(line)
                e = ents.get(x['jmdict_id'])
                if e is None:
                    continue
                new, st = fix_example(e, x['ja'], x.get('reading_tokens'), idx)
                c_all[st] += 1
                loaded = True
                if label == 'Tatoeba':
                    k = ko.get((x['jmdict_id'], x['tatoeba_ja_id']))
                    loaded = k is not None and not k.get('rejected') and (k.get('ko') or '').strip()
                if loaded:
                    c_load[st] += 1
                if st.startswith('fixed') and len(samples) < 8:
                    _, s, a = split_strong(x['ja'])
                    old = [t for t in x['reading_tokens'] if t not in new]
                    samples.append(f'{e["word"]}[{e["reading"]}] 「{s}」 {old} → {[t for t in new if t not in x["reading_tokens"]]}')
        tot = sum(c_all.values())
        print(f'\n== {label} ({fn}) 예문 {tot:,} / 적재 대상 {sum(c_load.values()):,}')
        for k in sorted(c_all, key=lambda k: (k.split(':')[0], -c_all[k])):
            print(f'  {k:<16} 전체 {c_all[k]:>7,}   적재대상 {c_load[k]:>7,}')
        fx = c_load['fixed_exact'] + c_load['fixed_exact_homo'] + c_load['fixed_conj']
        print(f'  → 적재 대상 중 교체 {fx:,} (정확 {c_load["fixed_exact"]:,} · 정확-동형어 {c_load["fixed_exact_homo"]:,}'
              f' · 활용 {c_load["fixed_conj"]:,})')
        for s in samples:
            print('   예)', s)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--test', action='store_true')
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()
    if a.test or not a.dry_run:
        selftest()
    if a.dry_run:
        dry_run()


if __name__ == '__main__':
    main()
