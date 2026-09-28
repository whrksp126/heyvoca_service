"""
admin_voca_book_map(사전 DB, heyvoca_dict)의 voca_meanings/voca_examples JSON 텍스트
컬럼을 새 참조 테이블(admin_voca_book_map_meaning / admin_voca_book_map_example)로
이관하는 1회성 스크립트.

배경: 2026-09 구조 개편 — 서점 단어장은 더 이상 뜻/예문을 텍스트로 복사해 갖지 않고,
사전(voca_meaning/voca_example)의 ID + 순서(ord)만 참조한다. 조회 시 사전과 join해
지금과 같은 응답 모양({'meanings': [str,...], 'examples': [{'origin','meaning'},...]})을
만든다. 기존 JSON 컬럼(voca_meanings/voca_examples)은 롤백 대비로 지우지 않는다.

매칭 규칙
  - 뜻: 그 voca_id의 voca_meaning_map 후보 중 텍스트(strip → 바깥쪽 큰따옴표 한 겹 제거 →
    다시 strip 후 완전일치) 매칭. 큰따옴표 제거는 원본 admin JSON에 `"매출"`처럼 따옴표가
    통째로 섞여 들어간 행이 있어서다(2026-09 로컬 이관 때 13건 발견 — 따옴표 때문에 이미
    사전에 있는 `매출`과 매칭 실패해 중복 생성됐던 걸 정정). 매칭 후보 텍스트 쪽에는 원래도
    따옴표가 없으므로 strip만 한다. 없으면 새 VocaMeaning을 만들어 voca_meaning_map으로
    연결한다(pos는 voca_label.pos가 있으면 채우고 없으면 NULL).
  - 알려진 오염 문자열(_CORRUPTED_MEANING_TEXTS — UI 에러 메시지가 실수로 "뜻"으로 저장된
    행, 2026-09 로컬 이관에서 voca_id=762/word=revenue에 2건 발견)은 뜻 목록에서 완전히
    건너뛴다(생성도 매칭도 하지 않음).
  - 예문: 그 voca_id의 voca_example_map 후보 중
    app.services.sentence_puzzle.normalize_sentence_text(정규화: 태그 제거 → 소문자 →
    문장부호 제거 → 공백 1개)가 같은 것을 매칭. 없으면 새 VocaExample을 만들어 연결한다.
    매칭은 됐지만 원문(강조 태그 위치 등)이 다르면 사전 텍스트는 바꾸지 않고
    건수와 표본만 보고한다 — 어느 쪽이 맞는지는 다음 단계에서 사람이 판단한다.
  - **같은 voca_id에 정규화 문장이 동일한 예문이 여러 개(강조 대상 단어가 서로 다른 경우,
    예: citizen 예문과 have 예문이 둘 다 "Every citizen has the right to vote."로 겹치는
    경우) 있으면, 그중 <strong class="target-word"> 안쪽 텍스트가 그 voca.word(또는
    verb_forms 활용형)와 가장 잘 맞는 후보를 고른다**(_pick_best_example_match).
    2026-09-28 최초 이관 때는 정규화 일치 후보 중 조회 순서상 처음 걸리는 걸 그냥 썼다가
    'citizen' 두 번째 예문이 'has'를 강조하는 행(다른 단어의 예문)에 잘못 연결되는 버그가
    났다(2026-09-29 db/에서 감사 스크립트로 24건 발견·정정, .claude/rules/db-migration.md
    사전 데이터 감사 참고). 점수가 동률이거나 태그를 못 찾으면 기존과 동일하게 조회 순서상
    첫 후보를 쓴다(과matching 방지 — 애매하면 예전 동작을 유지).
  - 한 admin_voca_book_map 행 안에서 같은 뜻/예문이 같은 meaning_id/example_id로
    중복 매칭되면(원문 중복) PK(map_id, meaning_id)/(map_id, example_id) 충돌을 피하기
    위해 두 번째부터는 건너뛰고 dup_skipped로 집계한다(표시 순서상 중복 항목 1개 소실 —
    이미 화면에도 중복 텍스트로 보이던 행이라 영향 미미, 통계로 건수 보고).
  - g.dict_lang='ja'인 admin_voca_book_map 행은 heyvoca_dict_ja라는 별도 schema에 있어
    이 스크립트가 접근하는 heyvoca_dict(en)에는 없다 — 이번 스크립트는 en만 다룬다.

멱등성: 이미 admin_voca_book_map_meaning/_example에 링크가 있는 map_id는 건너뛴다
(재실행 안전 — 부분 --apply 후 이어서 실행 가능).

사용법 (컨테이너 내부):
  docker exec heyvoca_back_local python3 scripts/migrate_admin_book_map_refs.py            # dry-run(기본)
  docker exec heyvoca_back_local python3 scripts/migrate_admin_book_map_refs.py --apply     # 실제 커밋
  --book-id ID   특정 admin_voca_book만 처리(검증용)
  --limit N      앞에서부터 N개 map 행만 처리(검증용)
  --sample N     텍스트 차이 표본 출력 개수(기본 10)
"""

