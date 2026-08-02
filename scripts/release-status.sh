#!/usr/bin/env bash
# release-status.sh — "지금 무엇을 배포/제출해야 하는가" 를 한 번에 진단한다(읽기 전용).
#
# 왜 필요한가: 배포 표면이 4개(back/front · Android · iOS · 백엔드의 버전 안내값)이고 순서를 틀리면
# 조용히 어긋난다. 특히 **스토어 게시 전에 version.py 의 app_*_version 을 올리면** 사용자가 아직
# 존재하지 않는 버전으로 안내받아 업데이트 모달이 무한 반복된다. 매번 기억하는 대신 여기서 읽는다.
#
# 이 스크립트는 **아무것도 바꾸지 않는다**. 판단 재료만 모은다.
#   사용: bash heyvoca_service/scripts/release-status.sh [--json]
set -uo pipefail

SVC_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$(cd "${SVC_ROOT}/.." && pwd)"
APP="${ROOT}/heyvoca_app"

BACK_PROD="https://heyvoca-back.ghmate.com"
FRONT_PROD="https://heyvoca-front.ghmate.com"
IOS_APP_ID="6751544570"
ANDROID_PKG="com.ghmate.heyvoca"
JSON=0
[ "${1:-}" = "--json" ] && JSON=1

hdr() { [ "${JSON}" = 1 ] || { echo; echo "── $* ──"; }; }

