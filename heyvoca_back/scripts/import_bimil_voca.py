"""
비밀과외 VOCA 29일치 → 사전 고도화 + 서점 단어장 29권 (이슈 #21).

입력: heyvoca_service/db/local-bimil-voca/extracted.json (일마다 단어 25 + 콜로케이션 5)
데이터 폴더(--data, 컨테이너 안 경로)에 아래 파일을 두고 쓴다:
  extracted.json            PDF 추출본(원본, 수정 금지)
  plan.json                 prep 결과 — 항목별 표제어·voca 매칭·뜻(품사·재사용 id)·예문 후보
  batches/in/bNN.json       예문 선택/생성 하위 워커 입력(50항목 단위)
  batches/out/bNN.json      하위 워커 결과(validate_batch.py 통과본)
  batches/final/bNN.json    out 을 verify_puzzles.py(조각 데이터 코드 검증)로 거른 최종본 — apply 입력
  new_tilde_meanings.json   apply 가 남기는 자리표시어(~, A/B) 포함 새 뜻 목록(TTS 읽기표 추가용)

단계:
  prep   : 매칭·뜻 정리·예문 후보 → plan.json, batches/in/*.json 생성(DB 변경 없음)
  apply  : plan.json + batches/final/*.json → 사전·서점 반영. 기본 dry-run(롤백), --apply 로 커밋.
           재실행 안전 — voca 는 표제어로, 뜻은 같은 단어의 정규화 동일 뜻으로, 예문은 같은 단어의
           동일 영어 원문으로 다시 찾고, 서점 단어장은 이름으로 찾아 매핑을 통째로 다시 만든다.
           voca.id 는 append-only(새 표제어만 INSERT, 기존 행 삭제·재할당 없음).

예문 메타(voca_example_meta)·라벨 v2 는 apply 후 기존 스크립트로 채운다:
  python3 scripts/build_example_meta.py --apply   → source 를 bimil20261030 으로 고친 뒤
  python3 jobs/label_examples_v2.py --lang en --apply --only-missing

사용법(워크트리 스크립트라 stdin 으로 실행):
  docker exec -i -w /app heyvoca_back_local python3 - prep  --data /tmp/bimil < scripts/import_bimil_voca.py
  docker exec -i -w /app heyvoca_back_local python3 - apply --data /tmp/bimil [--apply] < scripts/import_bimil_voca.py
"""

import argparse
import glob
import json
import os
import re
import sys
from collections import Counter
from datetime import datetime

sys.path.insert(0, '/app')

from sqlalchemy import text  # noqa: E402

from app import create_app, db  # noqa: E402
from app.services.sentence_puzzle import sentence_hash  # noqa: E402

SOURCE_TAG = 'bimil20261030'
BOOK_SOURCE = '비밀과외 VOCA'
BOOK_COLOR = {"main": "#3CC8B4", "sub": "#3CC8B44d", "background": "#EEFBF8"}
EXAMPLES_PER_ITEM = 2
BATCH_SIZE = 50
TAG_OPEN = '<strong class="target-word">'
TAG_CLOSE = '</strong>'

# ---------------------------------------------------------------- 표제어 정리
# PDF 표기 → 사전 표제어. 슬래시 대안은 첫 표기를 대표형으로 두고 나머지는 plan 의 alternates 에 남긴다.
HEAD_FIX = {
    'be known for (이유)': 'be known for',
    'be similar to+명사': 'be similar to',
    'apologize for 이유': 'apologize for',
    'mutually benificial': 'mutually beneficial',   # PDF 오타
    'outskirt': 'outskirts',                        # 사전 표제(복수형으로만 쓰임)
}
SLASH_HEADS = {
    'address problems/issues': ('address problems', ['address issues']),
    'inform/notify/remind A of B': ('inform A of B', ['notify A of B', 'remind A of B']),
    'heavy rain/snow': ('heavy rain', ['heavy snow']),
    'additional fees/costs': ('additional fees', ['additional costs']),
    'tight regulations/rules': ('tight regulations', ['tight rules']),
}