import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_STRONG_RE = re.compile(
    r'<strong[^>]*class="target-word"[^>]*>(.*?)</strong\s*>', re.IGNORECASE | re.DOTALL
)
_TAG_RE = re.compile(r'<[^>]+>')
_EN_SUFFIXES = ('ing', 'ies', 'es', 'ed', "'s", 's', 'er', 'est')


def strip_or_empty(s):
    return (s or '').strip() if isinstance(s, str) else ''


def _extract_strong_text(html):
    """<strong class="target-word">...</strong> 안쪽 텍스트(태그 제거)를 뽑는다. 없으면 None."""
    if not html:
        return None
    m = _STRONG_RE.search(html)
    if not m:
        return None
    return _TAG_RE.sub('', m.group(1)).strip()


def _strip_en_suffix(s):
    for suf in _EN_SUFFIXES:
        if s.endswith(suf) and len(s) > len(suf) + 1:
            return s[: -len(suf)]
    return s


def _emphasis_score(word, verb_forms_json, tag_text):
    """<strong> 강조 텍스트가 이 voca(word/활용형)를 가리킬 가능성 점수. 클수록 확실."""
    if not tag_text:
        return -1
    tag_norm = re.sub(r"[^a-z0-9' ]", '', tag_text.lower()).strip()
    if not tag_norm:
        return -1
    word_norm = (word or '').lower()
    forms = {word_norm}
    if verb_forms_json:
        try:
            vf = json.loads(verb_forms_json)
            for v in vf.values():
                if isinstance(v, str):
                    forms.add(v.lower())
        except Exception:
            pass
    if tag_norm in forms:
        return 100
    if any(_strip_en_suffix(tag_norm) == _strip_en_suffix(f) for f in forms):
        return 80
    word_tokens = word_norm.split()
    if len(word_tokens) > 1 and all(t in tag_norm.split() for t in word_tokens):
        return 90
    if len(word_norm) >= 3 and (word_norm in tag_norm or tag_norm in word_norm):
        return 40
    return 0


def _pick_best_example_match(unmatched, voca_word, voca_verb_forms):
    """정규화 문장이 같은 후보(unmatched: [eid, en, enorm], enorm이 모두 norm과 같음) 중
    강조 대상이 이 voca를 가장 잘 가리키는 걸 고른다. 동점/판단불가면 리스트 첫 항목(기존
    조회 순서 그대로) — 애매하면 예전 동작 유지."""
    if len(unmatched) == 1:
        return unmatched[0]
    scored = [
        (cand, _emphasis_score(voca_word, voca_verb_forms, _extract_strong_text(cand[1])))
        for cand in unmatched
    ]
    scored.sort(key=lambda t: -t[1])
    best_score = scored[0][1]
    tied = [c for c, sc in scored if sc == best_score]
    if best_score >= 40 and len(tied) == 1:
        return tied[0]
    return unmatched[0]


def normalize_meaning_text(raw):
    """뜻 텍스트 정규화: strip → 바깥쪽 큰따옴표 한 겹 제거 → 다시 strip.

    원본 admin_voca_book_map.voca_meanings JSON에 `"매출"`처럼 값 전체가 따옴표로
    감싸인 항목이 섞여 있던 사례(2026-09 로컬 이관에서 13건 발견) 대응.
    """
    txt = strip_or_empty(raw)
    if len(txt) >= 2 and txt[0] == '"' and txt[-1] == '"':
        txt = txt[1:-1].strip()
    return txt


# UI 에러 메시지가 실수로 admin_voca_book_map.voca_meanings에 "뜻"으로 저장된 사례.
# 2026-09 로컬 이관에서 voca_id=762(word=revenue)에 2건 발견 — 뜻 목록에서 완전히 건너뛴다.
_CORRUPTED_MEANING_TEXTS = {
    '사전이 변경이 되어',
    '단어장에서 해당 단어를 학습하실 수 없습니다. 양해해 주시기 바랍니다.',
}


