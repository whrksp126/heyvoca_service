#!/usr/bin/env python3
"""TTS 음성 배치 사전생성(prewarm).

랜딩 데모(heyvoca_landing) "체험하기"는 비로그인 → /tts/resolve 생성 경로를 못 탄다.
데모에서 재생되는 텍스트를 미리 생성·캐싱해 두면 비로그인도 항상 cache-hit가 된다.

소스(택1):
  --from-demo-ts PATH   heyvoca_landing/src/data/demoWords.ts 파싱
                        → word(en) / meanings.join(", ")(ko) / example.en(en) / example.ko(ko)
  --voca-ids 1,2,3      사전 DB(heyvoca_dict)에서 해당 voca의 텍스트 수집
  --input PATH          JSON 배열 [{"text": "...", "lang": "en|ko"}, ...]

모드:
  --dry-run             생성하지 않고 글자수·예상 크레딧/비용만 출력(의존성 최소 — 호스트에서도 실행 가능)
  --out PATH            수집된 (text,lang) 목록을 JSON으로 저장(호스트에서 파싱 → 컨테이너에서 --input 생성)
  (기본)                service.ensure_cached로 실제 생성·업로드 (RW 키 + ElevenLabs 키 필요, 컨테이너 실행)

예시:
  # 1) 호스트에서 데모 글자수/비용 추정
  python3 scripts/tts_prewarm.py --from-demo-ts heyvoca_landing/src/data/demoWords.ts --dry-run

  # 2) 호스트에서 목록 추출 → 컨테이너로 복사 → 컨테이너에서 실제 생성
  python3 scripts/tts_prewarm.py --from-demo-ts heyvoca_landing/src/data/demoWords.ts --out /tmp/demo_tts.json
  docker cp /tmp/demo_tts.json heyvoca_back_local:/tmp/demo_tts.json
  docker exec heyvoca_back_local python3 /app/scripts/tts_prewarm.py --input /tmp/demo_tts.json
"""
import argparse
import json
import re
import sys
import unicodedata

# Flash v2.5 = 0.5 크레딧/자 (모델 바뀌면 같이 갱신)
CREDITS_PER_CHAR = 0.5
# 대략적 크레딧당 USD (Scale $330 / 2M crd ≈ 0.000165). 추정용.
USD_PER_CREDIT = 330.0 / 2_000_000


# ── 텍스트 정규화 (app/services/tts/normalize.py와 동일 규칙. 호스트 dry-run 의존성 회피용 복제) ──
_TAG_RE = re.compile(r'<[^>]+>')
_WS_RE = re.compile(r'\s+')


def normalize_text(text):
    t = _TAG_RE.sub(' ', text or '')
    t = unicodedata.normalize('NFC', t)
    return _WS_RE.sub(' ', t).strip()


# ── 소스 파서 ──────────────────────────────────────────────────────────
_DEMO_OBJ_RE = re.compile(
    r"word:\s*'((?:[^'\\]|\\.)*)'"
    r".*?meanings:\s*\[(.*?)\]"
    r".*?example:\s*\{\s*en:\s*'((?:[^'\\]|\\.)*)'\s*,\s*ko:\s*'((?:[^'\\]|\\.)*)'",
    re.DOTALL,
)
_QUOTED_RE = re.compile(r"'((?:[^'\\]|\\.)*)'")


def _unescape(s):
    return s.replace("\\'", "'").replace('\\"', '"').replace('\\\\', '\\')


def parse_demo_ts(path):
    """demoWords.ts → [(text, lang)] (word/meanings-join/example.en/example.ko)."""
    with open(path, encoding='utf-8') as f:
        src = f.read()
    items = []
    for word, meanings_inner, ex_en, ex_ko in _DEMO_OBJ_RE.findall(src):
        word = _unescape(word)
        meanings = [_unescape(m) for m in _QUOTED_RE.findall(meanings_inner)]
        ex_en = _unescape(ex_en)
        ex_ko = _unescape(ex_ko)
        items.append((word, 'en'))
        if meanings:
            items.append((', '.join(meanings), 'ko'))  # 프론트: meanings.join(", ")
        if ex_en:
            items.append((ex_en, 'en'))
        if ex_ko:
            items.append((ex_ko, 'ko'))
    return items


