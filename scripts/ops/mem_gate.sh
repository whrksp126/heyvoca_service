#!/usr/bin/env bash
# 백엔드 메모리 배포 게이트 — deploy.sh 가 서버에서 호출한다(2026-11-26 prod OOM 사고 후 추가).
#
#   mem_gate.sh pre  prod   배포 전: dev 에서 돌고 있는 같은 코드의 워커 크기로 prod 필요 메모리를 예측해
#                           위험하면 exit 1 (배포 중단). dev 에서 OOM 이 났어도 중단.
#   mem_gate.sh post <env>  배포 후: 새 컨테이너 워커 크기를 재서 기록하고, 직전 배포보다 30% 넘게
#                           커졌거나 한도의 70% 를 넘으면 경고 + (prod) CodingPT 알림 + 되돌리기 명령 안내.
#
# 강제 통과: FORCE_MEM_GATE=1 (deploy.sh 가 그대로 넘겨준다)
set -u

MODE="${1:-}"; ENV="${2:-}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STATE_DIR="${HEYVOCA_HEALTH_STATE:-$HOME/.heyvoca_health}"
mkdir -p "$STATE_DIR"

PRE_LIMIT_PCT=75     # 예측치가 prod 한도의 이 % 이상이면 배포 중단
POST_WARN_PCT=70     # 배포 직후(트래픽 거의 없음)인데 이 % 이상이면 경고
GROWTH_WARN_PCT=130  # 워커 평균이 직전 배포 대비 이 % 이상이면 경고

mib() { echo $(( $1 / 1024 )); }  # KB → MiB

# 컨테이너의 gunicorn 워커(PID 1 의 자식) RSS(KB) 목록
# 엔트리포인트 셸이 좀비(<defunct>, RSS 0)로 PID 1 밑에 남으므로 RSS>0 만 워커로 센다.
worker_rss() { docker exec "$1" ps -o ppid=,rss= -e 2>/dev/null | awk '$1==1 && $2>0{print $2}'; }
cg_dir() { echo "/sys/fs/cgroup/system.slice/docker-$(docker inspect -f '{{.Id}}' "$1" 2>/dev/null).scope"; }
oom_kills() { awk '$1=="oom_kill"{print $2}' "$(cg_dir "$1")/memory.events" 2>/dev/null || echo 0; }
limit_kb() { local m; m="$(docker inspect -f '{{.HostConfig.Memory}}' "$1" 2>/dev/null)"; echo $(( ${m:-0} / 1024 )); }
# compose 에 적힌 back 메모리 한도(KB) — 배포 후 적용될 값
compose_limit_kb() {
  local f="$ROOT/docker-compose.yml"; [ "$1" = dev ] && f="$ROOT/docker-compose.dev.yml"
  awk '/^  back:/{b=1;next} /^  [a-z]+:/{b=0} b&&/memory:/{print $2; exit}' "$f" | python3 -c '
import sys; v=sys.stdin.read().strip().lower(); u={"k":1,"m":1024,"g":1024**2}
print(int(float(v[:-1])*u[v[-1]]) if v and v[-1] in u else 0)'
}
prod_workers() { local n; n="$(grep -o '"-w", "[0-9][0-9]*"' "$ROOT/heyvoca_back/Dockerfile" | grep -o '[0-9][0-9]*' | head -1)"; echo "${n:-4}"; }

send() {  # level title text dedupe — prod .env 의 웹훅으로(없으면 조용히 생략)
  local hook; hook="$(grep -m1 '^CODINGPT_WEBHOOK_URL=' "$ROOT/heyvoca_back/.env" 2>/dev/null | cut -d= -f2- | tr -d '"'"'"'\r')"
  [ -z "$hook" ] && return 0
  python3 - "$hook" "$1" "$2" "$3" "$4" <<'PY' >/dev/null 2>&1 || true
import json, sys, urllib.request
url, level, title, text, dedupe = sys.argv[1:6]
body = json.dumps({"level": level, "title": title, "text": text, "dedupeKey": dedupe, "source": "mem_gate@deploy"}).encode()
urllib.request.urlopen(urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}), timeout=5)
PY
}

