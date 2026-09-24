"""3단계: LLM 배치 결과(_out.txt) 검증·적용.

  python3 scripts/35_apply_batches.py --kind meaning|example|example_gen
  python3 scripts/35_apply_batches.py --status [--kind ...]

매 실행마다 해당 kind 의 모든 _out.txt(+retryK)를 다시 파싱해 누적 산출물을 통째로 재작성한다
(상태 = 배치 파일, 멱등). 검증 실패 단위(meaning=단어, example=문장, example_gen=단어)만
batch_NNNN_retryK.txt 로 재배치(K≤3), 그래도 실패하면 audit/manual_review_<kind>.txt.
meaning 은 적용 후 build/meaning_overrides.jsonl(있으면)로 (jmdict_id, sense_no) 뜻 목록을 통째로 교체한다
(배치 원본은 그대로 두는 정정 오버레이, 같은 검증 — 표제어에 라틴 문자가 있으면 영문 약어 허용).
example 은 적용 후 두 층을 차례로 덧씌운다(뒤가 우선):
  1) build/example_overrides.jsonl — 44_build_example_overrides.py 의 결정론적 정정
     {jmdict_id, tatoeba_ja_id, sense_no, ko, rejected, reason, fix_reason}
  2) 재번역 배치 batches/example/batch_fix_NNNN(_out).txt — 키는 build/example_fix_manifest.json
     ({"batches": {"fix_0001": [[jmdict_id, tatoeba_ja_id], ...]}}), 출력 형식·검증은 일반 example 과 동일.
example_gen 은 build/example_gen_overrides.jsonl({jmdict_id, seq(1·2) 또는 ja_plain, sense_no, ja, ko,
fix_reason})이 있으면 해당 예문을 교체한다(같은 검증, 파일 없으면 무시). {jmdict_id, seq, rejected:true, reason}
행은 그 예문을 뺀다(47_apply_regen.py 가 재생성 배치의 X 거부를 이 형식으로 쓴다).
example_gen 출력은 `순번|X|사유`(사유 1~10자) 한 줄로 단어 전체를 거부할 수 있다(한 글자·접사·약어 등
단독 용법이 없는 표제어 — PROMPT_example.md 변형 B). 거부 단어는 생성 예문 0개로 적재된다.
example_gen 검증에는 "일본어 강조 구간 양끝이 형태소(fugashi) 경계여야 함"이 있다(勢力 의 勢 만 강조 등 실패).
"""
import argparse
import importlib.util
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from batch_common import (  # noqa: E402
    AUDIT, BUILD, ENTRIES, EXAMPLES_GEN, EXAMPLES_KO, KINDS, MAX_RETRY, MEANINGS, STRONG_CLOSE,
    STRONG_OPEN, atomic_write, attempt_paths, kind_dir, list_batches, load_manifest, parse_sense_list,
    strip_strong)

POS_OK = {'NOUN', 'VERB', 'ADJ', 'ADV', 'PRON', 'DET', 'ADP', 'CCONJ', 'SCONJ', 'NUM', 'INTJ',
          'PART', 'AUX', 'PROPN', 'X'}
HANGUL = re.compile(r'[가-힣]')
LATIN3 = re.compile(r'[A-Za-z]{3,}')
LATIN_ANY = re.compile(r'[A-Za-z\uFF21-\uFF3A\uFF41-\uFF5A]')   # 표제어 라틴 문자(전각 포함)
MEANING_OVERRIDES = os.path.join(BUILD, 'meaning_overrides.jsonl')   # 정정 오버레이(선택)
EXAMPLE_OVERRIDES = os.path.join(BUILD, 'example_overrides.jsonl')   # 예문 해석 결정론적 정정(선택)
EXAMPLE_GEN_OVERRIDES = os.path.join(BUILD, 'example_gen_overrides.jsonl')   # 생성 예문 정정(선택)
EXAMPLE_FIX_MANIFEST = os.path.join(BUILD, 'example_fix_manifest.json')   # 재번역 배치 키(선택)
REGEN_MANIFEST = os.path.join(BUILD, 'example_gen_regen_manifest.json')   # 생성 예문 재생성 배치 키(선택)
PUNCT_IN_STRONG = re.compile(r'[.。,、]')
PARTICLE_END = set('을를에의와과')   # 어미로는 드문 조사 음절만(는/이/가/은 은 오탐 과다)
PUNCT_ALL = re.compile(r'[\s。、．，！？!?,.「」『』（）()・…:;：；〜~\-―]')
OUT_FIELDS = {'meaning': 3, 'example': 3, 'example_gen': 4}
MEANING_MAX = 20
REASON_MAX = 10

