"""사전 DB(heyvoca_dict) 전용 Alembic env.

기본 migrations/env.py와 두 가지가 다름:
1. target_metadata가 metadatas['dict'] (사전 모델만 추적)
2. sqlalchemy.url이 SQLALCHEMY_BINDS['dict'] connection 사용

flask db migrate --directory migrations_dict 와 같이 directory 옵션을
명시해야 이 env.py가 동작.
"""
import logging
from logging.config import fileConfig

from flask import current_app

from alembic import context

config = context.config
fileConfig(config.config_file_name)
logger = logging.getLogger('alembic.env')

DICT_BIND = 'dict'


def get_engine():
    """dict bind의 engine 반환 (default가 아닌 사전 DB connection)."""
    db = current_app.extensions['migrate'].db
    try:
        # Flask-SQLAlchemy < 3
        return db.get_engine(bind=DICT_BIND)
    except (TypeError, AttributeError):
        # Flask-SQLAlchemy >= 3: bind를 통해 engine 가져옴
        return db.engines[DICT_BIND]


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
        if table.info.get('bind_key') == DICT_BIND:
            table.tometadata(dict_md)
    return dict_md


def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url, target_metadata=get_metadata(), literal_binds=True
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
