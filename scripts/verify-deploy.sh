#!/usr/bin/env bash
# verify-deploy.sh — 배포 직후 "정말 반영됐는가" 를 실호출로 확인한다.
#
# 규율: 재빌드·재시작만으로 완료 보고 금지. 여기서 통과해야 배포가 끝난 것이다.
#   사용: bash heyvoca_service/scripts/verify-deploy.sh [prod|stg|dev]
set -uo pipefail
ENV="${1:-prod}"
case "${ENV}" in
  prod) BACK="https://heyvoca-back.ghmate.com";     FRONT="https://heyvoca-front.ghmate.com" ;;
  stg)  BACK="https://stg-heyvoca-back.ghmate.com"; FRONT="https://stg-heyvoca-front.ghmate.com" ;;
  dev)  BACK="https://dev-heyvoca-back.ghmate.com"; FRONT="https://dev-heyvoca-front.ghmate.com" ;;
  *) echo "사용법: verify-deploy.sh [prod|stg|dev]"; exit 1 ;;
esac

fails=0
ok()  { printf "  PASS  %s\n" "$*"; }
bad() { printf "  FAIL  %s\n" "$*"; fails=$((fails+1)); }
code_of() { curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$1" 2>/dev/null || echo 000; }

echo "── ${ENV} 배포 검증 (${BACK}) ──"

# 1) back 기동 — 인증 불필요 라우트가 200 이면 라우팅·부팅이 정상이라는 뜻.
c=$(code_of "${BACK}/version/get_version")
[ "${c}" = 200 ] && ok "back 기동 (/version/get_version 200)" || bad "back 응답 ${c} (200 이어야 함)"

# 2) front
c=$(code_of "${FRONT}/")
[ "${c}" = 200 ] && ok "front 200" || bad "front 응답 ${c}"

# 2-1) 빌드 지문 — 배포 후 **이미 열려 있던 탭**이 자기가 낡았음을 아는 유일한 근거.
#      캐시되면 영원히 낡은 값을 보므로 no-store 여부까지 확인한다.
vjson=$(curl -s --max-time 15 "${FRONT}/version.json?_cb=$(date +%s)" 2>/dev/null || echo '')
vbuild=$(echo "${vjson}" | python3 -c "import sys,json;print(json.load(sys.stdin).get('build',''))" 2>/dev/null || echo '')
if [ -n "${vbuild}" ]; then
  ok "빌드 지문 ${vbuild}"
  cc=$(curl -s -I --max-time 15 "${FRONT}/version.json" 2>/dev/null | tr -d '\r' | grep -i '^cache-control:' | head -1)
  case "${cc}" in
    *no-store*|*no-cache*) ok "version.json 캐시 금지 (${cc#*: })" ;;
    *) bad "version.json 이 캐시될 수 있음 (${cc:-헤더 없음}) — 구버전 탭이 갱신을 못 받는다" ;;
  esac
else
  bad "/version.json 없음 — 프론트 빌드에 지문이 안 실렸다(vite.config buildFingerprintPlugin 확인)"
fi

# 2-2) 사라진 해시 자산은 **정직한 404** 여야 한다.
#      SPA 폴백으로 index.html 이 200 으로 나가면 sql.js·폰트가 HTML 을 받아 원인 모를 에러가 된다.
miss=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "${FRONT}/assets/does-not-exist-$(date +%s).wasm" 2>/dev/null || echo 000)
[ "${miss}" = 404 ] && ok "없는 자산 요청 → 404 (HTML 위장 아님)" \
  || bad "없는 자산 요청에 ${miss} 응답 — nginx 캐시/폴백 규칙 확인"

# 3) 버전 안내값 — **손으로 고친 값이 썩는 자리**라 매 배포마다 확인한다.
#    안내값이 스토어 게시본보다 **높으면** 사용자가 없는 버전으로 안내받아 업데이트 모달이 무한 반복된다.
body=$(curl -s --max-time 15 "${BACK}/version/get_version" 2>/dev/null || echo '')
store_ios=$(curl -s --max-time 15 "https://itunes.apple.com/lookup?id=6751544570&country=kr&_cb=$(date +%s)" 2>/dev/null \
  | python3 -c "import sys,json;r=json.load(sys.stdin).get('results') or [];print(r[0]['version'] if r else '')" 2>/dev/null || echo '')
if [ -z "${body}" ]; then
  bad "/version/get_version 응답 없음"
else
  python3 - "${body}" "${store_ios}" <<'PY' || fails=$((fails+1))
import json,sys
try: d=json.loads(sys.argv[1])['data']
except Exception: print("  FAIL  /version/get_version 파싱 불가"); raise SystemExit(1)
store=sys.argv[2]
gi, ga, mn = d.get('app_ios_version'), d.get('app_android_version'), d.get('min_app_version')
src = d.get('app_version_source') or {}
print(f"  INFO  안내값 ios={gi} android={ga} · 최소요구 {mn} · App Store 게시본 {store or '?'}")
bad=0
if not gi or not ga: print("  FAIL  안내값(app_ios_version/app_android_version)이 비어 있음"); bad=1
# 안내값의 출처 — store/cache 면 자동 조회가 동작 중, fallback 이면 스토어 조회가 막힌 상태다.
#  fallback 은 즉시 사고는 아니지만(값이 낡을 뿐) 방치하면 손으로 관리하던 시절로 돌아간다.
if src:
    print(f"  INFO  안내값 출처 ios={src.get('ios')} android={src.get('android')}")
    if src.get('ios') == 'fallback' or src.get('android') == 'fallback':
        print("  WARN  스토어 조회 실패 → 폴백값 사용 중(네트워크/차단 확인)")
    else:
        print("  PASS  안내값이 스토어 실조회로 채워짐(수기 관리 아님)")
else:
    print("  WARN  app_version_source 없음 — 구버전 백엔드가 떠 있을 수 있다")
def tup(v): return tuple(int(x) for x in str(v).split('.') if x.isdigit())
if store and gi and tup(gi) > tup(store):
    print(f"  FAIL  안내값 ios={gi} 이 게시본 {store} 보다 높음 — 업데이트 모달 무한 반복 위험"); bad=1
elif store and gi and tup(gi) < tup(store):
    print(f"  WARN  안내값 ios={gi} 이 게시본 {store} 보다 낮음 — 게시 후 갱신을 빠뜨린 상태(사용자 피해는 없음)")
elif store: print("  PASS  안내값 ios 가 게시본과 일치")
if mn and gi and tup(mn) > tup(gi):
    print(f"  FAIL  min_app_version({mn})이 안내값({gi})보다 높음 — 강제 업데이트가 막다른 길이 된다"); bad=1
raise SystemExit(bad)
PY
fi

echo
if [ "${fails}" != 0 ]; then echo "❌ ${fails} 건 실패 — 완료 보고 금지"; exit 1; fi
echo "✅ 검증 통과"
