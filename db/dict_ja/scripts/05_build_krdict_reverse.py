#!/usr/bin/env python3
"""
국립국어원 한국어기초사전 "사전 전체 내려받기"(JSON, 무료·비로그인) 데이터에서
일본어 대역어(트랜스레이션)를 역방향 인덱스로 재구성한다.

입력:  sources/krdict/krdict_json_full.zip
        (https://krdict.korean.go.kr/download/downloadPopup 의
         "Json 전체 내려받기" 버튼 -> /dicBatchDownload?seq=217, 로그인/키 불필요)
출력:  build/krdict_ja_reverse.json
        { "<일본어 표제/표기>": [ { ko_word, ko_pos, ko_def, ja_dfn, reading,
                                     krdict_entry_id, sense_no }, ... ], ... }

일본어 대역어(lemma) 형식과 분리 규칙
-------------------------------------------------
원본 lemma 필드는 대략 다음 형태로 온다.

    "きょうたんする【驚嘆する】。かんたんする【感嘆する・感歎する】"

- 여러 대역어(동의어)가 있으면 온점 "。"(U+3002, 일본어 구두점)으로 구분된다.
  콤마 "、"/"," 는 지금까지 조사한 표본에서 대역어 구분자로 쓰이지 않았고
  (한자 표기 안에 "、" 자체가 등장하는 경우가 없었음), "。" 만 분리 기준으로 쓴다.
- 각 세그먼트는 보통 "요미가나【칸지(・로 복수 표기 가능)】" 형태다.
  예) "きょうたんする【驚嘆する・驚歎する】"
      -> reading=きょうたんする, surface in {驚嘆する, 驚歎する} (칸지 이표기는 ・ 로 구분)
  대괄호가 없는 세그먼트(가나만 있는 용언/부사, 가타카나 외래어, 관용구/속담 등:
  "なるべく", "ストア", "見当が付く" 등)는 세그먼트 원문 그대로를 표제(surface)로 쓰고
  reading 은 None 으로 둔다(정확한 요미가 주어지지 않았기 때문).
- "(対訳語無し)" 등 "대역어 없음" 표시는 스킵한다.
- 극소수 원본 오탈자(대괄호 짝이 깨졌거나 "。" 없이 두 세그먼트가 붙어있는 경우)는
  정규식이 매치되지 않으면 세그먼트 전체를 그대로 surface 로 사용해 저하된 형태로나마
  보존한다(데이터 손실 방지, 완벽한 파싱보다 회수율 우선).

역방향 인덱스의 키(ja_word)는 "surface"(칸지/가나 그대로의 표기)다. 괄호 안에 여러
칸지 이표기가 있으면 각 표기마다 별도 키로 등록한다(동일 reading/ko_word 공유).
"""
import json
import re
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

WORK_DIR = Path("/work")
ZIP_PATH = WORK_DIR / "sources" / "krdict" / "krdict_json_full.zip"
OUT_PATH = WORK_DIR / "build" / "krdict_ja_reverse.json"

BRACKET_RE = re.compile(r"^(?P<reading>[^【】]*)【(?P<kanji>[^【】]*)】\s*$")
NO_TRANS_MARKERS = ("対訳語無し", "대역어")
KO_DEF_MAX_LEN = 60


def as_list(v):
    if v is None:
        return []
    if isinstance(v, list):
        return v
    return [v]


def feat_to_dict(feat):
    """feat: dict | list[dict] -> {att: val} (중복 att는 마지막 값 우선)"""
    d = {}
    for f in as_list(feat):
        d[f.get("att")] = f.get("val")
    return d


def split_ja_segments(lemma: str):
    lemma = (lemma or "").strip()
    if not lemma:
        return []
    if any(marker in lemma for marker in NO_TRANS_MARKERS):
        return []
    return [seg.strip() for seg in lemma.split("。") if seg.strip()]


def parse_ja_segment(seg: str):
    """세그먼트 하나 -> [(reading|None, surface), ...] (칸지 이표기는 여러 개로 확장)"""
    m = BRACKET_RE.match(seg)
    if not m:
        # 대괄호 없음: 가나 단어/가타카나 외래어/관용구 등 원문 그대로 사용
        return [(None, seg)]
    reading = m.group("reading").strip()
    kanji_field = m.group("kanji").strip()
    variants = [v.strip() for v in re.split("[・/]", kanji_field) if v.strip()]
    if not variants:
        # 괄호 안이 비어있는 이상 케이스 -> reading 자체를 surface로
        return [(reading, reading)] if reading else []
    return [(reading or None, v) for v in variants]


def truncate_ko_def(text: str, max_len: int = KO_DEF_MAX_LEN) -> str:
    text = (text or "").strip()
    if len(text) <= max_len:
        return text
    return text[:max_len].rstrip() + "…"