_ex20 = None


def ex20():
    """20_build_examples.py 의 형태소 함수 재사용(수정 금지 — import 만)."""
    global _ex20
    if _ex20 is None:
        p = os.path.join(os.path.dirname(os.path.abspath(__file__)), '20_build_examples.py')
        spec = importlib.util.spec_from_file_location('build_examples20', p)
        _ex20 = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(_ex20)
    return _ex20


# ---------------------------------------------------------------- 입력 파싱

def read_input(path):
    """{seq: (raw_line, cols)}"""
    units = {}
    with open(path, encoding='utf-8') as f:
        for ln in f.read().split('\n'):
            if not ln:
                continue
            cols = ln.split('\t')
            units[int(cols[0])] = (ln, cols)
    return units


def unit_senses(kind, cols):
    if kind == 'meaning':
        return {int(p.split(':', 1)[0]) for p in cols[3].split('||')}
    if kind == 'example':
        return parse_sense_list(cols[3])
    return parse_sense_list(cols[4])


# ---------------------------------------------------------------- 검증 도우미

def check_strong(s, lang):
    if s.count(STRONG_OPEN) != 1 or s.count(STRONG_CLOSE) != 1:
        return f'{lang} strong 태그 1쌍 아님'
    a = s.index(STRONG_OPEN)
    b = s.index(STRONG_CLOSE)
    if b < a:
        return f'{lang} strong 순서 뒤집힘'
    inner = s[a + len(STRONG_OPEN):b]
    if not inner.strip():
        return f'{lang} strong 비어 있음'
    if PUNCT_IN_STRONG.search(inner):
        return f'{lang} strong 안에 구두점'
    if re.search(r'[<>]', strip_strong(s)):
        return f'{lang} 다른 태그/꺾쇠'
    return None


def particle_warn(ko):
    """강조 안 마지막 글자가 조사면 조사까지 삼킨 것으로 의심(경고만, 자동 실패 아님)."""
    a = ko.find(STRONG_OPEN)
    b = ko.find(STRONG_CLOSE)
    if 0 <= a < b:
        inner = ko[a + len(STRONG_OPEN):b].strip()
        if len(inner) > 1 and inner[-1] in PARTICLE_END:
            return f'강조 안 조사 의심: {ko}'
    return None


def check_ko(ko):
    if not ko.strip():
        return '한국어 비어 있음'
    if not HANGUL.search(strip_strong(ko)):
        return '한글 없음'
    return check_strong(ko, 'ko')


# ---------------------------------------------------------------- kind 별 출력 파싱

def parse_out(kind, path, units, ctx):
    """반환 (ok{seq: value}, fail{seq: reason}, errs[str], warns[str])"""
    nf = OUT_FIELDS[kind]
    rows, errs, warns = {}, [], []
    with open(path, encoding='utf-8') as f:
        lines = f.read().split('\n')
    while lines and lines[-1] == '':
        lines.pop()
    for i, ln in enumerate(lines, 1):
        parts = ln.split('|', nf - 1)
        gen_x = kind == 'example_gen' and len(parts) == 3 and parts[1].strip() == 'X'   # 순번|X|사유
        if (len(parts) != nf and not gen_x) or not parts[0].strip().isdigit():
            errs.append(f'L{i} 형식 불일치: {ln[:60]}')
            continue
        seq = int(parts[0].strip())
        if seq not in units:
            errs.append(f'L{i} 입력에 없는 순번 {seq}')
            continue
        rows.setdefault(seq, []).append([p.strip() for p in parts[1:]])
    ok, fail = {}, {}
    for seq, (raw, cols) in units.items():
        rs = rows.get(seq)
        if not rs:
            fail[seq] = '출력 누락'
            continue
        senses = unit_senses(kind, cols)
        fn = {'meaning': v_meaning, 'example': v_example, 'example_gen': v_gen}[kind]
        val, reason, w = fn(rs, senses, cols, dict(ctx, seq=seq))
        warns += [f'{seq}\t{cols[1]}\t{x}' for x in w]
        if reason:
            fail[seq] = reason
        else:
            ok[seq] = val
    return ok, fail, errs, warns


