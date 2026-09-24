"""30_make_batches.py / 35_apply_batches.py 공용 도우미.

배치 파일 규격은 BATCH_FORMAT.md 가 정본. 키는 항상 jmdict_id(+sense_no, tatoeba_ja_id)
로 잡고 순번→키 매핑은 batches/<kind>/manifest.json 에 둔다(entries/examples 재생성에 견디도록).
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, 'build')
BATCHES = os.path.join(ROOT, 'batches')
AUDIT = os.path.join(ROOT, 'audit')

ENTRIES = os.path.join(BUILD, 'entries.jsonl')
EXAMPLES = os.path.join(BUILD, 'examples.jsonl')
KRDICT_REV = os.path.join(BUILD, 'krdict_ja_reverse.json')
NEED_GEN = os.path.join(BUILD, 'need_generation.json')
MEANINGS = os.path.join(BUILD, 'meanings.jsonl')
EXAMPLES_KO = os.path.join(BUILD, 'examples_ko.jsonl')
EXAMPLES_GEN = os.path.join(BUILD, 'examples_generated.jsonl')

KINDS = ('meaning', 'example', 'example_gen')
BATCH_SIZE = {'meaning': 100, 'example': 150, 'example_gen': 50}
MAX_RETRY = 3
JLPT_ORDER = ['N5', 'N4', 'N3', 'N2', 'N1']

STRONG_OPEN = '<strong class="target-word">'
STRONG_CLOSE = '</strong>'
BASE_RE = re.compile(r'^batch_(\d{4})\.txt$')


def jlpt_rank(e):
    j = e.get('jlpt')
    return JLPT_ORDER.index(j) if j in JLPT_ORDER else len(JLPT_ORDER)


def clean(s):
    """배치 필드용: 탭/개행 제거."""
    if s is None:
        return ''
    return re.sub(r'\s+', ' ', str(s)).strip()


def kind_dir(kind):
    return os.path.join(BATCHES, kind)


def base_path(kind, no):
    return os.path.join(kind_dir(kind), f'batch_{no:04d}.txt')


def attempt_paths(kind, no, k):
    """k=0 원본, k=1..3 재시도. (입력, 출력) 경로."""
    stem = f'batch_{no:04d}' + (f'_retry{k}' if k else '')
    d = kind_dir(kind)
    return os.path.join(d, stem + '.txt'), os.path.join(d, stem + '_out.txt')


def list_batches(kind):
    d = kind_dir(kind)
    if not os.path.isdir(d):
        return []
    return sorted(int(m.group(1)) for f in os.listdir(d) if (m := BASE_RE.match(f)))


def manifest_path(kind):
    return os.path.join(kind_dir(kind), 'manifest.json')


def load_manifest(kind):
    p = manifest_path(kind)
    if not os.path.exists(p):
        return {'kind': kind, 'batches': {}}
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def atomic_write(path, text):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(text)
    os.replace(tmp, path)


def save_manifest(kind, man):
    atomic_write(manifest_path(kind), json.dumps(man, ensure_ascii=False, indent=1))


def iter_jsonl(path):
    if not os.path.exists(path):
        return
    with open(path, encoding='utf-8') as f:
        for line in f:
            if line.strip():
                yield json.loads(line)


def load_entries():
    return {e['jmdict_id']: e for e in iter_jsonl(ENTRIES)}


def load_meanings():
    """{jmdict_id: {sense_no: [{meaning,pos}, ...]}}"""
    out = {}
    for r in iter_jsonl(MEANINGS):
        out.setdefault(r['jmdict_id'], {})[r['sense_no']] = r['meanings']
    return out


def meanings_complete(e, meanings):
    got = meanings.get(e['jmdict_id'], {})
    return all(s['sense_no'] in got for s in e['senses'])


def sense_list_str(jid, meanings, star=None):
    """예문/생성 배치의 뜻목록 컬럼: `*1:먹다/섭취하다|2:살다`."""
    parts = []
    for no in sorted(meanings.get(jid, {})):
        ms = '/'.join(m['meaning'] for m in meanings[jid][no])
        parts.append(('*' if star == no else '') + f'{no}:{clean(ms)}')
    return '|'.join(parts)


def parse_sense_list(col):
    """뜻목록 컬럼 → sense_no 집합."""
    out = set()
    for p in col.split('|'):
        p = p.lstrip('*')
        no = p.split(':', 1)[0]
        if no.isdigit():
            out.add(int(no))
    return out


def strip_strong(s):
    return s.replace(STRONG_OPEN, '').replace(STRONG_CLOSE, '')
