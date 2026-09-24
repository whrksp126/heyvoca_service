"""meanings.jsonl 전량 패턴 탐지 → audit/meaning_patterns_full.md (+ _full_all.json) (읽기 전용 감사).

  python3 scripts/40_verify_meanings.py [--out-stem meaning_patterns_full]

한국어 어휘 판정은 krdict_ja_reverse.json 의 ko_word/ko_pos 를 간이 사전으로 쓴다
(명사 사전에 있는 뜻은 어미 규칙 오탐에서 제외). meanings.jsonl 은 35 가 정정 오버레이
(build/meaning_overrides.jsonl, 41 이 생성)까지 적용한 결과이므로, 정정 후 잔존 여부를 그대로 본다.
"정정 대상" 항목은 0 이 목표이고 "(참고)" 항목은 오탐·정상이 섞인 통계다.
"""
import argparse
import collections
import json
import os
import re
import statistics
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from batch_common import (  # noqa: E402
    AUDIT, BUILD, ENTRIES, KRDICT_REV, MEANINGS, base_path, load_manifest)

PRED = {'VERB', 'AUX', 'ADJ'}
# 지시대명사 — 항상 PRON (INTJ 로 쓰인 머뭇거림 "저기" 는 제외). "그때" 는 NOUN 고정.
DEMONS = {'이것', '그것', '저것', '이거', '그거', '저거', '여기', '거기', '저기', '이쪽', '그쪽', '저쪽',
          '이분', '그분', '저분', '이곳', '그곳', '저곳'}
DEMON_SKIP = {(1463100, '이분')}   # 二分 → 한자어 명사 이분(二分)
THING_DEMO = {'あれ': '저', 'それ': '그', 'これ': '이'}   # 사물 지시 → 저것/그것/이것
# 사전에 등재된 합성·파생어(붙여 씀이 맞음) — 붙여쓰기 탐지에서 제외
GLUE_OK = {'발버둥치다', '헹가래치다', '게으름피우다', '익살부리다', '허풍떨다', '능청떨다', '심술부리다',
           '욕심부리다', '멋부리다', '사기치다', '전당잡히다', '조리돌리다', '호통치다', '고함치다', '소리치다'}
GLUE_RE = re.compile(r'(이|그|저|요|얼마)정도|^(그|저)점$|어느것|\S(수|줄)(있|없)')
GLUE_VERB = ('지르다', '부리다', '짓다', '피우다', '떨다', '치다')
# 문장형 `~것` 중 사전 등재어·기능어 구(정상)
GEOT_OK = {'것', '이것', '그것', '저것', '어느 것', '무엇', '아무것', '별것', '탈것', '옛것', '날것', '들것',
           '헛것', '단것', '새것', '이것저것', '모든 것', '바로 그것'}
# 라틴 문자 이름(한글 음차)
LETTER_KO = {'A': '에이', 'B': '비', 'C': '시', 'D': '디', 'E': '이', 'F': '에프', 'G': '지', 'H': '에이치',
             'I': '아이', 'J': '제이', 'K': '케이', 'L': '엘', 'M': '엠', 'N': '엔', 'O': '오', 'P': '피',
             'Q': '큐', 'R': '아르', 'S': '에스', 'T': '티', 'U': '유', 'V': '브이', 'W': '더블유',
             'X': '엑스', 'Y': '와이', 'Z': '제트'}
TRANSLIT_OK = {'오케이'}   # 표준 외래어로 굳은 음차
# N5·N4 기본어 sense 1 첫 뜻 VERB 규칙의 예외(PROMPT_meaning.md 가 관형형 ADJ 를 예시로 든 것)
BASIC_ADJ_OK = {'足りる', '異なる'}
# 이전 감사(R2)에서 지목된 개별 오류 — 정정 후 남아 있으면 안 되는 (jmdict_id, sense_no, 뜻)
R2_BAD = [(1161170, 4, '일단'), (1431800, 3, '죽치기'), (1277080, 2, '안다'), (1525250, 7, '사소한 것'),
          (1525250, 7, '하찮은 것')]
