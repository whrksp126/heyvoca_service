"""요청 단위 사전 언어(g.dict_lang) 헬퍼 — INTEGRATION_SPEC 3절.

동작 요약
- `g.dict_lang` 이 'ja' 이면 `__bind_key__='dict'` 모델 쿼리가 전부 heyvoca_dict_ja 로 간다
  (app/__init__.py 의 RoutingSession.get_bind 가 schema_translate_map 엔진을 돌려줌).
- 값 결정 순서
    1) before_request(`init_request_dict_lang`): 유효한 Bearer 토큰이면 user.learning_lang,
       아니면 `?lang=` → 헤더 `X-Dict-Lang` → 'en'.
    2) `jwt_required` 가 인증 확정 직후 user.learning_lang 으로 다시 확정(덮어씀).
- `g` 가 없거나(앱 컨텍스트 밖, 스케줄러 등) 값이 없으면 'en'.

주의: 한 요청(세션) 안에서 두 언어 사전을 섞어 읽지 않는다. voca.id 가 언어별로
겹치므로 identity map 에서 서로 다른 행이 같은 객체로 합쳐진다. 부득이하면
`use_dict_lang()` 블록 전후로 `db.session.expunge_all()` 을 직접 호출할 것.
"""
from contextlib import contextmanager
from uuid import UUID

from flask import g, has_app_context, has_request_context, request, current_app

from config import SUPPORTED_LEARNING_LANGS, DICT_SCHEMA_JA

DEFAULT_LANG = 'en'
DICT_SCHEMA_EN_DEFAULT = 'heyvoca_dict'


def normalize_lang(value, default=None):
    """'ja', ' JA ' → 'ja'. 지원하지 않는 값이면 default 반환."""
    if value is None:
        return default
    v = str(value).strip().lower()
    return v if v in SUPPORTED_LEARNING_LANGS else default


def is_supported_lang(value):
    return normalize_lang(value) is not None


def get_dict_lang():
    """현재 요청의 사전 언어. 앱 컨텍스트 밖이거나 미설정이면 'en'."""
    if not has_app_context():
        return DEFAULT_LANG
    return normalize_lang(g.get('dict_lang'), DEFAULT_LANG)


def set_dict_lang(lang):
    """g.dict_lang 설정. 지원하지 않는 값이면 ValueError."""
    v = normalize_lang(lang)
    if v is None:
        raise ValueError(f'unsupported dict lang: {lang!r}')
    g.dict_lang = v
    return v


@contextmanager
def use_dict_lang(lang):
    """일시적으로 사전 언어를 바꾼다(admin·배치용). 끝나면 원래 값 복원.

    같은 세션에서 이미 다른 언어의 사전 객체를 읽었다면 호출 측에서 expunge 할 것.
    """
    prev = g.get('dict_lang') if has_app_context() else None
    set_dict_lang(lang)
    try:
        yield
    finally:
        if prev is None:
            g.pop('dict_lang', None)
        else:
            g.dict_lang = prev


def dict_schema(lang=None):
    """현재(또는 지정) 언어의 사전 schema 이름 — 원시 SQL 접두어용.

    예) text(f"SELECT ... FROM {dict_schema()}.voca v ...")
    원시 text() 는 mapper 가 없어 사용자 DB 엔진으로 실행되므로 schema 를 반드시 명시한다.
    """
    lang = normalize_lang(lang) or get_dict_lang()
    if lang == 'ja':
        if has_app_context():
            return current_app.config.get('DICT_SCHEMA_JA', DICT_SCHEMA_JA)
        return DICT_SCHEMA_JA
    return _en_dict_schema()


def _en_dict_schema():
    if not has_app_context():
        return DICT_SCHEMA_EN_DEFAULT
    try:
        from app import db
        name = db.get_engine(bind='dict').url.database
        return name or DICT_SCHEMA_EN_DEFAULT
    except Exception:
        return DICT_SCHEMA_EN_DEFAULT


def resolve_request_lang():
    """비인증 요청의 언어: `?lang=` → 헤더 `X-Dict-Lang` → 'en'. 잘못된 값은 무시."""
    if not has_request_context():
        return DEFAULT_LANG
    for raw in (request.args.get('lang'), request.headers.get('X-Dict-Lang')):
        v = normalize_lang(raw)
        if v:
            return v
    return DEFAULT_LANG


def learning_lang_for_user(user_id):
    """user.learning_lang 1컬럼 조회. 없거나 오류면 None."""
    try:
        uid = user_id if isinstance(user_id, UUID) else UUID(str(user_id))
    except (ValueError, TypeError, AttributeError):
        return None
    try:
        from app import db
        from app.models.models import User
        v = db.session.query(User.learning_lang).filter(User.id == uid).scalar()
    except Exception:
        return None
    return normalize_lang(v, DEFAULT_LANG) if v is not None else None


def apply_user_dict_lang(user_id):
    """인증된 user_id 로 g.dict_lang 확정. 같은 요청에서 이미 확정했으면 재조회 안 함."""
    key = str(user_id)
    if g.get('_dict_lang_user') == key:
        return g.dict_lang
    lang = learning_lang_for_user(user_id)
    if lang is None:
        # 사용자 없음/조회 실패 — 비인증 규칙으로
        lang = resolve_request_lang()
    g.dict_lang = lang
    g._dict_lang_user = key
    return lang


def init_request_dict_lang():
    """before_request 훅. 유효한 Bearer 토큰이면 사용자 언어, 아니면 요청 파라미터."""
    g.dict_lang = resolve_request_lang()
    if request.method == 'OPTIONS' or 'Authorization' not in request.headers:
        return
    try:
        from app.utils.jwt_utils import optional_user_id
        uid = optional_user_id()
    except Exception:
        uid = None
    if uid:
        apply_user_dict_lang(uid)
