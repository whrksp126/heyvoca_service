"""사전 DB(heyvoca_dict) 전용 Alembic env.

기본 migrations/env.py와 두 가지가 다름:
1. target_metadata가 metadatas['dict'] (사전 모델만 추적)
2. sqlalchemy.url이 SQLALCHEMY_BINDS['dict'] connection 사용

flask db migrate --directory migrations_dict 와 같이 directory 옵션을
명시해야 이 env.py가 동작.

일본어 사전(heyvoca_dict_ja):
- 환경변수 DICT_BIND_LANG=ja 이면 같은 서버·계정의 DICT_SCHEMA_JA(기본 heyvoca_dict_ja)
  schema 에 붙어 upgrade 한다. 공통 16테이블 구조가 영한과 같으므로 같은 리비전을 적용.
  (schema_translate_map 엔진 대신 URL 의 database 만 바꾼 전용 엔진을 쓴다 — 리비전 안의
   op.execute() 원시 SQL 과 inspector 조회까지 ja schema 로 가야 하기 때문.)
- info['ja_only'] 테이블(voca_ja 등, alembic 비관리)은 metadata·autogenerate 비교에서 제외.
  ja schema 에 대고 autogenerate 해도 확장 테이블 DROP 이 생기지 않는다.
"""
import os
import logging
from logging.config import fileConfig

from flask import current_app

from alembic import context

config = context.config
fileConfig(config.config_file_name)
logger = logging.getLogger('alembic.env')

DICT_BIND = 'dict'
DICT_BIND_LANG = (os.getenv('DICT_BIND_LANG') or 'en').strip().lower()
_JA_ENGINE = None


def get_engine():
    """dict bind의 engine 반환 (default가 아닌 사전 DB connection)."""
    db = current_app.extensions['migrate'].db
    try:
        # Flask-SQLAlchemy < 3
        engine = db.get_engine(bind=DICT_BIND)
    except (TypeError, AttributeError):
        # Flask-SQLAlchemy >= 3: bind를 통해 engine 가져옴
        engine = db.engines[DICT_BIND]
    if DICT_BIND_LANG == 'ja':
        return _get_ja_engine(engine)
    if DICT_BIND_LANG != 'en':
        raise RuntimeError(f"지원하지 않는 DICT_BIND_LANG={DICT_BIND_LANG!r} (en|ja)")
    return engine


def _get_ja_engine(dict_engine):
    """dict 엔진과 같은 서버·계정, database 만 DICT_SCHEMA_JA 로 바꾼 엔진."""
    global _JA_ENGINE
    if _JA_ENGINE is None:
        from sqlalchemy import create_engine
        from sqlalchemy.pool import NullPool
        schema_ja = current_app.config.get('DICT_SCHEMA_JA', 'heyvoca_dict_ja')
        _JA_ENGINE = create_engine(dict_engine.url.set(database=schema_ja), poolclass=NullPool)
        logger.info('DICT_BIND_LANG=ja → schema %s', schema_ja)
    return _JA_ENGINE


def get_engine_url():
    try:
        return get_engine().url.render_as_string(hide_password=False).replace(
            '%', '%%')
    except AttributeError:
        return str(get_engine().url).replace('%', '%%')


config.set_main_option('sqlalchemy.url', get_engine_url())
target_db = current_app.extensions['migrate'].db


def get_metadata():
    """사전 모델(__bind_key__='dict')의 metadata만 반환.

    Flask-SQLAlchemy 2.x는 모든 모델이 db.metadata 한곳에 등록되므로
    bind_key로 직접 필터링해서 새 MetaData에 복사해야 한다.
    Flask-SQLAlchemy 3.x에서는 db.metadatas가 자동 분리됨.
    """
    if hasattr(target_db, 'metadatas'):
        return target_db.metadatas[DICT_BIND]

    from sqlalchemy import MetaData
    dict_md = MetaData()
    for table in target_db.metadata.tables.values():
        if table.info.get('bind_key') == DICT_BIND and not table.info.get('ja_only'):
            table.tometadata(dict_md)
    return dict_md


def _ja_only_table_names():
    return {t.name for t in target_db.metadata.tables.values() if t.info.get('ja_only')}


def include_object(obj, name, type_, reflected, compare_to):
    """ja_only 확장 테이블(모델 쪽이든 DB 에서 reflect 된 쪽이든)은 비교에서 제외."""
    if type_ == 'table' and name in _ja_only_table_names():
        return False
    table = getattr(obj, 'table', None)
    if table is not None and getattr(table, 'name', None) in _ja_only_table_names():
        return False
    return True


def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url, target_metadata=get_metadata(), literal_binds=True,
        include_object=include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    def process_revision_directives(context, revision, directives):
        if getattr(config.cmd_opts, 'autogenerate', False):
            script = directives[0]
            if script.upgrade_ops.is_empty():
                directives[:] = []
                logger.info('No changes in schema detected.')

    conf_args = current_app.extensions['migrate'].configure_args
    if conf_args.get("process_revision_directives") is None:
        conf_args["process_revision_directives"] = process_revision_directives
    if conf_args.get("include_object") is None:
        conf_args["include_object"] = include_object

    connectable = get_engine()

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=get_metadata(),
            **conf_args
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
