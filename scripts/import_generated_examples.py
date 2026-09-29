"""
db/sentence-gen/out/*.json(생성된 새 예문) → voca_example + voca_example_map +
voca_example_meta(사전, dict schema) 삽입.

정본: heyvoca_service/docs/FRESH_SENTENCE_CONTRACT.md §6

입력 형식 두 가지를 자동 인식해서 지원한다:

1) 신형(bNNN.json — b000.json/b200.json 제외) — `[[ ]]` 마킹, HTML 태그 없음:
     [{"id": <voca_id>, "ex": [[en, ko], ... 6개]}]
   ex의 순서 = 초급,초급,중급,중급,상급,상급 → level 1,1,2,2,3,3(위치 기준 고정).
   `[[ ]]`를 `<strong class="target-word">...</strong>`로 변환한다. 변환 시 닫는 괄호
   바로 뒤에 공백 없이 붙은 영문자는 태그 안으로 포함해 활용형을 통째로 감싼다
   (`[[model]]s` → `<strong class="target-word">models</strong>`) — 다만 아포스트로피로
   시작하는 소유격('s)은 태그 밖에 남긴다(아포스트로피는 영문자가 아니라 병합 루프가
   거기서 자연히 멈춘다: `[[frog]]'s` → `<strong class="target-word">frog</strong>'s`).
   여는 괄호 바로 앞에 붙은 영문자도 같은 방식으로 병합한다(현재 생성분에는 없지만
   방어적으로 처리). 한국어(meaning) 쪽도 같은 함수로 처리하지만 한글은 병합 대상
   문자셋(ASCII 영문자)이 아니라 실질적으로 병합되지 않는다 — 조사가 태그 밖에
   남는 기존 관례(예: `<strong ...>탑승권</strong>을`)와 자연히 일치한다.

2) 구형(b000.json, b200.json) — 이미 태그가 적용된 형식:
     [{"voca_id": int, "word": str,
       "examples": [{"lv": "easy|mid|hard", "origin": ..., "meaning": ...}, ... 6개]}]
   lv → level: easy=1, mid=2, hard=3. `[[ ]]` 변환은 하지 않는다(이미 `<strong>`).

검증(두 형식 공통, 반드시 재검증 — 생성 쪽 validate.py를 신뢰하지 않는다):
  - 태그 개수: origin/meaning 각각 `<strong class="target-word">` 정확히 1개, 그 외
    다른 HTML 태그가 섞이면 거부. — 엄격, 완화 없음.
  - 한글 여부: meaning에 한글이 최소 1자. — 엄격, 완화 없음.
  - 단어 수: level별 기준(1: 3~9 / 2: 7~14 / 3: 11~22, PROMPT.md와 동일)에 **±2 허용**
    (생성 쪽은 이 기준을 엄격히 쓰지만 일부는 재검증 없이 남을 수 있어 import에서는
    완화해 받아들인다 — 태그 개수/한글 여부와 달리 이것만 완화).
  - 기존 예문과 중복 제외: sentence_hash(app.services.sentence_puzzle) 기준, 사전 전체
    voca_example과 이번 배치 내에서 이미 채택한 문장 모두와 비교.
  - voca_id가 사전 Voca에 존재해야 함(없으면 사전이 그 사이 바뀐 것 — 건너뜀).

동작: 기본 dry-run(집계·샘플만 출력). --apply로 실제 삽입 — 한 예문당
voca_example → voca_example_map → voca_example_meta 3행을 만든다(배치 커밋).

사용법 (컨테이너 내부, heyvoca_back 백엔드 컨테이너 — /app/scripts가 이 top-level
scripts/ 디렉터리로 마운트된다):
  docker exec -it heyvoca_back_local python3 scripts/import_generated_examples.py db/sentence-gen/out/b001.json
  docker exec -it heyvoca_back_local python3 scripts/import_generated_examples.py db/sentence-gen/out/b000.json db/sentence-gen/out/b200.json
  docker exec -it heyvoca_back_local python3 scripts/import_generated_examples.py db/sentence-gen/out/*.json --apply

주의: db/sentence-gen/ 은 현재 docker-compose 볼륨에 마운트돼 있지 않다 — 컨테이너
안에서 실행하려면 먼저 `docker cp`로 넣거나 compose에 마운트를 추가해야 한다.

heyvoca_back/scripts/build_example_meta.py 와 내용어/희귀도 계산 로직(스캐닝·zipf 조회)이
겹친다 — 두 스크립트는 서로 다른 볼륨 마운트 경로에 있어(전자는 heyvoca_back/scripts,
이 파일은 top-level scripts) 컨테이너 안에서 서로 import할 수 없다(heyvoca_back/scripts는
docker-compose의 `./scripts:/app/scripts` 마운트에 가려져 /app/scripts에서 안 보인다 —
로컬에서 실측 확인함). 그래서 이 파일은 필요한 헬퍼를 독립적으로 갖고 있다 — 계산 규칙을
바꿀 때는 두 파일을 함께 고칠 것.
"""