pre() {
  [ "$ENV" = prod ] || { echo "[MEM GATE] $ENV 는 사전 검사 없음(dev 가 검사 대상)"; return 0; }
  local dev=heyvoca_back_dev
  local rss max_kb=0 n
  rss="$(worker_rss "$dev")"
  [ -z "$rss" ] && { echo "[MEM GATE] dev 백엔드 워커를 못 찾음 → 예측 불가. dev 먼저 배포하세요."; return 1; }
  for r in $rss; do [ "$r" -gt "$max_kb" ] && max_kb=$r; done
  n="$(prod_workers)"
  local lim; lim="$(compose_limit_kb prod)"
  local need=$(( max_kb * n + 30000 ))   # 워커 n개 + 마스터 여유
  local pct=$(( need * 100 / lim ))
  local dev_oom; dev_oom="$(oom_kills "$dev")"
  echo "[MEM GATE] dev 워커 최대 $(mib $max_kb)MiB × prod 워커 ${n}개 ≈ $(mib $need)MiB / prod 한도 $(mib $lim)MiB (${pct}%)"
  echo "[MEM GATE] dev 백엔드 OOM 강제 종료(이번 dev 컨테이너 기동 후): ${dev_oom}건"
  local bad=""
  [ "$pct" -ge "$PRE_LIMIT_PCT" ] && bad="예측 사용량 ${pct}% ≥ ${PRE_LIMIT_PCT}%"
  [ "${dev_oom:-0}" -gt 0 ] && bad="${bad:+$bad, }dev 에서 OOM ${dev_oom}건"
  if [ -n "$bad" ]; then
    echo "[MEM GATE] ✗ 배포 중단: $bad"
    echo "           워커가 무거워진 원인(전역 캐시·큰 데이터 로드)을 먼저 확인하거나, docker-compose.yml 의 back 메모리 한도/워커 수를 조정하세요."
    echo "           그래도 올려야 하면: FORCE_MEM_GATE=1 ./deploy.sh prod"
    [ "${FORCE_MEM_GATE:-0}" = 1 ] && { echo "[MEM GATE] FORCE_MEM_GATE=1 → 경고만 하고 진행"; return 0; }
    return 1
  fi
  echo "[MEM GATE] ✓ 통과"
}

post() {
  local c="heyvoca_back_$ENV" i rss
  # 워커가 다 뜨고 앱 import 가 끝날 때까지 대기(최대 90초)
  for i in $(seq 1 18); do
    rss="$(worker_rss "$c")"
    [ -n "$rss" ] && docker logs "$c" --since 2m 2>&1 | grep -q 'Booting worker' && break
    sleep 5
  done
  sleep 15; rss="$(worker_rss "$c")"
  [ -z "$rss" ] && { echo "[MEM CHECK] 워커를 못 찾음 — 부팅 실패 여부를 확인하세요."; return 1; }
  local total=0 cnt=0 r; for r in $rss; do total=$(( total + r )); cnt=$(( cnt + 1 )); done
  local avg=$(( total / cnt )) lim; lim="$(limit_kb "$c")"
  local pct=$(( total * 100 / lim ))
  local hist="$STATE_DIR/boot_rss_$ENV" prev_avg=""
  prev_avg="$(tail -1 "$hist" 2>/dev/null | awk '{print $2}')"
  echo "$(date '+%F_%T') $avg $total $cnt $(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null)" >> "$hist"
  echo "[MEM CHECK] $c 기동 직후 워커 ${cnt}개 평균 $(mib $avg)MiB, 합계 $(mib $total)MiB / 한도 $(mib $lim)MiB (${pct}%)${prev_avg:+, 직전 배포 평균 $(mib $prev_avg)MiB}"
  local bad=""
  [ "$pct" -ge "$POST_WARN_PCT" ] && bad="기동 직후인데 한도의 ${pct}%"
  if [ -n "$prev_avg" ] && [ "$prev_avg" -gt 0 ] && [ $(( avg * 100 / prev_avg )) -ge "$GROWTH_WARN_PCT" ]; then
    bad="${bad:+$bad, }워커가 직전 배포보다 $(( avg * 100 / prev_avg - 100 ))% 커짐"
  fi
  if [ -n "$bad" ]; then
    local rb="ssh 서버 'cd /srv/projects/heyvoca && docker tag heyvoca_back:${ENV}-prev heyvoca_back:${ENV} && docker compose -p heyvoca_${ENV} -f $( [ "$ENV" = dev ] && echo docker-compose.dev.yml || echo docker-compose.yml ) up -d --no-build --no-deps back'"
    echo "[MEM CHECK] ⚠ $bad — 트래픽이 붙으면 OOM 위험. 되돌리기: $rb"
    [ "$ENV" = prod ] && send warning "배포 후 백엔드 메모리 경고" "$bad
워커 ${cnt}개 평균 $(mib $avg)MiB, 합계 $(mib $total)MiB / 한도 $(mib $lim)MiB
되돌리기: $rb" "memgate:post:$ENV:$(date +%F_%H%M)"
    return 1
  fi
  echo "[MEM CHECK] ✓ 정상"
}

case "$MODE" in
  pre) pre ;;
  post) post ;;
  *) echo "사용법: $0 pre|post dev|prod"; exit 2 ;;
esac
