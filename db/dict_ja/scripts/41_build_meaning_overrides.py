"""뜻 정정 오버레이 생성 → build/meaning_overrides.jsonl

  python3 scripts/41_build_meaning_overrides.py [--dry-run]

배치 원본(batches/meaning/*_out.txt)은 건드리지 않는다. 35 의 run('meaning') 으로 **오버레이 적용 전**
원본 레코드를 다시 읽어(멱등) 아래 규칙을 적용하고, 바뀐 (jmdict_id, sense_no) 만 오버레이 행으로 쓴다.
적용은 `35_apply_batches.py --kind meaning` 이 한다. 규칙 근거는 PROMPT_meaning.md, 감사 결과는
audit/meaning_patterns_full.md (40_verify_meanings.py).

자동 규칙
- adj_da      ADJ 인데 `~다` 종결 → 관형형(하다→한, 있다/없다→있는/없는, 이다→인, 아니다→아닌,
              ㅂ불규칙→운, 르→른, ㄹ탈락, ㅅ불규칙(낫다→나은), 받침→은, 모음→ㄴ). 전량 눈 검수함.
- demon_pron  지시대명사(거기/저쪽/그곳/그분 …)가 NOUN/ADV → PRON ("그때"는 NOUN 유지, INTJ 제외)
- thing_demo  あれ/それ 사물 sense 의 단독 "저/그" → "저거/그거"
- spacing     붙여쓰기 오류 → 띄어쓰기 (GLUE 표, 합성어·접미 파생어는 대상 아님)
수동 규칙(MANUAL): 문장형 `~것`, 라틴 약어 음차 복원, 기본어 첫 뜻, 이전 감사(R2) 지목 오류, 의미 오류.
"""
import argparse
import collections
import importlib.util
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from batch_common import BUILD, ENTRIES, atomic_write  # noqa: E402

OUT = os.path.join(BUILD, 'meaning_overrides.jsonl')

# ---------------------------------------------------------------- 자동 규칙 표

DEMON_PRON = {'이것', '그것', '저것', '이거', '그거', '저거', '여기', '거기', '저기', '이곳', '그곳',
              '저곳', '이쪽', '그쪽', '저쪽', '이분', '그분', '저분'}
DEMON_SKIP = {(1463100, '이분')}   # 二分 "이분(二分)" 은 한자어 명사
THING_DEMO = {'あれ': {'저': '저거'}, 'それ': {'그': '그거'}, 'これ': {'이': '이거'}}

GLUE = {
    '그정도': '그 정도', '이정도': '이 정도', '저정도': '저 정도', '그점': '그 점', '어느것': '어느 것',
    '소리지르다': '소리 지르다', '응석부리다': '응석 부리다', '고집부리다': '고집 부리다',
    '허세부리다': '허세 부리다', '미소짓다': '미소 짓다',
    '여성파트너': '여성 파트너', '건설관리': '건설 관리', '컴퓨터출력마이크로필름': '컴퓨터 출력 마이크로필름',
}

# 관형형 자동 변환 결과를 사람이 확인해 바꾼 것(규칙 결과와 다를 때만 기재)
ADJ_FIX = {}


def _jong(ch):
    o = ord(ch) - 0xAC00
    return o % 28 if 0 <= o < 11172 else -1


def _set_jong(ch, j):
    o = ord(ch) - 0xAC00
    return chr(0xAC00 + o - o % 28 + j)


B_REGULAR = ('좁', '굽', '잡', '입', '씹', '뽑', '업', '접', '집')   # ㅂ 규칙 활용 어간 끝


def adnominal(s):
    """형용사 `~다` → 관형형. 변환 불가면 None."""
    if s in ADJ_FIX:
        return ADJ_FIX[s]
    if not s.endswith('다') or len(s) < 2:
        return None
    if s.endswith(('있다', '없다')):
        return s[:-1] + '는'
    if s.endswith('아니다'):
        return s[:-3] + '아닌'
    if s.endswith('이다'):
        return s[:-2] + '인'
    if s.endswith('하다'):
        return s[:-2] + '한'
    st = s[:-1]
    c, j = st[-1], _jong(st[-1])
    if j == 17 and not st.endswith(B_REGULAR):          # ㅂ불규칙: 무섭다→무서운, 답다→다운
        return st[:-1] + _set_jong(c, 0) + '운'
    if c == '르':                                        # 르: 다르다→다른, 빠르다→빠른
        return st[:-1] + '른'
    if j == 8:                                           # ㄹ탈락: 길다→긴
        return st[:-1] + _set_jong(c, 4)
    if j == 19 and st.endswith('낫'):                    # ㅅ불규칙
        return st[:-1] + '나은'
    if j > 0:                                            # 받침: 맑다→맑은, 가당찮다→가당찮은
        return st + '은'
    return st[:-1] + _set_jong(c, 4)                     # 모음: 비싸다→비싼, 드세다→드센