# (day, no) → 뜻 교정. 값: [(pos, meaning), ...] (PDF 품사 기호 그대로, None 은 콜로케이션)
SENSE_FIX = {
    (1, 18): [('동', '끝나다, 종료되다, 종점에 닿다')],
    (2, 18): [('명', '때, 기회, 경우'), ('동', '~의 원인이 되다')],
    (3, 5): [('형', '자격이 있는')],
    (6, 28): [(None, '~에 지원하다')],
    (21, 10): [('형', '좁은, 아슬아슬한')],
    (21, 16): [('형', '따분한, 흐릿한, 칙칙한'), ('동', '둔해지다, 약해지다')],
    (24, 27): [(None, '정기적으로 업데이트되는')],
    (26, 27): [(None, '~에 할인을 받다')],
    (26, 28): [(None, '폭우')],
    (26, 29): [(None, '추가 요금')],
    (26, 30): [(None, '~와 밀접하게 관련이 있다')],
    (27, 27): [(None, '강경한 규제')],
    (27, 29): [(None, '~을 위해 고안되다')],
}

POS_MAP = {'명': 'NOUN', '동': 'VERB', '형': 'ADJ', '부': 'ADV', '전': 'ADP'}
# 품사 없는 콜로케이션·'phr' 품사 결정: 명사구/형용사구 목록, 그 외 뜻이 '다'로 끝나면 VERB, 나머지 ADV
PHRASE_NOUN = {
    'inclement weather', 'utility fee', 'proximity to', 'pending decision', 'last-minute change',
    'extensive knowledge', 'confidential document', 'distinguished professor', 'demanding supervisor',
    'sustainable practices', 'valuable feedback', 'reliable service', 'heavy rain', 'additional fees',
    'tight regulations', 'temporarily out of stock',
}
PHRASE_ADJ = {
    'conveniently located', 'out of order', 'newly hired', 'mutually beneficial', 'under construction',
    'easily accessible', 'widely recognized', 'incredibly versatile', 'widely available', 'under control',
    'regularly updated',
}

# 새 단일어 표제의 발음(사전 표기 관례: 강세 부호 포함 IPA)
NEW_PRON = {
    'findings': 'fáindiŋz',
    'workload': 'wə́ːrklòud',
    'shortlist': 'ʃɔ́ːrtlìst',
    'double-book': 'dʌ́blbúk',
}
CEFR_BY_ZIPF = [(4.75, 'A1'), (4.3, 'A2'), (3.9, 'B1'), (3.47, 'B2'), (3.03, 'C1'), (-99, 'C2')]


def norm_gloss(s):
    """뜻 비교용 정규화 — 공백·문장부호·물결표 제거."""
    return re.sub(r'[\s~.,·;:!?\'"]+', '', s or '')


def split_glosses(meaning):
    """'A, B / C' → ['A','B','C']. 괄호·대괄호 안의 쉼표·슬래시는 나누지 않는다.
    슬래시는 앞뒤 공백이 있는 ' / ' 만 구분자로 본다('응답/대응하다'는 한 뜻)."""
    out, buf, depth = [], '', 0
    i = 0
    while i < len(meaning):
        ch = meaning[i]
        if ch in '([':
            depth += 1
        elif ch in ')]':
            depth -= 1
        if depth == 0 and (ch == ',' or meaning[i:i + 3] == ' / '):
            out.append(buf)
            buf = ''
            i += 3 if ch == ' ' else 1
            continue
        buf += ch
        i += 1
    out.append(buf)
    return [re.sub(r'\s+', ' ', g).strip() for g in out if g.strip()]


def phrase_pos(head, gloss):
    if head in PHRASE_NOUN:
        return 'NOUN'
    if head in PHRASE_ADJ:
        return 'ADJ'
    return 'VERB' if gloss.endswith('다') else 'ADV'


def has_placeholder(meaning, head):
    return '~' in meaning or bool(re.search(r'(^|[^A-Za-z])[AB]([^A-Za-z]|$)', meaning)) or '/' in meaning


_CONN = None   # heyvoca_dict 엔진 연결(raw SQL 은 RoutingSession 이 기본 바인드로 보내므로 직접 연결)


def q(sql, **kw):
    return _CONN.execute(text(sql), kw)


