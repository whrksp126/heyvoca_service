#!/bin/bash
# 1회성 이행 스크립트: 단일 heyvoca schema → heyvoca_user + heyvoca_dict 분리
#
# 사용법:
#   bash scripts/migrate_to_split.sh local
#   bash scripts/migrate_to_split.sh dev
#   bash scripts/migrate_to_split.sh stg
#   bash scripts/migrate_to_split.sh prod
#
# 안전장치:
#   1. 시작 전 풀백업을 /tmp/heyvoca_pre_split_<env>_<timestamp>.sql에 자동 생성
#   2. 기존 heyvoca schema는 DROP 하지 않음 (이행 후 일정 기간 유지)
#   3. 사용자/사전 테이블 row 수 비교 검증
#
# 멱등성:
#   heyvoca_user, heyvoca_dict가 이미 채워져 있으면 sanity check만 하고 종료.

set -e

ENV="${1:-local}"
case "$ENV" in
    local) MYSQL_CONTAINER="heyvoca_mysql_local"; BACK_CONTAINER="heyvoca_back_local"; ROOT_PW="rootpassword" ;;
    dev)   MYSQL_CONTAINER="heyvoca_mysql_dev";   BACK_CONTAINER="heyvoca_back_dev";   ROOT_PW="${MYSQL_ROOT_PASSWORD:-}" ;;
    stg)   MYSQL_CONTAINER="heyvoca_mysql_stg";   BACK_CONTAINER="heyvoca_back_stg";   ROOT_PW="${MYSQL_ROOT_PASSWORD:-}" ;;
    prod)  MYSQL_CONTAINER="heyvoca_mysql_prod";  BACK_CONTAINER="heyvoca_back_prod";  ROOT_PW="${MYSQL_ROOT_PASSWORD:-}" ;;
    *)     echo "Usage: $0 {local|dev|stg|prod}"; exit 1 ;;
esac

if [ -z "$ROOT_PW" ]; then
    echo "ERROR: MYSQL_ROOT_PASSWORD 환경변수 필요 (env=$ENV)"
    exit 1
fi

TS=$(date -u +%Y%m%d_%H%M%S)
BACKUP_FILE="/tmp/heyvoca_pre_split_${ENV}_${TS}.sql"

# zsh history expansion 회피용 (root 비번에 ! 포함 시)
MYSQL_EXEC="docker exec $MYSQL_CONTAINER bash -c"
MYSQL_CMD='mysql -u root -p"'$ROOT_PW'"'
DUMP_CMD='mysqldump --no-tablespaces --single-transaction --skip-lock-tables -u root -p"'$ROOT_PW'"'

USER_TABLES=(
    level user user_has_token invite_map
    check_in user_recent_study
    goal_type goals user_goals
    product purchase gem_log
    user_voca_book user_voca user_voca_book_map
)
DICT_TABLES=(
    voca_book admin_voca_book voca voca_meaning voca_example daily_sentence
    voca_book_map voca_meaning_map voca_example_map admin_voca_book_map
    bookstore
)

echo "============================================================"
echo " heyvoca DB 분리 이행 ($ENV)"
echo "============================================================"

# 1. 사전 검증
echo "[1/7] 기존 heyvoca schema 존재 확인"
HAS_LEGACY=$($MYSQL_EXEC "$MYSQL_CMD -N -s -e \"SHOW DATABASES LIKE 'heyvoca';\"" 2>/dev/null || echo "")
if [ -z "$HAS_LEGACY" ]; then
    echo "  → heyvoca schema 없음. 이행 불필요 (이미 분리됨 또는 첫 셋업)."
    exit 0
fi
echo "  → heyvoca schema 존재. 이행 진행."

# 2. 백업
echo "[2/7] 풀백업 생성: $BACKUP_FILE"
$MYSQL_EXEC "$DUMP_CMD --databases heyvoca" > "$BACKUP_FILE"
SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "  → 백업 완료 ($SIZE)"

# 3. heyvoca_user, heyvoca_dict 존재 확인
echo "[3/7] 두 schema 존재 확인"
$MYSQL_EXEC "$MYSQL_CMD -e \"
CREATE DATABASE IF NOT EXISTS heyvoca_user CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS heyvoca_dict CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
\""
echo "  → heyvoca_user, heyvoca_dict 준비"

# 4. 멱등성 체크: 이미 사용자 테이블 일부가 있으면 skip
USER_COUNT=$($MYSQL_EXEC "$MYSQL_CMD -N -s -e \"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='heyvoca_user';\"")
if [ "$USER_COUNT" -gt 0 ]; then
    echo "[4/7] heyvoca_user에 이미 테이블 $USER_COUNT개 존재 → 데이터 복사 skip"
    SKIP_COPY=1
else
    SKIP_COPY=0
fi