# ── 로컬: 리포 상태 ───────────────────────────────────────────────────
repo_state() { # <path> → "dirty unpushed branch"
  local d="$1" dirty unpushed branch
  [ -d "$d/.git" ] || { echo "0 0 norepo"; return; }
  dirty=$(git -C "$d" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  branch=$(git -C "$d" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '-')
  git -C "$d" fetch --quiet origin 2>/dev/null || true
  # 로컬 브랜치명이 원격과 다를 수 있다(예: app 은 feature 브랜치) → 없으면 origin/main 과 비교.
  unpushed=$(git -C "$d" rev-list --count "origin/${branch}..${branch}" 2>/dev/null \
    || git -C "$d" rev-list --count "origin/main..${branch}" 2>/dev/null || echo 0)
  echo "${dirty} ${unpushed} ${branch}"
}

# ── 로컬: 버전 ────────────────────────────────────────────────────────
GRADLE="${APP}/android/app/build.gradle"
PBX="${APP}/ios/heyvoca.xcodeproj/project.pbxproj"
and_name=$(grep -Eo 'versionName +"[^"]+"' "${GRADLE}" 2>/dev/null | grep -Eo '"[^"]+"' | tr -d '"' | head -1)
and_code=$(grep -Eo 'versionCode +[0-9]+' "${GRADLE}" 2>/dev/null | grep -Eo '[0-9]+' | head -1)
ios_ver=$(grep -Eo 'MARKETING_VERSION = [^;]+' "${PBX}" 2>/dev/null | head -1 | awk '{print $3}')
ios_build=$(grep -Eo 'CURRENT_PROJECT_VERSION = [0-9]+' "${PBX}" 2>/dev/null | head -1 | awk '{print $3}')
# 안내값(app_*_version)은 이제 **스토어 실조회**로 자동으로 채워진다(heyvoca_back/app/services/store_version.py).
#  여기서 읽는 건 조회가 막혔을 때만 쓰이는 폴백 상수다 — 낡아도 사고는 아니지만 맞춰 두면 좋다.
SVPY="${SVC_ROOT}/heyvoca_back/app/services/store_version.py"
repo_ios_guide=$(grep -Eo "APP_LATEST_IOS', *'[^']+'" "${SVPY}" 2>/dev/null | grep -Eo "'[^']+'$" | tr -d "'")
repo_and_guide=$(grep -Eo "APP_LATEST_ANDROID', *'[^']+'" "${SVPY}" 2>/dev/null | grep -Eo "'[^']+'$" | tr -d "'")

# ── 라이브: 서버/스토어 ───────────────────────────────────────────────
code_of() { curl -s -o /dev/null -w '%{http_code}' --max-time 12 "$1" 2>/dev/null || echo 000; }
back_code=$(code_of "${BACK_PROD}/version/get_version")   # 200 = 정상 기동(인증 불필요 라우트)
front_code=$(code_of "${FRONT_PROD}/")
ver_json=$(curl -s --max-time 12 "${BACK_PROD}/version/get_version" 2>/dev/null || echo '')
live_ios_guide=$(echo "${ver_json}" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['app_ios_version'])" 2>/dev/null || echo '?')
live_and_guide=$(echo "${ver_json}" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['app_android_version'])" 2>/dev/null || echo '?')
# 안내값 출처 — store/cache/last_good 이면 자동 조회가 동작 중, fallback 이면 스토어 조회가 막힌 것.
guide_src=$(echo "${ver_json}" | python3 -c "import sys,json;s=json.load(sys.stdin)['data'].get('app_version_source') or {};print(f\"ios={s.get('ios','?')} android={s.get('android','?')}\")" 2>/dev/null || echo '없음(구버전 back)')
# 프론트 빌드 지문 — 배포되면 값이 바뀌고, 열려 있던 탭은 이걸 보고 스스로 갱신한다.
front_build=$(curl -s --max-time 12 "${FRONT_PROD}/version.json?_cb=$(date +%s)" 2>/dev/null \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('build','?'))" 2>/dev/null || echo '없음')

# 스토어 실게시 버전.
# ⚠ 캐시버스터(_cb) 필수 — plain URL 은 iTunes CDN 이 낡은 값을 무기한 고정한다(CodingPT 에서 실측·재현).
store_ios=$(curl -s --max-time 12 "https://itunes.apple.com/lookup?id=${IOS_APP_ID}&country=kr&_cb=$(date +%s)" 2>/dev/null \
  | python3 -c "import sys,json;r=json.load(sys.stdin).get('results') or [];print(r[0]['version'] if r else '미게시')" 2>/dev/null || echo '?')
# Play 는 공식 공개 조회 API 가 없어 상세 페이지 내장 데이터에서 읽는다(부서지기 쉬운 보조 경로 —
#  실패하면 '?' 로 두고 판단을 보류한다. 정확한 값은 `scripts/store/play.mjs status`).
store_and=$(curl -s --max-time 12 -A "Mozilla/5.0" "https://play.google.com/store/apps/details?id=${ANDROID_PKG}&hl=ko&_cb=$(date +%s)" 2>/dev/null \
  | grep -oE '"141":\[\[\["[0-9.]+"\]\]' | grep -oE '[0-9]+(\.[0-9]+)+' | head -1)
store_and="${store_and:-?}"

read -r app_dirty app_unpushed app_branch <<<"$(repo_state "${APP}")"
read -r svc_dirty svc_unpushed svc_branch <<<"$(repo_state "${SVC_ROOT}")"

if [ "${JSON}" = 1 ]; then
  python3 - "${app_dirty}" "${app_unpushed}" "${svc_dirty}" "${svc_unpushed}" \
    "${and_name}" "${and_code}" "${ios_ver}" "${ios_build}" "${store_ios}" "${store_and}" \
    "${repo_ios_guide}" "${repo_and_guide}" "${live_ios_guide}" "${live_and_guide}" \
    "${back_code}" "${front_code}" <<'PY'
import json,sys
a=sys.argv[1:]
print(json.dumps({
 "repos":{"app":{"dirty":int(a[0]),"unpushed":int(a[1])},
          "service":{"dirty":int(a[2]),"unpushed":int(a[3])}},
 "android":{"versionName":a[4],"versionCode":a[5],"store":a[9]},
 "ios":{"marketing":a[6],"build":a[7],"store":a[8]},
 "guide":{"repo":{"ios":a[10],"android":a[11]},"live":{"ios":a[12],"android":a[13]}},
 "live":{"backCode":a[14],"frontCode":a[15]},
},ensure_ascii=False,indent=2))
PY
  exit 0
fi

hdr "리포 상태"
printf "  app      %-22s 미커밋 %s · 미푸시 %s\n" "${app_branch}" "${app_dirty}" "${app_unpushed}"
printf "  service  %-22s 미커밋 %s · 미푸시 %s\n" "${svc_branch}" "${svc_dirty}" "${svc_unpushed}"

hdr "버전 (리포 → 스토어)"
printf "  Android   %s (code %s) → 스토어 %s\n" "${and_name}" "${and_code}" "${store_and}"
printf "  iOS       %s (build %s) → 스토어 %s\n" "${ios_ver}" "${ios_build}" "${store_ios}"
printf "  안내값     live ios=%s android=%s   출처 %s\n" "${live_ios_guide}" "${live_and_guide}" "${guide_src}"
printf "             (폴백 상수 ios=%s android=%s — 스토어 조회가 막혔을 때만 쓰임)\n" "${repo_ios_guide}" "${repo_and_guide}"
printf "  프론트빌드 %s\n" "${front_build}"

hdr "라이브 상태"
printf "  back  %s %s\n" "${back_code}" "$([ "${back_code}" = 200 ] && echo '(정상)' || echo '⚠ 200 이 아님')"
printf "  front %s %s\n" "${front_code}" "$([ "${front_code}" = 200 ] && echo '(정상)' || echo '⚠ 200 이 아님')"

hdr "해야 할 일"
todo=0
note() { todo=$((todo+1)); printf "  %d) %s\n" "${todo}" "$*"; }
[ "${app_dirty:-0}" != 0 ] && note "app 미커밋 ${app_dirty} 건"
[ "${svc_dirty:-0}" != 0 ] && note "service 미커밋 ${svc_dirty} 건 — deploy.sh 는 서버에서 git pull 이라 커밋/푸시 선행 필수"
[ "${app_unpushed:-0}" != 0 ] && note "app 미푸시 ${app_unpushed} 건"
[ "${svc_unpushed:-0}" != 0 ] && note "service 미푸시 ${svc_unpushed} 건 — \`git push origin ${svc_branch}:main\`"
[ "${store_ios}" != "${ios_ver}" ] && [ "${store_ios}" != "?" ] \
  && note "iOS ${ios_ver} 미게시(스토어=${store_ios}) — 빌드/업로드/제출 필요 (scripts/store/asc.mjs)"
[ "${store_and}" != "${and_name}" ] && [ "${store_and}" != "?" ] \
  && note "Android ${and_name} 미게시(스토어=${store_and}) — 빌드/업로드/제출 필요 (scripts/store/play.mjs)"
# 안내값은 스토어 실조회로 자동으로 맞는다 → 게시본과 다르면 **손으로 고칠 게 아니라** 조회가 막힌 것이다.
[ "${store_ios}" != "?" ] && [ "${live_ios_guide}" != "?" ] && [ "${live_ios_guide}" != "${store_ios}" ] \
  && note "안내값 ios=${live_ios_guide} ≠ 게시본 ${store_ios} — 스토어 조회 실패 또는 back 미배포(출처: ${guide_src})"
[ "${store_and}" != "?" ] && [ "${live_and_guide}" != "?" ] && [ "${live_and_guide}" != "${store_and}" ] \
  && note "안내값 android=${live_and_guide} ≠ 게시본 ${store_and} — 스토어 조회 실패 또는 back 미배포(출처: ${guide_src})"
case "${guide_src}" in
  *fallback*) note "안내값이 폴백 상수로 나가는 중 — 서버에서 스토어 조회가 막혔는지 확인" ;;
esac
[ "${front_build}" = "없음" ] \
  && note "프론트에 /version.json 이 없음 — 구버전 프론트가 떠 있다(배포 후 열린 탭이 자동 갱신되지 않음)"
[ "${todo}" = 0 ] && echo "  없음 — 전부 최신"
echo