def check_meaning_items(n, pairs, allow_latin=False):
    """뜻 (meaning, pos) 목록 공통 검증. allow_latin=True(오버레이 + 표제어에 라틴 문자)면
    영문 3자 검사만 생략(DVD, JR 같은 원 약어 허용). 반환 (ms, reason)."""
    if not 1 <= len(pairs) <= 3:
        return None, f'sense {n} 뜻 개수 {len(pairs)}'
    ms = []
    for m, pos in pairs:
        if pos not in POS_OK:
            return None, f'sense {n} POS 허용값 아님: {pos}'
        if not m:
            return None, f'sense {n} 빈 뜻'
        if len(m) > MEANING_MAX:
            return None, f'sense {n} 20자 초과: {m}'
        if not HANGUL.search(m):
            return None, f'sense {n} 한글 없음: {m}'
        if not allow_latin and LATIN3.search(m):
            return None, f'sense {n} 영문 병기 의심: {m}'
        ms.append({'meaning': m, 'pos': pos})
    return ms, None


def apply_meaning_overrides(records):
    """build/meaning_overrides.jsonl({jmdict_id, sense_no, meanings:[{meaning,pos}], reason})이
    있으면 해당 (jmdict_id, sense_no)의 뜻 목록을 통째로 교체한다. 배치 원본(_out)은 그대로 두고
    정정만 덧씌우는 층. 검증 실패·대상 없음·중복 행은 적용하지 않고 오류로 돌려준다.
    반환 (records, errs, 적용 행수)."""
    if not os.path.exists(MEANING_OVERRIDES):
        return records, [], 0
    words = {}
    with open(ENTRIES, encoding='utf-8') as f:
        for line in f:
            e = json.loads(line)
            words[e['jmdict_id']] = e.get('word') or ''
    idx = {(r['jmdict_id'], r['sense_no']): r for r in records}
    errs, seen, n_ok = [], set(), 0
    with open(MEANING_OVERRIDES, encoding='utf-8') as f:
        for i, line in enumerate(f, 1):
            if not line.strip():
                continue
            tag = f'meaning_overrides L{i}'
            try:
                o = json.loads(line)
                key = (int(o['jmdict_id']), int(o['sense_no']))
                pairs = [(str(x['meaning']).strip(), str(x['pos']).strip()) for x in o['meanings']]
            except (ValueError, KeyError, TypeError) as ex:
                errs.append(f'{tag} 형식 오류: {ex}')
                continue
            if key in seen:
                errs.append(f'{tag} {key} 중복 행')
                continue
            seen.add(key)
            rec = idx.get(key)
            if rec is None:
                errs.append(f'{tag} {key} 대상 sense 없음')
                continue
            ms, reason = check_meaning_items(key[1], pairs,
                                             allow_latin=bool(LATIN_ANY.search(words.get(key[0], ''))))
            if reason:
                errs.append(f'{tag} {key} {reason}')
                continue
            rec['meanings'] = ms
            n_ok += 1
    return records, errs, n_ok


def example_units():
    """원 배치 입력 전체 → {(jmdict_id, tatoeba_ja_id): cols}. 오버레이·재번역 검증용(sense 집합 등)."""
    man = load_manifest('example')['batches']
    out = {}
    for no in list_batches('example'):
        keys = man.get(f'{no:04d}')
        if keys is None:
            continue
        for s, (_, cols) in read_input(attempt_paths('example', no, 0)[0]).items():
            if 1 <= s <= len(keys):
                out[tuple(keys[s - 1])] = cols
    return out


def apply_example_overrides(records, units):
    """build/example_overrides.jsonl 로 (jmdict_id, tatoeba_ja_id) 결과를 교체(원 _out 은 그대로).
    일반 example 과 같은 검증(sense_no ∈ 뜻목록, strong 1쌍, 한글 포함 / 거부 사유 1~10자).
    검증 실패·대상 없음·중복 행은 적용하지 않고 오류로 돌려준다. 반환 (errs, 적용 행수)."""
    if not os.path.exists(EXAMPLE_OVERRIDES):
        return [], 0
    idx = {(r['jmdict_id'], r['tatoeba_ja_id']): r for r in records}
    errs, seen, n_ok = [], set(), 0
    with open(EXAMPLE_OVERRIDES, encoding='utf-8') as f:
        for i, line in enumerate(f, 1):
            if not line.strip():
                continue
            tag = f'example_overrides L{i}'
            try:
                o = json.loads(line)
                key = (int(o['jmdict_id']), int(o['tatoeba_ja_id']))
                rejected = bool(o.get('rejected'))
            except (ValueError, KeyError, TypeError) as ex:
                errs.append(f'{tag} 형식 오류: {ex}')
                continue
            if key in seen:
                errs.append(f'{tag} {key} 중복 행')
                continue
            seen.add(key)
            rec = idx.get(key)
            if rec is None or key not in units:
                errs.append(f'{tag} {key} 대상 예문 없음')
                continue
            if rejected:
                reason = str(o.get('reason') or '').strip()
                if not reason or len(reason) > REASON_MAX:
                    errs.append(f'{tag} {key} X 사유 길이({len(reason)})')
                    continue
                new = {'sense_no': None, 'ko': None, 'rejected': True, 'reason': reason}
            else:
                sno, ko = o.get('sense_no'), str(o.get('ko') or '').strip()
                if not isinstance(sno, int) or sno not in parse_sense_list(units[key][3]):
                    errs.append(f'{tag} {key} sense_no 부적합: {sno}')
                    continue
                r = check_ko(ko)
                if r:
                    errs.append(f'{tag} {key} {r}')
                    continue
                new = {'sense_no': sno, 'ko': ko, 'rejected': False, 'reason': None}
            rec.update(new, fix=o.get('fix_reason') or 'override')
            n_ok += 1
    return errs, n_ok