def main():
    parser = argparse.ArgumentParser(
        description='admin_voca_book_map JSON → 참조 테이블(meaning_id/example_id) 이관'
    )
    parser.add_argument('--apply', action='store_true', help='실제로 DB에 커밋(기본은 dry-run)')
    parser.add_argument('--book-id', type=int, default=None, help='특정 admin_voca_book만 처리')
    parser.add_argument('--limit', type=int, default=None, help='앞에서부터 N개 map 행만 처리')
    parser.add_argument('--sample', type=int, default=10, help='텍스트 차이 표본 출력 개수')
    args = parser.parse_args()

    from app import create_app, db
    from app.models.models import (
        AdminVocaBookMap, AdminVocaBookMapMeaning, AdminVocaBookMapExample,
        Voca, VocaLabel, VocaMeaning, VocaMeaningMap, VocaExample, VocaExampleMap,
    )
    from app.services.sentence_puzzle import normalize_sentence_text

    app = create_app()
    with app.app_context():
        q = AdminVocaBookMap.query
        if args.book_id:
            q = q.filter_by(book_id=args.book_id)
        q = q.order_by(AdminVocaBookMap.id.asc())
        if args.limit:
            q = q.limit(args.limit)
        rows = q.all()

        already = {mid for (mid,) in db.session.query(AdminVocaBookMapMeaning.map_id).distinct()}
        already |= {mid for (mid,) in db.session.query(AdminVocaBookMapExample.map_id).distinct()}

        stats = {
            'rows_total': len(rows),
            'rows_processed': 0,
            'rows_skipped_existing': 0,
            'meanings_matched': 0,
            'meanings_created': 0,
            'meanings_created_with_pos': 0,
            'meanings_dup_skipped': 0,
            'meanings_corrupted_skipped': 0,
            'examples_matched': 0,
            'examples_matched_ambiguous_resolved': 0,  # 정규화 문장 동일한 후보가 여러 개라 강조 텍스트로 골라낸 건수
            'examples_text_diff': 0,
            'examples_created': 0,
            'examples_dup_skipped': 0,
        }
        text_diff_samples = []

        meaning_cache = {}   # voca_id -> list[[meaning_id, text]]  (mutable list so appends are visible)
        example_cache = {}   # voca_id -> list[[example_id, exam_en, norm]]
        label_cache = {}     # voca_id -> pos or None
        voca_word_cache = {}  # voca_id -> (word, verb_forms)
        dry_id_seq = 0       # dry-run 전용 음수 placeholder id 생성기(생성 뜻/예문마다 유일)

        def next_dry_id():
            nonlocal dry_id_seq
            dry_id_seq -= 1
            return dry_id_seq

        for m in rows:
            if m.id in already:
                stats['rows_skipped_existing'] += 1
                continue
            stats['rows_processed'] += 1
            voca_id = m.voca_id
            if voca_id is None:
                continue

            # ── 뜻 ──
            try:
                meanings = json.loads(m.voca_meanings) if m.voca_meanings else []
            except Exception:
                meanings = []
            if not isinstance(meanings, list):
                meanings = []

            if voca_id not in meaning_cache:
                cand = (
                    db.session.query(VocaMeaningMap.meaning_id, VocaMeaning.meaning)
                    .join(VocaMeaning, VocaMeaning.id == VocaMeaningMap.meaning_id)
                    .filter(VocaMeaningMap.voca_id == voca_id)
                    .all()
                )
                meaning_cache[voca_id] = [[mid, text] for mid, text in cand]

            used_meaning_ids = set()
            meaning_links = []
            ordv = 0
            for raw in meanings:
                txt = normalize_meaning_text(raw)
                if not txt:
                    continue
                if txt in _CORRUPTED_MEANING_TEXTS:
                    stats['meanings_corrupted_skipped'] += 1
                    continue
                match_id = None
                for mid, mtext in meaning_cache[voca_id]:
                    if mid not in used_meaning_ids and strip_or_empty(mtext) == txt:
                        match_id = mid
                        break

                if match_id is None:
                    if voca_id not in label_cache:
                        lbl = VocaLabel.query.get(voca_id)
                        label_cache[voca_id] = lbl.pos if lbl else None
                    pos_val = label_cache[voca_id]
                    if args.apply:
                        vm = VocaMeaning(meaning=txt, pos=pos_val)
                        db.session.add(vm)
                        db.session.flush()
                        match_id = vm.id
                        db.session.add(VocaMeaningMap(voca_id=voca_id, meaning_id=match_id))
                        meaning_cache[voca_id].append([match_id, txt])
                    else:
                        match_id = next_dry_id()
                    stats['meanings_created'] += 1
                    if pos_val:
                        stats['meanings_created_with_pos'] += 1
                else:
                    stats['meanings_matched'] += 1

                if match_id in used_meaning_ids:
                    stats['meanings_dup_skipped'] += 1
                    continue
                used_meaning_ids.add(match_id)
                meaning_links.append((match_id, ordv))
                ordv += 1

            if args.apply:
                for mid, ov in meaning_links:
                    db.session.add(AdminVocaBookMapMeaning(map_id=m.id, meaning_id=mid, ord=ov))

            # ── 예문 ──
            try:
                examples = json.loads(m.voca_examples) if m.voca_examples else []
            except Exception:
                examples = []
            if not isinstance(examples, list):
                examples = []

            if voca_id not in example_cache:
                cand = (
                    db.session.query(VocaExampleMap.example_id, VocaExample.exam_en)
                    .join(VocaExample, VocaExample.id == VocaExampleMap.example_id)
                    .filter(VocaExampleMap.voca_id == voca_id)
                    .all()
                )
                example_cache[voca_id] = [
                    [eid, en, normalize_sentence_text(en)] for eid, en in cand
                ]

            used_example_ids = set()
            example_links = []
            ordv = 0
            for ex in examples:
                if not isinstance(ex, dict):
                    continue
                origin = strip_or_empty(ex.get('origin', ex.get('en')))
                meaning_txt = strip_or_empty(ex.get('meaning', ex.get('ko')))
                if not origin and not meaning_txt:
                    continue
                norm = normalize_sentence_text(origin)

                match_id = None
                match_dict_origin = None
                candidates = [
                    (eid, en, enorm) for eid, en, enorm in example_cache[voca_id]
                    if eid not in used_example_ids and enorm == norm
                ]
                if candidates:
                    if voca_id not in voca_word_cache:
                        v = Voca.query.get(voca_id)
                        voca_word_cache[voca_id] = (v.word, v.verb_forms) if v else (None, None)
                    voca_word, voca_verb_forms = voca_word_cache[voca_id]
                    picked = _pick_best_example_match(candidates, voca_word, voca_verb_forms)
                    match_id, match_dict_origin, _ = picked
                    if len(candidates) > 1 and match_id != candidates[0][0]:
                        stats['examples_matched_ambiguous_resolved'] += 1

                if match_id is None:
                    if args.apply:
                        ve = VocaExample(exam_en=origin or None, exam_ko=meaning_txt or None)
                        db.session.add(ve)
                        db.session.flush()
                        match_id = ve.id
                        db.session.add(VocaExampleMap(voca_id=voca_id, example_id=match_id))
                        example_cache[voca_id].append([match_id, origin, norm])
                    else:
                        match_id = next_dry_id()
                    stats['examples_created'] += 1
                else:
                    stats['examples_matched'] += 1
                    if (match_dict_origin or '').strip() != origin:
                        stats['examples_text_diff'] += 1
                        if len(text_diff_samples) < args.sample:
                            text_diff_samples.append({
                                'map_id': m.id, 'voca_id': voca_id,
                                'admin_origin': origin, 'dict_origin': match_dict_origin,
                            })

                if match_id in used_example_ids:
                    stats['examples_dup_skipped'] += 1
                    continue
                used_example_ids.add(match_id)
                example_links.append((match_id, ordv))
                ordv += 1

            if args.apply:
                for eid, ov in example_links:
                    db.session.add(AdminVocaBookMapExample(map_id=m.id, example_id=eid, ord=ov))
                if stats['rows_processed'] % 500 == 0:
                    db.session.flush()

        print(json.dumps(stats, indent=2, ensure_ascii=False))
        if text_diff_samples:
            print('\n예문 텍스트 차이 표본:')
            for s in text_diff_samples:
                print(json.dumps(s, ensure_ascii=False))

        if args.apply:
            db.session.commit()
            print('\n커밋 완료.')
        else:
            db.session.rollback()
            print('\n[dry-run] DB 변경 없이 롤백했습니다.')


if __name__ == '__main__':
    main()