# ---------------------------------------------------------------- prep
def build_items(extracted):
    items = []
    for day in extracted:
        for it in day['items']:
            raw = it['word']
            alternates = []
            if raw in SLASH_HEADS:
                head, alternates = SLASH_HEADS[raw]
            else:
                head = HEAD_FIX.get(raw, raw)
            senses = SENSE_FIX.get((day['day'], it['no'])) or [(s['pos'], s['meaning']) for s in it['senses']]
            glosses = []
            for pdf_pos, meaning in senses:
                for g in split_glosses(meaning):
                    pos = POS_MAP.get(pdf_pos) if pdf_pos in POS_MAP else phrase_pos(head, g)
                    glosses.append({'pos': pos, 'meaning': g})
            items.append({
                'key': f"d{day['day']:02d}-{it['no']:02d}", 'day': day['day'], 'no': it['no'],
                'kind': it['kind'], 'pdf_word': raw, 'word': head, 'alternates': alternates,
                'pdf_senses': [{'pos': p, 'meaning': m} for p, m in senses], 'glosses': glosses,
            })
    return items


def find_voca(word):
    """표제어 매칭 — 대소문자 구분 일치 우선, 없으면 대소문자 무시 일치(사전은 2026-09 대소문자 병합으로
    'Mark'·'Lack' 처럼 대문자 표제 하나만 남은 단어가 있다)."""
    rows = q("SELECT id, word FROM voca WHERE word = :w", w=word).fetchall()
    exact = [r for r in rows if r[1] == word]
    pick = exact or rows
    return (pick[0][0], pick[0][1]) if pick else (None, None)


def load_meanings(voca_id):
    return [dict(id=r[0], meaning=r[1], pos=r[2]) for r in q(
        "SELECT m.id, m.meaning, m.pos FROM voca_meaning m JOIN voca_meaning_map mm ON mm.meaning_id = m.id "
        "WHERE mm.voca_id = :v ORDER BY m.id", v=voca_id)]


def load_candidates(voca_id, limit=6):
    rows = q(
        "SELECT e.id, e.exam_en, e.exam_ko, p.skip_reason, m.cefr FROM voca_example e "
        "JOIN voca_example_map x ON x.example_id = e.id "
        "JOIN voca_example_puzzle p ON p.example_id = e.id "
        "LEFT JOIN voca_example_meta m ON m.example_id = e.id "
        "WHERE x.voca_id = :v AND e.exam_en LIKE :t AND e.exam_ko LIKE :t ORDER BY e.id",
        v=voca_id, t=f'%{TAG_OPEN}%').fetchall()
    out = []
    for eid, en, ko, skip, cefr in rows:
        if skip is not None or en.count(TAG_OPEN) != 1 or ko.count(TAG_OPEN) != 1:
            continue
        n = len(re.sub(r'<[^>]+>', '', en).split())
        if not 5 <= n <= 18:
            continue
        out.append({'id': eid, 'en': to_brackets(en), 'ko': to_brackets(ko), 'cefr': cefr})
    # 토익 단어장에 어울리는 길이(8~14단어)를 앞으로
    out.sort(key=lambda c: (0 if 8 <= len(c['en'].split()) <= 14 else 1, c['id']))
    return out[:limit]


def to_brackets(s):
    return re.sub(r'<strong class="target-word">(.*?)</strong>', r'[[\1]]', s)


def matched_gloss(voca_meanings, gloss):
    k = norm_gloss(gloss['meaning'])
    same = [m for m in voca_meanings if norm_gloss(m['meaning']) == k]
    for m in same:
        if m['pos'] == gloss['pos']:
            return m['id']
    for m in same:
        if m['pos'] in (None, 'X') or gloss['pos'] in ('ADV', 'ADJ', 'VERB', 'NOUN') and len(same) == 1:
            return m['id']
    return None


