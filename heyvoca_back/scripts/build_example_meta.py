"""
voca_example_meta(사전, dict schema) 채우기 — 기존 영어 예문 대상.

정본: heyvoca_service/docs/FRESH_SENTENCE_CONTRACT.md §1

voca_example(영어, `<strong class="target-word">` 태그가 있는 것)마다:
  - level      : word_count<=8 and rare_count==0 → 1 / word_count<=13 and rare_count<=1 → 2 / 그 외 → 3
  - word_count : 태그 제거 평문의 공백 기준 단어 수(app.services.sentence_puzzle.normalize_sentence_text
                 로 정규화한 뒤 split — sentence_hash와 같은 단일 소스를 재사용)
  - rare_count : 목표 단어 구간·기능어(spaCy is_stop)를 뺀 내용어 중 zipf<3.5 또는
                 voca_label에 없는(미상) 단어 수
  - words      : 위 내용어의 원형(소문자) distinct 리스트. 단, zipf>=5.5(아주 흔한 단어)는
                 "아는 단어" 판정에 의미가 없어 애초에 넣지 않는다(계약 §2 주석과 동일 규칙).
  - source     : 'dict'

원형화는 app/utils/example_tagging.py의 spaCy 로더(_get_spacy, /search/word-info 원형
폴백과 동일 인스턴스)를 그대로 재사용한다. 빈도는 voca_label.freq_zipf — 단어(소문자) →
Voca 매칭 후 LOWER(word) 별 MAX(freq_zipf)로 한 번에 배치 조회한다(N+1 방지).

멱등 upsert — 이미 voca_example_meta 행이 있는 example_id는 기본적으로 건너뛴다
(--force로 재계산·덮어쓰기). 기본은 dry-run.

사용법 (컨테이너 내부에서):
  docker exec -it heyvoca_back_local python3 scripts/build_example_meta.py                 # dry-run
  docker exec -it heyvoca_back_local python3 scripts/build_example_meta.py --apply          # 실제 반영
  docker exec -it heyvoca_back_local python3 scripts/build_example_meta.py --apply --force  # 기존 행도 재계산
  docker exec -it heyvoca_back_local python3 scripts/build_example_meta.py --limit 200       # 표본만(검증용)
"""

import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db
from app.models.models import Voca, VocaExample, VocaExampleMeta, VocaLabel
from app.services.sentence_puzzle import normalize_sentence_text
from app.utils.example_tagging import _get_spacy, TARGET_WORD_RE

SOURCE = 'dict'

# zipf>=이 값이면 "아주 흔한 단어"로 보고 words(아는 단어 판정용)에는 넣지 않는다.
# 계약 §2 주석: "기능어·아주 흔한 단어(zipf ≥ 5.5)는 meta.words 에 애초에 안 들어가므로
# 따로 처리할 필요 없음."
VERY_COMMON_ZIPF = 5.5
# rare_count/words 판정용 — 이 미만(또는 미상)이면 "빈도 낮은 단어".
RARE_ZIPF_THRESHOLD = 3.5

_TAG_RE = re.compile(r'<[^>]+>')
_TARGET_INNER_RE = re.compile(
    r'<strong[^>]*class="target-word"[^>]*>(.*?)</strong\s*>', re.IGNORECASE | re.DOTALL
)


def _plain_and_target_span(exam_en: str):
    """(태그 제거 평문, target 시작 idx, target 끝 idx) — target 태그 없으면 (None, None, None)."""
    m = _TARGET_INNER_RE.search(exam_en or '')
    if not m:
        return None, None, None
    target_text = _TAG_RE.sub('', m.group(1))
    plain = _TAG_RE.sub('', exam_en or '')
    idx = plain.find(target_text) if target_text else -1
    if idx < 0:
        return plain, None, None
    return plain, idx, idx + len(target_text)


def _classify_level(word_count: int, rare_count: int) -> int:
    if word_count <= 8 and rare_count == 0:
        return 1
    if word_count <= 13 and rare_count <= 1:
        return 2
    return 3


def _load_zipf_lookup() -> dict:
    """LOWER(voca.word) → MAX(freq_zipf) 배치 조회 (표기 차이 있는 여러 voca 행 중 가장
    흔한 쪽 값을 채택 — 없는 것보다는 관대한 쪽이 오탐(rare로 잘못 분류)을 줄인다)."""
    from sqlalchemy import func
    rows = (
        db.session.query(func.lower(Voca.word), func.max(VocaLabel.freq_zipf))
        .join(VocaLabel, VocaLabel.voca_id == Voca.id)
        .group_by(func.lower(Voca.word))
        .all()
    )
    return {w: z for w, z in rows if z is not None}