def load_fix_manifest():
    if not os.path.exists(EXAMPLE_FIX_MANIFEST):
        return {}
    with open(EXAMPLE_FIX_MANIFEST, encoding='utf-8') as f:
        return json.load(f).get('batches', {})


def apply_example_fix(records):
    """재번역 배치(batches/example/batch_<name>_out.txt, name=fix_NNNN) 결과로 교체. 오버레이보다 우선.
    검증은 일반 example 출력과 동일(parse_out). 실패 줄은 교체하지 않고(원 결과·오버레이 유지) 실패로 보고.
    반환 (errs, warns, fails, 적용 수, 대기 수)."""
    fixes = load_fix_manifest()
    if not fixes:
        return [], [], [], 0, 0
    idx = {(r['jmdict_id'], r['tatoeba_ja_id']): r for r in records}
    errs, warns, fails, n_ok, pending = [], [], [], 0, 0
    d = kind_dir('example')
    for name in sorted(fixes):
        keys = fixes[name]
        inp = os.path.join(d, f'batch_{name}.txt')
        out = os.path.join(d, f'batch_{name}_out.txt')
        if not os.path.exists(inp):
            errs.append(f'batch_{name} 입력 파일 없음')
            continue
        units = read_input(inp)
        if not os.path.exists(out):
            pending += len(units)
            continue
        ok, fail, e, w = parse_out('example', out, units, {'keys': keys})
        errs += [f'batch_{name} {x}' for x in e]
        warns += [f'batch_{name}\t{x}' for x in w]
        fails += [f'batch_{name}\t{q}\t{units[q][1][1]}\t{r}' for q, r in sorted(fail.items())]
        for s, v in ok.items():
            key = tuple(keys[s - 1])
            rec = idx.get(key)
            if rec is None:
                errs.append(f'batch_{name} 순번 {s} {key} 대상 예문 없음')
                continue
            rec.update(v, fix=f'batch_{name}')
            n_ok += 1
    return errs, warns, fails, n_ok, pending


