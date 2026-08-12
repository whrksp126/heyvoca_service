#!/usr/bin/env bash
#
# Sign in with Apple 의 revoke(연동 해제)용 env 를 서버 .env 에 주입한다.
#
# 왜 필요한가:
#   Apple 은 계정 삭제 기능에 "Apple 로그인 연동 해제"를 요구한다. 백엔드의
#   _generate_apple_signin_client_secret() 는 아래 3개 env 가 하나라도 없으면 None 을
#   반환하고, 그러면 authorizationCode 교환도 revoke 도 조용히 skip 된다.
#   (2026-08 기준 prod/dev/stg 모두 미설정이라 apple_refresh_token 이 한 건도 없었다.)
#
#     APPLE_TEAM_ID             — Apple Developer Team ID
#     APPLE_SIGNIN_KEY_ID       — Sign in with Apple 용 Key 의 Key ID
#     APPLE_SIGNIN_PRIVATE_KEY  — 그 Key 의 .p8 내용 (개행을 \n 로 이스케이프해 한 줄로)
#
#   주의: APPLE_APP_STORE_CONNECT_* 는 인앱결제(App Store Connect API)용 키라 다른 키다.
#         재사용하면 안 된다.
#
# 키 발급:
#   developer.apple.com → Certificates, Identifiers & Profiles → Keys → (+)
#   → "Sign in with Apple" 체크 → Primary App ID = com.ghmate.heyvoca 선택
#   → Continue → Register → .p8 다운로드 (재다운로드 불가, 1회성)
#
# 사용:
#   bash scripts/setup-apple-signin-env.sh prod ~/Downloads/AuthKey_ABC1234XYZ.p8
#   bash scripts/setup-apple-signin-env.sh prod ~/Downloads/AuthKey_ABC1234XYZ.p8 ABC1234XYZ
#
#   Key ID 를 생략하면 파일명(AuthKey_<KEYID>.p8)에서 자동 추출한다.
#
# 비밀값은 커맨드라인 인자로 타이핑하지 않는다 — .p8 은 파일째 전송되고,
# 화면/로그에는 어떤 키 내용도 출력하지 않는다.

set -euo pipefail

ENV_NAME="${1:-}"
P8_PATH="${2:-}"
KEY_ID="${3:-}"

TEAM_ID="BB8GGQPRRX"   # heyvoca_app/ios/heyvoca.xcodeproj (DEVELOPMENT_TEAM)

SSH_OPTS="-i $HOME/.ssh/ghmate_server -p 222"
SCP_OPTS="-i $HOME/.ssh/ghmate_server -P 222"   # scp 의 포트 옵션은 -P 다 (-p 는 타임스탬프 보존)
SSH_HOST="ghmate@ghmate.iptime.org"
REMOTE_DIR="/srv/projects/heyvoca/heyvoca_service/heyvoca_back"

usage() {
  echo "사용법: bash scripts/setup-apple-signin-env.sh <dev|stg|prod> <AuthKey_XXX.p8 경로> [KEY_ID]" >&2
  exit 1
}

[ -n "$ENV_NAME" ] && [ -n "$P8_PATH" ] || usage

case "$ENV_NAME" in
  prod) ENV_FILE=".env";      COMPOSE="docker-compose.yml";      PROJECT="heyvoca_prod" ;;
  dev)  ENV_FILE=".env.dev";  COMPOSE="docker-compose.dev.yml";  PROJECT="heyvoca_dev"  ;;
  stg)  ENV_FILE=".env.stg";  COMPOSE="docker-compose.stg.yml";  PROJECT="heyvoca_stg"  ;;
  *)    usage ;;
esac

if [ "$ENV_NAME" != "prod" ]; then
  cat >&2 <<'WARN'
!!! 주의: dev/stg 도 prod 와 같은 client_id(com.ghmate.heyvoca)를 쓴다.
    Apple 은 환경을 구분하지 않으므로, dev/stg 에서 탈퇴 테스트를 하면
    그 Apple 계정과 "앱" 자체의 연동이 실제로 해제된다(prod 포함).
    본인/테스트 전용 Apple 계정으로만 탈퇴를 시험할 것.

WARN
fi

[ -f "$P8_PATH" ] || { echo "오류: .p8 파일을 찾을 수 없습니다: $P8_PATH" >&2; exit 1; }
grep -q "BEGIN PRIVATE KEY" "$P8_PATH" || {
  echo "오류: PKCS#8 개인키 파일이 아닌 것 같습니다 (BEGIN PRIVATE KEY 없음): $P8_PATH" >&2; exit 1; }

if [ -z "$KEY_ID" ]; then
  KEY_ID="$(basename "$P8_PATH" .p8)"; KEY_ID="${KEY_ID#AuthKey_}"