def load_input_json(path):
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    return [(d['text'], d.get('lang', 'en')) for d in data]


def collect_from_dict(voca_ids):
    """사전 DB에서 voca_id 목록의 word/meanings/examples 텍스트 수집. (컨테이너 실행)"""
    from app import db
    from app.models.models import (
        Voca, VocaMeaning, VocaMeaningMap, VocaExample, VocaExampleMap,
    )
    items = []
    for vid in voca_ids:
        voca = db.session.get(Voca, vid)
        if not voca:
            print(f"  [skip] voca {vid} 없음", file=sys.stderr)
            continue
        items.append((voca.word, 'en'))
        meanings = [m.meaning for m in (
            db.session.query(VocaMeaning)
            .join(VocaMeaningMap, VocaMeaningMap.meaning_id == VocaMeaning.id)
            .filter(VocaMeaningMap.voca_id == vid).all()
        )]
        if meanings:
            items.append((', '.join(meanings), 'ko'))
        examples = (
            db.session.query(VocaExample)
            .join(VocaExampleMap, VocaExampleMap.example_id == VocaExample.id)
            .filter(VocaExampleMap.voca_id == vid).all()
        )
        for ex in examples:
            if ex.exam_en:
                items.append((ex.exam_en, 'en'))
            if ex.exam_ko:
                items.append((ex.exam_ko, 'ko'))
    return items


# ── 메인 ──────────────────────────────────────────────────────────────
def dedupe(items):
    seen, out = set(), []
    for text, lang in items:
        norm = normalize_text(text)
        if not norm:
            continue
        key = (lang, norm)
        if key in seen:
            continue
        seen.add(key)
        out.append((text, lang, norm))
    return out


def main():
    ap = argparse.ArgumentParser(description='TTS 음성 배치 사전생성')
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument('--from-demo-ts', metavar='PATH', help='demoWords.ts 경로')
    src.add_argument('--voca-ids', metavar='IDS', help='쉼표구분 voca id 목록 (DB)')
    src.add_argument('--input', metavar='PATH', help='JSON [{text,lang}] 경로')
    ap.add_argument('--out', metavar='PATH', help='수집 목록을 JSON으로 저장 후 종료')
    ap.add_argument('--dry-run', action='store_true', help='생성 안 함, 글자수/비용만')
    args = ap.parse_args()

    if args.from_demo_ts:
        raw = parse_demo_ts(args.from_demo_ts)
    elif args.input:
        raw = load_input_json(args.input)
    else:
        voca_ids = [int(x) for x in args.voca_ids.split(',') if x.strip()]
        raw = collect_from_dict(voca_ids)

    items = dedupe(raw)
    total_chars = sum(len(norm) for _, _, norm in items)
    credits = total_chars * CREDITS_PER_CHAR
    print(f"대상 텍스트(중복제거): {len(items)}건, 총 {total_chars:,}자")
    print(f"예상 크레딧(Flash 0.5/자): {credits:,.0f}  (~${credits * USD_PER_CREDIT:,.2f})")

    if args.out:
        with open(args.out, 'w', encoding='utf-8') as f:
            json.dump([{'text': t, 'lang': l} for t, l, _ in items], f, ensure_ascii=False, indent=2)
        print(f"목록 저장: {args.out}")
        return 0

    if args.dry_run:
        for text, lang, norm in items:
            print(f"  [{lang}] {norm[:60]}")
        return 0

    # 실제 생성 (컨테이너: RW 키 + ElevenLabs 키 필요)
    from app.services.tts import service
    created = skipped = failed = 0
    for text, lang, _norm in items:
        try:
            key, was_created = service.ensure_cached(text, lang)
            if was_created:
                created += 1
                print(f"  [gen] [{lang}] {text[:50]}")
            else:
                skipped += 1
        except Exception as e:
            failed += 1
            print(f"  [FAIL] [{lang}] {text[:50]} → {e}", file=sys.stderr)
    print(f"완료: 생성 {created}, skip(이미존재) {skipped}, 실패 {failed}")
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