def apply_example_gen_overrides(records):
    """build/example_gen_overrides.jsonl({jmdict_id, seq 또는 ja_plain, sense_no, ja, ko, fix_reason})로
    생성 예문 1개를 교체. 키 = (jmdict_id, seq) 우선, 없으면 (jmdict_id, 기존 ja_plain).
    검증은 v_gen 과 동일(strong 1쌍·한글·길이·표제어 등장·형태소 경계·두 예문 동일 금지).
    {jmdict_id, seq, rejected:true, reason} 행은 그 예문을 records 에서 뺀다. 반환 (errs, 적용 행수)."""
    if not os.path.exists(EXAMPLE_GEN_OVERRIDES):
        return [], 0
    ents = {}
    with open(ENTRIES, encoding='utf-8') as f:
        for line in f:
            e = json.loads(line)
            ents[e['jmdict_id']] = e
    by_seq = {(r['jmdict_id'], r['seq']): r for r in records}
    by_plain = {(r['jmdict_id'], r['ja_plain']): r for r in records}
    errs, seen, n_ok = [], set(), 0
    with open(EXAMPLE_GEN_OVERRIDES, encoding='utf-8') as f:
        for i, line in enumerate(f, 1):
            if not line.strip():
                continue
            tag = f'example_gen_overrides L{i}'
            try:
                o = json.loads(line)
                jid = int(o['jmdict_id'])
                rejected = bool(o.get('rejected'))
                if not rejected:
                    sno, ja, ko = o['sense_no'], str(o['ja']).strip(), str(o['ko']).strip()
            except (ValueError, KeyError, TypeError) as ex:
                errs.append(f'{tag} 형식 오류: {ex}')
                continue
            rec = by_seq.get((jid, o['seq'])) if o.get('seq') is not None else \
                by_plain.get((jid, o.get('ja_plain')))
            if rec is None:
                errs.append(f'{tag} {jid} 대상 생성 예문 없음')
                continue
            key = (jid, rec['seq'])
            if key in seen:
                errs.append(f'{tag} {key} 중복 행')
                continue
            seen.add(key)
            if rejected:
                reason = str(o.get('reason') or '').strip()
                if not reason or len(reason) > REASON_MAX:
                    errs.append(f'{tag} {key} X 사유 길이({len(reason)})')
                    continue
                rec['_drop'] = True
                n_ok += 1
                continue
            e = ents.get(jid, {})
            cols = ['', e.get('word') or '', e.get('reading') or '', e.get('jlpt') or '-']
            if not isinstance(sno, int) or sno not in {s['sense_no'] for s in e.get('senses', [])}:
                errs.append(f'{tag} {key} sense_no 부적합: {sno}')
                continue
            r = check_strong(ja, 'ja') or check_ko(ko)
            if r:
                errs.append(f'{tag} {key} {r}')
                continue
            plain = strip_strong(ja)
            lo, hi = gen_len_range(cols[3], cols[1])
            n = len(PUNCT_ALL.sub('', plain))
            if not lo <= n <= hi:
                errs.append(f'{tag} {key} 길이 {n}자({cols[3]} {lo}~{hi})')
                continue
            if not headword_in(ja, jid, cols, {}):
                errs.append(f'{tag} {key} 표제어 미등장: {plain}')
                continue
            r = strong_morph_cross(ja)
            if r:
                errs.append(f'{tag} {key} {r}')
                continue
            other = by_seq.get((jid, 3 - rec['seq']))
            if other is not None and other['ja_plain'] == plain:
                errs.append(f'{tag} {key} 두 예문 동일')
                continue
            del by_plain[(jid, rec['ja_plain'])]
            rec.update(sense_no=sno, ja=ja, ja_plain=plain, ko=ko,
                       reading_tokens=ex20().reading_tokens(plain),
                       fix=o.get('fix_reason') or 'override')
            by_plain[(jid, plain)] = rec
            n_ok += 1
    records[:] = [r for r in records if not r.pop('_drop', False)]
    return errs, n_ok


def v_meaning(rs, senses, cols, ctx):
    got = {}
    for sno, body in rs:
        if not sno.isdigit():
            return None, f'sense_no 형식: {sno}', []
        n = int(sno)
        if n not in senses:
            return None, f'없는 sense_no {n}', []
        if n in got:
            return None, f'sense {n} 중복', []
        if '|' in body:
            return None, f'sense {n} 필드 과다', []
        items = [x for x in body.split(';')]
        if not 1 <= len(items) <= 3:
            return None, f'sense {n} 뜻 개수 {len(items)}', []
        pairs = []
        for it in items:
            if '=' not in it:
                return None, f'sense {n} POS 없음: {it}', []
            m, pos = it.rsplit('=', 1)
            pairs.append((m.strip(), pos.strip()))
        ms, reason = check_meaning_items(n, pairs)
        if reason:
            return None, reason, []
        got[n] = ms
    miss = senses - set(got)
    if miss:
        return None, f'sense 누락 {sorted(miss)}', []
    return got, None, []


def v_example(rs, senses, cols, ctx):
    if len(rs) != 1:
        return None, f'순번 {len(rs)}회 등장', []
    sno, ko = rs[0]
    if sno == 'X':
        if not ko or len(ko) > REASON_MAX:
            return None, f'X 사유 길이({len(ko)})', []
        return {'sense_no': None, 'ko': None, 'rejected': True, 'reason': ko}, None, []
    if not sno.isdigit() or int(sno) not in senses:
        return None, f'sense_no 부적합: {sno}', []
    r = check_ko(ko)
    if r:
        return None, r, []
    w = [x for x in [particle_warn(ko)] if x]
    return {'sense_no': int(sno), 'ko': ko, 'rejected': False, 'reason': None}, None, w


def gen_len_range(jlpt, word=''):
    """급수별 글자 수(구두점 제외). 긴 표제어(5자 이상)는 초과분만큼 상한을 늘린다."""
    lo, hi = (8, 15) if jlpt in ("N5", "N4") else (8, 30)
    return lo, hi + max(0, len(word) - 4)