import argparse
import glob
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'heyvoca_back'))

from app import create_app, db  # noqa: E402
from app.models.models import Voca, VocaExample, VocaExampleMap, VocaExampleMeta, VocaLabel  # noqa: E402
from app.services.sentence_puzzle import sentence_hash, normalize_sentence_text  # noqa: E402
from app.utils.example_tagging import _get_spacy, TARGET_WORD_RE  # noqa: E402

DEFAULT_SOURCE = 'gen20260930'

LV_MAP = {'easy': 1, 'mid': 2, 'hard': 3}
# 신형 ex 배열 위치(0-based) → level. 순서 = 초급,초급,중급,중급,상급,상급(PROMPT.md).
POS_LEVEL = [1, 1, 2, 2, 3, 3]

# PROMPT.md 기준 범위 + import 완화(±2). 태그 개수/한글 여부는 이 완화 대상이 아니다.
_BASE_WORD_RANGE = {1: (3, 9), 2: (7, 14), 3: (11, 22)}
_WORD_RANGE_TOLERANCE = 2

VERY_COMMON_ZIPF = 5.5
RARE_ZIPF_THRESHOLD = 3.5

_BRACKET_RE = re.compile(r'\[\[(.+?)\]\]')
_TAG_RE = re.compile(r'<[^>]+>')
_TARGET_INNER_RE = re.compile(
    r'<strong[^>]*class="target-word"[^>]*>(.*?)</strong\s*>', re.IGNORECASE | re.DOTALL
)
_HANGUL_RE = re.compile(r'[가-힣]')


# ──────────────────────────────────────────────
# [[ ]] → <strong class="target-word">…</strong> 변환
# ──────────────────────────────────────────────

def convert_target_brackets(text: str):
    """text 안의 `[[ ]]`를 강조 태그로 바꾼다. 정확히 1개가 아니면 None(=거부 사유).

    닫는 괄호 직후/여는 괄호 직전에 공백 없이 붙은 ASCII 영문자는 태그 안으로 병합한다
    (활용형 어미를 정답으로 인정하기 위함). 아포스트로피는 병합 대상 문자가 아니라
    소유격('s)은 자연히 태그 밖에 남는다. 비-ASCII 문자(한글 등)는 병합되지 않는다 —
    한국어 조사가 태그 밖에 남는 기존 관례와 일치.
    """
    if text is None:
        return None
    matches = list(_BRACKET_RE.finditer(text))
    if len(matches) != 1:
        return None
    m = matches[0]
    start, end = m.start(), m.end()
    inner = m.group(1)
    if not inner:
        return None

    def _is_mergeable(ch: str) -> bool:
        return ch.isascii() and ch.isalpha()

    prefix_start = start
    while prefix_start > 0 and _is_mergeable(text[prefix_start - 1]):
        prefix_start -= 1
    prefix_merge = text[prefix_start:start]

    suffix_end = end
    while suffix_end < len(text) and _is_mergeable(text[suffix_end]):
        suffix_end += 1
    suffix_merge = text[end:suffix_end]

    merged_inner = prefix_merge + inner + suffix_merge
    return (
        text[:prefix_start]
        + f'<strong class="target-word">{merged_inner}</strong>'
        + text[suffix_end:]
    )