R2_FIRST = [(1340450, 1, '할 수 있다', 'VERB')]   # できる#1 첫 뜻
KANA = re.compile(r'[぀-ヿ一-鿿]')
LATIN = re.compile(r'[A-Za-z]')
CAND = re.compile(r'^(.*?)\(([^()]*)\):')
N_EX = 10
DERIV = ('시키다', '해지다', '되다', '어지다', '아지다', '워지다', '드리다', '스럽다', '거리다', '뜨리다', '트리다')


def jong(ch):
    o = ord(ch) - 0xAC00
    return (o % 28) if 0 <= o < 11172 else -1


def strip(s):
    return s.replace(' ', '').strip('~…-')


def translit(latin):
    return ''.join(LETTER_KO.get(c, '') for c in latin.upper())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out-stem', default='meaning_patterns_full',
                    help='audit/<stem>.md, audit/<stem>_all.json 로 쓴다')
    ap.add_argument('--raw', action='store_true',
                    help='meanings.jsonl 대신 오버레이 적용 전 원본(35 run)으로 감사 — 정정 전 기준선용')
    args = ap.parse_args()
    entries = {}
    with open(ENTRIES, encoding='utf-8') as f:
        for line in f:
            e = json.loads(line)
            entries[e['jmdict_id']] = e
    if args.raw:
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            'apply35', os.path.join(os.path.dirname(os.path.abspath(__file__)), '35_apply_batches.py'))
        m35 = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m35)
        rows = m35.run('meaning', write=False)[0]
    else:
        rows = [json.loads(l) for l in open(MEANINGS, encoding='utf-8')]

    # 간이 한국어 사전
    kr = json.load(open(KRDICT_REV, encoding='utf-8'))
    lex = collections.defaultdict(set)
    for v in kr.values():
        for x in v:
            if x.get('ko_word'):
                lex[x.get('ko_pos') or '?'].add(x['ko_word'].replace(' ', '').strip('-'))
    nouns = lex['명사'] | lex['의존 명사'] | lex['대명사'] | lex['수사']
    verbs = lex['동사'] | lex['보조 동사']
    allw = set().union(*lex.values())

    # 배치 입력의 krdict 후보
    man = load_manifest('meaning')['batches']
    cand = {}
    for no, ids in man.items():
        p = base_path('meaning', int(no))
        if not os.path.exists(p):
            continue
        lines = open(p, encoding='utf-8').read().split('\n')
        for i, jid in enumerate(ids):
            if i < len(lines) and lines[i]:
                c = lines[i].split('\t')[4]
                cand[jid] = [] if c == '-' else [
                    (m.group(1), m.group(2)) for x in c.split(';') if (m := CAND.match(x))]

    hits = collections.defaultdict(list)

    def hit(k, r, m, extra=''):
        e = entries.get(r['jmdict_id'], {})
        hits[k].append(f"{e.get('word','?')}#{r['sense_no']} (b{r['batch']}) `{m['meaning']}={m['pos']}`{extra}")

    pos_all = collections.Counter()
    pos_batch = collections.defaultdict(collections.Counter)
    total_m = 0
    for r in rows:
        for m in r['meanings']:
            total_m += 1
            s, p = m['meaning'].strip(), m['pos']
            pos_all[p] += 1
            pos_batch[r['batch']][p] += 1
            last = s.split(' ')[-1]
            ns = strip(s)
            if p in ('ADP', 'PART', 'SCONJ', 'CCONJ') or s.startswith(('~', '…', '-')):
                funcword = True
            else:
                funcword = False
            # 어미-품사
            if s.endswith('다') and p not in PRED and not funcword and ns not in nouns:
                hit('da_not_pred', r, m)
            if s.endswith('다') and p == 'ADJ':
                hit('adj_da', r, m)
            if p == 'NOUN' and ns not in nouns and not funcword:
                if last.endswith(('한', '은', '는', '운', '된', '던', '진', '적인')) and len(last) >= 2:
                    hit('noun_adnominal', r, m)
                elif last.endswith('의') and len(last) >= 2 and jong(last[-2]) > 0:
                    hit('noun_ui', r, m)
            if not funcword and p not in ('ADP', 'PART') and len(last) >= 2 and ns not in allw:
                if last[-1] in '을를':
                    hit('particle_end', r, m)
                elif last[-1] in '이가은는' and strip(last[:-1]) in nouns and len(last[:-1]) >= 2 \
                        and not (p == 'ADJ' and last[-1] in '은는'):
                    hit('particle_end', r, m)
            if s.endswith('하다') and p == 'NOUN':
                hit('hada_noun', r, m)
            if s.endswith('한') and p == 'VERB':
                hit('han_verb', r, m)
            word = entries.get(r['jmdict_id'], {}).get('word', '')
            # 지시어
            if (ns in DEMONS and p not in ('PRON', 'INTJ') and (r['jmdict_id'], ns) not in DEMON_SKIP) \
                    or (ns == '그때' and p != 'NOUN'):
                hit('demon_not_pron', r, m)
            if THING_DEMO.get(word) == s:
                hit('thing_demo_bare', r, m)
            if s in ('이', '그', '저') and p != 'DET':
                hit('det_not_det', r, m)
            # 표기
            if LATIN.search(s):
                hit('latin', r, m)
            lat = re.sub(r'[^A-Za-z]', '', word)
            if lat and s not in TRANSLIT_OK:
                tl = translit(lat)
                # 표제어 전체가 한 글자면 글자 이름 단독(에스, 에이치)은 허용, 덧붙은 합성어만 탐지
                if (len(lat) >= 2 and tl in ns) or (len(lat) == 1 and word == lat and ns.startswith(tl)
                                                    and ns != tl):
                    hit('latin_translit', r, m)
            if GLUE_RE.search(s) or (p == 'VERB' and ' ' not in s and s not in GLUE_OK
                                             and s.endswith(GLUE_VERB) and s not in allw
                                             and any(s[:i] in nouns and s[i:] in GLUE_VERB
                                                     for i in range(2, len(s) - 2))):
                hit('glue_known', r, m)
            if KANA.search(s):
                hit('kana', r, m)
            if s.count('(') >= 2:
                hit('paren2', r, m)
            if len(s) > 20:
                hit('len20', r, m, f' ({len(s)}자)')
            if (s.endswith('것') and s not in GEOT_OK and not funcword) \
                    or re.search(r'(때|데) 쓰는 말|이르는 말|하는 말$', s) or s.endswith(('.',)):
                hit('sentence', r, m)
            elif s.endswith('니다') and len(s) >= 3 and jong(s[-3]) == 17:
                hit('sentence_formal', r, m)
            if p == 'VERB' and ' ' not in s and len(s) >= 5 and not s.endswith('하다'):
                hit('glued_verb_cand', r, m)
                if not s.endswith(DERIV):
                    hit('glued_verb_resid', r, m)
                if s not in verbs and not s.endswith(DERIV):
                    for i in range(1, len(s) - 1):
                        if s[:i] in nouns and len(s[:i]) >= 1 and s[i:] in verbs and len(s[i:]) >= 2:
                            hit('glued_verb_lex', r, m, f' → {s[:i]} {s[i:]}?')
                            break
            if p == 'NOUN' and ' ' not in s and len(s) >= 4 and s not in allw:
                for i in range(2, len(s) - 1):
                    if s[:i] in nouns and s[i:] in nouns:
                        hit('glued_noun_lex', r, m, f' → {s[:i]} {s[i:]}?')
                        break

    # 중복
    by_id = collections.defaultdict(list)
    for r in rows:
        by_id[r['jmdict_id']].append(r)
    dup_in = 0
    for jid, rs in by_id.items():
        seen = {}
        for r in rs:
            for m in r['meanings']:
                k = (m['meaning'], m['pos'])
                if k in seen and seen[k] != r['sense_no']:
                    dup_in += 1
                    hits['dup_in_entry'].append(
                        f"{entries.get(jid,{}).get('word','?')} #{seen[k]}/#{r['sense_no']} `{k[0]}={k[1]}`")
                seen.setdefault(k, r['sense_no'])
    # 같은 표제어(word+reading 동일, jmdict_id 다름) — 뜻 집합 완전 동일 / 일부 겹침
    by_word = collections.defaultdict(list)
    for jid, rs in by_id.items():
        e = entries.get(jid, {})
        sig = tuple(sorted({(m['meaning'], m['pos']) for r in rs for m in r['meanings']}))
        by_word[(e.get('word'), e.get('reading'))].append((jid, sig))
    word_multi = sum(1 for v in by_word.values() if len(v) > 1)
    word_same = 0
    for (w, rd), v in by_word.items():
        if len(v) < 2:
            continue
        sigs = collections.Counter(s for _, s in v)
        for s, c in sigs.items():
            if c > 1:
                word_same += 1
                hits['dup_same_word'].append(
                    f"{w}({rd}) ×{c} ids={[j for j, x in v if x == s]} `{';'.join(a for a, _ in s)[:40]}`")
        for i in range(len(v)):
            for j in range(i + 1, len(v)):
                common = {a for a, _ in v[i][1]} & {a for a, _ in v[j][1]}
                if common and v[i][1] != v[j][1]:
                    hits['overlap_same_word'].append(
                        f"{w}({rd}) {v[i][0]}/{v[j][0]} 공통 `{';'.join(sorted(common))[:40]}`")

    # 기본어(N5·N4) sense 1 첫 뜻: JMdict 동사인데 첫 뜻이 ADJ
    for r in rows:
        e = entries.get(r['jmdict_id'], {})
        if r['sense_no'] != 1 or e.get('jlpt') not in ('N5', 'N4') or e.get('word') in BASIC_ADJ_OK:
            continue
        s1 = next((x for x in e.get('senses', []) if x['sense_no'] == 1), None)
        if s1 and any(t.startswith(('v1', 'v5', 'vk', 'vz', 'vs-i', 'vs-s')) for t in s1['pos']) \
                and r['meanings'][0]['pos'] == 'ADJ':
            hit('basic_first_adj', r, r['meanings'][0])

    # 이전 감사(R2) 지목 개별 오류 잔존
    idx = {(r['jmdict_id'], r['sense_no']): r for r in rows}
    for jid, sno, bad in R2_BAD:
        r = idx.get((jid, sno))
        for m in (r['meanings'] if r else []):
            if m['meaning'] == bad:
                hit('r2_residual', r, m)
    for jid, sno, want, wpos in R2_FIRST:
        r = idx.get((jid, sno))
        if r and (r['meanings'][0]['meaning'], r['meanings'][0]['pos']) != (want, wpos):
            hit('r2_residual', r, r['meanings'][0], f' (첫 뜻이 `{want}={wpos}` 여야 함)')

    ov_path = os.path.join(BUILD, 'meaning_overrides.jsonl')
    ov_rows = 0
    if not args.raw and os.path.exists(ov_path):
        ov_rows = sum(1 for ln in open(ov_path, encoding='utf-8') if ln.strip())

    # krdict 대조 — 완전 일치 / 어간 근사(형용사 관형형·명사+하다 변형) / 미채택
    def stem(w):
        for sfx in ('스럽다', '하다', '다'):
            if w.endswith(sfx) and len(w) > len(sfx):
                return w[:-len(sfx)]
        return w

    def near(ms, w):
        a, b = stem(ms), stem(w)
        if len(b) < 1:
            return False
        k = 0
        while k < min(len(a), len(b)) and a[k] == b[k]:
            k += 1
        return k >= max(1, len(b) - 1) and k >= 1 and (len(b) >= 2 or len(a) <= 2)

    k_sense = k_with = k_exact_any = k_adapted_any = k_none = 0
    k_m_total = k_m_exact = k_m_adapted = 0
    ktype = collections.Counter()
    for r in rows:
        cs = cand.get(r['jmdict_id'])
        if cs is None:
            continue
        k_sense += 1
        if not cs:
            continue
        k_with += 1
        cw = [strip(w) for w, _ in cs]
        ex = ad = False
        for m in r['meanings']:
            k_m_total += 1
            ms = strip(m['meaning'])
            if ms in cw:
                k_m_exact += 1
                ex = True
            elif any(near(ms, w) for w in cw):
                k_m_adapted += 1
                ad = True
        k_exact_any += ex
        k_adapted_any += (ex or ad)
        e = entries.get(r['jmdict_id'], {})
        t = 'single' if len(e.get('senses', [])) == 1 else ('s1' if r['sense_no'] == 1 else 'sN')
        ktype[(t, 'all')] += 1
        if not (ex or ad):
            k_none += 1
            ktype[(t, 'none')] += 1
            key = 'krdict_unused_single' if t == 'single' else 'krdict_unused'
            if len(hits[key]) < 400:
                hits[key].append(
                    f"{e.get('word','?')}#{r['sense_no']} `{';'.join(m['meaning'] for m in r['meanings'])}` ← 후보 {','.join(w for w, _ in cs[:4])}")

    # 배치별 편차
    shares = {}
    for b, c in pos_batch.items():
        t = sum(c.values())
        shares[b] = {p: c[p] / t for p in pos_all}
    outl = []
    for p in ('NOUN', 'VERB', 'ADJ', 'ADV', 'PROPN'):
        vals = [shares[b][p] for b in shares]
        mu, sd = statistics.mean(vals), statistics.pstdev(vals)
        for b in sorted(shares):
            if sd and abs(shares[b][p] - mu) > 3 * sd:
                outl.append(f'batch {b}: {p} {shares[b][p]:.1%} (평균 {mu:.1%}, σ {sd:.1%})')

    # 보고서
    L = ['# 뜻·품사 패턴 탐지 (40_verify_meanings.py)', '',
         f'- 대상: meanings.jsonl {len(rows):,} sense / 뜻 {total_m:,}개 / 항목 {len(by_id):,}개',
         ('- 정정 오버레이 적용 **전** 원본 기준(--raw)' if args.raw else
          f'- 정정 오버레이(build/meaning_overrides.jsonl) {ov_rows:,}행 적용 후 기준'), '']
    fix_titles = [
        ('adj_da', 'ADJ 인데 `~다` 종결형 (관형형이어야 함)'),
        ('demon_not_pron', '지시대명사가 PRON 아님 (INTJ 머뭇거림 제외, "그때"는 NOUN 이어야 함)'),
        ('thing_demo_bare', 'あれ/それ/これ 의 단독 "저/그/이" (사물은 저것/그것/이것)'),
        ('glue_known', '붙여쓰기 오류 (그정도·그점·어느것·N수있다, 명사+지르다/부리다/짓다/피우다/떨다/치다 — 등재어 제외)'),
        ('sentence', '문장형 `~것`(등재어·기능어 제외) / `~이르는 말` / 마침표'),
        ('latin_translit', '표제어 라틴 약어를 한글 글자 이름으로 음차 (DVD→디브이디)'),
        ('basic_first_adj', 'N5·N4 동사 sense 1 첫 뜻이 ADJ (기본 대역은 VERB)'),
        ('r2_residual', '이전 감사(R2) 지목 개별 오류 잔존'),
        ('kana', '가나/한자 잔존'),
        ('paren2', '괄호 2개 이상'),
        ('len20', '20자 초과'),
    ]
    ref_titles = [
        ('da_not_pred', '(참고) `~다`로 끝나는데 VERB/AUX/ADJ 아님 — 인사말·`~마다`·외래어'),
        ('sentence_formal', '(참고) `~습니다/ㅂ니다` — 인사말 INTJ·경어 AUX 는 정상'),
        ('noun_adnominal', '(참고) NOUN 인데 관형형 어미 음절 종결 — 대부분 한자어(검진·출진)'),
        ('noun_ui', '(참고) NOUN 인데 받침+`의` 종결 — 대부분 한자어(각의·탈의)'),
        ('particle_end', '(참고) 조사 음절로 끝나는 뜻 — 대부분 명사(-가·마을·-은 부사)'),
        ('hada_noun', '(참고) `~하다`인데 NOUN'),
        ('han_verb', '(참고) 관형형 `~한`인데 VERB'),
        ('det_not_det', '(참고) `이/그/저` 단독이 DET 아님 — 저(1인칭)·그(3인칭)·이(치아) 정상'),
        ('latin', '(참고) 영문자 포함 — 복원한 약어(DVD 플레이어 등)·K수·B면'),
        ('glued_verb_cand', '(참고) 공백 없는 5자 이상 VERB(`~하다` 제외)'),
        ('glued_verb_resid', '(참고) └ 파생 접미 제외 잔여 — 대부분 합성동사(정상)'),
        ('glued_verb_lex', '(참고) └ 사전상 명사+동사로 분해·전체 미등재 — 보조용언·등재어 다수'),
        ('glued_noun_lex', '(참고) 공백 없는 4자 이상 NOUN 이 명사 2개로 분해·전체 미등재 — 합성어 허용'),
        ('dup_in_entry', '(참고) 같은 jmdict_id 내 sense 간 동일 (meaning,pos) — 허용(적재 단계 정리)'),
        ('dup_same_word', '(참고) 같은 표제어(word+reading)·다른 jmdict_id 간 뜻 집합 완전 동일'),
        ('overlap_same_word', '(참고) 같은 표제어(word+reading)·다른 jmdict_id 간 뜻 일부 겹침'),
    ]
    titles = fix_titles + ref_titles
    L.append('## 정정 대상 (목표 0)'); L.append('')
    L.append('| 항목 | 건수 |'); L.append('|---|---:|')
    for k, t in fix_titles:
        L.append(f'| {t} | {len(hits[k]):,} |')
    L.append('')
    L.append('## 참고 통계 (오탐·정상 포함)'); L.append('')
    L.append('| 항목 | 건수 |'); L.append('|---|---:|')
    for k, t in ref_titles:
        L.append(f'| {t} | {len(hits[k]):,} |')
    L.append(f'| (참고) 동일 표제어(word+reading)가 여러 jmdict_id 인 표제어 수 | {word_multi:,} |')
    L.append('')
    L.append('## krdict 대조'); L.append('')
    L.append(f'- 배치 입력에서 후보를 복원한 sense: {k_sense:,} / 후보 있는 sense: {k_with:,} ({k_with/max(k_sense,1):.1%})')
    L.append(f'- 후보 있는 sense 중 뜻 1개 이상이 후보 문자열과 **완전 일치**: {k_exact_any:,} ({k_exact_any/max(k_with,1):.1%})')
    L.append(f'- 완전 일치 + 어간 근사(즐겁다→즐거운, 공부→공부하다 등) 포함: {k_adapted_any:,} ({k_adapted_any/max(k_with,1):.1%})')
    L.append(f'- 후보가 있는데 하나도 채택 안 함: {k_none:,} ({k_none/max(k_with,1):.1%})  ※ 다른 sense 용 후보면 정상')
    L.append(f'- 뜻 단위: 후보 있는 sense 의 뜻 {k_m_total:,}개 중 완전 일치 {k_m_exact:,} ({k_m_exact/max(k_m_total,1):.1%}), 어간 근사 {k_m_adapted:,}')
    for t, lab in (('single', '단일 sense 항목'), ('s1', '다의어의 sense 1'), ('sN', '다의어의 sense 2+')):
        a, n = ktype[(t, 'all')], ktype[(t, 'none')]
        L.append(f'  - {lab}: 후보 있는 {a:,} 중 미채택 {n:,} ({n/max(a,1):.1%})')
    L.append('')
    L.append('## 품사 분포'); L.append('')
    L.append('| POS | 건수 | 비율 |'); L.append('|---|---:|---:|')
    for p, c in pos_all.most_common():
        L.append(f'| {p} | {c:,} | {c/total_m:.1%} |')
    L.append(''); L.append('### 배치별 이상치 (평균 ±3σ 초과)'); L.append('')
    L.extend(f'- {x}' for x in outl) if outl else L.append('- 없음')
    L.append('')
    L.append('## 예시 (정정 대상은 전부, 참고는 최대 10건)'); L.append('')
    fixk = {k for k, _ in fix_titles}
    for k, t in titles + [('krdict_unused_single', '단일 sense 인데 후보 미채택'), ('krdict_unused', '다의어 sense 후보 미채택')]:
        if not hits[k]:
            continue
        L.append(f'### {t} — {len(hits[k]):,}건')
        L.extend(f'- {x}' for x in (hits[k] if k in fixk else hits[k][:N_EX]))
        L.append('')
    with open(os.path.join(AUDIT, args.out_stem + '.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(L) + '\n')
    # 전체 목록(수동 분류용)
    with open(os.path.join(AUDIT, args.out_stem + '_all.json'), 'w', encoding='utf-8') as f:
        json.dump(hits, f, ensure_ascii=False, indent=0)
    print('\n'.join(L[:60]))


if __name__ == '__main__':
    main()