_prep = None


def prepared_entry(jid, cols):
    """20_build_examples.load_entries() 의 준비된 항목(_forms 등)을 그대로 쓴다. 없으면 입력 표기로 최소 구성."""
    global _prep
    m = ex20()
    if _prep is None:
        _prep = m.load_entries()[0]
    e = _prep.get(jid)
    if e is None:
        forms = {m.half(f) for f in (cols[1], cols[2]) if f}
        e = {'_forms': forms, '_hira_forms': {m.kata2hira(f) for f in forms},
             '_word': m.half(cols[1]), '_kana': {m.half(cols[2])}, 'uk': False, 'senses': []}
    return e


def headword_in(ja, jid, cols, ctx):
    """표제어가 strong 구간에 실제로 등장하는지: 표기 부분문자열 또는 fugashi 기본형(lemma_span)."""
    m = ex20()
    plain = strip_strong(ja)
    a = ja.index(STRONG_OPEN)
    b = a + len(ja[a + len(STRONG_OPEN):ja.index(STRONG_CLOSE)])
    e = prepared_entry(jid, cols)
    inner = m.half(plain[a:b])
    if any(f in inner for f in e['_forms']):
        return True
    cur = 0
    while cur < len(plain):
        sp = m.lemma_span(plain, cur, e)
        if sp is None:
            return False
        if sp[0] < b and sp[1] > a:
            return True
        cur = sp[0] + 1
    return False


def strong_morph_cross(ja):
    """일본어 강조 구간 양끝이 형태소 경계가 아니면(勢力 의 勢, 眼科 의 科만 강조) 실패 사유."""
    plain = strip_strong(ja)
    a = ja.index(STRONG_OPEN)
    b = a + len(ja[a + len(STRONG_OPEN):ja.index(STRONG_CLOSE)])
    toks, _ = ex20().tokenize(plain)
    bounds = {0, len(plain)} | {t[1] for t in toks} | {t[2] for t in toks}
    if b not in bounds and plain[b - 1:b + 1] == '日間':
        b = b + 1        # 「13日間」의 13日: 日間 이 한 형태소지만 N日 표제어의 N일간 용법이라 허용(감사 판정)
    if a not in bounds or b not in bounds:
        return f'강조가 형태소 경계를 가로지름: {plain[a:b]} ⊂ ' + \
            ''.join(t[0] for t in toks if t[2] > a and t[1] < b)
    return None


_regen_ids = None


def regen_ids():
    """재생성 배치(47_apply_regen.py)가 맡은 jmdict_id — 원 배치에서는 경계 검사를 경고로 강등(중복 재시도 방지)."""
    global _regen_ids
    if _regen_ids is None:
        _regen_ids = set()
        if os.path.exists(REGEN_MANIFEST):
            with open(REGEN_MANIFEST, encoding='utf-8') as f:
                for keys in json.load(f).get('batches', {}).values():
                    _regen_ids.update(keys)
    return _regen_ids


def v_gen(rs, senses, cols, ctx):
    if len(rs) == 1 and rs[0][0] == 'X':
        reason = rs[0][1] if len(rs[0]) == 2 else '|'.join(rs[0][1:])
        if not reason or len(reason) > REASON_MAX:
            return None, f'X 사유 길이({len(reason)})', []
        return [], None, [f'거부(X): {reason}']
    if any(r[0] == 'X' for r in rs):
        return None, 'X 와 예문 혼재', []
    if len(rs) != 2:
        return None, f'예문 {len(rs)}개(2개 필요)', []
    jid = ctx['keys'][ctx['seq'] - 1]
    lo, hi = gen_len_range(cols[3], cols[1])
    out, warns = [], []
    for sno, ja, ko in rs:
        if not sno.isdigit() or int(sno) not in senses:
            return None, f'sense_no 부적합: {sno}', []
        r = check_strong(ja, 'ja') or check_ko(ko)
        if r:
            return None, r, []
        plain = strip_strong(ja)
        n = len(PUNCT_ALL.sub('', plain))
        if not lo <= n <= hi:
            return None, f'길이 {n}자({cols[3]} {lo}~{hi})', []
        if not headword_in(ja, jid, cols, ctx):
            return None, f'표제어 미등장: {plain}', []
        r = strong_morph_cross(ja)
        if r:
            if ctx.get('regen') or jid not in regen_ids():
                return None, r, []
            warns.append(f'{r} (재생성 대상 — 경고만)')
        w = particle_warn(ko)
        if w:
            warns.append(w)
        out.append({'sense_no': int(sno), 'ja': ja, 'ja_plain': plain, 'ko': ko})
    if out[0]['ja_plain'] == out[1]['ja_plain']:
        return None, '두 예문 동일', []
    return out, None, warns


