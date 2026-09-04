import json, glob, collections, os
SRC = '/Users/whrksp126/other/project/heyvoca/heyvoca_service/db/bookstore_sources/toeic'
SP = os.path.dirname(os.path.abspath(__file__))

# 소스 pos(영어 표제어 기준) → UD 후보
MAP = {'n': {'NOUN'}, 'v': {'VERB'}, 'adj': {'ADJ'}, 'adv': {'ADV'},
       'prep': {'ADP'}, 'conj': {'CCONJ', 'SCONJ'}}

# DB: (word, meaning) -> [(id, pos)]
db = collections.defaultdict(list)
for ln in open(f'{SP}/db_all.tsv', encoding='utf-8'):
    p = ln.rstrip('\n').split('\t')
    if len(p) != 4: continue
    w, mid, mean, pos = p
    db[(w.strip().lower(), mean.strip())].append((int(mid), pos))

def split_meanings(t):
    # "직업, 경력" → ["직업", "경력"] + 원문 전체도 후보
    parts = [s.strip() for s in t.split(',') if s.strip()]
    return ([t.strip()] + parts) if len(parts) > 1 else [t.strip()]

total = matched = agree = 0
skipped_pos = collections.Counter()
disagree = []
seen_ids = set()
for f in glob.glob(f'{SRC}/*.json'):
    for w in json.load(open(f, encoding='utf-8')):
        origin = (w.get('origin') or '').strip().lower()
        for m in w.get('meanings', []):
            spos = (m.get('pos') or '').strip()
            text = (m.get('text') or '').strip()
            if not origin or not text: continue
            total += 1
            if spos not in MAP:
                skipped_pos[spos or '(빈값)'] += 1
                continue
            for cand in split_meanings(text):
                rows = db.get((origin, cand))
                if not rows: continue
                for mid, ourpos in rows:
                    if mid in seen_ids: continue
                    seen_ids.add(mid)
                    matched += 1
                    if ourpos in MAP[spos]: agree += 1
                    else: disagree.append((origin, cand, spos, ourpos, mid))

print(f'소스 뜻 총 {total}건')
print(f'  대조 불가(품사 체계 밖): {sum(skipped_pos.values())}건 → {dict(skipped_pos)}')
print(f'  DB 매칭 성공: {matched}건')
print(f'  일치: {agree} / 불일치: {len(disagree)}  → 일치율 {100*agree/matched:.1f}%' if matched else '  매칭 0')
c = collections.Counter((d[2], d[3]) for d in disagree)
print('\n불일치 상위 패턴 (소스 → 우리):')
for (s, o), n in c.most_common(12):
    print(f'  {s:5s} → {o or "(없음)":6s} : {n}건')
with open(f'{SP}/disagree.tsv', 'w', encoding='utf-8') as fp:
    for d in sorted(disagree):
        fp.write('\t'.join(map(str, d)) + '\n')
print(f'\n불일치 전체 저장: {SP}/disagree.tsv')
