#!/usr/bin/env python3
"""표제어 선정 + 골격 생성 → build/entries.jsonl, build/stats_entries.md

실행: docker exec heyvoca_dictja_work python3 scripts/10_build_entries.py
멱등: 입력(sources/)만 읽고 출력 파일을 매번 새로 쓴다.
"""
import csv
import json
import os
import random
import re
import sys
import time
from collections import Counter, defaultdict

import ijson

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kana_romaji import to_romaji  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'sources')
BUILD = os.path.join(ROOT, 'build')
JMDICT = os.path.join(SRC, 'jmdict-eng.json')
ACCENTS = os.path.join(SRC, 'kanjium', 'accents.txt')
JLPT_DIR = os.path.join(SRC, 'jlpt')
OUT = os.path.join(BUILD, 'entries.jsonl')
STATS = os.path.join(BUILD, 'stats_entries.md')
EXCLUDED = os.path.join(BUILD, 'excluded_entries.jsonl')
OVERRIDES = os.path.join(ROOT, 'scripts', 'jlpt_overrides.json')

# 항목 전체 제외 판단용(모든 sense 가 이 중 하나라도 가지면 고어/희귀 항목)
ENTRY_ARCHAIC = {'arch', 'obs', 'obsc', 'rare'}
# sense 단위 제거
SENSE_DROP = {'arch', 'obs', 'vulg', 'derog', 'X', 'rare'}
# 표제어로 고르지 않을 표기 태그(검색 전용/비정규/희귀 표기)
BAD_KANJI_TAGS = {'sK', 'rK', 'iK', 'oK'}
BAD_KANA_TAGS = {'sk', 'rk', 'ik', 'ok'}
JLPT_ORDER = ['N5', 'N4', 'N3', 'N2', 'N1']

KATA_RE = re.compile(r'^[゠-ヿ]+$')
HIRA_RE = re.compile(r'^[぀-ゟー]+$')