# ---------------------------------------------------------------- 배치 처리

def process_batch(kind, no, keys, ctx, create=True):
    """반환 dict: ok{seq: val}, manual[(seq, cols, reason)], pending(int), errs, warns, created[]
    create=False(--status)면 재시도 입력을 만들지 않고 대기로 센다."""
    res = {'ok': {}, 'manual': [], 'pending': 0, 'errs': [], 'warns': [], 'created': [],
           'fails': []}
    ctx = dict(ctx, keys=keys)
    units = read_input(attempt_paths(kind, no, 0)[0])
    fail = {}
    for k in range(0, MAX_RETRY + 1):
        inp, out = attempt_paths(kind, no, k)
        if k and not os.path.exists(inp):
            if not create:
                res['pending'] += len(units)
                return res
            atomic_write(inp, '\n'.join(units[s][0] for s in sorted(units)))
            res['created'].append(os.path.basename(inp))
        cur = read_input(inp)
        for s in sorted(set(units) - set(cur)):
            res['manual'].append((s, units[s][1], '재시도 파일에 누락'))
        units = {s: units[s] for s in units if s in cur}
        if not os.path.exists(out):
            res['pending'] += len(units)
            return res
        tag = f'batch_{no:04d}' + (f'_retry{k}' if k else '')
        ok, fail, errs, warns = parse_out(kind, out, units, ctx)
        res['errs'] += [f'{tag} {x}' for x in errs]
        res['warns'] += [f'{tag}\t{x}' for x in warns]
        res['ok'].update(ok)
        res['fails'] += [f'{tag}\t{q}\t{units[q][1][1]}\t{r}' for q, r in sorted(fail.items())]
        if not fail:
            if create:
                # 규칙 변경 등으로 더 이상 필요 없어진 미처리 재시도 입력은 치운다(오배정 방지)
                for j in range(k + 1, MAX_RETRY + 1):
                    ji, jo = attempt_paths(kind, no, j)
                    if os.path.exists(ji) and not os.path.exists(jo):
                        os.remove(ji)
                        res['created'].append('(삭제) ' + os.path.basename(ji))
            return res
        units = {s: units[s] for s in fail}
    for s, reason in fail.items():
        res['manual'].append((s, units[s][1], reason))
    return res


def run(kind, write=True):
    man = load_manifest(kind)
    ctx = {}
    records, manual, errs, warns, created, fails = [], [], [], [], [], []
    rt = ex20().reading_tokens if (kind == 'example_gen' and write) else None
    tot = {'batches': 0, 'out': 0, 'ok': 0, 'pending': 0, 'manual': 0, 'retry_open': 0}
    for no in list_batches(kind):
        keys = man['batches'].get(f'{no:04d}')
        if keys is None:
            errs.append(f'batch_{no:04d} manifest 없음 — 건너뜀')
            continue
        tot['batches'] += 1
        if os.path.exists(attempt_paths(kind, no, 0)[1]):
            tot['out'] += 1
        r = process_batch(kind, no, keys, ctx, create=write)
        errs += r['errs']
        warns += r['warns']
        fails += r['fails']
        created += [f'{kind}/{c}' for c in r['created']]
        tot['ok'] += len(r['ok'])
        tot['pending'] += r['pending']
        tot['manual'] += len(r['manual'])
        if r['pending'] and any(os.path.exists(attempt_paths(kind, no, k)[0]) for k in (1, 2, 3)):
            tot['retry_open'] += 1
        for s, cols, reason in r['manual']:
            manual.append(f'batch_{no:04d}\t{s}\t{json.dumps(keys[s - 1])}\t{cols[1]}\t{reason}')
        for s, v in sorted(r['ok'].items()):
            key = keys[s - 1]
            if kind == 'meaning':
                for sno in sorted(v):
                    records.append({'jmdict_id': key, 'sense_no': sno, 'meanings': v[sno],
                                    'batch': no})
            elif kind == 'example':
                records.append({'jmdict_id': key[0], 'tatoeba_ja_id': key[1], **v, 'batch': no})
            else:
                for i, x in enumerate(v, 1):
                    records.append({'jmdict_id': key, 'seq': i, 'sense_no': x['sense_no'],
                                    'ja': x['ja'], 'ja_plain': x['ja_plain'], 'ko': x['ko'],
                                    'reading_tokens': rt(x['ja_plain']) if rt else None,
                                    'batch': no})
    return records, manual, errs, warns, created, fails, tot


