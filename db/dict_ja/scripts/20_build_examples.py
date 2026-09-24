#!/usr/bin/env python3
"""2단계: Tatoeba 예문 매칭 · 강조 위치 · 후리가나 → build/examples.jsonl

실행: docker exec heyvoca_dictja_work python3 scripts/20_build_examples.py
입력: build/entries.jsonl, sources/tatoeba/{jpn_indices.csv, jpn_sentences.tsv,
      eng_sentences.tsv, jpn-eng_links.tsv, jpn-kor_links.tsv, kor_sentences.tsv}
출력: build/examples.jsonl (선정, 항목당 ≤4), build/examples_pool.jsonl (재선정용 후보, 항목당 ≤POOL_CAP),
      build/need_generation.json (예문 0개 항목), build/stats_examples.md
멱등: 입력만 읽고 출력을 매번 새로 쓴다.

색인 토큰 형식: 표제어(읽기|#jmdict_id)[뜻번호]{표층형}~  (괄호부 모두 선택적, ~ = 검수된 좋은 예문)
"""
import json
import os
import re
import sys
import time
from collections import Counter, defaultdict

import fugashi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'sources', 'tatoeba')
BUILD = os.path.join(ROOT, 'build')
ENTRIES = os.path.join(BUILD, 'entries.jsonl')
OUT = os.path.join(BUILD, 'examples.jsonl')
POOL = os.path.join(BUILD, 'examples_pool.jsonl')
NEED = os.path.join(BUILD, 'need_generation.json')
STATS = os.path.join(BUILD, 'stats_examples.md')

MAX_PER_ENTRY = 3
POOL_CAP = 20          # 항목당 풀에 남길 후보 수(순위 상위)
MAX_LEN = 60
GOOD_LEN = (8, 45)
JLPT_ORDER = ['N5', 'N4', 'N3', 'N2', 'N1']
STRONG_OPEN = '<strong class="target-word">'
STRONG_CLOSE = '</strong>'

TOKEN_RE = re.compile(r'^([^(\[{~]+)(?:\(([^)]*)\))?(?:\[(\d+)\])?(?:\{([^}]*)\})?(~)?$')
KANJI_RE = re.compile(r'[㐀-䶿一-鿿豈-﫿々〆ヶ]')
JA_RE = re.compile(r'[぀-ヿ㐀-䶿一-鿿]')
BAD_CHARS_RE = re.compile(r'[<>&\t\r\n\x00-\x1f]')
# 강조 끝에 단독으로 오면 안 되는 조사
END_PARTICLES = {'は', 'が', 'を', 'に', 'の', 'へ', 'と', 'で'}
CONJ_POS = {'動詞', '形容詞', '助動詞', '形状詞'}
# unidic-lite 의 문어적 읽기 → 학습자용 표준 읽기 (surface, 원 katakana) → hiragana
READING_FIX = {
    ('私', 'ワタクシ'): 'わたし',     # 문어적 わたくし → 표준 わたし
    ('言う', 'ユウ'): 'いう',        # 발음형 ゆう → 표기형 いう
}
# unidic-lite 는 何 를 거의 항상 ナン 으로 읽는다 → 다음 토큰이 이것들로 시작하면 なに
NANI_NEXT = ('を', 'が', 'も', 'か', 'より', '事', '気', '物', '者', '一つ', '色', '語')
UNINDEXED_MIN_LEN = 5   # 비색인 보충 매칭에서 문장 최소 길이