# 전각 영숫자 → 반각 (ＯＫ→OK, Ｔシャツ→Tシャツ)
FULLWIDTH = str.maketrans(
    'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ０１２３４５６７８９',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')


def half(t):
    return t.translate(FULLWIDTH)


_SMALL = str.maketrans('ぁぃぅぇぉゃゅょゎ', 'あいうえおやゆよわ')


def kana_variant_key(t):
    """표기 차이(가타/히라, 장음, 촉음, 소형 가나, ェ/エ) 를 무시하는 비교 키. ソファ≡ソファー, ドキドキ≡どきどき."""
    h = ''.join(chr(ord(ch) - 0x60) if 'ァ' <= ch <= 'ヶ' else ch for ch in t)
    return re.sub(r'[ーっ・]', '', h.translate(_SMALL))

t0 = time.time()


def log(*a):
    print(f'[10_build {time.time() - t0:6.1f}s]', *a, flush=True)


# ---------------------------------------------------------------- JLPT
def load_jlpt():
    by_id = {}            # jmdict_id -> 가장 쉬운 급수
    kana_by_id = {}       # jmdict_id -> JLPT 리스트가 의도한 읽기(쉬운 급수 기준)
    ids_by_level = defaultdict(set)
    no_id_rows = []       # seq 없는 행 (kanji, kana, level)
    raw_counts = Counter()
    for lv in reversed(JLPT_ORDER):  # N1 먼저 읽고 쉬운 급수로 덮어씀
        path = os.path.join(JLPT_DIR, f'{lv.lower()}.csv')
        with open(path, encoding='utf-8') as f:
            for row in csv.DictReader(f):
                raw_counts[lv] += 1
                seq = (row.get('jmdict_seq') or '').strip()
                if seq.isdigit():
                    by_id[int(seq)] = lv
                    kana_by_id[int(seq)] = (row.get('kana') or '').strip()
                    ids_by_level[lv].add(int(seq))
                else:
                    no_id_rows.append(((row.get('kanji') or '').strip(), (row.get('kana') or '').strip(), lv))
    return by_id, kana_by_id, ids_by_level, no_id_rows, raw_counts


def load_overrides():
    if not os.path.exists(OVERRIDES):
        return {}
    with open(OVERRIDES, encoding='utf-8') as f:
        raw = json.load(f).get('overrides', {})
    out = {}
    for k, v in raw.items():
        lv = v.get('jlpt') if isinstance(v, dict) else v
        assert lv is None or lv in JLPT_ORDER, (k, lv)
        out[int(k)] = lv
    return out


# ---------------------------------------------------------------- 액센트
def load_accents():
    exact = {}                    # (표기, 읽기) -> accent ; 가나 표제는 (가나, '')
    by_reading = defaultdict(set)  # 읽기 -> {accent}
    with open(ACCENTS, encoding='utf-8') as f:
        for line in f:
            parts = line.rstrip('\n').split('\t')
            if len(parts) < 3:
                continue
            w, r, a = parts[0], parts[1], parts[2]
            exact.setdefault((w, r), a)
            by_reading[r or w].add(a)
    return exact, by_reading


def match_accent(word, reading, kanji_forms, exact, by_reading):
    if (word, reading) in exact:
        return exact[(word, reading)], 'exact'
    for k in kanji_forms:
        if (k, reading) in exact:
            return exact[(k, reading)], 'kanji_form'
    if (reading, '') in exact:
        return exact[(reading, '')], 'kana'
    s = by_reading.get(reading)
    if s and len(s) == 1:
        return next(iter(s)), 'reading_unique'
    return None, None


# ---------------------------------------------------------------- 로마자
FUNC_POS = {'exp', 'conj', 'int', 'prt', 'adv'}
PARTICLE_WA = re.compile(r'(?<=[でにとちん])は(?=$|な)')


def romaji(text, pos=None):
    """헵번식. 인사말·접속사 등 기능어의 조사 は 는 wa 로 읽는다(こんにちは, それでは)."""
    fixed = False
    if pos and pos <= FUNC_POS and PARTICLE_WA.search(text):
        text = PARTICLE_WA.sub('わ', text)
        fixed = True
    text = re.sub(r'[っッ]+$', '', text) or text  # 끝 촉음(あっ)은 표기하지 않음
    return to_romaji(text), fixed


# ---------------------------------------------------------------- 표제어 결정
def applies(lst, form):
    return not lst or '*' in lst or form in lst


def choose_headword(e, kept_senses):
    kanji = e['kanji']
    kana = e['kana']
    first = kept_senses[0]
    good_kana = [k for k in kana if not (set(k['tags']) & BAD_KANA_TAGS)] or kana
    good_kanji = [k for k in kanji if not (set(k['tags']) & BAD_KANJI_TAGS)]
    flags = []
    uk = ('uk' in first['misc']) or not kanji or not good_kanji
    if uk:
        # 대표 sense 에 적용되는 가나 중 common 우선
        cands = [k for k in good_kana if applies(first['appliesToKana'], k['text'])] or good_kana
        pick = next((k for k in cands if k['common']), cands[0])
        word = reading = pick['text']
        if kanji and not good_kanji:
            flags.append('kanji_all_irregular')
        return word, reading, True, flags
    cands = [k for k in good_kanji if applies(first['appliesToKanji'], k['text'])] or good_kanji
    pick = next((k for k in cands if k['common']), cands[0])
    word = pick['text']
    rk = [k for k in good_kana if applies(k.get('appliesToKanji'), word)]
    if not rk:
        rk = good_kana
        flags.append('reading_fallback')
    rpick = next((k for k in rk if k['common']), rk[0])
    if not rpick['common'] and any(k['common'] for k in good_kana):
        flags.append('reading_not_common')
    return word, rpick['text'], False, flags


def main():
    os.makedirs(BUILD, exist_ok=True)
    jlpt_by_id, jlpt_kana, jlpt_ids_by_level, jlpt_no_id, jlpt_raw = load_jlpt()
    log(f'JLPT rows={sum(jlpt_raw.values())} unique ids={len(jlpt_by_id)} no-id rows={len(jlpt_no_id)}')
    source_jlpt = dict(jlpt_by_id)
    overrides = load_overrides()
    for oid, olv in overrides.items():
        jlpt_kana.pop(oid, None)  # 보정한 id 는 원 리스트의 읽기 비교를 하지 않음
        if olv is None:
            jlpt_by_id.pop(oid, None)
        else:
            jlpt_by_id[oid] = olv
    log(f'JLPT overrides applied={len(overrides)} (set {sum(v is not None for v in overrides.values())}, '
        f'cleared {sum(v is None for v in overrides.values())}) -> ids={len(jlpt_by_id)}')
    acc_exact, acc_reading = load_accents()
    log(f'accents keys={len(acc_exact)}')

    # seq 없는 JLPT 행: (kanji, kana) 로 매칭 대기
    no_id_keys = {}
    for kj, kn, lv in jlpt_no_id:
        no_id_keys.setdefault((kj, kn), lv)
    no_id_matched = set()

    tags = {}
    with open(JMDICT, 'rb') as f:
        for k, v in ijson.kvitems(f, 'tags'):
            tags[k] = v

    c = Counter()
    excl_reasons = Counter()
    pos_counter = Counter()
    jlpt_final = Counter()
    accent_method = Counter()
    dropped_senses = 0
    dropped_sense_misc = Counter()
    entries = []
    excluded = []
    jlpt_ids_seen = set()
    jlpt_excluded = []

    with open(JMDICT, 'rb') as f:
        for i, e in enumerate(ijson.items(f, 'words.item')):
            if i % 50000 == 0:
                log(f'scan {i} entries, candidates so far {c["candidate"]}')
            c['jmdict_total'] += 1
            jid = int(e['id'])
            is_common = any(k['common'] for k in e['kanji']) or any(k['common'] for k in e['kana'])
            lv = jlpt_by_id.get(jid)
            if lv:
                jlpt_ids_seen.add(jid)
            else:
                for kj in ([k['text'] for k in e['kanji']] or ['']):
                    for kn in [k['text'] for k in e['kana']]:
                        if (kj, kn) in no_id_keys and (kj, kn) not in no_id_matched:
                            lv = no_id_keys[(kj, kn)]
                            no_id_matched.add((kj, kn))
                            c['jlpt_matched_by_form'] += 1
                            break
                    if lv:
                        break
            if is_common:
                c['common'] += 1
            if lv:
                c['jlpt_in_jmdict'] += 1
            if not (is_common or lv):
                continue
            c['candidate'] += 1
            if is_common and lv:
                c['common_and_jlpt'] += 1
            elif lv:
                c['jlpt_only'] += 1

            def exclude(reason):
                excl_reasons[reason] += 1
                excluded.append({'jmdict_id': jid, 'reason': reason, 'jlpt': lv, 'common': is_common,
                                 'kanji': [k['text'] for k in e['kanji']], 'kana': [k['text'] for k in e['kana']],
                                 'gloss': [g['text'] for s in e['sense'] for g in s['gloss']][:4]})
                if lv:
                    jlpt_excluded.append((jid, lv, reason))

            senses = e['sense']
            # 고유명사만
            all_pos = {p for s in senses for p in s['partOfSpeech']}
            if all_pos and all_pos <= {'n-pr'}:
                exclude('proper_noun_only')
                continue
            # 모든 sense 가 고어/폐어/희귀
            if all(set(s['misc']) & ENTRY_ARCHAIC for s in senses):
                exclude('all_senses_archaic_obs_rare')
                continue
            kept = []
            for no, s in enumerate(senses, 1):
                bad = set(s['misc']) & SENSE_DROP
                if bad:
                    dropped_senses += 1
                    for b in bad:
                        dropped_sense_misc[b] += 1
                    continue
                kept.append((no, s))
            if not kept:
                exclude('no_sense_left')
                continue

            word, reading, uk, flags = choose_headword(e, [s for _, s in kept])
            raw_kanji = [k['text'] for k in e['kanji']]
            acc, how = match_accent(word, reading, raw_kanji, acc_exact, acc_reading)  # Kanjium 은 원 표기(전각) 기준
            kanji_forms = [{'text': half(k['text']), 'tags': k['tags'], 'common': k['common']} for k in e['kanji']]
            kana_forms = [{'text': half(k['text']), 'tags': k['tags'], 'common': k['common'],
                           'appliesToKanji': [x if x == '*' else half(x) for x in k.get('appliesToKanji', [])]}
                          for k in e['kana']]
            if half(word) != word or any(half(x) != x for x in raw_kanji + [k['text'] for k in e['kana']]):
                flags.append('fullwidth_normalized')
            word, reading = half(word), half(reading)
            accent_method[how or 'none'] += 1

            out_senses = []
            for no, s in kept:
                pos_counter.update(s['partOfSpeech'])
                out_senses.append({
                    'sense_no': no,
                    'pos': s['partOfSpeech'],
                    'misc': s['misc'],
                    'field': s['field'],
                    'gloss': [g['text'] for g in s['gloss'] if g.get('lang', 'eng') == 'eng'],
                    'info': '; '.join(s['info']) if s['info'] else None,
                })
            kept_pos = {p for s in out_senses for p in s['pos']}
            if len(word) == 1 and HIRA_RE.match(word):
                if kept_pos <= {'prt'}:
                    flags.append('single_kana_particle')
                else:
                    flags.append('single_kana')
            rom, wa_fixed = romaji(reading, kept_pos)
            if wa_fixed:
                flags.append('romaji_particle_wa')
            jk = jlpt_kana.get(jid)
            if jk and jk != reading and jk in (k['text'] for k in kana_forms) \
                    and kana_variant_key(jk) != kana_variant_key(reading):
                flags.append('jlpt_reading_differs:' + jk)
            if jid in overrides:
                flags.append('jlpt_override')
            if not is_common:
                flags.append('jlpt_only')
            if len(out_senses) >= 10:
                flags.append('many_senses')
            if len(kept) < len(senses):
                flags.append('senses_dropped')
            entries.append({
                'jmdict_id': jid, 'word': word, 'reading': reading, 'romaji': rom,
                'uk': uk, 'kanji_forms': kanji_forms, 'kana_forms': kana_forms,
                'jlpt': lv, 'accent': acc, 'common': is_common,
                'level': None, 'senses': out_senses, 'flags': flags,
            })
            if lv:
                jlpt_final[lv] += 1

    # 중복 표제어
    key_ids = defaultdict(list)
    for en in entries:
        key_ids[(en['word'], en['reading'])].append(en)
    dup_groups = 0
    jlpt_suspects = []
    for grp in key_ids.values():
        if len(grp) > 1:
            dup_groups += 1
            for en in grp:
                en['flags'].append('dup_headword')
            # JLPT 가 비상용 동형 항목에 붙고 상용 동형 항목엔 없음 → id 매핑 의심(JMdict 항목 분할 후 drift 등)
            for en in grp:
                if en['jlpt'] and not en['common'] and any(o['common'] and not o['jlpt'] for o in grp if o is not en):
                    en['flags'].append('jlpt_id_suspect')
                    jlpt_suspects.append(en)

    with open(OUT + '.part', 'w', encoding='utf-8') as o:
        for en in entries:
            o.write(json.dumps(en, ensure_ascii=False) + '\n')
    os.replace(OUT + '.part', OUT)
    with open(EXCLUDED, 'w', encoding='utf-8') as o:
        for x in excluded:
            o.write(json.dumps(x, ensure_ascii=False) + '\n')
    log(f'wrote {len(entries)} entries -> {OUT}')

    # ------------------------------------------------------------ 통계
    n = len(entries)
    total_senses = sum(len(e['senses']) for e in entries)
    uk_n = sum(e['uk'] for e in entries)
    acc_n = sum(e['accent'] is not None for e in entries)
    flag_counter = Counter(f.split(':')[0] for e in entries for f in e['flags'])
    jlpt_unique_total = len(jlpt_by_id) + len(no_id_keys)
    jlpt_missing_ids = sorted(set(jlpt_by_id) - jlpt_ids_seen)
    headword_uniq = len({e['word'] for e in entries})

    L = []
    w = L.append
    w('# 일한 사전 1단계 — 표제어 골격 통계\n')
    tag_rel = open(os.path.join(SRC, 'jmdict', 'RELEASE_TAG')).read().strip()
    w(f'- 생성: {time.strftime("%Y-%m-%d %H:%M:%S")} / JMdict (jmdict-simplified {tag_rel}) / 실행시간 {time.time() - t0:.0f}s\n')
    w('## 1. 후보 집계\n')
    w('| 항목 | 수 |\n|---|---:|')
    rows = [
        ('JMdict 전체 항목', c['jmdict_total']),
        ('common 항목 (kanji/kana 중 하나라도 common)', c['common']),
        ('JLPT 원본 행 (N5~N1 합, 중복 포함)', sum(jlpt_raw.values())),
        ('JLPT 고유 JMdict id + id 없는 행', f'{len(jlpt_by_id)} + {len(no_id_keys)}'),
        ('JLPT 중 JMdict 에서 찾음 (id 매칭 + 표기 매칭)', f'{c["jlpt_in_jmdict"]} ({len(jlpt_ids_seen)} + {c["jlpt_matched_by_form"]})'),
        ('JLPT id 가 현행 JMdict 에 없음', len(jlpt_missing_ids)),
        ('common ∩ JLPT', c['common_and_jlpt']),
        ('JLPT only (common 아님)', c['jlpt_only']),
        ('**합집합 (후보)**', c['candidate']),
    ]
    for k, v in rows:
        w(f'| {k} | {v} |')
    for r, v in excl_reasons.most_common():
        w(f'| 제외: {r} | {v} |')
    w(f'| **최종 항목** | **{n}** |')
    w(f'| 고유 표제어(word) 수 | {headword_uniq} |')
    w(f'| 총 sense 수 (항목당 평균) | {total_senses} ({total_senses / n:.2f}) |')
    w(f'| 버린 sense 수 | {dropped_senses} ({", ".join(f"{k} {v}" for k, v in dropped_sense_misc.most_common())}) |')
    w(f'| uk(가나 표제) 비율 | {uk_n} ({uk_n / n * 100:.1f}%) |')
    w(f'| accent 매칭 | {acc_n} ({acc_n / n * 100:.1f}%) — ' + ', '.join(f'{k} {v}' for k, v in accent_method.most_common()) + ' |')
    w(f'| dup_headword 그룹 | {dup_groups} 그룹 / {flag_counter["dup_headword"]} 항목 |')
    w('')
    w('## 2. JLPT 급수별\n')
    w('| 급수 | 원본 행 | 급수 내 고유 id | 쉬운 급수 채택 후 id | 최종 항목 | 제외됨 |\n|---|---:|---:|---:|---:|---:|')
    jx = Counter(lv for _, lv, _ in jlpt_excluded)
    adopted = Counter(jlpt_by_id.values())
    for lv in JLPT_ORDER:
        w(f'| {lv} | {jlpt_raw[lv]} | {len(jlpt_ids_by_level[lv])} | {adopted[lv]} | {jlpt_final[lv]} | {jx[lv]} |')
    w(f'| 합계 | {sum(jlpt_raw.values())} | {sum(len(v) for v in jlpt_ids_by_level.values())} | {len(jlpt_by_id)} | {sum(jlpt_final.values())} | {sum(jx.values())} |')
    w('\n(원본 행 수는 급수 간/급수 내 중복 포함. 같은 id 가 여러 급수에 있으면 쉬운 급수를 채택.)\n')
    if overrides:
        w(f'수동 보정(`scripts/jlpt_overrides.json`) {len(overrides)}건:\n')
        final_ids = {e['jmdict_id']: e for e in entries}
        for oid, olv in overrides.items():
            fe = final_ids.get(oid)
            where = f"{fe['word']}【{fe['reading']}】" if fe else '(최종 항목 아님)'
            w(f'- {oid} {where}: {source_jlpt.get(oid) or "-"} → {olv or "해제"}')
        w('')
    if jlpt_excluded:
        w('제외된 JLPT 항목:\n')
        exmap = {x['jmdict_id']: x for x in excluded}
        for jid, lv, r in jlpt_excluded:
            x = exmap[jid]
            w(f'- {lv} {jid} {"/".join(x["kanji"][:2])} 【{"/".join(x["kana"][:2])}】 {r} — {"; ".join(x["gloss"][:2])}')
        w('')
    if jlpt_missing_ids:
        w(f'현행 JMdict 에 없는 JLPT id (삭제/병합된 항목): {", ".join(map(str, jlpt_missing_ids[:50]))}\n')
    unmatched_noid = [k for k in no_id_keys if k not in no_id_matched]
    if unmatched_noid:
        w(f'id 없는 JLPT 행 중 표기 매칭 실패: {", ".join(f"{a}【{b}】" for a, b in unmatched_noid)}\n')

    if jlpt_suspects:
        w(f'JLPT id 매핑 의심 {len(jlpt_suspects)}건 (비상용 동형 항목에 급수, 상용 항목엔 없음): ' +
          ', '.join(f"{e['word']}({e['jlpt']}, {e['senses'][0]['pos'][0]}: {e['senses'][0]['gloss'][0]})" for e in jlpt_suspects) + '\n')
    w('## 3. 품사 태그 상위 20 (남은 sense 기준, 태그 중복 집계)\n')
    w('| 태그 | 설명 | sense 수 |\n|---|---|---:|')
    for p, v in pos_counter.most_common(20):
        w(f'| {p} | {tags.get(p, "")} | {v} |')
    w('')
    w('## 4. 플래그 분포\n')
    w('| flag | 항목 수 |\n|---|---:|')
    for f_, v in flag_counter.most_common():
        w(f'| {f_} | {v} |')
    w('')

    # 표본 20건: 대표 품사별로 골고루
    rnd = random.Random(20260924)
    buckets = defaultdict(list)
    for e in entries:
        p0 = e['senses'][0]['pos'][0] if e['senses'][0]['pos'] else '?'
        fam = re.sub(r'^(v5).*', r'\1', p0)
        fam = re.sub(r'^(vs).*', r'vs', fam)
        buckets[fam].append(e)
    order = ['n', 'v1', 'v5', 'vs', 'adj-i', 'adj-na', 'adv', 'exp', 'int', 'prt', 'conj', 'ctr',
             'pn', 'suf', 'pref', 'adj-no', 'adv-to', 'vk', 'aux-v', 'n-suf', 'adj-t', 'adj-pn']
    sample = []
    for fam in order:
        if buckets.get(fam) and len(sample) < 20:
            pool = [e for e in buckets[fam] if e['jlpt']] or buckets[fam]
            sample.append(rnd.choice(pool))
    while len(sample) < 20:
        sample.append(rnd.choice(entries))
    w('## 5. 표본 20건\n')
    w('| id | word | reading | romaji | uk | JLPT | accent | common | sense 수 | 대표 sense (pos: gloss) | flags |')
    w('|---|---|---|---|---|---|---|---|---:|---|---|')
    for e in sample:
        s = e['senses'][0]
        g = '; '.join(s['gloss'][:3]).replace('|', '/')
        w(f"| {e['jmdict_id']} | {e['word']} | {e['reading']} | {e['romaji']} | {'Y' if e['uk'] else ''} | {e['jlpt'] or ''} | "
          f"{e['accent'] or ''} | {'Y' if e['common'] else ''} | {len(e['senses'])} | #{s['sense_no']} {','.join(s['pos'])}: {g} | {','.join(e['flags'])} |")
    w('')
    # ------------------------------------------------------------ 우려점/다음 단계 참고 수치
    kata_only = [e for e in entries if KATA_RE.match(e['word'])]
    common_only = [e for e in entries if e['common'] and not e['jlpt']]
    fullwidth = [e for e in entries if 'fullwidth_normalized' in e['flags']]
    acc_multi = sum(1 for e in entries if e['accent'] and (',' in e['accent'] or '(' in e['accent']))
    idx_path = os.path.join(SRC, 'tatoeba', 'jpn_indices.csv')
    cov = Counter()
    tot = Counter()
    if os.path.exists(idx_path):
        hw = set()
        with open(idx_path, encoding='utf-8') as f:
            for line in f:
                for t in line.rstrip('\n').split('\t')[2].split(' '):
                    h = re.split(r'[(\[{~|]', t)[0]
                    if h:
                        hw.add(half(h))
        for e in entries:
            k = e['jlpt'] or '-'
            tot[k] += 1
            if any(f_['text'] in hw for f_ in e['kanji_forms'] + e['kana_forms']):
                cov[k] += 1
    w('## 6. 참고 수치 (우려점·다음 단계용)\n')
    w(f'- 가타카나 표제어: {len(kata_only)} ({len(kata_only) / n * 100:.1f}%), 그중 JLPT 없음 {sum(1 for e in kata_only if not e["jlpt"])}')
    w(f'- common 이지만 JLPT 없음: {len(common_only)} (가타카나 {sum(1 for e in common_only if KATA_RE.match(e["word"]))})')
    w(f'- 전각 영숫자 → 반각 정규화 항목(ＯＫ→OK, Ｔシャツ→Tシャツ; word/kanji_forms/kana_forms): {len(fullwidth)}')
    w(f'- accent 복수값/품사별 값(예: "0,2", "(副)0,(名)3"): {acc_multi}')
    if tot:
        w('- Tatoeba jpn_indices 표제어 등장(형태 무관, 읽기·뜻번호 미구분 상한치):')
        w('\n| 급수 | 등장 | 전체 | 비율 |\n|---|---:|---:|---:|')
        for k in JLPT_ORDER + ['-']:
            w(f'| {k if k != "-" else "JLPT 없음"} | {cov[k]} | {tot[k]} | {cov[k] / max(tot[k], 1) * 100:.1f}% |')
        w(f'| 합계 | {sum(cov.values())} | {n} | {sum(cov.values()) / n * 100:.1f}% |')
    w('')
    w('## 7. 우려점\n')
    w(f'1. **규모**: 합집합 {c["candidate"]} → 최종 {n}. 3만 이하라 축소는 불필요. 다만 JLPT 없는 common {len(common_only)}건 중 '
      f'Tatoeba 색인 미등장이 {tot["-"] - cov["-"]}건으로, 예문 LLM 생성 부담은 대부분 여기서 나온다. 줄여야 하면 '
      f'(a) JLPT 없음 ∧ 가타카나 ∧ 색인 미등장 항목을 2차로 미루거나 (b) 고유명사성 가타카나(국가·도시명 등 n 태그만 달린 것)를 걸러내는 순으로 제안.')
    w('2. **JLPT 매칭률**: id 기준이라 99.9% 가 붙지만, 원 소스(yomitan-jlpt-vocab)의 id 가 JMdict 개정으로 어긋난 사례가 있어 '
      f'`scripts/jlpt_overrides.json` 으로 보정({len(overrides)}건: 지정 {sum(v is not None for v in overrides.values())}, 해제 {sum(v is None for v in overrides.values())}). '
      f'남은 `jlpt_id_suspect` {flag_counter["jlpt_id_suspect"]}건은 검토 결과 원 소스 정의와 일치(동형 상용 항목이 따로 있을 뿐)라 유지.')
    w(f'3. **JLPT 의도 읽기 ≠ 대표 읽기** `jlpt_reading_differs` {flag_counter["jlpt_reading_differs"]}건 — 표기 차이(가타/히라·장음·촉음·소형 가나)는 제외하고 남긴 것. '
      '구어형(こっち), 연탁(ぐらい), 다른 읽기 지정(雷【いかずち】), 원 리스트 오류(地形【じぎょう】, 悪日【あくび】) 등. 급수는 항목(id) 단위로만 붙인다.')
    w('4. **표기**: 전각 영숫자는 반각으로 정규화(`fullwidth_normalized`). `kanji_forms`/`kana_forms` 는 {text,tags,common} 객체 배열로 태그(sK/rK/oK/iK, sk/rk/ok/ik)를 보존하며, '
      'word/reading 선택에서는 이 태그가 붙은 표기를 제외한다. 앱 노출용 이형태 목록도 태그로 거를 것.')
    w('5. **로마자**: pykakasi 가 외래어 소형 가나(ティ→tei)를 틀려 자체 변환기(scripts/kana_romaji.py)로 대체. wapuro식 장음(おう→ou, ー→모음 반복), ん+모음은 n\'. '
      '조사 は→wa 는 기능어(exp/conj/int/prt/adv)에서 で·に·と·ち·ん 뒤만 보정(`romaji_particle_wa`).')
    w('6. **액센트**: 값은 Kanjium 원문 문자열(복수값 "0,2", 품사별 "(副)0,(名)3" 포함). reading_unique 매칭은 읽기만 같은 동음이의어 값일 수 있어 신뢰도 낮음.')
    w('7. **uk 판정**: 대표 sense 에 uk 가 없어도 모든 한자 표기가 sK/rK/iK/oK 이면 가나 표제로 둔다(`kanji_all_irregular`).')
    w('')
    with open(STATS, 'w', encoding='utf-8') as o:
        o.write('\n'.join(L) + '\n')
    log(f'wrote stats -> {STATS}')


if __name__ == '__main__':
    main()