fi
[[ "$KEY_ID" =~ ^[A-Z0-9]{10}$ ]] || {
  echo "오류: Key ID 형식이 이상합니다 ('$KEY_ID'). 10자리 영대문자+숫자여야 합니다." >&2
  echo "      세 번째 인자로 직접 넘겨주세요." >&2; exit 1; }

echo ">>> 대상 환경 : $ENV_NAME ($ENV_FILE)"
echo ">>> Team ID   : $TEAM_ID"
echo ">>> Key ID    : $KEY_ID"
echo ">>> .p8       : $P8_PATH (내용은 출력하지 않음)"
echo

BLOCK="$(mktemp)"; trap 'rm -f "$BLOCK"' EXIT
{
  echo "APPLE_TEAM_ID=$TEAM_ID"
  echo "APPLE_SIGNIN_KEY_ID=$KEY_ID"
  # .p8 개행을 \n 리터럴로 접어 한 줄로 만든다. 백엔드가 .replace('\\n','\n') 로 되돌린다.
  printf 'APPLE_SIGNIN_PRIVATE_KEY=%s\n' "$(awk '{printf "%s\\n", $0}' "$P8_PATH")"
} > "$BLOCK"

echo ">>> 서버로 전송 후 $ENV_FILE 갱신 (기존 파일은 자동 백업)..."
scp $SCP_OPTS -q "$BLOCK" "$SSH_HOST:/tmp/apple_signin_block"

ssh $SSH_OPTS "$SSH_HOST" bash -s <<REMOTE
set -euo pipefail
cd "$REMOTE_DIR"

BAK="$ENV_FILE.bak.\$(date +%s)"
cp "$ENV_FILE" "\$BAK"
# .env 백업은 개인키를 통째로 담게 되므로 소유자 외 읽기를 막는다.
chmod 600 "\$BAK"

# 기존 키 제거 후 새 블록 append (중복 정의 방지)
sed -i '/^APPLE_TEAM_ID=/d;/^APPLE_SIGNIN_KEY_ID=/d;/^APPLE_SIGNIN_PRIVATE_KEY=/d' "$ENV_FILE"
[ -s "$ENV_FILE" ] && [ "\$(tail -c1 "$ENV_FILE")" != "" ] && echo >> "$ENV_FILE"
cat /tmp/apple_signin_block >> "$ENV_FILE"
shred -u /tmp/apple_signin_block 2>/dev/null || rm -f /tmp/apple_signin_block

# 개인키가 들어간 .env 는 664(그룹/타 사용자 읽기 가능)로 두면 안 된다.
chmod 600 "$ENV_FILE"

# 과거에 만들어진 .env 백업들도 같은 이유로 조인다(이미 시크릿을 담고 있다).
chmod 600 "$ENV_FILE".bak.* 2>/dev/null || true

echo ">>> $ENV_FILE 갱신 완료 (백업: \$BAK, 둘 다 0600)"
ls -l "$ENV_FILE" "\$BAK" | awk '{print "    " \$1, \$3":"\$4, \$NF}'
REMOTE

echo
echo ">>> 컨테이너 재생성 (env_file 은 restart 로 반영되지 않음)..."
ssh $SSH_OPTS "$SSH_HOST" \
  "cd /srv/projects/heyvoca/heyvoca_service && docker compose -p $PROJECT -f $COMPOSE up -d --force-recreate back"

echo
echo ">>> 검증 (값은 출력하지 않고 설정 여부만)..."
ssh $SSH_OPTS "$SSH_HOST" \
  "docker exec heyvoca_back_$ENV_NAME bash -c 'for v in APPLE_TEAM_ID APPLE_SIGNIN_KEY_ID APPLE_SIGNIN_PRIVATE_KEY APPLE_CLIENT_ID; do printf \"%-28s %s\n\" \"\\\$v\" \"\\\$([ -n \"\\\${!v}\" ] && echo SET || echo MISSING)\"; done'"

cat <<'DONE'

다음 확인:
  1) iOS 앱에서 Apple 로그인을 한 번 새로 수행 (기존 계정은 재인증 필요)
  2) 아래로 refresh_token 이 저장됐는지 확인
     ssh -i ~/.ssh/ghmate_server -p 222 ghmate@ghmate.iptime.org \
       'docker exec heyvoca_mysql_prod bash -c "mysql -u root -p\$MYSQL_ROOT_PASSWORD -N -e \
        \"SELECT COUNT(*) FROM user WHERE apple_refresh_token IS NOT NULL\" heyvoca_user"'
  3) 0 이 아니면 정상 — 이후 탈퇴 시 revoke 가 실제로 호출된다.

주의: .env* 는 git 대상이 아니다. deploy.sh 는 .env 를 전송하지 않으므로
      환경마다 이 스크립트를 따로 돌려야 한다.
DONE