def compute_meta_for_example(exam_en: str, nlp, zipf_lookup: dict):
    """exam_en(태그 포함 원문) → (level, word_count, rare_count, words) 또는 자격 미달 시 None.

    nlp: spaCy 인스턴스(None이면 spaCy 없이 폴백 — content word 판정 없이 word_count/level만
    거칠게 계산, rare_count=0, words=[]. 로컬 개발 편의를 위한 폴백이며 실제 반영 전엔
    spaCy가 설치돼 있어야 정확하다).
    """
    if not TARGET_WORD_RE.search(exam_en or ''):
        return None

    plain, t_start, t_end = _plain_and_target_span(exam_en)
    if not plain:
        return None

    normalized = normalize_sentence_text(exam_en)
    word_count = len(normalized.split()) if normalized else 0

    words: list = []
    rare_count = 0
    if nlp is not None:
        doc = nlp(plain)
        for token in doc:
            if t_start is not None and t_start <= token.idx < t_end:
                continue  # 목표 단어 구간 제외
            if not token.is_alpha or token.is_stop:
                continue  # 기능어/숫자·기호 제외
            lemma = token.lemma_.lower()
            zipf = zipf_lookup.get(lemma)
            is_rare = zipf is None or zipf < RARE_ZIPF_THRESHOLD
            if is_rare:
                rare_count += 1
            if zipf is not None and zipf >= VERY_COMMON_ZIPF:
                continue  # 아주 흔한 단어는 "아는 단어" 판정에 의미 없어 words에서 제외
            if lemma not in words:
                words.append(lemma)

    level = _classify_level(word_count, rare_count)
    return level, word_count, rare_count, words


def main():
    parser = argparse.ArgumentParser(description='voca_example_meta 채우기(기존 영어 예문, dry-run 기본)')
    parser.add_argument('--apply', action='store_true', help='실제로 DB에 반영(기본은 dry-run)')
    parser.add_argument('--force', action='store_true', help='이미 meta가 있는 example_id도 재계산·덮어쓰기')
    parser.add_argument('--batch-size', type=int, default=500, help='commit 배치 크기(기본 500)')
    parser.add_argument('--limit', type=int, default=None, help='처리 건수 상한(검증용 표본)')
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        nlp = _get_spacy()
        if nlp is None:
            print('[경고] spaCy(en_core_web_sm)를 불러오지 못했습니다 — rare_count/words가 전부 비어 채워집니다. '
                  '반영 전 spaCy 설치를 확인하세요.')

        zipf_lookup = _load_zipf_lookup()
        print(f'zipf 조회 단어 수: {len(zipf_lookup)}')

        existing_ids = {row[0] for row in db.session.query(VocaExampleMeta.example_id).all()}
        print(f'기존 voca_example_meta 행 수: {len(existing_ids)}')

        query = db.session.query(VocaExample.id, VocaExample.exam_en)
        if not args.force:
            query = query.filter(~VocaExample.id.in_(existing_ids)) if existing_ids else query
        if args.limit:
            query = query.limit(args.limit)

        rows_to_process = query.all()
        print(f'처리 대상 voca_example 행 수: {len(rows_to_process)}')

        level_counts = {1: 0, 2: 0, 3: 0}
        no_tag = 0
        upserts = []
        for example_id, exam_en in rows_to_process:
            result = compute_meta_for_example(exam_en, nlp, zipf_lookup)
            if result is None:
                no_tag += 1
                continue
            level, word_count, rare_count, words = result
            level_counts[level] += 1
            upserts.append({
                'example_id': example_id,
                'level':      level,
                'word_count': word_count,
                'rare_count': rare_count,
                'words':      words,
                'source':     SOURCE,
            })

        print(f'target 태그 없어 건너뜀: {no_tag}건')
        print(f'level 분포: {level_counts}')
        print(f'upsert 대상: {len(upserts)}건')
        if upserts[:3]:
            print('샘플 3건:')
            for u in upserts[:3]:
                print(' ', u)

        if not args.apply:
            print('[dry-run] DB 변경 없이 종료합니다. 실제 반영하려면 --apply를 붙이세요.')
            return

        inserted = 0
        updated = 0
        try:
            for i in range(0, len(upserts), args.batch_size):
                chunk = upserts[i:i + args.batch_size]
                chunk_ids = [u['example_id'] for u in chunk]
                already = {
                    row[0] for row in db.session.query(VocaExampleMeta.example_id)
                    .filter(VocaExampleMeta.example_id.in_(chunk_ids)).all()
                }
                for u in chunk:
                    if u['example_id'] in already:
                        db.session.query(VocaExampleMeta).filter(
                            VocaExampleMeta.example_id == u['example_id']
                        ).update({
                            'level':      u['level'],
                            'word_count': u['word_count'],
                            'rare_count': u['rare_count'],
                            'words':      u['words'],
                            'source':     u['source'],
                        })
                        updated += 1
                    else:
                        db.session.add(VocaExampleMeta(**u))
                        inserted += 1
                db.session.commit()
                print(f'  {min(i + args.batch_size, len(upserts))}/{len(upserts)} 처리 완료')
        except Exception:
            db.session.rollback()
            raise

        print(f'완료 — 삽입 {inserted}건, 갱신 {updated}건')


if __name__ == '__main__':
    main()
