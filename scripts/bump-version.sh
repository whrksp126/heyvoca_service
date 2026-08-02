#!/usr/bin/env bash
# bump-version.sh — 앱 버전을 **한 군데도 빠뜨리지 않고** 올린다.
#
# 왜 스크립트인가: 헤이보카의 앱 버전은 5곳에 흩어져 있고, 하나만 빠뜨리면 스토어가 거부하거나
# (같은 build/versionCode) 사용자에게 엉뚱한 버전이 표시된다. 손으로 하면 반드시 샌다.
#
#   ① android/app/build.gradle       versionName  (마케팅 버전)
#   ② android/app/build.gradle       versionCode  (정수, 매 업로드마다 +1)
#   ③ ios/heyvoca.xcodeproj/project.pbxproj  MARKETING_VERSION       (Debug/Release 두 벌)
#   ④ ios/heyvoca.xcodeproj/project.pbxproj  CURRENT_PROJECT_VERSION (Debug/Release 두 벌)
#   ⑤ package.json  version  — 런타임에는 안 쓰이지만(앱 화면은 DeviceInfo=네이티브 값),
#                              방치하면 사람이 오독하므로 같이 맞춘다.
#
# ⚠ 변수 뒤에 한글/화살표 같은 멀티바이트가 붙으면 bash 가 변수명으로 읽는다($build→ → "build→:
#   unbound variable"). 이 스크립트의 모든 확장은 ${} 로 감싼다 — CodingPT 에서 이걸 안 감싸 실패했고,
#   sed 는 이미 실행된 뒤라 **파일만 바뀌고 스크립트는 죽어** 재실행 때 번호가 중복 증가했다(23→26).
#   실패했다면 반드시 `git diff` 로 실제 값을 확인할 것.
#
#   사용: bash heyvoca_service/scripts/bump-version.sh app <새버전>   # 예: app 1.1.1
#         bash heyvoca_service/scripts/bump-version.sh app-build      # 빌드번호만 +1(같은 버전 재업로드)
set -euo pipefail
SVC_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$(cd "${SVC_ROOT}/.." && pwd)"
APP="${ROOT}/heyvoca_app"

GRADLE="${APP}/android/app/build.gradle"
PBX="${APP}/ios/heyvoca.xcodeproj/project.pbxproj"
PKGJSON="${APP}/package.json"
for f in "${GRADLE}" "${PBX}" "${PKGJSON}"; do
  [ -f "${f}" ] || { echo "❌ 파일이 없습니다: ${f}"; exit 1; }
done

target="${1:-}"; newver="${2:-}"
[ -n "${target}" ] || { echo "사용법: bump-version.sh app <새버전>  |  bump-version.sh app-build"; exit 1; }
[ "${target}" = "app-build" ] || [ -n "${newver}" ] || { echo "사용법: bump-version.sh app <새버전>"; exit 1; }
[ "${target}" = "app-build" ] || echo "${newver}" | grep -Eq '^[0-9]+(\.[0-9]+)*$' \
  || { echo "버전 형식이 아닙니다: ${newver}"; exit 1; }