def cmd_prep(data):
    extracted = json.load(open(os.path.join(data, 'extracted.json'), encoding='utf-8'))
    items = build_items(extracted)
    stats = Counter()
    for it in items:
        vid, vword = find_voca(it['word'])
        it['voca_id'], it['voca_word'] = vid, vword
        stats['voca_existing' if vid else 'voca_new'] += 1
        if vid and vword != it['word']:
            stats['voca_case_diff'] += 1
        vm = load_meanings(vid) if vid else []
        for g in it['glosses']:
            g['meaning_id'] = matched_gloss(vm, g)
            stats['gloss_reuse' if g['meaning_id'] else 'gloss_new'] += 1
        it['candidates'] = load_candidates(vid) if vid else []
        stats['with_candidates' if it['candidates'] else 'no_candidates'] += 1
    json.dump(items, open(os.path.join(data, 'plan.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    bdir = os.path.join(data, 'batches', 'in')
    os.makedirs(bdir, exist_ok=True)
    for i in range(0, len(items), BATCH_SIZE):
        batch = [{
            'key': it['key'], 'word': it['word'], 'kind': it['kind'],
            'meanings': [f"({g['pos']}) {g['meaning']}" for g in it['glosses']],
            'candidates': [{'id': c['id'], 'en': c['en'], 'ko': c['ko']} for c in it['candidates']],
        } for it in items[i:i + BATCH_SIZE]]
        json.dump(batch, open(os.path.join(bdir, f'b{i // BATCH_SIZE:02d}.json'), 'w', encoding='utf-8'),
                  ensure_ascii=False, indent=1)
    print(json.dumps(stats, ensure_ascii=False))
    case = [(it['key'], it['word'], it['voca_word']) for it in items if it['voca_id'] and it['voca_word'] != it['word']]
    print('대소문자 다른 매칭:', case)


# ---------------------------------------------------------------- apply
PUNCT_EDGE = re.compile(r"^[^\w']+|[^\w']+$")


def tokens_of(en_br):
    """[[ ]] 표시 영어 → (tokens, target_idx). 문장부호 제거·원문 대소문자 유지
    (db/local-puzzle-work/tok_build.py 와 같은 규칙)."""
    marked = re.sub(r'\[\[(.*?)\]\]', lambda m: ' \x01' + m.group(1).replace(' ', ' \x01') + ' ', en_br)
    out, tgt = [], []
    for raw in marked.split():
        is_t = raw.startswith('\x01')
        raw = raw.lstrip('\x01')
        w = PUNCT_EDGE.sub('', raw)
        if not w:
            continue
        if is_t:
            tgt.append(len(out))
        out.append(w)
    return out, tgt


def to_tags(s):
    return re.sub(r'\[\[(.*?)\]\]', lambda m: TAG_OPEN + m.group(1) + TAG_CLOSE, s)


def load_outputs(data):
    res = {}
    for f in sorted(glob.glob(os.path.join(data, 'batches', 'final', 'b*.json'))):
        for r in json.load(open(f, encoding='utf-8')):
            res[r['key']] = r
    return res


def ensure_voca(it, now, stats):
    if it.get('voca_id'):
        return it['voca_id']
    vid, _ = find_voca(it['word'])
    if vid:
        return vid
    single = ' ' not in it['word']
    q("INSERT INTO voca (word, pronunciation, verb_forms, level, is_active) VALUES (:w, :p, NULL, NULL, 1)",
      w=it['word'], p=NEW_PRON.get(it['word']) if single else None)
    vid = q("SELECT LAST_INSERT_ID()").scalar()
    stats['voca_insert'] += 1
    if single:
        zipf = WORD_ZIPF.get(it['word'])
        cefr = next(c for t, c in CEFR_BY_ZIPF if (zipf if zipf is not None else -1) >= t) if zipf else 'C2'
        q("INSERT INTO voca_label (voca_id, cefr, cefr_source, freq_zipf, pos, pos_wordnet, lemma, sense_count, updated_at) "
          "VALUES (:v, :c, :s, :z, :pos, NULL, :l, :n, :t)",
          v=vid, c=cefr, s='freq-est' if zipf else 'no-freq', z=zipf, pos=it['glosses'][0]['pos'],
          l=it['word'], n=len(it['pdf_senses']), t=now)
        stats['voca_label_insert'] += 1
    return vid


# wordfreq(호스트) 로 미리 구한 새 단일어 zipf — 컨테이너에 wordfreq 가 없어 고정값으로 둔다
WORD_ZIPF = {'findings': 4.08, 'workload': 3.45, 'shortlist': 2.78, 'double-book': None}


def ensure_meaning(vid, g, stats, tilde, it):
    if g.get('meaning_id'):
        return g['meaning_id']
    mid = matched_gloss(load_meanings(vid), g)
    if mid:
        return mid
    q("INSERT INTO voca_meaning (meaning, pos) VALUES (:m, :p)", m=g['meaning'], p=g['pos'])
    mid = q("SELECT LAST_INSERT_ID()").scalar()
    q("INSERT INTO voca_meaning_map (voca_id, meaning_id) VALUES (:v, :m)", v=vid, m=mid)
    stats['meaning_insert'] += 1
    if has_placeholder(g['meaning'], it['word']):
        tilde.append({'meaning_id': mid, 'word': it['word'], 'pos': g['pos'], 'meaning': g['meaning']})
    # 유사 뜻 개념 그룹 1단계 규칙(정규화 동일 문자열): 같은 문자열 뜻이 속한 그룹에 붙인다
    k = norm_gloss(g['meaning'])
    if len(k) >= 2:
        cids = [r[0] for r in q(
            "SELECT DISTINCT c.concept_id FROM voca_meaning m JOIN voca_meaning_concept c ON c.meaning_id = m.id "
            "WHERE m.meaning = :m AND m.id <> :id", m=g['meaning'], id=mid)]
        for cid in cids:
            q("INSERT IGNORE INTO voca_meaning_concept (meaning_id, concept_id) VALUES (:m, :c)", m=mid, c=cid)
        stats['concept_link' if cids else 'concept_none'] += 1
    return mid


def ensure_example(vid, ex, stats, new_ids, now):
    en, ko = to_tags(ex['new'][0]), to_tags(ex['new'][1])
    row = q("SELECT e.id FROM voca_example e JOIN voca_example_map x ON x.example_id = e.id "
            "WHERE x.voca_id = :v AND e.exam_en = :en", v=vid, en=en).fetchone()
    if row:
        eid = row[0]
    else:
        q("INSERT INTO voca_example (exam_en, exam_ko) VALUES (:en, :ko)", en=en, ko=ko)
        eid = q("SELECT LAST_INSERT_ID()").scalar()
        q("INSERT INTO voca_example_map (voca_id, example_id) VALUES (:v, :e)", v=vid, e=eid)
        stats['example_insert'] += 1
    new_ids.append(eid)
    toks, tgt = tokens_of(ex['new'][0])
    exists = q("SELECT 1 FROM voca_example_puzzle WHERE example_id = :e", e=eid).fetchone()
    if not exists:
        q("INSERT INTO voca_example_puzzle (example_id, sentence_hash, tokens, target_idx, first_form, alt_orders, "
          "distractors, listen_distractors, skip_reason, updated_at) VALUES (:e, :h, :t, :ti, :f, :a, :d, :l, :s, :now)",
          e=eid, h=sentence_hash(en), t=json.dumps(toks, ensure_ascii=False), ti=json.dumps(tgt),
          f=ex.get('first') or (toks[0] if toks else None), a=json.dumps(ex.get('alt_orders') or [], ensure_ascii=False),
          d=json.dumps(ex.get('distractors') or [], ensure_ascii=False),
          l=json.dumps(ex.get('listen_distractors') or [], ensure_ascii=False), s=ex.get('skip'), now=now)
        stats['puzzle_insert'] += 1
    return eid


def cmd_apply(data, apply):
    items = json.load(open(os.path.join(data, 'plan.json'), encoding='utf-8'))
    outs = load_outputs(data)
    missing = [it['key'] for it in items if it['key'] not in outs]
    if missing:
        print('하위 워커 결과 없음:', len(missing), missing[:10])
        sys.exit(1)
    now = datetime.now().replace(microsecond=0)
    stats, tilde, new_ex_ids = Counter(), [], []
    for it in items:
        vid = ensure_voca(it, now, stats)
        it['_vid'] = vid
        it['_mids'] = [ensure_meaning(vid, g, stats, tilde, it) for g in it['glosses']]
        eids = []
        for ex in outs[it['key']]['ex']:
            if 'use' in ex:
                eids.append(int(ex['use']))
                stats['example_reuse'] += 1
            else:
                eids.append(ensure_example(vid, ex, stats, new_ex_ids, now))
        it['_eids'] = eids

    # 서점 단어장 29권 — 이름으로 찾아 매핑을 통째로 다시 만든다(재실행 안전)
    by_day = {}
    for it in items:
        by_day.setdefault(it['day'], []).append(it)
    for day, its in sorted(by_day.items()):
        name = f'Day {day:02d} 비밀과외 VOCA'
        bid = q("SELECT id FROM admin_voca_book WHERE book_nm = :n", n=name).scalar()
        if bid:
            q("UPDATE admin_voca_book SET word_count = :c, updated_at = :t WHERE id = :b", c=len(its), t=now, b=bid)
            q("DELETE FROM admin_voca_book_map WHERE book_id = :b", b=bid)   # 참조 테이블은 FK CASCADE
        else:
            q("INSERT INTO admin_voca_book (book_nm, language, source, category, username, word_count, updated_at) "
              "VALUES (:n, '영어', :s, 'TOEIC', '관리자', :c, :t)", n=name, s=BOOK_SOURCE, c=len(its), t=now)
            bid = q("SELECT LAST_INSERT_ID()").scalar()
            stats['book_insert'] += 1
        for it in sorted(its, key=lambda x: x['no']):
            meanings = [g['meaning'] for g in it['glosses']]
            exs = [dict(zip(('origin', 'meaning'), r)) for r in (
                q("SELECT exam_en, exam_ko FROM voca_example WHERE id = :e", e=e).fetchone() for e in it['_eids'])]
            q("INSERT INTO admin_voca_book_map (voca_id, book_id, level, voca_meanings, voca_examples) "
              "VALUES (:v, :b, NULL, :m, :x)", v=it['_vid'], b=bid,
              m=json.dumps(meanings, ensure_ascii=False), x=json.dumps(exs, ensure_ascii=False))
            map_id = q("SELECT LAST_INSERT_ID()").scalar()
            for o, mid in enumerate(dict.fromkeys(it['_mids'])):
                q("INSERT INTO admin_voca_book_map_meaning (map_id, meaning_id, ord) VALUES (:a, :m, :o)", a=map_id, m=mid, o=o)
            for o, eid in enumerate(dict.fromkeys(it['_eids'])):
                q("INSERT INTO admin_voca_book_map_example (map_id, example_id, ord) VALUES (:a, :e, :o)", a=map_id, e=eid, o=o)
            stats['map_insert'] += 1
        store = q("SELECT id FROM bookstore WHERE admin_voca_book_id = :b", b=bid).scalar()
        if store:
            q("UPDATE bookstore SET name = :n, updated_at = :t WHERE id = :s", n=name, t=now, s=store)
        else:
            q("INSERT INTO bookstore (name, downloads, category, category_id, color, gem, hide, level_id, book_id, "
              "admin_voca_book_id, created_at, updated_at) VALUES (:n, 0, 'TOEIC', 16, :c, 10, 'N', NULL, NULL, :b, :t, :t)",
              n=name, c=json.dumps(BOOK_COLOR), b=bid, t=now)
            stats['bookstore_insert'] += 1

    json.dump(tilde, open(os.path.join(data, 'new_tilde_meanings.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump(sorted(set(new_ex_ids)), open(os.path.join(data, 'new_example_ids.json'), 'w'), ensure_ascii=False)
    print(json.dumps(stats, ensure_ascii=False), '새 자리표시어 뜻', len(tilde))
    return apply


def main():
    ap = argparse.ArgumentParser(description='비밀과외 VOCA 사전 고도화 + 서점 단어장 (dry-run 기본)')
    ap.add_argument('cmd', choices=('prep', 'apply'))
    ap.add_argument('--data', default='/tmp/bimil')
    ap.add_argument('--apply', action='store_true')
    a = ap.parse_args()
    global _CONN
    app = create_app()
    with app.app_context():
        _CONN = db.get_engine(app, bind='dict').connect()
        trans = _CONN.begin()
        try:
            if a.cmd == 'prep':
                cmd_prep(a.data)
            else:
                cmd_apply(a.data, a.apply)
            if a.cmd == 'apply' and a.apply:
                trans.commit()
                print('커밋 완료')
            else:
                trans.rollback()
                if a.cmd == 'apply':
                    print('dry-run — 롤백(반영하려면 --apply)')
        except Exception:
            trans.rollback()
            raise
        finally:
            _CONN.close()


if __name__ == '__main__':
    main()