if [ "$SKIP_COPY" -eq 0 ]; then
    # 5. 사용자 테이블 13개 복사 (FK 검사 끄고)
    echo "[4/7] 사용자 13개 테이블 → heyvoca_user 복사"
    for t in "${USER_TABLES[@]}"; do
        EXISTS=$($MYSQL_EXEC "$MYSQL_CMD -N -s -e \"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='heyvoca' AND table_name='$t';\"")
        if [ "$EXISTS" -eq 0 ]; then
            echo "    [skip] heyvoca.$t 테이블 없음"
            continue
        fi
        echo "    - $t"
        $MYSQL_EXEC "$MYSQL_CMD -e \"
SET FOREIGN_KEY_CHECKS=0;
CREATE TABLE heyvoca_user.\\\`$t\\\` LIKE heyvoca.\\\`$t\\\`;
INSERT INTO heyvoca_user.\\\`$t\\\` SELECT * FROM heyvoca.\\\`$t\\\`;
SET FOREIGN_KEY_CHECKS=1;
\""
    done

    # 6. 사전 테이블 11개 복사
    echo "[5/7] 사전 11개 테이블 → heyvoca_dict 복사"
    for t in "${DICT_TABLES[@]}"; do
        EXISTS=$($MYSQL_EXEC "$MYSQL_CMD -N -s -e \"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='heyvoca' AND table_name='$t';\"")
        if [ "$EXISTS" -eq 0 ]; then
            echo "    [skip] heyvoca.$t 테이블 없음"
            continue
        fi
        echo "    - $t"
        $MYSQL_EXEC "$MYSQL_CMD -e \"
SET FOREIGN_KEY_CHECKS=0;
CREATE TABLE heyvoca_dict.\\\`$t\\\` LIKE heyvoca.\\\`$t\\\`;
INSERT INTO heyvoca_dict.\\\`$t\\\` SELECT * FROM heyvoca.\\\`$t\\\`;
SET FOREIGN_KEY_CHECKS=1;
\""
    done

    # 7. dict_meta 신규 테이블 (사전 schema에 추가)
    echo "[6/7] dict_meta 테이블 생성"
    $MYSQL_EXEC "$MYSQL_CMD -e \"
CREATE TABLE IF NOT EXISTS heyvoca_dict.dict_meta (
    \\\`key\\\` VARCHAR(64) PRIMARY KEY,
    value VARCHAR(255),
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4;
\""
else
    echo "[5/7] (skip)"
    echo "[6/7] (skip)"
fi

# 8. flask db stamp head (양 디렉토리)
echo "[7/7] flask db stamp head (양 마이그레이션 디렉토리)"
docker exec "$BACK_CONTAINER" flask db stamp head || echo "  → 사용자 stamp 실패 (다음 entrypoint에서 자동 처리됨)"
docker exec "$BACK_CONTAINER" flask db stamp head --directory migrations_dict || echo "  → 사전 stamp 실패 (migrations_dict 첫 마이그레이션 미생성 상태일 수 있음)"

# 검증
echo ""
echo "============================================================"
echo " 검증: row 수 비교 (heyvoca → heyvoca_user, heyvoca_dict)"
echo "============================================================"
for t in "${USER_TABLES[@]}"; do
    OLD=$($MYSQL_EXEC "$MYSQL_CMD -N -s -e \"SELECT COUNT(*) FROM heyvoca.\\\`$t\\\`;\"" 2>/dev/null || echo "0")
    NEW=$($MYSQL_EXEC "$MYSQL_CMD -N -s -e \"SELECT COUNT(*) FROM heyvoca_user.\\\`$t\\\`;\"" 2>/dev/null || echo "0")
    if [ "$OLD" = "$NEW" ]; then
        printf "  [OK]  user.%-25s old=%s new=%s\n" "$t" "$OLD" "$NEW"
    else
        printf "  [DIFF] user.%-25s old=%s new=%s\n" "$t" "$OLD" "$NEW"
    fi
done
for t in "${DICT_TABLES[@]}"; do
    OLD=$($MYSQL_EXEC "$MYSQL_CMD -N -s -e \"SELECT COUNT(*) FROM heyvoca.\\\`$t\\\`;\"" 2>/dev/null || echo "0")
    NEW=$($MYSQL_EXEC "$MYSQL_CMD -N -s -e \"SELECT COUNT(*) FROM heyvoca_dict.\\\`$t\\\`;\"" 2>/dev/null || echo "0")
    if [ "$OLD" = "$NEW" ]; then
        printf "  [OK]  dict.%-25s old=%s new=%s\n" "$t" "$OLD" "$NEW"
    else
        printf "  [DIFF] dict.%-25s old=%s new=%s\n" "$t" "$OLD" "$NEW"
    fi
done

echo ""
echo "============================================================"
echo " 이행 완료. 다음 단계:"
echo "  1. docker restart $BACK_CONTAINER"
echo "  2. 회귀 테스트 (회원가입/검색/단어장 구매)"
echo "  3. 기존 heyvoca schema는 1주일 후 별도 스크립트로 DROP"
echo ""
echo " 백업 위치: $BACKUP_FILE"
echo "============================================================"