# ──────────────────────────────────────────────
# 검증
# ──────────────────────────────────────────────

def _tag_ok(text: str) -> bool:
    """<strong class="target-word"> 정확히 1개 + 그 외 다른 HTML 태그 없음."""
    if not text:
        return False
    opens = TARGET_WORD_RE.findall(text)
    closes = re.findall(r'</strong\s*>', text, re.IGNORECASE)
    if len(opens) != 1 or len(closes) != 1:
        return False
    stripped = TARGET_WORD_RE.sub('', text, count=1)
    stripped = re.sub(r'</strong\s*>', '', stripped, count=1, flags=re.IGNORECASE)
    return '<' not in stripped and '>' not in stripped


def _word_count_ok(exam_en: str, level: int) -> tuple:
    """(word_count, ok) — level 기준(±2 완화)과 비교."""
    plain = normalize_sentence_text(exam_en)
    word_count = len(plain.split()) if plain else 0
    lo, hi = _BASE_WORD_RANGE[level]
    lo -= _WORD_RANGE_TOLERANCE
    hi += _WORD_RANGE_TOLERANCE
    return word_count, (lo <= word_count <= hi)


# ──────────────────────────────────────────────
# 내용어/희귀도(rare_count, words) — build_example_meta.py와 같은 규칙(중복 설명은 모듈
# docstring 참고).
# ──────────────────────────────────────────────

def _plain_and_target_span(exam_en: str):
    m = _TARGET_INNER_RE.search(exam_en or '')
    if not m:
        return None, None, None
    target_text = _TAG_RE.sub('', m.group(1))
    plain = _TAG_RE.sub('', exam_en or '')
    idx = plain.find(target_text) if target_text else -1
    if idx < 0:
        return plain, None, None
    return plain, idx, idx + len(target_text)


def _load_zipf_lookup() -> dict:
    from sqlalchemy import func
    rows = (
        db.session.query(func.lower(Voca.word), func.max(VocaLabel.freq_zipf))
        .join(VocaLabel, VocaLabel.voca_id == Voca.id)
        .group_by(func.lower(Voca.word))
        .all()
    )
    return {w: z for w, z in rows if z is not None}


def _content_word_stats(exam_en: str, nlp, zipf_lookup: dict) -> tuple:
    """(rare_count, words) — 목표 단어 구간·기능어 제외, words는 zipf>=5.5도 제외."""
    if nlp is None:
        return 0, []
    plain, t_start, t_end = _plain_and_target_span(exam_en)
    if not plain:
        return 0, []
    doc = nlp(plain)
    words: list = []
    rare_count = 0
    for token in doc:
        if t_start is not None and t_start <= token.idx < t_end:
            continue
        if not token.is_alpha or token.is_stop:
            continue
        lemma = token.lemma_.lower()
        zipf = zipf_lookup.get(lemma)
        is_rare = zipf is None or zipf < RARE_ZIPF_THRESHOLD
        if is_rare:
            rare_count += 1
        if zipf is not None and zipf >= VERY_COMMON_ZIPF:
            continue
        if lemma not in words:
            words.append(lemma)
    return rare_count, words


# ──────────────────────────────────────────────
# 입력 파일 파싱 → (voca_id, level, exam_en, exam_ko) 후보 리스트
# ──────────────────────────────────────────────

def _detect_format(data: list) -> str:
    if not data:
        return 'empty'
    first = data[0]
    if isinstance(first, dict) and 'ex' in first:
        return 'new'
    if isinstance(first, dict) and 'examples' in first:
        return 'old'
    return 'unknown'


