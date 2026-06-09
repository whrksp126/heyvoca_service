#!/usr/bin/env python3
"""빈 heyvoca_user 스키마를 로컬 개발용으로 부트스트랩한다.

배경:
  현재 사용자 DB의 첫 Alembic 마이그레이션은 "레거시 테이블이 이미 존재하는 DB"를
  전제로 작성되어 있어, 완전히 빈 로컬 DB에서는 시작 단계의 drop/alter에서 실패한다.

동작:
  - user DB(default bind)를 inspect
  - alembic_version이 없고, 사용자 테이블도 하나도 없으면
    모델 기준 create_all 후 alembic stamp head
  - 그 외에는 아무 것도 하지 않고 종료
"""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import MetaData, inspect

from app import create_app, db


PROJECT_ROOT = Path(__file__).resolve().parent.parent
ALEMBIC_INI = PROJECT_ROOT / "migrations" / "alembic.ini"


def _get_user_metadata():
    if hasattr(db, "metadatas"):
        return db.metadatas[None]

    user_md = MetaData()
    for table in db.metadata.tables.values():
        if table.info.get("bind_key") is None:
            table.tometadata(user_md)
    return user_md


def main() -> int:
    app = create_app()

    with app.app_context():
        engine = db.get_engine()
        inspector = inspect(engine)
        existing_tables = set(inspector.get_table_names())

        user_metadata = _get_user_metadata()
        managed_tables = set(user_metadata.tables.keys())
        existing_managed_tables = existing_tables.intersection(managed_tables)

        has_alembic_version = "alembic_version" in existing_tables
        is_empty_user_schema = not existing_managed_tables

        if has_alembic_version or not is_empty_user_schema:
            print(">>> bootstrap_user_db: skip (existing schema detected)")
            return 0

        print(">>> bootstrap_user_db: empty user schema detected → create_all + stamp head")
        user_metadata.create_all(bind=engine)

        alembic_cfg = Config(str(ALEMBIC_INI))
        alembic_cfg.set_main_option("script_location", str(PROJECT_ROOT / "migrations"))
        command.stamp(alembic_cfg, "head")

        print(">>> bootstrap_user_db: complete")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
