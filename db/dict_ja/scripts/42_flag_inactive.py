"""학습 사전 비활성(is_active=false) 후보 1차 추출 → audit/inactive_candidates.json (읽기 전용 감사).

  python3 scripts/42_flag_inactive.py

entries.jsonl 의 영어 gloss/misc, meanings.jsonl 의 한국어 뜻에서 성적·외설·비속·차별 관련
키워드를 찾아 1차 후보를 뽑는다. 여기서 나온 후보는 사람이 직접 읽고 최종 판정해야 하며,
이 스크립트만으로 inactive 여부를 확정하지 않는다(키워드만으로는 의학·일반 단어와 구분 불가).

10_build_entries.py 의 SENSE_DROP({'arch','obs','vulg','derog','X','rare'})이 JMdict 자체가
vulg/derog/X 로 태그한 sense 는 이미 제거했으므로, 여기 남은 후보는 (a) JMdict 이 태그하지
않은 성적/비속/차별 표현, (b) 다의어 중 일부 sense 만 해당하는 경우, (c) 단순 키워드 오탐
(임신/성별/가슴 등 의학·일반 어휘)이 섞여 있다.

출력: audit/inactive_candidates.json — [{jmdict_id, word, reading, jlpt, matched:[...],
senses:[{sense_no,pos,misc,field,gloss}], ko_meanings:{sense_no:[...]}}]
사람이 이 파일을 읽고 최종 build/inactive_words.json 과 audit/inactive_review.md 를 만든다
(42 스크립트 자체는 최종 산출물을 쓰지 않는다).
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from batch_common import AUDIT, ENTRIES, MEANINGS, atomic_write  # noqa: E402

# ---------------------------------------------------------------- 키워드 (1차 후보용 — 과탐 허용)

EN_PATTERNS = [
    r'\bsex\b', r'\bsexual', r'\bsexy\b', r'\bsexist\b',
    r'\bpenis\b', r'\bvagina\b', r'\bgenital', r'\bfellatio', r'cunnilingus',
    r'masturbat', r'\borgasm', r'prostitut', r'\bbrothel', r'\bporn', r'\berotic',
    r'\bcondom', r'\bfuck', r'\bshit\b', r'\bpiss\b', r'copulat', r'intercourse',
    r'ejaculat', r'\brape\b', r'\brapist', r'\bmolest', r'\bpervert', r'incest',
    r'p(a)?edophil', r'\bwhore\b', r'\bslut\b', r'\bbitch\b', r'\bdick\b', r'\bcock\b',
    r'\bboner\b', r'\bhorny\b', r'\bkinky\b', r'\bbdsm\b', r'\bfetish\b',
    r'strip(per|tease)', r'\bnude\b', r'\bnaked\b', r'\bbosom\b', r'\bbreast',
    r'\bnipple', r'\btesticle', r'\bscrotum', r'\bclitoris', r'\banus\b', r'\bbuttock',
    r'\bcrotch\b', r'\blewd\b', r'obscen', r'indecent', r'\bvulgar\b', r'\bfilthy\b',
    r'\bcum\b', r'\bsemen\b', r'\bsperm\b', r'\bpubic\b', r'\banal\b', r'\bvulva\b',
    r'\blabia\b', r'\bconcubine\b', r'\bmistress\b', r'\bgigolo\b', r'love ?hotel',
    r'\bhomosexual', r'\btransvestite\b', r'cross-?dress',
    r'\bnigger\b', r'\bnegro\b', r'\bchink\b', r'\bgook\b', r'\bretard(ed)?\b',
    r'\bcripple\b', r'\bmoron\b', r'\bimbecile\b', r'\bracial slur', r'\bderogatory',
    r'discriminat', r'\bleper\b', r'\blunatic\b',
]
KO_KEYWORDS = [
    '성교', '성기', '자위', '매춘', '음경', '오르가슴', '포르노', '콘돔', '강간', '성추행',
    '성폭행', '창녀', '창녀촌', '씨발', '좆', '자지', '보지', '섹스', '매춘부', '윤간',
    '근친상간', '소아성애', '사창가', '음란', '외설', '저속', '비속어', '상스러운', '천박한',
    '변태', '색정', '노출증', '몸을 파는', '정액', '고환', '음부', '항문', '음경', '유두',
    '병신', '장애인 비하', '깜둥이', '검둥이', '짱깨', '되놈', '더러운 년', '갈보',
]
EN_RE = re.compile('|'.join(EN_PATTERNS), re.IGNORECASE)
KO_RE = re.compile('|'.join(re.escape(k) for k in KO_KEYWORDS))

MISC_FLAGS = {'vulg', 'X', 'derog', 'sens'}


def load_meanings_by_id():
    out = {}
    for line in open(MEANINGS, encoding='utf-8'):
        if not line.strip():
            continue
        r = json.loads(line)
        out.setdefault(r['jmdict_id'], {})[r['sense_no']] = r['meanings']
    return out


def main():
    meanings = load_meanings_by_id()
    candidates = []
    n_entries = 0
    with open(ENTRIES, encoding='utf-8') as f:
        for line in f:
            if not line.strip():
                continue
            n_entries += 1
            e = json.loads(line)
            matched = []
            for s in e['senses']:
                gloss_text = ' | '.join(s.get('gloss') or [])
                if EN_RE.search(gloss_text):
                    for pat in EN_PATTERNS:
                        if re.search(pat, gloss_text, re.IGNORECASE):
                            matched.append(f"en:{pat}@#{s['sense_no']}")
                misc = set(s.get('misc') or [])
                hit_misc = misc & MISC_FLAGS
                if hit_misc:
                    matched.append(f"misc:{','.join(sorted(hit_misc))}@#{s['sense_no']}")
                ko_list = meanings.get(e['jmdict_id'], {}).get(s['sense_no'], [])
                ko_text = ' | '.join(m['meaning'] for m in ko_list)
                if KO_RE.search(ko_text):
                    for kw in KO_KEYWORDS:
                        if kw in ko_text:
                            matched.append(f"ko:{kw}@#{s['sense_no']}")
            if matched:
                candidates.append({
                    'jmdict_id': e['jmdict_id'],
                    'word': e['word'],
                    'reading': e['reading'],
                    'jlpt': e.get('jlpt'),
                    'common': e.get('common'),
                    'matched': sorted(set(matched)),
                    'senses': [
                        {
                            'sense_no': s['sense_no'],
                            'pos': s.get('pos'),
                            'misc': s.get('misc'),
                            'field': s.get('field'),
                            'gloss': s.get('gloss'),
                            'ko_meanings': [m['meaning'] for m in
                                            meanings.get(e['jmdict_id'], {}).get(s['sense_no'], [])],
                        }
                        for s in e['senses']
                    ],
                })

    candidates.sort(key=lambda c: c['jmdict_id'])
    out_path = os.path.join(AUDIT, 'inactive_candidates.json')
    atomic_write(out_path, json.dumps(candidates, ensure_ascii=False, indent=1))
    print(f'entries scanned: {n_entries}')
    print(f'candidates: {len(candidates)}')
    print(f'-> {out_path}')


if __name__ == '__main__':
    main()