OUTPUT = {'meaning': MEANINGS, 'example': EXAMPLES_KO, 'example_gen': EXAMPLES_GEN}


def apply(kind):
    records, manual, errs, warns, created, fails, tot = run(kind)
    n_ov = None
    ov_lines = []
    if kind == 'meaning':
        records, oerrs, n_ov = apply_meaning_overrides(records)
        errs += oerrs
    elif kind == 'example':
        units = example_units()
        oerrs, n_ov = apply_example_overrides(records, units)
        errs += oerrs
        if os.path.exists(EXAMPLE_OVERRIDES):
            ov_lines.append(f'  정정 오버레이 {os.path.relpath(EXAMPLE_OVERRIDES)}: 적용 {n_ov}행 · 거부 {len(oerrs)}행')
        ferrs, fwarns, ffails, n_fix, f_pend = apply_example_fix(records)
        errs += ferrs
        warns += fwarns
        fails += ffails
        if load_fix_manifest():
            ov_lines.append(f'  재번역 배치(fix): 적용 {n_fix}줄 · 검증 실패 {len(ffails)}줄 · 출력 대기 {f_pend}줄'
                            f' · 형식오류 {len(ferrs)}')
    elif kind == 'example_gen':
        oerrs, n_ov = apply_example_gen_overrides(records)
        errs += oerrs
        if os.path.exists(EXAMPLE_GEN_OVERRIDES):
            ov_lines.append(f'  정정 오버레이 {os.path.relpath(EXAMPLE_GEN_OVERRIDES)}: 적용 {n_ov}행 · 거부 {len(oerrs)}행')
    os.makedirs(AUDIT, exist_ok=True)
    atomic_write(OUTPUT[kind], ''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in records))
    mp = os.path.join(AUDIT, f'manual_review_{kind}.txt')
    if manual:
        atomic_write(mp, 'batch\t순번\tkey\t표제어\t사유\n' + '\n'.join(manual) + '\n')
    elif os.path.exists(mp):
        os.remove(mp)
    wp = os.path.join(AUDIT, f'warn_{kind}.txt')
    if warns or errs or fails:
        atomic_write(wp, '\n'.join(['# 검증 실패(시도별, 재시도/수동검수로 감)'] + fails +
                                   ['# 형식 오류(해당 줄 무시, 누락은 재시도로 감)'] + errs +
                                   ['# 경고(자동 실패 아님, 사람 검수)'] + warns) + '\n')
    elif os.path.exists(wp):
        os.remove(wp)
    print(f'{kind}: 배치 {tot["batches"]} (out {tot["out"]}) · 통과 단위 {tot["ok"]} · '
          f'대기 {tot["pending"]} · 수동검수 {tot["manual"]} · 형식오류줄 {len(errs)} · 경고 {len(warns)}')
    print(f'  → {os.path.relpath(OUTPUT[kind])} {len(records)}행')
    for x in ov_lines:
        print(x)
    if kind == 'meaning' and n_ov is not None and os.path.exists(MEANING_OVERRIDES):
        bad = sum(1 for x in errs if x.startswith('meaning_overrides'))
        print(f'  정정 오버레이 {os.path.relpath(MEANING_OVERRIDES)}: 적용 {n_ov}행 · 거부 {bad}행')
    if created:
        print(f'  재시도 파일 변경 {len(created)}: ' + ', '.join(created[:20]) +
              (' …' if len(created) > 20 else ''))


def status(kinds):
    for kind in kinds:
        if not list_batches(kind):
            print(f'{kind}: 배치 없음')
            continue
        _, _, errs, warns, _, _, tot = run(kind, write=False)
        todo = tot['batches'] - tot['out']
        print(f'{kind}: 배치 {tot["batches"]} / 완료(out) {tot["out"]} / 미완료 {todo} / '
              f'재시도 대기 배치 {tot["retry_open"]} · 단위 통과 {tot["ok"]} 대기 {tot["pending"]} '
              f'수동검수 {tot["manual"]}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--kind', choices=KINDS)
    ap.add_argument('--status', action='store_true')
    args = ap.parse_args()
    if args.status:
        status([args.kind] if args.kind else list(KINDS))
        return
    if not args.kind:
        ap.error('--kind 필요')
    apply(args.kind)


if __name__ == '__main__':
    main()
