#!/usr/bin/env bash
# 일한 사전 원본 소스 내려받기 (멱등: 이미 있으면 건너뜀, FORCE=1 이면 재다운로드)
# 실행: docker exec heyvoca_dictja_work bash scripts/00_download.sh
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=sources
mkdir -p "$SRC/tatoeba" "$SRC/kanjium" "$SRC/jlpt" "$SRC/jmdict"
FORCE="${FORCE:-0}"
log(){ echo "[00_download] $*"; }

fetch(){ # url dest
  local url="$1" dest="$2"
  if [[ -s "$dest" && "$FORCE" != 1 ]]; then log "skip (exists) $dest"; return; fi
  log "GET $url"
  curl -fL --retry 3 -o "$dest.part" "$url"
  mv "$dest.part" "$dest"
}

bunzip(){ # src.bz2 dest  (컨테이너에 bzip2 바이너리가 없어 python bz2 사용)
  local src="$1" dest="$2"
  if [[ -s "$dest" && "$FORCE" != 1 ]]; then log "skip (exists) $dest"; return; fi
  log "bunzip $src -> $dest"
  python3 - "$src" "$dest" <<'PY'
import bz2, shutil, sys
with bz2.open(sys.argv[1], 'rb') as f, open(sys.argv[2] + '.part', 'wb') as o:
    shutil.copyfileobj(f, o, 1 << 20)
import os; os.replace(sys.argv[2] + '.part', sys.argv[2])
PY
}

untar_bz2(){ # src.tar.bz2 dir
  local src="$1" dir="$2" marker="$2/.extracted_$(basename "$1")"
  if [[ -f "$marker" && "$FORCE" != 1 ]]; then log "skip (extracted) $src"; return; fi
  log "untar $src -> $dir"
  python3 -c "import tarfile,sys; tarfile.open(sys.argv[1],'r:bz2').extractall(sys.argv[2])" "$src" "$dir"
  touch "$marker"
}

# 1) JMdict (jmdict-simplified, 영어 gloss 전체판)
REL_JSON=$(curl -fsSL https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest)
JM_URL=$(printf '%s' "$REL_JSON" | python3 -c "import json,sys,re; d=json.load(sys.stdin); print([a['browser_download_url'] for a in d['assets'] if re.match(r'jmdict-eng-\d.*\.json\.zip$', a['name'])][0])")
JM_TAG=$(printf '%s' "$REL_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['tag_name'])")
log "jmdict-simplified release $JM_TAG"
echo "$JM_TAG" > "$SRC/jmdict/RELEASE_TAG"
fetch "$JM_URL" "$SRC/jmdict/jmdict-eng.json.zip"
if [[ ! -s "$SRC/jmdict-eng.json" || "$FORCE" == 1 || "$SRC/jmdict/jmdict-eng.json.zip" -nt "$SRC/jmdict-eng.json" ]]; then
  log "unzip jmdict"
  rm -rf "$SRC/jmdict/unz" && mkdir -p "$SRC/jmdict/unz"
  unzip -q -o "$SRC/jmdict/jmdict-eng.json.zip" -d "$SRC/jmdict/unz"
  mv "$(ls "$SRC"/jmdict/unz/*.json | head -1)" "$SRC/jmdict-eng.json"
  touch "$SRC/jmdict-eng.json"
  rm -rf "$SRC/jmdict/unz"
fi

# 2) Tatoeba
T=https://downloads.tatoeba.org/exports
fetch "$T/per_language/jpn/jpn_sentences.tsv.bz2" "$SRC/tatoeba/jpn_sentences.tsv.bz2"
fetch "$T/per_language/eng/eng_sentences.tsv.bz2" "$SRC/tatoeba/eng_sentences.tsv.bz2"
fetch "$T/per_language/kor/kor_sentences.tsv.bz2" "$SRC/tatoeba/kor_sentences.tsv.bz2"
fetch "$T/per_language/jpn/jpn-eng_links.tsv.bz2" "$SRC/tatoeba/jpn-eng_links.tsv.bz2"
fetch "$T/per_language/jpn/jpn-kor_links.tsv.bz2" "$SRC/tatoeba/jpn-kor_links.tsv.bz2"
fetch "$T/jpn_indices.tar.bz2" "$SRC/tatoeba/jpn_indices.tar.bz2"
for f in jpn_sentences eng_sentences kor_sentences jpn-eng_links jpn-kor_links; do
  bunzip "$SRC/tatoeba/$f.tsv.bz2" "$SRC/tatoeba/$f.tsv"
done
untar_bz2 "$SRC/tatoeba/jpn_indices.tar.bz2" "$SRC/tatoeba"

# 3) Kanjium 피치 액센트
fetch https://raw.githubusercontent.com/mifunetoshiro/kanjium/master/data/source_files/raw/accents.txt "$SRC/kanjium/accents.txt"

# 4) JLPT (stephenmk/yomitan-jlpt-vocab: tanos 리스트 + JMdict seq id)
for n in n5 n4 n3 n2 n1; do
  fetch "https://raw.githubusercontent.com/stephenmk/yomitan-jlpt-vocab/main/original_data/$n.csv" "$SRC/jlpt/$n.csv"
done

log "done"; ls -la "$SRC" "$SRC"/*/