FULLWIDTH = str.maketrans(
    'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ０１２３４５６７８９',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')


def half(t):
    """전각 영숫자 → 반각. 1:1 문자 치환이라 문자열 위치(offset)가 보존된다."""
    return t.translate(FULLWIDTH)


def kata2hira(t):
    return ''.join(chr(ord(c) - 0x60) if 'ァ' <= c <= 'ヶ' else c for c in t)


def form_texts(forms):
    """kanji_forms/kana_forms: 문자열 배열(구형) 또는 [{"text",...}] 객체 배열(신형) 모두 지원."""
    out = []
    for f in forms or []:
        out.append(f['text'] if isinstance(f, dict) else f)
    return out


# ---------------------------------------------------------------- 로드

def load_entries():
    entries = {}
    by_form = defaultdict(set)
    for line in open(ENTRIES, encoding='utf-8'):
        e = json.loads(line)
        kf = [half(t) for t in form_texts(e.get('kanji_forms'))]
        kn = [half(t) for t in form_texts(e.get('kana_forms'))]
        word = half(e['word'])
        forms = set(kf) | set(kn) | {word}
        e['_kanji'] = kf
        e['_kana'] = set(kn) | ({half(e['reading'])} if e.get('reading') else set())
        e['_forms'] = forms
        e['_hira_forms'] = {kata2hira(t) for t in forms}
        e['_senses'] = {s['sense_no'] for s in e['senses']}
        e['_word'] = word
        entries[e['jmdict_id']] = e
        for f in forms:
            by_form[f].add(e['jmdict_id'])
    return entries, by_form


def load_tsv_sentences(path, wanted=None):
    d = {}
    with open(path, encoding='utf-8') as fh:
        for line in fh:
            p = line.rstrip('\n').split('\t')
            if len(p) < 3:
                continue
            i = int(p[0])
            if wanted is not None and i not in wanted:
                continue
            d[i] = p[2]
    return d


def load_links(path):
    d = defaultdict(list)
    with open(path, encoding='utf-8') as fh:
        for line in fh:
            p = line.split()
            if len(p) >= 2:
                d[int(p[0])].append(int(p[1]))
    return d


# ---------------------------------------------------------------- 색인 해석

def resolve(head, reading, sense, entries, by_form, stats):
    """색인 토큰 → (jmdict_id, sense_no) 또는 (None, 사유)."""
    if reading and reading.startswith('#'):
        try:
            jid = int(reading[1:])
        except ValueError:
            return None, 'malformed'
        if jid not in entries:
            return None, 'not_in_entries'
        cands = [jid]
    else:
        h = half(head)
        cands = list(by_form.get(h, ()))
        if not cands:
            return None, 'not_in_entries'
        if reading:
            r = half(reading)
            cands = [c for c in cands if r in entries[c]['_kana'] or r == entries[c]['_word']]
            if not cands:
                return None, 'reading_mismatch'
        if len(cands) > 1 and sense is not None:
            c2 = [c for c in cands if sense in entries[c]['_senses']]
            if c2:
                cands = c2
        if len(cands) > 1:
            # 표제어가 우리 대표 표기와 같은 항목 우선
            c2 = [c for c in cands if entries[c]['_word'] == h]
            if c2:
                cands = c2
        if len(cands) > 1:
            c2 = [c for c in cands if entries[c].get('common')]
            if c2:
                cands = c2
        if len(cands) > 1:
            return None, 'ambiguous'
    jid = cands[0]
    if sense is not None and sense not in entries[jid]['_senses']:
        return None, 'sense_dropped'
    return jid, sense


# ---------------------------------------------------------------- 형태소 분석

_tagger = None
_tok_cache = {}


def tokenize(text, cache=True):
    """[(surface, start, end, pos1, pos2, orthBase, kana, kanaBase, whitespace_before)]"""
    global _tagger
    if cache and text in _tok_cache:
        return _tok_cache[text]
    if _tagger is None:
        _tagger = fugashi.Tagger()
    toks = []
    pos = 0
    for w in _tagger(text):
        ws = w.white_space or ''
        # white_space 는 토큰 앞 공백. 실제 원문 위치로 재정렬
        s = w.surface
        idx = text.find(s, pos)
        if idx < 0:
            raise AssertionError(f'tokenize offset lost: {text!r} {s!r}')
        f = w.feature
        toks.append((s, idx, idx + len(s), f.pos1, f.pos2,
                     getattr(f, 'orthBase', None), getattr(f, 'kana', None),
                     getattr(f, 'kanaBase', None), text[pos:idx], getattr(f, 'pos3', None)))
        pos = idx + len(s)
    res = (toks, text[pos:])
    if cache:
        _tok_cache[text] = res
    return res


OKURI_RE = re.compile(r'[ぁ-ゖー]+$')
READING_FIX_HITS = Counter()


def split_okurigana(surf, reading):
    """한자 토큰 → [surface, 한자 부분 읽기, 송가나]. surface 끝의 히라가나 연속이 reading 끝과 같고
    그 앞 부분에 가나가 없을 때만 분리(吹き飛ん 처럼 중간에 가나가 낀 복합은 그대로)."""
    m = OKURI_RE.search(surf)
    if m:
        ok = m.group(0)
        stem = surf[:m.start()]
        if stem and not re.search(r'[ぁ-ヿ]', stem) and reading.endswith(ok) and len(reading) > len(ok):
            return [surf, reading[:-len(ok)], ok]
    return [surf, reading, '']


def fix_reading(toks, i, surf, kana):
    """unidic-lite 알려진 오독 보정. READING_FIX(단독) → 何 문맥 규칙."""
    key = (surf, kana)
    if key in READING_FIX:
        READING_FIX_HITS[f'{surf}:{kata2hira(kana)}→{READING_FIX[key]}'] += 1
        return READING_FIX[key]
    if surf == '何' and kana == 'ナン' and i + 1 < len(toks) and not toks[i + 1][8]:
        nxt = toks[i + 1][0]
        if nxt.startswith(NANI_NEXT) and nxt[:2] not in ('か月', 'か国', 'か所', 'か年', 'か条'):
            READING_FIX_HITS[f'何:なん→なに (+{nxt[:2]})'] += 1
            return 'なに'
    return kata2hira(kana)


def reading_tokens(text):
    """[[surface, 한자부 읽기, 송가나]  (한자 포함 토큰) | [surface, None] (그 외·읽기 없음)]"""
    toks, tail = tokenize(text)
    out = []
    for i, t in enumerate(toks):
        if t[8]:
            out.append([t[8], None])
        surf, kana = t[0], t[6]
        if KANJI_RE.search(surf) and kana and kana != '*':
            out.append(split_okurigana(surf, fix_reading(toks, i, surf, kana)))
        else:
            out.append([surf, None])
    if tail:
        out.append([tail, None])
    return out


def particle_end(toks, a, b, entry):
    """span 마지막 토큰이 단독 조사(항목 표기가 그 조사로 끝나지 않음)인가."""
    last = None
    for t in toks:
        if t[1] >= a and t[2] <= b:
            last = t
    if last is None:
        return False
    if last[3] == '助詞' and last[0] in END_PARTICLES and last[4] != '接続助詞':
        if last[1] == a:          # span 전체가 조사 하나(조사 항목 자체)
            return False
        return not any(f.endswith(last[0]) for f in entry['_forms'])
    return False


def refine_span(text, a, b, entry):
    """문자열로 찾은 span 을 형태소 경계에 맞춘다. 실패 시 None."""
    toks, _ = tokenize(text)
    starts = {t[1] for t in toks}
    if a not in starts:
        return None
    # 끝이 토큰 중간이면: 활용어의 가나 어미만 남은 경우에 한해 토큰 끝까지 확장
    for t in toks:
        if t[1] < b < t[2]:
            rest = text[b:t[2]]
            if t[3] in CONJ_POS and re.fullmatch(r'[぀-ゟ]+', rest):
                b = t[2]
            else:
                return None
            break
    # 끝의 조사 제거(항목 표기에 포함되지 않은 조사만)
    while True:
        inside = [t for t in toks if t[1] >= a and t[2] <= b]
        if len(inside) <= 1:
            break
        last = inside[-1]
        if last[3] == '助詞' and last[4] != '接続助詞' and \
                not any(f.endswith(last[0]) for f in entry['_forms']):
            b = last[1]
        else:
            break
    if b <= a:
        return None
    return a, b


def lemma_span(text, cursor, entry):
    """활용형 등 문자열로 못 찾은 경우: 형태소 기본형이 항목 표기와 일치하는 연속 토큰."""
    toks, _ = tokenize(text)
    forms = {half(f) for f in entry['_forms']}
    hforms = entry['_hira_forms']
    n = len(toks)
    for i in range(n):
        if toks[i][1] < cursor:
            continue
        prefix = ''
        prefix_k = ''
        for j in range(i, min(n, i + 6)):
            t = toks[j]
            if j > i and t[8]:
                break
            bases = {t[5], t[0]} - {None}
            kb = kata2hira(t[7]) if t[7] and t[7] != '*' else None
            hit = any(half(prefix + x) in forms for x in bases) or \
                (kb is not None and (prefix_k + kb) in hforms)
            # 한자 표제(uk 아님)를 가나로 쓴 곳(と→都)은 잡지 않는다
            if hit and KANJI_RE.search(entry['_word']) and not entry.get('uk') and \
                    not KANJI_RE.search(text[toks[i][1]:t[2]]):
                hit = False
            if hit:
                a, b = toks[i][1], t[2]
                # 활용 어미(조동사, 접속조사 て/で) 포함
                if t[3] in CONJ_POS:
                    k = j + 1
                    while k < n and not toks[k][8] and (
                            toks[k][3] == '助動詞' or
                            (toks[k][3] == '助詞' and toks[k][4] == '接続助詞' and toks[k][0] in ('て', 'で'))):
                        b = toks[k][2]
                        k += 1
                return a, b
            prefix += t[0]
            prefix_k += kata2hira(t[6]) if t[6] and t[6] != '*' else t[0]
    return None


# ---------------------------------------------------------------- 메인

def main():
    t0 = time.time()
    entries, by_form = load_entries()
    print(f'entries {len(entries)}', flush=True)

    # 원문 전각 영숫자 → 반각 (표제어 정규화와 일치). 1:1 치환이라 길이·위치 불변
    jpn = {k: half(v) for k, v in load_tsv_sentences(os.path.join(SRC, 'jpn_sentences.tsv')).items()}
    jk_links = load_links(os.path.join(SRC, 'jpn-kor_links.tsv'))
    kor = load_tsv_sentences(os.path.join(SRC, 'kor_sentences.tsv'))
    je_links = load_links(os.path.join(SRC, 'jpn-eng_links.tsv'))

    # 색인 1차 읽기(영어 필요 id 수집)
    index_lines = []
    wanted_eng = set()
    for line in open(os.path.join(SRC, 'jpn_indices.csv'), encoding='utf-8'):
        p = line.rstrip('\n').split('\t')
        if len(p) < 3:
            continue
        jid, eid = int(p[0]), int(p[1])
        index_lines.append((jid, eid, p[2]))
        if eid > 0:
            wanted_eng.add(eid)
    for v in je_links.values():
        wanted_eng.update(v)
    eng = load_tsv_sentences(os.path.join(SRC, 'eng_sentences.tsv'), wanted_eng)
    print(f'sentences jpn {len(jpn)} eng(needed) {len(eng)} kor {len(kor)} indices {len(index_lines)} '
          f'({time.time() - t0:.1f}s)', flush=True)

    st = Counter()         # 토큰 해석 집계
    cands = defaultdict(list)   # jmdict_id → 후보
    seen = set()
    lemma_needed = 0

    for jpn_id, eng_id, idx in index_lines:
        text = jpn.get(jpn_id)
        toks = [t for t in idx.split(' ') if t]
        st['tokens'] += len(toks)
        if text is None:
            st['fail_sentence_missing'] += len(toks)
            continue
        htext = half(text)
        cursor = 0
        # 영어: 색인 eng_id 우선, 없거나 삭제됐으면 링크
        en_id = eng_id if eng_id in eng else None
        if en_id is None:
            for e2 in je_links.get(jpn_id, ()):
                if e2 in eng:
                    en_id = e2
                    break
        ko = None
        for k2 in jk_links.get(jpn_id, ()):
            if k2 in kor:
                ko = kor[k2]
                break
        for tok in toks:
            m = TOKEN_RE.match(tok)
            if not m:
                st['fail_malformed'] += 1
                continue
            head, reading, sense, surface, tilde = m.groups()
            sense = int(sense) if sense else None
            jid, info = resolve(head, reading, sense, entries, by_form, st)
            # 문자열 span (커서 이후, 표층형 → 표제어)
            span = None
            method = None
            for needle, meth in ((surface, 'surface'), (head, 'headword')):
                if not needle:
                    continue
                pos = htext.find(half(needle), cursor)
                if pos >= 0:
                    span = (pos, pos + len(needle))
                    method = meth
                    break
            if jid is None:
                st['fail_' + info] += 1
                if span:
                    cursor = span[1]
                continue
            sense_no = info
            key = (jid, jpn_id)
            if key in seen:
                st['dup_same_sentence'] += 1
                if span:
                    cursor = span[1]
                continue
            seen.add(key)
            if span is None:
                sp = lemma_span(text, cursor, entries[jid])
                lemma_needed += 1
                if sp is None:
                    st['fail_span'] += 1
                    continue
                span, method = sp, 'lemma'
            cursor = span[1]
            st['resolved'] += 1
            cands[jid].append({
                'jmdict_id': jid, 'sense_no': sense_no, 'jpn_id': jpn_id, 'en_id': en_id,
                'verified': bool(tilde), 'surface': surface, 'head': head,
                'span': span, 'method': method, 'ko': ko,
            })
    print(f'parsed: resolved {st["resolved"]} lemma_tried {lemma_needed} ({time.time() - t0:.1f}s)', flush=True)

    # ---------------------------------------------------- 선정
    sel_out, pool_out = [], []
    drop = Counter()

    def base_ok(c):
        text = jpn[c['jpn_id']]
        if len(text) > MAX_LEN:
            return 'too_long'
        if BAD_CHARS_RE.search(text) or not text.strip() or not JA_RE.search(text):
            return 'bad_chars'
        return None

    def rank_key(c, covered=None):
        L = len(jpn[c['jpn_id']])
        good = GOOD_LEN[0] <= L <= GOOD_LEN[1]
        new_sense = covered is not None and c['sense_no'] is not None and c['sense_no'] not in covered
        # sense 다양성 최우선(단, 영어 번역·적정 길이를 갖춘 후보에 한함) → verified → 영어 → 길이 → 짧은 순
        return (not (new_sense and c['en_id'] is not None and good), not c['verified'], c['en_id'] is None,
                not good, L, c['jpn_id'])

    def build_record(c, selected):
        text = jpn[c['jpn_id']]
        e = entries[c['jmdict_id']]
        sp = None
        if c['method'] in ('lemma', 'unindexed'):
            sp = c['span']
        else:
            sp = refine_span(text, *c['span'], e)
            if sp is None:
                # 같은 문자열의 다음 등장 위치 재시도 → 기본형 매칭
                a0, b0 = c['span']
                needle = half(text[a0:b0])
                pos = half(text).find(needle, a0 + 1)
                while pos >= 0 and sp is None:
                    sp = refine_span(text, pos, pos + len(needle), e)
                    pos = half(text).find(needle, pos + 1)
                if sp is None:
                    sp = lemma_span(text, 0, e)
                    if sp is not None:
                        c['method'] = 'lemma_retry'
        if sp is None:
            return None, 'span_refine_fail'
        a, b = sp
        toks, _ = tokenize(text)
        if particle_end(toks, a, b, e):
            return None, 'particle_end'
        ja = text[:a] + STRONG_OPEN + text[a:b] + STRONG_CLOSE + text[b:]
        rt = reading_tokens(text)
        return {
            'jmdict_id': c['jmdict_id'], 'sense_no': c['sense_no'],
            'ja': ja, 'ja_plain': text,
            'en': eng.get(c['en_id']) if c['en_id'] else None,
            'ko_ref': c['ko'], 'reading_tokens': rt,
            'tatoeba_ja_id': c['jpn_id'], 'tatoeba_en_id': c['en_id'],
            'verified': c['verified'], 'length': len(text), 'source': 'tatoeba',
            'selected': selected, 'span_method': c['method'],
        }, None

    for jid in sorted(cands):
        pool = []
        seen_text = set()
        for c in cands[jid]:
            r = base_ok(c)
            if r:
                drop[r] += 1
                continue
            t = jpn[c['jpn_id']]
            if t in seen_text:
                drop['dup_text'] += 1
                continue
            seen_text.add(t)
            pool.append(c)
        chosen = []
        covered = set()
        remaining = sorted(pool, key=rank_key)
        rejected = set()
        while len(chosen) < MAX_PER_ENTRY and remaining:
            remaining.sort(key=lambda c: rank_key(c, covered))
            c = remaining.pop(0)
            rec, why = build_record(c, True)
            if rec is None:
                drop[why] += 1
                rejected.add(id(c))
                continue
            chosen.append(rec)
            if c['sense_no'] is not None:
                covered.add(c['sense_no'])
        sel_out.extend(chosen)
        for c in remaining[:POOL_CAP]:
            rec, why = build_record(c, False)
            if rec is not None:
                pool_out.append(rec)
    print(f'selected {len(sel_out)} pool {len(pool_out)} ({time.time() - t0:.1f}s)', flush=True)

    # ---------------------------------------------------- 보충: 색인에 없는 문장에서 찾기
    # 색인 매칭으로 0개인 항목만. 형태소 (표기, 읽기) 쌍이 우리 항목 중 정확히 하나에만 해당할 때 채택.
    cnt0 = Counter(r['jmdict_id'] for r in sel_out)
    need0 = {j for j in entries if not cnt0.get(j)}
    pair = defaultdict(set)
    for j, e in entries.items():
        kanas = {kata2hira(k) for k in e['_kana']}
        for f in e['_forms']:
            for k in kanas:
                pair[(f, k)].add(j)
            if not KANJI_RE.search(f):
                pair[(f, kata2hira(f))].add(j)
    unidx = defaultdict(list)
    first_en = {}
    for jpn_id, links in je_links.items():
        for e2 in links:
            if e2 in eng:
                first_en[jpn_id] = e2
                break
    st['unindexed_sentences_scanned'] = 0
    for jpn_id, text in jpn.items():
        if jpn_id not in first_en or not (UNINDEXED_MIN_LEN <= len(text) <= MAX_LEN):
            continue
        if BAD_CHARS_RE.search(text) or not JA_RE.search(text):
            continue
        st['unindexed_sentences_scanned'] += 1
        toks, _ = tokenize(text, cache=False)
        n = len(toks)
        hit_here = set()
        for i in range(n):
            prefix = prefix_k = ''
            for jx in range(i, min(n, i + 5)):
                t = toks[jx]
                if jx > i and t[8]:
                    break
                kb = kata2hira(t[7]) if t[7] and t[7] != '*' else None
                kr = kata2hira(t[6]) if t[6] and t[6] != '*' else None
                ids = set()
                for form, rd in ((t[5], kb), (t[0], kr)):
                    if form is None or rd is None:
                        continue
                    ids |= pair.get((half(prefix + form), prefix_k + rd), set())
                if len(ids) == 1:
                    (j,) = ids
                    e = entries[j]
                    matched = text[toks[i][1]:t[2]]
                    ok = j in need0 and j not in hit_here and \
                        not (len(e['_word']) == 1 and not KANJI_RE.search(e['_word']))
                    # 한자 표제(uk 아님) 항목은 가나로 쓴 곳을 잡지 않는다(にあげた→荷揚げ 오인 방지)
                    if ok and KANJI_RE.search(e['_word']) and not e.get('uk') and not KANJI_RE.search(matched):
                        ok = False
                        st['unindexed_reject_kana_for_kanji'] += 1
                    # 짧은 가나 기능어(だの 등)는 토큰 경계 우연 일치가 많다 → 조사·접속사·조동사 항목 제외,
                    # 3자 이하 가나 표제는 단일 토큰 일치만
                    if ok and not KANJI_RE.search(e['_word']):
                        if any(p in ('prt', 'conj', 'cop', 'aux', 'aux-v', 'aux-adj')
                               for s_ in e['senses'] for p in s_['pos']) or (len(e['_word']) <= 3 and jx != i):
                            ok = False
                            st['unindexed_reject_short_kana'] += 1
                    # 인명(ジャック·ラッセル)을 보통명사 항목으로 잡지 않는다
                    if ok and any(tt[9] == '人名' for tt in toks[i:jx + 1]):
                        ok = False
                        st['unindexed_reject_person_name'] += 1
                    # 품사 불일치: 동사·형용사 활용형인데 항목에 동사/형용사 sense 가 없음(取り下げた→取り下げ 명사)
                    if ok and t[3] in ('動詞', '形容詞') and not any(
                            p.startswith('v') or p == 'adj-i' or p == 'aux-v'
                            for s_ in e['senses'] for p in s_['pos']):
                        ok = False
                        st['unindexed_reject_pos'] += 1
                    # 복합어 내부 일부(ジャンク+フード, 技術+革新, 中小+企業) 배제
                    if ok:
                        prv = toks[i - 1] if i > 0 and not toks[i][8] else None
                        nxt = toks[jx + 1] if jx + 1 < n and not toks[jx + 1][8] else None
                        if (prv and prv[3] in ('名詞', '接頭辞')) or (nxt and nxt[3] in ('名詞', '接尾辞')):
                            ok = False
                            st['unindexed_reject_compound'] += 1
                    if ok:
                        a, b = toks[i][1], t[2]
                        if t[3] in CONJ_POS:
                            k = jx + 1
                            while k < n and not toks[k][8] and (
                                    toks[k][3] == '助動詞' or
                                    (toks[k][3] == '助詞' and toks[k][4] == '接続助詞' and toks[k][0] in ('て', 'で'))):
                                b = toks[k][2]
                                k += 1
                        hit_here.add(j)
                        unidx[j].append({
                            'jmdict_id': j, 'sense_no': None, 'jpn_id': jpn_id, 'en_id': first_en[jpn_id],
                            'verified': False, 'surface': None, 'head': None, 'span': (a, b),
                            'method': 'unindexed',
                            'ko': next((kor[k2] for k2 in jk_links.get(jpn_id, ()) if k2 in kor), None),
                        })
                prefix += t[0]
                prefix_k += kr if kr else t[0]
    st['unindexed_entries_hit'] = len(unidx)
    for jid in sorted(unidx):
        cs = sorted(unidx[jid], key=rank_key)
        chosen, seen_text = [], set()
        rest = []
        for c in cs:
            t = jpn[c['jpn_id']]
            if t in seen_text:
                continue
            seen_text.add(t)
            if len(chosen) < MAX_PER_ENTRY:
                rec, why = build_record(c, True)
                if rec is None:
                    drop['unindexed_' + why] += 1
                    continue
                chosen.append(rec)
            else:
                rest.append(c)
        sel_out.extend(chosen)
        for c in rest[:POOL_CAP]:
            rec, why = build_record(c, False)
            if rec is not None:
                pool_out.append(rec)
    print(f'unindexed: entries {len(unidx)} → selected total {len(sel_out)} ({time.time() - t0:.1f}s)', flush=True)

    # ---------------------------------------------------- 검증
    chk = Counter()
    for rec in sel_out + pool_out:
        ja, plain = rec['ja'], rec['ja_plain']
        assert ja.count(STRONG_OPEN) == 1 and ja.count(STRONG_CLOSE) == 1, rec
        a = ja.index(STRONG_OPEN)
        inner = ja[a + len(STRONG_OPEN):ja.index(STRONG_CLOSE)]
        assert inner and inner in plain, rec
        assert ja.replace(STRONG_OPEN, '').replace(STRONG_CLOSE, '') == plain, rec
        assert ''.join(x[0] for x in rec['reading_tokens']) == plain, rec
        for x in rec['reading_tokens']:
            assert (len(x) == 2 and x[1] is None) or (len(x) == 3 and x[1] and x[0].endswith(x[2])), rec
        toks, _ = tokenize(plain)
        assert not particle_end(toks, a, a + len(inner), entries[rec['jmdict_id']]), rec
        chk['ok'] += 1
    keys = [(r['jmdict_id'], r['tatoeba_ja_id']) for r in sel_out]
    assert len(keys) == len(set(keys))
    cnt = Counter(r['jmdict_id'] for r in sel_out)
    assert max(cnt.values()) <= MAX_PER_ENTRY

    with open(OUT, 'w', encoding='utf-8') as fh:
        for r in sel_out:
            fh.write(json.dumps(r, ensure_ascii=False) + '\n')
    with open(POOL, 'w', encoding='utf-8') as fh:
        for r in pool_out:
            fh.write(json.dumps(r, ensure_ascii=False) + '\n')
    need = sorted(j for j in entries if cnt.get(j, 0) == 0)
    with open(NEED, 'w', encoding='utf-8') as fh:
        json.dump(need, fh)

    write_stats(entries, st, drop, sel_out, pool_out, cnt, need, cands, time.time() - t0)
    print(f'done {time.time() - t0:.1f}s', flush=True)


# ---------------------------------------------------------------- 통계

def pct(a, b):
    return f'{100 * a / b:.1f}%' if b else '-'


def is_katakana_word(w):
    return bool(re.fullmatch(r'[゠-ヿA-Za-z0-9・]+', w)) and bool(re.search(r'[ァ-ヺ]', w))


def pick_samples(entries, sel):
    """다양한 유형 15건: 동사 과거형, い형용사 활용, 가나 표제어, 복합어, 기타."""
    buckets = [
        ('동사 과거형', lambda e, r, inner: any(p.startswith('v') for s in e['senses'] for p in s['pos'])
         and inner.endswith(('た', 'だ')) and inner not in e['_forms'], 4),
        ('い형용사 활용', lambda e, r, inner: any('adj-i' in s['pos'] for s in e['senses'])
         and inner not in e['_forms'], 3),
        ('가나 표제어(uk)', lambda e, r, inner: e.get('uk') and not is_katakana_word(e['word']), 2),
        ('가타카나어', lambda e, r, inner: is_katakana_word(e['word']), 1),
        ('복합어·표현', lambda e, r, inner: any('exp' in s['pos'] for s in e['senses']) or
         (len(e['word']) >= 4 and KANJI_RE.search(e['word'])), 2),
        ('기본형 매칭(lemma)', lambda e, r, inner: r['span_method'].startswith('lemma'), 2),
        ('ko_ref 보유', lambda e, r, inner: r['ko_ref'] is not None, 1),
    ]
    out, used = [], set()
    step = 997
    n = len(sel)
    for name, fn, k in buckets:
        got = 0
        i = 0
        while got < k and i < n:
            r = sel[(i * step + 13 * len(out)) % n]
            i += 1
            if r['jmdict_id'] in used:
                continue
            e = entries[r['jmdict_id']]
            ja = r['ja']
            inner = ja[ja.index(STRONG_OPEN) + len(STRONG_OPEN):ja.index(STRONG_CLOSE)]
            if fn(e, r, inner):
                out.append((name, r))
                used.add(r['jmdict_id'])
                got += 1
    return out


def write_stats(entries, st, drop, sel, pool, cnt, need, cands, elapsed):
    L = []
    w = L.append
    w('# 일한 사전 2단계 — 예문 매칭 통계\n')
    w(f'- 생성: {time.strftime("%Y-%m-%d %H:%M:%S")} / 실행시간 {elapsed:.0f}s / 항목 {len(entries)}\n')

    w('## 1. 색인 토큰 해석\n')
    w('| 구분 | 토큰 수 | 비율 |\n|---|---:|---:|')
    tot = st['tokens']
    rows = [
        ('전체 토큰', tot),
        ('해석·span 성공 → 후보', st['resolved']),
        ('동일 문장 내 같은 항목 반복(첫 번째만)', st['dup_same_sentence']),
        ('실패: 미수록 항목(표기 없음 / #id 가 우리 23k 밖)', st['fail_not_in_entries']),
        ('실패: 미수록 — 읽기 불일치', st['fail_reading_mismatch']),
        ('실패: 뜻번호가 버린 sense(고어·희귀 등)', st['fail_sense_dropped']),
        ('실패: ambiguous(후보 여러 개)', st['fail_ambiguous']),
        ('실패: span 못 찾음(문자열·기본형 모두)', st['fail_span']),
        ('실패: 문장이 jpn_sentences 에 없음(삭제)', st['fail_sentence_missing']),
        ('실패: 형식 깨짐', st['fail_malformed']),
    ]
    for k, v in rows:
        w(f'| {k} | {v} | {pct(v, tot)} |')
    w('')
    w('보충 매칭(색인 매칭 0개 항목만, 색인 밖 문장 포함 전체 jpn_sentences 에서 형태소 (표기,읽기) 쌍이 우리 항목 하나에만 해당):\n')
    w('| 지표 | 수 |\n|---|---:|')
    for k in ('unindexed_sentences_scanned', 'unindexed_entries_hit',
              'unindexed_reject_kana_for_kanji', 'unindexed_reject_compound',
              'unindexed_reject_person_name', 'unindexed_reject_pos', 'unindexed_reject_short_kana'):
        w(f'| {k} | {st[k]} |')
    w('')
    w('선정 단계 탈락(후보 기준, 선정·풀 검사 중 발생분):\n')
    w('| 사유 | 수 |\n|---|---:|')
    for k, v in drop.most_common():
        w(f'| {k} | {v} |')
    w('')

    w('## 2. 예문 커버율 (선정본 기준)\n')
    w('| 급수 | 항목 | 예문 ≥1 | 커버율 | 후보 ≥1 |\n|---|---:|---:|---:|---:|')
    groups = defaultdict(list)
    for j, e in entries.items():
        groups[e.get('jlpt') or '없음'].append(j)
    for g in JLPT_ORDER + ['없음']:
        ids = groups.get(g, [])
        has = sum(1 for j in ids if cnt.get(j))
        hc = sum(1 for j in ids if cands.get(j))
        w(f'| {g} | {len(ids)} | {has} | {pct(has, len(ids))} | {hc} |')
    has = sum(1 for j in entries if cnt.get(j))
    w(f'| 합계 | {len(entries)} | {has} | {pct(has, len(entries))} | {sum(1 for j in entries if cands.get(j))} |\n')

    w('항목당 예문 수 분포:\n')
    w('| 예문 수 | 항목 |\n|---:|---:|')
    dist = Counter(cnt.get(j, 0) for j in entries)
    for k in range(MAX_PER_ENTRY + 1):
        w(f'| {k} | {dist.get(k, 0)} |')
    w('')

    tot_s = sum(len(e['senses']) for e in entries.values())
    cov = set((r['jmdict_id'], r['sense_no']) for r in sel if r['sense_no'] is not None)
    multi = [e for e in entries.values() if len(e['senses']) > 1 and cnt.get(e['jmdict_id'])]
    multi_cov = sum(1 for e in multi if len({r for (j, r) in cov if j == e['jmdict_id']}) >= 2)
    null_only = sum(1 for j in entries if cnt.get(j) and not any(jj == j for jj, _ in cov))
    w('| 지표 | 값 |\n|---|---:|')
    w(f'| 선정 예문 수 | {len(sel)} |')
    w(f'| 풀(재선정용) 예문 수 | {len(pool)} |')
    w(f'| 전체 sense | {tot_s} |')
    w(f'| 예문이 붙은 sense (뜻번호 있는 예문) | {len(cov)} ({pct(len(cov), tot_s)}) |')
    w(f'| 예문 중 sense_no 있음 | {sum(1 for r in sel if r["sense_no"] is not None)} ({pct(sum(1 for r in sel if r["sense_no"] is not None), len(sel))}) |')
    w(f'| 예문 있는 항목 중 sense_no 예문이 하나도 없음(단어 단위만) | {null_only} |')
    w(f'| 다의어(sense≥2)·예문 있음 중 2개 이상 sense 커버 | {multi_cov}/{len(multi)} ({pct(multi_cov, len(multi))}) |')
    w(f'| ko_ref 있음 | {sum(1 for r in sel if r["ko_ref"])} ({pct(sum(1 for r in sel if r["ko_ref"]), len(sel))}) |')
    w(f'| verified(~) | {sum(1 for r in sel if r["verified"])} ({pct(sum(1 for r in sel if r["verified"]), len(sel))}) |')
    w(f'| 영어 번역 있음 | {sum(1 for r in sel if r["en"])} ({pct(sum(1 for r in sel if r["en"]), len(sel))}) |')
    w(f'| 길이 8~45자 | {sum(1 for r in sel if GOOD_LEN[0] <= r["length"] <= GOOD_LEN[1])} ({pct(sum(1 for r in sel if GOOD_LEN[0] <= r["length"] <= GOOD_LEN[1]), len(sel))}) |')
    ml = Counter(r['span_method'] for r in sel)
    w(f'| span 방법 | {", ".join(f"{k} {v}" for k, v in ml.most_common())} |')
    rt_null = sum(1 for r in sel for x in r['reading_tokens'] if KANJI_RE.search(x[0]) and x[1] is None)
    w(f'| 한자 포함인데 읽기 없는 토큰(미등록어) | {rt_null} |\n')

    w('## 3. 예문 0개 항목 (LLM 생성 대상) — `build/need_generation.json`\n')
    ne = [entries[j] for j in need]
    w(f'- 총 **{len(ne)}** 항목 (그중 후보는 있었으나 전부 탈락: {sum(1 for j in need if cands.get(j))})\n')
    w('| 구분 | 수 |\n|---|---:|')
    jc = Counter(e.get('jlpt') or '없음' for e in ne)
    for g in JLPT_ORDER + ['없음']:
        w(f'| JLPT {g} | {jc.get(g, 0)} |')
    kat = sum(1 for e in ne if is_katakana_word(e['word']))
    w(f'| 가타카나어 | {kat} |')
    w(f'| common | {sum(1 for e in ne if e.get("common"))} |')
    w(f'| JLPT 없음 ∧ 가타카나 | {sum(1 for e in ne if not e.get("jlpt") and is_katakana_word(e["word"]))} |')
    w(f'| uk(가나 표제) | {sum(1 for e in ne if e.get("uk"))} |')
    pc = Counter()
    for e in ne:
        pc[e['senses'][0]['pos'][0] if e['senses'][0]['pos'] else '?'] += 1
    w(f'| 대표 품사 상위 | {", ".join(f"{k} {v}" for k, v in pc.most_common(8))} |\n')
    jl = [e for e in ne if e.get('jlpt')]
    w('JLPT 항목 중 예문 0개 예시(최대 30): ' +
      ', '.join(f'{e["word"]}({e["jlpt"]})' for e in sorted(jl, key=lambda e: JLPT_ORDER.index(e['jlpt']))[:30]) + '\n')

    w('## 4. 레코드 형식 · 후리가나\n')
    w('- `ja_plain`/`ja`: Tatoeba 원문에서 **전각 영숫자(Ａ-Ｚａ-ｚ０-９)를 반각으로 정규화**(표제어와 동일 규칙). 그 외 전각 기호(、。！？ 등)는 원문 유지.')
    w('- `reading_tokens` 원소 2종 — 이어붙인 `x[0]` 은 정확히 `ja_plain`:')
    w('  - 한자 포함 토큰: `[surface, 한자부 읽기(히라가나), 송가나]` — surface 끝 히라가나가 읽기 끝과 같고 그 앞에 가나가 없으면 분리. '
      '예 `["怖かっ","こわ","かっ"]`, `["言っ","い","っ"]`, `["私","わたし",""]`. 중간에 가나가 낀 복합은 분리하지 않음: `["吹き飛ん","ふきとん",""]` (이때 읽기는 surface 전체의 읽기).')
    w('  - 그 외(가나·기호·숫자·공백, 또는 사전에 읽기 없는 한자): `[surface, null]`')
    w('- 후리가나 렌더: 3원소면 `surface[:len(surface)-len(송가나)]` 위에 읽기, 뒤에 송가나를 그대로 붙인다.\n')
    n3 = sum(1 for r in sel for x in r['reading_tokens'] if len(x) == 3)
    nsplit = sum(1 for r in sel for x in r['reading_tokens'] if len(x) == 3 and x[2])
    nmid = sum(1 for r in sel for x in r['reading_tokens']
               if len(x) == 3 and not x[2] and re.search(r'[ぁ-ヿ]', x[0]))
    w(f'| 지표(선정본) | 수 |\n|---|---:|\n| 한자 토큰 | {n3} |\n| 송가나 분리됨 | {nsplit} |\n'
      f'| 중간 가나 복합(미분리) | {nmid} |\n')
    w('unidic-lite 읽기 보정표(스크립트 `READING_FIX`, `NANI_NEXT`) — 적용 횟수(선정+풀):\n')
    w('| 보정 | 횟수 |\n|---|---:|')
    for k, v in READING_FIX_HITS.most_common():
        w(f'| {k} | {v} |')
    w('\n알려진 미보정 한계: 토큰 단위 문맥 읽기는 unidic 판단을 따름(行っ いっ/おこなっ, 何と・何で 는 なん 유지 등). '
      '何 는 다음 토큰이 ' + '·'.join(NANI_NEXT) + ' 로 시작할 때만 なに.\n')

    w('## 5. 표본 15건\n')
    w('| 유형 | id | 표제어 | sense | ja | en | reading_tokens(앞부분) | 방법 |\n|---|---|---|---|---|---|---|---|')
    for name, r in pick_samples(entries, sel):
        e = entries[r['jmdict_id']]
        rt = ' '.join(f'{x[0][:len(x[0]) - len(x[2])]}[{x[1]}]{x[2]}' if x[1] else x[0] for x in r['reading_tokens'][:6])
        ja = r['ja'].replace(STRONG_OPEN, '**').replace(STRONG_CLOSE, '**').replace('|', '｜')
        en = (r['en'] or '').replace('|', '/')
        w(f'| {name} | {r["jmdict_id"]} | {e["word"]} | {r["sense_no"]} | {ja} | {en} | {rt} | {r["span_method"]} |')
    w('')
    with open(STATS, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(L) + '\n')


if __name__ == '__main__':
    main()