def parse_file(path: str):
    """path → (candidates, parse_errors).

    candidates: [{'voca_id', 'level', 'exam_en', 'exam_ko', 'word'(optional)}]
    parse_errors: 형식 자체가 이상해 후보로도 못 만든 것들의 사유 문자열 리스트.
    """
    try:
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        # 생성이 아직 진행 중이면 파일이 쓰는 도중일 수 있다(실측: 이 스크립트 개발 중에도
        # 실제로 b098.json이 중간에 잘려 있었다) — 전체 실행을 죽이지 않고 이 파일만 건너뛴다.
        return [], [f'{path}: JSON 파싱 실패({e}) — 생성이 아직 끝나지 않았을 수 있음, 건너뜀']
    if not isinstance(data, list):
        return [], [f'{path}: 최상위가 list가 아님']

    fmt = _detect_format(data)
    candidates = []
    errors = []

    if fmt in ('empty', 'unknown'):
        if fmt == 'unknown':
            errors.append(f'{path}: 인식할 수 없는 형식(첫 항목에 ex/examples 없음)')
        return candidates, errors

    if fmt == 'new':
        for item in data:
            voca_id = item.get('id')
            ex_list = item.get('ex') or []
            if voca_id is None:
                errors.append(f'{path}: id 없는 항목 건너뜀')
                continue
            for idx, pair in enumerate(ex_list):
                level = POS_LEVEL[idx] if idx < len(POS_LEVEL) else None
                if level is None:
                    errors.append(f'{path} id={voca_id}: ex[{idx}] 위치가 6개 범위를 넘음 — 건너뜀')
                    continue
                if not (isinstance(pair, list) and len(pair) == 2):
                    errors.append(f'{path} id={voca_id}[{idx}]: [en,ko] 형식 아님')
                    continue
                en_raw, ko_raw = pair
                exam_en = convert_target_brackets(en_raw)
                exam_ko = convert_target_brackets(ko_raw)
                if exam_en is None:
                    errors.append(f'{path} id={voca_id}[{idx}]: 영어 [[ ]] 정확히 1개 아님')
                    continue
                if exam_ko is None:
                    errors.append(f'{path} id={voca_id}[{idx}]: 한국어 [[ ]] 정확히 1개 아님')
                    continue
                candidates.append({
                    'voca_id': voca_id, 'level': level,
                    'exam_en': exam_en, 'exam_ko': exam_ko,
                })
    else:  # 'old'
        for item in data:
            voca_id = item.get('voca_id')
            if voca_id is None:
                errors.append(f'{path}: voca_id 없는 항목 건너뜀')
                continue
            for idx, ex in enumerate(item.get('examples') or []):
                level = LV_MAP.get(ex.get('lv'))
                if level is None:
                    errors.append(f'{path} voca_id={voca_id}[{idx}]: 알 수 없는 lv={ex.get("lv")!r}')
                    continue
                candidates.append({
                    'voca_id': voca_id, 'level': level,
                    'exam_en': ex.get('origin'), 'exam_ko': ex.get('meaning'),
                })

    return candidates, errors


