"""Schema drift 검증 — 모델 정의와 실제 DB 스키마가 일치하는지 확인.

SQLAlchemy 1.4 + MySQL 8 조합에서 alembic.compare_metadata는 FK reflection 버그
(KeyError 'TABLENAME')를 트리거하므로, FK를 건드리지 않는 inspect.get_columns() 기반으로
핵심 정보만 비교한다.

검증 항목:
- 테이블 추가/삭제
- 컬럼 추가/삭제
- ENUM 값 추가/삭제 (이번 사고 케이스)
- 컬럼 nullable 변경
- 컬럼 base 타입 변경

환경변수 SCHEMA_CHECK_MODE:
- warn (기본): drift 발견 시 WARNING 로그만, exit 0
- strict: drift 발견 시 ERROR + exit 1 (컨테이너 부팅 거부)
- off: 검증 스킵
"""
import os
import re
import sys

from sqlalchemy import MetaData, inspect
from sqlalchemy.dialects import mysql

sys.path.insert(0, '/app')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'heyvoca_back'))
from app import create_app, db  # noqa: E402

_MYSQL_DIALECT = mysql.dialect()


# 환경/툴 차이로 항상 다르게 보이는 false-positive를 등록.
# 진짜 drift는 마이그레이션으로 정리할 것 — 여기는 진짜 무해한 차이만.
IGNORE_PREFIXES = [
]


# 시스템 테이블 (검증 대상 제외)
SYSTEM_TABLES = {'alembic_version', 'dict_meta'}


def compile_type(sqla_type):
    """모델/DB 컬럼 타입을 MySQL dialect 표현으로 컴파일."""
    try:
        return sqla_type.compile(dialect=_MYSQL_DIALECT).upper()
    except Exception:
        return str(sqla_type).upper()


def normalize_type(t):
    """MySQL 동의어/부가정보 정규화. BOOL/TINYINT/TINYINT(1)을 같은 것으로 본다."""
    t = t.strip().upper()
    t = re.sub(r'\s+CHARACTER\s+SET\s+\S+', '', t)
    t = re.sub(r'\s+COLLATE\s+\S+', '', t)
    if t in ('BOOL', 'BOOLEAN', 'TINYINT', 'TINYINT(1)'):
        return 'TINYINT(1)'
    return t


def extract_enum_values(type_str):
    return set(re.findall(r"'([^']*)'", type_str))


def base_type(type_str):
    m = re.match(r'^\s*([A-Z_]+)', type_str)
    return m.group(1) if m else type_str


def check_bind(bind_key, label, metadata):
    engine = db.get_engine(bind=bind_key)
    inspector = inspect(engine)

    db_tables = set(inspector.get_table_names()) - SYSTEM_TABLES
    model_tables = set(metadata.tables.keys()) - SYSTEM_TABLES

    diff = []

    for tbl in sorted(model_tables - db_tables):
        diff.append(f"[ADD TABLE] {tbl} — 모델에 있는데 DB에 없음")
    for tbl in sorted(db_tables - model_tables):
        diff.append(f"[REMOVE TABLE] {tbl} — DB에 있는데 모델에 없음")

    for tbl in sorted(model_tables & db_tables):
        model_cols = {c.name: c for c in metadata.tables[tbl].columns}
        try:
            db_cols_list = inspector.get_columns(tbl)
        except Exception as e:
            diff.append(f"[INSPECT FAILED] {tbl}: {e}")
            continue
        db_cols = {c['name']: c for c in db_cols_list}

        for cname in sorted(set(model_cols) - set(db_cols)):
            mc = model_cols[cname]
            diff.append(f"[ADD COLUMN] {tbl}.{cname} ({mc.type}) — 모델에 있는데 DB에 없음")
        for cname in sorted(set(db_cols) - set(model_cols)):
            diff.append(f"[REMOVE COLUMN] {tbl}.{cname} — DB에 있는데 모델에 없음")

        for cname in sorted(set(model_cols) & set(db_cols)):
            mc = model_cols[cname]
            dc = db_cols[cname]
            mc_type = normalize_type(compile_type(mc.type))
            dc_type = normalize_type(compile_type(dc['type']))
            mc_base = base_type(mc_type)
            dc_base = base_type(dc_type)

            if mc_base == 'ENUM' and dc_base == 'ENUM':
                mv = extract_enum_values(mc_type)
                dv = extract_enum_values(dc_type)
                if mv != dv:
                    parts = []
                    if mv - dv:
                        parts.append(f"모델에만={sorted(mv - dv)}")
                    if dv - mv:
                        parts.append(f"DB에만={sorted(dv - mv)}")
                    diff.append(f"[ENUM MISMATCH] {tbl}.{cname}: " + ", ".join(parts))
            elif mc_type != dc_type:
                diff.append(f"[TYPE MISMATCH] {tbl}.{cname}: 모델={mc_type}, DB={dc_type}")

            mc_null = bool(mc.nullable)
            dc_null = bool(dc.get('nullable', True))
            if mc_null != dc_null:
                diff.append(
                    f"[NULLABLE MISMATCH] {tbl}.{cname}: 모델={mc_null}, DB={dc_null}"
                )

    diff = [d for d in diff if not any(d.startswith(p) for p in IGNORE_PREFIXES)]

    if not diff:
        print(f"[SCHEMA OK] {label}")
        return []

    print(f"[SCHEMA DRIFT] {label} — 차이 {len(diff)}건:")
    for line in diff:
        print(f"  - {line}")
    return diff


def main():
    mode = os.getenv('SCHEMA_CHECK_MODE', 'warn').lower()
    if mode == 'off':
        print('[SCHEMA CHECK] SCHEMA_CHECK_MODE=off → skip')
        return 0

    app = create_app()
    with app.app_context():
        # bind별로 모델 테이블 분리
        user_meta = MetaData()
        dict_meta = MetaData()
        for table in db.metadata.tables.values():
            bind_key = table.info.get('bind_key')
            if bind_key == 'dict':
                table.tometadata(dict_meta)
            else:
                table.tometadata(user_meta)

        all_diff = []
        all_diff += check_bind(None, 'heyvoca_user', user_meta)
        try:
            all_diff += check_bind('dict', 'heyvoca_dict', dict_meta)
        except Exception as e:
            print(f"[SCHEMA CHECK] dict bind 검증 실패 (무시 가능): {e}")

    if not all_diff:
        return 0

    if mode == 'strict':
        print('\n[SCHEMA CHECK] strict 모드 → 부팅 거부. '
              '마이그레이션을 작성/적용하거나 IGNORE_PREFIXES에 추가하세요.')
        return 1
    print('\n[SCHEMA CHECK] warn 모드 → 부팅 계속. '
          'SCHEMA_CHECK_MODE=strict 로 활성화하면 부팅 거부.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