def main():
    if not ZIP_PATH.exists():
        print(f"입력 파일 없음: {ZIP_PATH}", file=sys.stderr)
        sys.exit(1)

    reverse = defaultdict(list)
    ko_words_seen = set()

    total_entries = 0
    total_senses = 0
    total_ja_equivalents = 0
    total_no_trans = 0
    unmatched_bracket_examples = []

    with zipfile.ZipFile(ZIP_PATH) as z:
        names = sorted(z.namelist())
        for name in names:
            print(f"[읽는 중] {name}", file=sys.stderr)
            obj = json.loads(z.read(name))
            entries = obj["LexicalResource"]["Lexicon"]["LexicalEntry"]
            for entry in as_list(entries):
                total_entries += 1
                entry_feats = feat_to_dict(entry.get("feat"))
                ko_pos = entry_feats.get("partOfSpeech")
                entry_id = entry.get("val")

                # Lemma: 보통 {feat:{...}} 단일 dict 지만, 이표기(variant)가 있으면
                # [{feat:{writtenForm,...}}, {feat:{variant,...}}] 형태의 list로 온다.
                lemma_feat = {}
                for lemma_item in as_list(entry.get("Lemma")):
                    lemma_feat.update(feat_to_dict(lemma_item.get("feat")))
                ko_word = lemma_feat.get("writtenForm")
                if not ko_word:
                    continue
                ko_words_seen.add(ko_word)

                for sense in as_list(entry.get("Sense")):
                    total_senses += 1
                    sense_no = sense.get("val")
                    sense_feats = feat_to_dict(sense.get("feat"))
                    ko_def_full = sense_feats.get("definition", "")
                    ko_def = truncate_ko_def(ko_def_full)

                    for equiv in as_list(sense.get("Equivalent")):
                        eq_feats = feat_to_dict(equiv.get("feat"))
                        if eq_feats.get("language") != "일본어":
                            continue
                        total_ja_equivalents += 1
                        lemma = eq_feats.get("lemma", "")
                        ja_dfn = (eq_feats.get("definition") or "").strip()

                        segments = split_ja_segments(lemma)
                        if not segments:
                            total_no_trans += 1
                            continue

                        for seg in segments:
                            pairs = parse_ja_segment(seg)
                            if not pairs and seg:
                                unmatched_bracket_examples.append(seg)
                            for reading, surface in pairs:
                                if not surface:
                                    continue
                                reverse[surface].append(
                                    {
                                        "ko_word": ko_word,
                                        "ko_pos": ko_pos,
                                        "ko_def": ko_def,
                                        "ja_dfn": ja_dfn,
                                        "reading": reading,
                                        "krdict_entry_id": entry_id,
                                        "sense_no": sense_no,
                                    }
                                )

    # 완전 중복 레코드 제거 (동일 ja_word 안에서)
    deduped = {}
    for ja_word, records in reverse.items():
        seen = set()
        uniq = []
        for r in records:
            key = tuple(r.items())
            if key in seen:
                continue
            seen.add(key)
            uniq.append(r)
        deduped[ja_word] = uniq

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(deduped, f, ensure_ascii=False, indent=1, sort_keys=True)

    total_ko_entries_in_index = len(
        {r["ko_word"] for records in deduped.values() for r in records}
    )

    print("=" * 60)
    print(f"KO 표제어(엔트리) 총수                : {total_entries}")
    print(f"KO 표제어 고유 표기 수                 : {len(ko_words_seen)}")
    print(f"Sense(뜻풀이) 총수                     : {total_senses}")
    print(f"일본어 Equivalent 레코드 총수          : {total_ja_equivalents}")
    print(f"  - 대역어 없음('対訳語無し' 등)        : {total_no_trans}")
    print(f"일본어 표제(ja_word) 고유 키 수         : {len(deduped)}")
    print(f"역방향 인덱스에 실제 등장하는 KO 표제어 수: {total_ko_entries_in_index}")
    print(f"대괄호 패턴 미매치(원문 그대로 보존) 예시 {len(unmatched_bracket_examples)}건 중 상위 10개:")
    for ex in unmatched_bracket_examples[:10]:
        print(f"    {ex!r}")
    print(f"출력 파일: {OUT_PATH}")
    print("=" * 60)

    print("\n표본 20건 (ja_word -> 첫 레코드):")
    sample_keys = sorted(deduped.keys())
    # 다양성을 위해 균등 간격으로 20개 추출
    n = len(sample_keys)
    step = max(1, n // 20)
    shown = 0
    for i in range(0, n, step):
        if shown >= 20:
            break
        k = sample_keys[i]
        rec = deduped[k][0]
        print(
            f"  [{k}] reading={rec['reading']!r} <- ko_word={rec['ko_word']!r} "
            f"pos={rec['ko_pos']!r} ko_def={rec['ko_def']!r} ja_dfn={rec['ja_dfn']!r}"
        )
        shown += 1


if __name__ == "__main__":
    main()