# ──────────────────────────────────────────────
# 메인
# ──────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='생성된 예문(db/sentence-gen/out) → voca_example 삽입(dry-run 기본)')
    parser.add_argument('json_paths', nargs='+', help='입력 JSON 경로(들). 셸 글롭도 가능')
    parser.add_argument('--apply', action='store_true', help='실제로 DB에 반영(기본은 dry-run)')
    parser.add_argument('--source', default=DEFAULT_SOURCE, help=f'voca_example_meta.source 값(기본 {DEFAULT_SOURCE})')
    parser.add_argument('--batch-size', type=int, default=200, help='commit 배치 크기(기본 200)')
    parser.add_argument('--limit', type=int, default=None, help='실제 삽입 대상 건수 상한(검증용)')
    args = parser.parse_args()

    # argparse에 셸이 글롭을 못 풀어준 경우(따옴표로 감싼 패턴)를 대비해 직접 한 번 더 확장.
    paths = []
    for p in args.json_paths:
        expanded = sorted(glob.glob(p))
        paths.extend(expanded if expanded else [p])

    app = create_app()
    with app.app_context():
        nlp = _get_spacy()
        if nlp is None:
            print('[경고] spaCy(en_core_web_sm)를 불러오지 못했습니다 — rare_count/words가 전부 비어 채워집니다.')

        zipf_lookup = _load_zipf_lookup()

        valid_voca_ids = {row[0] for row in db.session.query(Voca.id).all()}
        print(f'사전 Voca 존재 건수: {len(valid_voca_ids)}')

        existing_hashes = set()
        for (exam_en,) in db.session.query(VocaExample.exam_en).filter(VocaExample.exam_en.isnot(None)).all():
            if TARGET_WORD_RE.search(exam_en):
                existing_hashes.add(sentence_hash(exam_en))
        print(f'기존 voca_example(target 태그 있음) hash 수: {len(existing_hashes)}')

        all_candidates = []
        parse_error_total = 0
        for path in paths:
            cands, errs = parse_file(path)
            print(f'{path}: 후보 {len(cands)}건, 파싱 오류 {len(errs)}건')
            for e in errs[:10]:
                print(f'    - {e}')
            if len(errs) > 10:
                print(f'    ... 외 {len(errs) - 10}건')
            parse_error_total += len(errs)
            all_candidates.extend(cands)

        print(f'\n총 후보: {len(all_candidates)}건 (파싱 오류 {parse_error_total}건 제외)')

        accepted = []
        rejected_reasons = {}
        seen_hashes_this_run = set()

        def _reject(reason):
            rejected_reasons[reason] = rejected_reasons.get(reason, 0) + 1

        for c in all_candidates:
            voca_id, level, exam_en, exam_ko = c['voca_id'], c['level'], c['exam_en'], c['exam_ko']

            if voca_id not in valid_voca_ids:
                _reject('voca_id가 사전에 없음')
                continue
            if not _tag_ok(exam_en):
                _reject('영어 태그 개수/형식 오류')
                continue
            if not _tag_ok(exam_ko):
                _reject('한국어 태그 개수/형식 오류')
                continue
            if not _HANGUL_RE.search(exam_ko):
                _reject('한국어에 한글 없음')
                continue
            word_count, wc_ok = _word_count_ok(exam_en, level)
            if not wc_ok:
                _reject(f'단어 수 범위 밖(level={level}, word_count={word_count})')
                continue

            h = sentence_hash(exam_en)
            if h in existing_hashes:
                _reject('기존 예문과 중복(sentence_hash)')
                continue
            if h in seen_hashes_this_run:
                _reject('이번 배치 내 중복(sentence_hash)')
                continue
            seen_hashes_this_run.add(h)

            rare_count, words = _content_word_stats(exam_en, nlp, zipf_lookup)
            accepted.append({
                'voca_id':    voca_id,
                'level':      level,
                'exam_en':    exam_en,
                'exam_ko':    exam_ko,
                'word_count': word_count,
                'rare_count': rare_count,
                'words':      words,
                'hash':       h,
            })

        print(f'\n채택: {len(accepted)}건')
        print('거부 사유별 건수:')
        for reason, cnt in sorted(rejected_reasons.items(), key=lambda x: -x[1]):
            print(f'  - {reason}: {cnt}건')
        if accepted[:3]:
            print('샘플 3건:')
            for a in accepted[:3]:
                print(' ', {k: v for k, v in a.items() if k != 'hash'})

        if args.limit is not None:
            accepted = accepted[:args.limit]
            print(f'--limit 적용 → 실제 처리 {len(accepted)}건')

        if not args.apply:
            print('\n[dry-run] DB 변경 없이 종료합니다. 실제 반영하려면 --apply를 붙이세요.')
            return

        inserted = 0
        try:
            for i in range(0, len(accepted), args.batch_size):
                chunk = accepted[i:i + args.batch_size]
                for a in chunk:
                    example = VocaExample(exam_en=a['exam_en'], exam_ko=a['exam_ko'])
                    db.session.add(example)
                    db.session.flush()  # example.id 확보
                    db.session.add(VocaExampleMap(voca_id=a['voca_id'], example_id=example.id))
                    db.session.add(VocaExampleMeta(
                        example_id=example.id, level=a['level'],
                        word_count=a['word_count'], rare_count=a['rare_count'],
                        words=a['words'], source=args.source,
                    ))
                    inserted += 1
                db.session.commit()
                print(f'  {min(i + args.batch_size, len(accepted))}/{len(accepted)} 처리 완료')
        except Exception:
            db.session.rollback()
            raise

        print(f'완료 — 삽입 {inserted}건(voca_example/voca_example_map/voca_example_meta 각 {inserted}행)')


if __name__ == '__main__':
    main()
