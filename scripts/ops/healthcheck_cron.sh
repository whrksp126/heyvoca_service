#!/usr/bin/env bash
# 헤이보카 prod 헬스체크 → CodingPT 알림 채널.
# 서버 crontab 에서 1분마다 실행한다:
#   * * * * * /srv/projects/heyvoca/scripts/ops/healthcheck_cron.sh >/dev/null 2>&1
#
# - 백엔드 /health(DB·Redis 포함)와 프론트 첫 화면을 공개 주소로 확인한다(nginx·Cloudflare 경로까지).
# - 배포 중 재시작으로 잠깐 끊기는 것은 무시하도록 연속 FAIL_THRESHOLD 회 실패해야 알린다.
# - 알린 뒤 다시 살아나면 '복구' 알림을 한 번 보낸다.
# - 웹훅 URL 은 heyvoca_back/.env 의 CODINGPT_WEBHOOK_URL 에서 읽는다(명령줄·로그에 찍지 않는다).
set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$ROOT/heyvoca_back/.env"
STATE_DIR="${HEYVOCA_HEALTH_STATE:-$HOME/.heyvoca_health}"
FAIL_THRESHOLD=3
SOURCE="healthcheck@prod-cron"

mkdir -p "$STATE_DIR"
exec 9>"$STATE_DIR/lock"
flock -n 9 || exit 0

WEBHOOK="$(grep -m1 '^CODINGPT_WEBHOOK_URL=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"'"'"'\r')"
[ -z "$WEBHOOK" ] && exit 0

send() {  # level title text dedupe
  python3 - "$WEBHOOK" "$1" "$2" "$3" "$4" "$SOURCE" <<'PY' >/dev/null 2>&1 || true
import json, sys, urllib.request
url, level, title, text, dedupe, source = sys.argv[1:7]
body = json.dumps({"level": level, "title": title, "text": text, "dedupeKey": dedupe, "source": source}).encode()
req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
urllib.request.urlopen(req, timeout=5)
PY
}

# name url expect(검사할 문자열, 비우면 HTTP 200 만 본다)
check() {
  local name="$1" url="$2" expect="$3" out code body
  out="$(curl -s --max-time 10 -w $'\n%{http_code}' "$url" 2>&1)"
  code="${out##*$'\n'}"
  body="${out%$'\n'*}"
  local fail_file="$STATE_DIR/$name.fails" alerted="$STATE_DIR/$name.alerted"
  local ok=1
  [ "$code" = "200" ] || ok=0
  if [ -n "$expect" ] && ! printf '%s' "$body" | grep -q "$expect"; then ok=0; fi

  if [ "$ok" = 1 ]; then
    if [ -f "$alerted" ]; then
      local since; since="$(cat "$alerted")"
      send success "$name 복구됨" "$url 정상 응답(HTTP $code). 장애 시작 $since, 복구 $(date '+%F %T')" "health:$name:recovered"
      rm -f "$alerted"
    fi
    echo 0 > "$fail_file"
    return
  fi

  local n; n=$(( $(cat "$fail_file" 2>/dev/null || echo 0) + 1 ))
  echo "$n" > "$fail_file"
  if [ "$n" -ge "$FAIL_THRESHOLD" ] && [ ! -f "$alerted" ]; then
    date '+%F %T' > "$alerted"
    local snippet; snippet="$(printf '%s' "$body" | head -c 1500)"
    local containers; containers="$(docker ps -a --format '{{.Names}} {{.Status}}' 2>/dev/null | grep -E 'heyvoca_(back|front|mysql|redis)_prod' )"
    send critical "$name 응답 없음 (${n}분 연속)" "$url
HTTP: ${code:-없음}
응답: ${snippet:-없음}

컨테이너:
$containers" "health:$name:down"
  fi
}

check back "https://heyvoca-back.ghmate.com/health" '"status":"ok"'
check front "https://heyvoca-front.ghmate.com/" ""