# ---------------------------------------------------------------- 수동 정정 (sense 통째 교체)

MANUAL = {
    # 이전 감사(R2) 지목 개별 오류
    (1161170, 4): ([('한 번', 'ADV')], 'r2'),                                   # 一応#4 once
    (1431800, 3): ([('유흥에 빠짐', 'NOUN')], 'r2'),                             # 沈没#3
    (1277080, 2): ([('향하다', 'VERB'), ('면하다', 'VERB')], 'r2'),             # 向く#2 face (building)
    # 기본어(N5·N4) 첫 뜻은 원 품사(동사) 그대로
    (1340450, 1): ([('할 수 있다', 'VERB'), ('가능한', 'ADJ')], 'basic_first'),  # できる#1
    (1158880, 1): ([('다르다', 'VERB'), ('다른', 'ADJ')], 'basic_first'),       # 違う#1
    (1546640, 1): ([('필요하다', 'VERB'), ('필요한', 'ADJ')], 'basic_first'),   # 要る#1
    (1577980, 1): ([('있다', 'VERB')], 'basic_first'),                          # 居る#1
    # 문장형 `~것` → 명사형
    (1525250, 7): ([('지엽', 'NOUN'), ('사소한 일', 'NOUN')], 'sentence_geot'),   # 末#7 trifles
    (1209610, 2): ([('쓰레기', 'NOUN'), ('잡동사니', 'NOUN')], 'sentence_geot'),  # 瓦礫#2
    (1285840, 1): ([('다지기', 'NOUN'), ('새김', 'NOUN')], 'sentence_geot'),      # 刻み#1
    (1290320, 1): ([('혼합물', 'NOUN'), ('섞음질', 'NOUN')], 'sentence_geot'),    # 混ぜ物#1
    (1301490, 2): ([('싸구려', 'NOUN'), ('푼돈', 'NOUN')], 'sentence_geot'),      # 300#2
    (1437970, 2): ([('보증수표', 'NOUN'), ('필승 카드', 'NOUN')], 'sentence_geot'),  # 鉄板#2 sure thing
    (1579170, 3): ([('생명', 'NOUN'), ('목숨 같은 존재', 'NOUN')], 'sentence_geot'),  # 魂#3
    (1591850, 1): ([('스크랩', 'NOUN'), ('오려 낸 기사', 'NOUN')], 'sentence_geot'),  # 切り抜き#1
    (1610560, 1): ([('있는 재료', 'NOUN'), ('임시변통', 'NOUN')], 'sentence_geot'),  # ありあわせ#1
    (1610620, 1): ([('애장품', 'NOUN'), ('총아', 'NOUN'), ('마음에 드는 물건', 'NOUN')],
                   'sentence_geot'),                                             # お気に入り#1
    (1611430, 1): ([('불연물', 'NOUN'), ('불연성 쓰레기', 'NOUN')], 'sentence_geot'),  # 不燃物#1
    (1621110, 2): ([('기다리던 사람', 'NOUN'), ('고대하던 일', 'NOUN')], 'sentence_geot'),  # お待ちかね#2
    (1861770, 1): ([('많음', 'NOUN'), ('여럿', 'NOUN')], 'sentence_geot'),        # 多く#1
    (2201370, 1): ([('사소한 일', 'NOUN'), ('세부 사항', 'NOUN')], 'sentence_geot'),  # 細かいこと#1
    # 라틴 약어 억지 음차 → 원 약어 복원(표제어에 라틴 문자 있음; 한글 포함 규칙 때문에 약어 단독은 불가)
    (1000110, 1): ([('CD 플레이어', 'NOUN')], 'latin_restore'),                    # CDプレーヤー
    (2428550, 1): ([('DVD 플레이어', 'NOUN')], 'latin_restore'),                   # DVDプレーヤー
    (2446480, 1): ([('JR 그룹', 'PROPN'), ('일본철도', 'PROPN')], 'latin_restore'),  # JR
    (2222070, 1): ([('MP3 파일', 'NOUN'), ('MP3 형식', 'NOUN')], 'latin_restore'),  # MP3
    (2273030, 1): ([('현금인출기', 'NOUN'), ('ATM 기기', 'NOUN')], 'latin_restore'),  # ATM#1
    (1047840, 1): ([('녹아웃', 'NOUN'), ('KO승', 'NOUN'), ('녹아웃시키다', 'VERB')],
                   'latin_restore'),                                             # KO
    (1028510, 10): ([('S등급', 'NOUN'), ('최고 등급', 'NOUN')], 'latin_restore'),   # S#10
    # 관형형 변환 중 의미까지 바로잡은 것(자동 변환 결과 대신 채택)
    (1005210, 7): ([('담백한', 'ADJ'), ('산뜻한', 'ADJ')], 'adj_da'),              # さっぱり#7 순순하다(오역)
    (1401910, 5): ([('웃음', 'NOUN'), ('웃겨', 'INTJ')], 'adj_da'),                # 草#5 LOL
    (1344380, 2): ([('화를 면하다', 'VERB'), ('무사히 넘기다', 'VERB')], 'adj_da'),  # 助かる#2 동사 sense
}