# 버전 비교(내림 방지) — 스토어는 버전이 내려가면 거부한다.
higher() { [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -1)" = "$2" ] && [ "$1" != "$2" ]; }

cur=$(grep -Eo 'versionName +"[^"]+"' "${GRADLE}" | grep -Eo '"[^"]+"' | tr -d '"' | head -1)
code=$(grep -Eo 'versionCode +[0-9]+' "${GRADLE}" | grep -Eo '[0-9]+' | head -1)
build=$(grep -Eo 'CURRENT_PROJECT_VERSION = [0-9]+' "${PBX}" | grep -Eo '[0-9]+' | head -1)
ios_cur=$(grep -Eo 'MARKETING_VERSION = [^;]+' "${PBX}" | head -1 | awk '{print $3}')
[ -n "${cur}" ] && [ -n "${code}" ] && [ -n "${build}" ] && [ -n "${ios_cur}" ] \
  || { echo "❌ 현재 버전을 읽지 못했습니다(파일 형식이 바뀌었는지 확인)"; exit 1; }
# 두 플랫폼이 이미 어긋나 있으면 조용히 덮지 않는다 — 어느 쪽이 맞는지는 사람이 판단할 몫.
[ "${cur}" = "${ios_cur}" ] || { echo "❌ Android(${cur})와 iOS(${ios_cur}) 마케팅 버전이 다릅니다 — 먼저 맞추세요"; exit 1; }

case "${target}" in
  app-build)
    # 마케팅 버전은 그대로 두고 **빌드 번호만** 올린다 — 같은 버전을 다시 업로드해야 할 때
    #  (스토어는 같은 빌드 번호/versionCode 를 거부한다). 예: Info.plist 신고를 고쳐 재업로드.
    nb=$((build + 1)); nc=$((code + 1))
    sed -i '' "s/CURRENT_PROJECT_VERSION = ${build};/CURRENT_PROJECT_VERSION = ${nb};/g" "${PBX}"
    sed -i '' "s/versionCode ${code}/versionCode ${nc}/" "${GRADLE}"
    echo "빌드 번호만 상향 — iOS ${build} → ${nb} · Android ${code} → ${nc} (버전 ${cur} 유지)"
    ;;
  app)
    higher "${cur}" "${newver}" || { echo "❌ ${cur} → ${newver} 는 상향이 아닙니다(스토어가 거부)"; exit 1; }
    nc=$((code + 1)); nb=$((build + 1))
    sed -i '' "s/versionCode ${code}/versionCode ${nc}/; s/versionName \"${cur}\"/versionName \"${newver}\"/" "${GRADLE}"
    # pbxproj 는 Debug/Release 두 벌 — 반드시 전역 치환(g).
    sed -i '' "s/CURRENT_PROJECT_VERSION = ${build};/CURRENT_PROJECT_VERSION = ${nb};/g; s/MARKETING_VERSION = ${cur};/MARKETING_VERSION = ${newver};/g" "${PBX}"
    # package.json 은 **첫 번째 "version" 만** 바꾼다(의존성 블록의 같은 문자열을 건드리면 안 된다).
    #  ⚠ BSD sed(macOS)는 GNU 의 `0,/re/` 범위 주소를 **에러 없이 조용히 무시**한다 — 종료코드 0 인데
    #    파일은 그대로다(실측). 그래서 sed 대신 python3 로 첫 1회만 치환한다.
    python3 - "${PKGJSON}" "${cur}" "${newver}" <<'PY'
import io,sys
p,old,new=sys.argv[1],sys.argv[2],sys.argv[3]
s=io.open(p,encoding='utf-8').read()
needle=f'"version": "{old}"'
if needle not in s: raise SystemExit(f'package.json 에서 {needle} 를 찾지 못했습니다')
io.open(p,'w',encoding='utf-8').write(s.replace(needle, f'"version": "{new}"', 1))
PY
    echo "앱 ${cur}(code ${code} / build ${build}) → ${newver}(code ${nc} / build ${nb})"

    # 빠뜨린 곳이 없는지 되읽어 확인(치환 실패를 조용히 넘기지 않는다).
    ok=1
    grep -q "versionName \"${newver}\"" "${GRADLE}" || { echo "  ❌ gradle versionName 미반영"; ok=0; }
    grep -q "versionCode ${nc}" "${GRADLE}" || { echo "  ❌ gradle versionCode 미반영"; ok=0; }
    [ "$(grep -c "MARKETING_VERSION = ${newver};" "${PBX}")" -ge 2 ] || { echo "  ❌ pbxproj MARKETING_VERSION 2곳 미반영"; ok=0; }
    [ "$(grep -c "CURRENT_PROJECT_VERSION = ${nb};" "${PBX}")" -ge 2 ] || { echo "  ❌ pbxproj CURRENT_PROJECT_VERSION 2곳 미반영"; ok=0; }
    grep -q "\"version\": \"${newver}\"" "${PKGJSON}" || { echo "  ❌ package.json 미반영"; ok=0; }
    [ "${ok}" = 1 ] || { echo "❌ 일부 파일이 안 바뀌었습니다 — git diff 로 실제 값 확인 필요"; exit 1; }

    echo "  다음: 커밋 → 빌드/업로드 → 제출 (자세히는 /release 스킬)"
    echo "        ※ 게시 후 안내값은 백엔드가 스토어를 실조회해 자동 반영한다 — 수기 갱신 불필요"
    ;;
  *) echo "대상은 app | app-build"; exit 1 ;;
esac
