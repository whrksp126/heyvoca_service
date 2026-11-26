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

# 메모리 감시 (2026-11-26 추가) — 응답은 살아 있어도 워커가 OOM 으로 죽고 있으면 /health 로는 안 보인다.
# cgroup v2 의 memory.events(oom_kill 누적)와 memory.current/max 를 직접 읽는다(빠르고 sudo 불필요).
#   - oom_kill 이 늘면 즉시 warning (컨테이너 ID 별로 기록 → 재생성 시 0 부터 다시 셈)
#   - 사용량이 한도의 MEM_WARN_PCT% 이상인 상태가 MEM_WARN_MINUTES 분 이어지면 warning 1회,
#     MEM_CLEAR_PCT% 아래로 내려가면 해제
MEM_WARN_PCT=90
MEM_CLEAR_PCT=80
MEM_WARN_MINUTES=5
check_mem() {
  local name="$1" id cg max cur kills pct
  id="$(docker inspect -f '{{.Id}}' "$name" 2>/dev/null)" || return
  cg="/sys/fs/cgroup/system.slice/docker-$id.scope"
  [ -r "$cg/memory.events" ] || return
  max="$(cat "$cg/memory.max")"; cur="$(cat "$cg/memory.current")"
  kills="$(awk '$1=="oom_kill"{print $2}' "$cg/memory.events")"

  local kill_file="$STATE_DIR/$name.oom"
  local prev_id prev_kills
  read -r prev_id prev_kills < "$kill_file" 2>/dev/null || true
  [ "${prev_id:-}" = "$id" ] || prev_kills=0
  if [ "${kills:-0}" -gt "${prev_kills:-0}" ]; then
    send warning "$name 메모리 부족 강제 종료(OOM)" "$name 에서 프로세스가 메모리 한도 초과로 강제 종료됐어요.
새로 $(( kills - prev_kills ))건 (이 컨테이너 누적 ${kills}건)
현재 사용량: $(( cur / 1048576 ))MiB / 한도 $( [ "$max" = max ] && echo 무제한 || echo "$(( max / 1048576 ))MiB")
확인: docker logs --since 10m $name | grep 'signal 9'" "mem:$name:oom:$id:$kills"
  fi
  echo "$id ${kills:-0}" > "$kill_file"

  [ "$max" = max ] && return
  pct=$(( cur * 100 / max ))
  local hi_file="$STATE_DIR/$name.memhigh" hi_alerted="$STATE_DIR/$name.memhigh.alerted"
  if [ "$pct" -ge "$MEM_WARN_PCT" ]; then
    local n; n=$(( $(cat "$hi_file" 2>/dev/null || echo 0) + 1 ))
    echo "$n" > "$hi_file"
    if [ "$n" -ge "$MEM_WARN_MINUTES" ] && [ ! -f "$hi_alerted" ]; then
      date '+%F %T' > "$hi_alerted"
      send warning "$name 메모리 ${pct}% (${n}분째)" "$name 사용량 $(( cur / 1048576 ))MiB / 한도 $(( max / 1048576 ))MiB.
곧 OOM 강제 종료가 날 수 있어요. 한도 상향(docker update --memory) 또는 워커 수 조정을 검토하세요." "mem:$name:high"
    fi
  elif [ "$pct" -lt "$MEM_CLEAR_PCT" ]; then
    echo 0 > "$hi_file"
    rm -f "$hi_alerted"
  fi
}

# 자동 정리 (2026-11-26 추가) — 백엔드 메모리가 HEAL_PCT% 이상으로 HEAL_MINUTES 분 이어지면
# 가장 큰 gunicorn 워커 '하나'에 TERM(정상 종료)을 보낸다. 처리 중 요청은 마치고 내려가고,
# 나머지 워커가 계속 응답하며, gunicorn 마스터가 즉시 새 워커를 띄운다 → 무중단.
# (HUP 전체 리로드는 새 워커를 먼저 띄워 스케줄러 소켓 잠금을 놓치므로 쓰지 않는다)
# 쿨다운 HEAL_COOLDOWN_MIN 분. 1시간에 HEAL_REPEAT_WARN 번 이상이면 '원인 확인 필요' 경고.
HEAL_PCT=${HEAL_PCT:-85}
HEAL_MINUTES=${HEAL_MINUTES:-3}
HEAL_COOLDOWN_MIN=10
HEAL_REPEAT_WARN=3
heal_back() {
  local c=heyvoca_back_prod id cg max cur pct
  id="$(docker inspect -f '{{.Id}}' "$c" 2>/dev/null)" || return
  cg="/sys/fs/cgroup/system.slice/docker-$id.scope"
  max="$(cat "$cg/memory.max" 2>/dev/null)"; cur="$(cat "$cg/memory.current" 2>/dev/null)"
  [ -z "$cur" ] || [ "$max" = max ] && return
  pct=$(( cur * 100 / max ))
  local cnt_file="$STATE_DIR/heal.count" log_file="$STATE_DIR/heal.log"
  if [ "$pct" -lt "$HEAL_PCT" ]; then echo 0 > "$cnt_file"; return; fi
  local n; n=$(( $(cat "$cnt_file" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$cnt_file"
  [ "$n" -ge "$HEAL_MINUTES" ] || return
  local now last; now=$(date +%s); last="$(tail -1 "$log_file" 2>/dev/null | awk '{print $1}')"
  [ -n "$last" ] && [ $(( now - last )) -lt $(( HEAL_COOLDOWN_MIN * 60 )) ] && return

  local top; top="$(docker exec "$c" ps -o ppid=,pid=,rss= -e 2>/dev/null | awk '$1==1{print $3, $2}' | sort -rn | head -1)"
  [ -z "$top" ] && return
  local rss=${top% *} pid=${top#* }
  docker exec "$c" kill -TERM "$pid" 2>/dev/null || return
  echo "$now $pid $rss $pct" >> "$log_file"
  echo 0 > "$cnt_file"
  local recent; recent="$(awk -v t=$(( now - 3600 )) '$1>=t' "$log_file" | wc -l | tr -d ' ')"
  if [ "$recent" -ge "$HEAL_REPEAT_WARN" ]; then
    send warning "백엔드 메모리 자동 정리 반복(1시간 ${recent}회)" "자동 정리로도 금방 다시 차요. 메모리 누수나 무거운 요청이 의심됩니다.
현재 $(( cur / 1048576 ))MiB / 한도 $(( max / 1048576 ))MiB (${pct}%)
기록: ~/.heyvoca_health/heal.log
확인: docker logs --since 1h $c" "heal:repeat:$(date +%F_%H)"
  else
    send info "백엔드 메모리 자동 정리" "메모리 ${pct}% 상태가 ${HEAL_MINUTES}분 이어져 가장 큰 워커(pid $pid, $(( rss / 1024 ))MiB)를 정상 종료하고 새로 띄웠어요. 서비스 중단 없음." "heal:$now"
  fi
}

check back "https://heyvoca-back.ghmate.com/health" '"status":"ok"'
check front "https://heyvoca-front.ghmate.com/" ""
for c in heyvoca_back_prod heyvoca_mysql_prod heyvoca_redis_prod heyvoca_front_prod; do
  check_mem "$c"
done
heal_back