def load_35():
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), '35_apply_batches.py')
    spec = importlib.util.spec_from_file_location('apply35', p)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def transform(rec, word):
    """반환 (새 뜻 목록, 적용 태그 Counter(뜻 단위))."""
    key = (rec['jmdict_id'], rec['sense_no'])
    tags = collections.Counter()
    if key in MANUAL:
        new, tag = MANUAL[key]
        tags[tag] += 1
        return [{'meaning': m, 'pos': p} for m, p in new], tags
    out = []
    for x in rec['meanings']:
        m, p = x['meaning'], x['pos']
        if m in GLUE:
            m = GLUE[m]
            tags['spacing'] += 1
        if p == 'ADJ' and m.endswith('다'):
            a = adnominal(m)
            if a and a != m:
                m = a
                tags['adj_da'] += 1
        if p in ('NOUN', 'ADV') and m in DEMON_PRON and (rec['jmdict_id'], m) not in DEMON_SKIP:
            p = 'PRON'
            tags['demon_pron'] += 1
        if word in THING_DEMO and m in THING_DEMO[word]:
            m = THING_DEMO[word][m]
            tags['thing_demo'] += 1
        if {'meaning': m, 'pos': p} not in out:
            out.append({'meaning': m, 'pos': p})
    return out, tags


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true', help='파일을 쓰지 않고 변경 내역만 출력')
    args = ap.parse_args()
    words = {}
    with open(ENTRIES, encoding='utf-8') as f:
        for line in f:
            e = json.loads(line)
            words[e['jmdict_id']] = e['word']
    records = load_35().run('meaning', write=False)[0]   # 오버레이 적용 전 원본
    have = {(r['jmdict_id'], r['sense_no']) for r in records}
    miss = [k for k in MANUAL if k not in have]
    if miss:
        sys.exit(f'MANUAL 대상 sense 없음: {miss}')
    rows, by_tag_m, by_tag_r = [], collections.Counter(), collections.Counter()
    for r in records:
        new, tags = transform(r, words.get(r['jmdict_id'], ''))
        if new == r['meanings']:
            continue
        by_tag_m.update(tags)
        by_tag_r.update(set(tags))
        rows.append({'jmdict_id': r['jmdict_id'], 'sense_no': r['sense_no'], 'meanings': new,
                     'reason': ','.join(sorted(tags))})
        if args.dry_run:
            old = ';'.join(f"{x['meaning']}={x['pos']}" for x in r['meanings'])
            nw = ';'.join(f"{x['meaning']}={x['pos']}" for x in new)
            print(f"{words.get(r['jmdict_id'])}#{r['sense_no']}\t{old}\t→ {nw}\t[{rows[-1]['reason']}]")
    if not args.dry_run:
        atomic_write(OUT, ''.join(json.dumps(x, ensure_ascii=False) + '\n' for x in rows))
    print(f'오버레이 {len(rows)}행' + ('' if args.dry_run else f' → {os.path.relpath(OUT)}'))
    for t in sorted(by_tag_r, key=lambda t: -by_tag_r[t]):
        print(f'  {t}: sense {by_tag_r[t]} / 뜻 {by_tag_m[t]}')


if __name__ == '__main__':
    main()
